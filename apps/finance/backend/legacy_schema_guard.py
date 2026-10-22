"""Refuse startup while server-side plaintext Finance data still exists."""

import os
from pathlib import Path

from sqlalchemy import inspect, text
from sqlalchemy.engine import make_url


LEGACY_FINANCE_TABLES = (
    "transactions",
    "bank_accounts",
    "import_batches",
    "assets",
    "liabilities",
    "holdings",
    "brokerage_accounts",
    "job_incomes",
    "fixed_expenses",
    "subscriptions",
    "planning_assumption_profiles",
    "planning_scenario_runs",
    "net_worth_snapshots",
    "tax_documents",
)


def legacy_schema_blockers(connection) -> list[str]:
    inspector = inspect(connection)
    tables = set(inspector.get_table_names())
    blockers: list[str] = []

    for table in LEGACY_FINANCE_TABLES:
        if table not in tables:
            continue
        count = connection.execute(text(f'SELECT COUNT(*) FROM "{table}"')).scalar_one()
        if count:
            blockers.append(f"{table}={count}")

    if "users" in tables:
        columns = {column["name"] for column in inspector.get_columns("users")}
        if "password_hash" in columns:
            if "auth_public_key_b64" in columns:
                legacy_auth = connection.execute(
                    text(
                        "SELECT COUNT(*) FROM users "
                        "WHERE COALESCE(password_hash, '') <> '' "
                        "AND COALESCE(auth_public_key_b64, '') = ''"
                    )
                ).scalar_one()
            else:
                legacy_auth = connection.execute(
                    text("SELECT COUNT(*) FROM users WHERE COALESCE(password_hash, '') <> ''")
                ).scalar_one()
            if legacy_auth:
                blockers.append(f"password-only users={legacy_auth}")

    return blockers


def _same_sqlite(left: str, right: str) -> bool:
    if not left or not right:
        return False
    if left == right:
        return True
    try:
        first, second = make_url(left), make_url(right)
    except Exception:
        return False
    if not (first.drivername.startswith("sqlite") and second.drivername.startswith("sqlite")):
        return False
    if not first.database or not second.database or first.database == ":memory:" or second.database == ":memory:":
        return False
    return Path(first.database).resolve() == Path(second.database).resolve()


def assert_offline_not_site_database(url: str) -> None:
    """Refuse to emit historical Finance SQL for the unified site file.

    Offline ``--sql`` mode has no connection, so the sqlite_master guard cannot run.
    """
    site = os.environ.get("SITE_DATABASE_URL", "")
    if site and _same_sqlite(url or "", site):
        raise RuntimeError(
            "Refusing to emit historical Finance SQL for the unified site database. "
            "Use python -m apps.server.migrations."
        )


def assert_not_unified_site_database(connection) -> None:
    """The historical Finance chain must not revise the unified site database."""
    if getattr(connection.dialect, "name", None) != "sqlite":
        return
    found = connection.execute(
        text(
            "SELECT name FROM sqlite_master WHERE type='table' "
            "AND name IN ('site_schema', 'site_alembic_version')"
        )
    ).fetchall()
    if found:
        raise RuntimeError(
            "Refusing to run historical Finance migrations against the unified site database. "
            "Use python -m apps.server.migrations."
        )


def assert_safe_to_remove_legacy_schema(connection) -> None:
    blockers = legacy_schema_blockers(connection)
    if blockers:
        details = ", ".join(blockers)
        raise RuntimeError(
            "Refusing to start the server-blind Finance schema while legacy data remains "
            f"({details}). Open the previous app version, migrate the account into its browser vault, "
            "and retry after verifying the migration."
        )
