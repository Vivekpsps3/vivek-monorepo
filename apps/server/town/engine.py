"""Pure Town math. Callers pass today; nothing here reads the clock or the database."""

from __future__ import annotations

import re
import unicodedata
from collections.abc import Iterable, Mapping, Sequence
from dataclasses import dataclass
from datetime import date, timedelta
from typing import Literal

from apps.server.errors import APIError
from apps.server.town.constants import (
    DAILY_CAP,
    HABIT_NAME_MAX,
    LOT_UNLOCK_LV,
    SLOT_DEFAULT_STYLE,
    XP,
)

CadenceKind = Literal["daily", "weekly"]
CadenceAction = Literal["insert", "update", "delete"]
CadenceRow = tuple[date, int]


@dataclass(frozen=True)
class PendingCadence:
    per_week: int
    effective_from: date


@dataclass(frozen=True)
class Cadence:
    per_week: int
    kind: CadenceKind
    pending: PendingCadence | None


@dataclass(frozen=True)
class CadenceChange:
    effective_from: date
    per_week: int
    action: CadenceAction


def level(xp: int, table: Sequence[int]) -> int:
    """Return the 1-based level: max i+1 among thresholds xp has reached."""
    reached = [index + 1 for index, threshold in enumerate(table) if xp >= threshold]
    if not reached:
        raise ValueError("xp is below every threshold")
    return max(reached)


def stage(level: int) -> int:
    """Return sprite stage 1 at Lv1, 2 at Lv2–Lv3, and 3 at Lv4 and above."""
    if level <= 1:
        return 1
    if level <= 3:
        return 2
    return 3


def level_progress(xp: int, table: Sequence[int]) -> tuple[int, int, int | None]:
    """Return (level, level_xp_start, next_level_xp). Next is None at max level."""
    current = level(xp, table)
    start = table[current - 1]
    nxt = table[current] if current < len(table) else None
    return current, start, nxt


def lots(town_level: int, occupied: Mapping[int, int]) -> tuple[dict[str, int | str | None], ...]:
    """Return the six habit lots. An occupied slot never relocks."""
    rows: list[dict[str, int | str | None]] = []
    for slot, unlock in enumerate(LOT_UNLOCK_LV):
        habit_id = occupied.get(slot)
        if habit_id is not None:
            state = "occupied"
        elif town_level >= unlock:
            state = "empty"
        else:
            state = "locked"
        rows.append(
            {
                "slot": slot,
                "unlock_level": unlock,
                "state": state,
                "habit_id": habit_id,
            }
        )
    return tuple(rows)


def cadence_kind(per_week: int) -> CadenceKind:
    """Return daily for 7 and weekly for 1..6. Any other value is a validation error."""
    if per_week == 7:
        return "daily"
    if 1 <= per_week <= 6:
        return "weekly"
    raise field_validation_error("per_week", PER_WEEK_ERROR)


def cadence_on(day: date, per_week: int, cadences: Iterable[CadenceRow] = ()) -> int:
    """Return the per_week of the latest cadence row on or before day, else the habit's."""
    chosen = per_week
    chosen_on: date | None = None
    for start, value in cadences:
        if start <= day and (chosen_on is None or start >= chosen_on):
            chosen = value
            chosen_on = start
    return chosen


def next_monday_after(today: date) -> date:
    """Return the Monday strictly after today."""
    ahead = (7 - today.weekday()) % 7
    if ahead == 0:
        ahead = 7
    return today + timedelta(days=ahead)


def plan_cadence_change(
    today: date,
    per_week: int,
    cadences: Iterable[CadenceRow],
    new_per_week: int,
) -> CadenceChange | None:
    """Return the next-Monday write, or None when that Monday already has this value.

    Setting per_week back to the value in effect this week deletes the pending
    Monday row instead of leaving a row that only repeats the current cadence.
    """
    cadence_kind(new_per_week)
    rows = tuple(cadences)
    effective = next_monday_after(today)
    has_monday = any(start == effective for start, _ in rows)
    if new_per_week == cadence_on(today, per_week, rows) and has_monday:
        return CadenceChange(effective, new_per_week, "delete")
    if new_per_week == cadence_on(effective, per_week, rows):
        return None
    action: CadenceAction = "update" if has_monday else "insert"
    return CadenceChange(effective, new_per_week, action)


def describe_cadence(
    today: date,
    per_week: int,
    cadences: Iterable[CadenceRow] = (),
) -> Cadence:
    """Return today's cadence and the earliest future row as pending."""
    rows = tuple(cadences)
    current = cadence_on(today, per_week, rows)
    future = [(start, value) for start, value in rows if start > today]
    pending = None
    if future:
        start, value = min(future)
        pending = PendingCadence(value, start)
    return Cadence(current, cadence_kind(current), pending)


def habit_xp(checkins: int, streak7_events: int) -> int:
    """Return 10 × check-ins + 10 × streak7 events."""
    return XP["manual"] * checkins + XP["streak7"] * streak7_events


def library_day(episodes: int, finished: int) -> int:
    """Return one local day's Library XP: min(cap, 5×episodes + 10×finished)."""
    raw = XP["mediaEpisode"] * episodes + XP["mediaFinished"] * finished
    return min(DAILY_CAP["library"], raw)


def inn_day(reminders: int, trips_done: int) -> int:
    """Return one local day's Inn XP: min(cap, 5×reminders) + 30×trips."""
    capped = min(DAILY_CAP["inn"], XP["travelReminder"] * reminders)
    return capped + XP["tripDone"] * trips_done


_WHITESPACE = re.compile(r"\s+")
NAME_CHARACTERS_ERROR = "Use letters, numbers and punctuation only."
NAME_LENGTH_ERROR = "Use 1 to 40 characters."
PER_WEEK_ERROR = "per_week must be an integer from 1 to 7"
SLOT_ERROR = "slot must be one of the town lots"
BUILDING_STYLE_ERROR = "building_style must be one of the town styles"
_VALIDATION_MESSAGE = "Check the highlighted fields."
_BUILDING_STYLES = frozenset(SLOT_DEFAULT_STYLE)


@dataclass(frozen=True)
class NameValidation:
    ok: bool
    name: str
    error: str | None


def normalize_name(raw: str) -> str:
    """NFC, strip, and collapse each internal whitespace run to one space."""
    return _WHITESPACE.sub(" ", unicodedata.normalize("NFC", raw).strip())


def name_key(name: str) -> str:
    """Return the casefold uniqueness key. Callers pass the normalized name.

    casefold can lengthen a name, so the length check is on the folded key.
    A key longer than 40 characters is rejected. It is not truncated: truncation
    collided 39 a's plus ß with 39 a's plus s, and it can split a combining mark.
    The failure is 422 name_too_long and field_errors.name is the length sentence.
    """
    key = name.casefold()
    if len(key) > HABIT_NAME_MAX:
        raise APIError(
            422,
            "name_too_long",
            NAME_LENGTH_ERROR,
            field_errors={"name": NAME_LENGTH_ERROR},
        )
    return key


def name_field_errors(result: NameValidation) -> dict[str, str]:
    """Map a name check to field_errors. A length failure is never null."""
    if result.ok:
        return {}
    if result.error is None:
        return {"name": NAME_LENGTH_ERROR}
    return {"name": result.error}


def name_validation_error(result: NameValidation) -> APIError:
    """Return 422 validation_error for a failed name. Length copy is never null."""
    if result.ok:
        raise ValueError("name passed validation")
    return APIError(
        422,
        "validation_error",
        _VALIDATION_MESSAGE,
        field_errors=name_field_errors(result),
    )


def field_validation_error(field: str, detail: str) -> APIError:
    """Return 422 validation_error with field_errors keyed by that one field."""
    return APIError(
        422,
        "validation_error",
        _VALIDATION_MESSAGE,
        field_errors={field: detail},
    )


def require_slot(slot: int) -> int:
    """Accept a lot index from LOT_UNLOCK_LV. Reject anything else."""
    if isinstance(slot, bool) or slot not in range(len(LOT_UNLOCK_LV)):
        raise field_validation_error("slot", SLOT_ERROR)
    return slot


def require_building_style(style: str) -> str:
    """Accept a style named by SLOT_DEFAULT_STYLE. Reject anything else."""
    if style not in _BUILDING_STYLES:
        raise field_validation_error("building_style", BUILDING_STYLE_ERROR)
    return style


def validate_name(raw: str) -> NameValidation:
    """Return ok, or the §8.4 character message. Length is 1..40 after normalization."""
    nfc = unicodedata.normalize("NFC", raw)
    # U+001F is both a C0 control and Unicode whitespace, so reject before collapsing.
    if any(_forbidden(char) for char in nfc):
        return NameValidation(False, nfc, NAME_CHARACTERS_ERROR)
    name = _WHITESPACE.sub(" ", nfc.strip())
    if not 1 <= len(name) <= HABIT_NAME_MAX:
        return NameValidation(False, name, None)
    return NameValidation(True, name, None)


def _forbidden(char: str) -> bool:
    code = ord(char)
    if unicodedata.category(char) == "Cc":
        return True
    return 0x202A <= code <= 0x202E or 0x2066 <= code <= 0x2069


Last7Value = Literal["done", "rest", "miss", "pending", "none", "off"]
_WeekKey = tuple[int, int]


@dataclass(frozen=True)
class WeekProgress:
    done: int
    target: int


@dataclass(frozen=True)
class Streak:
    unit: Literal["days", "weeks"]
    current: int
    best: int
    best_days: int
    best_weeks: int
    rest_day_available: bool | None
    rest_used_on: date | None
    week: WeekProgress | None
    streak7_count: int
    streak7_days: tuple[date, ...]
    last7: tuple[Last7Value, ...]


def evaluate_streak(
    created_on: date,
    today: date,
    checkins: Iterable[date],
    per_week: int,
    cadences: Iterable[CadenceRow] = (),
    archived_on: date | None = None,
) -> Streak:
    """Evaluate one habit from created_on through min(today, archived_on)."""
    rows = tuple(cadences)
    checked = frozenset(checkins)
    end = today if archived_on is None else min(today, archived_on)
    labels: dict[date, Last7Value] = {}
    streak7: list[date] = []
    rests: dict[_WeekKey, date] = {}
    best_days = 0
    best_weeks = 0
    unit: Literal["days", "weeks"] = "days"
    current = 0
    open_week: WeekProgress | None = None

    def daily(day: date, streak: int) -> int:
        nonlocal best_days
        if day in checked:
            streak += 1
            labels[day] = "done"
            if streak % 7 == 0:
                streak7.append(day)
        elif day == today:
            labels[day] = "pending"  # pending does not spend the week's rest
        elif streak > 0 and (key := _iso_week(day)) not in rests:
            labels[day] = "rest"
            rests[key] = day
        else:
            labels[day] = "miss"
            streak = 0
        best_days = max(best_days, streak)
        return streak

    def weekly(seg_start: date, seg_end: date) -> int:
        nonlocal best_weeks, open_week
        streak = 0
        monday = _monday(seg_start)
        creation = _monday(created_on)
        archive = _monday(archived_on) if archived_on is not None and archived_on <= today else None
        current_week = _monday(today) if end == today else None
        while monday <= _monday(seg_end):
            days = [
                monday + timedelta(days=offset)
                for offset in range(7)
                if seg_start <= monday + timedelta(days=offset) <= seg_end
            ]
            for day in days:
                labels[day] = "done" if day in checked else "off"
            done = sum(day in checked for day in days)
            born_here = seg_start <= created_on <= seg_end and monday == creation
            anchor = created_on if born_here else monday if monday >= seg_start else seg_start
            target = cadence_on(anchor, per_week, rows)
            protects = born_here or monday == current_week
            if archive is not None and archived_on is not None:
                protects = protects or (monday == archive and seg_start <= archived_on <= seg_end)
            if done >= target:
                streak += 1
                if streak >= 2:
                    hit = sorted(day for day in days if day in checked)
                    streak7.append(hit[target - 1])
            elif not protects:
                streak = 0
            best_weeks = max(best_weeks, streak)
            if seg_start <= end <= seg_end and monday == _monday(end):
                open_week = WeekProgress(done, target)
            monday += timedelta(days=7)
        return streak

    if end >= created_on:
        for kind, seg_start, seg_end in _kind_segments(created_on, end, per_week, rows):
            if kind == "daily":
                streak = 0
                for day in _dates(seg_start, seg_end):
                    streak = daily(day, streak)
                unit, current = "days", streak
            else:
                unit, current = "weeks", weekly(seg_start, seg_end)
    elif cadence_kind(cadence_on(today, per_week, rows)) == "weekly":
        unit = "weeks"

    if unit == "days":
        week = None
        rest_available: bool | None = _iso_week(today) not in rests
        rest_on = rests.get(_iso_week(today))
        best = best_days
    else:
        anchor = end if end >= created_on else today
        week = open_week or WeekProgress(0, cadence_on(anchor, per_week, rows))
        rest_available = None
        rest_on = None
        best = best_weeks
    last7: list[Last7Value] = []
    for offset in range(6, -1, -1):
        day = today - timedelta(days=offset)
        last7.append("none" if day < created_on else labels.get(day, "off"))
    return Streak(
        unit,
        current,
        best,
        best_days,
        best_weeks,
        rest_available,
        rest_on,
        week,
        len(streak7),
        tuple(streak7),
        tuple(last7),
    )


def _iso_week(day: date) -> _WeekKey:
    calendar = day.isocalendar()
    return calendar.year, calendar.week


def _monday(day: date) -> date:
    return day - timedelta(days=day.weekday())


def _dates(start: date, end: date) -> Iterable[date]:
    day = start
    while day <= end:
        yield day
        day += timedelta(days=1)


def _kind_segments(
    start: date, end: date, per_week: int, rows: tuple[CadenceRow, ...]
) -> list[tuple[CadenceKind, date, date]]:
    segments: list[tuple[CadenceKind, date, date]] = []
    current: CadenceKind | None = None
    seg_start = previous = start
    for day in _dates(start, end):
        kind = cadence_kind(cadence_on(day, per_week, rows))
        if current is None:
            current = kind
            seg_start = day
        elif kind != current:
            segments.append((current, seg_start, previous))
            current = kind
            seg_start = day
        previous = day
    if current is not None:
        segments.append((current, seg_start, end))
    return segments
