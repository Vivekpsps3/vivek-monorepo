"""Resident dialogue ranks.

Expand-only. Two new tables store one revision and one completion per
conversation identity. Existing rows stay in place. The previous image can
still serve this head because it does not read the new tables.
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "site_town_dialogue_v1"
down_revision: Union[str, None] = "site_town_quests_v1"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "town_dialogue_journals",
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("revision", sa.Integer(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint("revision >= 1", name="ck_town_dialogue_journals_revision"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("user_id"),
    )
    op.create_table(
        "town_dialogue_completions",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("resident_id", sa.String(length=40), nullable=False),
        sa.Column("conversation_id", sa.String(length=40), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint(
            "resident_id IN ('mara', 'ada', 'imani', 'jun', 'wren', 'sol')",
            name="ck_town_dialogue_completions_resident",
        ),
        sa.CheckConstraint(
            "conversation_id IN ('welcome', 'how-it-works', 'preference', 'activity', 'reflection')",
            name="ck_town_dialogue_completions_conversation",
        ),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_town_dialogue_completions_user_id", "town_dialogue_completions", ["user_id"]
    )
    op.create_index(
        "uq_town_dialogue_completion",
        "town_dialogue_completions",
        ["user_id", "resident_id", "conversation_id"],
        unique=True,
    )
    op.execute(
        "INSERT INTO site_revision_compatibility (revision, compatible_head) "
        "SELECT 'site_town_dialogue_v1', compatible_head FROM site_revision_compatibility "
        "WHERE revision = 'site_town_quests_v1'"
    )
    op.execute(
        "INSERT INTO site_revision_compatibility (revision, compatible_head) "
        "VALUES ('site_town_dialogue_v1', 'site_town_quests_v1')"
    )


def downgrade() -> None:
    op.execute("DELETE FROM site_revision_compatibility WHERE revision = 'site_town_dialogue_v1'")
    op.drop_index("uq_town_dialogue_completion", table_name="town_dialogue_completions")
    op.drop_index("ix_town_dialogue_completions_user_id", table_name="town_dialogue_completions")
    op.drop_table("town_dialogue_completions")
    op.drop_table("town_dialogue_journals")
