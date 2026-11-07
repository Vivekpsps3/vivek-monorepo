"""Range resolution and the reads for GET /api/world.

Reads the domain tables directly with SQLAlchemy Core tuple selects (a
constant number of statements, per the TB2B perf ruling) and imports nothing
from the domain packages except their models modules (table objects) and
Town's constants. W3a adds trips and finished media to the W2a habits read.
"""

from __future__ import annotations

import re
from datetime import date, timedelta
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from sqlalchemy import false, func, select, text, union_all
from sqlalchemy.orm import Session

from apps.media.backend.models import CatalogItem, Experience, UserEntry
from apps.server.errors import APIError
from apps.server.town.constants import MEDIA_FINISHED_KINDS
from apps.server.town.models import Habit, HabitCheckin
from apps.travel.backend.models import Stay, Trip

INVALID_TZ_MESSAGE = "Your time zone wasn't recognized."
INVALID_RANGE_MESSAGE = "That range of weeks isn't available."

# Same zone-name pattern packages/time/today.py uses (read there; its private
# name is not imported and that module is not edited).
_ZONE_NAME = re.compile(r"^[A-Za-z0-9_+-]{1,64}(?:/[A-Za-z0-9_+-]{1,64}){0,2}$")

MAX_WEEKS = 26
DEFAULT_WEEKS = 25
START_WEEK_FLOOR_WEEKS = 519
FINISHED_CAP = 50

_habits = Habit.__table__
_checkins = HabitCheckin.__table__
_trips = Trip.__table__
_stays = Stay.__table__
_entries = UserEntry.__table__
_catalog = CatalogItem.__table__
_experiences = Experience.__table__

# Tables the W3a content reads need. The unified database carries every
# domain's tables once migrated, but a partially built database (a
# single-domain test fixture, say) may not; missing content tables read as
# empty instead of erroring. One probe statement per request detects them.
_CONTENT_TABLES = frozenset({"trips", "stays", "user_entries", "catalog_items", "experiences"})


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


def _existing_content_tables(db: Session) -> frozenset[str]:
    names = db.execute(text("SELECT name FROM sqlite_master WHERE type = 'table'")).scalars()
    return _CONTENT_TABLES.intersection(names)


def _earliest_candidate(db: Session, user_id: int, content_tables: frozenset[str]) -> date | None:
    """Earliest start_week candidate across habits, trips and finished media.

    One statement: the minimum over a union of per-source minima, so sources
    whose tables are absent contribute no branch. W3a adds the trips and
    finished branches to W2a's habits minimum.
    """
    parts = [select(func.min(_habits.c.created_on).label("v")).where(_habits.c.user_id == user_id)]
    if "trips" in content_tables:
        parts.append(
            select(func.min(_trips.c.start_date).label("v")).where(
                _trips.c.user_id == user_id,
                _trips.c.status.in_(("booked", "done")),
            )
        )
    if {"user_entries", "catalog_items"} <= content_tables:
        parts.append(
            select(func.min(_entries.c.completed_on).label("v"))
            .join(_catalog, _entries.c.catalog_id == _catalog.c.id)
            .where(
                _entries.c.user_id == user_id,
                _entries.c.status == "completed",
                _entries.c.completed_on.is_not(None),
                _catalog.c.kind.in_(MEDIA_FINISHED_KINDS),
            )
        )
    if {"user_entries", "catalog_items", "experiences"} <= content_tables:
        parts.append(
            select(func.min(_experiences.c.finished_on).label("v"))
            .join(_entries, _experiences.c.entry_id == _entries.c.id)
            .join(_catalog, _entries.c.catalog_id == _catalog.c.id)
            .where(
                _experiences.c.user_id == user_id,
                _entries.c.user_id == user_id,
                _experiences.c.finished_on.is_not(None),
                _catalog.c.kind.in_(MEDIA_FINISHED_KINDS),
            )
        )
    union = union_all(*parts).subquery()
    return db.execute(select(func.min(union.c.v))).scalar_one()


def _place_label(city: str | None, region: str | None, country: str | None) -> str:
    """WG-15 interim: strip each part, drop the empties, join with ", "."""
    parts = [part.strip() for part in (city, region, country) if part and part.strip()]
    return ", ".join(parts)


def _place_for(stays: list, week: date) -> dict | None:
    """The week's place for one trip: the first stay overlapping the week,
    else the trip's first stay (stays arrive ordered by
    (arrive_on, sort_order, id)); no stays -> None."""
    if not stays:
        return None
    week_end = week + timedelta(days=6)
    chosen = next(
        (stay for stay in stays if stay.arrive_on <= week_end and stay.leave_on >= week),
        stays[0],
    )
    return {
        "label": _place_label(chosen.city, chosen.region, chosen.country),
        "lat_e2": round(chosen.lat * 100) if chosen.lat is not None else None,
    }


def read_trips(db: Session, user_id: int, from_: date, to_end: date) -> list:
    """Booked/done trips overlapping the range, each with its stays.

    Two statements regardless of row counts; stays are read once for all
    trips, joined through trips so another owner's stay can never label
    this owner's trip (stays carry no user_id of their own).
    """
    trip_rows = db.execute(
        select(_trips.c.id, _trips.c.title, _trips.c.start_date, _trips.c.end_date)
        .where(
            _trips.c.user_id == user_id,
            _trips.c.status.in_(("booked", "done")),
            _trips.c.end_date >= from_,
            _trips.c.start_date <= to_end,
        )
        .order_by(_trips.c.start_date, _trips.c.id)
    ).all()
    trip_ids = [row.id for row in trip_rows]
    stay_rows = db.execute(
        select(
            _stays.c.trip_id,
            _stays.c.city,
            _stays.c.region,
            _stays.c.country,
            _stays.c.arrive_on,
            _stays.c.leave_on,
            _stays.c.lat,
        )
        .join(_trips, _stays.c.trip_id == _trips.c.id)
        .where(
            _trips.c.user_id == user_id,
            _stays.c.trip_id.in_(trip_ids) if trip_ids else false(),
        )
        .order_by(_stays.c.arrive_on, _stays.c.sort_order, _stays.c.id)
    ).all()
    stays_by_trip: dict[int, list] = {}
    for row in stay_rows:
        stays_by_trip.setdefault(row.trip_id, []).append(row)
    return [(row, stays_by_trip.get(row.id, [])) for row in trip_rows]


def read_finished(db: Session, user_id: int, from_: date, to_end: date, today: date) -> list[dict]:
    """Finished media in range: completed entries (TB1's completed_on) union
    experiences, deduped on (entry_id, on), ordered (on, entry_id).

    One statement (a UNION ALL of the two sources). Only the finished kinds
    (movie/tv/book/game) appear; track/album/artist never do.
    """

    def _window(column):
        return (
            column.is_not(None),
            column >= from_,
            column <= to_end,
            column <= today,
            _catalog.c.kind.in_(MEDIA_FINISHED_KINDS),
        )

    by_entry = (
        select(
            _entries.c.id.label("entry_id"),
            _catalog.c.kind.label("kind"),
            _catalog.c.title.label("title"),
            _entries.c.completed_on.label("on"),
        )
        .join(_catalog, _entries.c.catalog_id == _catalog.c.id)
        .where(
            _entries.c.user_id == user_id,
            _entries.c.status == "completed",
            *_window(_entries.c.completed_on),
        )
    )
    by_experience = (
        select(
            _entries.c.id.label("entry_id"),
            _catalog.c.kind.label("kind"),
            _catalog.c.title.label("title"),
            _experiences.c.finished_on.label("on"),
        )
        .join(_entries, _experiences.c.entry_id == _entries.c.id)
        .join(_catalog, _entries.c.catalog_id == _catalog.c.id)
        .where(
            _experiences.c.user_id == user_id,
            _entries.c.user_id == user_id,
            *_window(_experiences.c.finished_on),
        )
    )
    rows = db.execute(union_all(by_entry, by_experience)).all()
    deduped: dict[tuple[int, date], dict] = {}
    for row in rows:
        deduped.setdefault(
            (row.entry_id, row.on),
            {"entry_id": row.entry_id, "kind": row.kind, "title": row.title, "on": row.on},
        )
    return sorted(deduped.values(), key=lambda item: (item["on"], item["entry_id"]))


def read_world(db: Session, user_id: int, today: date, from_: date, to: date) -> dict:
    """Build the WorldResponse payload (as plain dicts) for one owner."""
    current_week = monday_of(today)

    content_tables = _existing_content_tables(db)
    earliest = _earliest_candidate(db, user_id, content_tables)
    candidates = [earliest] if earliest is not None else []
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

    habit_ids = sorted({row.habit_id for row in rows})
    habit_rows = (
        db.execute(
            select(
                _habits.c.id,
                _habits.c.name,
                _habits.c.building_style,
                _habits.c.archived_at,
            ).where(_habits.c.id.in_(habit_ids))
        ).all()
        if habit_ids
        else []
    )
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

    trips_by_week: dict[date, list[dict]] = {}
    if {"trips", "stays"} <= content_tables:
        for trip, stays in read_trips(db, user_id, from_, to_end):
            week = monday_of(max(trip.start_date, from_))
            last_week = monday_of(min(trip.end_date, to_end))
            while week <= last_week:
                trips_by_week.setdefault(week, []).append(
                    {
                        "id": trip.id,
                        "title": trip.title,
                        "start": trip.start_date,
                        "end": trip.end_date,
                        "place": _place_for(stays, week),
                    }
                )
                week += timedelta(weeks=1)

    finished_by_week: dict[date, list[dict]] = {}
    if {"user_entries", "catalog_items", "experiences"} <= content_tables:
        for item in read_finished(db, user_id, from_, to_end, today):
            finished_by_week.setdefault(monday_of(item["on"]), []).append(item)

    weeks = []
    week_starts = sorted(set(days_by_week_habit) | set(trips_by_week) | set(finished_by_week))
    for week in week_starts:
        habits = [
            {**habits_by_id[habit_id], "days": days_by_week_habit[week][habit_id]}
            for habit_id in sorted(days_by_week_habit.get(week, {}))
            if habit_id in habits_by_id
        ]
        finished = finished_by_week.get(week, [])
        week_payload: dict = {
            "week": week,
            "trips": trips_by_week.get(week, []),
            "finished": finished[:FINISHED_CAP],
            "habits": habits,
            "concepts": [],
        }
        if len(finished) > FINISHED_CAP:
            week_payload["finished_more"] = len(finished) - FINISHED_CAP
        weeks.append(week_payload)
    return {"meta": meta, "weeks": weeks}
