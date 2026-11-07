"""GET /api/world (W2a): habits only, owner scope, ranges, tz, sparse weeks."""

import time
from datetime import UTC, date, datetime, timedelta
from typing import cast

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import Table, event, insert

from apps.server.auth import Principal, require_principal
from apps.server.database import open_database
from apps.server.main import Dependencies, Settings, create_app
from apps.server.town.models import Habit, HabitCheckin, TownBase
from apps.server.world.routes import get_world_clock
from apps.server.world.schemas import WorldResponse

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


def _seed(database, user, name, created_on, days=(), archived=False, style="cabin"):
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


def test_shape_meta_and_cache_control(tmp_path):
    application, database = _open(tmp_path)
    habit_id = _seed(database, 1, "Habit A", date(2026, 9, 7), days=[date(2026, 10, 27)])
    with TestClient(application) as client:
        response = _get(client, tz="UTC")
    assert response.status_code == 200
    assert "no-store" in response.headers["cache-control"]
    payload = WorldResponse.model_validate(response.json())
    assert payload.meta.today == TODAY
    assert payload.meta.current_week == CURRENT_WEEK
    assert payload.meta.start_week == date(2026, 9, 7)
    assert payload.meta.version == 1
    assert len(payload.weeks) == 1
    week = payload.weeks[0]
    assert week.week == CURRENT_WEEK
    assert week.trips == [] and week.finished == [] and week.concepts == []
    assert [h.habit_id for h in week.habits] == [habit_id]
    assert week.habits[0].name == "Habit A"
    assert week.habits[0].style == "cabin"
    assert week.habits[0].archived is False
    assert week.habits[0].days == [date(2026, 10, 27)]


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


def test_sparse_weeks_ascending(tmp_path):
    application, database = _open(tmp_path)
    monday = CURRENT_WEEK - timedelta(weeks=23)  # week 3 of the default range
    week20 = CURRENT_WEEK - timedelta(weeks=6)
    _seed(
        database,
        1,
        "Habit A",
        date(2026, 4, 6),
        days=[monday + timedelta(days=2), week20 + timedelta(days=1)],
    )
    with TestClient(application) as client:
        payload = _get(client).json()
    assert [w["week"] for w in payload["weeks"]] == [
        monday.isoformat(),
        week20.isoformat(),
    ]


def test_archived_habit_still_appears(tmp_path):
    application, database = _open(tmp_path)
    _seed(
        database,
        1,
        "Habit Old",
        date(2026, 9, 7),
        days=[date(2026, 10, 6)],
        archived=True,
    )
    with TestClient(application) as client:
        payload = _get(client).json()
    habit = payload["weeks"][0]["habits"][0]
    assert habit["name"] == "Habit Old"
    assert habit["archived"] is True


def test_days_after_today_are_filtered(tmp_path):
    application, database = _open(tmp_path)
    _seed(
        database,
        1,
        "Habit A",
        date(2026, 9, 7),
        days=[date(2026, 10, 27), date(2026, 10, 30)],  # Friday is after today
    )
    with TestClient(application) as client:
        payload = _get(client).json()
    assert payload["weeks"][0]["habits"][0]["days"] == ["2026-10-27"]


@pytest.mark.parametrize(
    "params",
    [
        {"from": "2026-10-27"},  # from not a Monday
        {"to": "2026-10-27"},  # to not a Monday
        {"from": "2026-10-26", "to": "2026-10-19"},  # from > to
        {"from": "2026-04-27", "to": "2026-10-26"},  # 27 weeks
        {"to": "2026-11-02"},  # to is next Monday (future)
        {"from": "not-a-date"},  # unparseable
    ],
)
def test_range_validation(tmp_path, params):
    application, _database = _open(tmp_path)
    with TestClient(application) as client:
        response = _get(client, **params)
    assert response.status_code == 422
    assert response.json()["code"] == "world_range_invalid"
    assert response.json()["message"] == "That range of weeks isn't available."


def test_exactly_26_weeks_is_ok(tmp_path):
    application, _database = _open(tmp_path)
    with TestClient(application) as client:
        response = _get(client, **{"from": "2026-05-04", "to": "2026-10-26"})
    assert response.status_code == 200


def test_defaults_cover_current_week_minus_25(tmp_path):
    application, database = _open(tmp_path)
    in_range = CURRENT_WEEK - timedelta(weeks=25)
    too_old = CURRENT_WEEK - timedelta(weeks=26)
    _seed(database, 1, "Habit Edge", date(2026, 4, 6), days=[in_range, too_old])
    with TestClient(application) as client:
        payload = _get(client).json()
    assert [w["week"] for w in payload["weeks"]] == [in_range.isoformat()]


def test_from_before_start_week_clamps(tmp_path):
    application, database = _open(tmp_path)
    _seed(database, 1, "Habit A", date(2026, 9, 7), days=[date(2026, 9, 8)])
    with TestClient(application) as client:
        response = _get(client, **{"from": "2026-05-04", "to": "2026-10-26"})
        payload = response.json()
    assert response.status_code == 200
    assert payload["meta"]["start_week"] == "2026-09-07"
    assert [w["week"] for w in payload["weeks"]] == ["2026-09-07"]


def test_range_fully_before_start_week_returns_empty(tmp_path):
    application, database = _open(tmp_path)
    _seed(database, 1, "Habit A", date(2026, 9, 7), days=[date(2026, 9, 8)])
    with TestClient(application) as client:
        response = _get(client, **{"from": "2026-05-04", "to": "2026-08-31"})
    assert response.status_code == 200
    assert response.json()["weeks"] == []


def test_start_week_ten_year_clamp(tmp_path):
    application, database = _open(tmp_path)
    _seed(database, 1, "Habit Ancient", date(2015, 10, 26), days=[date(2026, 10, 27)])
    with TestClient(application) as client:
        payload = _get(client).json()
    expected = (CURRENT_WEEK - timedelta(weeks=519)).isoformat()
    assert payload["meta"]["start_week"] == expected


def test_tz_los_angeles_and_utc(tmp_path):
    application, database = _open(tmp_path)
    _seed(database, 1, "Habit A", date(2026, 9, 7), days=[date(2026, 10, 27)])
    with TestClient(application) as client:
        payload = _get(client, tz="America/Los_Angeles").json()
    assert payload["meta"]["today"] == "2026-10-29"
    assert payload["meta"]["current_week"] == "2026-10-26"


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


def test_tz_dst_date(tmp_path):
    clock = datetime(2026, 11, 1, 19, 0, tzinfo=UTC)  # fall-back Sunday
    application, database = _open(tmp_path, clock=clock)
    _seed(database, 1, "Habit A", date(2026, 9, 7), days=[date(2026, 10, 27)])
    with TestClient(application) as client:
        payload = _get(client, tz="America/Los_Angeles").json()
    assert payload["meta"]["today"] == "2026-11-01"


def test_invalid_tz(tmp_path):
    application, _database = _open(tmp_path)
    with TestClient(application) as client:
        response = _get(client, tz="Not/AZone")
    assert response.status_code == 422
    assert response.json()["code"] == "invalid_tz"
    assert response.json()["message"] == "Your time zone wasn't recognized."


def test_statement_count_is_constant(tmp_path, capsys):
    application, database = _open(tmp_path)
    first_monday = CURRENT_WEEK - timedelta(weeks=25)
    mondays = [first_monday + timedelta(weeks=i) for i in range(26)]
    with database.sessionmaker() as db:
        habit_ids = []
        for n in range(200):
            habit_id = db.execute(
                insert(habits_t).values(
                    user_id=1,
                    name=f"Habit {n}",
                    slot=n,
                    building_style="cabin",
                    per_week=3,
                    created_on=date(2026, 4, 6),
                    created_at=_AT,
                    archived_at=None,
                    archived_on=None,
                    name_key=f"habit {n}",
                )
            ).inserted_primary_key[0]
            habit_ids.append(habit_id)
        db.execute(
            insert(checkins_t),
            [
                {"habit_id": hid, "user_id": 1, "day": monday, "created_at": _AT}
                for hid in habit_ids
                for monday in mondays
            ],
        )
        db.commit()

    statements: list[str] = []

    def count(conn, cursor, statement, parameters, context, executemany):
        statements.append(statement)

    event.listen(database.engine, "before_cursor_execute", count)
    try:
        with TestClient(application) as client:
            started = time.perf_counter()
            response = _get(client)
            elapsed = time.perf_counter() - started
    finally:
        event.remove(database.engine, "before_cursor_execute", count)
    print(f"/api/world over 200 habits x 26 weeks: {elapsed:.3f}s, {len(statements)} statements")
    assert response.status_code == 200
    payload = response.json()
    assert len(payload["weeks"]) == 26
    assert all(len(w["habits"]) == 200 for w in payload["weeks"])
    assert len(statements) <= 4
