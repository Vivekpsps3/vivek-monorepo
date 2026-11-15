"""Town read API: shape, owner scope, history window, clock, and query rulings."""

from datetime import UTC, date, datetime

import pytest
from fastapi.testclient import TestClient

from apps.server.auth import Principal, require_principal
from apps.server.database import open_database
from apps.server.main import Dependencies, Settings, create_app
from apps.server.town.clock import get_town_clock
from apps.server.town.models import Habit, HabitCadence, HabitCheckin, TownBase

CLOCK = datetime(2026, 10, 29, 19, 0, tzinfo=UTC)
TODAY = date(2026, 10, 29)
_A = [date(2026, 10, day) for day in (5, 6, 7, 8, 10, 11, 12)]
_C = [
    date(2026, 9, 30),
    date(2026, 10, 5),
    date(2026, 10, 7),
    date(2026, 10, 9),
    date(2026, 10, 12),
    date(2026, 10, 14),
    date(2026, 10, 16),
    date(2026, 10, 18),
    date(2026, 10, 19),
]
_AT = datetime(2026, 10, 1, tzinfo=UTC)


def _open(folder, principal, clock=CLOCK):
    url = f"sqlite:///{folder / 'site.db'}"
    database = open_database(url)
    TownBase.metadata.create_all(database.engine)
    application = create_app(
        Settings(database_url=url, release="test", web_root=folder / "web", openapi=False),
        Dependencies(
            database=database,
            principal=principal,
            check_schema=False,
            check_frontend=False,
        ),
    )
    application.dependency_overrides[get_town_clock] = lambda: clock
    return application, database


def _add(db, user, name, slot, style, per_week, created, days=(), archived=None):
    habit = Habit(
        user_id=user,
        name=name,
        slot=slot,
        building_style=style,
        per_week=per_week,
        created_on=created,
        created_at=datetime(2026, 9, 1, tzinfo=UTC),
        archived_at=None if archived is None else datetime(2026, 10, 7, tzinfo=UTC),
        archived_on=archived,
        name_key=name.casefold(),
    )
    db.add(habit)
    db.flush()
    for day in days:
        db.add(HabitCheckin(habit_id=habit.id, user_id=user, day=day, created_at=_AT))
    db.flush()
    return habit


def _seed(db):
    read = _add(db, 1, "Read 20 pages", 0, "forge", 7, date(2026, 10, 5), _A)
    swim = _add(db, 1, "Swim laps", 1, "garden", 3, date(2026, 9, 30), _C)
    floss_days = [date(2026, 10, day) for day in range(1, 8)]
    floss = _add(db, 1, "Floss", 2, "cottage", 7, date(2026, 10, 1), floss_days, date(2026, 10, 7))
    db.add(
        HabitCadence(
            habit_id=read.id,
            user_id=1,
            per_week=3,
            effective_from=date(2026, 11, 2),
            created_at=datetime(2026, 10, 29, tzinfo=UTC),
        )
    )
    db.flush()
    return {"read": read.id, "swim": swim.id, "floss": floss.id}


def _pair(tmp_path, name, principal=Principal(1, "ada", "Ada"), clock=CLOCK):
    folder = tmp_path / name
    folder.mkdir()
    return _open(folder, principal, clock)


@pytest.fixture
def world(tmp_path, monkeypatch):
    monkeypatch.delenv("API_KEY", raising=False)
    monkeypatch.delenv("FINANCE_API_KEY", raising=False)
    monkeypatch.setenv("LOCAL_DEV_AUTH", "0")
    application, database = _open(tmp_path, Principal(1, "ada", "Ada"))
    db = database.sessionmaker()
    ids = _seed(db)
    db.commit()
    db.close()
    try:
        with TestClient(application) as client:
            yield client, database, ids
    finally:
        database.engine.dispose()


def _reject(response):
    body = response.json()
    assert response.status_code == 422
    assert body["code"] == "validation_error"
    assert body["message"] == "Check the highlighted fields."
    assert body["field_errors"] is None


def test_owner_scope_and_anonymous(world, tmp_path):
    client, database, ids = world
    db = database.sessionmaker()
    other = _add(db, 2, "Second kettle", 0, "cottage", 7, date(2026, 10, 15), (date(2026, 10, 15),))
    db.commit()
    other_id = other.id
    db.close()
    client.app.dependency_overrides[require_principal] = lambda: Principal(2, "bea", "Bea")
    seen = client.get("/api/town", params={"tz": "America/Los_Angeles"})
    assert seen.status_code == 200 and "Read 20 pages" not in seen.text and "Floss" not in seen.text
    assert "Second kettle" in seen.text and seen.json()["town"]["xp"] == 10
    missing = client.get(
        f"/api/town/habits/{ids['read']}/checkins",
        params={"from": "2026-10-01", "to": "2026-10-29"},
    )
    assert missing.status_code == 404 and missing.json()["code"] == "habit_not_found"
    assert missing.json()["message"] == "That habit doesn't exist."
    theirs = client.get(
        f"/api/town/habits/{other_id}/checkins",
        params={"from": "2026-10-15", "to": "2026-10-15"},
    )
    assert theirs.json()["days"] == ["2026-10-15"]
    application, signed_out = _pair(tmp_path, "anon", None)
    try:
        with TestClient(application) as anon:
            for path, params in (
                ("/api/town", {}),
                ("/api/town/habits", {}),
                ("/api/town/habits/1/checkins", {"from": "2026-10-01", "to": "2026-10-02"}),
            ):
                response = anon.get(path, params=params)
                assert response.status_code == 401 and response.json() == {
                    "detail": "Login required"
                }
    finally:
        signed_out.engine.dispose()
