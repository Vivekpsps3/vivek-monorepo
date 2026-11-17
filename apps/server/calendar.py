"""Read-only ICS composition over the existing saved Travel and Media calendars."""

import hashlib
import json
import re
from datetime import UTC, date, datetime, time, timedelta
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session
from starlette.responses import Response

from apps.media.backend.services.calendar import build_calendar, next_month
from apps.server.database import get_db
from apps.server.identity.calendar_feeds import token_hash
from apps.server.identity.models import CalendarFeed, User
from apps.server.rate_limit import enforce_calendar_feed_limit
from apps.travel.backend.services.assemble import build_summary

router = APIRouter()


def feed_today(zone: str) -> date:
    return datetime.now(ZoneInfo(zone)).date()


def escape_text(value: str) -> str:
    value = value.replace("\r\n", "\n").replace("\r", "\n")
    value = "".join(
        char for char in value if char == "\n" or (ord(char) >= 32 and ord(char) != 127)
    )
    return value.replace("\\", "\\\\").replace(";", "\\;").replace(",", "\\,").replace("\n", "\\n")


def fold(line: str) -> str:
    """RFC 5545: at most 75 octets per physical line, never split UTF-8."""
    parts = []
    current = ""
    size = 0
    for char in line:
        count = len(char.encode("utf-8"))
        if size + count > 75:
            parts.append(current)
            current, size = " ", 1
        current += char
        size += count
    parts.append(current)
    return "\r\n".join(parts)


def calendar_events(db: Session, feed: CalendarFeed, today: date) -> list[dict]:
    # One recent week and five upcoming weeks, inclusive. No client-controlled range.
    start, end = today - timedelta(days=7), today + timedelta(days=34)
    events = []
    if feed.scope == "travel":
        summary = build_summary(
            db, today=today, user_id=feed.user_id, start=start, end=end, limit=None
        )
        for row in summary["up_next"]:
            point = row["date"]
            local_time = row["time"]
            if local_time:
                try:
                    zone = ZoneInfo(row["tz"] or feed.timezone)
                except (ZoneInfoNotFoundError, ValueError, OSError):
                    zone = ZoneInfo(feed.timezone)
                moment = datetime.combine(point, time.fromisoformat(local_time), zone).astimezone(
                    UTC
                )
                when = "DTSTART:" + moment.strftime("%Y%m%dT%H%M%SZ")
            else:
                when = "DTSTART;VALUE=DATE:" + point.strftime("%Y%m%d")
            events.append(
                {"key": f"travel:{row['kind']}:{row['id']}", "when": when, "title": row["title"]}
            )
    else:
        month = start.replace(day=1)
        while month <= end:
            calendar = build_calendar(db, feed.user_id, month.strftime("%Y-%m"), tz=feed.timezone)
            for day in calendar["days"]:
                point = date.fromisoformat(day["date"])
                if not start <= point <= end:
                    continue
                for item in day["events"]:
                    # The saved calendar's uncertain month/year bands never get invented dates.
                    if item["watched"] or item["precision"] != "day":
                        continue
                    # Distinguish multiple saved release dates for one movie.
                    identity = item["short"] if item["type"] == "episode" else point.isoformat()
                    source = item["entry_id"] or item["short"] or item["title"]
                    key = f"media:{item['type']}:{source}:{identity}"
                    title = " · ".join(
                        str(value) for value in (item["detail"], item["title"]) if value
                    )
                    events.append(
                        {
                            "key": key,
                            "when": "DTSTART;VALUE=DATE:" + point.strftime("%Y%m%d"),
                            "title": title,
                        }
                    )
            month = next_month(month)
    if len(events) > 1000:
        raise HTTPException(
            status_code=503,
            detail="Calendar has too many dated events. Try again after reducing the source calendar.",
        )
    return sorted(events, key=lambda row: (row["when"], row["key"]))


def render_calendar(events: list[dict], feed_id: int, stamp: datetime) -> str:
    lines = [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "PRODID:-//Personal Suite//Calendar//EN",
        "CALSCALE:GREGORIAN",
    ]
    for event in events:
        uid = hashlib.sha256(f"{feed_id}:{event['key']}".encode()).hexdigest()
        lines.extend(
            [
                "BEGIN:VEVENT",
                f"UID:{uid}@personal-suite",
                "DTSTAMP:" + stamp.strftime("%Y%m%dT%H%M%SZ"),
                event["when"],
                "SUMMARY:" + escape_text(event["title"]),
                "END:VEVENT",
            ]
        )
    lines.append("END:VCALENDAR")
    return "\r\n".join(fold(line) for line in lines) + "\r\n"


@router.get("/calendar/feed.ics", name="calendar_feed")
def calendar_feed(request: Request, db: Session = Depends(get_db, scope="function")):
    # Parse manually: validation/exception payloads must never echo a capability.
    token = request.query_params.get("token", "")
    hashed = token_hash(token)
    enforce_calendar_feed_limit(request, hashed)
    if request.url.scheme != "https" or not re.fullmatch(r"[A-Za-z0-9_-]{43}", token):
        raise HTTPException(status_code=404, detail="Calendar subscription not found")
    feed = (
        db.query(CalendarFeed)
        .join(User, User.id == CalendarFeed.user_id)
        .filter(CalendarFeed.token_hash == hashed, User.is_active.is_(True))
        .first()
    )
    if feed is None:
        raise HTTPException(status_code=404, detail="Calendar subscription not found")
    events = calendar_events(db, feed, feed_today(feed.timezone))
    # A weak validator excludes serialization-time DTSTAMP. Reauthorize on every 304.
    digest = hashlib.sha256(json.dumps([feed.id, events], sort_keys=True).encode()).hexdigest()
    etag = f'W/"{digest}"'
    headers = {
        "Cache-Control": "private, no-cache",
        "ETag": etag,
        "X-Robots-Tag": "noindex, nofollow",
    }
    if any(
        value.strip().removeprefix("W/") in {"*", etag.removeprefix("W/")}
        for value in request.headers.get("if-none-match", "").split(",")
    ):
        return Response(status_code=304, headers=headers)
    return Response(
        render_calendar(events, feed.id, datetime.now(UTC)),
        media_type="text/calendar; charset=utf-8",
        headers=headers,
    )
