"""Pure Town math. Callers pass today; nothing here reads the clock or the database."""

from __future__ import annotations

import bisect
import re
import unicodedata
from collections.abc import Iterable, Mapping, Sequence
from dataclasses import dataclass
from datetime import date, timedelta
from typing import Literal

from apps.server.town.constants import DAILY_CAP, HABIT_NAME_MAX, LOT_UNLOCK_LV, XP

CadenceKind = Literal["daily", "weekly"]
CadenceAction = Literal["insert", "update"]
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
    """Return daily for 7 and weekly for 1..6."""
    if per_week == 7:
        return "daily"
    if 1 <= per_week <= 6:
        return "weekly"
    raise ValueError("per_week must be an integer from 1 to 7")


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
    """Return the next-Monday upsert, or None when that value is already in effect."""
    cadence_kind(new_per_week)
    rows = tuple(cadences)
    effective = next_monday_after(today)
    if new_per_week == cadence_on(effective, per_week, rows):
        return None
    action: CadenceAction = "update" if any(start == effective for start, _ in rows) else "insert"
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


@dataclass(frozen=True)
class NameValidation:
    ok: bool
    name: str
    error: str | None


def normalize_name(raw: str) -> str:
    """NFC, strip, and collapse each internal whitespace run to one space."""
    return _WHITESPACE.sub(" ", unicodedata.normalize("NFC", raw).strip())


def name_key(name: str) -> str:
    """Return the casefold uniqueness key. Callers pass the normalized name."""
    return name.casefold()


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
    *,
    checkin_ords: Sequence[int] | None = None,
) -> Streak:
    """Evaluate one habit from created_on through min(today, archived_on)."""
    rows = tuple(cadences)
    # checkin_ords: strictly increasing Python ordinals from SQL. No per-row date.
    ords = checkin_ords if checkin_ords is not None else _ordinals(checkins)
    end = today if archived_on is None else min(today, archived_on)
    labels: dict[date, Last7Value] = {}
    streak7: list[date] = []
    rests: dict[_WeekKey, date] = {}
    best_days = 0
    best_weeks = 0
    unit: Literal["days", "weeks"] = "days"
    current = 0
    open_week: WeekProgress | None = None
    label_from = (today - timedelta(days=6)).toordinal()
    table = _cadence_table(rows)

    if end >= created_on:
        for kind, seg_start, seg_end in _kind_segments(created_on, end, per_week, table):
            if kind == "daily":
                current, best_days = _daily_segment(
                    seg_start, seg_end, ords, rests, labels, streak7, best_days, today, label_from
                )
                unit = "days"
            else:
                current, best_weeks, open_week = _weekly_segment(
                    seg_start,
                    seg_end,
                    ords,
                    table,
                    per_week,
                    created_on,
                    today,
                    end,
                    archived_on,
                    labels,
                    streak7,
                    best_weeks,
                    label_from,
                )
                unit = "weeks"
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


def _ordinals(checkins: Iterable[date]) -> list[int]:
    data = checkins if isinstance(checkins, list) else list(checkins)
    ords: list[int] = []
    last = -1
    for day in data:
        ordinal = day.toordinal()
        if ordinal <= last:
            return sorted({item.toordinal() for item in data})
        ords.append(ordinal)
        last = ordinal
    return ords


def _cadence_table(rows: Sequence[CadenceRow]) -> list[CadenceRow]:
    # A later row for the same day replaces an earlier one, matching cadence_on.
    by_date: dict[date, int] = {}
    for start, value in rows:
        by_date[start] = value
    return sorted(by_date.items())


def _kind_segments(
    start: date, end: date, per_week: int, table: Sequence[CadenceRow]
) -> list[tuple[CadenceKind, date, date]]:
    # Kind changes only on a cadence start date, not once per day.
    segments: list[tuple[CadenceKind, date, date]] = []
    index = 0
    value = per_week
    while index < len(table) and table[index][0] <= start:
        value = table[index][1]
        index += 1
    current = cadence_kind(value)
    seg_start = start
    while index < len(table) and table[index][0] <= end:
        change_day, value = table[index]
        index += 1
        kind = cadence_kind(value)
        if kind == current:
            continue
        prev_end = change_day - timedelta(days=1)
        if prev_end >= seg_start:
            segments.append((current, seg_start, prev_end))
        current = kind
        seg_start = change_day
    if seg_start <= end:
        segments.append((current, seg_start, end))
    return segments


def _run_length(ords: Sequence[int], index: int, hi: int, base: int) -> int:
    lo = 0
    hi_off = hi - index - 1
    while lo < hi_off:
        mid = (lo + hi_off + 1) // 2
        if ords[index + mid] == base + mid:
            lo = mid
        else:
            hi_off = mid - 1
    return lo + 1


def _paint(
    labels: dict[date, Last7Value],
    start: int,
    end: int,
    label_from: int,
    today_ord: int,
    value: Last7Value,
    *,
    pending_today: bool = False,
) -> None:
    lo = start if start > label_from else label_from
    hi = end if end < today_ord else today_ord
    for ordinal in range(lo, hi + 1):
        picked = "pending" if pending_today and ordinal == today_ord else value
        labels[date.fromordinal(ordinal)] = picked


def _daily_segment(
    seg_start: date,
    seg_end: date,
    ords: Sequence[int],
    rests: dict[_WeekKey, date],
    labels: dict[date, Last7Value],
    streak7: list[date],
    best_days: int,
    today: date,
    label_from: int,
) -> tuple[int, int]:
    lo = bisect.bisect_left(ords, seg_start.toordinal())
    hi = bisect.bisect_right(ords, seg_end.toordinal())
    cursor = seg_start.toordinal()
    end_ord = seg_end.toordinal()
    today_ord = today.toordinal()
    streak = 0
    index = lo
    while cursor <= end_ord:
        if index < hi and ords[index] == cursor:
            length = _run_length(ords, index, hi, cursor)
            mark = 7 - (streak % 7)
            while mark <= length:
                streak7.append(date.fromordinal(ords[index + mark - 1]))
                mark += 7
            streak += length
            if streak > best_days:
                best_days = streak
            _paint(labels, cursor, cursor + length - 1, label_from, today_ord, "done")
            index += length
            cursor += length
            continue
        if streak == 0:
            gap_end = ords[index] if index < hi else end_ord + 1
            last = gap_end - 1 if gap_end - 1 < end_ord else end_ord
            _paint(labels, cursor, last, label_from, today_ord, "miss", pending_today=True)
            cursor = gap_end
            continue
        if cursor == today_ord:
            _paint(labels, cursor, cursor, label_from, today_ord, "pending")
            cursor += 1
            continue
        day = date.fromordinal(cursor)
        week = _iso_week(day)
        if week not in rests:
            rests[week] = day
            _paint(labels, cursor, cursor, label_from, today_ord, "rest")
        else:
            _paint(labels, cursor, cursor, label_from, today_ord, "miss")
            streak = 0
        cursor += 1
    return streak, best_days


def _weekly_segment(
    seg_start: date,
    seg_end: date,
    ords: Sequence[int],
    table: Sequence[CadenceRow],
    per_week: int,
    created_on: date,
    today: date,
    end: date,
    archived_on: date | None,
    labels: dict[date, Last7Value],
    streak7: list[date],
    best_weeks: int,
    label_from: int,
) -> tuple[int, int, WeekProgress | None]:
    streak = 0
    open_week: WeekProgress | None = None
    start_ord = seg_start.toordinal()
    end_ord = seg_end.toordinal()
    monday = start_ord - seg_start.weekday()
    last_monday = end_ord - seg_end.weekday()
    created_ord = created_on.toordinal()
    today_ord = today.toordinal()
    end_o = end.toordinal()
    creation_monday = created_ord - created_on.weekday()
    end_monday = end_o - end.weekday()
    archive_monday = None
    archive_ord = None
    if archived_on is not None and archived_on <= today:
        archive_ord = archived_on.toordinal()
        archive_monday = archive_ord - archived_on.weekday()
    current_week = today_ord - today.weekday() if end == today else None
    index = bisect.bisect_left(ords, start_ord)
    hi = bisect.bisect_right(ords, end_ord)
    table_ords = [(row[0].toordinal(), row[1]) for row in table]
    cadence_index = 0
    value = per_week
    born_possible = start_ord <= created_ord <= end_ord
    while monday <= last_monday:
        week_last = monday + 6
        lo_ord = start_ord if start_ord > monday else monday
        hi_ord = end_ord if end_ord < week_last else week_last
        while index < hi and ords[index] < lo_ord:
            index += 1
        stop = index
        while stop < hi and ords[stop] <= hi_ord:
            stop += 1
        done = stop - index
        born = born_possible and monday == creation_monday
        if born:
            anchor = created_ord
        elif monday >= start_ord:
            anchor = monday
        else:
            anchor = start_ord
        while cadence_index < len(table_ords) and table_ords[cadence_index][0] <= anchor:
            value = table_ords[cadence_index][1]
            cadence_index += 1
        protects = born or (current_week is not None and monday == current_week)
        if archive_monday is not None and archive_ord is not None:
            protects = protects or (
                monday == archive_monday and start_ord <= archive_ord <= end_ord
            )
        if done >= value:
            streak += 1
            if streak >= 2:
                streak7.append(date.fromordinal(ords[index + value - 1]))
        elif not protects:
            streak = 0
        if streak > best_weeks:
            best_weeks = streak
        if start_ord <= end_o <= end_ord and monday == end_monday:
            open_week = WeekProgress(done, value)
        if hi_ord >= label_from and lo_ord <= today_ord:
            mark = index
            while mark < stop and ords[mark] < label_from:
                mark += 1
            while mark < stop and ords[mark] <= today_ord:
                labels[date.fromordinal(ords[mark])] = "done"
                mark += 1
        index = stop
        monday += 7
    return streak, best_weeks, open_week
