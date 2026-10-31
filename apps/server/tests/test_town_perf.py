"""AC-I14: GET /api/town p50 over 200 habits and three years of check-ins.

The 50 ms assertion is the CI budget. This file is marked perf so coverage
runs skip it. CI runs it once, without coverage, and prints the profile.
"""

import cProfile
import pstats
import statistics
import time
from datetime import UTC, date, datetime, timedelta

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import insert

from apps.server.auth import Principal
from apps.server.database import open_database
from apps.server.main import Dependencies, Settings, create_app
from apps.server.town.clock import get_town_clock
from apps.server.town.models import Habit, HabitCheckin, TownBase
from apps.server.town.schemas import Town

pytestmark = pytest.mark.perf

PERF_CLOCK = datetime(2026, 10, 29, 12, 0, tzinfo=UTC)
_START = date(2023, 10, 30)
_END = date(2026, 10, 29)


def _seed(database) -> None:
    TownBase.metadata.create_all(database.engine)
    span = (_END - _START).days + 1
    daily = [_START + timedelta(days=offset) for offset in range(span)]
    weekly = [day for day in daily if day.weekday() in {0, 2, 4}]
    created_at = datetime(2023, 10, 30, tzinfo=UTC)
    habits = [
        {
            "id": index + 1,
            "user_id": 1,
            "name": f"Habit {index:03d}",
            "slot": index if index < 6 else 0,
            "building_style": "cottage",
            "per_week": 7 if index % 2 == 0 else 3,
            "created_on": _START,
            "created_at": created_at,
            "archived_at": None if index < 6 else created_at,
            "archived_on": None if index < 6 else _END,
            "name_key": f"habit {index:03d}",
        }
        for index in range(200)
    ]
    with database.engine.begin() as connection:
        connection.execute(insert(Habit), habits)
        batch: list[dict] = []
        for index in range(200):
            days = daily if index % 2 == 0 else weekly
            habit_id = index + 1
            for day in days:
                batch.append(
                    {"habit_id": habit_id, "user_id": 1, "day": day, "created_at": created_at}
                )
                if len(batch) >= 5000:
                    connection.execute(insert(HabitCheckin), batch)
                    batch.clear()
        if batch:
            connection.execute(insert(HabitCheckin), batch)


def test_get_town_p50_stays_under_50ms(tmp_path):
    database = open_database(f"sqlite:///{tmp_path / 'town.db'}")
    _seed(database)
    application = create_app(
        Settings(
            database_url=database.url, release="test", web_root=tmp_path / "web", openapi=False
        ),
        Dependencies(
            database=database,
            principal=Principal(1, "ada", "Ada"),
            check_schema=False,
            check_frontend=False,
        ),
    )
    application.dependency_overrides[get_town_clock] = lambda: PERF_CLOCK
    samples: list[float] = []
    try:
        with TestClient(application) as client:
            warmup = client.get("/api/town", params={"tz": "UTC"})
            assert warmup.status_code == 200
            Town.model_validate(warmup.json())
            assert len(warmup.json()["habits"]) == 6
            assert len(warmup.json()["archived"]) == 194
            profiler = cProfile.Profile()
            profiler.enable()
            profiled = client.get("/api/town", params={"tz": "UTC"})
            profiler.disable()
            assert profiled.status_code == 200
            pstats.Stats(profiler).sort_stats(pstats.SortKey.CUMULATIVE).print_stats(25)
            for _ in range(20):
                started = time.perf_counter()
                response = client.get("/api/town", params={"tz": "UTC"})
                samples.append((time.perf_counter() - started) * 1000)
                assert response.status_code == 200
    finally:
        database.engine.dispose()
    p50 = statistics.median(samples)
    print(f"GET /api/town p50_ms={p50:.2f} min_ms={min(samples):.2f} max_ms={max(samples):.2f}")
    assert sum(samples) < 30000
    assert p50 < 50
