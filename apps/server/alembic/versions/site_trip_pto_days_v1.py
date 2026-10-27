"""Add per-date PTO rows and backfill them without guessing legacy days.

Revision ID: site_trip_pto_days_v1
Revises: site_auth_challenge_purpose_v2
Create Date: 2026-10-25

Expand-only: new table ``trip_pto_days`` and nullable ``trips.pto_mode``.
Automatic trips (null or blank ``pto_days``) gain one default row per date,
weekday 1 and weekend 0. Any stored total, including zero and fractions,
stays on ``trips.pto_days`` and is marked legacy. Manual ``pto_entries`` are
not rewritten. Charging still uses those entries on the start date, so this
revision does not change forecasts.

Per-date charging would change some capped-accrual and mid-balance
projections. That correction is not applied here.

``site_schema_v1`` and ``site_auth_challenge_purpose_v2`` can serve this
revision: it only adds a table and a nullable column.
"""

import sqlalchemy as sa
from alembic import op

revision = "site_trip_pto_days_v1"
down_revision = "site_auth_challenge_purpose_v2"
branch_labels = None
depends_on = None

_COMPATIBLE_HEADS = ("site_schema_v1", "site_auth_challenge_purpose_v2")


def upgrade() -> None:
    op.create_table(
        "trip_pto_days",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("trip_id", sa.Integer(), nullable=False),
        sa.Column("on_date", sa.Date(), nullable=False),
        sa.Column("amount", sa.String(length=32), nullable=False),
        sa.Column("provenance", sa.String(length=20), nullable=False),
        sa.Column("migration_source", sa.String(length=40), nullable=True),
        sa.ForeignKeyConstraint(["trip_id"], ["trips.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("trip_id", "on_date", name="uq_trip_pto_day"),
    )
    op.create_index("ix_trip_pto_days_trip_id", "trip_pto_days", ["trip_id"], unique=False)
    op.add_column("trips", sa.Column("pto_mode", sa.String(length=20), nullable=True))
    from apps.travel.backend.services.pto import backfill_statements, backfill_trip_pto_days

    if op.get_context().as_sql:
        for statement in backfill_statements():
            op.execute(statement)
    else:
        backfill_trip_pto_days(op.get_bind())
    for head in _COMPATIBLE_HEADS:
        op.execute(
            "INSERT INTO site_revision_compatibility (revision, compatible_head) "
            f"VALUES ('{revision}', '{head}')"
        )


def downgrade() -> None:
    op.execute(
        "DELETE FROM site_revision_compatibility "
        f"WHERE revision = '{revision}'"
    )
    op.drop_column("trips", "pto_mode")
    op.drop_index("ix_trip_pto_days_trip_id", table_name="trip_pto_days")
    op.drop_table("trip_pto_days")
