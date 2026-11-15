"""Passive Media and Travel credits: owner, dates, caps, reversal, and source status."""

from datetime import UTC, date, datetime, timedelta

from fastapi.testclient import TestClient

from apps.media.backend.models import (
    Base as MediaBase,
)
from apps.media.backend.models import (
    CatalogItem,
    Episode,
    EpisodeProgress,
    UserEntry,
)
from apps.server.auth import Principal
from apps.server.database import open_database
from apps.server.main import Dependencies, Settings, create_app
from apps.server.town.clock import get_town_clock
from apps.server.town.engine import inn_day
from apps.server.town.models import Habit, TownBase
from apps.travel.backend.models import Base as TravelBase
from apps.travel.backend.models import Reminder, Trip

CLOCK = datetime(2026, 10, 29, 19, 0, tzinfo=UTC)
TODAY = date(2026, 10, 29)
FOUNDING = date(2026, 10, 5)
_AT = datetime(2026, 10, 1, tzinfo=UTC)


def _open(folder, clock=CLOCK):
    url = f"sqlite:///{folder / 'site.db'}"
    database = open_database(url)
    TownBase.metadata.create_all(database.engine)
    MediaBase.metadata.create_all(database.engine)
    TravelBase.metadata.create_all(database.engine)
    application = create_app(
        Settings(database_url=url, release="test", web_root=folder / "web", openapi=False),
        Dependencies(
            database=database,
            principal=Principal(1, "ada", "Ada"),
            check_schema=False,
            check_frontend=False,
        ),
    )
    application.dependency_overrides[get_town_clock] = lambda: clock
    return application, database


def _habit(db, user, slot=0, created=FOUNDING):
    habit = Habit(
        user_id=user,
        name=f"Habit {user}",
        slot=slot,
        building_style="cottage",
        per_week=7,
        created_on=created,
        created_at=_AT,
        name_key=f"habit {user}",
    )
    db.add(habit)
    db.flush()
    return habit


def _catalog(db, kind, title):
    row = CatalogItem(kind=kind, title=title, source="manual")
    db.add(row)
    db.flush()
    return row


def _entry(db, user, catalog, status, completed_on=None):
    row = UserEntry(
        user_id=user,
        catalog_id=catalog.id,
        status=status,
        completed_on=completed_on,
        created_at=_AT,
        updated_at=_AT,
    )
    db.add(row)
    db.flush()
    return row


def _episode(db, user, catalog, number, watched, watched_on):
    episode = Episode(
        catalog_id=catalog.id, season_number=1, episode_number=number, title=f"Episode {number}"
    )
    db.add(episode)
    db.flush()
    db.add(
        EpisodeProgress(user_id=user, episode_id=episode.id, watched=watched, watched_on=watched_on)
    )
    db.flush()
    return episode


def _trip(db, user, title, status, end, created):
    row = Trip(
        user_id=user,
        title=title,
        start_date=end - timedelta(days=2),
        end_date=end,
        status=status,
        counts_as_pto=False,
        created_at=created,
        updated_at=created,
    )
    db.add(row)
    db.flush()
    return row


def _reminder(db, trip, done_at):
    row = Reminder(trip_id=trip.id, title="Pack", done=done_at is not None, done_at=done_at)
    db.add(row)
    db.flush()
    return row


def _town(client, tz="America/Los_Angeles"):
    response = client.get("/api/town", params={"tz": tz})
    assert response.status_code == 200, response.text
    return response.json()


def test_la_and_utc_bucket_reminders_and_late_logs(tmp_path):
    folder = tmp_path / "zones"
    folder.mkdir()
    clock = datetime(2026, 11, 1, 18, 0, tzinfo=UTC)
    application, database = _open(folder, clock)
    db = database.sessionmaker()
    _habit(db, 1, created=date(2026, 10, 1))
    # 06:30 UTC on the fallback morning is still 31 Oct in Los Angeles and 1 Nov in UTC.
    trip = _trip(
        db, 1, "Boundary", "booked", date(2026, 10, 28), datetime(2026, 10, 29, 6, 30, tzinfo=UTC)
    )
    _reminder(db, trip, datetime(2026, 11, 1, 6, 30, tzinfo=UTC))
    db.commit()
    db.close()
    try:
        with TestClient(application) as client:
            la = _town(client, "America/Los_Angeles")
            utc = _town(client, "UTC")
    finally:
        database.engine.dispose()
    assert la["town"]["today"] == "2026-11-01"
    assert utc["town"]["today"] == "2026-11-01"
    # Logged 06:30 UTC 29 Oct is 28 Oct in Los Angeles, so only LA accepts end_date 28 Oct.
    assert la["buildings"]["inn"]["xp"] == inn_day(1, 1)
    assert la["buildings"]["inn"]["today_xp"] == inn_day(0, 0)
    assert utc["buildings"]["inn"]["xp"] == inn_day(1, 0)
    assert utc["buildings"]["inn"]["today_xp"] == inn_day(1, 0)
