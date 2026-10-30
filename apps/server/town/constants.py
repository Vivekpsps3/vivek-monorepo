"""Town tuning constants (CONSTANTS_VERSION 1). Server values are authoritative."""

from collections.abc import Mapping
from types import MappingProxyType

TOWN_NAME = "Terraria-on-Sea"
XP: Mapping[str, int] = MappingProxyType(
    {
        "manual": 10,
        "mediaEpisode": 5,
        "mediaFinished": 10,
        "travelReminder": 5,
        "tripDone": 30,
        "streak7": 10,
    }
)
DAILY_CAP: Mapping[str, int] = MappingProxyType({"library": 10, "inn": 15})
BUILDING_LV = (0, 50, 150, 400, 1000)
TOWN_LV = (0, 100, 250, 500, 900, 1400, 2000, 2800, 3800, 5000)
LOT_UNLOCK_LV = (1, 1, 3, 5, 7, 9)
TREASURY_WEEKS = (0, 1, 2, 4, 8)
MEDIA_FINISHED_KINDS = frozenset(("movie", "tv", "book", "game"))
HABIT_NAME_MAX = 40
HABIT_TOTAL_MAX = 200
CHECKIN_WINDOW = (-1, +1)
SLOT_DEFAULT_STYLE = ("forge", "garden", "cottage", "cottage", "cottage", "cottage")
CONSTANTS_VERSION = 1
