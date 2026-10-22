"""Create a new unified database from offline legacy snapshots, never in place.

Usage: python -m apps.server.migrate --output /absolute/site.db [--source-dir /snapshots]
Stop legacy writers before taking the final snapshots. Rehearsals may use live read-only backups.
"""

import argparse
from collections import Counter
import hashlib
import json
import os
from pathlib import Path
import sqlite3
import tempfile

from apps.server.migrations import adopt_or_upgrade, sqlite_url
from apps.server.schema import VERSION, metadata

FINANCE_REVISION = "e0f6a2b3c4d5"


def quote(name):
    return '"' + name.replace('"', '""') + '"'


def digest_rows(connection, table, columns):
    # Count duplicate rows too; report only digests and row counts, never user data.
    rows = connection.execute(f"SELECT {','.join(map(quote, columns))} FROM {quote(table)}")
    counts = Counter(hashlib.sha256(repr(tuple(row)).encode()).hexdigest() for row in rows)
    return hashlib.sha256(json.dumps(sorted(counts.items())).encode()).hexdigest(), sum(
        counts.values()
    )


def check_integrity(connection):
    if connection.execute("PRAGMA integrity_check").fetchall() != [("ok",)]:
        raise RuntimeError("SQLite integrity check failed")
    if connection.execute("PRAGMA foreign_key_check").fetchall():
        raise RuntimeError("Foreign key validation failed")
    # Personal child rows must agree with their owning entry, beyond individual FKs.
    for table in ("experiences", "season_progress", "album_ratings", "track_ratings"):
        if connection.execute(
            f"SELECT 1 FROM {table} c JOIN user_entries e ON e.id=c.entry_id WHERE c.user_id != e.user_id LIMIT 1"
        ).fetchone():
            raise RuntimeError(f"Ownership mismatch in {table}")
    for (key,) in connection.execute("SELECT key FROM settings"):
        if key.startswith("user:"):
            try:
                owner = int(key.split(":", 2)[1])
            except (ValueError, IndexError):
                raise RuntimeError("Invalid settings owner") from None
            if not connection.execute("SELECT 1 FROM users WHERE id=?", (owner,)).fetchone():
                raise RuntimeError("Orphaned settings owner")


def migrate(output: Path, source_dir: Path | None = None):
    output = output.resolve()
    if output.exists():
        raise RuntimeError("Destination exists; refusing to overwrite any database")
    output.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    report = {"schema": VERSION, "tables": {}, "sources": {}}
    with tempfile.TemporaryDirectory(prefix="site-migration-", dir=output.parent) as temporary:
        target = Path(temporary) / "site.db"
        schema = metadata()
        adopt_or_upgrade(sqlite_url(target))
        connection = sqlite3.connect(target)
        try:
            connection.execute("PRAGMA foreign_keys=OFF")
            connection.execute("BEGIN IMMEDIATE")
            if connection.execute("SELECT version FROM site_schema WHERE id=1").fetchone() != (
                VERSION,
            ):
                raise RuntimeError("Baseline site schema version is missing")
            if connection.execute("SELECT version_num FROM alembic_version").fetchone() != (
                FINANCE_REVISION,
            ):
                raise RuntimeError("Baseline Finance revision marker is missing")
            if source_dir:
                for domain, filename in (
                    ("finance", "finance.db"),
                    ("travel", "travel.db"),
                    ("media", "media.db"),
                ):
                    source_path = source_dir.resolve() / filename
                    if not source_path.is_file():
                        raise RuntimeError(f"Required source missing: {filename}")
                    snapshot_path = Path(temporary) / filename
                    with sqlite3.connect(source_path.as_uri() + "?mode=ro", uri=True) as live:
                        with sqlite3.connect(snapshot_path) as snapshot:
                            live.backup(snapshot)
                    with sqlite3.connect(snapshot_path) as source:
                        if source.execute("PRAGMA integrity_check").fetchall() != [("ok",)]:
                            raise RuntimeError(f"Source integrity check failed: {filename}")
                        from importlib import import_module

                        domain_tables = set(
                            import_module(f"apps.{domain}.backend.models").Base.metadata.tables
                        )
                        actual = {
                            row[0]
                            for row in source.execute(
                                "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"
                            )
                        }
                        missing = domain_tables - actual
                        if missing:
                            raise RuntimeError(
                                f"Missing source tables in {domain}: {sorted(missing)}"
                            )
                        if domain == "finance":
                            revision = source.execute(
                                "SELECT version_num FROM alembic_version"
                            ).fetchone()
                            if revision != (FINANCE_REVISION,):
                                raise RuntimeError(
                                    "Upgrade Finance using its existing migration path before consolidation"
                                )
                        for table in actual - domain_tables - {"alembic_version"}:
                            if source.execute(f"SELECT 1 FROM {quote(table)} LIMIT 1").fetchone():
                                raise RuntimeError(
                                    f"Unrecognized nonempty source table: {domain}.{table}"
                                )
                        for table in sorted(domain_tables):
                            columns = [
                                row[1]
                                for row in source.execute(f"PRAGMA table_info({quote(table)})")
                            ]
                            expected = {column.name for column in schema.tables[table].columns}
                            if set(columns) != expected:
                                raise RuntimeError(
                                    f"Schema mismatch: {domain}.{table}; migrate source before consolidation"
                                )
                            names = ",".join(map(quote, columns))
                            rows = source.execute(f"SELECT {names} FROM {quote(table)}")
                            connection.executemany(
                                f"INSERT INTO {quote(table)} ({names}) VALUES ({','.join('?' for _ in columns)})",
                                rows,
                            )
                            before = digest_rows(source, table, columns)
                            after = digest_rows(connection, table, columns)
                            if before != after:
                                raise RuntimeError(f"Copy verification failed: {table}")
                            report["tables"][table] = {"rows": before[1], "sha256": before[0]}
                        report["sources"][domain] = hashlib.sha256(
                            snapshot_path.read_bytes()
                        ).hexdigest()
            check_integrity(connection)
            connection.commit()
            connection.execute("PRAGMA foreign_keys=ON")
            if connection.execute("PRAGMA journal_mode=WAL").fetchall() != [("wal",)]:
                raise RuntimeError("Failed to enable WAL")
            connection.commit()
            connection.close()
            connection = sqlite3.connect(target)
            connection.execute("PRAGMA wal_checkpoint(TRUNCATE)").fetchall()
        finally:
            connection.close()
        os.chmod(target, 0o600)
        # Hard-link provides atomic publication and refuses to replace an existing destination.
        os.link(target, output)
        report_path = output.with_suffix(output.suffix + ".migration.json")
        with report_path.open("x") as handle:
            os.chmod(report_path, 0o600)
            json.dump(report, handle, indent=2)
            handle.write("\n")
        directory_fd = os.open(output.parent, os.O_DIRECTORY)
        try:
            os.fsync(directory_fd)
        finally:
            os.close(directory_fd)
    return report


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--source-dir", type=Path)
    parser.add_argument(
        "--if-missing",
        action="store_true",
        help="Validate an existing v1 database instead of overwriting it",
    )
    args = parser.parse_args()
    if args.if_missing and args.output.is_file():
        adopt_or_upgrade(sqlite_url(args.output))
        with sqlite3.connect(args.output.resolve().as_uri() + "?mode=ro", uri=True) as existing:
            if existing.execute("SELECT version FROM site_schema WHERE id=1").fetchone() != (
                VERSION,
            ):
                raise RuntimeError("Existing schema is incompatible")
            check_integrity(existing)
        print("Existing site database verified")
        return
    report = migrate(args.output, args.source_dir)
    print(
        json.dumps(
            {
                "schema": VERSION,
                "tables": len(report["tables"]),
                "rows": sum(t["rows"] for t in report["tables"].values()),
            }
        )
    )


if __name__ == "__main__":
    main()
