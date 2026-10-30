"""Pure Town engine: constants, levels, lots, cadence, caps, and streaks."""

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
