"""Carry unused leave hours across each policy-year start.

Expand-only. ``carry_forward`` defaults to true so an existing balance keeps
crossing the policy-year boundary. PTO and Sick each store their own choice.
Older heads stay compatible. No backfill and no drops.
"""

import sqlalchemy as sa
from alembic import op

revision = "site_leave_carry_v1"
down_revision = "site_world_v1"
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
)


def upgrade() -> None:
    op.add_column(
        "leave_policies",
        sa.Column(
            "carry_forward",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("1"),
        ),
    )
    for head in _COMPATIBLE_HEADS:
        op.execute(
            "INSERT INTO site_revision_compatibility (revision, compatible_head) "
            f"VALUES ('{revision}', '{head}')"
        )


def downgrade() -> None:
    op.execute(f"DELETE FROM site_revision_compatibility WHERE revision = '{revision}'")
    op.drop_column("leave_policies", "carry_forward")
