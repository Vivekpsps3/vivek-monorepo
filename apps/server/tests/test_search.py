"""GET /api/search (Bundle S): contract, ranking, scoping, perf budget."""

import json
import time
from datetime import date, timedelta

from fastapi.testclient import TestClient
from sqlalchemy import event, insert

from apps.media.backend.models import Base as MediaBase
from apps.media.backend.models import CatalogItem, UserEntry
from apps.server.auth import Principal, require_principal
from apps.server.database import open_database
from apps.server.main import Dependencies, Settings, create_app
from apps.travel.backend.models import Base as TravelBase
from apps.travel.backend.models import PlanItem, Stay, Trip


def _open(folder, principal=Principal(1, "tester", "Tester")):
    url = f"sqlite:///{folder / 'site.db'}"
    database = open_database(url)
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
    return application, database


def _trip(db, user=1, title="Kyoto", origin=None, start=date(2026, 12, 1)):
    return db.execute(
        insert(Trip).values(
            user_id=user,
            title=title,
            origin_label=origin,
            start_date=start,
            end_date=start + timedelta(days=5),
            status="booked",
            counts_as_pto=True,
        )
    ).inserted_primary_key[0]


def _stay(db, trip_id, city="Kyoto", lodging=None, arrive=date(2026, 12, 1), order=0):
    return db.execute(
        insert(Stay).values(
            trip_id=trip_id,
            sort_order=order,
            city=city,
            lodging_name=lodging,
            arrive_on=arrive,
            leave_on=arrive + timedelta(days=3),
        )
    ).inserted_primary_key[0]


def _plan(db, trip_id, title="Fushimi Inari", place=None, on=date(2026, 12, 2)):
    return db.execute(
        insert(PlanItem).values(
            trip_id=trip_id,
            title=title,
            place_name=place,
            on_date=on,
            kind="activity",
            currency="USD",
            paid=False,
            sort_order=0,
        )
    ).inserted_primary_key[0]


def _media(db, user=1, title="Dune", creator="Frank Herbert", year=1965, kind="book", tags=None):
    catalog_id = db.execute(
        insert(CatalogItem).values(
            kind=kind,
            title=title,
            creator=creator,
            year=year,
            source="manual",
        )
    ).inserted_primary_key[0]
    return db.execute(
        insert(UserEntry).values(
            user_id=user,
            catalog_id=catalog_id,
            status="want",
            tags=json.dumps(tags) if tags is not None else None,
            review_spoiler=False,
        )
    ).inserted_primary_key[0]


def _seeded(tmp_path):
    application, database = _open(tmp_path)
    with database.sessionmaker() as db:
        trip = _trip(db)
        _stay(db, trip, city="Kyoto", lodging="Machiya House")
        _stay(db, trip, city="Osaka", order=1)
        _plan(db, trip)
        _media(db)
        db.commit()
    return application, database, trip


def test_requires_session(tmp_path):
    url = f"sqlite:///{tmp_path / 'site.db'}"
    database = open_database(url)
    TravelBase.metadata.create_all(database.engine)
    MediaBase.metadata.create_all(database.engine)
    application = create_app(
        Settings(database_url=url, release="test", web_root=tmp_path),
        Dependencies(database=database, check_schema=False, check_frontend=False),
    )
    with TestClient(application, raise_server_exceptions=False) as client:
        response = client.get("/api/search", params={"q": "kyoto"})
    assert response.status_code == 401


def test_q_too_long_422(tmp_path):
    application, _database = _open(tmp_path)
    with TestClient(application) as client:
        response = client.get("/api/search", params={"q": "x" * 101})
        assert response.status_code == 422
        ok = client.get("/api/search", params={"q": "x" * 100})
        assert ok.status_code == 200


def test_limit_bounds_422(tmp_path):
    application, _database = _open(tmp_path)
    with TestClient(application) as client:
        for bad in (0, 21, -1):
            response = client.get("/api/search", params={"q": "ky", "limit": bad})
            assert response.status_code == 422, bad
        assert client.get("/api/search", params={"q": "ky", "limit": 1}).status_code == 200
        assert client.get("/api/search", params={"q": "ky", "limit": 20}).status_code == 200


def test_q_and_recent_together_422(tmp_path):
    application, _database = _open(tmp_path)
    with TestClient(application) as client:
        response = client.get("/api/search", params={"q": "ky", "recent": "travel:trip:1"})
        assert response.status_code == 422
        malformed = client.get("/api/search", params={"recent": "nonsense"})
        assert malformed.status_code == 422
        too_many = client.get(
            "/api/search",
            params={"recent": ",".join(f"travel:trip:{n}" for n in range(1, 7))},
        )
        assert too_many.status_code == 422


def test_short_q_returns_empty_without_query(tmp_path):
    application, database, _trip_id = _seeded(tmp_path)
    statements: list[str] = []

    @event.listens_for(database.engine, "before_cursor_execute")
    def count(conn, cursor, statement, parameters, context, executemany):
        statements.append(statement)

    with TestClient(application) as client:
        for q in ("k", "", "  "):
            response = client.get("/api/search", params={"q": q})
            assert response.status_code == 200
            assert response.json()["results"] == []
    assert statements == []


def test_matches_trip_place_plan(tmp_path):
    application, _database, trip = _seeded(tmp_path)
    with TestClient(application) as client:
        results = client.get("/api/search", params={"q": "kyoto"}).json()["results"]
        by_kind = {(row["app"], row["kind"]): row for row in results}
        trip_row = by_kind[("travel", "trip")]
        assert trip_row["title"] == "Kyoto"
        assert trip_row["matched"] == "title"
        assert trip_row["detail"] == "Kyoto, Osaka"
        assert trip_row["date"] == "2026-12-01"
        assert trip_row["href"] == f"/travel/trips/{trip}"
        assert trip_row["media_kind"] is None
        place_row = by_kind[("travel", "place")]
        assert place_row["title"] == "Machiya House"
        assert place_row["matched"] == "city"
        assert place_row["detail"] == "Kyoto"

        origin = client.get("/api/search", params={"q": "osaka"}).json()["results"]
        assert (
            any(row["kind"] == "trip" and row["matched"] == "title" for row in origin) is False
        )  # Osaka is a stay city, not the trip title/origin.

        plan = client.get("/api/search", params={"q": "fushimi"}).json()["results"]
        assert len(plan) == 1
        assert plan[0]["kind"] == "plan"
        assert plan[0]["matched"] == "title"
        assert plan[0]["detail"] == "Kyoto"
        assert plan[0]["href"] == f"/travel/trips/{trip}"


def test_matches_media_title_creator_tag(tmp_path):
    application, database = _open(tmp_path)
    with database.sessionmaker() as db:
        entry = _media(db, tags=["desert", "classic sci-fi"])
        db.commit()
    with TestClient(application) as client:
        by_title = client.get("/api/search", params={"q": "dune"}).json()["results"]
        assert by_title[0]["matched"] == "title"
        assert by_title[0]["id"] == entry
        assert by_title[0]["media_kind"] == "book"
        assert by_title[0]["detail"] == "Frank Herbert · 1965"
        assert by_title[0]["href"] == f"/media/item/{entry}"
        assert by_title[0]["date"] is None
        by_creator = client.get("/api/search", params={"q": "herbert"}).json()["results"]
        assert by_creator[0]["matched"] == "creator"
        by_tag = client.get("/api/search", params={"q": "desert"}).json()["results"]
        assert by_tag[0]["matched"] == "tag"
        # A query that only appears across tag boundaries of the JSON text
        # is not a tag match.
        across = client.get("/api/search", params={"q": 't", "c'}).json()["results"]
        assert across == []


def test_ranking_exact_prefix_word_substring(tmp_path):
    application, database = _open(tmp_path)
    with database.sessionmaker() as db:
        _trip(db, title="Kyo")
        _trip(db, title="Kyoto")
        _trip(db, title="Mount Kyo")
        _trip(db, title="Tokyo")
        db.commit()
    with TestClient(application) as client:
        results = client.get("/api/search", params={"q": "kyo"}).json()["results"]
    titles = [row["title"] for row in results if row["kind"] == "trip"]
    assert titles == ["Kyo", "Kyoto", "Mount Kyo", "Tokyo"]


def test_limit_and_truncated(tmp_path):
    application, database = _open(tmp_path)
    with database.sessionmaker() as db:
        for n in range(5):
            _trip(db, title=f"Kyoto {n}")
        db.commit()
    with TestClient(application) as client:
        payload = client.get("/api/search", params={"q": "kyoto", "limit": 3}).json()
        assert len(payload["results"]) == 3
        assert payload["truncated"] is True
        full = client.get("/api/search", params={"q": "kyoto", "limit": 20}).json()
        assert len(full["results"]) == 5
        assert full["truncated"] is False


def test_like_wildcards_are_literal(tmp_path):
    application, database = _open(tmp_path)
    with database.sessionmaker() as db:
        _trip(db, title="100% Fun")
        _trip(db, title="1000 Fun")
        _trip(db, title="under_score")
        _trip(db, title="underXscore")
        db.commit()
    with TestClient(application) as client:
        percent = client.get("/api/search", params={"q": "100%"}).json()["results"]
        assert [row["title"] for row in percent] == ["100% Fun"]
        under = client.get("/api/search", params={"q": "under_"}).json()["results"]
        assert [row["title"] for row in under] == ["under_score"]


def test_owner_scoped_cross_user(tmp_path):
    application, database, trip = _seeded(tmp_path)
    with database.sessionmaker() as db:
        other_trip = _trip(db, user=2, title="Kyoto")
        _media(db, user=2)
        db.commit()
    with TestClient(application) as client:
        mine = client.get("/api/search", params={"q": "kyoto"}).json()["results"]
        assert {row["id"] for row in mine if row["kind"] == "trip"} == {trip}
        assert all(row["title"] != "Dune" or row["app"] == "media" for row in mine)
        recent = client.get(
            "/api/search",
            params={"recent": f"travel:trip:{other_trip},media:media:2"},
        ).json()
        assert recent["results"] == []  # user 2's rows are invisible in recent too
        application.dependency_overrides[require_principal] = lambda: Principal(2, "other", "Other")
        theirs = client.get("/api/search", params={"q": "kyoto"}).json()["results"]
        assert {row["id"] for row in theirs if row["kind"] == "trip"} == {other_trip}
        assert (
            client.get("/api/search", params={"recent": f"travel:trip:{trip}"}).json()["results"]
            == []
        )


def test_recent_returns_owned_in_order_and_drops_unknown(tmp_path):
    application, _database, trip = _seeded(tmp_path)
    with TestClient(application) as client:
        payload = client.get(
            "/api/search",
            params={"recent": f"media:media:1,travel:trip:{trip},travel:trip:999"},
        ).json()
    assert payload["q"] is None
    assert payload["truncated"] is False
    assert [(row["app"], row["kind"]) for row in payload["results"]] == [
        ("media", "media"),
        ("travel", "trip"),
    ]


def test_no_store_header(tmp_path):
    application, _database, _trip_id = _seeded(tmp_path)
    with TestClient(application) as client:
        response = client.get("/api/search", params={"q": "kyoto"})
        assert "no-store" in response.headers["Cache-Control"]
        recent = client.get("/api/search", params={"recent": "travel:trip:1"})
        assert "no-store" in recent.headers["Cache-Control"]


def test_no_provider_calls(tmp_path, monkeypatch):
    import httpx

    def boom(*args, **kwargs):
        raise AssertionError("provider/HTTP call attempted")

    monkeypatch.setattr(httpx, "Client", boom)
    monkeypatch.setattr(httpx, "AsyncClient", boom)
    application, _database, _trip_id = _seeded(tmp_path)
    with TestClient(application) as client:
        response = client.get("/api/search", params={"q": "kyoto"})
        assert response.status_code == 200
        assert response.json()["results"]


def test_p95_under_150ms(tmp_path):
    application, database = _open(tmp_path)
    with database.sessionmaker() as db:
        for n in range(300):
            trip = _trip(db, title=f"Journey {n}", start=date(2026, 1, 1) + timedelta(days=n % 300))
            for s in range(3):
                _stay(db, trip, city=f"City {n}-{s}", order=s)
            for p in range(5):
                _plan(db, trip, title=f"Plan {n}-{p}")
        for n in range(2000):
            _media(
                db, title=f"Work {n}", creator=f"Maker {n % 50}", tags=[f"tag{n % 100}", "common"]
            )
        db.commit()
    queries = [
        "journey",
        "city 12",
        "plan 3",
        "work 99",
        "maker 7",
        "tag42",
        "common",
        "ourney",
        "zz",
    ]
    timings: list[float] = []
    with TestClient(application) as client:
        for i in range(50):
            q = queries[i % len(queries)]
            started = time.perf_counter()
            response = client.get("/api/search", params={"q": q, "limit": 20})
            timings.append(time.perf_counter() - started)
            assert response.status_code == 200
    timings.sort()
    p95 = timings[int(0.95 * len(timings)) - 1]
    assert p95 < 0.150, f"p95 {p95:.3f}s over the seeded perf DB"
