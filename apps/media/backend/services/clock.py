import os
from datetime import date


def today() -> date:
    override = os.getenv("MEDIA_TODAY", "").strip()
    if override:
        return date.fromisoformat(override)
    return date.today()
