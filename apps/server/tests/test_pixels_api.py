"""PB2: GET /api/pixels — owner scoping, validation matrix, source isolation."""

from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import text

from apps.server.tests.test_birthday_route import _call, _user
from apps.server.tests.test_composition import _app
from apps.server.town.models import TownBase


def _open(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    monkeypatch.delenv("API_KEY", raising=False)
    monkeypatch.delenv("FINANCE_API_KEY", raising=False)
    monkeypatch.setenv("LOCAL_DEV_AUTH", "0")
    application, database = _app(tmp_path)
    # The composition harness creates Finance/Travel/Media tables; Town's
    # tables come from migrations in production, so create them here.
    TownBase.metadata.create_all(database.engine)
    return application, database


def _seed_user(database, user_id: int, token: str) -> None:
    _user(database, user_id, token, f"csrf-{user_id}")


def _habit(db, habit_id: int, user_id: int) -> None:
    db.execute(
        text(
            "INSERT INTO habits (id, user_id, name, slot, building_style, per_week, created_on, created_at, name_key) "
            "VALUES (:id, :user, :name, :id, 'cottage', 7, '2026-01-01', '2026-01-01 00:00:00+00:00', :key)"
        ),
        {"id": habit_id, "user": user_id, "name": f"H{habit_id}", "key": f"h{habit_id}"},
    )


def _checkin(db, habit_id: int, user_id: int, day: str) -> None:
    db.execute(
        text(
            "INSERT INTO habit_checkins (habit_id, user_id, day, created_at) "
            "VALUES (:habit, :user, :day, '2026-01-01 00:00:00+00:00')"
        ),
        {"habit": habit_id, "user": user_id, "day": day},
    )


def _episode(db, progress_id: int, user_id: int, watched_on: str | None) -> None:
    db.execute(
        text(
            "INSERT INTO catalog_items (id, kind, title, source, source_id, created_at, updated_at) "
            "VALUES (:id, 'show', 'Show', 'manual', :sid, '2026-01-01 00:00:00+00:00', '2026-01-01 00:00:00+00:00')"
        ),
        {"id": progress_id, "sid": f"s{progress_id}"},
    )
    db.execute(
        text(
            "INSERT INTO episodes (id, catalog_id, season_number, episode_number) "
            "VALUES (:id, :id, 1, 1)"
        ),
        {"id": progress_id},
    )
    db.execute(
        text(
            "INSERT INTO episode_progress (id, user_id, episode_id, watched, watched_on) "
            "VALUES (:id, :user, :id, 1, :on)"
        ),
        {"id": progress_id, "user": user_id, "on": watched_on},
    )


def _trip(db, trip_id: int, user_id: int, start: str, end: str, status: str = "booked") -> None:
    db.execute(
        text(
            "INSERT INTO trips (id, user_id, title, start_date, end_date, status, counts_as_pto, created_at, updated_at) "
            "VALUES (:id, :user, 'Trip', :start, :end, :status, 1, '2026-01-01 00:00:00+00:00', '2026-01-01 00:00:00+00:00')"
        ),
        {"id": trip_id, "user": user_id, "start": start, "end": end, "status": status},
    )


def _seeded(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    application, database = _open(tmp_path, monkeypatch)
    _seed_user(database, 1, "token-a")
    _seed_user(database, 2, "token-b")
    db = database.sessionmaker()
    _habit(db, 10, 1)
    _habit(db, 20, 2)
    # User A: two check-ins on Jan 3 (two habits would differ; same habit
    # twice is impossible, so a second habit row stands in via habit 11).
    _habit(db, 11, 1)
    _checkin(db, 10, 1, "2026-01-03")
    _checkin(db, 11, 1, "2026-01-03")
    _checkin(db, 10, 1, "2026-01-05")
    _checkin(db, 20, 2, "2026-01-03")
    _episode(db, 100, 1, "2026-01-03")
    _episode(db, 101, 1, None)
    _episode(db, 200, 2, "2026-01-04")
    _trip(db, 1000, 1, "2026-01-04", "2026-01-06")
    _trip(db, 2000, 2, "2026-01-03", "2026-01-03")
    db.commit()
    db.close()
    return application, database


def test_owner_scoped_sparse_days(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    application, _database = _seeded(tmp_path, monkeypatch)
    with TestClient(application) as client:
        response = _call(client, "get", "/api/pixels?from=2026-01-01&to=2026-01-31", "token-a")
    assert response.status_code == 200
    # The router sets "private, no-store"; the security-headers middleware
    # normalizes directive order, so assert both directives are present.
    cache_control = response.headers["cache-control"]
    assert "private" in cache_control and "no-store" in cache_control
    body = response.json()
    assert body["from"] == "2026-01-01"
    assert body["to"] == "2026-01-31"
    assert body["sources"] == {"town": "ok", "media": "ok", "travel": "ok"}
    assert body["first_activity_on"] == "2026-01-03"
    assert "profile" not in body
    assert body["days"] == [
        {"date": "2026-01-03", "town": 2, "media": 1},
        {"date": "2026-01-04", "trip": 1},
        {"date": "2026-01-05", "town": 1, "trip": 1},
        {"date": "2026-01-06", "trip": 1},
    ]
    # No Finance keys anywhere, and no other user's data leaked in.
    assert "fin" not in str(body)
    assert "finance" not in str(body).lower()


def test_unauthenticated_is_401(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    application, _database = _open(tmp_path, monkeypatch)
    with TestClient(application) as client:
        response = client.get("/api/pixels?from=2026-01-01&to=2026-01-31")
    assert response.status_code == 401
