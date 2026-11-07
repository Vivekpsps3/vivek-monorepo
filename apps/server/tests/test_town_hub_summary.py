"""Town Hub summary: shape, owner scope, empty state, and streak reduction."""

from datetime import UTC, date, datetime

import pytest
from fastapi.testclient import TestClient

from apps.server.auth import Principal
from apps.server.database import open_database
from apps.server.main import Dependencies, Settings, create_app
from apps.server.town.clock import get_town_clock
from apps.server.town.models import Habit, HabitCheckin, TownBase
from apps.server.town.schemas import HubTownSummary

CLOCK = datetime(2026, 10, 29, 19, 0, tzinfo=UTC)
_AT = datetime(2026, 10, 1, tzinfo=UTC)


def _open(folder, principal):
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
    application.dependency_overrides[get_town_clock] = lambda: CLOCK
    return application, database


def _add(db, user, name, slot, per_week, created, days=()):
    habit = Habit(
        user_id=user,
        name=name,
        slot=slot,
        building_style="forge",
        per_week=per_week,
        created_on=created,
        created_at=datetime(2026, 9, 1, tzinfo=UTC),
        archived_at=None,
        archived_on=None,
        name_key=name.casefold(),
    )
    db.add(habit)
    db.flush()
    for day in days:
        db.add(HabitCheckin(habit_id=habit.id, user_id=user, day=day, created_at=_AT))
    db.flush()
    return habit


def _seed(db):
    # Daily habit on a 3-day current streak, checked today.
    _add(
        db,
        1,
        "Read 20 pages",
        0,
        7,
        date(2026, 10, 20),
        [date(2026, 10, 27), date(2026, 10, 28), date(2026, 10, 29)],
    )
    # Daily habit checked yesterday only: not done today, shorter streak.
    _add(db, 1, "Stretch", 1, 7, date(2026, 10, 20), [date(2026, 10, 28)])
    # Another owner's habit: a 10-day streak checked today. Must never leak.
    _add(
        db,
        2,
        "Meditate",
        0,
        7,
        date(2026, 10, 1),
        [date(2026, 10, day) for day in range(20, 30)],
    )
    db.commit()


@pytest.fixture
def world(tmp_path, monkeypatch):
    monkeypatch.delenv("API_KEY", raising=False)
    monkeypatch.delenv("FINANCE_API_KEY", raising=False)
    monkeypatch.setenv("LOCAL_DEV_AUTH", "0")
    application, database = _open(tmp_path, Principal(1, "ada", "Ada"))
    db = database.sessionmaker()
    _seed(db)
    db.close()
    try:
        with TestClient(application) as client:
            yield client, database
    finally:
        database.engine.dispose()


def test_summary_requires_login(tmp_path, monkeypatch):
    monkeypatch.setenv("LOCAL_DEV_AUTH", "0")
    application, database = _open(tmp_path, None)
    try:
        with TestClient(application) as client:
            response = client.get("/api/town/summary")
        assert response.status_code == 401
        assert response.json() == {"detail": "Login required"}
    finally:
        database.engine.dispose()


def test_summary_shape_counts_and_streak(world):
    client, _database = world
    response = client.get("/api/town/summary", params={"tz": "America/Los_Angeles"})
    assert response.status_code == 200
    body = response.json()
    HubTownSummary.model_validate(body)
    assert body["name"] == "Terraria-on-Sea"
    assert body["founded_on"] == "2026-10-20"
    assert body["today_done"] == 1
    assert body["today_total"] == 2
    assert body["longest_streak"] == 3
    assert body["longest_streak_unit"] == "days"
    # The card can never disagree with the town page's own progress numbers.
    town = client.get("/api/town", params={"tz": "America/Los_Angeles"}).json()["town"]
    assert body["level"] == town["level"]
    assert body["xp"] == town["xp"]
    assert body["level_xp_start"] == town["level_xp_start"]
    assert body["next_level_xp"] == town["next_level_xp"]


def test_summary_is_owner_scoped(tmp_path, monkeypatch):
    monkeypatch.setenv("LOCAL_DEV_AUTH", "0")
    application, database = _open(tmp_path, Principal(2, "bea", "Bea"))
    db = database.sessionmaker()
    _seed(db)
    db.close()
    try:
        with TestClient(application) as client:
            body = client.get("/api/town/summary").json()
        assert body["today_done"] == 1
        assert body["today_total"] == 1
        assert body["longest_streak"] == 10
        assert body["longest_streak_unit"] == "days"
        assert body["founded_on"] == "2026-10-01"
    finally:
        database.engine.dispose()


def test_summary_empty_town(tmp_path, monkeypatch):
    monkeypatch.setenv("LOCAL_DEV_AUTH", "0")
    application, database = _open(tmp_path, Principal(3, "cy", "Cy"))
    try:
        with TestClient(application) as client:
            response = client.get("/api/town/summary")
        assert response.status_code == 200
        body = response.json()
        HubTownSummary.model_validate(body)
        assert body["founded_on"] is None
        assert body["today_done"] == 0
        assert body["today_total"] == 0
        assert body["longest_streak"] == 0
        assert body["longest_streak_unit"] is None
        assert body["xp"] == 0
    finally:
        database.engine.dispose()


def test_summary_weekly_streak_wins_in_its_own_unit(tmp_path, monkeypatch):
    monkeypatch.setenv("LOCAL_DEV_AUTH", "0")
    application, database = _open(tmp_path, Principal(1, "ada", "Ada"))
    db = database.sessionmaker()
    # One check-in in each of the last three weeks (per-week target 1).
    _add(
        db,
        1,
        "Swim laps",
        0,
        1,
        date(2026, 10, 1),
        [date(2026, 10, 13), date(2026, 10, 20), date(2026, 10, 29)],
    )
    # A 5-day daily streak: 5 days < 3 weeks x 7, so the weekly streak wins.
    _add(
        db,
        1,
        "Read 20 pages",
        1,
        7,
        date(2026, 10, 20),
        [date(2026, 10, day) for day in range(25, 30)],
    )
    db.commit()
    db.close()
    try:
        with TestClient(application) as client:
            town = client.get("/api/town").json()
            weekly = next(h for h in town["habits"] if h["name"] == "Swim laps")
            assert weekly["streak"]["unit"] == "weeks"
            body = client.get("/api/town/summary").json()
        assert body["longest_streak"] == weekly["streak"]["current"]
        assert body["longest_streak_unit"] == "weeks"
        assert body["today_done"] == 2
        assert body["today_total"] == 2
    finally:
        database.engine.dispose()
