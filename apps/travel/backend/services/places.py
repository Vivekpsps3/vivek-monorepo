"""Explicit place lookup with expiring caching and public Nominatim pacing."""

import json
import math
import os
import time
from datetime import UTC, datetime, timedelta
from threading import Lock

import httpx

from apps.server.database import release_for_provider_io
from apps.server.errors import APIError
from apps.travel.backend.models import PlaceCache

NOMINATIM_URL = "https://nominatim.openstreetmap.org/search"
USER_AGENT = "personal-suite/1.0 (https://vivekpanchagnula.com)"
_RATE_LOCK = Lock()
_next_request = 0.0
POSITIVE_TTL = timedelta(days=7)
EMPTY_TTL = timedelta(minutes=5)


def normalize_query(query: str) -> str:
    return " ".join((query or "").split())


def _clean(hits) -> list[dict]:
    clean = []
    for row in hits[:5] if isinstance(hits, list) else []:
        if not isinstance(row, dict):
            continue
        try:
            longitude = row.get("lng", row.get("lon"))
            if longitude is None:
                continue
            lat, lng = float(row["lat"]), float(longitude)
        except (KeyError, TypeError, ValueError):
            continue
        if not math.isfinite(lat) or not math.isfinite(lng) or abs(lat) > 90 or abs(lng) > 180:
            continue
        label = str(row.get("label") or row.get("display_name") or "").strip()[:500]
        if label:
            clean.append({"label": label, "lat": lat, "lng": lng})
    return clean


def nominatim_search(query: str) -> list[dict]:
    global _next_request
    if not _RATE_LOCK.acquire(timeout=0.05):
        raise APIError(429, "throttled", "Place search is busy. Try again shortly.", retry_after=1)
    try:
        delay = _next_request - time.monotonic()
        if delay > 0:
            time.sleep(delay)
        _next_request = time.monotonic() + 1.0
        response = httpx.get(
            os.environ.get("TRAVEL_GEOCODER_URL", NOMINATIM_URL),
            params={"q": query, "format": "jsonv2", "limit": 5},
            headers={"User-Agent": USER_AGENT, "Accept": "application/json"},
            timeout=3.0,
        )
        response.raise_for_status()
        payload = response.json()
        if not isinstance(payload, list):
            raise APIError(502, "provider_response", "Place search returned an invalid response.")
        return _clean(payload)
    except httpx.TimeoutException as exc:
        raise APIError(504, "timeout", "Place search timed out. Try again.") from exc
    except httpx.HTTPStatusError as exc:
        if exc.response.status_code == 429:
            raise APIError(
                429, "throttled", "Place search is busy. Try again shortly.", retry_after=1
            ) from exc
        code = "provider_auth" if exc.response.status_code in {401, 403} else "provider_unavailable"
        raise APIError(502, code, "Place search is unavailable. Try again later.") from exc
    except (httpx.HTTPError, ValueError) as exc:
        raise APIError(
            502, "provider_unavailable", "Place search is unavailable. Try again later."
        ) from exc
    finally:
        _RATE_LOCK.release()


def cached_search(db, query: str, fetch) -> list[dict]:
    normalized = normalize_query(query)
    if not 2 <= len(normalized) <= 200:
        raise ValueError("Enter a place name between 2 and 200 characters.")
    key = normalized.lower()
    now = datetime.now(UTC)
    row = db.get(PlaceCache, key)
    if row is not None:
        try:
            cached = json.loads(row.payload)
        except ValueError:
            cached = None
        fetched = (
            row.fetched_at.replace(tzinfo=UTC) if row.fetched_at.tzinfo is None else row.fetched_at
        )
        if isinstance(cached, list) and now - fetched < (POSITIVE_TTL if cached else EMPTY_TTL):
            return _clean(cached)
    release_for_provider_io(db)
    try:
        hits = _clean(fetch(normalized))
    except APIError:
        raise
    except Exception as exc:
        raise APIError(
            502, "provider_unavailable", "Place search is unavailable. Try again later."
        ) from exc
    db.query(PlaceCache).filter(PlaceCache.fetched_at < now - POSITIVE_TTL).delete(
        synchronize_session=False
    )
    db.merge(PlaceCache(query=key, payload=json.dumps(hits), fetched_at=now))
    return hits
