"""Town habits and add-only completion timestamps.

Expand-only. New tables, plus nullable columns on user_entries and reminders.
Startup does not migrate. Older heads stay compatible.
"""

import sqlalchemy as sa
from alembic import op

revision = "site_town_v1"
down_revision = "site_trip_create_attempt_v1"
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
)


def upgrade() -> None:
    op.create_table(
        "habits",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(length=40), nullable=False),
        sa.Column("slot", sa.SmallInteger(), nullable=False),
        sa.Column("building_style", sa.String(length=16), nullable=False),
        sa.Column("per_week", sa.SmallInteger(), nullable=False),
        sa.Column("created_on", sa.Date(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("archived_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("archived_on", sa.Date(), nullable=True),
        sa.Column("name_key", sa.String(length=40), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_habits_user_id", "habits", ["user_id"])
    op.create_index("ix_habits_user_active", "habits", ["user_id", "archived_at"])
    op.create_index(
        "uq_habits_active_slot",
        "habits",
        ["user_id", "slot"],
        unique=True,
        sqlite_where=sa.text("archived_at IS NULL"),
    )
    op.create_index(
        "uq_habits_active_name",
        "habits",
        ["user_id", "name_key"],
        unique=True,
        sqlite_where=sa.text("archived_at IS NULL"),
    )
    op.create_table(
        "habit_checkins",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("habit_id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("day", sa.Date(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["habit_id"], ["habits.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("habit_id", "day", name="uq_checkin_habit_day"),
    )
    op.create_index("ix_habit_checkins_habit_id", "habit_checkins", ["habit_id"])
    op.create_index("ix_habit_checkins_user_id", "habit_checkins", ["user_id"])
    op.create_index("ix_habit_checkins_user_day", "habit_checkins", ["user_id", "day"])
    op.create_table(
        "habit_cadences",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("habit_id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("per_week", sa.SmallInteger(), nullable=False),
        sa.Column("effective_from", sa.Date(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["habit_id"], ["habits.id"]),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("habit_id", "effective_from", name="uq_cadence_habit_from"),
    )
    op.create_index("ix_habit_cadences_habit_id", "habit_cadences", ["habit_id"])
    op.add_column(
        "user_entries", sa.Column("completed_on", sa.Date(), nullable=True)
    )
    op.add_column(
        "reminders", sa.Column("done_at", sa.DateTime(timezone=True), nullable=True)
    )
    for head in _COMPATIBLE_HEADS:
        op.execute(
            "INSERT INTO site_revision_compatibility (revision, compatible_head) "
            f"VALUES ('{revision}', '{head}')"
        )


def downgrade() -> None:
    op.execute(f"DELETE FROM site_revision_compatibility WHERE revision = '{revision}'")
    op.drop_column("reminders", "done_at")
    op.drop_column("user_entries", "completed_on")
    op.drop_index("ix_habit_checkins_user_day", table_name="habit_checkins")
    op.drop_index("ix_habit_checkins_user_id", table_name="habit_checkins")
    op.drop_index("ix_habit_checkins_habit_id", table_name="habit_checkins")
    op.drop_table("habit_checkins")
    op.drop_index("ix_habit_cadences_habit_id", table_name="habit_cadences")
    op.drop_table("habit_cadences")
    op.drop_index(
        "uq_habits_active_name",
        table_name="habits",
        sqlite_where=sa.text("archived_at IS NULL"),
    )
    op.drop_index(
        "uq_habits_active_slot",
        table_name="habits",
        sqlite_where=sa.text("archived_at IS NULL"),
    )
    op.drop_index("ix_habits_user_active", table_name="habits")
    op.drop_index("ix_habits_user_id", table_name="habits")
    op.drop_table("habits")
