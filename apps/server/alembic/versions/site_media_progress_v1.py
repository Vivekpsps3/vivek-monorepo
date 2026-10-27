"""Private portrait attribution and atomic episode completion undo.

Expand-only. Existing personal marks, reviews, artwork and membership are retained.
"""

import sqlalchemy as sa
from alembic import op

revision = "site_media_progress_v1"
down_revision = "site_media_membership_v1"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("user_entries", sa.Column("portrait_attribution", sa.Text(), nullable=True))
    op.add_column("episode_progress", sa.Column("operation_token", sa.String(36), nullable=True))
    op.create_table(
        "progress_operations",
        sa.Column("token", sa.String(36), primary_key=True),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column(
            "entry_id",
            sa.Integer(),
            sa.ForeignKey("user_entries.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("changed_ids", sa.Text(), nullable=False),
        sa.Column("undone", sa.Boolean(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_progress_operations_user_id", "progress_operations", ["user_id"])
    for head in (
        "site_schema_v1",
        "site_auth_challenge_purpose_v2",
        "site_trip_pto_days_v1",
        "site_media_membership_v1",
    ):
        op.execute(
            "INSERT INTO site_revision_compatibility (revision, compatible_head) "
            f"VALUES ('{revision}', '{head}')"
        )


def downgrade() -> None:
    op.drop_index("ix_progress_operations_user_id", table_name="progress_operations")
    op.drop_table("progress_operations")
    op.drop_column("episode_progress", "operation_token")
    op.drop_column("user_entries", "portrait_attribution")
    op.execute(f"DELETE FROM site_revision_compatibility WHERE revision = '{revision}'")
