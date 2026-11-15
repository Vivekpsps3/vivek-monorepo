"""A trip is one leave-to-return span, with plans visible on the home payload."""

from datetime import date, timedelta


def monday_on_or_after(start: date) -> date:
    day = start
    while day.weekday() != 0:
        day += timedelta(days=1)
    return day


def test_trip_flow_home_calendar_budget_and_pto(client, monkeypatch):
    from apps.travel.backend.services import assemble

    class FixtureDate(date):
        @classmethod
        def today(cls):
            return cls(2026, 11, 1)

    monkeypatch.setattr(assemble, "date", FixtureDate)
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
    assert trip["pto"]["days"] == "5"
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
    assert upcoming["pto"]["balance_when_you_leave"] == "10"
    assert upcoming["pto"]["leftover_after"] == "5"
    assert body["next_pto"]["leftover_after"] == "5"

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


def test_finance_session_is_required(client):
    from apps.server.auth import require_principal

    client.app.dependency_overrides.pop(require_principal, None)
    assert client.get("/api/health").status_code == 200
    assert client.get("/api/home").status_code == 401
    assert client.get("/api/home").json()["detail"] == "Login required"
