"""GET /api/pixels — owner-scoped Life in Pixels aggregates (PB2).

Three sources, each failure-isolated: a source whose table is missing
reports `absent`, one whose query raises reports `unavailable`, and neither
ever fails the response. Town counts habit check-ins (G3: one row per
check-in, `habit_checkins.day`); Town Health is not a channel (G7). Media
counts episodes by `episode_progress.watched_on`. Travel counts every day
of every trip overlapping the range (G4: TripStatus on main is
planning|booked|done — there is no cancelled status, so all trips count).
No Finance data exists server-side, so no Finance keys ever appear.
"""

import re
from datetime import date, timedelta
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import JSONResponse
from sqlalchemy import inspect, text
from sqlalchemy.orm import Session

from apps.server.database import get_db
from apps.server.identity.models import User
from apps.server.identity.session import get_current_user
from apps.server.pixels.schemas import PixelDay, PixelProfile, PixelSources, PixelsResponse

router = APIRouter(tags=["pixels"])

_FULL_ISO_DATE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
MAX_DAYS_PLAIN = 400
MAX_DAYS_PROFILE = 36_525

_TOWN_TABLE = "habit_checkins"
_MEDIA_TABLE = "episode_progress"
_TRAVEL_TABLE = "trips"


def _parse_day(raw: str, field: str) -> date:
    if _FULL_ISO_DATE.fullmatch(raw) is None:
        raise HTTPException(status_code=422, detail=f"Enter a full date for '{field}'.")
    try:
        return date.fromisoformat(raw)
    except ValueError:
        raise HTTPException(status_code=422, detail=f"Enter a real date for '{field}'.") from None


def _table_present(db: Session, table: str) -> bool:
    return inspect(db.get_bind()).has_table(table)


def _grouped_counts(db: Session, table: str, day_column: str, user_id: int, start: date, end: date) -> dict[date, int]:
    rows = db.execute(
        text(
            f"SELECT {day_column} AS d, COUNT(*) AS n FROM {table} "
            f"WHERE user_id = :me AND {day_column} >= :start AND {day_column} <= :end "
            f"GROUP BY {day_column}"
        ),
        {"me": user_id, "start": start.isoformat(), "end": end.isoformat()},
    ).all()
    return {row.d if isinstance(row.d, date) else date.fromisoformat(str(row.d)): int(row.n) for row in rows}


def _earliest(db: Session, table: str, day_column: str, user_id: int) -> date | None:
    value = db.execute(
        text(f"SELECT MIN({day_column}) AS d FROM {table} WHERE user_id = :me"),
        {"me": user_id},
    ).scalar()
    if value is None:
        return None
    return value if isinstance(value, date) else date.fromisoformat(str(value))


def _counted_source(db: Session, table: str, day_column: str, user_id: int, start: date, end: date):
    """(status, per-day counts, earliest ever) for a single-day-column source."""
    try:
        if not _table_present(db, table):
            return "absent", {}, None
        counts = _grouped_counts(db, table, day_column, user_id, start, end)
        first = _earliest(db, table, day_column, user_id)
        return "ok", counts, first
    except Exception:
        db.rollback()
        return "unavailable", {}, None


def _travel_source(db: Session, user_id: int, start: date, end: date):
    """Trips contribute 1 to every day they overlap within the range."""
    try:
        if not _table_present(db, _TRAVEL_TABLE):
            return "absent", {}, None
        rows = db.execute(
            text(
                "SELECT start_date, end_date FROM trips "
                "WHERE user_id = :me AND end_date >= :start AND start_date <= :end"
            ),
            {"me": user_id, "start": start.isoformat(), "end": end.isoformat()},
        ).all()
        counts: dict[date, int] = {}
        for row in rows:
            first_day = row.start_date if isinstance(row.start_date, date) else date.fromisoformat(str(row.start_date))
            last_day = row.end_date if isinstance(row.end_date, date) else date.fromisoformat(str(row.end_date))
            day = max(first_day, start)
            last = min(last_day, end)
            while day <= last:
                counts[day] = counts.get(day, 0) + 1
                day += timedelta(days=1)
        first = _earliest(db, _TRAVEL_TABLE, "start_date", user_id)
        return "ok", counts, first
    except Exception:
        db.rollback()
        return "unavailable", {}, None


@router.get("/pixels", response_model=PixelsResponse)
def read_pixels(
    request: Request,
    db: Annotated[Session, Depends(get_db, scope="function")],
    current_user: Annotated[User, Depends(get_current_user)],
    from_: Annotated[str, Query(alias="from")],
    to: Annotated[str, Query()],
    profile: Annotated[str | None, Query()] = None,
) -> JSONResponse:
    start = _parse_day(from_, "from")
    end = _parse_day(to, "to")
    if start > end:
        raise HTTPException(status_code=422, detail="'from' must be on or before 'to'.")
    with_profile = profile == "1"
    limit = MAX_DAYS_PROFILE if with_profile else MAX_DAYS_PLAIN
    if (end - start).days > limit:
        raise HTTPException(
            status_code=422,
            detail=f"Range is longer than {limit} days.",
        )

    user_id = current_user.id
    town_status, town_counts, town_first = _counted_source(db, _TOWN_TABLE, "day", user_id, start, end)
    media_status, media_counts, media_first = _counted_source(db, _MEDIA_TABLE, "watched_on", user_id, start, end)
    travel_status, travel_counts, travel_first = _travel_source(db, user_id, start, end)

    merged: dict[date, dict[str, int]] = {}
    for counts, key in ((town_counts, "town"), (media_counts, "media"), (travel_counts, "trip")):
        for day, n in counts.items():
            if n > 0:
                merged.setdefault(day, {})[key] = n
    days = [
        PixelDay(date=day, **{key: merged[day].get(key) for key in ("town", "media", "trip")})
        for day in sorted(merged)
    ]
    firsts = [value for value in (town_first, media_first, travel_first) if value is not None]

    payload = PixelsResponse(
        from_=start,
        to=end,
        days=days,
        sources=PixelSources(town=town_status, media=media_status, travel=travel_status),
        first_activity_on=min(firsts) if firsts else None,
        profile=(
            PixelProfile(birthday=current_user.birthday, show_age=bool(current_user.pixels_show_age))
            if with_profile
            else None
        ),
    )
    body = payload.model_dump(by_alias=True, mode="json")
    # Sparse days: drop channels that are 0/absent instead of emitting nulls.
    body["days"] = [
        {key: value for key, value in day.items() if value is not None}
        for day in body["days"]
    ]
    if not with_profile:
        body.pop("profile", None)
    return JSONResponse(content=body, headers={"Cache-Control": "private, no-store"})
