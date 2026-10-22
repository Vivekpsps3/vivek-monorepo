"""Today follows the reader's timezone across the UTC day boundary."""

from datetime import UTC, date, datetime

from packages.time.today import today_in_zone


def test_today_is_still_the_previous_local_day_after_utc_midnight():
    late_evening_pacific = datetime(2026, 10, 22, 6, 30, tzinfo=UTC)
    assert today_in_zone("America/Los_Angeles", late_evening_pacific) == date(2026, 10, 21)
    assert today_in_zone("UTC", late_evening_pacific) == date(2026, 10, 22)
    just_after_pacific_midnight = datetime(2026, 10, 22, 7, 0, tzinfo=UTC)
    assert today_in_zone("America/Los_Angeles", just_after_pacific_midnight) == date(2026, 10, 22)


def test_dst_and_far_east_boundaries():
    # Pacific spring-forward day, and the UTC+14 date line.
    before_pacific_day = datetime(2026, 3, 8, 7, 59, tzinfo=UTC)
    on_pacific_day = datetime(2026, 3, 8, 8, 0, tzinfo=UTC)
    assert today_in_zone("America/Los_Angeles", before_pacific_day) == date(2026, 3, 7)
    assert today_in_zone("America/Los_Angeles", on_pacific_day) == date(2026, 3, 8)
    before_fall = datetime(2026, 11, 2, 7, 59, tzinfo=UTC)
    on_fall = datetime(2026, 11, 2, 8, 0, tzinfo=UTC)
    assert today_in_zone("America/Los_Angeles", before_fall) == date(2026, 11, 1)
    assert today_in_zone("America/Los_Angeles", on_fall) == date(2026, 11, 2)
    before_line = datetime(2026, 10, 22, 9, 59, tzinfo=UTC)
    after_line = datetime(2026, 10, 22, 10, 0, tzinfo=UTC)
    assert today_in_zone("Pacific/Kiritimati", before_line) == date(2026, 10, 22)
    assert today_in_zone("Pacific/Kiritimati", after_line) == date(2026, 10, 23)


def test_unknown_zone_falls_back_to_utc():
    moment = datetime(2026, 10, 22, 6, 30, tzinfo=UTC)
    assert today_in_zone("Not/AZone", moment) == date(2026, 10, 22)
    assert today_in_zone(None, moment) == date(2026, 10, 22)
    assert today_in_zone("../etc/passwd", moment) == date(2026, 10, 22)
    for name in ("America", "Europe", "Etc"):
        assert today_in_zone(name, moment) == date(2026, 10, 22)


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


def test_partial_zone_name_does_not_500(client, monkeypatch):
    monkeypatch.delenv("MEDIA_TODAY", raising=False)
    response = client.get("/api/calendar", params={"tz": "America", "month": "2026-10"})
    assert response.status_code == 200, response.text
