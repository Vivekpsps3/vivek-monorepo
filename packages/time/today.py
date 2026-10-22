"""Calendar date in an IANA timezone.

Media and Travel both ask for "today" with the browser zone. A missing or
unknown zone falls back to UTC so a bad value never fails the request.
"""

from datetime import UTC, date, datetime
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError
import re

_ZONE_NAME = re.compile(r"^[A-Za-z0-9_+-]{1,64}(?:/[A-Za-z0-9_+-]{1,64}){0,2}$")


def today_in_zone(zone_name: str | None, now: datetime | None = None) -> date:
    moment = now if now is not None else datetime.now(UTC)
    if moment.tzinfo is None:
        moment = moment.replace(tzinfo=UTC)
    else:
        moment = moment.astimezone(UTC)
    name = (zone_name or "").strip()
    if not _ZONE_NAME.fullmatch(name):
        name = "UTC"
    try:
        zone = ZoneInfo(name)
    except (ZoneInfoNotFoundError, ValueError, OSError):
        # "America" is a zoneinfo directory and raises IsADirectoryError.
        zone = ZoneInfo("UTC")
    return moment.astimezone(zone).date()
