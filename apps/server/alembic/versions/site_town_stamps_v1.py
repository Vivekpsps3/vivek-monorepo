"""Town Stamp wallets, receipts, and unlock entitlements.

Expand-only. Three new tables record a game-only balance, one receipt per
owner and grant identity, and one unlock per owner and catalog id. Existing
rows, including tables this revision does not know, stay in place. The
previous image can still serve this head because it does not read the new
tables.
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "site_town_stamps_v1"
down_revision: Union[str, None] = "site_trip_draft_v1"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "town_stamp_wallets",
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("balance", sa.Integer(), nullable=False),
        sa.CheckConstraint("balance >= 0", name="ck_town_stamp_wallets_balance"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("user_id"),
    )
    op.create_table(
        "town_stamp_receipts",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("grant_key", sa.String(length=80), nullable=False),
        sa.Column("consumer", sa.String(length=16), nullable=False),
        sa.Column("kind", sa.String(length=8), nullable=False),
        sa.Column("amount", sa.Integer(), nullable=False),
        sa.Column("catalog_id", sa.String(length=64), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint(
            "consumer IN ('market', 'quest', 'minigame')",
            name="ck_town_stamp_receipts_consumer",
        ),
        sa.CheckConstraint(
            "kind IN ('grant', 'spend', 'refund')",
            name="ck_town_stamp_receipts_kind",
        ),
        sa.CheckConstraint("amount BETWEEN 1 AND 20", name="ck_town_stamp_receipts_amount"),
        sa.CheckConstraint(
            "length(grant_key) BETWEEN 1 AND 80",
            name="ck_town_stamp_receipts_grant_key",
        ),
        sa.CheckConstraint(
            "catalog_id IS NULL OR length(catalog_id) BETWEEN 1 AND 64",
            name="ck_town_stamp_receipts_catalog",
        ),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_town_stamp_receipts_user_id",
        "town_stamp_receipts",
        ["user_id"],
        unique=False,
    )
    op.create_index(
        "uq_town_stamp_receipt_grant",
        "town_stamp_receipts",
        ["user_id", "grant_key"],
        unique=True,
    )
    op.create_table(
        "town_stamp_entitlements",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("catalog_id", sa.String(length=64), nullable=False),
        sa.Column("spend_receipt_id", sa.Integer(), nullable=False),
        sa.Column("refund_receipt_id", sa.Integer(), nullable=True),
        sa.CheckConstraint(
            "length(catalog_id) BETWEEN 1 AND 64",
            name="ck_town_stamp_entitlements_catalog",
        ),
        sa.ForeignKeyConstraint(
            ["spend_receipt_id"],
            ["town_stamp_receipts.id"],
            name="fk_town_stamp_entitlements_spend",
        ),
        sa.ForeignKeyConstraint(
            ["refund_receipt_id"],
            ["town_stamp_receipts.id"],
            name="fk_town_stamp_entitlements_refund",
        ),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_town_stamp_entitlements_user_id",
        "town_stamp_entitlements",
        ["user_id"],
        unique=False,
    )
    op.create_index(
        "uq_town_stamp_entitlement_item",
        "town_stamp_entitlements",
        ["user_id", "catalog_id"],
        unique=True,
    )
    op.execute(
        "INSERT INTO site_revision_compatibility (revision, compatible_head) "
        "SELECT 'site_town_stamps_v1', compatible_head FROM site_revision_compatibility "
        "WHERE revision = 'site_trip_draft_v1'"
    )
    op.execute(
        "INSERT INTO site_revision_compatibility (revision, compatible_head) "
        "VALUES ('site_town_stamps_v1', 'site_trip_draft_v1')"
    )


def downgrade() -> None:
    op.execute(
        "DELETE FROM site_revision_compatibility WHERE revision = 'site_town_stamps_v1'"
    )
    op.drop_index("uq_town_stamp_entitlement_item", table_name="town_stamp_entitlements")
    op.drop_index("ix_town_stamp_entitlements_user_id", table_name="town_stamp_entitlements")
    op.drop_table("town_stamp_entitlements")
    op.drop_index("uq_town_stamp_receipt_grant", table_name="town_stamp_receipts")
    op.drop_index("ix_town_stamp_receipts_user_id", table_name="town_stamp_receipts")
    op.drop_table("town_stamp_receipts")
    op.drop_table("town_stamp_wallets")
