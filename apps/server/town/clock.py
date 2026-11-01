"""Town clock (§4.1). Tests override get_town_clock via app.dependency_overrides."""

from datetime import UTC, datetime
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from packages.time.today import _ZONE_NAME


def get_town_clock() -> datetime:
    """Return the current UTC instant. Routes convert it with today_in_zone."""
    return datetime.now(UTC)


def resolve_tz(zone_name: str | None) -> str:
    """Zone actually used for town.tz. Missing or unknown is UTC, not an error."""
    name = (zone_name or "").strip()
    if not _ZONE_NAME.fullmatch(name):
        return "UTC"
    try:
        ZoneInfo(name)
    except (ZoneInfoNotFoundError, ValueError, OSError):
        return "UTC"
    return name
