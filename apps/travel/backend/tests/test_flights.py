"""FlightAware responses collapse to the fields the trip form can save."""

import sys
from datetime import date
from pathlib import Path

import httpx
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from services.flights import FlightAwareError, lookup_flights, normalize_ident, parse_flights

SAMPLE = {
    "flights": [
        {
            "ident": "UAL837",
            "ident_iata": "UA837",
            "status": "Scheduled",
            "aircraft_type": "B789",
            "origin": {
                "code": "KSFO",
                "code_iata": "SFO",
                "name": "San Francisco Intl",
                "city": "San Francisco",
                "timezone": "America/Los_Angeles",
            },
            "destination": {
                "code": "RJAA",
                "code_iata": "NRT",
                "name": "Narita Intl",
                "city": "Tokyo",
                "timezone": "Asia/Tokyo",
            },
            "scheduled_out": "2026-11-02T18:00:00Z",
            "estimated_out": "2026-11-02T18:10:00Z",
            "actual_out": None,
            "scheduled_in": "2026-11-03T22:30:00Z",
            "gate_origin": "G4",
            "gate_destination": "12",
            "terminal_origin": "I",
            "terminal_destination": "1",
            "departure_delay": 600,
            "arrival_delay": 0,
            "baggage_claim": "3",
        }
    ]
}


def test_normalize_ident_strips_spaces():
    assert normalize_ident(" ua 837 ") == "UA837"
    with pytest.raises(ValueError):
        normalize_ident("!!!")


def test_parse_flights_keeps_airports_gates_and_delay():
    flights = parse_flights(SAMPLE)
    assert flights[0]["ident_iata"] == "UA837"
    assert flights[0]["origin_iata"] == "SFO"
    assert flights[0]["destination_timezone"] == "Asia/Tokyo"
    assert flights[0]["gate_origin"] == "G4"
    assert flights[0]["departure_delay_seconds"] == 600
    assert flights[0]["baggage_claim"] == "3"


def test_lookup_uses_the_key_header_and_maps_the_body():
    def handler(request: httpx.Request) -> httpx.Response:
        assert request.headers["x-apikey"] == "secret"
        assert request.url.path.endswith("/UA837")
        return httpx.Response(200, json=SAMPLE)

    client = httpx.Client(transport=httpx.MockTransport(handler))
    flights = lookup_flights("UA 837", date(2026, 11, 2), "secret", client=client)
    assert flights[0]["origin_city"] == "San Francisco"


def test_lookup_reports_a_rejected_key():
    client = httpx.Client(transport=httpx.MockTransport(lambda _request: httpx.Response(401)))
    with pytest.raises(FlightAwareError) as caught:
        lookup_flights("UA1", date(2026, 11, 2), "nope", client=client)
    assert caught.value.status_code == 401
