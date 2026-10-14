"""Calendar spans for a trip.

A trip covers every calendar date from the leave date through the return date,
inclusive. PTO defaults to the weekdays inside that same span.
"""

from datetime import date, timedelta


def iter_dates(start: date, end: date):
    if end < start:
        return
    day = start
    while day <= end:
        yield day
        day += timedelta(days=1)


def weekday_count(start: date, end: date) -> int:
    """Inclusive Monday–Friday count. Weekends contribute zero."""
    if end < start:
        raise ValueError("The return date has to be on or after the day you leave.")
    return sum(1 for day in iter_dates(start, end) if day.weekday() < 5)


def nights_away(start: date, end: date) -> int:
    if end < start:
        raise ValueError("The return date has to be on or after the day you leave.")
    return (end - start).days


def span_days(start: date, end: date) -> int:
    if end < start:
        raise ValueError("The return date has to be on or after the day you leave.")
    return (end - start).days + 1


def phase_for(start: date, end: date, today: date) -> str:
    if end < today:
        return "past"
    if start <= today <= end:
        return "in_progress"
    return "upcoming"


def ensure_stay_inside(trip_start: date, trip_end: date, arrive: date, leave: date) -> None:
    if leave < arrive:
        raise ValueError("The city departure has to be on or after the arrival.")
    if arrive < trip_start or leave > trip_end:
        raise ValueError(
            "City dates have to sit inside the trip, from the day you leave until the day you come back."
        )
