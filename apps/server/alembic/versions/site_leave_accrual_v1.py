"""Opt-in scheduled accrual beside the daily default.

Expand-only. Existing rows stay daily, with no anchor and version 0.
No balance is rewritten and no posting date is backfilled. Older heads can
still read and write the previous columns. The new columns are nullable or
have a database default.
"""

import sqlalchemy as sa
from alembic import op

revision = "site_leave_accrual_v1"
down_revision = "site_leave_carry_v1"
branch_labels = None
depends_on = None

_COMPATIBLE_HEADS = (
    "site_schema_v1",
    "site_auth_challenge_purpose_v2",
    "site_trip_pto_days_v1",
    "site_media_membership_v1",
    "site_media_progress_v1",
    "site_catalog_title_sort_v1",
    "site_trip_create_attempt_v1",
    "site_town_v1",
    "site_user_birthday_v1",
    "site_leave_buckets_v1",
    "site_world_v1",
    "site_leave_carry_v1",
)


def upgrade() -> None:
    op.add_column(
        "leave_policies",
        sa.Column(
            "accrual_mode",
            sa.String(length=20),
            nullable=False,
            server_default="daily",
        ),
    )
    op.add_column("leave_policies", sa.Column("accrual_anchor", sa.Date(), nullable=True))
    op.add_column(
        "leave_policies",
        sa.Column(
            "accrual_version",
            sa.Integer(),
            nullable=False,
            server_default=sa.text("0"),
        ),
    )
    for head in _COMPATIBLE_HEADS:
        op.execute(
            "INSERT INTO site_revision_compatibility (revision, compatible_head) "
            f"VALUES ('{revision}', '{head}')"
        )


def downgrade() -> None:
    op.execute(f"DELETE FROM site_revision_compatibility WHERE revision = '{revision}'")
    op.drop_column("leave_policies", "accrual_version")
    op.drop_column("leave_policies", "accrual_anchor")
    op.drop_column("leave_policies", "accrual_mode")
