"""GET /api/search (Bundle S): contract, ranking, scoping, perf budget."""

import json
from datetime import date, timedelta

from fastapi.testclient import TestClient
from sqlalchemy import insert

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
