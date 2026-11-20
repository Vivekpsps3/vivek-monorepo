"""Named trip memories projected from saved trips.

There is no memory table. Spans and destination cities come from the trip and
its stays. Town credit follows the same rule as the Inn: a booked or completed
trip credits the day after it ends only when it was logged on or before that
end. See the trip query in ``apps/server/town/service.py``. A planned trip and
a late log do not credit. Pixels still counts every civil day of the span.
"""

from __future__ import annotations

from datetime import UTC, date, datetime, timedelta
from typing import Any
from zoneinfo import ZoneInfo

from sqlalchemy import func
from sqlalchemy.orm import Session, selectinload

from apps.travel.backend.models import Stay, Trip
from apps.travel.backend.services.dates import span_days

MEMORY_CAP = 50

_MONTHS = (
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
)

_MARKS = {
    "planning": ("planned", "Planned"),
    "booked": ("booked", "Booked"),
    "done": ("completed", "Completed"),
}

DIFFERENCES: tuple[dict[str, str], ...] = (
    {
        "id": "trip-span-versus-credit",
        "text": (
            "Pixels counts each civil day a trip spans. "
            "Town credits a booked or completed trip once, on the day after it ends, "
            "and only when the trip was logged on or before that last day."
        ),
    },
    {
        "id": "planned-versus-completed",
        "text": (
            "A planned trip is not a completed souvenir and does not earn Town credit. "
            "Booking or completing a trip can. Canceling marks the trip planned and removes that credit."
        ),
    },
    {
        "id": "world-versus-saved-place",
        "text": (
            "The place is a saved destination city. A missing city stays missing. "
            "World scenery is not a map of the trip."
        ),
    },
)


def _day(value: date) -> str:
    return f"{_MONTHS[value.month - 1]} {value.day}, {value.year}"


def _span(start: date, end: date) -> str:
    if start == end:
        return _day(start)
    return f"{_day(start)} through {_day(end)}"


def _count(days: int) -> str:
    if days == 1:
        return "1 day"
    return f"{days} days"


def _join(names: list[str]) -> str:
    if not names:
        return ""
    if len(names) == 1:
        return names[0]
    if len(names) == 2:
        return f"{names[0]} and {names[1]}"
    return ", ".join(names[:-1]) + f", and {names[-1]}"


def _logged_on(created_at: datetime | None, zone: ZoneInfo) -> date | None:
    """Civil day of ``created_at`` in the request zone. Naive values are UTC."""
    if created_at is None:
        return None
    instant = created_at if created_at.tzinfo is not None else created_at.replace(tzinfo=UTC)
    return instant.astimezone(zone).date()


def _cities(stays: list[Stay]) -> list[str]:
    ordered = sorted(stays, key=lambda stay: (stay.sort_order, stay.arrive_on, stay.id))
    names: list[str] = []
    seen: set[str] = set()
    for stay in ordered:
        city = stay.city.strip()
        if not city or city in seen:
            continue
        seen.add(city)
        names.append(city)
    return names


def _credit(status: str, end: date, logged: date | None) -> date | None:
    if status not in ("booked", "done"):
        return None
    if logged is None or logged > end:
        return None
    return end + timedelta(days=1)


def _credit_text(
    status: str,
    start: date,
    end: date,
    logged: date | None,
    credit: date | None,
) -> str:
    span = _span(start, end)
    if status == "planning":
        return (
            "This trip is planned. Town does not credit a planned trip. "
            f"The span is {span}. "
            "A booked or completed trip can credit the day after it ends."
        )
    if status not in ("booked", "done"):
        return (
            f"This trip is {status or 'unspecified'}. "
            "Town credits a booked or completed trip, not this status. "
            f"The span stays {span}."
        )
    if logged is None:
        return f"This trip has no logged time, so Town does not credit it. The span stays {span}."
    if credit is None and logged > end:
        return (
            f"Logged on {_day(logged)}, after this trip ended on {_day(end)}. "
            f"Town does not credit it. The span stays {span}."
        )
    if credit is None:
        return f"Town does not credit this trip. The span stays {span}."
    kind = "completed" if status == "done" else "booked"
    return (
        f"Town credits this {kind} trip once on {_day(credit)}, the day after it ends. "
        f"That credit date is separate from the span {span}."
    )


def _prepare(row: Trip, zone: ZoneInfo) -> dict[str, Any]:
    start = row.start_date
    end = row.end_date
    days = span_days(start, end) if end >= start else 0
    logged = _logged_on(row.created_at, zone)
    credit = _credit(row.status, end, logged) if end >= start else None
    mark, mark_label = _MARKS.get(
        row.status, (row.status or "unspecified", row.status or "Unspecified")
    )
    return {
        "trip_id": int(row.id),
        "title": row.title,
        "status": row.status,
        "mark": mark,
        "mark_label": mark_label,
        "span_start": start,
        "span_end": end,
        "span_days": days,
        "destinations": _cities(list(row.stays)),
        "logged": logged,
        "credit": credit,
    }


def _overlaps(left: dict[str, Any], right: dict[str, Any]) -> bool:
    return bool(left["span_start"] <= right["span_end"] and right["span_start"] <= left["span_end"])


def _public(item: dict[str, Any], overlaps: list[dict[str, Any]]) -> dict[str, Any]:
    start: date = item["span_start"]
    end: date = item["span_end"]
    logged: date | None = item["logged"]
    credit: date | None = item["credit"]
    names: list[str] = item["destinations"]
    span = _span(start, end)
    shared = _join([other["title"] for other in overlaps])
    pixels = f"Pixels counts each civil day from {_day(start)} through {_day(end)} ({_count(item['span_days'])})."
    if shared:
        pixels += f" Shared days with {shared} stay on each trip."
    if names:
        world = (
            f"The place is the saved destination {_join(names)}. "
            "World scenery is not a map of this trip."
        )
    else:
        world = "No saved destination. This memory does not invent a place."
    overlap_rows = [
        {
            "trip_id": other["trip_id"],
            "title": other["title"],
            "span_text": _span(other["span_start"], other["span_end"]),
        }
        for other in overlaps
    ]
    if not overlap_rows:
        overlap_text = "No saved trip overlaps this span."
    else:
        parts = [f"{row['title']} ({row['span_text']})" for row in overlap_rows]
        overlap_text = f"Overlaps {_join(parts)}. Both spans stay."
    logged_text = f"Logged on {_day(logged)}." if logged is not None else "No logged time."
    return {
        "id": f"trip:{item['trip_id']}",
        "trip_id": item["trip_id"],
        "title": item["title"],
        "status": item["status"],
        "mark": item["mark"],
        "mark_label": item["mark_label"],
        "span_start": start.isoformat(),
        "span_end": end.isoformat(),
        "span_days": item["span_days"],
        "span_text": span,
        "destinations": names,
        "credit_date": credit.isoformat() if credit is not None else None,
        "credit_eligible": credit is not None,
        "credit_text": _credit_text(item["status"], start, end, logged, credit),
        "pixels_text": pixels,
        "world_text": world,
        "logged_on": logged.isoformat() if logged is not None else None,
        "logged_text": logged_text,
        "overlaps": overlap_rows,
        "overlap_text": overlap_text,
        "route": f"/travel/trips/{item['trip_id']}",
    }


def project_memories(db: Session, user_id: int, zone: ZoneInfo, zone_name: str) -> dict[str, Any]:
    """Newest return dates first, capped. Overlaps are among the trips in this list."""
    total = int(db.query(func.count(Trip.id)).filter(Trip.user_id == user_id).scalar() or 0)
    rows = (
        db.query(Trip)
        .filter(Trip.user_id == user_id)
        .options(selectinload(Trip.stays))
        .order_by(Trip.end_date.desc(), Trip.id.desc())
        .limit(MEMORY_CAP)
        .all()
    )
    prepared = [_prepare(row, zone) for row in rows]
    memories = []
    for item in prepared:
        overlaps = [
            other
            for other in prepared
            if other["trip_id"] != item["trip_id"] and _overlaps(item, other)
        ]
        overlaps.sort(key=lambda other: int(other["trip_id"]))
        memories.append(_public(item, overlaps))
    included = len(memories)
    truncated = total > included
    notice = ""
    if truncated:
        notice = (
            f"Showing {included} of {total} trips, newest return dates first. "
            "Older trips stay on their records."
        )
    return {
        "source": "trips",
        "zone": zone_name,
        "cap": MEMORY_CAP,
        "total": total,
        "included": included,
        "truncated": truncated,
        "notice": notice,
        "differences": [dict(item) for item in DIFFERENCES],
        "memories": memories,
    }
