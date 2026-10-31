"""Per-date PTO storage. A legacy total stays unallocated until someone chooses days."""

import sqlite3
from datetime import date, datetime, timedelta
from decimal import Decimal
from io import StringIO

import pytest
from alembic import command
from alembic.script import ScriptDirectory
from sqlalchemy import create_engine, insert, text
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from apps.server.migrations import (
    current_revision,
    head_revision,
    make_config,
    model_diff,
    sqlite_url,
)
from apps.travel.backend.models import Base, PtoEntry, Trip, TripPtoDay
from apps.travel.backend.services.dates import iter_dates, weekday_count
from apps.travel.backend.services.money import fmt_days, store_days
from apps.travel.backend.services.pto import (
    MIGRATION_SOURCE_AUTOMATIC,
    PTO_MODE_DATES,
    PTO_MODE_LEGACY,
    PTO_PROVENANCE_DEFAULT,
    PTO_PROVENANCE_OVERRIDE,
    Policy,
    Usage,
    backfill_trip_pto_days,
    default_pto_amount,
    sync_allocated_pto_days,
    sync_trip_pto,
    usages_from_rows,
    validate_pto_day,
    walk,
)

PARENT = "site_auth_challenge_purpose_v2"
REVISION = "site_trip_pto_days_v1"
HEAD = "site_media_membership_v1"
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


def test_forecast_deducts_each_selected_date():
    """A lump on the start date is not the forecast once days are allocated.

    Charging each selected date changes a capped accrual and a balance date
    that falls during the trip. The stored rows are what the walk uses.
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
    db = _memory_session()
    trip = _trip(db, title="Week", start_date=start, end_date=end)
    sync_trip_pto(db, trip)
    db.flush()
    entry = db.query(PtoEntry).one()
    rows = db.query(TripPtoDay).filter(TripPtoDay.trip_id == trip.id).all()
    charged = usages_from_rows([entry], rows)
    assert walk(capped, lump, end).balance == Decimal("10.0000")
    assert walk(capped, charged, end).balance == Decimal("9.0000")
    assert [on for on, _amount in charged[0].charges] == [
        day for day in iter_dates(start, end) if day.weekday() < 5
    ]

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
    assert walk(mid, lump, end).balance == Decimal("10.0000")
    assert walk(mid, charged, end).balance == Decimal("8.0000")
    db.close()


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

    friday = db.query(TripPtoDay).filter(TripPtoDay.on_date == date(2026, 10, 23)).one()
    friday.amount = "0.0000"
    friday.provenance = PTO_PROVENANCE_OVERRIDE
    sync_trip_pto(db, trip)
    db.flush()
    assert db.query(PtoEntry).one().days == "1.0000"
    assert _day_rows(db, trip.id)[0] == (
        date(2026, 10, 23),
        "0.0000",
        PTO_PROVENANCE_OVERRIDE,
        None,
    )
    friday.amount = "1.0000"
    friday.provenance = PTO_PROVENANCE_DEFAULT
    sync_allocated_pto_days(db, trip)
    db.flush()

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
                insert(Trip),
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
            insert(PtoEntry),
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


def test_revision_backfill_downgrades_cleanly(tmp_path):
    script = ScriptDirectory.from_config(make_config("sqlite://"))
    assert script.get_heads() == ["site_user_birthday_v1"]
    assert (
        script.get_revision("site_catalog_title_sort_v1").down_revision == "site_media_progress_v1"
    )
    assert script.get_revision("site_media_progress_v1").down_revision == HEAD
    assert script.get_revision(REVISION).down_revision == PARENT
    assert script.get_revision(HEAD).down_revision == REVISION
    assert head_revision() == "site_user_birthday_v1"

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
    assert current_revision(database) == "site_user_birthday_v1"
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


def _saved_days(client, trip_id):
    db = client.app.state.database.sessionmaker()
    try:
        trip = db.get(Trip, trip_id)
        assert trip is not None
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
    assert _saved_days(client, trip_id) == (
        PTO_MODE_DATES,
        [
            (date(2026, 10, 23), "1.0000", PTO_PROVENANCE_DEFAULT, None),
            (date(2026, 10, 24), "0.0000", PTO_PROVENANCE_DEFAULT, None),
            (date(2026, 10, 25), "0.0000", PTO_PROVENANCE_DEFAULT, None),
            (date(2026, 10, 26), "1.0000", PTO_PROVENANCE_DEFAULT, None),
        ],
    )
    db = client.app.state.database.sessionmaker()
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
    mode, rows = _saved_days(client, trip_id)
    assert mode == PTO_MODE_DATES
    assert rows[0][3] == MIGRATION_SOURCE_AUTOMATIC
    assert rows[-1] == (date(2026, 10, 27), "1.0000", PTO_PROVENANCE_DEFAULT, None)

    shortened = client.patch(f"/api/trips/{trip_id}", json={"end_date": "2026-10-23"})
    assert shortened.status_code == 200, shortened.text
    assert _saved_days(client, trip_id)[1] == [
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
    assert _saved_days(client, legacy.json()["id"]) == (PTO_MODE_LEGACY, [])

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
    assert len(_saved_days(client, off.json()["id"])[1]) == 4
    assert all(
        row["trip_id"] != off.json()["id"] for row in client.get("/api/pto").json()["entries"]
    )
    restored = client.patch(f"/api/trips/{off.json()['id']}", json={"counts_as_pto": True})
    assert restored.status_code == 200, restored.text
    assert restored.json()["pto"]["days"] == "2"

    assert client.delete(f"/api/trips/{trip_id}").status_code == 204
    db = client.app.state.database.sessionmaker()
    try:
        assert db.query(TripPtoDay).filter(TripPtoDay.trip_id == trip_id).count() == 0
    finally:
        db.close()


def _next_friday(today: date | None = None) -> date:
    today = today or date.today()
    ahead = (4 - today.weekday()) % 7
    if ahead == 0:
        ahead = 7
    return today + timedelta(days=ahead)


def _create_trip(client, title, start, end, **extra):
    body = {
        "title": title,
        "start_date": start.isoformat(),
        "end_date": end.isoformat(),
        "counts_as_pto": True,
    }
    body.update(extra)
    made = client.post("/api/trips", json=body)
    assert made.status_code == 201, made.text
    return made.json()


def _put_policy(client, balance, as_of):
    saved = client.put(
        "/api/pto/policy",
        json={
            "accrual_amount": "0",
            "accrual_unit": "day",
            "accrual_cadence": "yearly",
            "hours_per_day": "8",
            "balance_days": balance,
            "balance_as_of": as_of.isoformat(),
        },
    )
    assert saved.status_code == 200, saved.text
    return saved.json()


def _home_trips(home):
    return [*home["in_progress"], *home["upcoming"], *home["past"]]


def _one(rows, trip_id):
    return next(row for row in rows if row["id"] == trip_id)


def _dates(start, end, amount):
    return [{"on_date": day.isoformat(), "amount": amount(day)} for day in iter_dates(start, end)]


def _same_forecast(client, trip_id, days):
    """Trip, home, PTO board, and calendar all read the selected dates."""
    detail = client.get(f"/api/trips/{trip_id}")
    assert detail.status_code == 200, detail.text
    body = detail.json()
    assert body["pto"]["days"] == days
    home = client.get("/api/home").json()
    card = _one(_home_trips(home), trip_id)
    assert card["pto"]["days"] == days
    assert card["pto_dates"] == body["pto_dates"]
    assert card["pto"]["leftover_after"] == body["pto"]["leftover_after"]
    assert card["pto"]["balance_when_you_leave"] == body["pto"]["balance_when_you_leave"]
    assert card["pto"]["conflicts"] == body["pto"]["conflicts"]
    board = client.get("/api/pto").json()
    entry = next(row for row in board["entries"] if row["trip_id"] == trip_id)
    assert entry["days"] == store_days(Decimal(days))
    charged = sum((Decimal(item["amount"]) for item in entry["charges"]), Decimal(0))
    assert charged == Decimal(days)
    counted = [row["on_date"] for row in body["pto_dates"] if Decimal(row["amount"]) > 0]
    assert [item["on_date"] for item in entry["charges"]] == counted
    calendar = client.get(
        "/api/calendar",
        params={"start": body["start_date"], "end": body["end_date"]},
    )
    assert calendar.status_code == 200, calendar.text
    assert _one(calendar.json()["trips"], trip_id)["pto_dates"] == counted
    used = sum(
        (
            Decimal(item["amount"])
            for item in entry["charges"]
            if home["pto"]["balance_as_of"]
            and date.fromisoformat(home["pto"]["balance_as_of"])
            < date.fromisoformat(item["on_date"])
            <= date.fromisoformat(home["today"])
        ),
        Decimal(0),
    )
    if home["pto"]["configured"] and home["pto"]["accrual_amount"] == "0.0000":
        balance = Decimal(home["pto"]["balance_saved"])
        if date.fromisoformat(home["today"]) < date.fromisoformat(home["pto"]["balance_as_of"]):
            used = Decimal(0)
        assert home["pto"]["balance_today"] == fmt_days(balance - used)
        assert home["pto"]["used_since"] == fmt_days(used)
    return body, entry, home


def test_each_date_choice_drives_every_forecast(client):
    friday = _next_friday()
    monday = friday + timedelta(days=3)
    tuesday = monday + timedelta(days=1)
    created = _create_trip(client, "Fri-Mon", friday, monday)
    trip_id = created["id"]
    assert created["pto_days"] is None
    assert created["pto_mode"] == PTO_MODE_DATES
    assert created["pto"]["days"] == "2"
    assert [(row["on_date"], row["amount"], row["provenance"]) for row in created["pto_dates"]] == [
        (friday.isoformat(), "1", PTO_PROVENANCE_DEFAULT),
        ((friday + timedelta(days=1)).isoformat(), "0", PTO_PROVENANCE_DEFAULT),
        ((friday + timedelta(days=2)).isoformat(), "0", PTO_PROVENANCE_DEFAULT),
        (monday.isoformat(), "1", PTO_PROVENANCE_DEFAULT),
    ]

    _put_policy(client, "0", friday - timedelta(days=1))
    body, _entry, home = _same_forecast(client, trip_id, "2")
    assert body["pto"]["balance_when_you_leave"] == "0"
    assert body["pto"]["leftover_after"] == "-2"
    assert home["next_pto"]["days"] == "2"
    assert home["next_pto"]["leftover_after"] == "-2"

    _put_policy(client, "10", friday - timedelta(days=1))
    body, _entry, _home = _same_forecast(client, trip_id, "2")
    assert body["pto"]["balance_when_you_leave"] == "10"
    assert body["pto"]["leftover_after"] == "8"

    off_friday = client.patch(
        f"/api/trips/{trip_id}",
        json={"pto_dates": [{"on_date": friday.isoformat(), "amount": "0"}]},
    )
    assert off_friday.status_code == 200, off_friday.text
    body, entry, _home = _same_forecast(client, trip_id, "1")
    assert body["pto"]["leftover_after"] == "9"
    friday_row = body["pto_dates"][0]
    assert friday_row["amount"] == "0"
    assert friday_row["provenance"] == PTO_PROVENANCE_OVERRIDE
    assert entry["charges"] == [{"on_date": monday.isoformat(), "amount": "1"}]
    again = client.get(f"/api/trips/{trip_id}").json()
    assert again["pto"]["days"] == "1"
    assert again["pto_dates"] == body["pto_dates"]

    half = client.patch(
        f"/api/trips/{trip_id}",
        json={"pto_dates": [{"on_date": friday.isoformat(), "amount": "0.5"}]},
    )
    assert half.status_code == 200, half.text
    body, entry, _home = _same_forecast(client, trip_id, "1.5")
    assert body["pto"]["leftover_after"] == "8.5"
    assert entry["charges"][0] == {"on_date": friday.isoformat(), "amount": "0.5"}
    assert body["pto_dates"][0]["provenance"] == PTO_PROVENANCE_OVERRIDE

    weekdays = client.patch(
        f"/api/trips/{trip_id}",
        json={"pto_dates": _dates(friday, monday, lambda day: "0" if day.weekday() >= 5 else "1")},
    )
    assert weekdays.status_code == 200, weekdays.text
    body, _entry, _home = _same_forecast(client, trip_id, "2")
    assert body["pto_dates"][0]["provenance"] == PTO_PROVENANCE_DEFAULT
    assert body["pto"]["leftover_after"] == "8"

    extended = client.patch(f"/api/trips/{trip_id}", json={"end_date": tuesday.isoformat()})
    assert extended.status_code == 200, extended.text
    body, _entry, _home = _same_forecast(client, trip_id, "3")
    assert body["pto_dates"][-1] == {
        "on_date": tuesday.isoformat(),
        "amount": "1",
        "provenance": PTO_PROVENANCE_DEFAULT,
    }
    assert body["pto_dates"][0]["amount"] == "1"

    client.patch(
        f"/api/trips/{trip_id}",
        json={"pto_dates": [{"on_date": friday.isoformat(), "amount": "0"}]},
    )
    shortened = client.patch(
        f"/api/trips/{trip_id}",
        json={"start_date": (friday + timedelta(days=1)).isoformat()},
    )
    assert shortened.status_code == 200, shortened.text
    body, _entry, _home = _same_forecast(client, trip_id, "2")
    assert friday.isoformat() not in {row["on_date"] for row in body["pto_dates"]}

    restored = client.patch(f"/api/trips/{trip_id}", json={"start_date": friday.isoformat()})
    assert restored.status_code == 200, restored.text
    body, _entry, _home = _same_forecast(client, trip_id, "3")
    assert body["pto_dates"][0] == {
        "on_date": friday.isoformat(),
        "amount": "1",
        "provenance": PTO_PROVENANCE_DEFAULT,
    }

    paused = client.patch(f"/api/trips/{trip_id}", json={"counts_as_pto": False})
    assert paused.status_code == 200, paused.text
    assert paused.json()["pto"]["days"] == "0"
    assert len(paused.json()["pto_dates"]) == 5
    assert all(row["trip_id"] != trip_id for row in client.get("/api/pto").json()["entries"])
    resumed = client.patch(f"/api/trips/{trip_id}", json={"counts_as_pto": True})
    assert resumed.status_code == 200, resumed.text
    _same_forecast(client, trip_id, "3")

    cleared = client.patch(
        f"/api/trips/{trip_id}",
        json={"pto_dates": _dates(friday, tuesday, lambda _day: "0")},
    )
    assert cleared.status_code == 200, cleared.text
    body, _entry, _home = _same_forecast(client, trip_id, "0")
    assert [row["amount"] for row in body["pto_dates"]] == ["0", "0", "0", "0", "0"]
    assert body["pto_dates"][0]["provenance"] == PTO_PROVENANCE_OVERRIDE
    assert body["pto_dates"][1]["provenance"] == PTO_PROVENANCE_DEFAULT

    rejected = client.patch(
        f"/api/trips/{trip_id}",
        json={"pto_dates": [{"on_date": (tuesday + timedelta(days=3)).isoformat(), "amount": "1"}]},
    )
    assert rejected.status_code == 422
    assert rejected.json()["detail"] == "PTO dates have to sit inside the trip."
    over = client.patch(
        f"/api/trips/{trip_id}",
        json={"pto_dates": [{"on_date": friday.isoformat(), "amount": "1.5"}]},
    )
    assert over.status_code == 422
    assert "A PTO day cannot be more than 1." in over.json()["detail"]
    duplicate = client.patch(
        f"/api/trips/{trip_id}",
        json={
            "pto_dates": [
                {"on_date": friday.isoformat(), "amount": "1"},
                {"on_date": friday.isoformat(), "amount": "0"},
            ]
        },
    )
    assert duplicate.status_code == 422
    assert "Each PTO date can only be chosen once." in duplicate.json()["detail"]
    assert client.get(f"/api/trips/{trip_id}").json()["pto"]["days"] == "0"


def test_mid_trip_balance_deducts_only_later_selected_days(client):
    start = date(2026, 1, 5)
    end = date(2026, 1, 9)
    balance_on = date(2026, 1, 7)
    legacy = _create_trip(client, "Old total", start, end, pto_days="5")
    assert legacy["pto_mode"] == PTO_MODE_LEGACY
    assert legacy["pto_dates"] == []
    assert legacy["pto_days"] == "5.0000"
    _put_policy(client, "10", balance_on)
    legacy = client.get(f"/api/trips/{legacy['id']}").json()
    assert legacy["pto"]["days"] == "5"
    assert legacy["pto"]["balance_when_you_leave"] is None
    assert legacy["pto"]["leftover_after"] is None
    assert "on or before your PTO balance date" in legacy["pto"]["note"]
    legacy_entry = next(
        row for row in client.get("/api/pto").json()["entries"] if row["trip_id"] == legacy["id"]
    )
    assert legacy_entry["days"] == "5.0000"
    assert legacy_entry["charges"] == [{"on_date": start.isoformat(), "amount": "5"}]

    trip = _create_trip(client, "Allocated week", start, end)
    body, entry, home = _same_forecast(client, trip["id"], "5")
    assert body["pto"]["balance_when_you_leave"] is None
    assert body["pto"]["leftover_after"] == "8"
    assert "Later selected days are deducted." in body["pto"]["note"]
    assert [item["on_date"] for item in entry["charges"]] == [
        day.isoformat() for day in iter_dates(start, end)
    ]
    card = _one(_home_trips(home), trip["id"])
    assert card["pto"]["leftover_after"] == "8"

    marked = client.patch(
        f"/api/trips/{trip['id']}",
        json={"pto_dates": [{"on_date": "2026-01-09", "amount": "0"}]},
    )
    assert marked.status_code == 200, marked.text
    body, entry, _home = _same_forecast(client, trip["id"], "4")
    assert body["pto"]["leftover_after"] == "9"
    assert "2026-01-09" not in {item["on_date"] for item in entry["charges"]}
    assert client.get(f"/api/trips/{legacy['id']}").json()["pto"]["days"] == "5"


def test_preview_uses_the_same_weekday_choices(client):
    _put_policy(client, "10", date(2026, 10, 24))
    preview = client.get("/api/pto/preview", params={"start": "2026-10-23", "end": "2026-10-26"})
    assert preview.status_code == 200, preview.text
    body = preview.json()
    assert body["days"] == "2"
    assert body["auto"] is True
    assert body["charges"] == [
        {"on_date": "2026-10-23", "amount": "1"},
        {"on_date": "2026-10-26", "amount": "1"},
    ]
    assert body["balance_when_you_leave"] is None
    assert body["leftover_after"] == "9"
    assert "Later selected days are deducted." in body["note"]

    _put_policy(client, "0", date(2026, 10, 22))
    before = client.get("/api/pto/preview", params={"start": "2026-10-23", "end": "2026-10-26"})
    assert before.status_code == 200, before.text
    assert before.json()["balance_when_you_leave"] == "0"
    assert before.json()["leftover_after"] == "-2"
    assert before.json()["charges"] == [
        {"on_date": "2026-10-23", "amount": "1"},
        {"on_date": "2026-10-26", "amount": "1"},
    ]


def test_overlap_is_explicit_and_legacy_totals_stay_whole(client):
    friday = _next_friday()
    monday = friday + timedelta(days=3)
    _put_policy(client, "10", friday - timedelta(days=1))
    first = _create_trip(client, "First", friday, monday)
    second = _create_trip(client, "Second", friday, monday)
    assert first["pto"]["days"] == "2"
    assert second["pto"]["days"] == "2"
    assert {item["on_date"] for item in second["pto"]["conflicts"]} == {
        friday.isoformat(),
        monday.isoformat(),
    }
    home = client.get("/api/home").json()
    assert {item["on_date"] for item in home["pto"]["conflicts"]} == {
        friday.isoformat(),
        monday.isoformat(),
    }
    friday_conflict = next(
        item for item in home["pto"]["conflicts"] if item["on_date"] == friday.isoformat()
    )
    assert friday_conflict["amount"] == "2"
    assert friday_conflict["labels"] == ["First", "Second"]
    assert first["pto"]["days"] == "2"

    wednesday = friday + timedelta(days=5)
    manual = client.post(
        "/api/pto/entries",
        json={
            "label": "Long appointment",
            "start_date": wednesday.isoformat(),
            "end_date": wednesday.isoformat(),
            "days": "2",
        },
    )
    assert manual.status_code == 201, manual.text
    board = client.get("/api/pto").json()
    assert {item["on_date"] for item in board["policy"]["conflicts"]} == {
        friday.isoformat(),
        monday.isoformat(),
    }
    appointment = next(row for row in board["entries"] if row["label"] == "Long appointment")
    assert appointment["days"] == "2.0000"

    added = client.post(
        "/api/pto/entries",
        json={
            "label": "Friday appointment",
            "start_date": friday.isoformat(),
            "end_date": friday.isoformat(),
            "days": "1",
        },
    )
    assert added.status_code == 201, added.text
    board = added.json()
    friday_conflict = next(
        item for item in board["policy"]["conflicts"] if item["on_date"] == friday.isoformat()
    )
    assert friday_conflict["amount"] == "3"
    assert friday_conflict["labels"] == ["First", "Second", "Friday appointment"]
    monday_conflict = next(
        item for item in board["policy"]["conflicts"] if item["on_date"] == monday.isoformat()
    )
    assert monday_conflict["amount"] == "2"
    assert client.get(f"/api/trips/{first['id']}").json()["pto"]["days"] == "2"
    assert next(row for row in board["entries"] if row["label"] == "Long appointment")["days"] == (
        "2.0000"
    )

    later = friday + timedelta(days=14)
    legacy = _create_trip(client, "Custom", later, later + timedelta(days=3), pto_days="1.6667")
    assert legacy["pto_mode"] == PTO_MODE_LEGACY
    assert legacy["pto_dates"] == []
    assert legacy["pto"]["conflicts"] == []
    legacy_entry = next(
        row for row in client.get("/api/pto").json()["entries"] if row["trip_id"] == legacy["id"]
    )
    assert legacy_entry["days"] == "1.6667"
    assert legacy_entry["charges"] == [{"on_date": later.isoformat(), "amount": "1.67"}]

    same_day = _create_trip(client, "That Friday", later, later)
    assert same_day["pto"]["days"] == "1"
    conflict = same_day["pto"]["conflicts"]
    assert len(conflict) == 1
    assert conflict[0]["on_date"] == later.isoformat()
    assert conflict[0]["amount"] == "2.67"
    assert conflict[0]["labels"] == ["Custom", "That Friday"]
    kept = client.get(f"/api/trips/{legacy['id']}").json()
    assert kept["pto_days"] == "1.6667"
    assert kept["pto_dates"] == []
    assert kept["pto"]["days"] == "1.67"

    allocated = client.patch(
        f"/api/trips/{legacy['id']}",
        json={
            "pto_dates": _dates(
                later, later + timedelta(days=3), lambda day: "0" if day.weekday() >= 5 else "1"
            )
        },
    )
    assert allocated.status_code == 200, allocated.text
    assert allocated.json()["pto_days"] is None
    assert allocated.json()["pto_mode"] == PTO_MODE_DATES
    assert allocated.json()["pto"]["days"] == "2"
    assert [row["amount"] for row in allocated.json()["pto_dates"]] == ["1", "0", "0", "1"]
    assert client.get(f"/api/trips/{same_day['id']}").json()["pto"]["days"] == "1"
