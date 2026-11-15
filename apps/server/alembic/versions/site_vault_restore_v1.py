"""Temporary owner-scoped ciphertext restore stages; active records unchanged."""

import sqlalchemy as sa
from alembic import op

revision = "site_vault_restore_v1"
down_revision = "site_leave_accrual_v1"
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
    "site_leave_accrual_v1",
)


def upgrade() -> None:
    op.create_table(
        "vault_restore_stages",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column(
            "user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False
        ),
        sa.Column("vault_wrap_hash", sa.String(64), nullable=False),
        sa.Column("source_hash", sa.String(64), nullable=False),
        sa.Column("base_fingerprint", sa.String(64), nullable=False),
        sa.Column("mode", sa.String(8), nullable=False),
        sa.Column("key_version", sa.Integer(), nullable=False),
        sa.Column("expected_counts_json", sa.Text(), nullable=False),
        sa.Column("batch_count", sa.Integer(), nullable=False),
        sa.Column("status", sa.String(12), nullable=False),
        sa.Column("result_json", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
    )
    op.create_index("ix_vault_restore_stages_user_id", "vault_restore_stages", ["user_id"])
    op.create_table(
        "vault_restore_batches",
        sa.Column(
            "stage_id",
            sa.String(36),
            sa.ForeignKey("vault_restore_stages.id", ondelete="CASCADE"),
            primary_key=True,
        ),
        sa.Column("batch_index", sa.Integer(), primary_key=True),
        sa.Column("records_json", sa.Text(), nullable=False),
    )
    for head in _COMPATIBLE_HEADS:
        op.execute(
            "INSERT INTO site_revision_compatibility (revision, compatible_head) "
            f"VALUES ('{revision}', '{head}')"
        )


def downgrade() -> None:
    op.drop_table("vault_restore_batches")
    op.drop_index("ix_vault_restore_stages_user_id", table_name="vault_restore_stages")
    op.drop_table("vault_restore_stages")
    op.execute(f"DELETE FROM site_revision_compatibility WHERE revision = '{revision}'")
