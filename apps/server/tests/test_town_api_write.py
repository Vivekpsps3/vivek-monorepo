"""Town write API: habits, check-ins, errors, CSRF, and owner scope."""

import logging
from datetime import UTC, date, datetime
from types import SimpleNamespace
from typing import NamedTuple

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import func, select

from apps.server.auth import Principal
from apps.server.identity.session import get_current_user
from apps.server.tests.test_composition import _app, _user
from apps.server.tests.test_town_api_read import CLOCK, _open
from apps.server.town.clock import get_town_clock
from apps.server.town.models import Habit, HabitCheckin, TownBase
from apps.server.town.schemas import CheckinResult
from apps.server.town.writes import existing_checkin

TODAY = date(2026, 10, 29)
TZ = "America/Los_Angeles"
_CHECK = "Check the highlighted fields."
_LENGTH = "Use 1 to 40 characters."
_CHARS = "Use letters, numbers and punctuation only."
_SLOT = "slot must be one of the town lots"
_WEEK = "per_week must be an integer from 1 to 7"
_STYLE = "building_style must be one of the town styles"


def _quiet(monkeypatch):
    monkeypatch.delenv("API_KEY", raising=False)
    monkeypatch.delenv("FINANCE_API_KEY", raising=False)
    monkeypatch.setenv("LOCAL_DEV_AUTH", "0")


def _pin(application, user_id=1):
    # Writes call get_current_user. Reads keep the pinned require_principal.
    application.dependency_overrides[get_current_user] = lambda: SimpleNamespace(id=user_id)


@pytest.fixture
def api(tmp_path, monkeypatch):
    _quiet(monkeypatch)
    folder = tmp_path / "w"
    folder.mkdir()
    application, database = _open(folder, Principal(1, "ada", "Ada"))
    _pin(application)
    with TestClient(application) as client:
        yield client, database, application
    database.engine.dispose()


def _post(client, payload, tz=TZ):
    return client.post("/api/town/habits", params={"tz": tz}, json=payload)


def _patch(client, habit_id, payload, tz=TZ):
    return client.patch(f"/api/town/habits/{habit_id}", params={"tz": tz}, json=payload)


def _check(client, habit_id, day, tz=TZ):
    return client.post(
        f"/api/town/habits/{habit_id}/checkins", params={"tz": tz}, json={"day": day}
    )


def _undo(client, habit_id, day, tz=TZ):
    return client.delete(f"/api/town/habits/{habit_id}/checkins/{day}", params={"tz": tz})


def _err(response, status, code, message, fields=None):
    body = response.json()
    assert response.status_code == status
    assert body["code"] == code
    assert body["message"] == message
    assert body["field_errors"] == fields


def _plant(database, name, slot, per_week, created, days=(), archived=None, style="forge"):
    db = database.sessionmaker()
    habit = Habit(
        user_id=1,
        name=name,
        slot=slot,
        building_style=style,
        per_week=per_week,
        created_on=created,
        created_at=CLOCK,
        archived_at=CLOCK if archived else None,
        archived_on=archived,
        name_key=name.casefold(),
    )
    db.add(habit)
    db.flush()
    for day in days:
        db.add(HabitCheckin(habit_id=habit.id, user_id=1, day=day, created_at=CLOCK))
    db.commit()
    habit_id = habit.id
    db.close()
    return habit_id


def test_conflicts_limit_and_names(api):
    client, database, _ = api
    first = _post(client, {"name": "Read", "slot": 0, "per_week": 7})
    assert first.status_code == 201
    _err(
        _post(client, {"name": "read", "slot": 1, "per_week": 7}),
        409,
        "name_taken",
        "You already have a habit with that name.",
    )
    _err(
        _post(client, {"name": "Swim", "slot": 0, "per_week": 7}),
        409,
        "slot_occupied",
        "That lot already has a building.",
    )
    _err(
        _post(client, {"name": "Lift", "slot": 2, "per_week": 7}),
        409,
        "slot_locked",
        "That lot unlocks at Lv 3.",
    )
    _plant(database, "Locked", 2, 7, TODAY)
    _err(
        _post(client, {"name": "Other", "slot": 2, "per_week": 7}),
        409,
        "slot_occupied",
        "That lot already has a building.",
    )
    renamed = _patch(client, first.json()["id"], {"name": "READ"})
    assert renamed.status_code == 200 and renamed.json()["name"] == "READ"
    db = database.sessionmaker()
    for index in range(198):
        db.add(
            Habit(
                user_id=1,
                name=f"Old {index}",
                slot=0,
                building_style="cottage",
                per_week=7,
                created_on=TODAY,
                created_at=CLOCK,
                archived_at=CLOCK,
                archived_on=TODAY,
                name_key=f"old {index}",
            )
        )
    db.commit()
    db.close()
    _err(
        _post(client, {"name": "One more", "slot": 1, "per_week": 7}),
        409,
        "habit_limit",
        "You've reached 200 habits, including archived ones.",
    )


def test_name_taken_is_scoped_to_the_user(api):
    client, _, application = api
    first = _post(client, {"name": "Read", "slot": 0, "per_week": 7})
    assert first.status_code == 201
    _pin(application, 2)
    second = _post(client, {"name": "Read", "slot": 0, "per_week": 7})
    assert second.status_code == 201
    assert second.json()["name"] == "Read"
    _pin(application, 1)
    _err(
        _post(client, {"name": "read", "slot": 1, "per_week": 7}),
        409,
        "name_taken",
        "You already have a habit with that name.",
    )


def test_window_idempotent_checkin_and_dst(api, tmp_path, monkeypatch):
    client, database, _ = api
    habit_id = _plant(database, "Early", 1, 7, date(2026, 10, 1))
    for day, status in (("2026-10-28", 201), ("2026-10-29", 201), ("2026-10-30", 201)):
        response = _check(client, habit_id, day)
        assert response.status_code == status and response.json()["checked"] is True
        CheckinResult.model_validate(response.json())
    again = _check(client, habit_id, "2026-10-29")
    # today+1 is stored, but XP is evaluated through today, so only two days count.
    assert again.status_code == 200 and again.json()["habit"]["xp"] == 20
    db = database.sessionmaker()
    count = db.scalar(
        select(func.count()).select_from(HabitCheckin).where(HabitCheckin.habit_id == habit_id)
    )
    db.close()
    assert count == 3
    calls = {"n": 0}
    real = existing_checkin

    def once(*args, **kwargs):
        calls["n"] += 1
        if calls["n"] == 1:
            return None
        return real(*args, **kwargs)

    monkeypatch.setattr("apps.server.town.writes.existing_checkin", once)
    forced = _check(client, habit_id, "2026-10-29")
    assert forced.status_code == 200 and forced.json()["checked"] is True
    _err(
        _check(client, habit_id, "2026-10-27"),
        422,
        "day_out_of_window",
        "You can only check in for today or yesterday.",
    )
    fresh = _post(client, {"name": "Today only", "slot": 0, "per_week": 7})
    _err(
        _check(client, fresh.json()["id"], "2026-10-28"),
        422,
        "day_before_habit",
        "That day is before this habit started.",
    )
    _err(
        _undo(client, habit_id, "2026-10-28"),
        409,
        "checkin_locked",
        "Only today's check-in can be undone.",
    )
    undone = _undo(client, habit_id, "2026-10-29")
    assert undone.status_code == 200 and undone.json()["checked"] is False
    assert undone.json()["habit"]["xp"] == 10
    repeat = _undo(client, habit_id, "2026-10-29")
    assert repeat.status_code == 200 and repeat.json()["checked"] is False
    # today+2 is past the undo window. A planted row must stay.
    later = date(2026, 10, 31)
    db = database.sessionmaker()
    db.add(HabitCheckin(habit_id=habit_id, user_id=1, day=later, created_at=CLOCK))
    db.commit()
    db.close()
    _err(
        _undo(client, habit_id, "2026-10-31"),
        409,
        "checkin_locked",
        "Only today's check-in can be undone.",
    )
    db = database.sessionmaker()
    kept = db.scalar(
        select(HabitCheckin.id).where(HabitCheckin.habit_id == habit_id, HabitCheckin.day == later)
    )
    db.close()
    assert kept is not None
    _err(_check(client, 999, "2026-10-29"), 404, "habit_not_found", "That habit doesn't exist.")
    folder = tmp_path / "dst"
    folder.mkdir()
    clock = datetime(2026, 11, 1, 19, 0, tzinfo=UTC)
    application, dst_db = _open(folder, Principal(1, "ada", "Ada"), clock)
    _pin(application)
    with TestClient(application) as dst:
        made = _post(dst, {"name": "DST", "slot": 0, "per_week": 7})
        assert made.status_code == 201 and made.json()["created_on"] == "2026-11-01"
        checked = _check(dst, made.json()["id"], "2026-11-01")
        assert checked.status_code == 201
    dst_db.engine.dispose()


def test_cross_user_and_quiet_logs(api, caplog):
    client, database, application = api
    caplog.set_level(logging.DEBUG)
    created = _post(client, {"name": "Zzz-Quill-9", "slot": 0, "per_week": 7})
    habit_id = created.json()["id"]
    checked = _check(client, habit_id, "2026-10-29")
    assert created.status_code == 201 and checked.status_code == 201
    assert "Zzz-Quill-9" not in caplog.text
    _pin(application, 2)
    for response in (
        _patch(client, habit_id, {"name": "Nope"}),
        _check(client, habit_id, "2026-10-29"),
        _undo(client, habit_id, "2026-10-29"),
    ):
        _err(response, 404, "habit_not_found", "That habit doesn't exist.")
    _pin(application, 1)
    town = client.get("/api/town", params={"tz": TZ}).json()
    assert town["habits"][0]["name"] == "Zzz-Quill-9"
    assert town["habits"][0]["checked_today"] is True
    db = database.sessionmaker()
    assert db.scalar(select(func.count()).select_from(HabitCheckin)) == 1
    db.close()


def _call(client, method, url, token=None, csrf=None, **kwargs):
    client.cookies.clear()
    headers = dict(kwargs.pop("headers", {}))
    if token:
        cookie = f"finance_session={token}"
        if csrf:
            cookie += f"; finance_csrf={csrf}"
            headers["X-CSRF-Token"] = csrf
        headers["Cookie"] = cookie
    response = getattr(client, method)(url, headers=headers, **kwargs)
    client.cookies.clear()
    return response


def test_csrf_and_anonymous_writes(tmp_path, monkeypatch):
    _quiet(monkeypatch)
    application, database = _app(tmp_path)
    TownBase.metadata.create_all(database.engine)
    _user(database, 1, "tok", "csrf-token")
    application.dependency_overrides[get_town_clock] = lambda: CLOCK
    body = {"name": "Session", "slot": 0, "per_week": 7}
    with TestClient(application) as client:
        missing = _call(client, "post", "/api/town/habits", json=body)
        assert missing.status_code == 401 and missing.json() == {"detail": "Login required"}
        for method, url in (
            ("patch", "/api/town/habits/1"),
            ("post", "/api/town/habits/1/checkins"),
            ("delete", "/api/town/habits/1/checkins/2026-10-29"),
        ):
            denied = _call(client, method, url)
            assert denied.status_code == 401 and denied.json()["detail"] == "Login required"
        blocked = _call(client, "post", "/api/town/habits", token="tok", json=body)
        assert blocked.status_code == 403 and blocked.json()["detail"] == "Invalid CSRF token"
        created = _call(
            client, "post", "/api/town/habits", token="tok", csrf="csrf-token", json=body
        )
        assert created.status_code == 201
        habit_id = created.json()["id"]
        patch = _call(
            client, "patch", f"/api/town/habits/{habit_id}", token="tok", json={"name": "X"}
        )
        assert patch.status_code == 403
        undo = _call(
            client, "delete", f"/api/town/habits/{habit_id}/checkins/2026-10-29", token="tok"
        )
        assert undo.status_code == 403
        seen = _call(client, "get", "/api/town", token="tok", params={"tz": TZ})
        assert seen.status_code == 200
    database.engine.dispose()


def _set_clock(application, moment):
    application.dependency_overrides[get_town_clock] = lambda: moment


def _item(client, habit_id, tz=TZ):
    found = client.get("/api/town/habits", params={"tz": tz}).json()["items"]
    for item in found:
        if item["id"] == habit_id:
            return item
    raise AssertionError(habit_id)


class _LocalDay(NamedTuple):
    clock: datetime
    zone: str | None
    local_today: date
    resolved_zone: str


# The optional UTC±2 clamp is not the contract. Each row is a trusted clock
# plus the zone the client sent. local_today is the golden calendar day.
_LOCAL_DAYS = (
    _LocalDay(
        datetime(2026, 10, 29, 12, 0, tzinfo=UTC),
        "America/Los_Angeles",
        date(2026, 10, 29),
        "America/Los_Angeles",
    ),
    _LocalDay(
        datetime(2026, 10, 29, 12, 0, tzinfo=UTC),
        "Pacific/Kiritimati",
        date(2026, 10, 30),
        "Pacific/Kiritimati",
    ),
    _LocalDay(
        datetime(2026, 10, 30, 0, 30),
        "America/Los_Angeles",
        date(2026, 10, 29),
        "America/Los_Angeles",
    ),
    _LocalDay(
        datetime(2026, 10, 29, 12, 0, tzinfo=UTC),
        None,
        date(2026, 10, 29),
        "UTC",
    ),
    _LocalDay(
        datetime(2026, 10, 29, 12, 0, tzinfo=UTC),
        "Not/AZone",
        date(2026, 10, 29),
        "UTC",
    ),
)


def test_foreign_owner_cannot_use_a_locally_valid_checkin_day(api):
    """A second user cannot check in or undo the owner's local today."""
    client, database, application = api
    _set_clock(application, datetime(2026, 10, 29, 12, 0, tzinfo=UTC))
    habit_id = _plant(database, "Owned", 0, 7, date(2026, 10, 1))
    made = _check(client, habit_id, "2026-10-29")
    assert made.status_code == 201 and made.json()["checked"] is True
    missing = "That habit doesn't exist."
    _pin(application, 2)
    for day in ("2026-10-28", "2026-10-29", "2026-10-30"):
        _err(_check(client, habit_id, day), 404, "habit_not_found", missing)
        _err(_undo(client, habit_id, day), 404, "habit_not_found", missing)
    _pin(application, 1)
    town = client.get("/api/town", params={"tz": TZ}).json()
    assert town["town"]["today"] == "2026-10-29"
    assert town["habits"][0]["name"] == "Owned" and town["habits"][0]["checked_today"] is True
    db = database.sessionmaker()
    count = db.scalar(
        select(func.count())
        .select_from(HabitCheckin)
        .where(HabitCheckin.habit_id == habit_id, HabitCheckin.user_id == 1)
    )
    foreign = db.scalar(
        select(func.count()).select_from(HabitCheckin).where(HabitCheckin.user_id == 2)
    )
    db.close()
    assert count == 1 and foreign == 0


def test_checkin_conflict_without_a_visible_row_is_not_success(api, monkeypatch):
    """The insert race reports success only when the row is actually there."""
    client, database, application = api
    _set_clock(application, datetime(2026, 10, 29, 12, 0, tzinfo=UTC))
    habit_id = _plant(database, "Race", 0, 7, date(2026, 10, 1))
    made = _check(client, habit_id, "2026-10-29")
    assert made.status_code == 201
    monkeypatch.setattr("apps.server.town.writes.existing_checkin", lambda *_a, **_k: None)
    failed = _check(client, habit_id, "2026-10-29")
    assert failed.status_code == 500
    body = failed.json()
    assert body["detail"] == "Internal server error"
    assert set(body) == {"detail", "request_id"}
    assert "checked" not in body
    db = database.sessionmaker()
    count = db.scalar(
        select(func.count()).select_from(HabitCheckin).where(HabitCheckin.habit_id == habit_id)
    )
    db.close()
    assert count == 1
