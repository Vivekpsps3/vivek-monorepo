"""Release timing. Month and year precision are never treated as a specific day."""

import os
from datetime import date


def today() -> date:
    raw = os.getenv("MEDIA_TODAY", "").strip()
    if raw:
        return date.fromisoformat(raw)
    return date.today()


def classify_release(
    precision: str | None, released_on: date | None, status: str | None, today_value: date
) -> str | None:
    """Return a when label, or None when the release should leave the upcoming list."""
    if (status or "").lower() == "postponed":
        return "postponed"
    precision = (precision or "unknown").lower()
    if precision not in ("day", "month", "year") or released_on is None:
        return "unknown"
    if precision == "day":
        delta = (released_on - today_value).days
        if delta == 0:
            return "today"
        if delta == 1:
            return "tomorrow"
        if 1 < delta <= 7:
            return "this_week"
        if delta > 7:
            return "upcoming"
        if -14 <= delta < 0:
            return "recent"
        return None
    if precision == "month":
        current = (today_value.year, today_value.month)
        target = (released_on.year, released_on.month)
        if target == current:
            return "this_month"
        if today_value.month == 1:
            previous = (today_value.year - 1, 12)
        else:
            previous = (today_value.year, today_value.month - 1)
        if target == previous:
            return "recent"
        if target > current:
            return "upcoming"
        return None
    if released_on.year >= today_value.year:
        return "upcoming"
    return None


def public_release_on(precision: str | None, released_on: date | None) -> str | None:
    """Serialize a release without pretending a month or year is a day."""
    if released_on is None or precision in (None, "", "unknown"):
        return None
    if precision == "year":
        return f"{released_on.year:04d}"
    if precision == "month":
        return f"{released_on.year:04d}-{released_on.month:02d}"
    return released_on.isoformat()


def episode_state(air_date: date | None, today_value: date) -> str:
    if air_date is None or air_date == today_value:
        return "next"
    if air_date > today_value:
        return "upcoming"
    return "aired"


def is_released(air_date: date | None, today_value: date) -> bool:
    return air_date is None or air_date <= today_value
