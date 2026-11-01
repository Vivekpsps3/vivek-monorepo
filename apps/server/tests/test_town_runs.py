"""Seeded property test: SQL islands preserve daily rest bridges and weekly bonuses."""

import random
from datetime import UTC, date, datetime, timedelta

from sqlalchemy import insert
from sqlalchemy.orm import Session

from apps.server.database import open_database
from apps.server.town.engine import evaluate_streak
from apps.server.town.models import Habit, HabitCadence, HabitCheckin, TownBase
from apps.server.town.service import _run_streak, _runs, read_town


def test_runs_equal_day_lists_and_owner_scoping(tmp_path):
    rng = random.Random(20483)
    database = open_database(f"sqlite:///{tmp_path / 'runs.db'}")
    TownBase.metadata.create_all(database.engine)
    now = datetime(2026, 10, 29, tzinfo=UTC)
    today = now.date()
    expected = {}
    points = 0
    with Session(database.engine) as db:
        assert "sqlite_autoindex_habit_checkins_1" in {
            r[1] for r in db.connection().exec_driver_sql("PRAGMA index_list(habit_checkins)")
        }
        for hid in range(1, 281):
            target = (hid % 7) + 1
            created = today - timedelta(days=rng.randrange(1, 420))
            end = created + timedelta(days=rng.randrange((today - created).days + 1))
            density = rng.choice((0, 0.15, 0.5, 0.85, 1))
            days = [
                created + timedelta(days=i)
                for i in range((end - created).days + 1)
                if rng.random() < density
            ]
            db.execute(
                insert(Habit),
                dict(
                    id=hid,
                    user_id=1,
                    name=f"Habit {hid}",
                    name_key=f"habit {hid}",
                    slot=0,
                    building_style="cottage",
                    per_week=target,
                    created_on=created,
                    created_at=now,
                    archived_on=end,
                    archived_at=now,
                ),
            )
            if days:
                db.execute(
                    insert(HabitCheckin),
                    [dict(habit_id=hid, user_id=1, day=d, created_at=now) for d in days],
                )
            expected[hid] = evaluate_streak(created, today, days, target, archived_on=end)
            points += 10 * (len(days) + expected[hid].streak7_count)
        # Wrong-owner and out-of-lifetime rows must not enter any aggregate or day fetch.
        db.execute(
            insert(HabitCheckin),
            [
                dict(habit_id=1, user_id=uid, day=day, created_at=now)
                for uid, day in [(2, date(1900, 1, 1)), (1, today + timedelta(days=1))]
            ],
        )
        for target in range(1, 8):
            ids = [hid for hid in expected if (hid % 7) + 1 == target]
            grouped: dict[int, list[tuple[int, int]]] = {hid: [] for hid in ids}
            for hid, start, length in _runs(db, 1, ids, today, target):
                grouped[hid].append((start, length))
            for hid in ids:
                habit = db.get(Habit, hid)
                assert habit is not None and habit.archived_on is not None
                streak = expected[hid]
                assert _run_streak(grouped[hid], target, habit.archived_on, today) == (
                    streak.current,
                    streak.best_days,
                    streak.best_weeks,
                    streak.streak7_count,
                )
        town = read_town(db, 1, today, "UTC")
        assert town["town"]["xp"] == points
        for view in town["archived"]:
            streak = expected[view["id"]]
            assert (view["best_days"], view["best_weeks"]) == (streak.best_days, streak.best_weeks)
        assert read_town(db, 2, today, "UTC")["town"]["xp"] == 0
        assert read_town(db, 2, today, "UTC")["town"]["founded_on"] is None
    database.engine.dispose()


def test_worked_snapshot_and_multisegment_fallback(tmp_path):
    database = open_database(f"sqlite:///{tmp_path / 'snapshot.db'}")
    TownBase.metadata.create_all(database.engine)
    now = datetime(2026, 10, 29, tzinfo=UTC)
    with Session(database.engine) as db:
        for hid, name, target, start, offsets in [
            (1, "Read", 7, date(2026, 10, 5), [0, 1, 2, 3, 5, 6, 7]),
            (2, "Swim", 3, date(2026, 9, 30), [0, 5, 7, 9, 12, 13, 14, 16, 19]),
            (3, "Floss", 7, date(2026, 9, 21), list(range(7))),
        ]:
            db.execute(
                insert(Habit),
                dict(
                    id=hid,
                    user_id=1,
                    name=name,
                    name_key=name.lower(),
                    slot=hid - 1,
                    building_style="cottage",
                    per_week=target,
                    created_on=start,
                    created_at=now,
                    archived_on=start + timedelta(days=6) if hid == 3 else None,
                    archived_at=now if hid == 3 else None,
                ),
            )
            db.execute(
                insert(HabitCheckin),
                [
                    dict(habit_id=hid, user_id=1, day=start + timedelta(days=i), created_at=now)
                    for i in offsets
                ],
            )
        town = read_town(db, 1, now.date(), "UTC")
        assert town["town"]["xp"] == 260
        assert (town["archived"][0]["xp"], town["archived"][0]["best_days"]) == (80, 7)
        assert (
            _run_streak([(date(2026, 9, 21).toordinal(), 7)], 7, date(2026, 9, 27), now.date())[0]
            == 7
        )
        db.execute(
            insert(HabitCadence),
            dict(
                habit_id=3, user_id=1, per_week=3, effective_from=date(2026, 9, 28), created_at=now
            ),
        )
        habit = db.get(Habit, 3)
        assert habit is not None
        habit.archived_on = date(2026, 10, 10)
        db.flush()
        expected = evaluate_streak(
            date(2026, 9, 21),
            now.date(),
            [date(2026, 9, 21) + timedelta(days=i) for i in range(7)],
            7,
            [(date(2026, 9, 28), 3)],
            habit.archived_on,
        )
        got = read_town(db, 1, now.date(), "UTC")["archived"][0]
        assert (got["best_days"], got["best_weeks"]) == (expected.best_days, expected.best_weeks)
    database.engine.dispose()
