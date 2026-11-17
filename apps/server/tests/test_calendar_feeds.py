"""Synthetic capabilities only. No real URL or private owner data in artifacts."""

import hashlib
import logging
from datetime import date, datetime, timedelta
from urllib.parse import parse_qs, urlsplit

import httpx
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import inspect, text

from apps.media.backend.models import CatalogItem, Episode, Release, UserEntry
from apps.server import calendar
from apps.server.auth import Principal, require_principal
from apps.server.database import open_database
from apps.server.identity.models import CalendarFeed, User, UserSession
from apps.server.identity.session import SESSION_COOKIE_NAME, _hash_secret, utc_now_naive
from apps.server.main import Dependencies, Settings, create_app
from apps.server.migrations import adopt_or_upgrade
from apps.server.rate_limit import clear_limits
from apps.travel.backend.models import Reminder, Transport, Trip

TODAY = date(2026, 3, 8)  # US DST boundary.
ORIGIN = "https://calendar.example.test"
MANAGE = "/api/account/calendar-feeds"


@pytest.fixture
def feeds(tmp_path, monkeypatch):
    clear_limits()
    monkeypatch.setenv("CORS_ORIGINS", ORIGIN)
    monkeypatch.setattr(calendar, "feed_today", lambda _zone: TODAY)
    url = f"sqlite:///{tmp_path / 'calendar.db'}"
    adopt_or_upgrade(url)
    database = open_database(url)
    with database.sessionmaker.begin() as db:
        db.add_all(
            [
                User(id=1, email="one@example.test", display_name="One"),
                User(id=2, email="two@example.test", display_name="Two"),
            ]
        )
    app = create_app(
        Settings(url, "test", tmp_path),
        Dependencies(
            database=database,
            principal=Principal(1, "one", "One"),
            check_schema=False,
            check_frontend=False,
        ),
    )
    with TestClient(app, base_url=ORIGIN) as client:
        yield client, database, app
    database.engine.dispose()
    clear_limits()


def create(client, scope="travel", zone="America/Los_Angeles"):
    response = client.post(MANAGE, json={"scope": scope, "timezone": zone})
    assert response.status_code == 201, response.text
    assert response.headers["cache-control"] == "no-store, private"
    return response.json()


def plant(database):
    with database.sessionmaker.begin() as db:
        trip = Trip(
            user_id=1,
            title="Trip, with; punctuation\\and\r\nBEGIN:EVIL " + "旅行" * 45,
            start_date=TODAY,
            end_date=TODAY + timedelta(days=2),
            notes="PRIVATE_TRIP_NOTE",
        )
        foreign = Trip(user_id=2, title="FOREIGN_TRIP", start_date=TODAY, end_date=TODAY)
        outside = Trip(
            user_id=1,
            title="OUTSIDE_WINDOW",
            start_date=TODAY + timedelta(days=35),
            end_date=TODAY + timedelta(days=36),
        )
        db.add_all([trip, foreign, outside])
        db.flush()
        db.add_all(
            [
                Transport(
                    trip_id=trip.id,
                    mode="flight",
                    role="outbound",
                    carrier="Synthetic Air",
                    number="42",
                    depart_at=datetime(2026, 3, 8, 10, 15),
                    depart_tz="America/New_York",
                ),
                Reminder(
                    trip_id=trip.id,
                    title="Local reminder",
                    due_at=datetime(2026, 3, 8, 10, 30),
                    notes="PRIVATE_REMINDER_NOTE",
                ),
                Reminder(trip_id=trip.id, title="All day", due_at=datetime(2026, 3, 8)),
                Reminder(
                    trip_id=trip.id, title="DONE_REMINDER", due_at=datetime(2026, 3, 8), done=True
                ),
                Reminder(
                    trip_id=trip.id,
                    title="First included",
                    due_at=datetime.combine(TODAY - timedelta(days=7), datetime.min.time()),
                ),
                Reminder(
                    trip_id=trip.id,
                    title="Last included",
                    due_at=datetime.combine(TODAY + timedelta(days=34), datetime.min.time()),
                ),
                Reminder(
                    trip_id=trip.id,
                    title="BEFORE_WINDOW",
                    due_at=datetime.combine(TODAY - timedelta(days=8), datetime.min.time()),
                ),
            ]
        )
        movie = CatalogItem(kind="movie", title="MEDIA_MOVIE", source="manual")
        show = CatalogItem(kind="tv", title="MEDIA_SHOW", source="manual")
        other = CatalogItem(kind="tv", title="FOREIGN_SHOW", source="manual")
        uncertain = CatalogItem(kind="movie", title="MONTH_ONLY", source="manual")
        db.add_all([movie, show, other, uncertain])
        db.flush()
        db.add_all(
            [
                UserEntry(
                    user_id=1, catalog_id=movie.id, anticipated=True, review="PRIVATE_MEDIA_NOTE"
                ),
                UserEntry(user_id=1, catalog_id=show.id),
                UserEntry(user_id=2, catalog_id=other.id),
                UserEntry(user_id=1, catalog_id=uncertain.id, anticipated=True),
                Episode(
                    catalog_id=show.id,
                    season_number=1,
                    episode_number=1,
                    title="MEDIA_EPISODE",
                    air_date=TODAY,
                ),
                Episode(
                    catalog_id=other.id,
                    season_number=1,
                    episode_number=1,
                    title="FOREIGN_EPISODE",
                    air_date=TODAY,
                ),
                Release(catalog_id=movie.id, precision="day", released_on=TODAY),
                Release(
                    catalog_id=movie.id, precision="day", released_on=TODAY + timedelta(days=1)
                ),
                Release(
                    catalog_id=uncertain.id, precision="month", released_on=TODAY.replace(day=1)
                ),
            ]
        )


def test_hash_only_scopes_owner_isolation_rotation_revocation_and_no_cookie(feeds):
    client, database, app = feeds
    plant(database)
    one = create(client)
    two = create(client, "media")
    token = parse_qs(urlsplit(one["url"]).query)["token"][0]
    with database.sessionmaker() as db:
        row = db.get(CalendarFeed, one["id"])
        assert row.token_hash == hashlib.sha256(token.encode()).hexdigest()
        assert {
            column["name"] for column in inspect(database.engine).get_columns("calendar_feeds")
        } == {"id", "user_id", "scope", "timezone", "token_hash", "created_at"}
        assert token not in str(db.execute(text("SELECT * FROM calendar_feeds")).all())
    listed = client.get(MANAGE).json()
    assert all(set(row) == {"id", "scope", "timezone"} for row in listed)
    assert client.post(MANAGE, json={"scope": "travel", "timezone": "UTC"}).status_code == 409
    app.dependency_overrides[require_principal] = lambda: Principal(2, "two", "Two")
    assert client.get(MANAGE).json() == []
    assert client.post(f"{MANAGE}/{one['id']}/rotate").status_code == 404
    assert client.delete(f"{MANAGE}/{one['id']}").status_code == 404
    foreign = create(client)
    assert "FOREIGN_TRIP" in client.get(foreign["url"]).text
    app.dependency_overrides[require_principal] = lambda: Principal(1, "one", "One")
    client.cookies.clear()  # A calendar capability authorizes its selected owner independent of session cookies.
    assert client.get(one["url"]).status_code == 200
    assert "FOREIGN_TRIP" not in client.get(one["url"]).text
    assert "MEDIA_MOVIE" in client.get(two["url"]).text
    rotated = client.post(f"{MANAGE}/{one['id']}/rotate").json()
    assert rotated["url"] != one["url"]
    assert client.get(one["url"]).status_code == 404
    assert client.get(rotated["url"]).status_code == 200
    assert client.delete(f"{MANAGE}/{one['id']}").status_code == 204
    assert client.get(rotated["url"]).status_code == 404
    assert client.get(two["url"]).status_code == 200


def test_escaped_bounded_all_day_and_zoned_events_are_database_only(feeds, monkeypatch):
    client, database, _app = feeds
    plant(database)
    monkeypatch.setattr(
        httpx.Client, "__init__", lambda *_a, **_k: pytest.fail("provider I/O from saved calendar")
    )
    # The existing TestClient remains usable; constructing a provider client is forbidden.
    travel = client.get(create(client)["url"])
    assert travel.status_code == 200
    assert travel.headers["content-type"].startswith("text/calendar")
    lines = travel.content.split(b"\r\n")
    assert all(len(line) <= 75 for line in lines)
    assert b"\n" not in travel.content.replace(b"\r\n", b"")
    unfolded = travel.text.replace("\r\n ", "")
    assert "DTSTART:20260308T141500Z" in unfolded  # New York after the DST transition.
    assert "DTSTART:20260308T173000Z" in unfolded  # Reminder in saved LA timezone.
    assert "DTSTART;VALUE=DATE:20260308" in unfolded
    assert "Trip\\, with\\; punctuation\\\\and\\nBEGIN:EVIL" in unfolded
    assert "\r\nBEGIN:EVIL" not in unfolded
    assert "First included" in unfolded and "Last included" in unfolded
    for marker in [
        "BEFORE_WINDOW",
        "OUTSIDE_WINDOW",
        "DONE_REMINDER",
        "FOREIGN",
        "PRIVATE_",
        "MEDIA_",
        "Finance",
        "Health",
    ]:
        assert marker not in unfolded
    media = client.get(create(client, "media")["url"]).text
    assert "MEDIA_EPISODE" in media and "MEDIA_MOVIE" in media
    for marker in ["MONTH_ONLY", "FOREIGN", "PRIVATE_", "Trip", "Finance", "Health"]:
        assert marker not in media
    assert "DTSTART;VALUE=DATE:20260308" in media
    identities = [
        line for line in media.replace("\r\n ", "").splitlines() if line.startswith("UID:")
    ]
    assert len(identities) == len(set(identities)) == 3


def test_conditional_reads_reauthorize_and_reflect_source_edits(feeds):
    client, database, _app = feeds
    plant(database)
    feed = create(client)
    response = client.get(feed["url"])
    etag = response.headers["etag"]
    assert response.headers["cache-control"] == "private, no-cache"
    for value in [etag, etag.removeprefix("W/"), f'"other", {etag}', "*"]:
        cached = client.get(feed["url"], headers={"If-None-Match": value})
        assert cached.status_code == 304 and not cached.content
    with database.sessionmaker.begin() as db:
        trip = db.query(Trip).filter(Trip.user_id == 1).first()
        trip.title = "CHANGED_TITLE"
    changed = client.get(feed["url"], headers={"If-None-Match": etag})
    assert changed.status_code == 200 and changed.headers["etag"] != etag
    assert "CHANGED_TITLE" in changed.text
    client.delete(f"{MANAGE}/{feed['id']}")
    assert (
        client.get(feed["url"], headers={"If-None-Match": changed.headers["etag"]}).status_code
        == 404
    )


def test_validation_https_invalid_disabled_owner_limits_and_redaction(feeds, caplog):
    client, database, _app = feeds
    for scope, zone in [("finance", "UTC"), ("health", "UTC"), ("travel", "Invalid/Timezone")]:
        assert client.post(MANAGE, json={"scope": scope, "timezone": zone}).status_code == 422
    assert (
        client.post(
            "http://calendar.example.test" + MANAGE, json={"scope": "travel", "timezone": "UTC"}
        ).status_code
        == 422
    )
    feed = create(client)
    token = parse_qs(urlsplit(feed["url"]).query)["token"][0]
    caplog.set_level(logging.DEBUG)
    logging.getLogger("calendar-test").warning("fetch %s", feed["url"])
    try:
        raise ValueError(feed["url"])
    except ValueError:
        logging.getLogger("calendar-test").exception("synthetic capability failure")
    client.get("/calendar/feed.ics?token=invalid")
    assert token not in caplog.text and "token=[redacted]" in caplog.text
    assert client.get(feed["url"].replace("https:", "http:")).status_code == 404
    with database.sessionmaker.begin() as db:
        db.get(User, 1).is_active = False
    assert client.get(feed["url"]).status_code == 404
    clear_limits()
    for _ in range(30):
        client.get(feed["url"])
    limited = client.get(feed["url"])
    assert limited.status_code == 429 and limited.headers["retry-after"] == "60"
    clear_limits()
    assert client.get("/calendar/feed.ics?token=" + "x" * 43).status_code == 404


def test_more_than_fifty_events_keep_summary_defaults_and_feed_has_no_silent_truncation(feeds):
    client, database, _app = feeds
    with database.sessionmaker.begin() as db:
        trip = Trip(user_id=1, title="Busy trip", start_date=TODAY, end_date=TODAY)
        db.add(trip)
        db.flush()
        db.add_all(
            [
                Reminder(
                    trip_id=trip.id,
                    title=f"Event {index}",
                    due_at=datetime.combine(TODAY, datetime.min.time()),
                )
                for index in range(60)
            ]
        )
    assert (
        len(client.get("/travel/api/summary?start=2026-03-08&end=2026-03-08").json()["up_next"])
        == 50
    )
    feed = create(client)
    body = client.get(feed["url"]).text
    assert body.count("BEGIN:VEVENT") == 61
    with database.sessionmaker.begin() as db:
        db.add_all(
            [
                Reminder(
                    trip_id=trip.id,
                    title=f"Extra {index}",
                    due_at=datetime.combine(TODAY, datetime.min.time()),
                )
                for index in range(1000)
            ]
        )
    assert client.get(feed["url"]).status_code == 503


def test_management_requires_real_session_and_csrf_but_reader_requires_only_capability(feeds):
    client, database, app = feeds
    app.dependency_overrides.pop(require_principal)
    assert client.get(MANAGE).status_code == 401
    assert client.post(MANAGE, json={"scope": "travel", "timezone": "UTC"}).status_code == 401
    with database.sessionmaker.begin() as db:
        db.add(
            UserSession(
                user_id=1,
                token_hash=_hash_secret("synthetic-session"),
                csrf_token_hash=_hash_secret("synthetic-csrf"),
                expires_at=utc_now_naive() + timedelta(hours=1),
            )
        )
    client.cookies.set(SESSION_COOKIE_NAME, "synthetic-session")
    assert client.post(MANAGE, json={"scope": "travel", "timezone": "UTC"}).status_code == 403
    response = client.post(
        MANAGE,
        json={"scope": "travel", "timezone": "UTC"},
        headers={"X-CSRF-Token": "synthetic-csrf"},
    )
    assert response.status_code == 201
    client.cookies.clear()
    assert client.get(response.json()["url"]).status_code == 200


def test_deleted_owner_cascades_capability_and_ip_budget_bounds_random_probes(feeds):
    client, database, _app = feeds
    feed = create(client)
    with database.sessionmaker.begin() as db:
        db.execute(text("DELETE FROM users WHERE id=1"))
    assert client.get(feed["url"]).status_code == 404
    with database.sessionmaker() as db:
        assert db.query(CalendarFeed).count() == 0
    clear_limits()
    for index in range(120):
        client.get("/calendar/feed.ics?token=" + f"{index:043d}")
    assert client.get("/calendar/feed.ics?token=invalid").status_code == 429
