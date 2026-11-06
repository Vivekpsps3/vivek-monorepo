"""Two sessions writing one habit or one check-in leave a single row."""

import threading
from datetime import date

import pytest
from sqlalchemy import func, select

from apps.server.auth import Principal
from apps.server.errors import APIError
from apps.server.tests.test_town_api_read import CLOCK, _open
from apps.server.town.models import Habit, HabitCheckin
from apps.server.town.schemas import HabitCreate
from apps.server.town.writes import create_checkin_day, create_habit_row

TODAY = date(2026, 10, 29)


@pytest.fixture
def db(tmp_path, monkeypatch):
    monkeypatch.delenv("API_KEY", raising=False)
    monkeypatch.delenv("FINANCE_API_KEY", raising=False)
    monkeypatch.setenv("LOCAL_DEV_AUTH", "0")
    folder = tmp_path / "race"
    folder.mkdir()
    _application, database = _open(folder, Principal(1, "ada", "Ada"))
    with database.engine.begin() as connection:
        connection.exec_driver_sql("PRAGMA journal_mode=WAL")
    yield database
    database.engine.dispose()


def _join(workers):
    threads = [threading.Thread(target=worker) for worker in workers]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join(10)
        assert not thread.is_alive()


def test_two_sessions_leave_one_checkin(db):
    session = db.sessionmaker()
    habit = Habit(
        user_id=1,
        name="Race",
        slot=0,
        building_style="forge",
        per_week=7,
        created_on=TODAY,
        created_at=CLOCK,
        name_key="race",
    )
    session.add(habit)
    session.commit()
    habit_id = habit.id
    session.close()
    barrier = threading.Barrier(2)
    outcomes: list[int] = []
    errors: list[BaseException] = []

    def once():
        own = db.sessionmaker()
        try:
            barrier.wait(5)
            _payload, status = create_checkin_day(own, 1, habit_id, TODAY, CLOCK, "UTC", TODAY)
            own.commit()
            outcomes.append(status)
        except Exception as exc:
            errors.append(exc)
            own.rollback()
        finally:
            own.close()

    _join([once, once])
    assert errors == []
    assert sorted(outcomes) == [200, 201]
    check = db.sessionmaker()
    count = check.scalar(select(func.count()).select_from(HabitCheckin))
    check.close()
    assert count == 1


def test_two_sessions_one_slot(db):
    barrier = threading.Barrier(2)
    outcomes: list[str] = []
    errors: list[BaseException] = []

    def once(name: str):
        own = db.sessionmaker()
        try:
            barrier.wait(5)
            create_habit_row(
                own, 1, TODAY, CLOCK, "UTC", HabitCreate(name=name, slot=0, per_week=7)
            )
            own.commit()
            outcomes.append("ok")
        except APIError as exc:
            own.rollback()
            outcomes.append(exc.code)
        except Exception as exc:
            errors.append(exc)
            own.rollback()
        finally:
            own.close()

    _join([lambda: once("Alpha"), lambda: once("Beta")])
    assert errors == []
    assert sorted(outcomes) == ["ok", "slot_occupied"]
    check = db.sessionmaker()
    assert check.scalar(select(func.count()).select_from(Habit)) == 1
    check.close()
