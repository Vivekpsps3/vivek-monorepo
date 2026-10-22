from datetime import date


def test_calendar_today_uses_the_client_zone(client, monkeypatch):
    monkeypatch.setattr(
        "apps.travel.backend.routers.board.today_in_zone",
        lambda zone, now=None: date(2026, 10, 21),
    )
    response = client.get(
        "/api/calendar",
        params={"start": "2026-10-01", "end": "2026-10-31", "tz": "America/Los_Angeles"},
    )
    assert response.status_code == 200, response.text
    assert response.json()["today"] == "2026-10-21"


def test_calendar_without_a_zone_stays_on_the_server_date(client, monkeypatch):
    monkeypatch.setattr(
        "apps.travel.backend.routers.board.today_in_zone",
        lambda zone, now=None: date(1999, 1, 1),
    )
    response = client.get("/api/calendar", params={"start": "2026-10-01", "end": "2026-10-31"})
    assert response.status_code == 200, response.text
    assert response.json()["today"] == date.today().isoformat()
