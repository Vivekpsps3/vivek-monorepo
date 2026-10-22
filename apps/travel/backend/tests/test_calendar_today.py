from datetime import date


class _PinnedDate(date):
    @classmethod
    def today(cls):
        return date(2026, 6, 15)


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
    monkeypatch.setattr("apps.travel.backend.services.assemble.date", _PinnedDate)
    response = client.get("/api/calendar", params={"start": "2026-10-01", "end": "2026-10-31"})
    assert response.status_code == 200, response.text
    assert response.json()["today"] == "2026-06-15"


def test_partial_zone_name_does_not_500(client):
    response = client.get(
        "/api/calendar",
        params={"start": "2026-10-01", "end": "2026-10-31", "tz": "America"},
    )
    assert response.status_code == 200, response.text
