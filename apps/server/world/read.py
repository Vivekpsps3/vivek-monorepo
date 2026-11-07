"""Range resolution and the habits read for GET /api/world.

Reads TB1's tables directly with SQLAlchemy Core tuple selects (a constant
number of statements, per the TB2B perf ruling) and imports nothing from
apps/server/town except the models module, for the table objects.
"""

from __future__ import annotations

import re
from datetime import date, timedelta
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from apps.server.errors import APIError
from apps.server.town.models import Habit, HabitCheckin

INVALID_TZ_MESSAGE = "Your time zone wasn't recognized."
INVALID_RANGE_MESSAGE = "That range of weeks isn't available."

# Same zone-name pattern packages/time/today.py uses (read there; its private
# name is not imported and that module is not edited).
_ZONE_NAME = re.compile(r"^[A-Za-z0-9_+-]{1,64}(?:/[A-Za-z0-9_+-]{1,64}){0,2}$")

MAX_WEEKS = 26
DEFAULT_WEEKS = 25
START_WEEK_FLOOR_WEEKS = 519

_habits = Habit.__table__
_checkins = HabitCheckin.__table__


def monday_of(day: date) -> date:
    return day - timedelta(days=day.weekday())


def resolve_zone(tz: str | None) -> str:
    """WG-1 interim: absent or empty tz means UTC; an unrecognized name is a 422."""
    name = (tz or "").strip()
    if not name:
        return "UTC"
    if not _ZONE_NAME.fullmatch(name):
        raise APIError(422, "invalid_tz", INVALID_TZ_MESSAGE)
    try:
        ZoneInfo(name)
    except (ZoneInfoNotFoundError, ValueError, OSError):
        raise APIError(422, "invalid_tz", INVALID_TZ_MESSAGE) from None
    return name


def _parse_day(raw: str) -> date:
    try:
        return date.fromisoformat(raw)
    except ValueError:
        raise APIError(422, "world_range_invalid", INVALID_RANGE_MESSAGE) from None


def resolve_range(today: date, from_raw: str | None, to_raw: str | None) -> tuple[date, date, date]:
    """Validate the requested range; returns (from, to, current_week) unclamped."""
    current_week = monday_of(today)
    to = _parse_day(to_raw) if to_raw is not None else current_week
    from_ = _parse_day(from_raw) if from_raw is not None else to - timedelta(weeks=DEFAULT_WEEKS)
    if from_.weekday() != 0 or to.weekday() != 0:
        raise APIError(422, "world_range_invalid", INVALID_RANGE_MESSAGE)
    span_weeks = (to - from_).days // 7 + 1
    if from_ > to or span_weeks > MAX_WEEKS or to > current_week:
        raise APIError(422, "world_range_invalid", INVALID_RANGE_MESSAGE)
    return from_, to, current_week


def start_week_from_candidates(candidates: list[date], today: date, current_week: date) -> date:
    """Monday of the earliest candidate (or today), floored at current_week - 519w.

    W3a and L1a append their own earliest dates to the candidate list.
    """
    earliest = min([*candidates, today])
    floor = current_week - timedelta(weeks=START_WEEK_FLOOR_WEEKS)
    return max(monday_of(earliest), floor)


def read_world(db: Session, user_id: int, today: date, from_: date, to: date) -> dict:
    """Build the WorldResponse payload (as plain dicts) for one owner."""
    current_week = monday_of(today)

    earliest_created = db.execute(
        select(func.min(_habits.c.created_on)).where(_habits.c.user_id == user_id)
    ).scalar_one()
    candidates = [earliest_created] if earliest_created is not None else []
    start_week = start_week_from_candidates(candidates, today, current_week)

    meta = {
        "today": today,
        "current_week": current_week,
        "start_week": start_week,
        "version": 1,
    }

    from_ = max(from_, start_week)
    if from_ > to:
        # WG-5 interim: a range fully before start_week is 200 with no weeks.
        return {"meta": meta, "weeks": []}

    to_end = to + timedelta(days=6)
    rows = db.execute(
        select(_checkins.c.habit_id, _checkins.c.day)
        .distinct()
        .where(
            _checkins.c.user_id == user_id,
            _checkins.c.day >= from_,
            _checkins.c.day <= to_end,
            _checkins.c.day <= today,
        )
        .order_by(_checkins.c.habit_id, _checkins.c.day)
    ).all()
    if not rows:
        return {"meta": meta, "weeks": []}

    habit_ids = sorted({row.habit_id for row in rows})
    habit_rows = db.execute(
        select(
            _habits.c.id,
            _habits.c.name,
            _habits.c.building_style,
            _habits.c.archived_at,
        ).where(_habits.c.id.in_(habit_ids))
    ).all()
    habits_by_id = {
        row.id: {
            "habit_id": row.id,
            "name": row.name,
            "style": row.building_style,
            "archived": row.archived_at is not None,
        }
        for row in habit_rows
    }

    days_by_week_habit: dict[date, dict[int, list[date]]] = {}
    for row in rows:
        week = monday_of(row.day)
        days_by_week_habit.setdefault(week, {}).setdefault(row.habit_id, []).append(row.day)

    weeks = []
    for week in sorted(days_by_week_habit):
        habits = [
            {**habits_by_id[habit_id], "days": days_by_week_habit[week][habit_id]}
            for habit_id in sorted(days_by_week_habit[week])
            if habit_id in habits_by_id
        ]
        weeks.append({"week": week, "trips": [], "finished": [], "habits": habits, "concepts": []})
    return {"meta": meta, "weeks": weeks}
