"""FlightAware responses collapse to the fields the trip form can save."""

import sys
from datetime import date
from pathlib import Path

import httpx
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from apps.travel.backend.services.flights import (
    FlightAwareError,
    lookup_flights,
)

SAMPLE = {
    "flights": [
        {
            "ident": "UAL837",
            "ident_iata": "UA837",
            "operator": "UAL",
            "operator_iata": "UA",
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


def test_lookup_reports_a_timeout():
    def handler(_request: httpx.Request) -> httpx.Response:
        raise httpx.ReadTimeout("slow")

    client = httpx.Client(transport=httpx.MockTransport(handler))
    with pytest.raises(FlightAwareError) as caught:
        lookup_flights("UA837", date(2026, 11, 2), "secret", client=client, today=date(2026, 11, 2))
    assert caught.value.status_code == 504
    assert caught.value.code == "provider_timeout"
