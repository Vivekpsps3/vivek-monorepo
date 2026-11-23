"""Derived keepsakes: canonical rows, reversal, caps, and a missing source."""

from datetime import UTC, date, datetime, timedelta

from fastapi.testclient import TestClient
from sqlalchemy import event, text

from apps.media.backend.models import Base as MediaBase
from apps.media.backend.models import CatalogItem, Episode, EpisodeProgress, Experience, UserEntry
from apps.server.auth import Principal
from apps.server.database import open_database
from apps.server.main import Dependencies, Settings, create_app
from apps.server.town.clock import get_town_clock
from apps.server.town.models import TownBase
from apps.server.world.read import read_finished
from apps.travel.backend.models import Base as TravelBase
from apps.travel.backend.models import Stay, Trip

CLOCK = datetime(2026, 10, 29, 19, 0, tzinfo=UTC)
TODAY = date(2026, 10, 29)
_AT = datetime(2026, 10, 1, tzinfo=UTC)
_FORBIDDEN = {"return_date", "pto_days", "counts_as_pto"}


def _open(folder, clock=CLOCK, *, media=True, travel=True):
    url = f"sqlite:///{folder / 'site.db'}"
    database = open_database(url)
    TownBase.metadata.create_all(database.engine)
    if media:
        MediaBase.metadata.create_all(database.engine)
    if travel:
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


def _experience(db, user, entry, finished_on):
    row = Experience(
        user_id=user,
        entry_id=entry.id,
        kind="finish",
        finished_on=finished_on,
        created_at=_AT,
    )
    db.add(row)
    db.flush()
    return row


def _episode(db, user, catalog, watched_on):
    episode = Episode(catalog_id=catalog.id, season_number=1, episode_number=1, title="Episode 1")
    db.add(episode)
    db.flush()
    db.add(
        EpisodeProgress(user_id=user, episode_id=episode.id, watched=True, watched_on=watched_on)
    )
    db.flush()


def _trip(db, user, title, status, start, end, created):
    row = Trip(
        user_id=user,
        title=title,
        start_date=start,
        end_date=end,
        status=status,
        counts_as_pto=False,
        created_at=created,
        updated_at=created,
    )
    db.add(row)
    db.flush()
    return row


def _stay(db, trip, city, lat=None, region=None, country=None):
    row = Stay(
        trip_id=trip.id,
        sort_order=0,
        city=city,
        region=region,
        country=country,
        arrive_on=min(trip.start_date, trip.end_date),
        leave_on=max(trip.start_date, trip.end_date),
        lat=lat,
    )
    db.add(row)
    db.flush()
    return row


def _shelf(client, **params):
    response = client.get("/api/town/keepsakes", params={"tz": "America/Los_Angeles", **params})
    return response


def _keys(value, found):
    if isinstance(value, dict):
        found.update(value)
        for child in value.values():
            _keys(child, found)
    elif isinstance(value, list):
        for child in value:
            _keys(child, found)


def _by_title(rows):
    return {row["title"]: row for row in rows}


def test_records_move_and_retract(tmp_path):
    folder = tmp_path / "shelf"
    folder.mkdir()
    application, database = _open(folder)
    db = database.sessionmaker()
    book = _entry(db, 1, _catalog(db, "book", "Shelf Atlas"), "completed", TODAY)
    _experience(db, 1, book, TODAY)
    earlier = _entry(db, 1, _catalog(db, "book", "Shelf Earlier"), "want", None)
    _experience(db, 1, earlier, TODAY - timedelta(days=1))
    _entry(db, 1, _catalog(db, "movie", "Shelf Reel"), "completed", TODAY)
    _entry(db, 1, _catalog(db, "tv", "Shelf Scroll"), "completed", TODAY)
    _entry(db, 1, _catalog(db, "game", "Shelf Gem"), "completed", TODAY)
    _entry(db, 1, _catalog(db, "album", "Shelf Record"), "completed", TODAY)
    _entry(db, 1, _catalog(db, "artist", "Shelf Voice"), "completed", TODAY)
    _entry(db, 1, _catalog(db, "track", "Shelf Song"), "completed", TODAY)
    _entry(db, 1, _catalog(db, "book", "Shelf Later"), "completed", TODAY + timedelta(days=1))
    _episode(db, 1, _catalog(db, "tv", "Shelf Show"), TODAY)
    _entry(db, 2, _catalog(db, "book", "Other book"), "completed", TODAY)
    logged = datetime(2026, 10, 1, tzinfo=UTC)
    harbor = _trip(db, 1, "Shelf Harbor", "booked", date(2026, 10, 20), date(2026, 10, 28), logged)
    _stay(db, harbor, "Portland", lat=45.52, region="Oregon", country="United States")
    _trip(db, 1, "Shelf Plan", "planning", date(2026, 10, 1), date(2026, 10, 3), logged)
    _trip(db, 1, "Shelf Late", "done", date(2020, 1, 1), date(2020, 1, 3), logged)
    _trip(db, 1, "Backwards", "done", TODAY, TODAY - timedelta(days=1), logged)
    latitude = _trip(db, 1, "Shelf Latitude", "done", date(2026, 10, 4), date(2026, 10, 5), logged)
    _stay(db, latitude, "   ", lat=45.52)
    blank = _trip(db, 1, "Shelf Blank", "done", date(2026, 10, 6), date(2026, 10, 7), logged)
    _stay(db, blank, "")
    _trip(db, 2, "Other trip", "done", date(2026, 10, 1), date(2026, 10, 2), logged)
    db.commit()
    world = read_finished(db, 1, date(2000, 1, 1), date(2099, 1, 1), TODAY)
    db.close()
    try:
        with TestClient(application) as client:
            response = _shelf(client)
            assert response.status_code == 200, response.text
            body = response.json()
            names = db_names(database)
            moved = client.get("/api/town/keepsakes", params={"tz": "UTC"})
    finally:
        database.engine.dispose()
    assert "keepsakes" not in names
    keys: set[str] = set()
    _keys(body, keys)
    assert keys.isdisjoint(_FORBIDDEN)
    assert body["cap"] == 50
    assert body["on"] is None
    assert body["media"]["status"] == "ok"
    titles = _by_title(body["keepsakes"])
    assert set(titles) == {
        "Shelf Atlas",
        "Shelf Earlier",
        "Shelf Reel",
        "Shelf Scroll",
        "Shelf Gem",
    }
    atlas = titles["Shelf Atlas"]
    assert atlas["date_source"] == "completed_on"
    assert atlas["on"] == "2026-10-29"
    assert atlas["id"] == f"finished:{book.id}:2026-10-29"
    assert atlas["route"] == f"/media/item/{book.id}"
    assert "watched episode" in atlas["note"]
    assert titles["Shelf Earlier"]["date_source"] == "finished_on"
    assert titles["Shelf Earlier"]["on"] == "2026-10-28"
    dumped = response.text
    assert "Shelf Record" not in dumped
    assert "Episode 1" not in dumped
    assert "Other book" not in dumped
    assert "episode_progress" not in dumped
    shelf_keys = {(item["entry_id"], item["on"], item["kind"]) for item in body["keepsakes"]}
    world_keys = {(item["entry_id"], item["on"].isoformat(), item["kind"]) for item in world}
    assert shelf_keys == world_keys
    souvenirs = _by_title(body["souvenirs"])
    assert souvenirs["Shelf Harbor"]["credit_date"] == "2026-10-29"
    assert souvenirs["Shelf Harbor"]["id"] == f"trip:{harbor.id}:credit:2026-10-29"
    assert souvenirs["Shelf Harbor"]["destinations"] == ["Portland"]
    assert souvenirs["Shelf Harbor"]["place"] == {
        "label": "Portland, Oregon, United States",
        "lat_e2": 4552,
    }
    assert "The saved destination is Portland." in souvenirs["Shelf Harbor"]["scenery"]
    assert "does not invent a return date" not in souvenirs["Shelf Harbor"]["note"]
    assert _by_title(body["planned"])["Shelf Plan"]["credit_date"] is None
    assert _by_title(body["planned"])["Shelf Plan"]["mark"] == "planned"
    late = _by_title(body["ineligible"])["Shelf Late"]
    assert late["mark"] == "ineligible"
    assert late["credit_eligible"] is False
    assert late["credit_date"] is None
    assert "Backwards" not in dumped
    assert "Other trip" not in dumped
    latitude_row = souvenirs["Shelf Latitude"]
    assert latitude_row["destinations"] == []
    assert latitude_row["place"] == {"label": "", "lat_e2": 4552}
    assert "No destination city was saved." in latitude_row["scenery"]
    blank_row = souvenirs["Shelf Blank"]
    assert blank_row["place"] is None
    assert "does not invent a place" in blank_row["scenery"]
    assert any(item["id"] == "span-versus-credit" for item in body["differences"])
    assert "PTO charge" in next(
        item["text"] for item in body["differences"] if item["id"] == "span-versus-credit"
    )
    assert moved.status_code == 200


def db_names(database):
    with database.engine.connect() as connection:
        rows = connection.execute(text("SELECT name FROM sqlite_master")).all()
    return {str(row[0]) for row in rows}


def test_redate_undo_and_delete_move_the_object(tmp_path):
    folder = tmp_path / "move"
    folder.mkdir()
    application, database = _open(folder)
    db = database.sessionmaker()
    book = _entry(db, 1, _catalog(db, "book", "Shelf Atlas"), "completed", TODAY)
    _experience(db, 1, book, TODAY - timedelta(days=2))
    movie = _entry(db, 1, _catalog(db, "movie", "Shelf Reel"), "completed", TODAY)
    logged = datetime(2026, 10, 1, tzinfo=UTC)
    harbor = _trip(db, 1, "Shelf Harbor", "booked", date(2026, 10, 20), date(2026, 10, 28), logged)
    db.commit()
    book_id, movie_id, harbor_id = book.id, movie.id, harbor.id
    db.close()
    try:
        with TestClient(application) as client:
            first = _shelf(client).json()
            db = database.sessionmaker()
            row = db.get(UserEntry, book_id)
            row.completed_on = date(2026, 10, 20)
            db.commit()
            db.close()
            redated = _shelf(client).json()
            db = database.sessionmaker()
            db.delete(db.get(UserEntry, book_id))
            db.delete(db.get(UserEntry, movie_id))
            trip = db.get(Trip, harbor_id)
            trip.end_date = date(2026, 10, 22)
            db.commit()
            db.close()
            shifted = _shelf(client).json()
            db = database.sessionmaker()
            db.delete(db.get(Trip, harbor_id))
            db.commit()
            db.close()
            gone = _shelf(client).json()
    finally:
        database.engine.dispose()
    assert f"finished:{book_id}:2026-10-29" in {item["id"] for item in first["keepsakes"]}
    redated_ids = {item["id"] for item in redated["keepsakes"]}
    assert f"finished:{book_id}:2026-10-29" not in redated_ids
    assert f"finished:{book_id}:2026-10-20" in redated_ids
    assert f"finished:{book_id}:2026-10-27" in redated_ids
    shifted_ids = {item["id"] for item in shifted["keepsakes"]}
    assert f"finished:{book_id}:2026-10-20" not in shifted_ids
    assert f"finished:{movie_id}:2026-10-29" not in shifted_ids
    assert shifted["souvenirs"][0]["id"] == f"trip:{harbor_id}:credit:2026-10-23"
    assert shifted["souvenirs"][0]["span_end"] == "2026-10-22"
    assert gone["keepsakes"] == []
    assert gone["souvenirs"] == []


def test_la_credits_the_boundary_and_utc_does_not(tmp_path):
    folder = tmp_path / "zone"
    folder.mkdir()
    clock = datetime(2026, 11, 1, 18, 0, tzinfo=UTC)
    application, database = _open(folder, clock)
    db = database.sessionmaker()
    _trip(
        db,
        1,
        "Boundary",
        "booked",
        date(2026, 10, 26),
        date(2026, 10, 28),
        datetime(2026, 10, 29, 6, 30, tzinfo=UTC),
    )
    db.commit()
    db.close()
    try:
        with TestClient(application) as client:
            la = _shelf(client).json()
            utc = client.get("/api/town/keepsakes", params={"tz": "UTC"}).json()
    finally:
        database.engine.dispose()
    assert la["souvenirs"][0]["credit_date"] == "2026-10-29"
    assert la["ineligible"] == []
    assert utc["souvenirs"] == []
    assert utc["ineligible"][0]["title"] == "Boundary"
    assert utc["ineligible"][0]["credit_date"] is None


def test_day_filter_and_invalid_day(tmp_path):
    folder = tmp_path / "day"
    folder.mkdir()
    application, database = _open(folder)
    db = database.sessionmaker()
    _entry(db, 1, _catalog(db, "book", "Shelf Atlas"), "completed", date(2026, 10, 2))
    _entry(db, 1, _catalog(db, "movie", "Shelf Reel"), "completed", TODAY)
    logged = datetime(2026, 10, 1, tzinfo=UTC)
    _trip(db, 1, "Shelf Plan", "planning", date(2026, 10, 1), date(2026, 10, 3), logged)
    _trip(db, 1, "Shelf Harbor", "booked", date(2026, 10, 1), date(2026, 10, 10), logged)
    db.commit()
    db.close()
    try:
        with TestClient(application) as client:
            span = _shelf(client, on="2026-10-02")
            credit = _shelf(client, on="2026-10-11")
            invalid = _shelf(client, on="2026-02-31")
    finally:
        database.engine.dispose()
    assert span.status_code == 200, span.text
    span_body = span.json()
    assert [item["title"] for item in span_body["keepsakes"]] == ["Shelf Atlas"]
    assert [item["title"] for item in span_body["planned"]] == ["Shelf Plan"]
    assert span_body["souvenirs"] == []
    credit_body = credit.json()
    assert [item["title"] for item in credit_body["souvenirs"]] == ["Shelf Harbor"]
    assert credit_body["souvenirs"][0]["credit_date"] == "2026-10-11"
    assert credit_body["planned"] == []
    assert credit_body["keepsakes"] == []
    assert invalid.status_code == 422
    assert invalid.json()["message"] == "Check the highlighted fields."


def test_absent_unavailable_and_flat_reads(tmp_path, monkeypatch):
    def boom(*_args, **_kwargs):
        raise AssertionError("provider")

    monkeypatch.setattr("apps.media.backend.services.providers.search", boom)
    monkeypatch.setattr("apps.media.backend.services.providers.tmdb_search", boom)
    monkeypatch.setattr("apps.media.backend.services.providers.openlibrary_search", boom)

    folder = tmp_path / "sources"
    folder.mkdir()
    application, database = _open(folder)
    db = database.sessionmaker()
    _entry(db, 1, _catalog(db, "book", "Shelf Atlas"), "completed", TODAY)
    logged = datetime(2026, 10, 1, tzinfo=UTC)
    _trip(db, 1, "Shelf Harbor", "booked", date(2026, 10, 20), date(2026, 10, 28), logged)
    db.commit()
    db.execute(text("ALTER TABLE catalog_items RENAME COLUMN kind TO kind_hidden"))
    db.commit()
    db.close()
    try:
        with TestClient(application) as client:
            broken = _shelf(client)
    finally:
        database.engine.dispose()
    assert broken.status_code == 200, broken.text
    body = broken.json()
    assert body["media"]["status"] == "unavailable"
    assert body["media"]["total"] == 0
    assert body["keepsakes"] == []
    assert body["souvenirs"][0]["title"] == "Shelf Harbor"
    assert "Shelf Atlas" not in broken.text

    travel_dir = tmp_path / "travel-only"
    travel_dir.mkdir()
    travel_only, travel_db = _open(travel_dir, media=False)
    db = travel_db.sessionmaker()
    _trip(db, 1, "Shelf Harbor", "booked", date(2026, 10, 20), date(2026, 10, 28), logged)
    db.commit()
    db.close()
    try:
        with TestClient(travel_only) as client:
            absent_media = _shelf(client).json()
    finally:
        travel_db.engine.dispose()
    assert absent_media["media"]["status"] == "absent"
    assert absent_media["keepsakes"] == []
    assert absent_media["souvenirs"][0]["title"] == "Shelf Harbor"

    media_only_dir = tmp_path / "media-only"
    media_only_dir.mkdir()
    media_only, media_db = _open(media_only_dir, travel=False)
    db = media_db.sessionmaker()
    _entry(db, 1, _catalog(db, "book", "Shelf Atlas"), "completed", TODAY)
    db.commit()
    db.close()
    try:
        with TestClient(media_only) as client:
            absent_travel = _shelf(client).json()
    finally:
        media_db.engine.dispose()
    assert absent_travel["travel"]["status"] == "absent"
    assert absent_travel["keepsakes"][0]["title"] == "Shelf Atlas"
    assert absent_travel["souvenirs"] == []
    assert absent_travel["travel"]["souvenirs"]["total"] == 0

    stays_dir = tmp_path / "no-stays"
    stays_dir.mkdir()
    stays_app, stays_db = _open(stays_dir)
    db = stays_db.sessionmaker()
    trip = _trip(db, 1, "Shelf Harbor", "booked", date(2026, 10, 20), date(2026, 10, 28), logged)
    _stay(db, trip, "Portland", lat=45.52)
    db.commit()
    db.execute(text("DROP TABLE stays"))
    db.commit()
    db.close()
    try:
        with TestClient(stays_app) as client:
            no_stays = _shelf(client).json()
    finally:
        stays_db.engine.dispose()
    assert no_stays["travel"]["status"] == "ok"
    assert no_stays["souvenirs"][0]["destinations"] == []
    assert "does not invent a place" in no_stays["souvenirs"][0]["scenery"]

    fail_dir = tmp_path / "stay-fail"
    fail_dir.mkdir()
    fail_app, fail_db = _open(fail_dir)
    db = fail_db.sessionmaker()
    trip = _trip(db, 1, "Shelf Harbor", "booked", date(2026, 10, 20), date(2026, 10, 28), logged)
    _stay(db, trip, "Portland", lat=45.52)
    _entry(db, 1, _catalog(db, "book", "Shelf Atlas"), "completed", TODAY)
    db.commit()
    db.execute(text("ALTER TABLE stays RENAME COLUMN city TO city_hidden"))
    db.commit()
    db.close()
    try:
        with TestClient(fail_app) as client:
            stay_fail = _shelf(client).json()
    finally:
        fail_db.engine.dispose()
    assert stay_fail["travel"]["status"] == "unavailable"
    assert stay_fail["souvenirs"] == []
    assert stay_fail["keepsakes"][0]["title"] == "Shelf Atlas"
    assert stay_fail["travel"]["souvenirs"]["included"] == 0

    monkeypatch.setattr("apps.server.town.keepsakes._probe", lambda _db: None)
    probe_dir = tmp_path / "probe"
    probe_dir.mkdir()
    probe_app, probe_db = _open(probe_dir)
    try:
        with TestClient(probe_app) as client:
            probed = _shelf(client).json()
    finally:
        probe_db.engine.dispose()
    assert probed["media"]["status"] == "unavailable"
    assert probed["travel"]["status"] == "unavailable"
    assert probed["differences"]


def _seed_bulk(database, count):
    db = database.sessionmaker()
    logged = datetime(2026, 9, 1, tzinfo=UTC)
    for index in range(count):
        _entry(
            db,
            1,
            _catalog(db, "book", f"Book {index}"),
            "completed",
            TODAY - timedelta(days=index % 20),
        )
        end = TODAY - timedelta(days=index + 2)
        trip = _trip(db, 1, f"Trip {index}", "done", end - timedelta(days=1), end, logged)
        _stay(db, trip, f"City {index}", lat=10.0)
    db.commit()
    db.close()


def _measure(application, database):
    seen: list[str] = []

    def hear(_conn, _cursor, statement, _parameters, _context, _executemany):
        seen.append(statement)

    event.listen(database.engine, "before_cursor_execute", hear)
    try:
        with TestClient(application) as client:
            seen.clear()
            response = _shelf(client)
            assert response.status_code == 200, response.text
            return list(seen), response.json()
    finally:
        event.remove(database.engine, "before_cursor_execute", hear)


def test_large_history_stays_one_read(tmp_path):
    small_dir = tmp_path / "small"
    small_dir.mkdir()
    small_app, small_db = _open(small_dir)
    _seed_bulk(small_db, 2)
    large_dir = tmp_path / "large"
    large_dir.mkdir()
    large_app, large_db = _open(large_dir)
    _seed_bulk(large_db, 55)
    try:
        small_sql, small_body = _measure(small_app, small_db)
        large_sql, large_body = _measure(large_app, large_db)
    finally:
        small_db.engine.dispose()
        large_db.engine.dispose()
    assert len(small_sql) == len(large_sql)
    assert len(large_sql) <= 8, large_sql
    joined = "\n".join(large_sql)
    assert "episode_progress" not in joined
    media_sql = [
        item for item in large_sql if "user_entries" in item and "sqlite_master" not in item
    ]
    stay_sql = [item for item in large_sql if "stays." in item or "FROM stays" in item]
    assert len(media_sql) == 1
    assert len(stay_sql) == 1
    assert large_body["media"]["included"] == 50
    assert large_body["media"]["total"] == 55
    assert large_body["media"]["truncated"] is True
    assert large_body["travel"]["souvenirs"]["included"] == 50
    assert large_body["travel"]["souvenirs"]["total"] == 55
    assert small_body["media"]["truncated"] is False
