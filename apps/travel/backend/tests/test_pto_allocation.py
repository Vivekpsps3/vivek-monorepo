"""Per-date PTO storage and the lossless allocation backfill."""

import sqlite3
from datetime import date, datetime
from decimal import Decimal
from io import StringIO

import pytest
from alembic import command
from alembic.script import ScriptDirectory
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from apps.server.database import current
from apps.server.migrations import (
    current_revision,
    head_revision,
    make_config,
    model_diff,
    sqlite_url,
)
from apps.travel.backend.models import Base, PtoEntry, Trip, TripPtoDay
from apps.travel.backend.services.dates import iter_dates, weekday_count
from apps.travel.backend.services.money import store_days
from apps.travel.backend.services.pto import (
    MIGRATION_SOURCE_AUTOMATIC,
    PTO_MODE_DATES,
    PTO_MODE_LEGACY,
    PTO_PROVENANCE_DEFAULT,
    Policy,
    Usage,
    backfill_trip_pto_days,
    default_pto_amount,
    sync_allocated_pto_days,
    sync_trip_pto,
    validate_pto_day,
    walk,
)

PARENT = "site_auth_challenge_purpose_v2"
REVISION = "site_trip_pto_days_v1"
TRIP_COLUMNS = (
    "id, user_id, title, start_date, end_date, status, origin_label, notes, "
    "counts_as_pto, pto_days, created_at, updated_at"
)


def test_pto_day_amount_and_date_are_bounded():
    friday = date(2026, 10, 23)
    assert validate_pto_day(friday, friday, friday, Decimal("0.5")) == Decimal("0.5000")
    assert validate_pto_day(friday, friday, friday, 1) == Decimal("1.0000")
    with pytest.raises(ValueError, match="more than 1"):
        validate_pto_day(friday, friday, friday, "1.5")
    with pytest.raises(ValueError, match="inside the trip"):
        validate_pto_day(friday, friday, date(2026, 10, 24), "1")
    with pytest.raises(ValueError, match="inside the trip"):
        validate_pto_day(date(2026, 10, 26), friday, friday, "1")


def test_per_date_charging_would_change_capped_and_mid_balance_forecasts():
    """Day rows do not change today's start-date charge.

    Subtracting each selected date instead of the whole total on the start
    date changes a capped accrual and a balance date that falls during the
    trip. The backfill keeps the stored entry, so projections stay on the
    old numbers until that correction is applied.
    """
    start = date(2026, 1, 5)
    end = date(2026, 1, 9)
    capped = Policy(
        configured=True,
        accrual_amount=Decimal(730),
        accrual_unit="day",
        accrual_cadence="yearly",
        hours_per_day=Decimal(8),
        balance_days=Decimal(10),
        balance_as_of=date(2026, 1, 2),
        annual_cap_days=Decimal(10),
    )
    lump = [Usage(1, start, end, Decimal(5), "Trip", 1)]
    per_day = [
        Usage(index, day, day, Decimal(1), "Trip", 1)
        for index, day in enumerate(iter_dates(start, end), start=1)
        if day.weekday() < 5
    ]
    assert walk(capped, lump, end).balance == Decimal("10.0000")
    assert walk(capped, per_day, end).balance == Decimal("9.0000")

    mid = Policy(
        configured=True,
        accrual_amount=Decimal(0),
        accrual_unit="day",
        accrual_cadence="yearly",
        hours_per_day=Decimal(8),
        balance_days=Decimal(10),
        balance_as_of=date(2026, 1, 7),
        annual_cap_days=None,
    )
    after_balance = [usage for usage in per_day if usage.start_date > mid.balance_as_of]
    assert walk(mid, lump, end).balance == Decimal("10.0000")
    assert walk(mid, after_balance, end).balance == Decimal("8.0000")
    assert [usage.start_date for usage in after_balance] == [date(2026, 1, 8), date(2026, 1, 9)]


def _memory_session():
    engine = create_engine(
        "sqlite:///:memory:",
        poolclass=StaticPool,
        connect_args={"check_same_thread": False},
    )
    Base.metadata.create_all(engine)
    factory = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)
    return factory()


def _trip(db, **overrides):
    values = dict(
        user_id=1,
        title="Trip",
        start_date=date(2026, 10, 23),
        end_date=date(2026, 10, 26),
        status="planning",
        counts_as_pto=True,
        pto_days=None,
    )
    values.update(overrides)
    trip = Trip(**values)
    db.add(trip)
    db.flush()
    return trip


def _day_rows(db, trip_id):
    rows = (
        db.query(TripPtoDay)
        .filter(TripPtoDay.trip_id == trip_id)
        .order_by(TripPtoDay.on_date, TripPtoDay.id)
        .all()
    )
    return [(row.on_date, row.amount, row.provenance, row.migration_source) for row in rows]


def test_sync_stores_weekday_defaults_and_keeps_an_explicit_total_unallocated():
    db = _memory_session()
    trip = _trip(db)
    sync_trip_pto(db, trip)
    db.flush()
    assert trip.pto_mode == PTO_MODE_DATES
    assert _day_rows(db, trip.id) == [
        (date(2026, 10, 23), "1.0000", PTO_PROVENANCE_DEFAULT, None),
        (date(2026, 10, 24), "0.0000", PTO_PROVENANCE_DEFAULT, None),
        (date(2026, 10, 25), "0.0000", PTO_PROVENANCE_DEFAULT, None),
        (date(2026, 10, 26), "1.0000", PTO_PROVENANCE_DEFAULT, None),
    ]
    entry = db.query(PtoEntry).one()
    assert entry.days == "2.0000"
    assert entry.start_date == trip.start_date

    for row in db.query(TripPtoDay).all():
        row.migration_source = MIGRATION_SOURCE_AUTOMATIC
    trip.end_date = date(2026, 10, 27)
    sync_allocated_pto_days(db, trip)
    db.flush()
    rows = _day_rows(db, trip.id)
    assert [row[0] for row in rows] == list(iter_dates(date(2026, 10, 23), date(2026, 10, 27)))
    assert rows[-1] == (date(2026, 10, 27), "1.0000", PTO_PROVENANCE_DEFAULT, None)
    assert all(row[3] == MIGRATION_SOURCE_AUTOMATIC for row in rows[:-1])

    trip.end_date = date(2026, 10, 23)
    sync_allocated_pto_days(db, trip)
    db.flush()
    assert _day_rows(db, trip.id) == [
        (date(2026, 10, 23), "1.0000", PTO_PROVENANCE_DEFAULT, MIGRATION_SOURCE_AUTOMATIC)
    ]

    trip.pto_days = "1.6667"
    trip.end_date = date(2026, 10, 26)
    sync_trip_pto(db, trip)
    db.flush()
    assert trip.pto_mode == PTO_MODE_LEGACY
    assert _day_rows(db, trip.id) == []
    assert db.query(PtoEntry).one().days == "1.6667"

    trip.counts_as_pto = False
    trip.pto_days = None
    sync_trip_pto(db, trip)
    db.flush()
    assert trip.pto_mode == PTO_MODE_DATES
    assert len(_day_rows(db, trip.id)) == 4
    assert db.query(PtoEntry).count() == 0
    trip.counts_as_pto = True
    sync_trip_pto(db, trip)
    db.flush()
    assert db.query(PtoEntry).one().days == "2.0000"

    broken = _trip(
        db, title="Backwards", start_date=date(2026, 10, 26), end_date=date(2026, 10, 23)
    )
    sync_allocated_pto_days(db, broken)
    db.flush()
    assert broken.pto_mode == PTO_MODE_LEGACY
    assert _day_rows(db, broken.id) == []
    db.close()


def test_backfill_preserves_totals_without_inventing_legacy_dates():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    stamp = datetime(2026, 1, 1)
    trips = [
        ("Fri-Mon", date(2026, 10, 23), date(2026, 10, 26), True, None),
        ("Explicit zero", date(2026, 10, 23), date(2026, 10, 26), True, "0.0000"),
        ("Fraction", date(2026, 11, 2), date(2026, 11, 6), True, "1.6667"),
        ("Typed weekdays", date(2026, 10, 26), date(2026, 10, 30), True, "5.0000"),
        ("Weekend", date(2026, 10, 24), date(2026, 10, 25), True, None),
        ("Blank", date(2026, 10, 24), date(2026, 10, 25), True, ""),
        ("Off", date(2026, 10, 23), date(2026, 10, 26), False, None),
        ("Backwards", date(2026, 10, 26), date(2026, 10, 23), True, None),
        ("Garbage", date(2026, 11, 2), date(2026, 11, 3), True, "nope"),
    ]
    with engine.begin() as connection:
        for title, start, end, counts, pto_days in trips:
            connection.execute(
                Trip.__table__.insert(),
                {
                    "user_id": 1,
                    "title": title,
                    "start_date": start,
                    "end_date": end,
                    "status": "planning",
                    "counts_as_pto": counts,
                    "pto_days": pto_days,
                    "created_at": stamp,
                    "updated_at": stamp,
                },
            )
        trip_ids = {
            title: trip_id
            for trip_id, title in connection.execute(text("SELECT id, title FROM trips"))
        }
        connection.execute(
            PtoEntry.__table__.insert(),
            [
                {
                    "user_id": 1,
                    "trip_id": trip_ids["Fri-Mon"],
                    "start_date": date(2026, 10, 23),
                    "end_date": date(2026, 10, 26),
                    "days": "2.0000",
                    "label": "Fri-Mon",
                    "kind": "trip",
                },
                {
                    "user_id": 1,
                    "trip_id": None,
                    "start_date": date(2026, 2, 2),
                    "end_date": date(2026, 2, 2),
                    "days": "1.0000",
                    "label": "Appointment",
                    "kind": "manual",
                },
            ],
        )
        before_entries = connection.execute(
            text(
                "SELECT user_id, trip_id, start_date, end_date, days, label, kind, notes FROM pto_entries ORDER BY id"
            )
        ).fetchall()
        before_days = connection.execute(
            text(f"SELECT {TRIP_COLUMNS} FROM trips ORDER BY id")
        ).fetchall()
        first = backfill_trip_pto_days(connection)
        second = backfill_trip_pto_days(connection)
        assert second == first
        assert (
            connection.execute(
                text(
                    "SELECT user_id, trip_id, start_date, end_date, days, label, kind, notes FROM pto_entries ORDER BY id"
                )
            ).fetchall()
            == before_entries
        )
        assert (
            connection.execute(text(f"SELECT {TRIP_COLUMNS} FROM trips ORDER BY id")).fetchall()
            == before_days
        )

        stored = {}
        for trip_id, mode, pto_days in connection.execute(
            text("SELECT id, pto_mode, pto_days FROM trips")
        ):
            rows = connection.execute(
                text(
                    "SELECT on_date, amount, provenance, migration_source "
                    "FROM trip_pto_days WHERE trip_id = :trip_id ORDER BY on_date"
                ),
                {"trip_id": trip_id},
            ).fetchall()
            stored[trip_id] = (mode, pto_days, rows)

    assert first == (4, 5, 12)
    for title, start, end, _counts, pto_days in trips:
        mode, saved_days, rows = stored[trip_ids[title]]
        assert saved_days == pto_days
        if pto_days not in (None, "") or end < start:
            assert mode == PTO_MODE_LEGACY
            assert rows == []
            continue
        assert mode == PTO_MODE_DATES
        expected = [
            (
                day.isoformat(),
                store_days(default_pto_amount(day)),
                PTO_PROVENANCE_DEFAULT,
                MIGRATION_SOURCE_AUTOMATIC,
            )
            for day in iter_dates(start, end)
        ]
        assert rows == expected
        assert sum(Decimal(amount) for _day, amount, _provenance, _source in rows) == Decimal(
            weekday_count(start, end)
        )


def test_revision_is_the_only_head_and_backfill_downgrades_cleanly(tmp_path):
    script = ScriptDirectory.from_config(make_config("sqlite://"))
    assert script.get_heads() == [REVISION]
    assert script.get_revision(REVISION).down_revision == PARENT
    assert head_revision() == REVISION

    database = tmp_path / "site.db"
    url = sqlite_url(database)
    plan = StringIO()
    plan_cfg = make_config(url)
    plan_cfg.stdout = plan
    command.upgrade(plan_cfg, f"{PARENT}:{REVISION}", sql=True)
    planned = plan.getvalue()
    assert "INSERT INTO trip_pto_days" in planned
    assert "backfill-automatic" in planned
    assert f"'{REVISION}', 'site_schema_v1'" in planned
    assert f"'{REVISION}', '{PARENT}'" in planned

    cfg = make_config(url)
    command.upgrade(cfg, PARENT)
    with sqlite3.connect(database) as db:
        db.execute(
            "INSERT INTO users (email, display_name, role, is_active, must_change_password, created_at, updated_at) "
            "VALUES ('pto@example.com', 'PTO', 'user', 1, 0, '2026-01-01', '2026-01-01')"
        )
        db.execute(
            "INSERT INTO trips (user_id, title, start_date, end_date, status, counts_as_pto, pto_days, created_at, updated_at) "
            "VALUES (1, 'Fri-Mon', '2026-10-23', '2026-10-26', 'planning', 1, NULL, '2026-01-01', '2026-01-01')"
        )
        db.execute(
            "INSERT INTO trips (user_id, title, start_date, end_date, status, counts_as_pto, pto_days, created_at, updated_at) "
            "VALUES (1, 'Zero', '2026-10-23', '2026-10-26', 'planning', 1, '0.0000', '2026-01-01', '2026-01-01')"
        )
        db.execute(
            "INSERT INTO pto_entries (user_id, trip_id, start_date, end_date, days, label, kind) "
            "VALUES (1, 1, '2026-10-23', '2026-10-26', '2.0000', 'Fri-Mon', 'trip')"
        )
        db.execute(
            "INSERT INTO pto_entries (user_id, trip_id, start_date, end_date, days, label, kind) "
            "VALUES (1, NULL, '2026-02-02', '2026-02-02', '1.0000', 'Appointment', 'manual')"
        )
        before_trips = db.execute(f"SELECT {TRIP_COLUMNS} FROM trips ORDER BY id").fetchall()
        before_entries = db.execute("SELECT * FROM pto_entries ORDER BY id").fetchall()
        db.commit()

    command.upgrade(cfg, "head")
    assert current_revision(database) == REVISION
    assert model_diff(database) == []
    with sqlite3.connect(database) as db:
        assert (
            db.execute(f"SELECT {TRIP_COLUMNS} FROM trips ORDER BY id").fetchall() == before_trips
        )
        assert db.execute("SELECT * FROM pto_entries ORDER BY id").fetchall() == before_entries
        assert db.execute(
            "SELECT on_date, amount, provenance, migration_source FROM trip_pto_days WHERE trip_id = 1 ORDER BY on_date"
        ).fetchall() == [
            ("2026-10-23", "1.0000", "default", "backfill-automatic"),
            ("2026-10-24", "0.0000", "default", "backfill-automatic"),
            ("2026-10-25", "0.0000", "default", "backfill-automatic"),
            ("2026-10-26", "1.0000", "default", "backfill-automatic"),
        ]
        assert db.execute("SELECT count(*) FROM trip_pto_days WHERE trip_id = 2").fetchone() == (0,)
        assert db.execute("SELECT pto_mode FROM trips ORDER BY id").fetchall() == [
            ("dates",),
            ("legacy",),
        ]
        heads = {
            row[0]
            for row in db.execute(
                "SELECT compatible_head FROM site_revision_compatibility WHERE revision = ?",
                (REVISION,),
            )
        }
        assert heads == {"site_schema_v1", PARENT}
        assert db.execute("PRAGMA foreign_key_check").fetchall() == []

    command.downgrade(cfg, PARENT)
    assert current_revision(database) == PARENT
    with sqlite3.connect(database) as db:
        assert (
            db.execute(f"SELECT {TRIP_COLUMNS} FROM trips ORDER BY id").fetchall() == before_trips
        )
        assert db.execute("SELECT * FROM pto_entries ORDER BY id").fetchall() == before_entries
        tables = {
            row[0] for row in db.execute("SELECT name FROM sqlite_master WHERE type = 'table'")
        }
        assert "trip_pto_days" not in tables
        columns = [row[1] for row in db.execute("PRAGMA table_info(trips)")]
        assert "pto_mode" not in columns
        assert db.execute(
            "SELECT count(*) FROM site_revision_compatibility WHERE revision = ?",
            (REVISION,),
        ).fetchone() == (0,)

    command.upgrade(cfg, "head")
    with sqlite3.connect(database) as db:
        assert db.execute("SELECT count(*) FROM trip_pto_days").fetchone() == (4,)
        assert db.execute("SELECT pto_days FROM trips ORDER BY id").fetchall() == [
            (None,),
            ("0.0000",),
        ]


def _saved_days(trip_id):
    db = current().sessionmaker()
    try:
        trip = db.get(Trip, trip_id)
        rows = (
            db.query(TripPtoDay)
            .filter(TripPtoDay.trip_id == trip_id)
            .order_by(TripPtoDay.on_date)
            .all()
        )
        return trip.pto_mode, [
            (row.on_date, row.amount, row.provenance, row.migration_source) for row in rows
        ]
    finally:
        db.close()


def test_trip_api_persists_per_date_defaults_and_legacy_zero(client):
    created = client.post(
        "/api/trips",
        json={
            "title": "Fri-Mon",
            "start_date": "2026-10-23",
            "end_date": "2026-10-26",
            "counts_as_pto": True,
        },
    )
    assert created.status_code == 201, created.text
    body = created.json()
    assert body["pto"]["days"] == "2"
    assert body["pto_days"] is None
    trip_id = body["id"]
    assert _saved_days(trip_id) == (
        PTO_MODE_DATES,
        [
            (date(2026, 10, 23), "1.0000", PTO_PROVENANCE_DEFAULT, None),
            (date(2026, 10, 24), "0.0000", PTO_PROVENANCE_DEFAULT, None),
            (date(2026, 10, 25), "0.0000", PTO_PROVENANCE_DEFAULT, None),
            (date(2026, 10, 26), "1.0000", PTO_PROVENANCE_DEFAULT, None),
        ],
    )
    db = current().sessionmaker()
    try:
        friday = (
            db.query(TripPtoDay)
            .filter(TripPtoDay.trip_id == trip_id, TripPtoDay.on_date == date(2026, 10, 23))
            .one()
        )
        friday.migration_source = MIGRATION_SOURCE_AUTOMATIC
        db.commit()
    finally:
        db.close()

    extended = client.patch(f"/api/trips/{trip_id}", json={"end_date": "2026-10-27"})
    assert extended.status_code == 200, extended.text
    assert extended.json()["pto"]["days"] == "3"
    mode, rows = _saved_days(trip_id)
    assert mode == PTO_MODE_DATES
    assert rows[0][3] == MIGRATION_SOURCE_AUTOMATIC
    assert rows[-1] == (date(2026, 10, 27), "1.0000", PTO_PROVENANCE_DEFAULT, None)

    shortened = client.patch(f"/api/trips/{trip_id}", json={"end_date": "2026-10-23"})
    assert shortened.status_code == 200, shortened.text
    assert _saved_days(trip_id)[1] == [
        (date(2026, 10, 23), "1.0000", PTO_PROVENANCE_DEFAULT, MIGRATION_SOURCE_AUTOMATIC)
    ]

    legacy = client.post(
        "/api/trips",
        json={
            "title": "Custom zero",
            "start_date": "2026-10-23",
            "end_date": "2026-10-26",
            "pto_days": "0",
        },
    )
    assert legacy.status_code == 201, legacy.text
    assert legacy.json()["pto_days"] == "0.0000"
    assert legacy.json()["pto"]["days"] == "0"
    assert _saved_days(legacy.json()["id"]) == (PTO_MODE_LEGACY, [])

    off = client.post(
        "/api/trips",
        json={
            "title": "Not PTO",
            "start_date": "2026-10-23",
            "end_date": "2026-10-26",
            "counts_as_pto": False,
        },
    )
    assert off.status_code == 201, off.text
    assert off.json()["pto"]["days"] == "0"
    assert len(_saved_days(off.json()["id"])[1]) == 4
    assert all(
        row["trip_id"] != off.json()["id"] for row in client.get("/api/pto").json()["entries"]
    )
    restored = client.patch(f"/api/trips/{off.json()['id']}", json={"counts_as_pto": True})
    assert restored.status_code == 200, restored.text
    assert restored.json()["pto"]["days"] == "2"

    assert client.delete(f"/api/trips/{trip_id}").status_code == 204
    db = current().sessionmaker()
    try:
        assert db.query(TripPtoDay).filter(TripPtoDay.trip_id == trip_id).count() == 0
    finally:
        db.close()
