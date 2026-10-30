"""Pure Town engine: constants, levels, lots, cadence, caps, and streaks."""

from datetime import date

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
    cadence_kind,
    cadence_on,
    describe_cadence,
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
    assert TOWN_NAME == "Terraria-on-Sea"
    assert CONSTANTS_VERSION == 1
    assert XP["manual"] == 10
    assert XP["mediaEpisode"] == 5
    assert XP["mediaFinished"] == 10
    assert XP["travelReminder"] == 5
    assert XP["tripDone"] == 30
    assert XP["streak7"] == 10
    assert tuple(XP) == (
        "manual",
        "mediaEpisode",
        "mediaFinished",
        "travelReminder",
        "tripDone",
        "streak7",
    )
    assert DAILY_CAP["library"] == 10
    assert DAILY_CAP["inn"] == 15
    assert BUILDING_LV == (0, 50, 150, 400, 1000)
    assert TOWN_LV == (0, 100, 250, 500, 900, 1400, 2000, 2800, 3800, 5000)
    assert LOT_UNLOCK_LV == (1, 1, 3, 5, 7, 9)
    assert TREASURY_WEEKS == (0, 1, 2, 4, 8)
    assert set(MEDIA_FINISHED_KINDS) == {"movie", "tv", "book", "game"}
    assert HABIT_NAME_MAX == 40
    assert HABIT_TOTAL_MAX == 200
    assert CHECKIN_WINDOW == (-1, +1)
    assert SLOT_DEFAULT_STYLE == (
        "forge",
        "garden",
        "cottage",
        "cottage",
        "cottage",
        "cottage",
    )
    assert isinstance(BUILDING_LV, tuple)
    assert isinstance(MEDIA_FINISHED_KINDS, frozenset)


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
    assert described.per_week == 7
    assert described.kind == "daily"
    assert described.pending is not None
    assert described.pending.per_week == 3
    assert described.pending.effective_from == monday
    assert describe_cadence(monday, 7, existing).pending is None
    assert describe_cadence(monday, 7, existing).per_week == 3
    assert describe_cadence(monday, 7, existing).kind == "weekly"


def _change(effective: date, per_week: int, action: CadenceAction) -> CadenceChange:
    return CadenceChange(effective, per_week, action)


def test_daily_caps_at_the_boundaries():
    assert library_day(0, 0) == 0
    assert library_day(1, 0) == 5
    assert library_day(2, 0) == 10
    assert library_day(3, 0) == 10
    assert library_day(0, 1) == 10
    assert library_day(1, 1) == 10
    assert inn_day(0, 0) == 0
    assert inn_day(2, 0) == 10
    assert inn_day(3, 0) == 15
    assert inn_day(4, 0) == 15
    assert inn_day(0, 1) == 30
    assert inn_day(4, 1) == 45
    assert inn_day(100, 2) == 75
    assert habit_xp(7, 1) == 80
    assert habit_xp(9, 1) == 100
    assert library_day(3, 0) == min(DAILY_CAP["library"], XP["mediaEpisode"] * 3)
    assert inn_day(4, 1) == min(DAILY_CAP["inn"], XP["travelReminder"] * 4) + XP["tripDone"]
