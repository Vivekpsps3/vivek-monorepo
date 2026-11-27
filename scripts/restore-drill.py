#!/usr/bin/env python3
"""Restore one verified snapshot into a new empty directory and measure it.

The drill is synthetic. It does not replace a live database, write a backup
directory, or send a snapshot off-host. Production recovery is not claimed.
"""

from __future__ import annotations

import argparse
import hashlib
import importlib.util
import json
import os
import re
import shutil
import sqlite3
import sys
import tempfile
import time
import uuid
from collections.abc import Callable
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

LOCAL_RPO_SECONDS = 60 * 60
OFFHOST_RPO_SECONDS = 24 * 60 * 60
RESTORE_RTO_SECONDS = 4 * 60 * 60
MARKER_NAME = ".restore-drill-owned"
RESTORED_NAME = "restored.db"
_DRILL_NAME = re.compile(r"restore-drill-[A-Za-z0-9._-]{1,80}")
_TABLE_NAME = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*$")
_VOLUME_PARTS = frozenset({"personal-site", "personal-site_data", "personal-site_backups"})
_REASONS = frozenset(
    {
        "production-target",
        "nonempty",
        "target",
        "checksum",
        "unsupported",
        "corrupt",
        "wrong-version",
        "authentication",
        "ownership",
        "preservation",
        "interrupted",
        "not-owned",
        "config",
    }
)
# Owner tables plus the identity and finance rows the drill has to count.
# A new owner table is reported under "other" until this map is updated.
DOMAIN_TABLES = {
    "identity": ("users",),
    "finance": ("encrypted_records", "user_vaults", "encrypted_record_indexes"),
    "travel": ("trips", "trip_drafts", "pto_policy", "leave_policies", "pto_entries"),
    "media": (
        "user_entries",
        "experiences",
        "season_progress",
        "episode_progress",
        "album_ratings",
        "track_ratings",
    ),
    "town": (
        "habits",
        "habit_checkins",
        "habit_cadences",
        "town_stamp_wallets",
        "town_stamp_receipts",
        "town_stamp_entitlements",
        "town_room_layouts",
        "town_quest_journals",
        "town_quest_steps",
        "town_dialogue_journals",
        "town_dialogue_completions",
        "town_discovery_journals",
        "town_discovery_stamps",
    ),
    "world": ("world_concepts",),
}
_NOTE = "Synthetic measurement only. This does not establish production recovery."
_TOOLS: Any = None


class DrillRefused(Exception):
    """Fixed reason code. The message is that code and nothing else."""

    def __init__(self, reason: str) -> None:
        clean = reason if reason in _REASONS else "unsupported"
        super().__init__(clean)
        self.reason = clean


def production_like(path: Path) -> bool:
    """True for live data, backup volumes, Docker volumes, and /data."""
    resolved = path.resolve()
    if _VOLUME_PARTS.intersection(resolved.parts):
        return True
    text = resolved.as_posix()
    if text == "/data" or text.startswith("/data/"):
        return True
    if text == "/var/lib/docker/volumes" or text.startswith("/var/lib/docker/volumes/"):
        return True
    return resolved.name == "site.db" and ".local" in resolved.parts and "data" in resolved.parts


def compare_objectives(window_seconds: float, duration_seconds: float) -> dict[str, object]:
    """Compare a synthetic window and duration with the three objectives.

    A within-objective result is still not a production recovery claim.
    """

    def judge(actual: float, limit: int) -> str:
        return "within_objective" if actual <= limit else "outside_objective"

    return {
        "local_rpo": judge(window_seconds, LOCAL_RPO_SECONDS),
        "offhost_rpo": judge(window_seconds, OFFHOST_RPO_SECONDS),
        "restore_rto": judge(duration_seconds, RESTORE_RTO_SECONDS),
        "production_rpo_established": False,
        "production_rto_established": False,
    }


def cleanup(path: Path) -> dict[str, object]:
    """Remove one drill directory. Any other path is left in place."""
    if path.is_symlink():
        raise DrillRefused("not-owned")
    resolved = path.resolve()
    if production_like(resolved):
        raise DrillRefused("production-target")
    if not resolved.exists():
        return {"event": "restore_drill_cleanup", "removed": False, "reason": "absent"}
    if _holds_snapshots(resolved) or (resolved / "site.db").exists():
        raise DrillRefused("production-target")
    if not resolved.is_dir() or _DRILL_NAME.fullmatch(resolved.name) is None:
        raise DrillRefused("not-owned")
    marker = resolved / MARKER_NAME
    try:
        marker_text = marker.read_text(encoding="utf-8")
    except (OSError, UnicodeError):
        raise DrillRefused("not-owned") from None
    if marker_text != resolved.name:
        raise DrillRefused("not-owned")
    shutil.rmtree(resolved)
    return {"event": "restore_drill_cleanup", "removed": True}


def drill(
    source: Path,
    *,
    destination: Path | None = None,
    parent: Path | None = None,
    key_file: Path | None = None,
    sealed: bool = False,
    interrupt: Callable[[], None] | None = None,
) -> dict[str, object]:
    """Restore ``source`` into a new empty directory and return the report.

    ``interrupt`` is a test hook. The command-line entry point does not set it.
    """
    if sealed:
        if key_file is None:
            raise DrillRefused("config")
        plaintext, created_at, authenticated = _open_sealed(source, key_file)
    else:
        if key_file is not None:
            raise DrillRefused("target")
        _refuse_live_source(source)
        created_at, plaintext = _read_verified_snapshot(source)
        authenticated = False
    destination_path = _resolve_destination(destination, parent, source)
    started = datetime.now(UTC)
    monotonic = time.monotonic()
    created: Path | None = None
    success = False
    try:
        with tempfile.TemporaryDirectory(prefix="restore-drill-src-") as temporary:
            staging = Path(temporary)
            if production_like(staging):
                raise DrillRefused("production-target")
            staged = staging / "snapshot.db"
            staged.write_bytes(plaintext)
            os.chmod(staged, 0o600)
            source_info = _check_database(staged)
            _create_destination(destination_path)
            created = destination_path
            restored = destination_path / RESTORED_NAME
            restored.write_bytes(plaintext)
            os.chmod(restored, 0o600)
            restored_info = _check_database(restored)
            if restored_info != source_info:
                raise DrillRefused("preservation")
            if interrupt is not None:
                try:
                    interrupt()
                except DrillRefused:
                    raise
                except Exception:
                    raise DrillRefused("interrupted") from None
        duration = time.monotonic() - monotonic
        window = max(0.0, (started - created_at).total_seconds())
        report = _report(
            source_info,
            destination_path,
            duration=duration,
            window=window,
            authenticated=authenticated,
            digest=hashlib.sha256(plaintext).hexdigest(),
        )
        success = True
        return report
    finally:
        if created is not None and not success:
            cleanup(created)


def _tools() -> Any:
    global _TOOLS
    if _TOOLS is None:
        path = Path(__file__).resolve().with_name("backup-site.py")
        spec = importlib.util.spec_from_file_location("site_backup_for_drill", path)
        if spec is None or spec.loader is None:
            raise DrillRefused("unsupported")
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        _TOOLS = module
    return _TOOLS


def _repo_root() -> Path:
    return Path(__file__).resolve().parents[1]


def _ensure_repo_path() -> None:
    root = str(_repo_root())
    if root not in sys.path:
        sys.path.insert(0, root)


def _revisions(database: Path) -> tuple[str | None, str]:
    _ensure_repo_path()
    from apps.server.migrations import current_revision, head_revision

    return current_revision(database), head_revision()


def _refuse_live_source(path: Path) -> None:
    if path.is_symlink():
        raise DrillRefused("production-target")
    resolved = path.resolve()
    if resolved.name == "site.db" or production_like(resolved):
        raise DrillRefused("production-target")
    if not resolved.is_file():
        raise DrillRefused("unsupported")


def _read_verified_snapshot(path: Path) -> tuple[datetime, bytes]:
    manifest_path = path.with_suffix(".json")
    if manifest_path.is_symlink() or path.is_symlink():
        raise DrillRefused("production-target")
    try:
        payload = json.loads(manifest_path.read_text(encoding="utf-8"))
    except (OSError, UnicodeError, json.JSONDecodeError):
        raise DrillRefused("unsupported") from None
    if not isinstance(payload, dict) or payload.get("restore_checked") is not True:
        raise DrillRefused("unsupported")
    digest = payload.get("sha256")
    created = payload.get("created_at")
    if not isinstance(digest, str) or not isinstance(created, str):
        raise DrillRefused("unsupported")
    plaintext = path.read_bytes()
    if hashlib.sha256(plaintext).hexdigest() != digest:
        raise DrillRefused("checksum")
    return _parse_time(created), plaintext


def _open_sealed(path: Path, key_file: Path) -> tuple[bytes, datetime, bool]:
    if key_file.is_symlink():
        raise DrillRefused("production-target")
    _refuse_live_source(path)
    tools = _tools()
    try:
        key = tools._read_offhost_key(key_file)
        plaintext, header = tools.open_sealed(path.read_bytes(), key)
    except tools.OffhostError as error:
        reason = (
            error.reason
            if error.reason in {"authentication", "corrupt", "config"}
            else "unsupported"
        )
        raise DrillRefused(reason) from None
    if not isinstance(header, dict):
        raise DrillRefused("unsupported")
    created = header.get("created_at")
    schema = header.get("schema")
    if schema != 1 or not isinstance(created, str):
        raise DrillRefused("unsupported")
    return plaintext, _parse_time(created), True


def _parse_time(value: str) -> datetime:
    try:
        parsed = datetime.fromisoformat(value)
    except ValueError:
        raise DrillRefused("unsupported") from None
    if parsed.tzinfo is None:
        return parsed.replace(tzinfo=UTC)
    return parsed


def _resolve_destination(destination: Path | None, parent: Path | None, source: Path) -> Path:
    if (destination is None) == (parent is None):
        raise DrillRefused("target")
    if destination is None:
        if parent is None or parent.is_symlink() or not parent.is_dir():
            raise DrillRefused("target")
        if production_like(parent) or _holds_snapshots(parent):
            raise DrillRefused("production-target")
        stamp = datetime.now(UTC).strftime("%Y%m%dT%H%M%S")
        destination = parent / f"restore-drill-{stamp}-{uuid.uuid4().hex[:8]}"
    if destination.is_symlink():
        raise DrillRefused("target")
    resolved = destination.resolve()
    if _DRILL_NAME.fullmatch(resolved.name) is None:
        raise DrillRefused("target")
    if production_like(resolved) or production_like(resolved.parent):
        raise DrillRefused("production-target")
    if _holds_snapshots(resolved.parent):
        raise DrillRefused("production-target")
    source_resolved = source.resolve()
    source_parent = source_resolved.parent
    blocked = source_parent in resolved.parents or source_resolved in resolved.parents
    if resolved in {source_parent, source_resolved} or blocked:
        raise DrillRefused("production-target")
    if resolved.exists():
        if resolved.is_dir() and any(resolved.iterdir()):
            raise DrillRefused("nonempty")
        raise DrillRefused("target")
    if not resolved.parent.is_dir():
        raise DrillRefused("target")
    return resolved


def _create_destination(path: Path) -> None:
    try:
        path.mkdir(mode=0o700)
    except FileExistsError:
        raise DrillRefused("nonempty") from None
    os.chmod(path, 0o700)
    marker = path / MARKER_NAME
    marker.write_text(path.name, encoding="utf-8")
    os.chmod(marker, 0o600)


def _holds_snapshots(path: Path) -> bool:
    if path.is_symlink() or not path.is_dir():
        return False
    tools = _tools()
    if any(path.glob(tools._HOURLY_GLOB)):
        return True
    return any(tools._PREMIGRATE_NAME.match(child.name) for child in path.glob("premigrate-*.db"))


def _check_database(path: Path) -> dict[str, Any]:
    tools = _tools()
    try:
        tools.verify(path)
    except sqlite3.DatabaseError:
        raise DrillRefused("corrupt") from None
    except RuntimeError as error:
        text = str(error)
        if "Unsupported" in text or "missing" in text:
            raise DrillRefused("unsupported") from None
        raise DrillRefused("corrupt") from None
    info = _inspect(path)
    found, expected = _revisions(path)
    if found is None:
        raise DrillRefused("unsupported")
    if found != expected:
        raise DrillRefused("wrong-version")
    if int(info["owner_orphans"]) != 0:
        raise DrillRefused("ownership")
    info["schema_head"] = expected
    return info


def _inspect(path: Path) -> dict[str, Any]:
    _ensure_repo_path()
    from apps.server.schema import OWNER_TABLES

    known = [table for tables in DOMAIN_TABLES.values() for table in tables]
    extra = sorted(set(OWNER_TABLES) - set(known))
    uri = path.resolve().as_uri() + "?mode=ro"
    with sqlite3.connect(uri, uri=True) as connection:
        present = {
            row[0]
            for row in connection.execute(
                "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"
            )
        }
        owners: dict[str, int] = {}
        for table in [*known, *extra]:
            if table not in present:
                raise DrillRefused("unsupported")
            owners[table] = _count(connection, table)
        orphans = 0
        for table in [*sorted(OWNER_TABLES), *DOMAIN_TABLES["finance"]]:
            if table == "users":
                continue
            orphans += _count_orphans(connection, table)
        ciphertext = _ciphertext(connection)
    domains: dict[str, dict[str, int]] = {}
    for domain, tables in DOMAIN_TABLES.items():
        domains[domain] = {table: owners[table] for table in tables}
    if extra:
        domains["other"] = {table: owners[table] for table in extra}
    return {
        "owners": owners,
        "owner_orphans": orphans,
        "domains": domains,
        "ciphertext": ciphertext,
    }


def _count(connection: sqlite3.Connection, table: str) -> int:
    if _TABLE_NAME.fullmatch(table) is None:
        raise DrillRefused("unsupported")
    row = connection.execute(f'SELECT COUNT(*) FROM "{table}"').fetchone()
    if row is None:
        raise DrillRefused("corrupt")
    return int(row[0])


def _count_orphans(connection: sqlite3.Connection, table: str) -> int:
    if _TABLE_NAME.fullmatch(table) is None:
        raise DrillRefused("unsupported")
    row = connection.execute(
        f'SELECT COUNT(*) FROM "{table}" WHERE user_id NOT IN (SELECT id FROM users)'
    ).fetchone()
    if row is None:
        raise DrillRefused("corrupt")
    return int(row[0])


def _ciphertext(connection: sqlite3.Connection) -> dict[str, Any]:
    rows = connection.execute(
        """
        SELECT user_id, collection, client_id, ciphertext_b64
        FROM encrypted_records
        ORDER BY user_id, collection, client_id
        """
    ).fetchall()
    lines: list[str] = []
    collections: dict[str, int] = {}
    for user_id, collection, client_id, ciphertext in rows:
        if not isinstance(ciphertext, str) or ciphertext.strip() == "":
            raise DrillRefused("corrupt")
        collections[str(collection)] = collections.get(str(collection), 0) + 1
        digest = hashlib.sha256(ciphertext.encode("utf-8")).hexdigest()
        lines.append(f"{user_id}\t{collection}\t{client_id}\t{digest}")
    indexes = connection.execute(
        """
        SELECT user_id, collection, client_id, index_name, index_value_b64
        FROM encrypted_record_indexes
        ORDER BY user_id, collection, client_id, index_name
        """
    ).fetchall()
    index_lines: list[str] = []
    for user_id, collection, client_id, index_name, value in indexes:
        if not isinstance(value, str) or value.strip() == "":
            raise DrillRefused("corrupt")
        digest = hashlib.sha256(value.encode("utf-8")).hexdigest()
        index_lines.append(f"{user_id}\t{collection}\t{client_id}\t{index_name}\t{digest}")
    return {
        "records": len(rows),
        "nonempty": len(rows),
        "collections": dict(sorted(collections.items())),
        "digest": hashlib.sha256("\n".join(lines).encode("utf-8")).hexdigest(),
        "index_digest": hashlib.sha256("\n".join(index_lines).encode("utf-8")).hexdigest(),
    }


def _report(
    info: dict[str, Any],
    destination: Path,
    *,
    duration: float,
    window: float,
    authenticated: bool,
    digest: str,
) -> dict[str, object]:
    duration_seconds = round(duration, 6)
    window_seconds = round(window, 3)
    return {
        "event": "restore_drill",
        "synthetic": True,
        "production_restore": False,
        "production_rpo_established": False,
        "production_rto_established": False,
        "offhost_activated": False,
        "note": _NOTE,
        "checksum_ok": True,
        "authenticated_decryption": authenticated,
        "integrity": "ok",
        "foreign_keys": "ok",
        "schema_version": 1,
        "schema_head": info["schema_head"],
        "schema_head_ok": True,
        "owners": info["owners"],
        "owner_orphans": info["owner_orphans"],
        "domains": info["domains"],
        "ciphertext": info["ciphertext"],
        "duration_seconds": duration_seconds,
        "data_loss_window_seconds": window_seconds,
        "objectives": {
            "local_rpo_seconds": LOCAL_RPO_SECONDS,
            "offhost_rpo_seconds": OFFHOST_RPO_SECONDS,
            "restore_rto_seconds": RESTORE_RTO_SECONDS,
        },
        "comparison": compare_objectives(window_seconds, duration_seconds),
        "sha256": digest,
        "destination": str(destination),
    }


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--backup", type=Path)
    parser.add_argument("--sealed", type=Path)
    parser.add_argument("--key-file", type=Path)
    parser.add_argument("--parent", type=Path)
    parser.add_argument("--destination", type=Path)
    parser.add_argument("--cleanup", type=Path)
    args = parser.parse_args(argv)
    try:
        if args.cleanup is not None:
            if any(
                value is not None
                for value in (
                    args.backup,
                    args.sealed,
                    args.key_file,
                    args.parent,
                    args.destination,
                )
            ):
                parser.error("--cleanup is the only argument")
            report: dict[str, object] = cleanup(args.cleanup)
        else:
            if (args.backup is None) == (args.sealed is None):
                parser.error("Provide exactly one of --backup or --sealed")
            if args.sealed is not None and args.key_file is None:
                parser.error("--sealed requires --key-file")
            if args.backup is not None and args.key_file is not None:
                parser.error("--key-file is only used with --sealed")
            if (args.parent is None) == (args.destination is None):
                parser.error("Provide exactly one of --parent or --destination")
            source = args.sealed if args.sealed is not None else args.backup
            if source is None:
                parser.error("Provide exactly one of --backup or --sealed")
            report = drill(
                source,
                destination=args.destination,
                parent=args.parent,
                key_file=args.key_file,
                sealed=args.sealed is not None,
            )
    except DrillRefused as error:
        print(
            json.dumps({"event": "restore_drill_refused", "reason": error.reason}, sort_keys=True),
            file=sys.stderr,
        )
        raise SystemExit(1) from None
    print(json.dumps(report, sort_keys=True))


if __name__ == "__main__":
    main()
