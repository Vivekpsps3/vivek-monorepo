"""Preview one supported flight calendar booking.

The preview reads a bounded VEVENT, its time zone, and its leg identity.
It does not write a trip, a draft, a return date, or a PTO charge, and it
does not call a schedule provider.
"""

from __future__ import annotations

import re
from datetime import datetime
from typing import Literal, TypedDict
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from sqlalchemy.orm import Session

from apps.travel.backend.models import Transport, Trip, TripDraft, TripDraftLeg

MAX_CALENDAR_BYTES = 32 * 1024
MALFORMED = "This file is not a readable calendar booking. Nothing was saved."
OVERSIZED = "This calendar is larger than 32 KB. Nothing was saved."
AMBIGUOUS_DEPARTURE = "The departure time has no single time zone. Nothing was saved."
AMBIGUOUS_ARRIVAL = "The arrival time has no single time zone. Nothing was saved."
UNSUPPORTED = "This calendar is not a supported flight booking. Nothing was saved."
REPEATING = "Repeating events are not a supported flight booking. Nothing was saved."
MULTIPLE = "This calendar has more than one event. Import one flight booking. Nothing was saved."
MISSING_IDENTITY = "This flight booking has no identity. Nothing was saved."
LONG_IDENTITY = "This booking identity is too long to save. Nothing was saved."
MISSING_DEPARTURE = "This flight booking has no departure time. Nothing was saved."
MISSING_ARRIVAL = "This flight booking has no arrival time. Nothing was saved."

_FLIGHT = re.compile(
    r"^(?:FLIGHT\s+)?([A-Z][A-Z0-9])\s*([0-9]{1,4})\s+([A-Z]{3})\s*[-/\u2013\u2014]\s*([A-Z]{3})$",
    re.IGNORECASE,
)
_ZONE = re.compile(r"[A-Za-z0-9_+-]+(?:/[A-Za-z0-9_+-]+)+")
_UID = re.compile(r"[A-Za-z0-9][A-Za-z0-9._:-]{0,39}")
_WALL = re.compile(r"(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})?")
Code = Literal["preview", "malformed", "oversized", "ambiguous_timezone", "unsupported"]


class Booking(TypedDict):
    uid: str
    number: str
    origin: str
    destination: str
    depart_at: str
    arrive_at: str
    depart_tz: str
    arrive_tz: str
    depart_label: str
    arrive_label: str


class ExistingLeg(TypedDict):
    kind: Literal["trip", "draft"]
    id: int
    title: str
    leg_id: int


class Preview(TypedDict):
    ok: bool
    code: Code
    reason: str
    booking: Booking | None
    existing: ExistingLeg | None


class _Prop(TypedDict):
    name: str
    params: list[tuple[str, str]]
    value: str


class _Node(TypedDict):
    name: str
    props: list[_Prop]
    children: list[_Node]


def _reject(code: Code, reason: str) -> Preview:
    return {"ok": False, "code": code, "reason": reason, "booking": None, "existing": None}


def _unfold(text: str) -> list[str]:
    logical: list[str] = []
    for line in text.split("\n"):
        if line.startswith((" ", "\t")) and logical:
            logical[-1] += line[1:]
        elif line != "":
            logical.append(line)
    return logical


def _split_colon(line: str) -> tuple[str, str]:
    escaped = False
    for index, char in enumerate(line):
        if escaped:
            escaped = False
            continue
        if char == "\\":
            escaped = True
            continue
        if char == ":":
            return line[:index], line[index + 1 :]
    raise ValueError(MALFORMED)


def _unquote(value: str) -> str:
    text = value.strip()
    if len(text) >= 2 and text[0] == text[-1] == '"':
        return text[1:-1]
    return text


def _unescape(value: str) -> str:
    result: list[str] = []
    escaped = False
    for char in value:
        if escaped:
            result.append("\n" if char in {"n", "N"} else char)
            escaped = False
            continue
        if char == "\\":
            escaped = True
            continue
        result.append(char)
    if escaped:
        result.append("\\")
    return "".join(result)


def _property(line: str) -> _Prop:
    raw_name, raw_value = _split_colon(line)
    parts = raw_name.split(";")
    params: list[tuple[str, str]] = []
    for part in parts[1:]:
        if "=" not in part:
            raise ValueError(MALFORMED)
        key, value = part.split("=", 1)
        params.append((key.upper(), _unquote(value)))
    return {"name": parts[0].upper(), "params": params, "value": _unescape(raw_value.strip())}


def _components(lines: list[str]) -> list[_Node]:
    root: _Node = {"name": "ROOT", "props": [], "children": []}
    stack: list[_Node] = [root]
    for line in lines:
        name, value = _split_colon(line)
        kind = name.split(";", 1)[0].upper()
        if kind == "BEGIN":
            node: _Node = {"name": value.strip().upper(), "props": [], "children": []}
            if not node["name"]:
                raise ValueError(MALFORMED)
            stack[-1]["children"].append(node)
            stack.append(node)
            continue
        if kind == "END":
            if len(stack) == 1 or stack[-1]["name"] != value.strip().upper():
                raise ValueError(MALFORMED)
            stack.pop()
            continue
        if len(stack) == 1:
            raise ValueError(MALFORMED)
        stack[-1]["props"].append(_property(line))
    if len(stack) != 1:
        raise ValueError(MALFORMED)
    return root["children"]


def _only(props: list[_Prop], name: str) -> _Prop | None:
    found = [prop for prop in props if prop["name"] == name]
    if len(found) > 1:
        raise ValueError(MALFORMED)
    return found[0] if found else None


def _single_zone(name: str) -> bool:
    if name == "UTC":
        return True
    if _ZONE.fullmatch(name) is None:
        return False
    try:
        ZoneInfo(name)
    except (ZoneInfoNotFoundError, ValueError):
        return False
    return True


def _clock(prop: _Prop, ambiguous: str) -> tuple[str, str] | Preview:
    values = [value.upper() for key, value in prop["params"] if key == "VALUE"]
    zones = [value for key, value in prop["params"] if key == "TZID"]
    raw = prop["value"].strip()
    if any(value == "DATE" for value in values) or re.fullmatch(r"\d{8}", raw):
        return _reject("unsupported", UNSUPPORTED)
    zulu = raw.endswith(("Z", "z"))
    if len(zones) > 1 or (zones and zulu):
        return _reject("ambiguous_timezone", ambiguous)
    if zulu:
        zone = "UTC"
        wall = raw[:-1]
    elif len(zones) == 1:
        zone = zones[0]
        if not _single_zone(zone):
            return _reject("ambiguous_timezone", ambiguous)
        wall = raw
    else:
        return _reject("ambiguous_timezone", ambiguous)
    match = _WALL.fullmatch(wall)
    if match is None:
        return _reject("malformed", MALFORMED)
    year, month, day, hour, minute, second = match.groups()
    second = second or "00"
    try:
        datetime(int(year), int(month), int(day), int(hour), int(minute), int(second))
    except ValueError:
        return _reject("malformed", MALFORMED)
    return f"{year}-{month}-{day}T{hour}:{minute}:{second}", zone


def _label(stamp: str, zone: str) -> str:
    day, clock = stamp.split("T", 1)
    hour, minute, second = clock.split(":")
    shown = f"{hour}:{minute}" if second == "00" else clock
    return f"{day} {shown} {zone}"


def _identity(uid: str) -> Preview | str:
    if len(uid) > 40:
        return _reject("unsupported", LONG_IDENTITY)
    if _UID.fullmatch(uid) is None:
        return _reject("malformed", MISSING_IDENTITY)
    return uid


def _flight_number(summary: str) -> tuple[str, str, str] | None:
    match = _FLIGHT.fullmatch(summary.strip())
    if match is None:
        return None
    airline, digits, origin, destination = match.groups()
    number = int(digits)
    if number <= 0:
        return None
    return f"{airline.upper()}{number}", origin.upper(), destination.upper()


def parse_calendar(text: str) -> Preview:
    """Return a preview or a rejection. Neither result is a saved trip."""

    if not isinstance(text, str):
        return _reject("malformed", MALFORMED)
    normalized = text.replace("\r\n", "\n").replace("\r", "\n")
    if normalized.startswith("\ufeff"):
        normalized = normalized[1:]
    if len(normalized.encode("utf-8")) > MAX_CALENDAR_BYTES:
        return _reject("oversized", OVERSIZED)
    if "\x00" in normalized:
        return _reject("malformed", MALFORMED)
    try:
        nodes = _components(_unfold(normalized))
    except ValueError:
        return _reject("malformed", MALFORMED)
    if len(nodes) != 1 or nodes[0]["name"] != "VCALENDAR":
        return _reject("malformed", MALFORMED)
    calendar = nodes[0]
    events = [child for child in calendar["children"] if child["name"] == "VEVENT"]
    extras = [
        child for child in calendar["children"] if child["name"] not in {"VEVENT", "VTIMEZONE"}
    ]
    if extras:
        return _reject("unsupported", UNSUPPORTED)
    if not events:
        return _reject("unsupported", UNSUPPORTED)
    if len(events) > 1:
        return _reject("unsupported", MULTIPLE)
    event = events[0]
    if any(child["name"] != "VALARM" for child in event["children"]):
        return _reject("unsupported", UNSUPPORTED)
    names = {prop["name"] for prop in event["props"]}
    if names.intersection({"RRULE", "RDATE", "EXDATE"}):
        return _reject("unsupported", REPEATING)
    try:
        version = _only(calendar["props"], "VERSION")
        summary = _only(event["props"], "SUMMARY")
        uid_prop = _only(event["props"], "UID")
        depart = _only(event["props"], "DTSTART")
        arrive = _only(event["props"], "DTEND")
    except ValueError:
        return _reject("malformed", MALFORMED)
    if version is not None and version["value"] != "2.0":
        return _reject("unsupported", UNSUPPORTED)
    if summary is None:
        return _reject("unsupported", UNSUPPORTED)
    flight = _flight_number(summary["value"])
    if flight is None:
        return _reject("unsupported", UNSUPPORTED)
    if uid_prop is None or not uid_prop["value"].strip():
        return _reject("malformed", MISSING_IDENTITY)
    identity = _identity(uid_prop["value"].strip())
    if not isinstance(identity, str):
        return identity
    if depart is None:
        return _reject("malformed", MISSING_DEPARTURE)
    if arrive is None:
        return _reject("malformed", MISSING_ARRIVAL)
    departure = _clock(depart, AMBIGUOUS_DEPARTURE)
    if isinstance(departure, dict):
        return departure
    arrival = _clock(arrive, AMBIGUOUS_ARRIVAL)
    if isinstance(arrival, dict):
        return arrival
    depart_at, depart_tz = departure
    arrive_at, arrive_tz = arrival
    number, origin, destination = flight
    booking: Booking = {
        "uid": identity,
        "number": number,
        "origin": origin,
        "destination": destination,
        "depart_at": depart_at,
        "arrive_at": arrive_at,
        "depart_tz": depart_tz,
        "arrive_tz": arrive_tz,
        "depart_label": _label(depart_at, depart_tz),
        "arrive_label": _label(arrive_at, arrive_tz),
    }
    return {"ok": True, "code": "preview", "reason": "", "booking": booking, "existing": None}


def find_existing(db: Session, user_id: int, uid: str) -> ExistingLeg | None:
    """The current owner's saved flight with this booking identity, if any."""

    trip_match = (
        db.query(Transport, Trip)
        .join(Trip, Transport.trip_id == Trip.id)
        .filter(
            Trip.user_id == user_id,
            Transport.mode == "flight",
            Transport.confirmation == uid,
        )
        .order_by(Trip.id, Transport.sort_order, Transport.id)
        .first()
    )
    if trip_match is not None:
        transport, trip = trip_match
        return {"kind": "trip", "id": trip.id, "title": trip.title, "leg_id": transport.id}
    draft_match = (
        db.query(TripDraftLeg, TripDraft)
        .join(TripDraft, TripDraftLeg.draft_id == TripDraft.id)
        .filter(
            TripDraft.user_id == user_id,
            TripDraftLeg.mode == "flight",
            TripDraftLeg.confirmation == uid,
        )
        .order_by(TripDraft.id, TripDraftLeg.sort_order, TripDraftLeg.id)
        .first()
    )
    if draft_match is None:
        return None
    leg, draft = draft_match
    return {"kind": "draft", "id": draft.id, "title": draft.title, "leg_id": leg.id}


def preview_booking(db: Session, user_id: int, text: str) -> Preview:
    """Parse and match. This function does not add, delete, or update rows."""

    parsed = parse_calendar(text)
    booking = parsed["booking"]
    if not parsed["ok"] or booking is None:
        return parsed
    parsed["existing"] = find_existing(db, user_id, booking["uid"])
    return parsed
