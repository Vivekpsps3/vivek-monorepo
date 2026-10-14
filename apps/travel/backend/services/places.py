"""Address search through OpenStreetMap Nominatim.

Search runs only when you ask to find a place. Results are cached so the same
address is not sent again. Saves do not geocode on their own.
"""

import json
from datetime import UTC, datetime

import httpx

from models import PlaceCache

NOMINATIM_URL = "https://nominatim.openstreetmap.org/search"
USER_AGENT = "vivek-travel/0.1 (personal self-hosted travel planner)"


def normalize_query(query: str) -> str:
    return " ".join((query or "").split())


def nominatim_search(query: str) -> list[dict]:
    response = httpx.get(
        NOMINATIM_URL,
        params={"q": query, "format": "jsonv2", "limit": 5},
        headers={"User-Agent": USER_AGENT, "Accept": "application/json"},
        timeout=8.0,
    )
    response.raise_for_status()
    hits = []
    for row in response.json():
        if not isinstance(row, dict):
            continue
        try:
            hits.append(
                {
                    "label": (row.get("display_name") or query).strip(),
                    "lat": float(row["lat"]),
                    "lng": float(row["lon"]),
                }
            )
        except (KeyError, TypeError, ValueError):
            continue
    return hits


def cached_search(db, query: str, fetch) -> list[dict]:
    key = normalize_query(query).lower()
    if len(key) < 2:
        raise ValueError("Enter a longer place name.")
    row = db.get(PlaceCache, key)
    if row is not None:
        try:
            cached = json.loads(row.payload)
        except ValueError:
            cached = None
        if isinstance(cached, list):
            return cached
    try:
        hits = fetch(normalize_query(query)) or []
    except Exception:
        return []
    clean = []
    for hit in hits:
        if not isinstance(hit, dict):
            continue
        try:
            clean.append({"label": str(hit["label"]), "lat": float(hit["lat"]), "lng": float(hit["lng"])})
        except (KeyError, TypeError, ValueError):
            continue
    db.merge(PlaceCache(query=key, payload=json.dumps(clean), fetched_at=datetime.now(UTC)))
    return clean
