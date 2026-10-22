import os
from datetime import date

from packages.time.today import today_in_zone


def today(tz: str | None = None) -> date:
    override = os.getenv("MEDIA_TODAY", "").strip()
    if override:
        return date.fromisoformat(override)
    if (tz or "").strip():
        return today_in_zone(tz)
    return date.today()
