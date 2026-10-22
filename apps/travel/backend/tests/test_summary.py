"""Hub summary: the next trip only, with no budget or PTO."""

from datetime import date, timedelta


def _keys(value):
    found = set()
    if isinstance(value, dict):
        found.update(value)
        for item in value.values():
            found.update(_keys(item))
    elif isinstance(value, list):
        for item in value:
            found.update(_keys(item))
    return found


def test_summary_next_trip(client):
    today = date.today()
    empty = client.get("/api/summary")
    assert empty.status_code == 200, empty.text
    assert empty.json() == {"today": today.isoformat(), "next_trip": None}
    assert {"budget", "pto"}.isdisjoint(_keys(empty.json()))

    past_start = today - timedelta(days=10)
    past_end = today - timedelta(days=2)
    past = client.post(
        "/api/trips",
        json={
            "title": "Already home",
            "start_date": past_start.isoformat(),
            "end_date": past_end.isoformat(),
            "stays": [
                {
                    "city": "Oslo",
                    "arrive_on": past_start.isoformat(),
                    "leave_on": past_end.isoformat(),
                }
            ],
        },
    )
    assert past.status_code == 201, past.text
    assert client.get("/api/summary").json()["next_trip"] is None

    start = today + timedelta(days=12)
    end = start + timedelta(days=5)
    created = client.post(
        "/api/trips",
        json={
            "title": "Lisbon",
            "start_date": start.isoformat(),
            "end_date": end.isoformat(),
            "origin_label": "SFO",
            "stays": [
                {
                    "city": "Lisbon",
                    "arrive_on": start.isoformat(),
                    "leave_on": (start + timedelta(days=2)).isoformat(),
                },
                {
                    "city": "Porto",
                    "arrive_on": (start + timedelta(days=2)).isoformat(),
                    "leave_on": end.isoformat(),
                },
            ],
        },
    )
    assert created.status_code == 201, created.text
    trip_id = created.json()["id"]
    summary = client.get("/api/summary")
    assert summary.status_code == 200, summary.text
    body = summary.json()
    assert body["today"] == today.isoformat()
    assert body["next_trip"] == {
        "id": trip_id,
        "title": "Lisbon",
        "destination": "Lisbon",
        "origin_label": "SFO",
        "start_date": start.isoformat(),
        "end_date": end.isoformat(),
        "phase": "upcoming",
        "days_until": 12,
        "next_action": "Review the plan",
        "href": f"/travel/#/trips/{trip_id}",
    }
    assert {"budget", "pto"}.isdisjoint(_keys(body))

    live_start = today - timedelta(days=1)
    live_end = today + timedelta(days=3)
    live = client.post(
        "/api/trips",
        json={
            "title": "Here now",
            "start_date": live_start.isoformat(),
            "end_date": live_end.isoformat(),
            "origin_label": "Home",
            "stays": [
                {
                    "city": "Oakland",
                    "arrive_on": live_start.isoformat(),
                    "leave_on": live_end.isoformat(),
                }
            ],
        },
    )
    assert live.status_code == 201, live.text
    current = client.get("/api/summary").json()
    assert current["next_trip"]["id"] == live.json()["id"]
    assert current["next_trip"]["phase"] == "in_progress"
    assert current["next_trip"]["next_action"] == "Open today's plan"
    assert current["next_trip"]["destination"] == "Oakland"
    assert current["next_trip"]["days_until"] == 0
    assert current["next_trip"]["href"] == f"/travel/#/trips/{live.json()['id']}"
    assert {"budget", "pto"}.isdisjoint(_keys(current))


def test_summary_leaves_tomorrow(client):
    today = date.today()
    start = today + timedelta(days=1)
    end = start + timedelta(days=2)
    created = client.post(
        "/api/trips",
        json={
            "title": "Overnight",
            "start_date": start.isoformat(),
            "end_date": end.isoformat(),
            "stays": [
                {"city": "Seattle", "arrive_on": start.isoformat(), "leave_on": end.isoformat()}
            ],
        },
    )
    assert created.status_code == 201, created.text
    nxt = client.get("/api/summary").json()["next_trip"]
    assert nxt["phase"] == "upcoming"
    assert nxt["days_until"] == 1
    assert nxt["next_action"] == "Leaves tomorrow"
    assert nxt["destination"] == "Seattle"


def test_summary_without_a_city(client):
    today = date.today()
    start = today + timedelta(days=4)
    end = start + timedelta(days=1)
    created = client.post(
        "/api/trips",
        json={"title": "Unplaced", "start_date": start.isoformat(), "end_date": end.isoformat()},
    )
    assert created.status_code == 201, created.text
    nxt = client.get("/api/summary").json()["next_trip"]
    assert nxt["destination"] is None
    assert nxt["origin_label"] is None
    assert nxt["next_action"] == "Review the plan"
