"""Passive Media and Travel credits: owner, dates, caps, reversal, and source status."""

from datetime import UTC, date, datetime, timedelta
from zoneinfo import ZoneInfo

from fastapi.testclient import TestClient
from sqlalchemy import event, text

from apps.media.backend.models import (
    Base as MediaBase,
)
from apps.media.backend.models import (
    CatalogItem,
    Episode,
    EpisodeProgress,
    UserEntry,
)
from apps.server.auth import Principal, require_principal
from apps.server.database import open_database
from apps.server.main import Dependencies, Settings, create_app
from apps.server.town.clock import get_town_clock
from apps.server.town.engine import inn_day, library_day
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


def test_eligible_rows_credit_once_and_reversal_retracts(tmp_path):
    folder = tmp_path / "credits"
    folder.mkdir()
    application, database = _open(folder)
    db = database.sessionmaker()
    _habit(db, 1)
    _habit(db, 2)
    show = _catalog(db, "tv", "Show")
    kept = _episode(db, 1, show, 1, True, TODAY)
    _episode(db, 1, show, 2, True, TODAY)
    _episode(db, 1, show, 3, True, FOUNDING)
    _episode(db, 1, show, 4, True, FOUNDING - timedelta(days=1))
    _episode(db, 1, show, 5, True, TODAY + timedelta(days=1))
    _episode(db, 1, show, 6, False, TODAY)
    _episode(db, 1, show, 7, True, None)
    _episode(db, 2, show, 8, True, TODAY)
    movie = _catalog(db, "movie", "Film")
    film = _entry(db, 1, movie, "completed", TODAY)
    _entry(db, 1, _catalog(db, "book", "Early"), "completed", FOUNDING - timedelta(days=1))
    _entry(db, 1, _catalog(db, "game", "Later"), "completed", TODAY + timedelta(days=1))
    _entry(db, 1, _catalog(db, "book", "Reading"), "in_progress", TODAY)
    _entry(db, 1, _catalog(db, "movie", "Undated"), "completed", None)
    _entry(db, 1, _catalog(db, "album", "Record"), "completed", TODAY)
    _entry(db, 2, _catalog(db, "movie", "Theirs"), "completed", TODAY)
    own_trip = _trip(
        db, 1, "Booked", "booked", TODAY - timedelta(days=1), datetime(2026, 10, 20, tzinfo=UTC)
    )
    _trip(db, 1, "Done", "done", date(2026, 10, 10), datetime(2026, 10, 10, tzinfo=UTC))
    _trip(
        db, 1, "Planning", "planning", TODAY - timedelta(days=1), datetime(2026, 10, 20, tzinfo=UTC)
    )
    _trip(db, 1, "Late", "done", date(2026, 10, 20), datetime(2026, 10, 21, 18, tzinfo=UTC))
    _trip(db, 2, "Foreign trip", "done", date(2026, 10, 10), datetime(2026, 10, 10, tzinfo=UTC))
    for offset in range(4):
        _reminder(db, own_trip, datetime(2026, 10, 29, 18, offset, tzinfo=UTC))
    foreign = _trip(db, 2, "Foreign reminders", "planning", TODAY, _AT)
    _reminder(db, foreign, datetime(2026, 10, 29, 18, tzinfo=UTC))
    _reminder(db, own_trip, None)
    db.commit()
    statements: list[str] = []

    def capture(_conn, _cursor, statement, _parameters, _context, _executemany):
        statements.append(statement)

    event.listen(database.engine, "before_cursor_execute", capture)
    try:
        with TestClient(application) as client:
            body = _town(client)
            library = body["buildings"]["library"]
            inn = body["buildings"]["inn"]
            # Today: 2 episodes + 1 film, capped. Founding day: 1 episode. Before/after/foreign/album: none.
            assert library["source"] == "ok"
            assert library["today_xp"] == library_day(2, 1) == 10
            assert library["xp"] == library_day(2, 1) + library_day(1, 0)
            assert inn["source"] == "ok"
            assert inn["today_cap"] == 15
            # Four reminders cap at 15; booked trip credits today (end+1) and the October 10 trip credits that day.
            assert inn["today_xp"] == inn_day(4, 1) == 45
            assert inn["xp"] == inn_day(4, 1) + inn_day(0, 1)
            assert body["town"]["xp"] == library["xp"] + inn["xp"]
            grouped = [
                item
                for item in statements
                if "sqlite_master" not in item.lower()
                and any(
                    name in item.lower()
                    for name in ("episode_progress", "user_entries", "reminders", "from trips")
                )
            ]
            assert len(grouped) == 4
            assert all("group by" in item.lower() for item in grouped)
            progress = db.get(EpisodeProgress, 1)
            assert progress is not None and progress.episode_id == kept.id
            progress.watched = False
            progress.watched_on = None
            film.status = "paused"
            film.completed_on = None
            db.commit()
            retracted = _town(client)
            assert retracted["buildings"]["library"]["today_xp"] == library_day(1, 0)
            assert retracted["buildings"]["library"]["xp"] == library_day(1, 0) + library_day(1, 0)
            progress.watched = True
            progress.watched_on = TODAY
            db.commit()
            restored = _town(client)
            assert restored["buildings"]["library"]["today_xp"] == library_day(2, 0)
            assert restored["buildings"]["library"]["xp"] == library_day(2, 0) + library_day(1, 0)
            application.dependency_overrides[require_principal] = lambda: Principal(2, "bea", "Bea")
            other = _town(client)
            assert other["buildings"]["library"]["xp"] == library_day(0, 1)
            assert other["buildings"]["inn"]["xp"] == inn_day(1, 1)
            assert other["town"]["name"] == body["town"]["name"]
    finally:
        event.remove(database.engine, "before_cursor_execute", capture)
        db.close()
        database.engine.dispose()


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


def test_empty_sources_stay_available_and_a_failure_drops_only_that_xp(tmp_path):
    folder = tmp_path / "empty"
    folder.mkdir()
    application, database = _open(folder)
    db = database.sessionmaker()
    _habit(db, 1)
    db.commit()
    try:
        with TestClient(application) as client:
            empty = _town(client)
            assert empty["buildings"]["library"]["source"] == "ok"
            assert empty["buildings"]["inn"]["source"] == "ok"
            assert empty["buildings"]["library"]["xp"] == 0
            assert empty["buildings"]["inn"]["xp"] == 0
            assert empty["town"]["xp"] == 0
            db.execute(text("ALTER TABLE catalog_items RENAME TO catalog_items_held"))
            db.execute(text("CREATE TABLE catalog_items (id INTEGER PRIMARY KEY)"))
            trip = _trip(db, 1, "Still traveling", "planning", TODAY, _AT)
            _reminder(db, trip, datetime(2026, 10, 29, 18, tzinfo=UTC))
            db.commit()
            failed = _town(client)
    finally:
        db.close()
        database.engine.dispose()
    assert failed["buildings"]["library"]["source"] == "unavailable"
    assert failed["buildings"]["library"]["xp"] == 0
    assert failed["buildings"]["inn"]["source"] == "ok"
    assert failed["buildings"]["inn"]["today_xp"] == inn_day(1, 0)
    assert failed["town"]["xp"] == inn_day(1, 0)
    assert failed["habits"]


def test_no_credit_before_founding_or_without_a_town(tmp_path):
    folder = tmp_path / "founding"
    folder.mkdir()
    application, database = _open(folder)
    db = database.sessionmaker()
    movie = _catalog(db, "movie", "Before")
    _entry(db, 1, movie, "completed", date(2026, 9, 1))
    db.commit()
    try:
        with TestClient(application) as client:
            unfounded = _town(client)
            assert unfounded["town"]["founded_on"] is None
            assert unfounded["buildings"]["library"]["source"] == "ok"
            assert unfounded["buildings"]["library"]["xp"] == 0
            _habit(db, 1, created=date(2026, 10, 1))
            db.commit()
            founded = _town(client)
            assert founded["buildings"]["library"]["xp"] == 0
            _entry(db, 1, _catalog(db, "book", "On founding"), "completed", date(2026, 10, 1))
            db.commit()
            on_day = _town(client)
    finally:
        db.close()
        database.engine.dispose()
    assert on_day["buildings"]["library"]["xp"] == library_day(0, 1)


def test_source_writes_retract_instead_of_stacking(tmp_path, monkeypatch):
    folder = tmp_path / "writes"
    folder.mkdir()
    now = datetime(2026, 11, 11, 20, 0, tzinfo=UTC)
    today = now.astimezone(ZoneInfo("America/Los_Angeles")).date()
    monkeypatch.setenv("MEDIA_TODAY", today.isoformat())
    application, database = _open(folder, now)
    db = database.sessionmaker()
    _habit(db, 1, created=date(2026, 10, 1))
    db.commit()
    db.close()
    try:
        with TestClient(application) as client:
            created = client.post(
                "/media/api/library",
                json={"kind": "movie", "title": "Passive Film", "status": "completed"},
            )
            assert created.status_code == 200, created.text
            assert "completed_on" not in created.text
            credited = _town(client)
            assert credited["buildings"]["library"]["today_xp"] == 10
            entry_id = created.json()["id"]
            paused = client.patch(f"/media/api/entries/{entry_id}", json={"status": "in_progress"})
            assert paused.status_code == 200, paused.text
            assert "completed_on" not in paused.text
            assert _town(client)["buildings"]["library"]["xp"] == 0
            again = client.patch(f"/media/api/entries/{entry_id}", json={"status": "completed"})
            assert again.status_code == 200, again.text
            assert _town(client)["buildings"]["library"]["xp"] == 10
            deleted = client.delete(f"/media/api/entries/{entry_id}")
            assert deleted.status_code == 200, deleted.text
            assert _town(client)["buildings"]["library"]["xp"] == 0

            yesterday = (today - timedelta(days=1)).isoformat()
            planned = client.post(
                "/travel/api/trips",
                json={
                    "title": "Planning only",
                    "start_date": yesterday,
                    "end_date": yesterday,
                    "status": "planning",
                    "counts_as_pto": False,
                },
            )
            assert planned.status_code == 201, planned.text
            late = client.post(
                "/travel/api/trips",
                json={
                    "title": "Logged late",
                    "start_date": yesterday,
                    "end_date": yesterday,
                    "status": "done",
                    "counts_as_pto": False,
                },
            )
            assert late.status_code == 201, late.text
            assert _town(client)["buildings"]["inn"]["xp"] == 0
            reminder = client.post(
                f"/travel/api/trips/{planned.json()['id']}/reminders",
                json={"title": "Pack", "done": True},
            )
            assert reminder.status_code == 201, reminder.text
            assert "done_at" not in reminder.text
            assert _town(client)["buildings"]["inn"]["today_xp"] == 5
            packed = next(item for item in reminder.json()["reminders"] if item["title"] == "Pack")
            undone = client.patch(
                f"/travel/api/reminders/{packed['id']}",
                json={"title": "Pack", "done": False},
            )
            assert undone.status_code == 200, undone.text
            assert _town(client)["buildings"]["inn"]["xp"] == 0
            redone = client.patch(
                f"/travel/api/reminders/{packed['id']}",
                json={"title": "Pack", "done": True},
            )
            assert redone.status_code == 200, redone.text
            assert _town(client)["buildings"]["inn"]["xp"] == 5
            removed = client.delete(f"/travel/api/reminders/{packed['id']}")
            assert removed.status_code == 204, removed.text
            final = _town(client)
            assert final["buildings"]["inn"]["xp"] == 0
            assert final["buildings"]["library"]["source"] == "ok"
            assert final["habits"]
    finally:
        database.engine.dispose()


def test_album_completion_does_not_set_a_town_date(tmp_path, monkeypatch):
    monkeypatch.setenv("MEDIA_TODAY", "2026-10-29")
    folder = tmp_path / "album"
    folder.mkdir()
    application, database = _open(folder)
    try:
        with TestClient(application) as client:
            album = client.post(
                "/media/api/library",
                json={"kind": "album", "title": "Record", "status": "completed"},
            )
            assert album.status_code == 200, album.text
            stored = (
                database.sessionmaker()
                .execute(
                    text("SELECT completed_on FROM user_entries WHERE id = :id"),
                    {"id": album.json()["id"]},
                )
                .scalar()
            )
            assert stored is None
    finally:
        database.engine.dispose()
