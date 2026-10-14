"""FastAPI dependencies."""

import os

from services.flights import lookup_flights
from services.places import nominatim_search


def get_geocoder():
    return nominatim_search


def get_flight_lookup():
    return lookup_flights


def flightaware_key(db) -> tuple[str | None, str | None]:
    """Env wins over a key saved from the settings page."""
    from models import Setting

    env = os.getenv("FLIGHTAWARE_API_KEY", "").strip()
    if env:
        return env, "environment"
    row = db.get(Setting, "flightaware_api_key")
    if row is not None and row.value.strip():
        return row.value.strip(), "database"
    return None, None


def access_token() -> str:
    return os.getenv("TRAVEL_ACCESS_TOKEN", "").strip()
