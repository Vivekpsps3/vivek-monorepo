"""Pure Town engine: constants, levels, lots, cadence, caps, and streaks."""

from datetime import date, timedelta

import pytest

from apps.server.town.constants import (
    BUILDING_LV,
    CHECKIN_WINDOW,
    CONSTANTS_VERSION,
    DAILY_CAP,
    HABIT_NAME_MAX,
    HABIT_TOTAL_MAX,
    LOT_UNLOCK_LV,
    MEDIA_FINISHED_KINDS,
    SLOT_DEFAULT_STYLE,
    TOWN_LV,
    TOWN_NAME,
    TREASURY_WEEKS,
    XP,
)
from apps.server.town.engine import (
    CadenceAction,
    CadenceChange,
    WeekProgress,
    cadence_kind,
    cadence_on,
    describe_cadence,
    evaluate_streak,
    habit_xp,
    inn_day,
    level,
    level_progress,
    library_day,
    lots,
    next_monday_after,
    plan_cadence_change,
    stage,
)


def test_section_2_constants():
    assert TOWN_NAME == "Terraria-on-Sea" and CONSTANTS_VERSION == 1
    assert dict(XP) == {
        "manual": 10,
        "mediaEpisode": 5,
        "mediaFinished": 10,
        "travelReminder": 5,
        "tripDone": 30,
        "streak7": 10,
    }
    assert dict(DAILY_CAP) == {"library": 10, "inn": 15}
    assert BUILDING_LV == (0, 50, 150, 400, 1000)
    assert TOWN_LV == (0, 100, 250, 500, 900, 1400, 2000, 2800, 3800, 5000)
    assert LOT_UNLOCK_LV == (1, 1, 3, 5, 7, 9) and TREASURY_WEEKS == (0, 1, 2, 4, 8)
    assert set(MEDIA_FINISHED_KINDS) == {"movie", "tv", "book", "game"}
    assert isinstance(MEDIA_FINISHED_KINDS, frozenset) and isinstance(BUILDING_LV, tuple)
    assert (HABIT_NAME_MAX, HABIT_TOTAL_MAX, CHECKIN_WINDOW) == (40, 200, (-1, +1))
    assert SLOT_DEFAULT_STYLE == ("forge", "garden", "cottage", "cottage", "cottage", "cottage")


def _boundaries(table: tuple[int, ...]) -> list[tuple[int, int, int, int | None]]:
    cases: list[tuple[int, int, int, int | None]] = []
    for index, threshold in enumerate(table):
        current = index + 1
        start = threshold
        nxt = table[index + 1] if index + 1 < len(table) else None
        cases.append((threshold, current, start, nxt))
        if nxt is not None:
            cases.append((nxt - 1, current, start, nxt))
        else:
            cases.append((threshold + 1, current, start, None))
    return cases


@pytest.mark.parametrize(("xp", "lv", "start", "nxt"), _boundaries(BUILDING_LV))
def test_building_level_boundaries(xp: int, lv: int, start: int, nxt: int | None):
    assert level(xp, BUILDING_LV) == lv
    assert level_progress(xp, BUILDING_LV) == (lv, start, nxt)
    assert stage(lv) == (1 if lv <= 1 else 2 if lv <= 3 else 3)


@pytest.mark.parametrize(("xp", "lv", "start", "nxt"), _boundaries(TOWN_LV))
def test_town_level_boundaries(xp: int, lv: int, start: int, nxt: int | None):
    assert level(xp, TOWN_LV) == lv
    assert level_progress(xp, TOWN_LV) == (lv, start, nxt)
    assert (lv == 10) == (nxt is None)


def test_level_below_every_threshold_is_rejected():
    with pytest.raises(ValueError, match="threshold"):
        level(-1, BUILDING_LV)


def test_lot_states_follow_unlock_and_occupied_does_not_relock():
    for town_level in range(1, 11):
        free = lots(town_level, {})
        assert [lot["slot"] for lot in free] == [0, 1, 2, 3, 4, 5]
        for lot, unlock in zip(free, LOT_UNLOCK_LV, strict=True):
            assert lot["unlock_level"] == unlock
            assert lot["habit_id"] is None
            assert lot["state"] == ("empty" if town_level >= unlock else "locked")
    occupied = {lot["slot"]: lot for lot in lots(1, {0: 12, 5: 9})}
    assert occupied[0] == {"slot": 0, "unlock_level": 1, "state": "occupied", "habit_id": 12}
    assert occupied[1]["state"] == "empty"
    assert occupied[5] == {"slot": 5, "unlock_level": 9, "state": "occupied", "habit_id": 9}
    assert lots(1, {2: 4})[2]["state"] == "occupied"


def test_slots_outside_0_to_5_are_ignored():
    assert all(lot["habit_id"] is None for lot in lots(10, {6: 1, -1: 2}))


@pytest.mark.parametrize(
    ("today", "expected"),
    [
        (date(2026, 10, 15), date(2026, 10, 19)),  # Thursday
        (date(2026, 10, 19), date(2026, 10, 26)),  # Monday → the Monday after
        (date(2026, 10, 18), date(2026, 10, 19)),  # Sunday
        (date(2026, 10, 29), date(2026, 11, 2)),  # Thursday, the §6.4 example
        (date(2026, 11, 1), date(2026, 11, 2)),  # DST fall-back Sunday, plain dates
    ],
)
def test_next_monday_after(today: date, expected: date):
    assert next_monday_after(today) == expected
    assert next_monday_after(today).weekday() == 0
    assert next_monday_after(today) > today


def test_cadence_on_uses_the_latest_row_on_or_before_the_day():
    rows = ((date(2026, 10, 19), 3), (date(2026, 10, 26), 4))
    assert cadence_on(date(2026, 10, 18), 7, rows) == 7
    assert cadence_on(date(2026, 10, 19), 7, rows) == 3
    assert cadence_on(date(2026, 10, 25), 7, rows) == 3
    assert cadence_on(date(2026, 10, 26), 7, rows) == 4
    assert cadence_kind(7) == "daily"
    assert cadence_kind(1) == "weekly"
    assert cadence_kind(6) == "weekly"
    with pytest.raises(ValueError, match="per_week"):
        cadence_kind(0)


def test_plan_cadence_change_midweek_insert_update_and_noop():
    today = date(2026, 10, 15)
    monday = date(2026, 10, 19)
    assert plan_cadence_change(today, 7, (), 3) == _change(monday, 3, "insert")
    assert plan_cadence_change(today, 7, (), 7) is None
    existing = ((monday, 3),)
    assert plan_cadence_change(today, 7, existing, 3) is None
    assert plan_cadence_change(today, 7, existing, 4) == _change(monday, 4, "update")
    # A past row still in effect on next Monday counts; a different value inserts.
    assert plan_cadence_change(today, 7, ((date(2026, 10, 5), 3),), 5) == _change(
        monday, 5, "insert"
    )
    described = describe_cadence(today, 7, existing)
    assert (described.per_week, described.kind) == (7, "daily")
    assert described.pending is not None
    assert (described.pending.per_week, described.pending.effective_from) == (3, monday)
    on_monday = describe_cadence(monday, 7, existing)
    assert on_monday.pending is None and (on_monday.per_week, on_monday.kind) == (3, "weekly")


def _change(effective: date, per_week: int, action: CadenceAction) -> CadenceChange:
    return CadenceChange(effective, per_week, action)


def test_daily_caps_at_the_boundaries():
    library = [
        library_day(episodes, finished)
        for episodes, finished in ((0, 0), (1, 0), (2, 0), (3, 0), (0, 1), (1, 1))
    ]
    assert library == [0, 5, 10, 10, 10, 10]
    inn = [
        inn_day(reminders, trips)
        for reminders, trips in ((0, 0), (2, 0), (3, 0), (4, 0), (0, 1), (4, 1), (100, 2))
    ]
    assert inn == [0, 10, 15, 15, 30, 45, 75]
    assert habit_xp(7, 1) == 80 and habit_xp(9, 1) == 100
    assert library_day(3, 0) == min(DAILY_CAP["library"], XP["mediaEpisode"] * 3)
    assert inn_day(4, 1) == min(DAILY_CAP["inn"], XP["travelReminder"] * 4) + XP["tripDone"]


def _on(*iso: str) -> list[date]:
    parts: list[str] = []
    for item in iso:
        parts.extend(item.split())
    return [date.fromisoformat(part) for part in parts]


def _span(start: str, end: str) -> list[date]:
    first = date.fromisoformat(start)
    last = date.fromisoformat(end)
    return [first + timedelta(days=offset) for offset in range((last - first).days + 1)]


def _habit(created, today, checkins, per_week=7, cadences=(), archived=None):
    start, end = date.fromisoformat(created), date.fromisoformat(today)
    if archived is not None:
        archived = date.fromisoformat(archived)
    return evaluate_streak(start, end, checkins, per_week, cadences, archived)


# Example C pins week counts only. W40 Wed 30 Sep; W41 Mon/Wed/Fri;
# W42 Mon/Wed/Fri/Sun so streak7 lands on the 3rd check-in (Fri 16); W43 Mon.
_C_DAYS = (
    "2026-09-30 2026-10-05 2026-10-07 2026-10-09 2026-10-12 "
    "2026-10-14 2026-10-16 2026-10-18 2026-10-19"
)
_C = _on(_C_DAYS)


@pytest.mark.parametrize(
    ("created", "today", "days", "per_week", "stats", "rest", "streak7", "last7", "xp", "later"),
    [
        (
            "2026-10-05",
            "2026-10-15",
            "2026-10-05 2026-10-06 2026-10-07 2026-10-08 2026-10-10 2026-10-11 2026-10-12",
            7,
            ("days", 0, 7, 7, 0, None),
            (False, date(2026, 10, 13)),
            (date(2026, 10, 12),),
            ("rest", "done", "done", "done", "rest", "miss", "pending"),
            (7, 80, (2, 50, 150), 2),
            None,
        ),
        (
            "2026-10-19",
            "2026-10-22",
            "2026-10-19 2026-10-20 2026-10-21",
            7,
            ("days", 3, 3, 3, 0, None),
            (True, None),
            (),
            ("none", "none", "none", "done", "done", "done", "pending"),
            (3, 30, (1, 0, 50), None),
            None,
        ),
        (
            "2026-09-30",
            "2026-10-22",
            _C_DAYS,
            3,
            ("weeks", 2, 2, 0, 2, (1, 3)),
            (None, None),
            (date(2026, 10, 16),),
            ("done", "off", "done", "done", "off", "off", "off"),
            (9, 100, (2, 50, 150), None),
            ("2026-10-26", 0, 2, (0, 3)),
        ),
    ],
    ids=("A", "B", "C"),
)
def test_worked_examples_a_b_and_c(
    created, today, days, per_week, stats, rest, streak7, last7, xp, later
):
    got = _habit(created, today, _on(days), per_week=per_week)
    assert (got.unit, got.current, got.best, got.best_days, got.best_weeks) == stats[:5]
    assert got.week == (None if stats[5] is None else WeekProgress(*stats[5]))
    assert (got.rest_day_available, got.rest_used_on) == rest
    assert got.streak7_days == streak7 and got.last7 == last7
    checks, points, progress, stage_n = xp
    assert habit_xp(checks, got.streak7_count) == points
    assert level_progress(points, BUILDING_LV) == progress
    if stage_n is not None:
        assert stage(stage_n) == stage_n
    if later is not None:
        when, current, best, week = later
        got = _habit(created, when, _on(days), per_week=per_week)
        assert (got.current, got.best, got.week) == (current, best, WeekProgress(*week))


def test_rest_day_edges_bridge_reset_pending_and_backfill():
    bridged = _habit(
        "2026-10-05", "2026-10-14", _span("2026-10-05", "2026-10-10") + _on("2026-10-13")
    )
    assert (bridged.current, bridged.best, bridged.rest_used_on) == (7, 7, date(2026, 10, 12))
    assert bridged.rest_day_available is False
    assert bridged.streak7_days == (date(2026, 10, 13),)
    assert bridged.last7 == ("done", "done", "done", "rest", "rest", "done", "pending")

    reset = _habit("2026-10-12", "2026-10-15", _on("2026-10-12"))
    assert (reset.current, reset.best, reset.rest_used_on) == (0, 1, date(2026, 10, 13))
    assert reset.last7 == ("none", "none", "none", "done", "rest", "miss", "pending")
    pending = _habit("2026-10-12", "2026-10-14", _on("2026-10-12"))
    assert pending.current == 1 and pending.last7[-1] == "pending"
    early = _habit("2026-10-12", "2026-10-15", _on("2026-10-14"))
    assert early.rest_used_on is None and early.rest_day_available is True and early.current == 1
    assert early.last7[-4:] == ("miss", "miss", "done", "pending")

    assert _habit("2026-10-12", "2026-10-12", _on("2026-10-12")).last7[-1] == "done"
    backfill = _habit("2026-10-12", "2026-10-15", _on("2026-10-12", "2026-10-13"))
    assert (backfill.current, backfill.rest_used_on) == (2, date(2026, 10, 14))
    outside = _on("2026-10-11", "2026-10-12", "2026-10-13")
    assert _habit("2026-10-12", "2026-10-12", outside).current == 1


def test_cadence_changes_reset_kind_and_keep_a_weekly_run():
    pending = ((date(2026, 10, 19), 3),)
    current = _habit(
        "2026-10-05", "2026-10-15", _span("2026-10-05", "2026-10-14"), cadences=pending
    )
    assert (current.unit, current.current, current.week) == ("days", 10, None)
    assert cadence_on(date(2026, 10, 15), 7, pending) == 7
    assert cadence_on(date(2026, 10, 19), 7, pending) == 3

    switched = _habit(
        "2026-10-05", "2026-10-22", _span("2026-10-05", "2026-10-18"), cadences=pending
    )
    assert switched.unit == "weeks" and switched.current == 0 and switched.best == 0
    assert switched.best_days == 14
    assert switched.best_weeks == 0 and switched.rest_day_available is None
    assert switched.rest_used_on is None and switched.week == WeekProgress(0, 3)
    assert switched.streak7_days == (date(2026, 10, 11), date(2026, 10, 18))

    kept = _habit("2026-09-30", "2026-10-22", _C, per_week=3, cadences=((date(2026, 10, 19), 4),))
    assert (kept.current, kept.best_weeks, kept.week) == (2, 2, WeekProgress(1, 4))
    met = _C + _on("2026-10-20", "2026-10-21", "2026-10-22")
    continued = _habit(
        "2026-09-30", "2026-10-22", met, per_week=3, cadences=((date(2026, 10, 19), 4),)
    )
    assert continued.current == 3 and continued.week == WeekProgress(4, 4)
    assert continued.streak7_days == (date(2026, 10, 16), date(2026, 10, 22))
    assert continued.last7[-1] == "done"

    back = _on("2026-10-05", "2026-10-12", "2026-10-19", "2026-10-20")
    daily = _habit(
        "2026-10-05", "2026-10-20", back, per_week=1, cadences=((date(2026, 10, 19), 7),)
    )
    assert (daily.unit, daily.current, daily.best_days, daily.best_weeks) == ("days", 2, 2, 2)
    assert daily.week is None and daily.rest_day_available is True
    assert daily.streak7_days == (date(2026, 10, 12),)


def test_archive_week_dst_and_before_creation():
    checks = _on("2026-09-28", "2026-09-30", "2026-10-02", "2026-10-05", "2026-10-07", "2026-10-09")
    archived = _habit("2026-09-28", "2026-10-20", checks, per_week=3, archived="2026-10-14")
    assert (archived.unit, archived.current, archived.best_weeks) == ("weeks", 2, 2)
    assert archived.week == WeekProgress(0, 3) and archived.rest_day_available is None
    assert archived.last7[0] == "off" and "done" not in archived.last7

    fallback = _habit("2026-10-30", "2026-11-02", _on("2026-10-30", "2026-10-31", "2026-11-01"))
    assert (fallback.current, fallback.best) == (3, 3)
    assert fallback.last7 == ("none", "none", "none", "done", "done", "done", "pending")

    empty = _habit("2026-10-16", "2026-10-15", [])
    assert (empty.current, empty.best, empty.rest_day_available) == (0, 0, True)
    assert empty.last7 == ("none",) * 7
    tied = ((date(2026, 10, 19), 3), (date(2026, 10, 19), 5))
    assert cadence_on(date(2026, 10, 19), 7, tied) == 5
