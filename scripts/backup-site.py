#!/usr/bin/env python3
"""Private, atomic online SQLite backups with integrity checks and retention.

Hourly snapshots stay for SITE_BACKUP_KEEP_DAYS (default 30) and at least
SITE_BACKUP_KEEP verified copies (default 7). Pre-migration snapshots keep the
newest file of each of the last three revisions and are pruned separately.
An optional off-host adapter can dry-run or seal a snapshot for an
owner-supplied directory. It stays off unless SITE_BACKUP_OFFHOST says otherwise.
"""

import argparse
import fcntl
import hashlib
import json
import os
import re
import sqlite3
import stat
import sys
import tempfile
import time
import uuid
from collections.abc import Callable, Mapping
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Protocol

from cryptography.exceptions import InvalidTag
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

# Hourly site-* snapshots use an age window plus a minimum count.
# SITE_BACKUP_KEEP and SITE_BACKUP_KEEP_DAYS override the defaults.
# Pre-migration snapshots use premigrate-<rev>- and are never pruned by the hourly rule.
HOURLY_MINIMUM = 7
HOURLY_KEEP_DAYS = 30
PREMIGRATE_KEEP = 3
_HOURLY_GLOB = "site-????????T??????-????????.db"
_PREMIGRATE_NAME = re.compile(r"^premigrate-[A-Za-z0-9_.-]+-\d{8}T\d{6}-[0-9a-f]{8}\.db$")
_SNAPSHOT_STAMP = re.compile(r"-(\d{8}T\d{6})-([0-9a-f]{8})\.db$")


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


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


def _hourly_policy(keep: int | None, keep_days: int | None) -> tuple[int, int]:
    if keep is None:
        keep = int(os.environ.get("SITE_BACKUP_KEEP", str(HOURLY_MINIMUM)))
    if keep_days is None:
        keep_days = int(os.environ.get("SITE_BACKUP_KEEP_DAYS", str(HOURLY_KEEP_DAYS)))
    if keep < 1:
        raise ValueError("At least one verified backup must be retained")
    if keep_days < 0:
        raise ValueError("Retention age cannot be negative")
    return keep, keep_days


def backup(
    source,
    directory,
    keep=None,
    *,
    kind="hourly",
    revision=None,
    keep_days=None,
    offhost=None,
    transport=None,
    sleep=None,
):
    if kind == "hourly":
        keep, keep_days = _hourly_policy(keep, keep_days)
        name_prefix = "site"
    elif kind == "premigrate":
        # Hourly minimum and age do not apply. An explicit keep can only raise the floor.
        keep = PREMIGRATE_KEEP if keep is None else max(int(keep), PREMIGRATE_KEEP)
        keep_days = None
        token = re.sub(r"[^A-Za-z0-9_.-]", "_", revision or "none") or "none"
        name_prefix = f"premigrate-{token}"
    else:
        raise ValueError("Unknown backup kind")
    settings = load_offhost_settings() if offhost is None else offhost
    pause = time.sleep if sleep is None else sleep
    directory.mkdir(parents=True, exist_ok=True, mode=0o700)
    # Lock the directory inode: scheduled and manual jobs share no extra state file.
    descriptor = os.open(directory, os.O_RDONLY | os.O_DIRECTORY)
    try:
        fcntl.flock(descriptor, fcntl.LOCK_EX)
        return _backup_locked(
            source,
            directory,
            keep,
            name_prefix=name_prefix,
            kind=kind,
            revision=revision,
            keep_days=keep_days,
            offhost=settings,
            transport=transport,
            sleep=pause,
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


def _stamp(path: Path) -> datetime | None:
    match = _SNAPSHOT_STAMP.search(path.name)
    if not match:
        return None
    return datetime.strptime(match.group(1), "%Y%m%dT%H%M%S").replace(tzinfo=timezone.utc)


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


def _manifest_matches(path: Path) -> bool:
    """A copy counts as verified only when its manifest matches the bytes on disk."""
    manifest = path.with_suffix(".json")
    if not manifest.is_file():
        return False
    try:
        payload = json.loads(manifest.read_text(encoding="utf-8"))
    except (OSError, UnicodeError, json.JSONDecodeError):
        return False
    if not isinstance(payload, dict) or payload.get("restore_checked") is not True:
        return False
    digest = payload.get("sha256")
    if not isinstance(digest, str):
        return False
    return hashlib.sha256(path.read_bytes()).hexdigest() == digest


def _prune_targets(
    snapshots: list[Path],
    keep: int,
    kind: str,
    *,
    keep_days: int | None,
    now: datetime,
) -> list[Path]:
    """Return snapshots to delete.

    Hourly retention keeps the union of the age window and the minimum count.
    Only checksum-matched manifests fill that minimum, and unmatched files are
    left in place so a bad copy cannot evict a good one. Premigrate retention
    keeps the newest file of each of the newest revisions and ignores the
    hourly window.
    """
    if kind == "premigrate":
        seen: set[str] = set()
        keep_paths: set[Path] = set()
        for path in snapshots:
            revision = _premigrate_revision(path)
            if revision in seen or len(seen) >= keep:
                continue
            seen.add(revision)
            keep_paths.add(path)
        return [path for path in snapshots if path not in keep_paths]

    if keep_days is None:
        raise ValueError("Hourly retention requires an age window")
    verified = [path for path in snapshots if _manifest_matches(path)]
    kept: set[Path] = set()
    window = timedelta(days=keep_days)
    for index, path in enumerate(verified):
        stamp = _stamp(path)
        within_age = stamp is not None and now - stamp <= window
        if index < keep or within_age:
            kept.add(path)
    return [path for path in verified if path not in kept]


def _fresh_stamp(directory: Path, kind: str) -> str:
    """UTC timestamp that sorts ahead of every snapshot already in the directory.

    Two backups in the same second would otherwise tie, and a random id is not
    creation order. Advance one second past the newest filename so the file
    just written is the one retention keeps.
    """
    stamp = _utcnow().strftime("%Y%m%dT%H%M%S")
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


def _publish(candidate: Path, final: Path, payload: dict[str, object]) -> None:
    """Link the database and its manifest, or leave neither in the destination."""
    temporary_manifest = candidate.with_suffix(".json")
    temporary_manifest.write_text(json.dumps(payload), encoding="utf-8")
    os.chmod(candidate, 0o600)
    os.chmod(temporary_manifest, 0o600)
    os.link(candidate, final)
    try:
        os.link(temporary_manifest, final.with_suffix(".json"))
    except Exception:
        final.unlink(missing_ok=True)
        raise


def _backup_locked(
    source,
    directory,
    keep,
    *,
    name_prefix,
    kind,
    revision,
    keep_days,
    offhost,
    transport,
    sleep,
):
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
        final = directory / name
        payload: dict[str, object] = {
            "schema": result["schema"],
            "sha256": result["sha256"],
            "created_at": _utcnow().isoformat(),
            "restore_checked": True,
            "kind": kind,
        }
        if kind == "premigrate":
            payload["revision"] = revision or "none"
        _publish(candidate, final, payload)
    # Publish and restore-check the replacement before deleting any older snapshot of this kind.
    snapshots = _snapshot_paths(directory, kind)
    for old in _prune_targets(snapshots, keep, kind, keep_days=keep_days, now=_utcnow()):
        old.with_suffix(".json").unlink(missing_ok=True)
        old.unlink(missing_ok=True)
    try:
        receipt = deliver_offhost(final, payload, offhost, transport=transport, sleep=sleep)
    except OffhostError as error:
        payload["offhost"] = {
            "status": "failed",
            "reason": error.reason,
            "transferred": False,
            "attempts": error.attempts,
            "failed_at": _utcnow().isoformat(),
        }
        _replace_manifest(final, payload)
        raise
    if receipt["status"] != "off":
        payload["offhost"] = receipt
        _replace_manifest(final, payload)
    print(
        json.dumps(
            {
                "backup": str(final),
                "restore_checked": True,
                **result,
                "offhost": receipt["status"],
                "offhost_transferred": bool(receipt["transferred"]),
            }
        )
    )
    return final


_OFFHOST_REASONS = frozenset({"config", "authentication", "transfer", "corrupt"})
OFFHOST_ATTEMPTS = 3
OFFHOST_BACKOFF_SECONDS = (0.5, 1.0)
_OBJECT_NAME = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]{0,200}$")
_ENVELOPE = b"PSBK1"


class OffhostError(Exception):
    """Fixed reason code. The message never carries payload, paths, or key material."""

    def __init__(self, reason: str, attempts: int) -> None:
        clean = reason if reason in _OFFHOST_REASONS else "transfer"
        super().__init__(clean)
        self.reason = clean
        self.attempts = attempts


class OffhostSettings:
    def __init__(
        self, mode: str, destination: Path | None = None, key: bytes | None = None
    ) -> None:
        self.mode = mode
        self.destination = destination
        self.key = key

    def __repr__(self) -> str:
        return f"OffhostSettings(mode={self.mode!r})"


class OffhostStore(Protocol):
    def fetch(self, name: str) -> bytes | None: ...

    def stage(self, name: str, body: bytes) -> bytes: ...

    def commit(self, name: str) -> None: ...

    def discard_partial(self, name: str) -> None: ...


class FileTransport:
    """Owner-supplied directory. Objects are content-addressed and replace only after verify."""

    def __init__(self, directory: Path) -> None:
        self.directory = directory

    def _path(self, name: str, suffix: str = "") -> Path:
        if _OBJECT_NAME.fullmatch(name) is None:
            raise OffhostError("config", 0)
        return self.directory / f"{name}{suffix}"

    def fetch(self, name: str) -> bytes | None:
        path = self._path(name)
        if not path.is_file():
            return None
        return path.read_bytes()

    def stage(self, name: str, body: bytes) -> bytes:
        partial = self._path(name, ".partial")
        try:
            partial.write_bytes(body)
            os.chmod(partial, 0o600)
            return partial.read_bytes()
        except OSError:
            partial.unlink(missing_ok=True)
            raise

    def commit(self, name: str) -> None:
        os.replace(self._path(name, ".partial"), self._path(name))
        os.chmod(self._path(name), 0o600)

    def discard_partial(self, name: str) -> None:
        self._path(name, ".partial").unlink(missing_ok=True)


def load_offhost_settings(env: Mapping[str, str] | None = None) -> OffhostSettings:
    source = os.environ if env is None else env
    mode = source.get("SITE_BACKUP_OFFHOST", "off").strip().lower()
    if mode in {"", "off"}:
        return OffhostSettings("off")
    if mode == "dry-run":
        return OffhostSettings("dry-run")
    if mode != "file":
        raise OffhostError("config", 0)
    directory = source.get("SITE_BACKUP_OFFHOST_DIR", "").strip()
    key_file = source.get("SITE_BACKUP_OFFHOST_KEY_FILE", "").strip()
    if directory == "" or key_file == "":
        raise OffhostError("config", 0)
    destination = Path(directory)
    if not destination.is_dir():
        raise OffhostError("config", 0)
    return OffhostSettings("file", destination, _read_offhost_key(Path(key_file)))


def _read_offhost_key(path: Path) -> bytes:
    try:
        mode = path.stat().st_mode
        key = path.read_bytes()
    except OSError:
        raise OffhostError("config", 0) from None
    if not stat.S_ISREG(mode) or mode & 0o077:
        raise OffhostError("config", 0)
    if len(key) != 32:
        raise OffhostError("config", 0)
    return key


def _canonical_header(header: Mapping[str, object]) -> bytes:
    return json.dumps(header, separators=(",", ":"), sort_keys=True).encode("utf-8")


def seal(plaintext: bytes, key: bytes, header: Mapping[str, object]) -> bytes:
    if len(key) != 32:
        raise OffhostError("config", 0)
    prefix = _canonical_header(header)
    nonce = os.urandom(12)
    body = AESGCM(key).encrypt(nonce, plaintext, prefix)
    return _ENVELOPE + len(prefix).to_bytes(4, "big") + prefix + nonce + body


def open_sealed(blob: bytes, key: bytes) -> tuple[bytes, dict[str, object]]:
    if len(key) != 32 or not blob.startswith(_ENVELOPE) or len(blob) < len(_ENVELOPE) + 4:
        raise OffhostError("authentication", 0)
    rest = blob[len(_ENVELOPE) :]
    length = int.from_bytes(rest[:4], "big")
    rest = rest[4:]
    if length < 2 or len(rest) < length + 12 + 16:
        raise OffhostError("authentication", 0)
    prefix = rest[:length]
    nonce = rest[length : length + 12]
    body = rest[length + 12 :]
    try:
        plaintext = AESGCM(key).decrypt(nonce, body, prefix)
        parsed = json.loads(prefix.decode("utf-8"))
    except (InvalidTag, UnicodeError, json.JSONDecodeError, ValueError):
        raise OffhostError("authentication", 0) from None
    if not isinstance(parsed, dict):
        raise OffhostError("authentication", 0)
    typed = {str(key_name): value for key_name, value in parsed.items()}
    if typed.get("bytes") != len(plaintext):
        raise OffhostError("corrupt", 0)
    digest = typed.get("sha256")
    if not isinstance(digest, str) or hashlib.sha256(plaintext).hexdigest() != digest:
        raise OffhostError("corrupt", 0)
    return plaintext, typed


def _object_header(manifest: Mapping[str, object], size: int) -> dict[str, object]:
    sha = manifest.get("sha256")
    kind = manifest.get("kind")
    schema = manifest.get("schema")
    created = manifest.get("created_at")
    if (
        not isinstance(sha, str)
        or not isinstance(kind, str)
        or not isinstance(schema, int)
        or not isinstance(created, str)
    ):
        raise OffhostError("config", 0)
    return {
        "bytes": size,
        "created_at": created,
        "kind": kind,
        "schema": schema,
        "sha256": sha,
        "v": 1,
    }


def _classify(blob: bytes, key: bytes, plaintext: bytes, header: Mapping[str, object]) -> str:
    try:
        opened, meta = open_sealed(blob, key)
    except OffhostError as error:
        return error.reason
    if opened != plaintext or meta != header:
        return "corrupt"
    return "ok"


def _fetch_existing(store: OffhostStore, name: str) -> bytes | None:
    try:
        return store.fetch(name)
    except (OSError, OffhostError):
        return None


def _discard_partial(store: OffhostStore, name: str) -> None:
    try:
        store.discard_partial(name)
    except OSError:
        return


def _verified_receipt(name: str, sealed: bytes, *, attempts: int, sent: int) -> dict[str, object]:
    return {
        "status": "verified",
        "transferred": True,
        "attempts": attempts,
        "object": name,
        "ciphertext_sha256": hashlib.sha256(sealed).hexdigest(),
        "verified_at": _utcnow().isoformat(),
        "bytes_sent": sent,
    }


def deliver_offhost(
    snapshot: Path,
    manifest: Mapping[str, object],
    settings: OffhostSettings,
    transport: OffhostStore | None = None,
    sleep: Callable[[float], None] = time.sleep,
) -> dict[str, object]:
    """Seal and store one verified snapshot. Dry-run and off send nothing."""
    if settings.mode == "off":
        return {"status": "off", "transferred": False, "attempts": 0, "bytes_sent": 0}
    if settings.mode == "dry-run":
        return {"status": "dry-run", "transferred": False, "attempts": 0, "bytes_sent": 0}
    if settings.mode != "file":
        raise OffhostError("config", 0)
    store = transport
    if store is None:
        if settings.destination is None:
            raise OffhostError("config", 0)
        store = FileTransport(settings.destination)
    key = settings.key
    if key is None or len(key) != 32:
        raise OffhostError("config", 0)
    plaintext = snapshot.read_bytes()
    header = _object_header(manifest, len(plaintext))
    if hashlib.sha256(plaintext).hexdigest() != header["sha256"]:
        raise OffhostError("corrupt", 0)
    kind = header["kind"]
    digest = header["sha256"]
    if not isinstance(kind, str) or not isinstance(digest, str):
        raise OffhostError("config", 0)
    name = f"{kind}-{digest}.psbk"
    if _OBJECT_NAME.fullmatch(name) is None:
        raise OffhostError("config", 0)
    existing = _fetch_existing(store, name)
    if existing is not None and _classify(existing, key, plaintext, header) == "ok":
        return _verified_receipt(name, existing, attempts=0, sent=0)
    sealed = seal(plaintext, key, header)
    reason = "transfer"
    for attempt in range(1, OFFHOST_ATTEMPTS + 1):
        try:
            staged = store.stage(name, sealed)
            outcome = "corrupt" if staged != sealed else _classify(staged, key, plaintext, header)
            if outcome != "ok":
                raise OffhostError(outcome, attempt)
            store.commit(name)
            stored = _fetch_existing(store, name)
            if stored != sealed:
                raise OffhostError("corrupt", attempt)
            return _verified_receipt(name, sealed, attempts=attempt, sent=len(sealed))
        except OffhostError as error:
            _discard_partial(store, name)
            reason = error.reason
        except OSError:
            _discard_partial(store, name)
            reason = "transfer"
        if attempt == OFFHOST_ATTEMPTS:
            raise OffhostError(reason, attempt) from None
        sleep(OFFHOST_BACKOFF_SECONDS[attempt - 1])
    raise OffhostError(reason, OFFHOST_ATTEMPTS)


def _replace_manifest(database: Path, payload: dict[str, object]) -> None:
    target = database.with_suffix(".json")
    temporary = target.with_suffix(".json.tmp")
    temporary.write_text(json.dumps(payload), encoding="utf-8")
    os.chmod(temporary, 0o600)
    os.replace(temporary, target)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path)
    parser.add_argument("--directory", type=Path)
    parser.add_argument("--verify", type=Path)
    parser.add_argument("--keep", type=int, default=None)
    parser.add_argument("--keep-days", type=int, default=None)
    args = parser.parse_args()
    try:
        if args.verify:
            print(json.dumps(verify(args.verify)))
        elif args.source and args.directory:
            backup(args.source, args.directory, args.keep, keep_days=args.keep_days)
        else:
            parser.error("Provide --verify, or --source and --directory")
    except OffhostError as error:
        print(
            json.dumps(
                {"event": "offhost_failed", "reason": error.reason, "attempts": error.attempts}
            ),
            file=sys.stderr,
        )
        raise SystemExit(1) from None


if __name__ == "__main__":
    main()
