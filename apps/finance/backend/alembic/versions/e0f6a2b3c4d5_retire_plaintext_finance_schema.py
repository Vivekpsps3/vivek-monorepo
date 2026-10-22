"""Retire empty plaintext Finance tables and completed migration bookkeeping.

Encrypted records, vault keys, auth, and public market caches are preserved.
"""
from alembic import op
import sqlalchemy as sa
from apps.finance.backend.legacy_schema_guard import assert_safe_to_remove_legacy_schema

revision = "e0f6a2b3c4d5"
down_revision = "b7c9d2e4f601"
branch_labels = None
depends_on = None

# Dependents first, including provider registries used only by the retired tables.
DROP_ORDER = (
    "transactions", "holdings", "planning_scenario_runs", "bank_accounts",
    "import_batches", "brokerage_accounts", "assets", "liabilities",
    "job_incomes", "fixed_expenses", "subscriptions", "planning_assumption_profiles",
    "net_worth_snapshots", "tax_documents", "banks", "brokerages", "user_crypto_migrations",
)


def upgrade():
    connection = op.get_bind()
    assert_safe_to_remove_legacy_schema(connection)
    tables = set(sa.inspect(connection).get_table_names())
    for name in DROP_ORDER:
        if name in tables:
            op.drop_table(name)


def downgrade():
    raise RuntimeError("Restore a pre-cleanup backup to return to the plaintext migration schema")
