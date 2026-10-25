"""Request-scoped Travel helpers. Identity comes from the site principal."""

import os

from apps.travel.backend.services.flights import lookup_flights
from apps.travel.backend.services.places import nominatim_search


def get_geocoder():
    return nominatim_search


def get_flight_lookup():
    return lookup_flights


def settings_key(user_id: int, name: str) -> str:
    return f"user:{user_id}:{name}"


def flightaware_key(db, user_id: int) -> tuple[str | None, str | None]:
    """Env wins over a key saved from the settings page."""
    from apps.travel.backend.models import Setting

    env = os.getenv("FLIGHTAWARE_API_KEY", "").strip()
    if env:
        return env, "environment"
    row = db.get(Setting, settings_key(user_id, "flightaware_api_key"))
    if row is not None and row.value.strip():
        return row.value.strip(), "database"
    return None, None
