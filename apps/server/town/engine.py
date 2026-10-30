"""Pure Town math: levels, lots, cadence, streaks, caps, and habit names.

Callers pass `today`. This module does not read the clock, the database, or the network.
"""

from __future__ import annotations

from collections.abc import Iterable, Mapping, Sequence
from dataclasses import dataclass
from datetime import date, timedelta
from typing import Literal

from apps.server.town.constants import DAILY_CAP, LOT_UNLOCK_LV, XP

CadenceKind = Literal["daily", "weekly"]
CadenceAction = Literal["insert", "update"]
CadenceRow = tuple[date, int]


@dataclass(frozen=True)
class PendingCadence:
    """A cadence row that has not taken effect yet."""

    per_week: int
    effective_from: date


@dataclass(frozen=True)
class Cadence:
    """Cadence in effect on a day, plus any pending change."""

    per_week: int
    kind: CadenceKind
    pending: PendingCadence | None


@dataclass(frozen=True)
class CadenceChange:
    """The habit_cadences upsert to write, if the planned value is a real change."""

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
