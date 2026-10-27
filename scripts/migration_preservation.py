"""Compare original application values through an expand/backfill rehearsal.

Only version bookkeeping, proven legacy music expansion and explicitly selected
search-cache pruning may differ. Row loss or changed original values fails.
"""

import json
import sqlite3
from collections import Counter

_BOOKKEEPING = {"site_alembic_version", "site_revision_compatibility"}


def _value(value):
    return {"bytes_hex": value.hex()} if isinstance(value, bytes) else value


def _rows(db, table, columns):
    quoted = ", ".join('"' + column.replace('"', '""') + '"' for column in columns)
    name = table.replace('"', '""')
    return [
        [_value(value) for value in row] for row in db.execute(f'SELECT {quoted} FROM "{name}"')
    ]


def snapshot(db: sqlite3.Connection, *, prune_cache_keys=()) -> dict:
    tables = [
        row[0]
        for row in db.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"
        )
    ]
    saved = {}
    for table in tables:
        if table in _BOOKKEEPING:
            continue
        columns = [row[1] for row in db.execute(f'PRAGMA table_info("{table}")')]
        saved[table] = {"columns": columns, "rows": _rows(db, table, columns)}
    return {"tables": saved, "prune_cache_keys": sorted(prune_cache_keys)}


def verify(before: dict, db: sqlite3.Connection) -> dict:
    report = {
        "preserved_rows": 0,
        "new_catalog_rows": 0,
        "new_membership_rows": 0,
        "pruned_cache_rows": 0,
    }

    def encode(row):
        return json.dumps(row, sort_keys=True, separators=(",", ":"))

    for table, saved in before["tables"].items():
        columns = saved["columns"]
        expected = list(saved["rows"])
        if table == "provider_cache":
            key_index = columns.index("cache_key")
            pruned = set(before["prune_cache_keys"])
            report["pruned_cache_rows"] = sum(row[key_index] in pruned for row in expected)
            expected = [row for row in expected if row[key_index] not in pruned]
        try:
            current = _rows(db, table, columns)
        except sqlite3.Error as error:
            raise AssertionError(f"Original schema missing: {table}") from error
        expected_counts = Counter(map(encode, expected))
        current_counts = Counter(map(encode, current))
        if expected_counts - current_counts:
            raise AssertionError(f"Original values changed or disappeared: {table}")
        extra = sum((current_counts - expected_counts).values())
        allowed = 0
        actual_columns = {row[1] for row in db.execute(f'PRAGMA table_info("{table}")')}
        if table == "catalog_items" and "migration_provenance" in actual_columns:
            allowed = db.execute(
                "SELECT count(*) FROM catalog_items WHERE migration_provenance IN ('legacy-album', 'legacy-track')"
            ).fetchone()[0]
            # Rows already present in a newer source are not newly added.
            if "migration_provenance" in columns:
                index = columns.index("migration_provenance")
                allowed -= sum(row[index] in {"legacy-album", "legacy-track"} for row in expected)
            report["new_catalog_rows"] = extra
        elif table == "user_entries" and "membership_provenance" in actual_columns:
            allowed = db.execute(
                "SELECT count(*) FROM user_entries WHERE membership_provenance IS NOT NULL"
            ).fetchone()[0]
            if "membership_provenance" in columns:
                index = columns.index("membership_provenance")
                allowed -= sum(row[index] is not None for row in expected)
            report["new_membership_rows"] = extra
        if extra != allowed:
            raise AssertionError(f"Unexplained added rows: {table}: {extra}, expected {allowed}")
        report["preserved_rows"] += len(expected)
    return report
