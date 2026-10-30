"""Town habits, check-ins, and cadence rows.

TownBase is its own registry, separate from Finance, Travel, and Media.
Owner foreign keys to users.id are attached by apps.server.schema.OWNER_TABLES.
"""

from datetime import date, datetime

from sqlalchemy import (
    Date,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    SmallInteger,
    String,
    UniqueConstraint,
    text,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column

# Same function as engine.name_key. A folded key longer than 40 characters
# raises APIError 422 name_too_long; it is not truncated.
from apps.server.town.engine import name_key as make_name_key

__all__ = ["Habit", "HabitCadence", "HabitCheckin", "TownBase", "make_name_key"]


class TownBase(DeclarativeBase):
    pass


class Habit(TownBase):
    __tablename__ = "habits"
    __table_args__ = (
        Index("ix_habits_user_active", "user_id", "archived_at"),
        Index(
            "uq_habits_active_slot",
            "user_id",
            "slot",
            unique=True,
            sqlite_where=text("archived_at IS NULL"),
        ),
        Index(
            "uq_habits_active_name",
            "user_id",
            "name_key",
            unique=True,
            sqlite_where=text("archived_at IS NULL"),
        ),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(Integer, nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(40), nullable=False)
    slot: Mapped[int] = mapped_column(SmallInteger, nullable=False)
    building_style: Mapped[str] = mapped_column(String(16), nullable=False)
    per_week: Mapped[int] = mapped_column(SmallInteger, nullable=False)
    created_on: Mapped[date] = mapped_column(Date, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    archived_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    archived_on: Mapped[date | None] = mapped_column(Date, nullable=True)
    # make_name_key(name). Uniqueness is the partial index, among active rows only.
    # A casefold longer than 40 characters is rejected, not truncated.
    name_key: Mapped[str] = mapped_column(String(40), nullable=False)


class HabitCheckin(TownBase):
    __tablename__ = "habit_checkins"
    __table_args__ = (
        UniqueConstraint("habit_id", "day", name="uq_checkin_habit_day"),
        Index("ix_habit_checkins_user_day", "user_id", "day"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    habit_id: Mapped[int] = mapped_column(
        ForeignKey("habits.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    user_id: Mapped[int] = mapped_column(Integer, nullable=False, index=True)
    day: Mapped[date] = mapped_column(Date, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)


class HabitCadence(TownBase):
    __tablename__ = "habit_cadences"
    __table_args__ = (UniqueConstraint("habit_id", "effective_from", name="uq_cadence_habit_from"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    habit_id: Mapped[int] = mapped_column(ForeignKey("habits.id"), nullable=False, index=True)
    user_id: Mapped[int] = mapped_column(Integer, nullable=False)
    per_week: Mapped[int] = mapped_column(SmallInteger, nullable=False)
    effective_from: Mapped[date] = mapped_column(Date, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
