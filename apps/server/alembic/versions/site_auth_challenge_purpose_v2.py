"""Record why an auth challenge was issued.

Revision ID: site_auth_challenge_purpose_v2
Revises: site_schema_v1
Create Date: 2026-10-24

Expand-only. ``purpose`` has a default, so the previous image can still insert
login challenges. ``site_revision_compatibility`` records that site_schema_v1
can serve this revision.
"""

import sqlalchemy as sa
from alembic import op

revision = "site_auth_challenge_purpose_v2"
down_revision = "site_schema_v1"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "auth_challenges",
        sa.Column("purpose", sa.String(), nullable=False, server_default="login"),
    )
    op.execute(
        "CREATE TABLE IF NOT EXISTS site_revision_compatibility ("
        "revision VARCHAR(32) NOT NULL, "
        "compatible_head VARCHAR(32) NOT NULL, "
        "PRIMARY KEY (revision, compatible_head))"
    )
    op.execute(
        "INSERT INTO site_revision_compatibility (revision, compatible_head) "
        "VALUES ('site_auth_challenge_purpose_v2', 'site_schema_v1')"
    )


def downgrade() -> None:
    op.execute(
        "DELETE FROM site_revision_compatibility "
        "WHERE revision = 'site_auth_challenge_purpose_v2'"
    )
    op.drop_column("auth_challenges", "purpose")
