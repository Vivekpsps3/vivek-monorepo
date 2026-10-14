"""FlightAware AeroAPI lookup.

Manual flight entry always works. A lookup sends only the flight ident and a
two-day window to FlightAware. The API key stays on the server.
"""

import re
from datetime import date, timedelta

import httpx

AEROAPI_URL = "https://aeroapi.flightaware.com/aeroapi/flights/{ident}"


class FlightAwareError(Exception):
    def __init__(self, status_code: int, message: str):
        super().__init__(message)
        self.status_code = status_code
        self.message = message


def normalize_ident(raw: str) -> str:
    text = "".join((raw or "").upper().split())
    if not re.fullmatch(r"[A-Z0-9]{2,12}", text or ""):
        raise ValueError("Enter a flight number such as UA 837.")
    return text


def _text(value) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    return text or None


def _airport(node) -> dict:
    if not isinstance(node, dict):
        return {"iata": None, "city": None, "name": None, "timezone": None}
    return {
        "iata": _text(node.get("code_iata")),
        "city": _text(node.get("city")),
        "name": _text(node.get("name")),
        "timezone": _text(node.get("timezone")),
    }


def _delay(value) -> int | None:
    if value is None or value == "":
        return None
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def parse_flights(payload: dict) -> list[dict]:
    flights = payload.get("flights") if isinstance(payload, dict) else None
    if not isinstance(flights, list):
        return []
    parsed = []
    for flight in flights:
        if not isinstance(flight, dict):
            continue
        origin = _airport(flight.get("origin"))
        destination = _airport(flight.get("destination"))
        ident = _text(flight.get("ident_iata")) or _text(flight.get("ident")) or ""
        if not ident:
            continue
        parsed.append(
            {
                "ident": _text(flight.get("ident")) or ident,
                "ident_iata": _text(flight.get("ident_iata")),
                "status": _text(flight.get("status")),
                "aircraft_type": _text(flight.get("aircraft_type")),
                "origin_iata": origin["iata"],
                "origin_city": origin["city"],
                "origin_name": origin["name"],
                "origin_timezone": origin["timezone"],
                "destination_iata": destination["iata"],
                "destination_city": destination["city"],
                "destination_name": destination["name"],
                "destination_timezone": destination["timezone"],
                "scheduled_out": _text(flight.get("scheduled_out")),
                "estimated_out": _text(flight.get("estimated_out")),
                "actual_out": _text(flight.get("actual_out")),
                "scheduled_in": _text(flight.get("scheduled_in")),
                "estimated_in": _text(flight.get("estimated_in")),
                "actual_in": _text(flight.get("actual_in")),
                "gate_origin": _text(flight.get("gate_origin")),
                "gate_destination": _text(flight.get("gate_destination")),
                "terminal_origin": _text(flight.get("terminal_origin")),
                "terminal_destination": _text(flight.get("terminal_destination")),
                "baggage_claim": _text(flight.get("baggage_claim")),
                "departure_delay_seconds": _delay(flight.get("departure_delay")),
                "arrival_delay_seconds": _delay(flight.get("arrival_delay")),
            }
        )
    parsed.sort(key=lambda item: item.get("scheduled_out") or "")
    return parsed


def lookup_flights(ident: str, depart_on: date, api_key: str, client: httpx.Client | None = None) -> list[dict]:
    """Return normalized candidates. Raises FlightAwareError on provider failure."""
    normalized = normalize_ident(ident)
    params = {
        "start": f"{depart_on.isoformat()}T00:00:00Z",
        "end": f"{(depart_on + timedelta(days=2)).isoformat()}T00:00:00Z",
    }
    headers = {"x-apikey": api_key, "Accept": "application/json"}
    url = AEROAPI_URL.format(ident=normalized)
    owns_client = client is None
    client = client or httpx.Client(timeout=20.0)
    try:
        response = client.get(url, params=params, headers=headers)
    except httpx.HTTPError as exc:
        raise FlightAwareError(502, "FlightAware could not be reached.") from exc
    finally:
        if owns_client:
            client.close()
    if response.status_code == 401:
        raise FlightAwareError(401, "FlightAware rejected the API key.")
    if response.status_code == 404:
        return []
    if response.status_code == 429:
        raise FlightAwareError(429, "FlightAware rate limit reached. Try again shortly.")
    if response.status_code >= 400:
        raise FlightAwareError(502, "FlightAware could not look up that flight.")
    try:
        payload = response.json()
    except ValueError as exc:
        raise FlightAwareError(502, "FlightAware returned an unreadable response.") from exc
    return parse_flights(payload)
