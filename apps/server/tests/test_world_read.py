"""GET /api/world (W2a): habits only, owner scope, ranges, tz, sparse weeks."""

from datetime import UTC, date, datetime
from typing import cast

from fastapi.testclient import TestClient
from sqlalchemy import Table, insert

from apps.server.auth import Principal, require_principal
from apps.server.database import open_database
from apps.server.main import Dependencies, Settings, create_app
from apps.server.town.models import Habit, HabitCheckin, TownBase
from apps.server.world.routes import get_world_clock

CLOCK = datetime(2026, 10, 29, 19, 0, tzinfo=UTC)  # Thu 29 Oct 2026, 12:00 PDT
TODAY = date(2026, 10, 29)
CURRENT_WEEK = date(2026, 10, 26)
_AT = datetime(2026, 9, 1, tzinfo=UTC)

habits_t = cast(Table, Habit.__table__)
checkins_t = cast(Table, HabitCheckin.__table__)


def _open(folder, principal=Principal(1, "tester", "Tester"), clock=CLOCK):
    url = f"sqlite:///{folder / 'site.db'}"
    database = open_database(url)
    TownBase.metadata.create_all(database.engine)
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


def _seed(database, user, name, created_on, days=(), archived=False, style="cottage"):
    with database.sessionmaker() as db:
        habit_id = db.execute(
            insert(habits_t).values(
                user_id=user,
                name=name,
                slot=1,
                building_style=style,
                per_week=3,
                created_on=created_on,
                created_at=_AT,
                archived_at=datetime(2026, 10, 7, tzinfo=UTC) if archived else None,
                archived_on=date(2026, 10, 7) if archived else None,
                name_key=name.casefold(),
            )
        ).inserted_primary_key[0]
        for day in days:
            db.execute(
                insert(checkins_t).values(habit_id=habit_id, user_id=user, day=day, created_at=_AT)
            )
        db.commit()
    return habit_id


def _get(client, **params):
    return client.get("/api/world", params=params)


def test_unauthenticated_gets_existing_401(tmp_path):
    application, _database = _open(tmp_path, principal=None)
    application.dependency_overrides.pop(require_principal, None)
    with TestClient(application, raise_server_exceptions=False) as client:
        response = _get(client)
    assert response.status_code == 401


def test_cross_user_isolation_same_dates(tmp_path):
    application, database = _open(tmp_path)
    a_id = _seed(database, 1, "Habit A", date(2026, 9, 7), days=[date(2026, 10, 27)])
    b_id = _seed(database, 2, "Habit B", date(2026, 9, 7), days=[date(2026, 10, 27)])
    with TestClient(application) as client:
        one = _get(client).json()
        application.dependency_overrides[require_principal] = lambda: Principal(2, "other", "Other")
        two = _get(client).json()
    one_ids = [h["habit_id"] for w in one["weeks"] for h in w["habits"]]
    two_ids = [h["habit_id"] for w in two["weeks"] for h in w["habits"]]
    assert one_ids == [a_id]
    assert two_ids == [b_id]
    assert "Habit B" not in str(one)
    assert "Habit A" not in str(two)


def test_tz_boundary_clock(tmp_path):
    clock = datetime(2026, 10, 27, 6, 30, tzinfo=UTC)  # 23:30 PDT on Oct 26
    application, database = _open(tmp_path, clock=clock)
    _seed(database, 1, "Habit A", date(2026, 9, 7), days=[date(2026, 10, 26)])
    with TestClient(application) as client:
        la = _get(client, tz="America/Los_Angeles").json()
        utc = _get(client, tz="UTC").json()
        no_tz = _get(client).json()
    assert la["meta"]["today"] == "2026-10-26"
    assert utc["meta"]["today"] == "2026-10-27"
    assert no_tz["meta"]["today"] == "2026-10-27"  # absent tz means UTC
