"""Derived Media and Travel keepsakes. Nothing here is stored."""

from __future__ import annotations

from datetime import date
from typing import Any
from zoneinfo import ZoneInfo

from sqlalchemy import literal, select, text, union_all
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from apps.media.backend.models import CatalogItem, Experience, UserEntry
from apps.server.town.constants import MEDIA_FINISHED_KINDS
from apps.server.town.service import _instant
from apps.travel.backend.models import Stay, Trip
from apps.travel.backend.services.memories import _credit, _logged_on

SHELF_CAP = 50

_KINDS = tuple(sorted(MEDIA_FINISHED_KINDS))
_KIND_WORD = {"book": "book", "movie": "movie", "tv": "TV show", "game": "game"}
_EPISODE = " A watched episode is a separate record and is not this keepsake."
_PROBE = ("user_entries", "catalog_items", "experiences", "trips", "stays")
_DIFFERENCES = (
    (
        "episode-versus-completion",
        "A watched episode stays an episode. It can count in Pixels and earn Town "
        "credit on watched_on. This shelf lists a completed book, movie, TV show, "
        "or game, or an experience finish. It does not list the episode.",
    ),
    (
        "planned-versus-credit",
        "A planned trip is not a souvenir. Town credits a booked or completed trip "
        "once, on the day after it ends, when it was logged on or before that end.",
    ),
    (
        "span-versus-credit",
        "The span is the saved start and end. Town credit is the day after the saved "
        "end. This shelf does not invent a return date or a PTO charge.",
    ),
    (
        "scenery-versus-place",
        "A saved destination city is the place. A missing city stays missing. "
        "Scenery is illustrative and is not a map.",
    ),
)

_entries = UserEntry.__table__
_catalog = CatalogItem.__table__
_experiences = Experience.__table__
_trips = Trip.__table__
_stays = Stay.__table__

if any(not kind.isalpha() for kind in _KINDS):
    raise RuntimeError("finished kinds")


def _differences() -> list[dict[str, str]]:
    return [{"id": item_id, "text": wording} for item_id, wording in _DIFFERENCES]


def _coverage(status: str, included: int, total: int) -> dict[str, object]:
    if status != "ok":
        return {"status": status, "included": 0, "total": 0, "truncated": False}
    return {
        "status": status,
        "included": included,
        "total": total,
        "truncated": total > included,
    }


def _as_date(value: object) -> date | None:
    if value is None:
        return None
    if isinstance(value, date):
        return value
    raw = str(value).strip()[:10]
    try:
        return date.fromisoformat(raw)
    except ValueError:
        return None


def _place_label(city: str | None, region: str | None, country: str | None) -> str:
    parts = [part.strip() for part in (city, region, country) if part and part.strip()]
    return ", ".join(parts)


def _probe(db: Session) -> set[str] | None:
    names = ", ".join(f"'{name}'" for name in _PROBE)
    try:
        rows = db.execute(
            text(f"SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ({names})")
        ).all()
    except SQLAlchemyError:
        db.rollback()
        return None
    return {str(row[0]) for row in rows}


def _media_note(kind: str, day: date, source: str) -> str:
    word = _KIND_WORD[kind]
    if source == "completed_on":
        return f"Completed {word} on {day.isoformat()}.{_EPISODE}"
    return f"Experience finish for this {word} on {day.isoformat()}.{_EPISODE}"


def _finished_select(source: str, user_id: int, today: date, on: date | None):
    if source == "completed_on":
        column = _entries.c.completed_on
        statement = (
            select(
                _entries.c.id.label("entry_id"),
                _catalog.c.kind.label("kind"),
                _catalog.c.title.label("title"),
                column.label("on"),
                literal(source).label("date_source"),
            )
            .join(_catalog, _entries.c.catalog_id == _catalog.c.id)
            .where(
                _entries.c.user_id == user_id,
                _entries.c.status == "completed",
                column.is_not(None),
                column <= today,
                _catalog.c.kind.in_(_KINDS),
            )
        )
    else:
        column = _experiences.c.finished_on
        statement = (
            select(
                _entries.c.id.label("entry_id"),
                _catalog.c.kind.label("kind"),
                _catalog.c.title.label("title"),
                column.label("on"),
                literal(source).label("date_source"),
            )
            .join(_entries, _experiences.c.entry_id == _entries.c.id)
            .join(_catalog, _entries.c.catalog_id == _catalog.c.id)
            .where(
                _experiences.c.user_id == user_id,
                _entries.c.user_id == user_id,
                column.is_not(None),
                column <= today,
                _catalog.c.kind.in_(_KINDS),
            )
        )
    if on is not None:
        statement = statement.where(column == on)
    return statement


def _media_rows(
    db: Session, user_id: int, today: date, on: date | None, tables: set[str]
) -> tuple[list[dict[str, Any]], int]:
    parts = [_finished_select("completed_on", user_id, today, on)]
    if "experiences" in tables:
        parts.append(_finished_select("finished_on", user_id, today, on))
    statement = parts[0] if len(parts) == 1 else union_all(*parts)
    chosen: dict[tuple[int, date], dict[str, Any]] = {}
    for row in db.execute(statement).all():
        day = _as_date(row.on)
        kind = str(row.kind)
        if day is None or kind not in MEDIA_FINISHED_KINDS:
            continue
        if on is not None and day != on:
            continue
        source = str(row.date_source)
        key = (int(row.entry_id), day)
        current = chosen.get(key)
        if current is not None and (
            current["date_source"] == "completed_on" or source != "completed_on"
        ):
            continue
        chosen[key] = {
            "id": f"finished:{key[0]}:{day.isoformat()}",
            "entry_id": key[0],
            "kind": kind,
            "title": str(row.title or ""),
            "on": day,
            "route": f"/media/item/{key[0]}",
            "note": _media_note(kind, day, source),
            "date_source": source,
        }
    ordered = sorted(chosen.values(), key=lambda item: (item["on"], item["entry_id"]), reverse=True)
    return ordered[:SHELF_CAP], len(ordered)


def _trip_note(mark: str, start: date, end: date, credit: date | None) -> str:
    span = f"{start.isoformat()} through {end.isoformat()}"
    if mark == "planned":
        return (
            "This trip is planned. It is not a souvenir. "
            f"The saved span is {span}. Town does not credit a planned trip."
        )
    if mark == "souvenir" and credit is not None:
        return (
            f"Town credits this trip once on {credit.isoformat()}, the day after it ends. "
            f"The saved span is {span}."
        )
    return f"Town does not credit this trip. The saved span stays {span}."


def _scenery(destinations: list[str], place: dict[str, Any] | None) -> str:
    if destinations:
        listed = ", ".join(destinations)
        return (
            f"The saved destination is {listed}. "
            "Scenery on this souvenir is illustrative. It is not a map of the trip."
        )
    if place is not None and place.get("lat_e2") is not None:
        return (
            "A saved latitude is on this trip. No destination city was saved. "
            "Scenery is illustrative. It is not a map of the trip."
        )
    return (
        "No saved destination. This souvenir does not invent a place. "
        "Scenery is illustrative. It is not a map of the trip."
    )


def _place(stay: Any) -> dict[str, Any] | None:
    city = str(stay.city or "").strip()
    lat = stay.lat
    lat_e2 = round(float(lat) * 100) if lat is not None else None
    if not city and lat_e2 is not None:
        return {"label": "", "lat_e2": lat_e2}
    label = _place_label(stay.city, stay.region, stay.country)
    if not label and lat_e2 is None:
        return None
    return {"label": label, "lat_e2": lat_e2}


def _fill(item: dict[str, Any], stays: list[Any]) -> None:
    destinations: list[str] = []
    seen: set[str] = set()
    for stay in stays:
        city = str(stay.city or "").strip()
        if not city or city in seen:
            continue
        seen.add(city)
        destinations.append(city)
    place = _place(stays[0]) if stays else None
    item["destinations"] = destinations
    item["place"] = place
    item["scenery"] = _scenery(destinations, place)


def _classify_trip(row: Any, zone: ZoneInfo, on: date | None) -> dict[str, Any] | None:
    start = _as_date(row.start_date)
    end = _as_date(row.end_date)
    if start is None or end is None or end < start:
        return None
    status = str(row.status or "")
    logged = _logged_on(_instant(row.created_at), zone)
    credit = _credit(status, end, logged)
    if status == "planning":
        mark = "planned"
    elif credit is not None:
        mark = "souvenir"
    else:
        mark = "ineligible"
    if on is not None:
        if mark == "souvenir":
            if credit != on:
                return None
        elif not (start <= on <= end):
            return None
    trip_id = int(row.id)
    if mark == "souvenir" and credit is not None:
        item_id = f"trip:{trip_id}:credit:{credit.isoformat()}"
    else:
        item_id = f"trip:{trip_id}:{mark}"
    return {
        "id": item_id,
        "trip_id": trip_id,
        "title": str(row.title or ""),
        "status": status,
        "mark": mark,
        "span_start": start,
        "span_end": end,
        "credit_date": credit if mark == "souvenir" else None,
        "credit_eligible": mark == "souvenir",
        "route": f"/travel/trips/{trip_id}",
        "note": _trip_note(mark, start, end, credit if mark == "souvenir" else None),
    }


def _travel_rows(
    db: Session, user_id: int, zone: ZoneInfo, on: date | None
) -> tuple[list[dict[str, Any]], list[dict[str, Any]], list[dict[str, Any]], dict[str, int]]:
    rows = db.execute(
        select(
            _trips.c.id,
            _trips.c.title,
            _trips.c.status,
            _trips.c.start_date,
            _trips.c.end_date,
            _trips.c.created_at,
        ).where(_trips.c.user_id == user_id)
    ).all()
    grouped: dict[str, list[dict[str, Any]]] = {"souvenir": [], "planned": [], "ineligible": []}
    for row in rows:
        item = _classify_trip(row, zone, on)
        if item is not None:
            grouped[item["mark"]].append(item)
    grouped["souvenir"].sort(key=lambda item: (item["credit_date"], item["trip_id"]), reverse=True)
    for mark in ("planned", "ineligible"):
        grouped[mark].sort(key=lambda item: (item["span_end"], item["trip_id"]), reverse=True)
    totals = {mark: len(items) for mark, items in grouped.items()}
    shown = {mark: items[:SHELF_CAP] for mark, items in grouped.items()}
    return shown["souvenir"], shown["planned"], shown["ineligible"], totals


def _attach_stays(db: Session, user_id: int, items: list[dict[str, Any]]) -> None:
    ids = [item["trip_id"] for item in items]
    stays: dict[int, list[Any]] = {trip_id: [] for trip_id in ids}
    if ids:
        stay_rows = db.execute(
            select(
                _stays.c.trip_id,
                _stays.c.city,
                _stays.c.region,
                _stays.c.country,
                _stays.c.lat,
            )
            .join(_trips, _stays.c.trip_id == _trips.c.id)
            .where(_trips.c.user_id == user_id, _stays.c.trip_id.in_(ids))
            .order_by(_stays.c.arrive_on, _stays.c.sort_order, _stays.c.id)
        ).all()
        for stay in stay_rows:
            stays.setdefault(int(stay.trip_id), []).append(stay)
    for item in items:
        _fill(item, stays.get(item["trip_id"], []))


def _empty_travel(status: str) -> dict[str, Any]:
    covered = _coverage(status, 0, 0)
    return {
        "status": status,
        "souvenirs": covered,
        "planned": covered,
        "ineligible": covered,
    }


def _payload(
    on: date | None,
    media_status: str,
    keepsakes: list[dict[str, Any]],
    media_total: int,
    travel_status: str,
    souvenirs: list[dict[str, Any]],
    planned: list[dict[str, Any]],
    ineligible: list[dict[str, Any]],
    totals: dict[str, int],
) -> dict[str, Any]:
    if travel_status == "ok":
        travel = {
            "status": "ok",
            "souvenirs": _coverage("ok", len(souvenirs), totals.get("souvenir", 0)),
            "planned": _coverage("ok", len(planned), totals.get("planned", 0)),
            "ineligible": _coverage("ok", len(ineligible), totals.get("ineligible", 0)),
        }
    else:
        travel = _empty_travel(travel_status)
        souvenirs, planned, ineligible = [], [], []
    if media_status != "ok":
        keepsakes = []
        media_total = 0
    return {
        "on": on,
        "cap": SHELF_CAP,
        "media": _coverage(media_status, len(keepsakes), media_total),
        "travel": travel,
        "keepsakes": keepsakes,
        "souvenirs": souvenirs,
        "planned": planned,
        "ineligible": ineligible,
        "differences": _differences(),
    }


def read_keepsakes(
    db: Session, user_id: int, zone_name: str, today: date, on: date | None
) -> dict[str, Any]:
    """Project one owner's finished media and trips. One probe, then one read each."""
    tables = _probe(db)
    if tables is None:
        return _payload(on, "unavailable", [], 0, "unavailable", [], [], [], {})
    zone = ZoneInfo(zone_name)
    media_status = "ok"
    keepsakes: list[dict[str, Any]] = []
    media_total = 0
    if not {"user_entries", "catalog_items"} <= tables:
        media_status = "absent"
    else:
        try:
            keepsakes, media_total = _media_rows(db, user_id, today, on, tables)
        except SQLAlchemyError:
            db.rollback()
            media_status = "unavailable"
    travel_status = "ok"
    souvenirs: list[dict[str, Any]] = []
    planned: list[dict[str, Any]] = []
    ineligible: list[dict[str, Any]] = []
    totals: dict[str, int] = {}
    if "trips" not in tables:
        travel_status = "absent"
    else:
        try:
            souvenirs, planned, ineligible, totals = _travel_rows(db, user_id, zone, on)
        except SQLAlchemyError:
            db.rollback()
            travel_status = "unavailable"
        else:
            shown = souvenirs + planned + ineligible
            if shown and "stays" not in tables:
                for item in shown:
                    _fill(item, [])
            elif shown:
                try:
                    _attach_stays(db, user_id, shown)
                except SQLAlchemyError:
                    db.rollback()
                    travel_status = "unavailable"
                    souvenirs, planned, ineligible, totals = [], [], [], {}
    return _payload(
        on,
        media_status,
        keepsakes,
        media_total,
        travel_status,
        souvenirs,
        planned,
        ineligible,
        totals,
    )
