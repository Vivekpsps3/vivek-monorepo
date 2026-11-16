"""Owner-scoped, hash-only calendar capabilities; no copied event data."""

import sqlalchemy as sa
from alembic import op

revision = "site_calendar_feeds_v1"
down_revision = "site_credential_wrap_revision_v1"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "calendar_feeds",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False
        ),
        sa.Column("scope", sa.String(16), nullable=False),
        sa.Column("timezone", sa.String(100), nullable=False),
        sa.Column("token_hash", sa.String(64), nullable=False, unique=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.UniqueConstraint("user_id", "scope", name="uq_calendar_feed_owner_scope"),
    )
    op.execute(
        "INSERT INTO site_revision_compatibility (revision, compatible_head) "
        "SELECT 'site_calendar_feeds_v1', compatible_head FROM site_revision_compatibility "
        "WHERE revision = 'site_credential_wrap_revision_v1'"
    )
    op.execute(
        "INSERT INTO site_revision_compatibility (revision, compatible_head) "
        "VALUES ('site_calendar_feeds_v1', 'site_credential_wrap_revision_v1')"
    )


def downgrade() -> None:
    op.execute("DELETE FROM site_revision_compatibility WHERE revision = 'site_calendar_feeds_v1'")
    op.drop_table("calendar_feeds")
