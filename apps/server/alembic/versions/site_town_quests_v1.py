"""Optional chapter quest journal.

Expand-only. Two new tables store one revision and one game action per step.
Existing rows, including tables this revision does not know, stay in place.
The previous image can still serve this head because it does not read the
new tables. The action check lists the catalog triples.
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "site_town_quests_v1"
down_revision: Union[str, None] = "site_town_layouts_v1"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "town_quest_journals",
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("revision", sa.Integer(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint("revision >= 1", name="ck_town_quest_journals_revision"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("user_id"),
    )
    op.create_table(
        "town_quest_steps",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("quest_id", sa.String(length=40), nullable=False),
        sa.Column("step_id", sa.String(length=40), nullable=False),
        sa.Column("action_id", sa.String(length=80), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint("length(quest_id) BETWEEN 1 AND 40", name="ck_town_quest_steps_quest"),
        sa.CheckConstraint("length(step_id) BETWEEN 1 AND 40", name="ck_town_quest_steps_step"),
        sa.CheckConstraint("length(action_id) BETWEEN 1 AND 80", name="ck_town_quest_steps_action"),
        sa.CheckConstraint(
            "quest_id || ':' || step_id || ':' || action_id IN ("
            "'make-a-home:enter-home:make-a-home:enter-home', "
            "'make-a-home:place-starter:make-a-home:place-starter', "
            "'make-a-home:save-layout:make-a-home:save-layout', "
            "'find-your-shelves:meet-librarian:find-your-shelves:meet-librarian', "
            "'find-your-shelves:inspect-saved:find-your-shelves:inspect-saved', "
            "'find-your-shelves:inspect-saved:find-your-shelves:inspect-saved:sample', "
            "'find-your-shelves:choose-display:find-your-shelves:choose-display', "
            "'across-the-harbor:meet-keeper:across-the-harbor:meet-keeper', "
            "'across-the-harbor:inspect-saved:across-the-harbor:inspect-saved', "
            "'across-the-harbor:inspect-saved:across-the-harbor:inspect-saved:sample', "
            "'across-the-harbor:ring-bell:across-the-harbor:ring-bell', "
            "'a-place-to-play:visit-arcade:a-place-to-play:visit-arcade', "
            "'a-place-to-play:finish-game:a-place-to-play:finish-game', "
            "'a-place-to-play:inspect-score:a-place-to-play:inspect-score', "
            "'light-the-square:meet-treasurer:light-the-square:meet-treasurer', "
            "'light-the-square:inspect-rules:light-the-square:inspect-rules', "
            "'light-the-square:place-lantern:light-the-square:place-lantern', "
            "'your-own-little-world:meet-residents:your-own-little-world:meet-residents', "
            "'your-own-little-world:customize-rooms:your-own-little-world:customize-rooms', "
            "'your-own-little-world:inspect-saved:your-own-little-world:inspect-saved', "
            "'your-own-little-world:inspect-saved:your-own-little-world:inspect-saved:sample'"
            ")",
            name="ck_town_quest_steps_triple",
        ),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_town_quest_steps_user_id", "town_quest_steps", ["user_id"])
    op.create_index(
        "uq_town_quest_step",
        "town_quest_steps",
        ["user_id", "quest_id", "step_id"],
        unique=True,
    )
    op.execute(
        "INSERT INTO site_revision_compatibility (revision, compatible_head) "
        "SELECT 'site_town_quests_v1', compatible_head FROM site_revision_compatibility "
        "WHERE revision = 'site_town_layouts_v1'"
    )
    op.execute(
        "INSERT INTO site_revision_compatibility (revision, compatible_head) "
        "VALUES ('site_town_quests_v1', 'site_town_layouts_v1')"
    )


def downgrade() -> None:
    op.execute("DELETE FROM site_revision_compatibility WHERE revision = 'site_town_quests_v1'")
    op.drop_index("uq_town_quest_step", table_name="town_quest_steps")
    op.drop_index("ix_town_quest_steps_user_id", table_name="town_quest_steps")
    op.drop_table("town_quest_steps")
    op.drop_table("town_quest_journals")
