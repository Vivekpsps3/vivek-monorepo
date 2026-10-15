"""Plain-text helpers. Reviews are never treated as HTML."""

import math
from decimal import Decimal
from urllib.parse import urlparse


def clean_rating(value):
    """None, or a number from 0 to 10 in half steps. 0 is a real rating."""
    if value is None:
        return None
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise ValueError("Rating must be from 0 to 10 in half steps.")
    if isinstance(value, float) and not math.isfinite(value):
        raise ValueError("Rating must be from 0 to 10 in half steps.")
    number = Decimal(str(value))
    doubled = number * 2
    if number < 0 or number > 10 or doubled != doubled.to_integral_value():
        raise ValueError("Rating must be from 0 to 10 in half steps.")
    return float(number)


def clean_artwork(value: str | None) -> str | None:
    if value is None:
        return None
    text = value.strip()
    if not text:
        return None
    parsed = urlparse(text)
    if parsed.scheme not in ("http", "https") or not parsed.netloc:
        raise ValueError("Artwork URL must be an http(s) link.")
    return text


def blank(value: str | None, limit: int, *, label: str = "This text") -> str | None:
    if value is None:
        return None
    if len(value) > limit:
        raise ValueError(f"{label} must be {limit} characters or fewer.")
    text = value.strip()
    return text or None


def shorten(text: str | None, limit: int) -> str | None:
    if text is None:
        return None
    collapsed = " ".join(str(text).split())
    if not collapsed:
        return None
    if len(collapsed) <= limit:
        return collapsed
    cut = collapsed[:limit].rsplit(" ", 1)[0]
    if len(cut) < max(40, limit - 40):
        cut = collapsed[:limit].rstrip()
    return cut.rstrip(".,;:—- ") + "…"


def excerpt(text: str | None, limit: int = 140) -> str:
    return shorten(text, limit) or ""
