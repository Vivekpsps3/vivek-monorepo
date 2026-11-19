"""Synthetic AeroAPI pages. No live provider call and no real key."""

import sys
from datetime import date
from pathlib import Path

import httpx
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from apps.travel.backend.deps import get_flight_lookup
from apps.travel.backend.services.flights import (
    FlightAwareError,
    SavedLeg,
    lookup_flights,
    refresh_saved_leg,
    resolve_refresh,
)

TODAY = date(2026, 11, 19)
FUTURE = date(2027, 5, 19)
SCHEDULED_OUT = "2027-05-19T18:00:00Z"
SCHEDULED_IN = "2027-05-20T22:30:00Z"
FLIGHT_ID = "UAL837-synthetic-occurrence"


def _schedule_row(**extra):
    row = {
        "ident": "UAL837",
        "ident_iata": "UA837",
        "ident_icao": "UAL837",
        "actual_ident": None,
        "fa_flight_id": None,
        "aircraft_type": "B789",
        "origin_iata": "SFO",
        "origin_icao": "KSFO",
        "destination_iata": "NRT",
        "destination_icao": "RJAA",
        "scheduled_out": SCHEDULED_OUT,
        "scheduled_in": SCHEDULED_IN,
    }
    row.update(extra)
    return row


def _operational_row(**extra):
    row = {
        "ident": "UAL837",
        "ident_iata": "UA837",
        "ident_icao": "UAL837",
        "fa_flight_id": FLIGHT_ID,
        "operator": "UAL",
        "operator_iata": "UA",
        "status": "Scheduled",
        "aircraft_type": "B789",
        "origin": {
            "code": "KSFO",
            "code_iata": "SFO",
            "city": "San Francisco",
            "timezone": "America/Los_Angeles",
        },
        "destination": {
            "code": "RJAA",
            "code_iata": "NRT",
            "city": "Tokyo",
            "timezone": "Asia/Tokyo",
        },
        "scheduled_out": SCHEDULED_OUT,
        "scheduled_in": SCHEDULED_IN,
        "estimated_out": "2027-05-19T18:05:00Z",
        "gate_origin": "G4",
    }
    row.update(extra)
    return row


def _client(handler):
    return httpx.Client(transport=httpx.MockTransport(handler))


def test_lookup_reports_a_timeout():
    def handler(_request: httpx.Request) -> httpx.Response:
        raise httpx.ReadTimeout("slow")

    client = _client(handler)
    with pytest.raises(FlightAwareError) as caught:
        lookup_flights(
            "UA837", date(2026, 11, 2), "synthetic-key", client=client, today=date(2026, 11, 2)
        )
    assert caught.value.status_code == 504
    assert caught.value.code == "provider_timeout"
    assert caught.value.message == "FlightAware took too long. Type the times yourself."


def test_future_schedule_then_operational_refresh_keeps_one_leg(client, monkeypatch):
    calls = []

    def handler(request: httpx.Request) -> httpx.Response:
        calls.append((request.url.path, dict(request.url.params)))
        path = request.url.path
        if path.endswith("/schedules/2027-05-19/2027-05-20"):
            assert request.url.params["airline"] == "UA"
            assert request.url.params["flight_number"] == "837"
            assert request.url.params["max_pages"] == "1"
            assert request.url.params["include_codeshares"] == "true"
            return httpx.Response(200, json={"scheduled": [_schedule_row()], "links": {}})
        if path.endswith("/flights/UA837"):
            assert request.url.params["max_pages"] == "1"
            assert request.url.params["ident_type"] == "designator"
            return httpx.Response(200, json={"flights": [_operational_row()]})
        raise AssertionError(path)

    http = _client(handler)
    monkeypatch.setenv("FLIGHTAWARE_API_KEY", "synthetic-key")

    def lookup(ident, depart_on, key):
        assert key == "synthetic-key"
        today = TODAY if not calls else FUTURE
        return lookup_flights(ident, depart_on, key, client=http, today=today)

    client.app.dependency_overrides[get_flight_lookup] = lambda: lookup
    created = client.post(
        "/api/trips",
        json={
            "title": "Advance",
            "start_date": "2027-05-19",
            "end_date": "2027-05-21",
            "stays": [{"city": "Tokyo", "arrive_on": "2027-05-19", "leave_on": "2027-05-21"}],
        },
    )
    assert created.status_code == 201, created.text
    trip_id = created.json()["id"]

    first = client.post("/api/flights/lookup", json={"ident": "UA 837", "depart_on": "2027-05-19"})
    assert first.status_code == 200, first.text
    body = first.json()
    assert body["incomplete"] is False
    assert len(body["flights"]) == 1
    candidate = body["flights"][0]
    assert candidate["source"] == "schedules"
    assert candidate["fa_flight_id"] is None
    assert candidate["origin_timezone"] is None
    assert candidate["estimated_out"] is None
    assert candidate["codeshares"] == []
    assert "synthetic-key" not in first.text

    saved = client.post(
        f"/api/trips/{trip_id}/transports",
        json={
            "role": "outbound",
            "mode": "flight",
            "number": "UA837",
            "carrier": "UA",
            "depart_place": "SFO",
            "arrive_place": "NRT",
            "depart_at": "2027-05-19T09:15",
            "arrive_at": "2027-05-20T07:30",
            "fa_ident": "UAL837",
            "fa_scheduled_out": SCHEDULED_OUT,
            "fa_scheduled_in": SCHEDULED_IN,
            "status": "planned",
            "currency": "USD",
        },
    )
    assert saved.status_code == 201, saved.text
    assert len(saved.json()["transports"]) == 1
    existing = saved.json()["transports"][0]
    assert existing["depart_at"] == "2027-05-19T09:15"
    assert existing["fa_flight_id"] is None

    later = client.post("/api/flights/lookup", json={"ident": "UA837", "depart_on": "2027-05-19"})
    assert later.status_code == 200, later.text
    operational = later.json()["flights"]
    assert len(operational) == 1
    assert operational[0]["source"] == "flights"
    assert operational[0]["fa_flight_id"] == FLIGHT_ID
    assert operational[0]["gate_origin"] == "G4"
    leg = SavedLeg(
        ident=existing["number"],
        operating_ident=existing["fa_ident"],
        origin=existing["depart_place"],
        destination=existing["arrive_place"],
        scheduled_out=existing["fa_scheduled_out"],
        fa_flight_id=existing["fa_flight_id"],
    )
    resolution = resolve_refresh([leg], operational)
    assert resolution.action == "update"
    assert resolution.index == 0
    patched = refresh_saved_leg(existing, operational[0])
    assert patched["depart_at"] == "2027-05-19T09:15"
    assert patched["arrive_at"] == "2027-05-20T07:30"
    assert patched["fa_flight_id"] == FLIGHT_ID
    updated = client.patch(f"/api/transports/{existing['id']}", json=_transport_body(patched))
    assert updated.status_code == 200, updated.text
    rows = updated.json()["transports"]
    assert len(rows) == 1
    assert rows[0]["id"] == existing["id"]
    assert rows[0]["fa_flight_id"] == FLIGHT_ID
    assert rows[0]["depart_at"] == "2027-05-19T09:15"
    assert rows[0]["fa_gate_origin"] == "G4"
    assert len(calls) == 2


def test_distinct_lookup_remedies_do_not_call_the_provider_when_they_cannot(client, monkeypatch):
    calls = []

    def handler(request: httpx.Request) -> httpx.Response:
        calls.append(request.url.path)
        if request.url.path.endswith("/schedules/2027-11-18/2027-11-19"):
            return httpx.Response(400, json={"detail": "bound"})
        if "/history/flights/" in request.url.path:
            return httpx.Response(403, json={"title": "not entitled"})
        if request.url.path.endswith("/schedules/2027-05-19/2027-05-20"):
            if request.url.params.get("flight_number") == "999":
                return httpx.Response(400, json={"detail": "unknown"})
            return httpx.Response(
                429,
                headers={"retry-after": "12"},
                json={"title": "slow down"},
            )
        raise httpx.ReadTimeout("slow")

    http = _client(handler)
    monkeypatch.delenv("FLIGHTAWARE_API_KEY", raising=False)
    client.app.dependency_overrides[get_flight_lookup] = lambda: (
        lambda ident, depart_on, key: (_ for _ in ()).throw(AssertionError("lookup called"))
    )
    missing = client.post("/api/flights/lookup", json={"ident": "UA837", "depart_on": "2027-05-19"})
    assert missing.status_code == 503
    assert missing.json()["code"] == "provider_unconfigured"
    assert "Type the times yourself" in missing.json()["message"]
    assert calls == []

    monkeypatch.setenv("FLIGHTAWARE_API_KEY", "synthetic-key")

    def lookup(ident, depart_on, key):
        return lookup_flights(ident, depart_on, key, client=http, today=TODAY)

    client.app.dependency_overrides[get_flight_lookup] = lambda: lookup

    unsupported = client.post(
        "/api/flights/lookup", json={"ident": "UA837", "depart_on": "2027-11-20"}
    )
    assert unsupported.status_code == 422
    assert unsupported.json()["code"] == "schedule_unavailable"
    assert calls == []

    ancient = client.post("/api/flights/lookup", json={"ident": "UA837", "depart_on": "2010-12-31"})
    assert ancient.status_code == 422
    assert ancient.json()["code"] == "schedule_unavailable"
    assert calls == []

    tail = client.post("/api/flights/lookup", json={"ident": "N12345", "depart_on": "2027-05-19"})
    assert tail.status_code == 422
    assert tail.json()["code"] == "invalid"
    assert tail.json()["field_errors"]["ident"].startswith("Future schedules need")
    assert calls == []

    anniversary = client.post(
        "/api/flights/lookup", json={"ident": "UA837", "depart_on": "2027-11-18"}
    )
    assert anniversary.status_code == 422
    assert anniversary.json()["code"] == "schedule_unavailable"
    assert calls == ["/aeroapi/schedules/2027-11-18/2027-11-19"]

    empty = client.post("/api/flights/lookup", json={"ident": "UA999", "depart_on": "2027-05-19"})
    assert empty.status_code == 200
    assert empty.json()["flights"] == []
    assert len(calls) == 2

    history = client.post("/api/flights/lookup", json={"ident": "UA837", "depart_on": "2012-01-02"})
    assert history.status_code == 502
    assert history.json()["code"] == "provider_entitlement"
    assert "historical flights" in history.json()["message"]

    throttled = client.post(
        "/api/flights/lookup", json={"ident": "UA837", "depart_on": "2027-05-19"}
    )
    assert throttled.status_code == 429
    assert throttled.json()["code"] == "provider_throttled"
    assert throttled.json()["retry_after"] == 12
    assert throttled.headers["retry-after"] == "12"

    def explode(ident, depart_on, key):
        raise FlightAwareError(
            504, "FlightAware took too long. Type the times yourself.", code="provider_timeout"
        )

    client.app.dependency_overrides[get_flight_lookup] = lambda: explode
    timed_out = client.post(
        "/api/flights/lookup", json={"ident": "UA837", "depart_on": "2026-11-19"}
    )
    assert timed_out.status_code == 504
    assert timed_out.json()["code"] == "provider_timeout"


def test_codeshares_and_routes_stay_separate_and_ambiguity_does_not_save(client, monkeypatch):
    def handler(request: httpx.Request) -> httpx.Response:
        assert request.url.params["max_pages"] == "1"
        return httpx.Response(
            200,
            json={
                "scheduled": [
                    _schedule_row(),
                    _schedule_row(origin_iata="LAX", origin_icao="KLAX", destination_iata="HND"),
                    _schedule_row(
                        ident="ANA101",
                        ident_iata="NH101",
                        ident_icao="ANA101",
                        actual_ident="UA837",
                        actual_ident_iata="UA837",
                        origin_iata="SFO",
                        destination_iata="NRT",
                    ),
                ],
                "links": {"next": "https://aeroapi.flightaware.com/aeroapi/schedules?cursor=more"},
            },
        )

    monkeypatch.setenv("FLIGHTAWARE_API_KEY", "synthetic-key")
    http = _client(handler)

    def lookup(ident, depart_on, key):
        return lookup_flights(ident, depart_on, key, client=http, today=TODAY)

    client.app.dependency_overrides[get_flight_lookup] = lambda: lookup
    created = client.post(
        "/api/trips",
        json={
            "title": "Choices",
            "start_date": "2027-05-19",
            "end_date": "2027-05-21",
            "stays": [{"city": "Tokyo", "arrive_on": "2027-05-19", "leave_on": "2027-05-21"}],
        },
    )
    found = client.post("/api/flights/lookup", json={"ident": "UA0837", "depart_on": "2027-05-19"})
    assert found.status_code == 200, found.text
    payload = found.json()
    assert payload["incomplete"] is True
    routes = {
        (row["origin_iata"], row["destination_iata"], row["ident"]) for row in payload["flights"]
    }
    assert routes == {("SFO", "NRT", "UAL837"), ("LAX", "HND", "UAL837"), ("SFO", "NRT", "ANA101")}
    codeshare = next(row for row in payload["flights"] if row["ident"] == "ANA101")
    assert codeshare["actual_ident"] == "UA837"
    assert codeshare["operator"] is None
    detail = client.get(f"/api/trips/{created.json()['id']}")
    assert detail.json()["transports"] == []
    resolution = resolve_refresh([], payload["flights"])
    assert resolution.action == "ambiguous"


def test_two_saved_legs_are_not_auto_updated_and_a_changed_time_is_explained():
    candidate = {
        "ident": "UAL837",
        "ident_iata": "UA837",
        "fa_flight_id": FLIGHT_ID,
        "origin_iata": "SFO",
        "destination_iata": "NRT",
        "scheduled_out": "2027-05-19T19:00:00Z",
    }
    leg = SavedLeg("UA837", "UAL837", "SFO", "NRT", SCHEDULED_OUT, FLIGHT_ID)
    other = SavedLeg("UA837", "UAL837", "SFO", "NRT", SCHEDULED_OUT, FLIGHT_ID)
    assert resolve_refresh([leg, other], [candidate]).action == "ambiguous"
    changed = resolve_refresh([leg], [candidate])
    assert changed.action == "update"
    assert changed.index == 0
    assert changed.explanation == "The scheduled departure changed. Your edited time is unchanged."
    existing = {
        "depart_at": "2027-05-19T09:15",
        "arrive_at": "2027-05-20T07:30",
        "fa_scheduled_out": SCHEDULED_OUT,
        "fa_flight_id": FLIGHT_ID,
        "number": "UA837",
    }
    refreshed = refresh_saved_leg(existing, candidate)
    assert refreshed["depart_at"] == "2027-05-19T09:15"
    assert refreshed["arrive_at"] == "2027-05-20T07:30"
    assert refreshed["fa_scheduled_out"] == "2027-05-19T19:00:00Z"
    assert refreshed["number"] == "UA837"


def test_a_failed_lookup_leaves_the_saved_override_in_place(client, monkeypatch):
    monkeypatch.setenv("FLIGHTAWARE_API_KEY", "synthetic-key")
    created = client.post(
        "/api/trips",
        json={
            "title": "Held",
            "start_date": "2027-05-19",
            "end_date": "2027-05-21",
            "stays": [{"city": "Tokyo", "arrive_on": "2027-05-19", "leave_on": "2027-05-21"}],
        },
    )
    saved = client.post(
        f"/api/trips/{created.json()['id']}/transports",
        json=_transport_body(
            {
                "number": "UA837",
                "depart_place": "SFO",
                "arrive_place": "NRT",
                "depart_at": "2027-05-19T09:15",
                "arrive_at": "2027-05-20T07:30",
                "fa_ident": "UAL837",
                "fa_scheduled_out": SCHEDULED_OUT,
            }
        ),
    )
    before = saved.json()["transports"][0]

    def explode(ident, depart_on, key):
        raise FlightAwareError(
            504, "FlightAware took too long. Type the times yourself.", code="provider_timeout"
        )

    client.app.dependency_overrides[get_flight_lookup] = lambda: explode
    failed = client.post("/api/flights/lookup", json={"ident": "UA837", "depart_on": "2027-05-19"})
    assert failed.status_code == 504
    again = client.get(f"/api/trips/{created.json()['id']}")
    rows = again.json()["transports"]
    assert len(rows) == 1
    assert rows[0]["id"] == before["id"]
    assert rows[0]["depart_at"] == "2027-05-19T09:15"
    assert rows[0]["fa_scheduled_out"] == SCHEDULED_OUT


def _transport_body(source: dict) -> dict:
    body = {
        "role": "outbound",
        "mode": "flight",
        "status": "planned",
        "currency": "USD",
    }
    keep = {
        "carrier",
        "number",
        "depart_place",
        "arrive_place",
        "depart_at",
        "arrive_at",
        "depart_tz",
        "arrive_tz",
        "confirmation",
        "seat",
        "cost",
        "currency",
        "paid",
        "status",
        "notes",
        "fa_ident",
        "fa_flight_id",
        "fa_status",
        "fa_aircraft",
        "fa_gate_origin",
        "fa_gate_destination",
        "fa_terminal_origin",
        "fa_terminal_destination",
        "fa_baggage_claim",
        "fa_delay_departure_seconds",
        "fa_delay_arrival_seconds",
        "fa_scheduled_out",
        "fa_estimated_out",
        "fa_actual_out",
        "fa_scheduled_in",
        "fa_estimated_in",
        "fa_actual_in",
        "fa_fetched_at",
    }
    for key, value in source.items():
        if key in keep and value is not None:
            body[key] = value
    return body
