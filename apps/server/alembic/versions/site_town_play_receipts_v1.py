"""Town play receipts.

Expand-only. One table binds a minigame run to its owner, nonce, and Town
civil day. Existing stamp, quest, and discovery rows stay in place. The
previous image can still serve this head because it does not read the table.
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "site_town_play_receipts_v1"
down_revision: Union[str, None] = "site_town_discoveries_v1"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_SEED = (
    "(game_id = 'memory-shelves' AND seed = 10 AND mode IS NULL) OR "
    "(game_id = 'harbor-rhythm' AND seed = 1 AND mode IN ('timed', 'untimed'))"
)
_DONE = (
    "(status = 'open' AND score IS NULL AND reward_amount = 0 AND completed_at IS NULL) OR "
    "(status = 'complete' AND score IS NOT NULL AND completed_at IS NOT NULL "
    "AND reward_amount IN (0, 5))"
)


def upgrade() -> None:
    op.create_table(
        "town_play_receipts",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("nonce", sa.String(length=64), nullable=False),
        sa.Column("game_id", sa.String(length=32), nullable=False),
        sa.Column("seed", sa.Integer(), nullable=False),
        sa.Column("mode", sa.String(length=16), nullable=True),
        sa.Column("civil_day", sa.Date(), nullable=False),
        sa.Column("zone", sa.String(length=64), nullable=False),
        sa.Column("status", sa.String(length=16), nullable=False),
        sa.Column("score", sa.Integer(), nullable=True),
        sa.Column("reward_amount", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint(
            "game_id IN ('memory-shelves', 'harbor-rhythm')",
            name="ck_town_play_receipts_game",
        ),
        sa.CheckConstraint(_SEED, name="ck_town_play_receipts_seed"),
        sa.CheckConstraint("status IN ('open', 'complete')", name="ck_town_play_receipts_status"),
        sa.CheckConstraint(_DONE, name="ck_town_play_receipts_complete"),
        sa.CheckConstraint("length(nonce) BETWEEN 16 AND 64", name="ck_town_play_receipts_nonce"),
        sa.CheckConstraint("length(zone) BETWEEN 1 AND 64", name="ck_town_play_receipts_zone"),
        sa.CheckConstraint(
            "score IS NULL OR score BETWEEN 0 AND 1000",
            name="ck_town_play_receipts_score",
        ),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_town_play_receipts_user_id", "town_play_receipts", ["user_id"])
    op.create_index("uq_town_play_receipt_nonce", "town_play_receipts", ["nonce"], unique=True)
    op.execute(
        "INSERT INTO site_revision_compatibility (revision, compatible_head) "
        "SELECT 'site_town_play_receipts_v1', compatible_head FROM site_revision_compatibility "
        "WHERE revision = 'site_town_discoveries_v1'"
    )
    op.execute(
        "INSERT INTO site_revision_compatibility (revision, compatible_head) "
        "VALUES ('site_town_play_receipts_v1', 'site_town_discoveries_v1')"
    )


def downgrade() -> None:
    op.execute(
        "DELETE FROM site_revision_compatibility WHERE revision = 'site_town_play_receipts_v1'"
    )
    op.drop_index("uq_town_play_receipt_nonce", table_name="town_play_receipts")
    op.drop_index("ix_town_play_receipts_user_id", table_name="town_play_receipts")
    op.drop_table("town_play_receipts")
