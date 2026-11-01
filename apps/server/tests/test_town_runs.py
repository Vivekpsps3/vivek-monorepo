"""Seeded checks: SQL runs and read_town match evaluate_streak."""

import random
from dataclasses import dataclass
from datetime import UTC, date, datetime, timedelta

from sqlalchemy import event, insert
from sqlalchemy.orm import Session

from apps.server.database import open_database
from apps.server.town.engine import evaluate_streak, habit_xp
from apps.server.town.models import Habit, HabitCadence, HabitCheckin, TownBase
from apps.server.town.service import _run_streak, _runs, read_checkins, read_habits, read_town


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


@dataclass(frozen=True)
class _Hist:
    name: str
    per_week: int
    created: date
    archived: date
    stored_days: tuple[date, ...]
    engine_days: tuple[date, ...]
    stored_cadence: tuple[tuple[date, int], ...]
    engine_cadence: tuple[tuple[date, int], ...]


def _days(start: date, end: date) -> tuple[date, ...]:
    return tuple(start + timedelta(days=offset) for offset in range((end - start).days + 1))


def _counted(hist: _Hist, today: date) -> int:
    limit = min(today, hist.archived)
    return len({day for day in hist.stored_days if hist.created <= day <= limit})


def _oracle_histories(today: date) -> list[_Hist]:
    """Fixed edges plus a seeded tail. Each edge kills one fuzz-only mutant."""
    start = today - timedelta(days=28)
    end = start + timedelta(days=6)
    week = _days(start, end)
    repeated = (*week[:3], week[2], *week[3:])
    long_end = today - timedelta(days=9)
    span = _days(start, long_end)
    change = start + timedelta(days=7)
    kind_start = date(2026, 9, 1)
    kind_end = date(2026, 10, 20)
    kind_days: list[date] = list(_days(kind_start, kind_start + timedelta(days=6)))
    week_start = date(2026, 9, 14)
    while week_start <= kind_end:
        kind_days.extend(_days(week_start, week_start + timedelta(days=2)))
        week_start += timedelta(days=7)
    kinds = tuple(day for day in kind_days if day <= kind_end)
    rows = [
        _Hist("Segment end", 7, start, end, week, week, (), ()),
        _Hist("Repeated day", 7, start, end, week, repeated, (), ()),
        _Hist(
            "Before created",
            7,
            start,
            end,
            (*_days(start - timedelta(days=2), start - timedelta(days=1)), *week),
            week,
            (),
            (),
        ),
        _Hist("After archive", 7, start, end, (*week, end + timedelta(days=1)), week, (), ()),
        _Hist(
            "Cadence dedupe",
            7,
            start,
            long_end,
            span,
            span,
            ((change, 7),),
            ((change, 3), (change, 7)),
        ),
        _Hist(
            "Two kinds",
            7,
            kind_start,
            kind_end,
            kinds,
            kinds,
            ((date(2026, 9, 14), 3),),
            ((date(2026, 9, 14), 3),),
        ),
    ]
    rng = random.Random(20261031)
    for index in range(8):
        per_week = rng.randrange(1, 8)
        created = today - timedelta(days=rng.randrange(14, 80))
        archived = created + timedelta(days=rng.randrange(0, (today - created).days + 1))
        density = rng.choice((0.0, 0.35, 0.7, 1.0))
        generated = tuple(day for day in _days(created, archived) if rng.random() < density)
        rows.append(
            _Hist(
                f"Generated {index}",
                per_week,
                created,
                archived,
                generated,
                generated,
                (),
                (),
            )
        )
    return rows


def test_seeded_oracle_read_town_matches_evaluate_streak(tmp_path):
    database = open_database(f"sqlite:///{tmp_path / 'oracle.db'}")
    TownBase.metadata.create_all(database.engine)
    today = date(2026, 10, 29)
    now = datetime(2026, 10, 29, tzinfo=UTC)
    histories = _oracle_histories(today)
    with Session(database.engine) as db:
        for hist in histories:
            habit = Habit(
                user_id=1,
                name=hist.name,
                name_key=hist.name.casefold(),
                slot=0,
                building_style="cottage",
                per_week=hist.per_week,
                created_on=hist.created,
                created_at=now,
                archived_on=hist.archived,
                archived_at=now,
            )
            db.add(habit)
            db.flush()
            if hist.stored_days:
                db.execute(
                    insert(HabitCheckin),
                    [
                        dict(habit_id=habit.id, user_id=1, day=day, created_at=now)
                        for day in hist.stored_days
                    ],
                )
            if hist.stored_cadence:
                db.execute(
                    insert(HabitCadence),
                    [
                        dict(
                            habit_id=habit.id,
                            user_id=1,
                            per_week=value,
                            effective_from=day,
                            created_at=now,
                        )
                        for day, value in hist.stored_cadence
                    ],
                )
        db.flush()
        town = read_town(db, 1, today, "UTC")
        by_name = {row["name"]: row for row in town["archived"]}
        assert set(by_name) == {hist.name for hist in histories}
        for hist in histories:
            streak = evaluate_streak(
                hist.created,
                today,
                hist.engine_days,
                hist.per_week,
                hist.engine_cadence,
                hist.archived,
            )
            view = by_name[hist.name]
            assert (view["best_days"], view["best_weeks"], view["xp"]) == (
                streak.best_days,
                streak.best_weeks,
                habit_xp(_counted(hist, today), streak.streak7_count),
            ), hist.name
    database.engine.dispose()


def test_explain_query_plan_uses_the_hinted_checkin_index(tmp_path):
    """Check-in reads must search sqlite_autoindex_habit_checkins_1."""
    database = open_database(f"sqlite:///{tmp_path / 'plan.db'}")
    TownBase.metadata.create_all(database.engine)
    captured = []

    def capture(conn, cursor, statement, parameters, context, executemany):
        folded = statement.lstrip().upper()
        if "HABIT_CHECKINS" in folded and folded.startswith(("SELECT", "WITH")):
            captured.append((statement, parameters))

    event.listen(database.engine, "before_cursor_execute", capture)
    today = date(2026, 10, 29)
    now = datetime(2026, 10, 29, tzinfo=UTC)
    created = date(2026, 9, 1)
    try:
        with Session(database.engine) as db:
            db.execute(
                insert(Habit),
                [
                    dict(
                        id=1,
                        user_id=1,
                        name="Daily",
                        name_key="daily",
                        slot=0,
                        building_style="cottage",
                        per_week=7,
                        created_on=date(2026, 10, 1),
                        created_at=now,
                        archived_at=None,
                        archived_on=None,
                    ),
                    dict(
                        id=2,
                        user_id=1,
                        name="Old daily",
                        name_key="old daily",
                        slot=0,
                        building_style="cottage",
                        per_week=7,
                        created_on=created,
                        created_at=now,
                        archived_at=now,
                        archived_on=date(2026, 10, 1),
                    ),
                    dict(
                        id=3,
                        user_id=1,
                        name="Old weekly",
                        name_key="old weekly",
                        slot=0,
                        building_style="cottage",
                        per_week=3,
                        created_on=created,
                        created_at=now,
                        archived_at=now,
                        archived_on=date(2026, 10, 1),
                    ),
                ],
            )
            db.execute(
                insert(HabitCheckin),
                [
                    dict(habit_id=1, user_id=1, day=date(2026, 10, 20), created_at=now),
                    dict(habit_id=2, user_id=1, day=date(2026, 9, 10), created_at=now),
                    dict(habit_id=3, user_id=1, day=date(2026, 9, 10), created_at=now),
                ],
            )
            captured.clear()
            read_town(db, 1, today, "UTC")
            read_checkins(db, 1, 1, date(2026, 10, 1), today)
            read_habits(db, 1, today, "UTC", include_archived=True)
            statements = [statement for statement, _parameters in captured]
            assert any(
                statement.lstrip().upper().startswith("SELECT DAY FROM HABIT_CHECKINS")
                for statement in statements
            )
            assert any("PRINTF(" in statement.upper() for statement in statements)
            assert any("COUNT(*)" in statement for statement in statements)
            assert any(statement.lstrip().upper().startswith("WITH") for statement in statements)
            for statement, parameters in captured:
                plan = "\n".join(
                    str(row[-1])
                    for row in db.connection().exec_driver_sql(
                        "EXPLAIN QUERY PLAN " + statement, parameters
                    )
                )
                assert "USING INDEX sqlite_autoindex_habit_checkins_1" in plan
    finally:
        event.remove(database.engine, "before_cursor_execute", capture)
        database.engine.dispose()


def test_wrong_owner_checkin_inside_the_range_is_ignored(tmp_path):
    database = open_database(f"sqlite:///{tmp_path / 'owner.db'}")
    TownBase.metadata.create_all(database.engine)
    today = date(2026, 10, 29)
    created = date(2026, 10, 1)
    end = date(2026, 10, 20)
    now = datetime(2026, 10, 29, tzinfo=UTC)
    owner_days = (date(2026, 10, 12), date(2026, 10, 16))
    foreign_days = (date(2026, 10, 13), date(2026, 10, 14), date(2026, 10, 15))
    with Session(database.engine) as db:
        db.execute(
            insert(Habit),
            dict(
                id=1,
                user_id=1,
                name="Bridge",
                name_key="bridge",
                slot=0,
                building_style="cottage",
                per_week=7,
                created_on=created,
                created_at=now,
                archived_on=end,
                archived_at=now,
            ),
        )
        db.execute(
            insert(HabitCheckin),
            [
                dict(habit_id=1, user_id=user_id, day=day, created_at=now)
                for user_id, days in ((1, owner_days), (2, foreign_days))
                for day in days
            ],
        )
        view = read_town(db, 1, today, "UTC")["archived"][0]
        streak = evaluate_streak(created, today, owner_days, 7, archived_on=end)
        assert (view["best_days"], view["best_weeks"], view["xp"]) == (
            streak.best_days,
            streak.best_weeks,
            habit_xp(len(owner_days), streak.streak7_count),
        )
    database.engine.dispose()
