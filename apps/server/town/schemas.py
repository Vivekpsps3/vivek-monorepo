"""Town API shapes. Field names and nesting match design §8.1."""

from datetime import date
from typing import Literal

from pydantic import BaseModel, ConfigDict, field_validator

Last7Value = Literal["done", "rest", "miss", "pending", "none", "off"]
CadenceKind = Literal["daily", "weekly"]
StreakUnit = Literal["days", "weeks"]
BuildingSource = Literal["ok", "unavailable"]
LotState = Literal["occupied", "empty", "locked"]


class _Shape(BaseModel):
    model_config = ConfigDict(extra="forbid")


class PendingCadence(_Shape):
    per_week: int
    effective_from: date


class Cadence(_Shape):
    per_week: int
    kind: CadenceKind
    pending: PendingCadence | None


class Streak(_Shape):
    unit: StreakUnit
    current: int
    best: int
    best_days: int
    best_weeks: int
    rest_day_available: bool | None
    rest_used_on: date | None


class Week(_Shape):
    done: int
    target: int


class Habit(_Shape):
    id: int
    name: str
    slot: int | None
    building_style: str
    cadence: Cadence
    created_on: date
    archived_on: date | None
    xp: int
    level: int
    stage: int
    level_xp_start: int
    next_level_xp: int | None
    streak: Streak
    week: Week | None
    checked_today: bool
    checked_yesterday: bool
    can_check_yesterday: bool
    last7: list[Last7Value]


class Building(_Shape):
    xp: int
    level: int
    stage: int
    level_xp_start: int
    next_level_xp: int | None
    today_xp: int
    today_cap: int
    source: BuildingSource


class TownSummary(_Shape):
    name: str
    founded_on: date | None
    today: date
    tz: str
    xp: int
    level: int
    level_xp_start: int
    next_level_xp: int | None


class Lot(_Shape):
    slot: int
    unlock_level: int
    state: LotState
    habit_id: int | None


class ArchivedHabit(_Shape):
    id: int
    name: str
    xp: int
    level: int
    best_days: int
    best_weeks: int
    created_on: date
    archived_on: date


class Today(_Shape):
    done: int
    total: int


class Buildings(_Shape):
    library: Building
    inn: Building


class Town(_Shape):
    town: TownSummary
    buildings: Buildings
    lots: list[Lot]
    habits: list[Habit]
    archived: list[ArchivedHabit]
    today: Today
    constants_version: int


class HabitList(_Shape):
    items: list[Habit]


class CheckinDays(_Shape):
    days: list[date]


# --- write models (TB2C) ---


class _Write(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)


class HabitCreate(_Write):
    name: str
    slot: int
    per_week: int
    building_style: str | None = None


class HabitPatch(_Write):
    name: str | None = None
    building_style: str | None = None
    per_week: int | None = None
    archived: bool | None = None


class CheckinCreate(_Write):
    day: date

    @field_validator("day", mode="before")
    @classmethod
    def _day(cls, value: object) -> date:
        # A lax date would accept a datetime string. Require a calendar day.
        if type(value) is not str or len(value) != 10:
            raise ValueError("day")
        try:
            return date.fromisoformat(value)
        except ValueError:
            raise ValueError("day") from None


class TownProgress(_Shape):
    xp: int
    level: int
    level_xp_start: int
    next_level_xp: int | None


class CheckinResult(_Shape):
    day: date
    checked: bool
    habit: Habit
    town: TownProgress
