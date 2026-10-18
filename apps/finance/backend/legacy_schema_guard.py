"""Refuse startup while server-side plaintext Finance data still exists."""

from sqlalchemy import inspect, text


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


def assert_safe_to_remove_legacy_schema(connection) -> None:
    blockers = legacy_schema_blockers(connection)
    if blockers:
        details = ", ".join(blockers)
        raise RuntimeError(
            "Refusing to start the server-blind Finance schema while legacy data remains "
            f"({details}). Open the previous app version, migrate the account into its browser vault, "
            "and retry after verifying the migration."
        )
