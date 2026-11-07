"""World concepts (Lit Map, L1a).

Expand-only. One new table, ``world_concepts``, with its two named indexes
plus the owner index. Older heads stay compatible. No backfill and no drops.

The chain head when this was written is ``site_leave_buckets_v1`` (PB1's
``site_user_birthday_v1`` sits below it); per MIGRATION-CHAIN the single
current head is the down_revision.
"""

import sqlalchemy as sa
from alembic import op

revision = "site_world_v1"
down_revision = "site_leave_buckets_v1"
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
)


def upgrade() -> None:
    op.create_table(
        "world_concepts",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(length=80), nullable=False),
        sa.Column("name_key", sa.String(length=120), nullable=False),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column("source", sa.String(length=500), nullable=True),
        sa.Column("understood_on", sa.Date(), nullable=True),
        sa.Column("archived_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_world_concepts_user_id", "world_concepts", ["user_id"])
    op.create_index(
        "ix_world_concepts_user_understood",
        "world_concepts",
        ["user_id", "understood_on"],
    )
    op.create_index(
        "uq_world_concepts_active_name",
        "world_concepts",
        ["user_id", "name_key"],
        unique=True,
        sqlite_where=sa.text("archived_at IS NULL"),
    )
    for head in _COMPATIBLE_HEADS:
        op.execute(
            "INSERT INTO site_revision_compatibility (revision, compatible_head) "
            f"VALUES ('{revision}', '{head}')"
        )


def downgrade() -> None:
    op.execute(f"DELETE FROM site_revision_compatibility WHERE revision = '{revision}'")
    op.drop_index("uq_world_concepts_active_name", table_name="world_concepts")
    op.drop_index("ix_world_concepts_user_understood", table_name="world_concepts")
    op.drop_index("ix_world_concepts_user_id", table_name="world_concepts")
    op.drop_table("world_concepts")
