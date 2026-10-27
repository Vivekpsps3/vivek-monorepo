#!/usr/bin/env python3
"""Private, atomic online SQLite backups with integrity checks and bounded retention."""

import argparse
import fcntl
import hashlib
import json
import os
import re
import sqlite3
import tempfile
import time
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path

# Hourly snapshots use the site- prefix and SITE_BACKUP_KEEP (usually 1).
# Pre-migration snapshots use premigrate-<rev>- and are never pruned by that glob.
# Retention keeps the newest file of each of the last PREMIGRATE_KEEP revisions.
PREMIGRATE_KEEP = 3
_HOURLY_GLOB = "site-????????T??????-????????.db"
_PREMIGRATE_NAME = re.compile(r"^premigrate-[A-Za-z0-9_.-]+-\d{8}T\d{6}-[0-9a-f]{8}\.db$")
_SNAPSHOT_STAMP = re.compile(r"-(\d{8}T\d{6})-([0-9a-f]{8})\.db$")


def verify(path):
    with sqlite3.connect(path.resolve().as_uri() + "?mode=ro", uri=True) as db:
        if db.execute("PRAGMA integrity_check").fetchall() != [("ok",)]:
            raise RuntimeError("Backup integrity check failed")
        if db.execute("PRAGMA foreign_key_check").fetchall():
            raise RuntimeError("Backup foreign key check failed")
        version = db.execute("SELECT version FROM site_schema WHERE id=1").fetchone()
        if version != (1,):
            raise RuntimeError("Unsupported or missing site schema")
        tables = {r[0] for r in db.execute("SELECT name FROM sqlite_master WHERE type='table'")}
        if not {"users", "encrypted_records", "trips", "user_entries"} <= tables:
            raise RuntimeError("Backup is missing required domain tables")
    return {"schema": version[0], "sha256": hashlib.sha256(path.read_bytes()).hexdigest()}


def backup(source, directory, keep=1, *, kind="hourly", revision=None):
    if kind == "hourly":
        if keep < 1:
            raise ValueError("At least one verified backup must be retained")
        name_prefix = "site"
    elif kind == "premigrate":
        keep = max(int(keep), PREMIGRATE_KEEP)
        token = re.sub(r"[^A-Za-z0-9_.-]", "_", revision or "none") or "none"
        name_prefix = f"premigrate-{token}"
    else:
        raise ValueError("Unknown backup kind")
    directory.mkdir(parents=True, exist_ok=True, mode=0o700)
    # Lock the directory inode: scheduled and manual jobs share no extra state file.
    descriptor = os.open(directory, os.O_RDONLY | os.O_DIRECTORY)
    try:
        fcntl.flock(descriptor, fcntl.LOCK_EX)
        return _backup_locked(
            source, directory, keep, name_prefix=name_prefix, kind=kind, revision=revision
        )
    finally:
        os.close(descriptor)


def _snapshot_sort_key(path: Path) -> tuple[str, str]:
    """Newest first by the UTC timestamp in the filename, not by mtime.

    docker cp, a restore copy, or touch can reorder mtimes. Names that do not
    carry a timestamp sort first for deletion and fall back to mtime.
    """
    match = _SNAPSHOT_STAMP.search(path.name)
    if match:
        return (match.group(1), match.group(2))
    return ("", f"{path.stat().st_mtime_ns:020d}")


def _premigrate_revision(path: Path) -> str:
    match = _SNAPSHOT_STAMP.search(path.name)
    if match and path.name.startswith("premigrate-"):
        return path.name[len("premigrate-") : match.start()]
    return path.name


def _snapshot_paths(directory: Path, kind: str) -> list[Path]:
    if kind == "hourly":
        matches = directory.glob(_HOURLY_GLOB)
    else:
        matches = [
            path for path in directory.glob("premigrate-*.db") if _PREMIGRATE_NAME.match(path.name)
        ]
    return sorted(matches, key=_snapshot_sort_key, reverse=True)


def _prune_targets(snapshots: list[Path], keep: int, kind: str) -> list[Path]:
    """Return snapshots to delete. Premigrate keeps the newest file per revision."""
    if kind != "premigrate":
        return snapshots[keep:]
    seen: set[str] = set()
    keep_paths: set[Path] = set()
    for path in snapshots:
        revision = _premigrate_revision(path)
        if revision in seen:
            continue
        if len(seen) >= keep:
            continue
        seen.add(revision)
        keep_paths.add(path)
    return [path for path in snapshots if path not in keep_paths]


def _fresh_stamp(directory: Path, kind: str) -> str:
    """UTC timestamp that sorts ahead of every snapshot already in the directory.

    Two backups in the same second would otherwise tie, and a random id is not
    creation order. Advance one second past the newest filename so the file
    just written is the one retention keeps.
    """
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S")
    existing = _snapshot_paths(directory, kind)
    if not existing:
        return stamp
    newest = _snapshot_sort_key(existing[0])[0]
    if not newest or stamp > newest:
        return stamp
    advanced = datetime.strptime(newest, "%Y%m%dT%H%M%S").replace(tzinfo=timezone.utc) + timedelta(
        seconds=1
    )
    return advanced.strftime("%Y%m%dT%H%M%S")


def _backup_locked(source, directory, keep, *, name_prefix, kind, revision):
    if not source.is_file():
        raise RuntimeError("Source database missing; refusing to report backup success")
    directory.mkdir(parents=True, exist_ok=True, mode=0o700)
    os.chmod(directory, 0o700)
    stamp = _fresh_stamp(directory, kind)
    name = f"{name_prefix}-{stamp}-{uuid.uuid4().hex[:8]}.db"
    with tempfile.TemporaryDirectory(prefix=".backup-", dir=directory) as temporary:
        candidate = Path(temporary) / name
        with sqlite3.connect(source.resolve().as_uri() + "?mode=ro", uri=True, timeout=10) as src:
            with sqlite3.connect(candidate) as dest:
                deadline = time.monotonic() + 120

                def progress(_status, _remaining, _total):
                    if time.monotonic() > deadline:
                        raise TimeoutError("Backup exceeded its two-minute budget")

                src.backup(dest, pages=256, progress=progress, sleep=0.05)
        result = verify(candidate)
        # Restore rehearsal: open a separate copy and re-verify it.
        restored = Path(temporary) / "restore.db"
        with sqlite3.connect(candidate) as src, sqlite3.connect(restored) as dst:
            src.backup(dst)
        verify(restored)
        os.chmod(candidate, 0o600)
        final = directory / name
        os.link(candidate, final)
        manifest = final.with_suffix(".json")
        with manifest.open("x") as file:
            os.chmod(manifest, 0o600)
            payload = {
                **result,
                "created_at": datetime.now(timezone.utc).isoformat(),
                "restore_checked": True,
                "kind": kind,
            }
            if kind == "premigrate":
                payload["revision"] = revision or "none"
            json.dump(payload, file)
    # Publish and restore-check the replacement before deleting any older snapshot of this kind.
    snapshots = _snapshot_paths(directory, kind)
    for old in _prune_targets(snapshots, keep, kind):
        old.unlink()
        old.with_suffix(".json").unlink(missing_ok=True)
    print(json.dumps({"backup": str(final), "restore_checked": True, **result}))
    return final


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path)
    parser.add_argument("--directory", type=Path)
    parser.add_argument("--verify", type=Path)
    parser.add_argument("--keep", type=int, default=int(os.environ.get("SITE_BACKUP_KEEP", "1")))
    args = parser.parse_args()
    if args.verify:
        print(json.dumps(verify(args.verify)))
    elif args.source and args.directory:
        backup(args.source, args.directory, args.keep)
    else:
        parser.error("Provide --verify, or --source and --directory")


if __name__ == "__main__":
    main()
