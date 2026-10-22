"""Today follows the reader's timezone across the UTC day boundary."""

from datetime import date, datetime, timezone

from packages.time.today import today_in_zone


def test_today_is_still_the_previous_local_day_after_utc_midnight():
    late_evening_pacific = datetime(2026, 10, 22, 6, 30, tzinfo=timezone.utc)
    assert today_in_zone("America/Los_Angeles", late_evening_pacific) == date(2026, 10, 21)
    assert today_in_zone("UTC", late_evening_pacific) == date(2026, 10, 22)
    just_after_pacific_midnight = datetime(2026, 10, 22, 7, 0, tzinfo=timezone.utc)
    assert today_in_zone("America/Los_Angeles", just_after_pacific_midnight) == date(2026, 10, 22)


def test_unknown_zone_falls_back_to_utc():
    moment = datetime(2026, 10, 22, 6, 30, tzinfo=timezone.utc)
    assert today_in_zone("Not/AZone", moment) == date(2026, 10, 22)
    assert today_in_zone(None, moment) == date(2026, 10, 22)
    assert today_in_zone("../etc/passwd", moment) == date(2026, 10, 22)


def test_calendar_today_follows_the_client_zone(client, monkeypatch):
    monkeypatch.delenv("MEDIA_TODAY", raising=False)
    monkeypatch.setattr(
        "apps.media.backend.services.clock.today_in_zone",
        lambda zone, now=None: date(2026, 10, 21),
    )
    payload = client.get("/api/calendar", params={"tz": "America/Los_Angeles", "month": "2026-10"})
    assert payload.status_code == 200, payload.text
    assert payload.json()["today"] == "2026-10-21"

    monkeypatch.setenv("MEDIA_TODAY", "2026-10-16")
    pinned = client.get("/api/calendar", params={"tz": "America/Los_Angeles", "month": "2026-10"})
    assert pinned.json()["today"] == "2026-10-16"
