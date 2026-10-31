"""Owner-scoped Town reads. XP is computed, not stored.

TB3 replaces only passive_days. Signature stays:

    passive_days(db, user_id, tz, founding_day, today) -> PassiveDays

Fields: episodes, finished, reminders, trips_done (dict[date, int]), media_ok,
travel_ok. This PR returns empty maps and both flags true (Library/Inn 0, "ok").
"""

import bisect
from collections.abc import Callable, Sequence
from dataclasses import dataclass
from datetime import date, timedelta
from typing import Literal

from sqlalchemy import Integer, cast, func, select
from sqlalchemy.engine import CursorResult
from sqlalchemy.orm import Session

from apps.server.errors import APIError
from apps.server.town.constants import BUILDING_LV, CONSTANTS_VERSION, DAILY_CAP, TOWN_LV, TOWN_NAME
from apps.server.town.engine import (
    describe_cadence,
    evaluate_streak,
    habit_xp,
    inn_day,
    level_progress,
    library_day,
    lots,
    stage,
)
from apps.server.town.models import Habit as HabitRow
from apps.server.town.models import HabitCadence, HabitCheckin
from apps.server.town.schemas import (
    ArchivedHabit,
    Building,
    Buildings,
    Cadence,
    CheckinDays,
    Habit,
    HabitList,
    Lot,
    PendingCadence,
    Streak,
    Today,
    Town,
    TownSummary,
    Week,
)

Source = Literal["ok", "unavailable"]
# julianday('0001-01-01') - this offset is Python's date.toordinal() for that day.
_ORDINAL_EPOCH = 1721424.5


@dataclass(frozen=True)
class PassiveDays:
    """Per-day counts plus source flags. A false flag means that source was not read."""

    episodes: dict[date, int]
    finished: dict[date, int]
    reminders: dict[date, int]
    trips_done: dict[date, int]
    media_ok: bool
    travel_ok: bool


def passive_days(
    db: Session,
    user_id: int,
    tz: str,
    founding_day: date | None,
    today: date,
) -> PassiveDays:
    """Return passive counts for one user. TB3 replaces this body only."""
    del db, user_id, tz, founding_day, today
    return PassiveDays({}, {}, {}, {}, True, True)


def read_town(db: Session, user_id: int, today: date, tz: str) -> Town:
    bundle = _bundle(db, user_id, today)
    passive = passive_days(db, user_id, tz, bundle.founding, today)
    library = _building(
        passive.media_ok,
        bundle.founding,
        today,
        passive.episodes,
        passive.finished,
        library_day,
        DAILY_CAP["library"],
    )
    inn = _building(
        passive.travel_ok,
        bundle.founding,
        today,
        passive.reminders,
        passive.trips_done,
        inn_day,
        DAILY_CAP["inn"],
    )
    points = sum(view.xp for view in bundle.views.values())
    if library.source == "ok":
        points += library.xp
    if inn.source == "ok":
        points += inn.xp
    level, start, nxt = level_progress(points, TOWN_LV)
    occupied = {habit.slot: habit.id for habit in bundle.active}
    done = sum(1 for habit in bundle.active if bundle.views[habit.id].checked_today)
    return Town(
        town=TownSummary(
            name=TOWN_NAME,
            founded_on=bundle.founding,
            today=today,
            tz=tz,
            xp=points,
            level=level,
            level_xp_start=start,
            next_level_xp=nxt,
        ),
        buildings=Buildings(library=library, inn=inn),
        lots=[Lot.model_validate(row) for row in lots(level, occupied)],
        habits=[bundle.views[habit.id] for habit in bundle.active],
        archived=[_archived(bundle.views[habit.id]) for habit in bundle.archived],
        today=Today(done=done, total=len(bundle.active)),
        constants_version=CONSTANTS_VERSION,
    )


def read_habits(db: Session, user_id: int, today: date, *, include_archived: bool) -> HabitList:
    bundle = _bundle(db, user_id, today)
    items = [bundle.views[habit.id] for habit in bundle.active]
    if include_archived:
        items.extend(bundle.views[habit.id] for habit in bundle.archived)
    return HabitList(items=items)


def read_checkins(db: Session, user_id: int, habit_id: int, start: date, end: date) -> CheckinDays:
    """Days in [start, end], ascending. Another user's habit is 404 habit_not_found."""
    found = db.scalar(
        select(HabitRow.id).where(HabitRow.id == habit_id, HabitRow.user_id == user_id)
    )
    if found is None:
        raise APIError(404, "habit_not_found", "That habit doesn't exist.")
    days = db.scalars(
        select(HabitCheckin.day)
        .where(
            HabitCheckin.habit_id == habit_id,
            HabitCheckin.user_id == user_id,
            HabitCheckin.day >= start,
            HabitCheckin.day <= end,
        )
        .order_by(HabitCheckin.day)
    ).all()
    return CheckinDays(days=list(days))


@dataclass(frozen=True)
class _Bundle:
    founding: date | None
    active: list[HabitRow]
    archived: list[HabitRow]
    views: dict[int, Habit]


def _bundle(db: Session, user_id: int, today: date) -> _Bundle:
    habits = list(db.scalars(select(HabitRow).where(HabitRow.user_id == user_id)).all())
    checks = _checkin_ords(db, user_id)
    cadences = _cadences(db, user_id)
    founding = min((habit.created_on for habit in habits), default=None)
    active = [habit for habit in habits if habit.archived_at is None]
    archived = [
        habit for habit in habits if habit.archived_at is not None and habit.archived_on is not None
    ]
    active.sort(key=lambda habit: (habit.slot, habit.id))
    archived.sort(key=lambda habit: (habit.archived_on or date.min, habit.id), reverse=True)
    views = {
        habit.id: _habit_view(habit, checks.get(habit.id, ()), cadences.get(habit.id, ()), today)
        for habit in habits
    }
    return _Bundle(founding, active, archived, views)


def _checkin_ords(db: Session, user_id: int) -> dict[int, list[int]]:
    # Core (habit_id, Python ordinal) tuples. DISTINCT collapses a repeated day.
    # One DBAPI fetchall: wrapping each row as a SQLAlchemy Row dominated the read.
    table = HabitCheckin.__table__
    day_ord = cast(func.julianday(table.c.day) - _ORDINAL_EPOCH, Integer)
    result = db.execute(
        select(table.c.habit_id, day_ord)
        .where(table.c.user_id == user_id)
        .distinct()
        .order_by(table.c.habit_id, day_ord)
    )
    if not isinstance(result, CursorResult):
        raise RuntimeError("check-in query did not return rows")
    try:
        rows = result.cursor.fetchall()
    finally:
        result.close()
    grouped: dict[int, list[int]] = {}
    habit_id = -1
    bucket: list[int] = []
    for raw_id, ordinal in rows:
        next_id = int(raw_id)
        if next_id != habit_id:
            habit_id = next_id
            bucket = []
            grouped[habit_id] = bucket
        bucket.append(int(ordinal))
    return grouped


def _cadences(db: Session, user_id: int) -> dict[int, list[tuple[date, int]]]:
    table = HabitCadence.__table__
    grouped: dict[int, list[tuple[date, int]]] = {}
    for habit_id, effective_from, per_week in db.execute(
        select(table.c.habit_id, table.c.effective_from, table.c.per_week)
        .where(table.c.user_id == user_id)
        .order_by(table.c.habit_id, table.c.effective_from)
    ):
        grouped.setdefault(int(habit_id), []).append((effective_from, int(per_week)))
    return grouped


def _habit_view(
    habit: HabitRow,
    ords: Sequence[int],
    cadence_rows: Sequence[tuple[date, int]],
    today: date,
) -> Habit:
    streak = evaluate_streak(
        habit.created_on,
        today,
        (),
        habit.per_week,
        cadence_rows,
        habit.archived_on,
        checkin_ords=ords,
    )
    points = habit_xp(len(ords), streak.streak7_count)
    level, start, nxt = level_progress(points, BUILDING_LV)
    cadence = describe_cadence(today, habit.per_week, cadence_rows)
    pending = None
    if cadence.pending is not None:
        pending = PendingCadence(
            per_week=cadence.pending.per_week, effective_from=cadence.pending.effective_from
        )
    yesterday = today - timedelta(days=1)
    today_ord = today.toordinal()
    checked_today = _has(ords, today_ord)
    checked_yesterday = _has(ords, today_ord - 1)
    return Habit(
        id=habit.id,
        name=habit.name,
        slot=None if habit.archived_at is not None else habit.slot,
        building_style=habit.building_style,
        cadence=Cadence(per_week=cadence.per_week, kind=cadence.kind, pending=pending),
        created_on=habit.created_on,
        archived_on=habit.archived_on,
        xp=points,
        level=level,
        stage=stage(level),
        level_xp_start=start,
        next_level_xp=nxt,
        streak=Streak(
            unit=streak.unit,
            current=streak.current,
            best=streak.best,
            best_days=streak.best_days,
            best_weeks=streak.best_weeks,
            rest_day_available=streak.rest_day_available,
            rest_used_on=streak.rest_used_on,
        ),
        week=None
        if streak.week is None
        else Week(done=streak.week.done, target=streak.week.target),
        checked_today=checked_today,
        checked_yesterday=checked_yesterday,
        can_check_yesterday=yesterday >= habit.created_on and not checked_yesterday,
        last7=list(streak.last7),
    )


def _building(
    ok: bool,
    founding: date | None,
    today: date,
    left: dict[date, int],
    right: dict[date, int],
    day_xp: Callable[[int, int], int],
    cap: int,
) -> Building:
    source: Source = "ok" if ok else "unavailable"
    points = 0
    today_points = 0
    if ok and founding is not None and founding <= today:
        for day in set(left) | set(right):
            if founding <= day <= today:
                points += day_xp(left.get(day, 0), right.get(day, 0))
        today_points = day_xp(left.get(today, 0), right.get(today, 0))
    level, start, nxt = level_progress(points, BUILDING_LV)
    return Building(
        xp=points,
        level=level,
        stage=stage(level),
        level_xp_start=start,
        next_level_xp=nxt,
        today_xp=today_points,
        today_cap=cap,
        source=source,
    )


def _archived(view: Habit) -> ArchivedHabit:
    archived_on = view.archived_on
    if archived_on is None:
        raise RuntimeError("archived habit is missing archived_on")
    return ArchivedHabit(
        id=view.id,
        name=view.name,
        xp=view.xp,
        level=view.level,
        best_days=view.streak.best_days,
        best_weeks=view.streak.best_weeks,
        created_on=view.created_on,
        archived_on=archived_on,
    )


def _has(ords: Sequence[int], target: int) -> bool:
    index = bisect.bisect_left(ords, target)
    return index < len(ords) and ords[index] == target
