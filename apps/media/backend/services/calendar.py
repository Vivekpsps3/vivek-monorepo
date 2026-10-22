"""A month of episodes, anticipated movies, and follow-ups of movies you watched.

A month or a year is never placed on the 1st. Follow-ups are not saved into the library.
"""

from datetime import date

import httpx
from sqlalchemy.orm import Session

from apps.media.backend.models import Episode, EpisodeProgress, Experience, Release, UserEntry
from apps.media.backend.services.clock import today
from apps.media.backend.services.followups import Budget, follow_ups, norm_title, refresh_show
from apps.media.backend.services.validate import fail
from apps.media.backend.services.when import public_release_on

TYPE_ORDER = {"episode": 0, "anticipated": 1, "sequel": 2, "spinoff": 3}
WATCHED_EXPERIENCES = {"watch", "rewatch"}


def build_calendar(db: Session, user_id: int, month_text: str | None, http: httpx.Client, tz: str | None = None) -> dict:
    current = today(tz)
    month = parse_month(month_text, current)
    budget = Budget()
    entries = (
        db.query(UserEntry)
        .filter(UserEntry.user_id == user_id)
        .all()
    )
    entries.sort(key=lambda entry: entry.id)
    experience_kinds = experience_kinds_for(db, user_id, entries)
    events = []
    for entry in entries:
        if entry.catalog.kind == "tv":
            refresh_show(db, entry.catalog, http, budget)
            events.extend(episode_events(db, entry, month))
        elif is_anticipated_movie(entry):
            events.extend(anticipated_events(db, entry))
    for entry in entries:
        if not is_watched_movie(entry, experience_kinds.get(entry.id, set())):
            continue
        for item in follow_ups(db, entry.catalog, http, budget):
            event = related_event(item, entry, find_library_movie(entries, item), experience_kinds)
            if event is not None:
                events.append(event)
    return pack(events, month, current, budget.partial)


def parse_month(value: str | None, current: date) -> date:
    if value is None or not str(value).strip():
        return date(current.year, current.month, 1)
    text = str(value).strip()
    if len(text) != 7 or text[4] != "-":
        fail("Month must look like 2026-10.")
    try:
        year = int(text[:4])
        month = int(text[5:7])
        if year < 1000 or year > 3000:
            fail("Month is out of range.")
        return date(year, month, 1)
    except ValueError:
        fail("Month must look like 2026-10.")


def experience_kinds_for(db: Session, user_id: int, entries: list[UserEntry]) -> dict[int, set[str]]:
    movie_ids = [entry.id for entry in entries if entry.catalog.kind == "movie"]
    if not movie_ids:
        return {}
    rows = (
        db.query(Experience)
        .filter(Experience.user_id == user_id, Experience.entry_id.in_(movie_ids))
        .all()
    )
    kinds: dict[int, set[str]] = {}
    for row in rows:
        kinds.setdefault(row.entry_id, set()).add(row.kind)
    return kinds


def is_anticipated_movie(entry: UserEntry) -> bool:
    return entry.catalog.kind == "movie" and (entry.anticipated or entry.status == "anticipating")


def is_watched_movie(entry: UserEntry, kinds: set[str]) -> bool:
    if entry.catalog.kind != "movie":
        return False
    if entry.status == "completed":
        return True
    return bool(kinds & WATCHED_EXPERIENCES)


def episode_events(db: Session, entry: UserEntry, month: date) -> list[dict]:
    start = date(month.year, month.month, 1)
    end = next_month(start)
    episodes = (
        db.query(Episode)
        .filter(Episode.catalog_id == entry.catalog_id, Episode.air_date >= start, Episode.air_date < end)
        .order_by(Episode.air_date, Episode.season_number, Episode.episode_number)
        .all()
    )
    if not episodes:
        return []
    progress = {
        row.episode_id: row
        for row in db.query(EpisodeProgress).filter(
            EpisodeProgress.user_id == entry.user_id,
            EpisodeProgress.episode_id.in_([episode.id for episode in episodes]),
        )
    }
    events = []
    for episode in episodes:
        mark = progress.get(episode.id)
        short = f"S{episode.season_number} E{episode.episode_number}"
        title = episode.title or short
        events.append({
            "type": "episode",
            "title": title,
            "short": short,
            "detail": entry.catalog.title,
            "because": None,
            "precision": "day",
            "release_status": "scheduled",
            "entry_id": entry.id,
            "watched": bool(mark and mark.watched),
            "_date": episode.air_date,
        })
    return events


def anticipated_events(db: Session, entry: UserEntry) -> list[dict]:
    releases = db.query(Release).filter(Release.catalog_id == entry.catalog_id).all()
    if not releases:
        return [movie_event(entry, "unknown", None, "unknown", None)]
    events = []
    seen = set()
    for release in releases:
        precision = release.precision if release.precision in {"day", "month", "year", "unknown"} else "unknown"
        anchor = release.released_on if precision in {"day", "month", "year"} else None
        if precision in {"day", "month", "year"} and anchor is None:
            precision = "unknown"
        key = (precision, anchor.isoformat() if anchor else "", release.status)
        if key in seen:
            continue
        seen.add(key)
        detail = "Postponed" if release.status == "postponed" else "Anticipated"
        events.append(movie_event(entry, "anticipated", anchor, precision, detail, release.status))
    return events


def movie_event(entry: UserEntry, kind: str, anchor: date | None, precision: str, detail: str | None, status: str | None = None) -> dict:
    return {
        "type": kind if kind != "unknown" else "anticipated",
        "title": entry.catalog.title,
        "short": entry.catalog.title,
        "detail": detail or "Anticipated",
        "because": None,
        "precision": "unknown" if kind == "unknown" else precision,
        "release_status": status or "unknown",
        "entry_id": entry.id,
        "watched": False,
        "_date": None if kind == "unknown" else anchor,
    }


def related_event(item: dict, source: UserEntry, match: UserEntry | None, experience_kinds: dict[int, set[str]]) -> dict | None:
    relation = item.get("relation")
    if relation not in {"sequel", "spinoff"}:
        return None
    title = item.get("title")
    if not isinstance(title, str) or not title.strip():
        return None
    title = title.strip()[:300]
    item_year = item.get("year") if isinstance(item.get("year"), int) else None
    if norm_title(title) == norm_title(source.catalog.title) and item_year == source.catalog.year:
        return None
    if match is not None and is_watched_movie(match, experience_kinds.get(match.id, set())):
        return None
    precision = item.get("precision") if item.get("precision") in {"day", "month", "year", "unknown"} else "unknown"
    anchor = None
    if precision in {"day", "month", "year"}:
        anchor = parse_anchor(item.get("released_on"))
        if anchor is None:
            precision = "unknown"
    label = "Spin-off" if relation == "spinoff" else "Sequel"
    return {
        "type": relation,
        "title": title,
        "short": title,
        "detail": label,
        "because": f"{label} of {source.catalog.title}",
        "precision": precision,
        "release_status": "scheduled",
        "entry_id": None if match is None else match.id,
        "watched": False,
        "_date": anchor,
    }


def parse_anchor(value) -> date | None:
    if not isinstance(value, str) or len(value) < 10:
        return None
    try:
        return date.fromisoformat(value[:10])
    except ValueError:
        return None


def find_library_movie(entries: list[UserEntry], item: dict) -> UserEntry | None:
    source = item.get("source")
    source_id = item.get("source_id")
    title = norm_title(item.get("title") or "") if isinstance(item.get("title"), str) else ""
    year = item.get("year") if isinstance(item.get("year"), int) else None
    if source and source_id:
        for entry in entries:
            catalog = entry.catalog
            if catalog.kind == "movie" and catalog.source == source and catalog.source_id == source_id:
                return entry
    for entry in entries:
        catalog = entry.catalog
        if catalog.kind == "movie" and norm_title(catalog.title) == title and catalog.year == year:
            return entry
    return None


def next_month(month: date) -> date:
    if month.month == 12:
        return date(month.year + 1, 1, 1)
    return date(month.year, month.month + 1, 1)


def bucket_for(event: dict, month: date, current: date):
    released = event.get("_date")
    precision = event.get("precision")
    if precision == "day" and isinstance(released, date) and (released.year, released.month) == (month.year, month.month):
        return ("day", released.isoformat())
    if precision == "month" and isinstance(released, date) and (released.year, released.month) == (month.year, month.month):
        return ("month",)
    if precision == "year" and isinstance(released, date) and released.year == month.year:
        return ("year",)
    if precision == "unknown" and (month.year, month.month) == (current.year, current.month):
        return ("unknown",)
    return None


def event_key(event: dict, bucket) -> tuple:
    if event["type"] == "episode":
        return ("episode", event.get("entry_id"), event.get("short"), bucket)
    return ("movie", norm_title(event["title"]), bucket)


def combine(preferred: dict, other: dict) -> dict:
    rank = {"spinoff": 0, "sequel": 1, "anticipated": 2, "episode": 3}
    if rank.get(other["type"], 9) < rank.get(preferred["type"], 9):
        preferred, other = other, preferred
    if not preferred.get("entry_id"):
        preferred["entry_id"] = other.get("entry_id")
    if not preferred.get("because"):
        preferred["because"] = other.get("because")
    if other.get("detail") == "Postponed":
        preferred["detail"] = "Postponed"
        preferred["release_status"] = "postponed"
    return preferred


def publish(event: dict) -> dict:
    released = event.get("_date") if isinstance(event.get("_date"), date) else None
    precision = event["precision"]
    return {
        "type": event["type"],
        "title": event["title"],
        "short": event["short"],
        "detail": event["detail"],
        "because": event.get("because"),
        "precision": precision,
        "on": released.isoformat() if precision == "day" and released else None,
        "release_on": public_release_on(precision, released),
        "release_status": event.get("release_status"),
        "entry_id": event.get("entry_id"),
        "watched": bool(event.get("watched")),
    }


def pack(events: list[dict], month: date, current: date, partial: bool) -> dict:
    grouped: dict[tuple, dict] = {}
    buckets = {}
    for event in events:
        bucket = bucket_for(event, month, current)
        if bucket is None:
            continue
        key = event_key(event, bucket)
        buckets[key] = bucket
        if key in grouped:
            grouped[key] = combine(grouped[key], event)
        else:
            grouped[key] = event
    days: dict[str, list] = {}
    month_band = []
    year_band = []
    unknown = []
    for key, event in grouped.items():
        public = publish(event)
        kind = buckets[key][0]
        if kind == "day":
            days.setdefault(buckets[key][1], []).append(public)
        elif kind == "month":
            month_band.append(public)
        elif kind == "year":
            year_band.append(public)
        else:
            unknown.append(public)
    day_rows = []
    for day, items in sorted(days.items()):
        items.sort(key=sort_key)
        day_rows.append({"date": day, "events": items})
    month_band.sort(key=sort_key)
    year_band.sort(key=sort_key)
    unknown.sort(key=sort_key)
    return {
        "month": f"{month.year:04d}-{month.month:02d}",
        "today": current.isoformat(),
        "partial": partial,
        "days": day_rows,
        "month_band": month_band,
        "year_band": year_band,
        "unknown": unknown,
    }


def sort_key(event: dict):
    return (TYPE_ORDER.get(event["type"], 9), (event.get("title") or "").lower(), event.get("short") or "")
