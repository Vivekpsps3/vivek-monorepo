"""GET /api/world (W3a): trips, places and finished media in world weeks."""

from datetime import UTC, date, datetime, timedelta
from typing import cast

from fastapi.testclient import TestClient
from sqlalchemy import Table, event, insert

from apps.media.backend.models import Base as MediaBase
from apps.media.backend.models import CatalogItem, Experience, UserEntry
from apps.server.auth import Principal, require_principal
from apps.server.database import open_database
from apps.server.main import Dependencies, Settings, create_app
from apps.server.town.models import TownBase
from apps.server.world.routes import get_world_clock
from apps.travel.backend.models import Base as TravelBase
from apps.travel.backend.models import Stay, Trip

CLOCK = datetime(2026, 10, 29, 19, 0, tzinfo=UTC)  # Thu 29 Oct 2026, 12:00 PDT
TODAY = date(2026, 10, 29)
CURRENT_WEEK = date(2026, 10, 26)
_AT = datetime(2026, 9, 1, tzinfo=UTC)

trips_t = cast(Table, Trip.__table__)
stays_t = cast(Table, Stay.__table__)
catalog_t = cast(Table, CatalogItem.__table__)
entries_t = cast(Table, UserEntry.__table__)
experiences_t = cast(Table, Experience.__table__)


def _open(folder, principal=Principal(1, "tester", "Tester"), clock=CLOCK):
    url = f"sqlite:///{folder / 'site.db'}"
    database = open_database(url)
    TownBase.metadata.create_all(database.engine)
    TravelBase.metadata.create_all(database.engine)
    MediaBase.metadata.create_all(database.engine)
    application = create_app(
        Settings(database_url=url, release="test", web_root=folder),
        Dependencies(
            database=database,
            principal=principal,
            check_schema=False,
            check_frontend=False,
        ),
    )
    application.dependency_overrides[get_world_clock] = lambda: clock
    return application, database


def _trip(db, user, title, start, end, status="booked"):
    return db.execute(
        insert(trips_t).values(
            user_id=user, title=title, start_date=start, end_date=end, status=status
        )
    ).inserted_primary_key[0]


def _stay(db, trip_id, city, arrive, leave, region=None, country=None, lat=None, sort=0):
    return db.execute(
        insert(stays_t).values(
            trip_id=trip_id,
            sort_order=sort,
            city=city,
            region=region,
            country=country,
            arrive_on=arrive,
            leave_on=leave,
            lat=lat,
        )
    ).inserted_primary_key[0]


def _entry(db, user, kind, title, status="completed", completed_on=None, tags=None):
    catalog_id = db.execute(insert(catalog_t).values(kind=kind, title=title)).inserted_primary_key[
        0
    ]
    return db.execute(
        insert(entries_t).values(
            user_id=user,
            catalog_id=catalog_id,
            status=status,
            completed_on=completed_on,
            tags=tags,
        )
    ).inserted_primary_key[0]


def _experience(db, user, entry_id, finished_on, kind="reading"):
    return db.execute(
        insert(experiences_t).values(
            user_id=user, entry_id=entry_id, kind=kind, finished_on=finished_on
        )
    ).inserted_primary_key[0]


def _get(client, **params):
    return client.get("/api/world", params=params)


def _weeks_by_start(payload):
    return {w["week"]: w for w in payload["weeks"]}


def test_cross_user_isolation_same_dates(tmp_path):
    application, database = _open(tmp_path)
    day = date(2026, 10, 27)
    with database.sessionmaker() as db:
        trip1 = _trip(db, 1, "Trip A", date(2026, 10, 26), date(2026, 10, 28))
        _stay(db, trip1, "Testville", date(2026, 10, 26), date(2026, 10, 28))
        trip2 = _trip(db, 2, "Trip B", date(2026, 10, 26), date(2026, 10, 28))
        _stay(db, trip2, "Otherville", date(2026, 10, 26), date(2026, 10, 28))
        entry1 = _entry(db, 1, "book", "Book A", completed_on=day)
        entry2 = _entry(db, 2, "book", "Book B", completed_on=day)
        _experience(db, 1, entry1, day)
        _experience(db, 2, entry2, day)
        db.commit()

    with TestClient(application) as client:
        one = _get(client).json()
        application.dependency_overrides[require_principal] = lambda: Principal(2, "other", "Other")
        two = _get(client).json()

    week_one = one["weeks"][0]
    assert [t["id"] for t in week_one["trips"]] == [trip1]
    assert week_one["trips"][0]["place"]["label"] == "Testville"
    assert [f["entry_id"] for f in week_one["finished"]] == [entry1]
    assert "Trip B" not in str(one) and "Otherville" not in str(one)
    assert "Book B" not in str(one)

    week_two = two["weeks"][0]
    assert [t["id"] for t in week_two["trips"]] == [trip2]
    # User 2's stay labels user 2's trip; it never labels user 1's trip.
    assert week_two["trips"][0]["place"]["label"] == "Otherville"
    assert [f["entry_id"] for f in week_two["finished"]] == [entry2]
    assert "Trip A" not in str(two) and "Testville" not in str(two)


def test_trip_statuses_and_spanning_weeks(tmp_path):
    application, database = _open(tmp_path)
    with database.sessionmaker() as db:
        _trip(db, 1, "Planning Trip", date(2026, 10, 26), date(2026, 10, 28), "planning")
        booked = _trip(db, 1, "Trip A", date(2026, 10, 21), date(2026, 10, 28), "booked")
        done = _trip(db, 1, "Trip Done", date(2026, 10, 27), date(2026, 10, 27), "done")
        db.commit()
    with TestClient(application) as client:
        payload = _get(client).json()
    weeks = _weeks_by_start(payload)
    assert set(weeks) == {"2026-10-19", "2026-10-26"}
    assert [t["id"] for t in weeks["2026-10-19"]["trips"]] == [booked]
    # The spanning trip appears in both weeks with the same id.
    assert [t["id"] for t in weeks["2026-10-26"]["trips"]] == [booked, done]
    assert all(t["title"] != "Planning Trip" for w in payload["weeks"] for t in w["trips"])
    trip = weeks["2026-10-26"]["trips"][0]
    assert trip["start"] == "2026-10-21" and trip["end"] == "2026-10-28"
    assert trip["place"] is None  # no stays -> place: null


def test_stay_selection_rules(tmp_path):
    application, database = _open(tmp_path)
    week = CURRENT_WEEK
    with database.sessionmaker() as db:
        # Overlapping stay wins over an earlier non-overlapping one.
        t1 = _trip(db, 1, "Trip A", week, week + timedelta(days=2))
        _stay(db, t1, "Earlier", date(2026, 10, 5), date(2026, 10, 7))
        _stay(db, t1, "Overlap", date(2026, 10, 27), date(2026, 10, 28))
        # Tie on arrive_on broken by sort_order.
        t2 = _trip(db, 1, "Trip B", week, week + timedelta(days=2))
        _stay(db, t2, "HighSort", date(2026, 10, 27), date(2026, 10, 28), sort=5)
        _stay(db, t2, "LowSort", date(2026, 10, 27), date(2026, 10, 28), sort=2)
        # Tie on arrive_on and sort_order broken by id (insertion order).
        t3 = _trip(db, 1, "Trip C", week, week + timedelta(days=2))
        _stay(db, t3, "FirstIn", date(2026, 10, 27), date(2026, 10, 28), sort=1)
        _stay(db, t3, "SecondIn", date(2026, 10, 27), date(2026, 10, 28), sort=1)
        # No stay overlaps the week -> the trip's first stay.
        t4 = _trip(db, 1, "Trip D", week, week + timedelta(days=2))
        _stay(db, t4, "OnlyStay", date(2026, 10, 12), date(2026, 10, 14))
        db.commit()
    with TestClient(application) as client:
        payload = _get(client).json()
    trips = {t["title"]: t for t in payload["weeks"][0]["trips"]}
    assert trips["Trip A"]["place"]["label"] == "Overlap"
    assert trips["Trip B"]["place"]["label"] == "LowSort"
    assert trips["Trip C"]["place"]["label"] == "FirstIn"
    assert trips["Trip D"]["place"]["label"] == "OnlyStay"


def test_place_label_trimming_and_lat_e2(tmp_path):
    application, database = _open(tmp_path)
    with database.sessionmaker() as db:
        t1 = _trip(db, 1, "Trip A", CURRENT_WEEK, CURRENT_WEEK)
        _stay(
            db,
            t1,
            "  Portland ",
            CURRENT_WEEK,
            CURRENT_WEEK,
            region="",
            country=" United States",
            lat=45.52,
        )
        t2 = _trip(db, 1, "Trip B", CURRENT_WEEK, CURRENT_WEEK)
        _stay(db, t2, "Sydney", CURRENT_WEEK, CURRENT_WEEK, region=None, lat=-33.87)
        t3 = _trip(db, 1, "Trip C", CURRENT_WEEK, CURRENT_WEEK)
        _stay(db, t3, "Nowhere", CURRENT_WEEK, CURRENT_WEEK, lat=None)
        db.commit()
    with TestClient(application) as client:
        payload = _get(client).json()
    trips = {t["title"]: t for t in payload["weeks"][0]["trips"]}
    assert trips["Trip A"]["place"] == {"label": "Portland, United States", "lat_e2": 4552}
    assert trips["Trip B"]["place"] == {"label": "Sydney", "lat_e2": -3387}
    assert trips["Trip C"]["place"] == {"label": "Nowhere", "lat_e2": None}
    # The raw lat key never appears in the JSON.
    assert '"lat":' not in str(payload).replace(" ", "")


def test_finished_sources_dedupe_and_kinds(tmp_path):
    application, database = _open(tmp_path)
    day = date(2026, 10, 27)
    with database.sessionmaker() as db:
        both = _entry(db, 1, "book", "Book A", completed_on=day)
        _experience(db, 1, both, day)  # same (entry_id, on) from both sources
        _experience(db, 1, both, date(2026, 10, 28))  # same entry, another day
        movie = _entry(db, 1, "movie", "Movie A", completed_on=day)
        _entry(db, 1, "track", "Track A", completed_on=day)  # excluded kind
        _entry(db, 1, "album", "Album A", completed_on=day)  # excluded kind
        _entry(db, 1, "artist", "Artist A", completed_on=day)  # excluded kind
        _entry(db, 1, "book", "Book B", completed_on=None)  # completed, no date
        _entry(db, 1, "book", "Book C", status="reading", completed_on=day)
        db.commit()
    with TestClient(application) as client:
        payload = _get(client).json()
    finished = payload["weeks"][0]["finished"]
    assert [(f["entry_id"], f["on"]) for f in finished] == [
        (both, "2026-10-27"),
        (movie, "2026-10-27"),
        (both, "2026-10-28"),
    ]
    titles = [f["title"] for f in finished]
    assert titles.count("Book A") == 2  # two days, once per day
    assert "Movie A" in titles
    assert not {"Track A", "Album A", "Artist A", "Book B", "Book C"} & set(titles)
    assert all(f["kind"] in {"movie", "tv", "book", "game"} for f in finished)


def test_finished_cap_and_finished_more(tmp_path):
    application, database = _open(tmp_path)
    day = date(2026, 10, 27)
    with database.sessionmaker() as db:
        for n in range(53):
            _entry(db, 1, "book", f"Book {n}", completed_on=day)
        db.commit()
    with TestClient(application) as client:
        week = _get(client).json()["weeks"][0]
    assert len(week["finished"]) == 50
    assert week["finished_more"] == 3


def test_finished_exactly_at_cap_has_no_finished_more_key(tmp_path):
    application, database = _open(tmp_path)
    day = date(2026, 10, 27)
    with database.sessionmaker() as db:
        for n in range(50):
            _entry(db, 1, "book", f"Book {n}", completed_on=day)
        db.commit()
    with TestClient(application) as client:
        week = _get(client).json()["weeks"][0]
    assert len(week["finished"]) == 50
    assert "finished_more" not in week


def test_start_week_moves_for_trip_and_finished_but_not_planning(tmp_path):
    application, database = _open(tmp_path)
    with database.sessionmaker() as db:
        _trip(db, 1, "Old Planning", date(2025, 1, 6), date(2025, 1, 8), "planning")
        _trip(db, 1, "Old Trip", date(2026, 1, 5), date(2026, 1, 7), "booked")
        _entry(db, 1, "book", "Book A", completed_on=date(2026, 3, 2))
        db.commit()
    with TestClient(application) as client:
        payload = _get(client).json()
    # Earliest real content is the old booked trip (Mon 2026-01-05); the
    # older planning trip (2025) must not move start_week.
    assert payload["meta"]["start_week"] == "2026-01-05"
    # The old trip's week is sparse-returned when explicitly requested.
    with TestClient(application) as client:
        payload = _get(client, **{"from": "2026-01-05", "to": "2026-01-05"}).json()
    assert [w["week"] for w in payload["weeks"]] == ["2026-01-05"]
    assert payload["weeks"][0]["trips"][0]["title"] == "Old Trip"


def test_sparse_week_with_only_a_trip(tmp_path):
    application, database = _open(tmp_path)
    with database.sessionmaker() as db:
        _trip(db, 1, "Trip A", date(2026, 10, 14), date(2026, 10, 15))
        db.commit()
    with TestClient(application) as client:
        payload = _get(client).json()
    assert [w["week"] for w in payload["weeks"]] == ["2026-10-12"]
    week = payload["weeks"][0]
    assert week["habits"] == [] and week["finished"] == []
    assert [t["title"] for t in week["trips"]] == ["Trip A"]


def test_statement_count_is_constant(tmp_path):
    application, database = _open(tmp_path)
    day = date(2026, 10, 27)

    def seed(many):
        with database.sessionmaker() as db:
            for n in range(many):
                trip_id = _trip(db, 1, f"Trip {n}", day, day)
                _stay(db, trip_id, "Testville", day, day)
                _entry(db, 1, "book", f"Book {n}", completed_on=day)
            db.commit()

    def count_statements():
        statements: list[str] = []

        def count(conn, cursor, statement, parameters, context, executemany):
            statements.append(statement)

        event.listen(database.engine, "before_cursor_execute", count)
        try:
            with TestClient(application) as client:
                response = _get(client)
        finally:
            event.remove(database.engine, "before_cursor_execute", count)
        assert response.status_code == 200
        return len(statements)

    seed(2)
    first = count_statements()
    seed(20)
    second = count_statements()
    # probe + candidates + checkins + trips + stays + finished (the habits
    # select is skipped when no habit has a checkin in range).
    assert first == second == 6
