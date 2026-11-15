"""GET /api/world (W3a): trips, places and finished media in world weeks."""

from datetime import UTC, date, datetime
from typing import cast

from fastapi.testclient import TestClient
from sqlalchemy import Table, insert

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
