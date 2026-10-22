"""Address search through OpenStreetMap Nominatim.

A city or place with no coordinates is looked up once when it is saved or when
the trip is opened. The same query is cached, so it is not sent again.
"""

import json
from datetime import UTC, datetime

import httpx

from apps.travel.backend.models import PlaceCache

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
            clean.append(
                {"label": str(hit["label"]), "lat": float(hit["lat"]), "lng": float(hit["lng"])}
            )
        except (KeyError, TypeError, ValueError):
            continue
    db.merge(PlaceCache(query=key, payload=json.dumps(clean), fetched_at=datetime.now(UTC)))
    return clean


def first_hit(db, query: str, fetch) -> dict | None:
    try:
        hits = cached_search(db, query, fetch)
    except ValueError:
        return None
    return hits[0] if hits else None


def pin_trip(db, trip, fetch) -> None:
    """Fill missing coordinates for cities, day plans, and parking."""
    for stay in trip.stays:
        if stay.lat is not None and stay.lng is not None:
            continue
        query = ", ".join(part for part in (stay.city, stay.region, stay.country) if part)
        hit = first_hit(db, query, fetch)
        if hit:
            stay.lat = hit["lat"]
            stay.lng = hit["lng"]

    def city_for(day) -> str | None:
        for stay in trip.stays:
            if stay.arrive_on <= day <= stay.leave_on:
                return stay.city
        return trip.stays[0].city if trip.stays else None

    for plan in trip.plans:
        if plan.lat is not None and plan.lng is not None:
            continue
        label = plan.place_name or plan.address or plan.title
        city = city_for(plan.on_date)
        query = f"{label}, {city}" if label and city else (label or "")
        hit = first_hit(db, query, fetch)
        if hit:
            plan.lat = hit["lat"]
            plan.lng = hit["lng"]

    home = trip.stays[0].city if trip.stays else None
    for spot in trip.parking:
        if spot.lat is not None and spot.lng is not None:
            continue
        label = spot.place_name or spot.address
        query = f"{label}, {home}" if label and home else (label or "")
        hit = first_hit(db, query, fetch)
        if hit:
            spot.lat = hit["lat"]
            spot.lng = hit["lng"]
