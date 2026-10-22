#!/usr/bin/env python3
"""Private, atomic online SQLite backups with integrity checks and bounded retention."""

import argparse
import fcntl
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import sqlite3
import tempfile
import time
import uuid


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


def backup(source, directory, keep=1):
    if keep < 1:
        raise ValueError("At least one verified backup must be retained")
    directory.mkdir(parents=True, exist_ok=True, mode=0o700)
    # Lock the directory inode: scheduled and manual jobs share no extra state file.
    descriptor = os.open(directory, os.O_RDONLY | os.O_DIRECTORY)
    try:
        fcntl.flock(descriptor, fcntl.LOCK_EX)
        return _backup_locked(source, directory, keep)
    finally:
        os.close(descriptor)


def _backup_locked(source, directory, keep):
    if not source.is_file():
        raise RuntimeError("Source database missing; refusing to report backup success")
    directory.mkdir(parents=True, exist_ok=True, mode=0o700)
    os.chmod(directory, 0o700)
    name = (
        datetime.now(timezone.utc).strftime("site-%Y%m%dT%H%M%S")
        + "-"
        + uuid.uuid4().hex[:8]
        + ".db"
    )
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
            json.dump(
                {
                    **result,
                    "created_at": datetime.now(timezone.utc).isoformat(),
                    "restore_checked": True,
                },
                file,
            )
    # Publish and restore-check the replacement before deleting any older snapshot.
    snapshots = sorted(
        directory.glob("site-????????T??????-????????.db"),
        key=lambda p: p.stat().st_mtime_ns,
        reverse=True,
    )
    for old in snapshots[keep:]:
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
