"""Town read API: shape, owner scope, history window, clock, and query rulings."""

import logging
from datetime import UTC, date, datetime, timedelta

import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError
from sqlalchemy import event, text

from apps.server.auth import Principal, require_principal
from apps.server.database import open_database
from apps.server.main import Dependencies, Settings, create_app
from apps.server.town.clock import get_town_clock
from apps.server.town.engine import evaluate_streak, habit_xp
from apps.server.town.models import Habit, HabitCadence, HabitCheckin, TownBase
from apps.server.town.schemas import CheckinDays, HabitList, Town
from apps.server.town.service import PassiveDays

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


def test_snapshot_shape_one_query_and_quiet_logs(world, caplog):
    client, database, ids = world
    seen: list[str] = []

    def capture(_conn, _cursor, statement, _parameters, _context, _executemany):
        seen.append(statement)

    event.listen(database.engine, "before_cursor_execute", capture)
    try:
        caplog.set_level(logging.INFO)
        response = client.get("/api/town", params={"tz": "America/Los_Angeles", "unused": "1"})
    finally:
        event.remove(database.engine, "before_cursor_execute", capture)
    assert response.status_code == 200
    body = response.json()
    Town.model_validate(body)
    with pytest.raises(ValidationError):
        Town.model_validate({**body, "extra": 1})
    assert body["town"] == {
        "name": "Terraria-on-Sea",
        "founded_on": "2026-09-30",
        "today": "2026-10-29",
        "tz": "America/Los_Angeles",
        "xp": 260,
        "level": 3,
        "level_xp_start": 250,
        "next_level_xp": 500,
    }
    assert body["constants_version"] == 1 and body["today"] == {"done": 0, "total": 2}
    for key, cap in (("library", 10), ("inn", 15)):
        building = body["buildings"][key]
        assert (building["xp"], building["source"], building["today_cap"], building["level"]) == (
            0,
            "ok",
            cap,
            1,
        )
    assert [(row["slot"], row["state"], row["habit_id"]) for row in body["lots"]] == [
        (0, "occupied", ids["read"]),
        (1, "occupied", ids["swim"]),
        (2, "empty", None),
        (3, "locked", None),
        (4, "locked", None),
        (5, "locked", None),
    ]
    read, swim = body["habits"]
    assert read["name"] == "Read 20 pages" and read["building_style"] == "forge"
    assert read["cadence"] == {
        "per_week": 7,
        "kind": "daily",
        "pending": {"per_week": 3, "effective_from": "2026-11-02"},
    }
    assert (read["xp"], read["level"], read["stage"]) == (80, 2, 2)
    assert read["streak"]["current"] == 0 and read["streak"]["best"] == 7
    assert read["streak"]["rest_day_available"] is True and read["week"] is None
    assert read["last7"] == ["miss"] * 6 + ["pending"]
    assert read["checked_today"] is False and read["can_check_yesterday"] is True
    assert swim["name"] == "Swim laps" and swim["cadence"]["kind"] == "weekly"
    assert (swim["xp"], swim["streak"]["current"], swim["streak"]["best"]) == (100, 0, 2)
    assert swim["streak"]["rest_day_available"] is None
    assert swim["week"] == {"done": 0, "target": 3} and swim["last7"] == ["off"] * 7
    assert body["archived"] == [
        {
            "id": ids["floss"],
            "name": "Floss",
            "xp": 80,
            "level": 2,
            "best_days": 7,
            "best_weeks": 0,
            "created_on": "2026-10-01",
            "archived_on": "2026-10-07",
        }
    ]
    checkins = [item.lower() for item in seen if "habit_checkins" in item.lower()]
    assert checkins and all("distinct" not in item for item in checkins)
    blob = "\n".join(checkins)
    assert "count" in blob and "group by" in blob and "row_number" in blob
    assert "Read 20 pages" not in caplog.text and "2026-10-05" not in caplog.text
    assert get_town_clock().tzinfo is UTC


def test_archived_flag_founding_and_unfounded(world, tmp_path):
    client, _database, ids = world
    active = client.get("/api/town/habits", params={"tz": "America/Los_Angeles"})
    assert active.status_code == 200
    HabitList.model_validate(active.json())
    assert [item["id"] for item in active.json()["items"]] == [ids["read"], ids["swim"]]
    shown = client.get("/api/town/habits", params={"include_archived": "1"})
    assert [item["name"] for item in shown.json()["items"]] == [
        "Read 20 pages",
        "Swim laps",
        "Floss",
    ]
    floss = shown.json()["items"][2]
    assert floss["slot"] is None and floss["archived_on"] == "2026-10-07" and floss["xp"] == 80
    assert floss["streak"]["current"] == 7 and floss["last7"] == ["off"] * 7
    _reject(client.get("/api/town/habits", params={"include_archived": "2"}))
    for flag in ("", "0"):
        kept = client.get("/api/town/habits", params={"include_archived": flag})
        assert [item["id"] for item in kept.json()["items"]] == [ids["read"], ids["swim"]]

    application, database = _pair(tmp_path, "founded")
    db = database.sessionmaker()
    _add(db, 1, "Late", 0, "forge", 7, date(2026, 10, 20))
    _add(db, 1, "Early", 1, "garden", 7, date(2026, 8, 15), archived=date(2026, 8, 20))
    db.commit()
    db.close()
    empty_app, empty_db = _pair(tmp_path, "empty")
    try:
        with TestClient(application) as founded, TestClient(empty_app) as bare:
            assert founded.get("/api/town").json()["town"]["founded_on"] == "2026-08-15"
            body = bare.get("/api/town", params={"tz": "America/Los_Angeles"}).json()
    finally:
        database.engine.dispose()
        empty_db.engine.dispose()
    Town.model_validate(body)
    assert body["town"]["founded_on"] is None
    assert (body["town"]["xp"], body["town"]["level"]) == (0, 1)
    assert body["habits"] == [] and body["archived"] == []
    assert body["today"] == {"done": 0, "total": 0}
    assert [row["state"] for row in body["lots"]] == ["empty", "empty", *["locked"] * 4]


def test_archived_weekly_habit_matches_the_engine(world):
    client, database, _ids = world
    archived_on = date(2026, 10, 14)
    days = [day for day in _C if day <= archived_on]
    db = database.sessionmaker()
    habit = _add(db, 1, "Stretch", 3, "cottage", 3, date(2026, 9, 30), days, archived_on)
    habit_id = habit.id
    db.commit()
    db.close()
    shown = client.get("/api/town/habits", params={"include_archived": "1", "tz": "UTC"})
    assert shown.status_code == 200
    HabitList.model_validate(shown.json())
    row = next(item for item in shown.json()["items"] if item["id"] == habit_id)
    expected = evaluate_streak(date(2026, 9, 30), TODAY, days, 3, archived_on=archived_on)
    assert row["slot"] is None and row["streak"]["unit"] == "weeks"
    assert row["streak"]["rest_day_available"] is None
    assert row["xp"] == habit_xp(len(days), expected.streak7_count)
    assert row["streak"]["current"] == expected.current
    assert row["streak"]["best_weeks"] == expected.best_weeks
    assert expected.week is not None
    assert row["week"] == {"done": expected.week.done, "target": expected.week.target}
    assert row["last7"] == list(expected.last7)


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


def test_checkin_history_window_and_bad_dates(world):
    client, _database, ids = world
    ok = client.get(
        f"/api/town/habits/{ids['read']}/checkins",
        params={"from": "2026-07-01", "to": "2026-10-29", "tz": "America/Los_Angeles"},
    )
    assert ok.status_code == 200
    CheckinDays.model_validate(ok.json())
    assert ok.json()["days"] == [day.isoformat() for day in _A]
    start = TODAY - timedelta(days=120)
    allowed = client.get(
        f"/api/town/habits/{ids['swim']}/checkins",
        params={"from": start.isoformat(), "to": TODAY.isoformat()},
    )
    assert allowed.status_code == 200 and allowed.json()["days"] == [day.isoformat() for day in _C]
    blocked = client.get(
        f"/api/town/habits/{ids['swim']}/checkins",
        params={"from": (TODAY - timedelta(days=121)).isoformat(), "to": TODAY.isoformat()},
    )
    _reject(blocked)
    backwards = client.get(
        f"/api/town/habits/{ids['read']}/checkins",
        params={"from": "2026-10-10", "to": "2026-10-09"},
    )
    assert backwards.status_code == 422 and backwards.json()["field_errors"] is None
    for bad in (
        {"from": "2026-02-31", "to": "2026-03-01"},
        {"from": "yesterday", "to": "2026-10-29"},
        {},
    ):
        _reject(client.get(f"/api/town/habits/{ids['read']}/checkins", params=bad))
    missing = client.get(
        "/api/town/habits/999999/checkins", params={"from": "2026-10-01", "to": "2026-10-02"}
    )
    assert missing.status_code == 404 and missing.json()["code"] == "habit_not_found"
    floss_days = [date(2026, 10, day).isoformat() for day in range(1, 8)]
    archived = client.get(
        f"/api/town/habits/{ids['floss']}/checkins",
        params={"from": "2026-10-01", "to": "2026-10-07"},
    )
    assert archived.status_code == 200 and archived.json()["days"] == floss_days


def test_tz_dst_deleted_checkin_and_passive_flags(world, tmp_path, monkeypatch):
    client, _database, _ids = world
    assert client.get("/api/town").json()["town"]["tz"] == "UTC"
    bad = client.get("/api/town", params={"tz": "Not/AZone"})
    assert bad.status_code == 200 and bad.json()["town"]["tz"] == "UTC"
    assert bad.json()["town"]["today"] == "2026-10-29"
    fall, fall_db = _pair(tmp_path, "fall", clock=datetime(2026, 11, 1, 18, 0, tzinfo=UTC))
    early, early_db = _pair(tmp_path, "early", clock=datetime(2026, 11, 1, 6, 30, tzinfo=UTC))
    try:
        with TestClient(fall) as pinned, TestClient(early) as boundary:
            la = pinned.get("/api/town", params={"tz": "America/Los_Angeles"}).json()["town"]
            assert la["today"] == "2026-11-01"
            behind = boundary.get("/api/town", params={"tz": "America/Los_Angeles"}).json()
            utc = boundary.get("/api/town", params={"tz": "UTC"}).json()
    finally:
        fall_db.engine.dispose()
        early_db.engine.dispose()
    assert behind["town"]["today"] == "2026-10-31" and behind["town"]["tz"] == "America/Los_Angeles"
    assert utc["town"]["today"] == "2026-11-01" and utc["town"]["tz"] == "UTC"

    application, database = _pair(tmp_path, "xp")
    db = database.sessionmaker()
    habit = _add(db, 1, "Water", 0, "cottage", 7, date(2026, 10, 1), (TODAY,))
    habit_id = habit.id
    db.commit()
    db.close()
    try:
        with TestClient(application) as pinned:
            before = pinned.get("/api/town", params={"tz": "UTC"}).json()
            assert before["town"]["xp"] == 10 and before["habits"][0]["checked_today"] is True
            session = database.sessionmaker()
            session.execute(
                text("DELETE FROM habit_checkins WHERE habit_id = :habit_id"),
                {"habit_id": habit_id},
            )
            session.commit()
            session.close()
            after = pinned.get("/api/town", params={"tz": "UTC"}).json()
    finally:
        database.engine.dispose()
    assert after["town"]["xp"] == 0 and after["habits"][0]["xp"] == 0
    assert after["habits"][0]["checked_today"] is False

    def fake(_db, _user, _tz, _founding, _today):
        return PassiveDays(
            episodes={date(2020, 1, 1): 10, TODAY: 1},
            finished={},
            reminders={},
            trips_done={TODAY: 1},
            media_ok=True,
            travel_ok=True,
        )

    monkeypatch.setattr("apps.server.town.service.passive_days", fake)
    counted = client.get("/api/town", params={"tz": "America/Los_Angeles"}).json()
    assert counted["buildings"]["library"]["xp"] == 5 and counted["buildings"]["inn"]["xp"] == 30
    assert counted["town"]["xp"] == 295

    def down(_db, _user, _tz, _founding, _today):
        return PassiveDays(
            episodes={TODAY: 5},
            finished={},
            reminders={TODAY: 5},
            trips_done={TODAY: 2},
            media_ok=False,
            travel_ok=False,
        )

    monkeypatch.setattr("apps.server.town.service.passive_days", down)
    excluded = client.get("/api/town", params={"tz": "America/Los_Angeles"}).json()
    assert excluded["buildings"]["library"]["source"] == "unavailable"
    assert excluded["buildings"]["inn"]["xp"] == 0 and excluded["town"]["xp"] == 260
