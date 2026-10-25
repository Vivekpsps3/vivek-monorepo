from datetime import date
from typing import NoReturn
from urllib.parse import urlparse

from fastapi import HTTPException

KINDS = {"movie", "tv", "book", "track", "album", "artist", "game"}
STATUSES = {"want", "anticipating", "in_progress", "completed", "paused", "dropped"}
PROGRESS_UNITS = {"page", "percent", "episode", "hour"}
PRECISIONS = {"day", "month", "year", "unknown"}
RELEASE_STATUSES = {"scheduled", "released", "postponed", "unknown"}
SOURCES = {"manual", "tmdb", "musicbrainz", "openlibrary", "rawg", "tvmaze", "itunes"}


def fail(detail: str) -> NoReturn:
    raise HTTPException(status_code=422, detail=detail)


def clean_text(value, limit: int, field: str, required: bool = False) -> str | None:
    if value is None:
        if required:
            fail(f"{field} is required.")
        return None
    if not isinstance(value, str):
        fail(f"{field} must be text.")
    text = value.strip()
    if required and not text:
        fail(f"{field} is required.")
    if len(text) > limit:
        fail(f"{field} is too long.")
    return text or None


def season_number(value) -> int:
    if isinstance(value, bool):
        fail("Season needs a whole number.")
    if isinstance(value, float):
        if not value.is_integer():
            fail("Season needs a whole number.")
        number = int(value)
    elif isinstance(value, str):
        text = value.strip()
        negative = text.startswith("-")
        digits = text[1:] if negative else text
        if not digits.isdigit():
            fail("Season needs a whole number.")
        number = -int(digits) if negative else int(digits)
    elif isinstance(value, int):
        number = value
    else:
        fail("Season needs a whole number.")
    if number < 0 or number > 200:
        fail("Season numbers run from 0 to 200.")
    return number


def watched_flag(value) -> bool:
    if isinstance(value, bool):
        return value
    fail("Watched must be yes or no.")


def rating_value(value) -> float | None:
    if value is None or value == "":
        return None
    try:
        number = float(value)
    except (TypeError, ValueError):
        fail("Rating must be a number from 0 to 10.")
    if number < 0 or number > 10:
        fail("Rating must be from 0 to 10.")
    doubled = number * 2
    if abs(doubled - round(doubled)) > 1e-6:
        fail("Rating uses half-point steps.")
    return round(doubled) / 2


def http_url(value) -> str | None:
    text = clean_text(value, 1000, "Artwork")
    if not text:
        return None
    parsed = urlparse(text)
    if parsed.scheme not in ("http", "https") or not parsed.netloc:
        fail("Artwork must be an http or https link.")
    return text


def parse_date(value, field: str) -> date | None:
    if value is None or value == "":
        return None
    if isinstance(value, date):
        return value
    try:
        return date.fromisoformat(str(value)[:10])
    except ValueError:
        fail(f"{field} must be a date.")


def choice(value, allowed: set[str], field: str, default: str | None = None) -> str:
    if value is None or value == "":
        if default is None:
            fail(f"{field} is required.")
        return default
    if value not in allowed:
        fail(f"{field} is not recognized.")
    return value
