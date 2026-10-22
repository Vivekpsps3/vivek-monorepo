"""A trip is one leave-to-return span, with plans visible on the home payload."""

from datetime import date, timedelta
from decimal import Decimal


def monday_on_or_after(start: date) -> date:
    day = start
    while day.weekday() != 0:
        day += timedelta(days=1)
    return day


def test_health(client):
    assert client.get("/api/health").json()["app"] == "travel"


def test_trip_flow_home_calendar_budget_and_pto(client):
    start = monday_on_or_after(date(2026, 11, 2))
    end = start + timedelta(days=4)
    created = client.post(
        "/api/trips",
        json={
            "title": "Japan",
            "start_date": start.isoformat(),
            "end_date": end.isoformat(),
            "origin_label": "Home",
            "status": "booked",
            "counts_as_pto": True,
            "stays": [
                {
                    "city": "Tokyo",
                    "arrive_on": start.isoformat(),
                    "leave_on": (start + timedelta(days=2)).isoformat(),
                },
                {
                    "city": "Kyoto",
                    "arrive_on": (start + timedelta(days=2)).isoformat(),
                    "leave_on": end.isoformat(),
                },
            ],
            "transports": [
                {
                    "role": "outbound",
                    "mode": "flight",
                    "carrier": "United",
                    "number": "UA 837",
                    "depart_place": "SFO",
                    "arrive_place": "NRT",
                    "cost": "400.00",
                    "currency": "USD",
                    "paid": True,
                },
                {
                    "role": "connection",
                    "mode": "train",
                    "depart_place": "Tokyo",
                    "arrive_place": "Kyoto",
                    "cost": "120.00",
                },
                {
                    "role": "inbound",
                    "mode": "flight",
                    "number": "UA 838",
                    "depart_place": "KIX",
                    "arrive_place": "SFO",
                    "cost": "350.00",
                },
            ],
        },
    )
    assert created.status_code == 201, created.text
    trip = created.json()
    assert trip["cities"] == ["Tokyo", "Kyoto"]
    assert trip["nights"] == 4
    assert trip["pto"]["days"] == "5.0000"
    assert [item["role"] for item in trip["transports"]] == ["outbound", "connection", "inbound"]

    planned = client.post(
        f"/api/trips/{trip['id']}/plans",
        json={
            "on_date": start.isoformat(),
            "start_time": "19:00",
            "kind": "restaurant",
            "title": "Sushi Saito",
            "place_name": "Minato",
            "cost": "80.00",
        },
    )
    assert planned.status_code == 201, planned.text
    assert any(
        item["title"] == "Sushi Saito" for day in planned.json()["days"] for item in day["items"]
    )

    parked = client.post(
        f"/api/trips/{trip['id']}/parking",
        json={
            "necessary": "yes",
            "booked": False,
            "arrangement": "self_park",
            "place_name": "SFO garage",
            "cost": "40.00",
        },
    )
    assert parked.status_code == 201, parked.text
    assert any(item["place_name"] == "SFO garage" for item in parked.json()["parking"])

    extra = client.post(
        f"/api/trips/{trip['id']}/budget-lines",
        json={
            "category": "other",
            "label": "Travel insurance",
            "amount": "30.00",
            "currency": "USD",
        },
    )
    assert extra.status_code == 201, extra.text
    assert any(item["label"] == "Travel insurance" for item in extra.json()["budget"]["manual"])
    euros = client.post(
        f"/api/trips/{trip['id']}/budget-lines",
        json={"category": "other", "label": "Transit card", "amount": "20.00", "currency": "EUR"},
    )
    assert euros.status_code == 201, euros.text
    assert {item["label"] for item in euros.json()["budget"]["manual"]} >= {
        "Travel insurance",
        "Transit card",
    }

    policy = client.put(
        "/api/pto/policy",
        json={
            "accrual_amount": "0",
            "accrual_unit": "day",
            "accrual_cadence": "yearly",
            "hours_per_day": "8",
            "balance_days": "10",
            "balance_as_of": (start - timedelta(days=30)).isoformat(),
        },
    )
    assert policy.status_code == 200, policy.text

    home = client.get("/api/home")
    assert home.status_code == 200, home.text
    body = home.json()
    upcoming = body["upcoming"][0]
    assert upcoming["title"] == "Japan"
    dinner = [
        item
        for day in upcoming["days"]
        if day["on_date"] == start.isoformat()
        for item in day["items"]
    ]
    assert dinner[0]["title"] == "Sushi Saito"
    assert any(item["kind"] == "parking" for item in body["attention"])
    currencies = {item["currency"]: item for item in upcoming["budget"]["currencies"]}
    assert currencies["USD"]["total"] == "1020.00"
    assert currencies["USD"]["paid"] == "400.00"
    assert currencies["EUR"]["total"] == "20.00"
    outbound = next(
        item for item in currencies["USD"]["categories"] if item["category"] == "outbound_flight"
    )
    inbound = next(
        item for item in currencies["USD"]["categories"] if item["category"] == "inbound_flight"
    )
    assert outbound["amount"] == "400.00"
    assert inbound["amount"] == "350.00"
    assert upcoming["pto"]["balance_when_you_leave"] == "10.0000"
    assert upcoming["pto"]["leftover_after"] == "5.0000"
    assert body["next_pto"]["leftover_after"] == "5.0000"

    calendar = client.get(
        "/api/calendar", params={"start": start.isoformat(), "end": end.isoformat()}
    )
    assert calendar.status_code == 200
    assert calendar.json()["trips"][0]["cities"] == ["Tokyo", "Kyoto"]
    assert calendar.json()["plans"][0]["title"] == "Sushi Saito"

    outside = client.post(
        f"/api/trips/{trip['id']}/stays",
        json={
            "city": "Osaka",
            "arrive_on": (end + timedelta(days=3)).isoformat(),
            "leave_on": (end + timedelta(days=4)).isoformat(),
        },
    )
    assert outside.status_code == 422

    bad = client.post(
        "/api/trips",
        json={"title": "Backwards", "start_date": end.isoformat(), "end_date": start.isoformat()},
    )
    assert bad.status_code == 422

    assert client.delete(f"/api/trips/{trip['id']}").status_code == 204
    assert client.get(f"/api/trips/{trip['id']}").status_code == 404
    assert client.get("/api/pto").json()["entries"] == []


def test_manual_pto_and_preview(client):
    saved = client.put(
        "/api/pto/policy",
        json={
            "accrual_amount": "0",
            "accrual_unit": "day",
            "accrual_cadence": "yearly",
            "hours_per_day": "8",
            "balance_days": "12",
            "balance_as_of": "2026-01-01",
        },
    )
    assert saved.status_code == 200
    created = client.post(
        "/api/pto/entries",
        json={
            "label": "Appointment",
            "start_date": "2026-02-02",
            "end_date": "2026-02-02",
            "days": "1",
        },
    )
    assert created.status_code == 201
    entry_id = created.json()["entries"][0]["id"]
    preview = client.get(
        "/api/pto/preview", params={"start": "2026-03-02", "end": "2026-03-06", "days": "5"}
    )
    assert preview.status_code == 200, preview.text
    assert preview.json()["balance_when_you_leave"] == "11.0000"
    assert preview.json()["leftover_after"] == "6.0000"
    assert client.delete(f"/api/pto/entries/{entry_id}").status_code == 204


def test_flight_lookup_and_place_cache(client, monkeypatch):
    monkeypatch.delenv("FLIGHTAWARE_API_KEY", raising=False)
    missing = client.post(
        "/api/flights/lookup", json={"ident": "UA 837", "depart_on": "2026-11-02"}
    )
    assert missing.status_code == 503

    def fake_lookup(ident, _depart_on, api_key):
        assert ident == "UA837"
        assert api_key == "test-key"
        return [{"ident": "UAL837", "origin_iata": "SFO", "destination_iata": "NRT"}]

    from apps.travel.backend.deps import get_flight_lookup, get_geocoder

    client.app.dependency_overrides[get_flight_lookup] = lambda: fake_lookup
    saved = client.put("/api/settings/flightaware", json={"api_key": "test-key"})
    assert saved.json()["last4"] == "-key"
    assert "test-key" not in saved.text
    found = client.post("/api/flights/lookup", json={"ident": "ua 837", "depart_on": "2026-11-02"})
    assert found.status_code == 200
    assert found.json()["flights"][0]["origin_iata"] == "SFO"

    calls = {"n": 0}

    def fetch(_query):
        calls["n"] += 1
        return [{"label": "Test Cafe", "lat": 35.6, "lng": 139.7}]

    client.app.dependency_overrides[get_geocoder] = lambda: fetch
    first = client.get("/api/places/search", params={"q": "Test Cafe"})
    second = client.get("/api/places/search", params={"q": "test   cafe"})
    assert first.json()["results"][0]["label"] == "Test Cafe"
    assert second.json()["results"][0]["lng"] == 139.7
    assert calls["n"] == 1


def test_trips_stay_with_the_finance_user(client):
    from apps.travel.backend.deps import AuthResult, Principal

    created = client.post(
        "/api/trips",
        json={
            "title": "Mine",
            "start_date": "2026-11-02",
            "end_date": "2026-11-06",
            "stays": [],
            "transports": [],
        },
    )
    assert created.status_code == 201, created.text
    trip_id = created.json()["id"]
    client.app.state.principal_checker = lambda _request: AuthResult(
        Principal(2, "other", "Other"), []
    )
    assert client.get(f"/api/trips/{trip_id}").status_code == 404
    assert client.get("/api/home").json()["upcoming"] == []
    assert client.get("/api/settings").json()["account"]["name"] == "Other"


def test_cities_are_placed_on_the_map_when_the_trip_is_saved(client):
    from apps.travel.backend.deps import get_geocoder

    def fetch(query):
        places = {
            "lisbon": {"label": "Lisbon", "lat": 38.72, "lng": -9.14},
            "porto": {"label": "Porto", "lat": 41.15, "lng": -8.61},
        }
        hit = places.get(query.split(",")[0].strip().lower())
        return [hit] if hit else []

    client.app.dependency_overrides[get_geocoder] = lambda: fetch
    created = client.post(
        "/api/trips",
        json={
            "title": "Portugal",
            "start_date": "2026-12-02",
            "end_date": "2026-12-06",
            "stays": [
                {"city": "Lisbon", "arrive_on": "2026-12-02", "leave_on": "2026-12-04"},
                {"city": "Porto", "arrive_on": "2026-12-04", "leave_on": "2026-12-06"},
            ],
            "transports": [],
        },
    )
    assert created.status_code == 201, created.text
    stays = {stay["city"]: stay for stay in created.json()["stays"]}
    assert stays["Lisbon"]["lat"] == 38.72
    assert stays["Porto"]["lng"] == -8.61
    again = client.get(f"/api/trips/{created.json()['id']}")
    assert again.json()["stays"][0]["lat"] == 38.72


def test_finance_session_is_required(client, monkeypatch):
    from fastapi import HTTPException

    client.app.state.principal_checker = None

    def deny(_request):
        raise HTTPException(status_code=401, detail="Sign in through Finance.")

    monkeypatch.setattr("apps.travel.backend.deps.fetch_principal", deny)
    assert client.get("/api/health").status_code == 200
    assert client.get("/api/home").status_code == 401
    assert client.get("/api/home").json()["detail"] == "Sign in through Finance."
