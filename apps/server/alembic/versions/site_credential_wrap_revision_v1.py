"""Shared revision for atomic signing-key and DEK wrap rotation."""

import sqlalchemy as sa
from alembic import op

revision = "site_credential_wrap_revision_v1"
down_revision = "site_vault_restore_v1"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column("credential_wrap_revision", sa.Integer(), nullable=False, server_default="1"),
    )
    # Earlier images can still serve this additive column. Their legacy wrap
    # writers do not know the revision: do not enable rotation until rollout ends.
    op.execute(
        "INSERT INTO site_revision_compatibility (revision, compatible_head) "
        "SELECT 'site_credential_wrap_revision_v1', compatible_head "
        "FROM site_revision_compatibility WHERE revision = 'site_vault_restore_v1'"
    )
    op.execute(
        "INSERT INTO site_revision_compatibility (revision, compatible_head) "
        "VALUES ('site_credential_wrap_revision_v1', 'site_vault_restore_v1')"
    )


def downgrade() -> None:
    op.execute(f"DELETE FROM site_revision_compatibility WHERE revision = '{revision}'")
    op.drop_column("users", "credential_wrap_revision")
