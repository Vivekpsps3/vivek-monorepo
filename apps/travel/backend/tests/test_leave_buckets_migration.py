"""site_leave_buckets_v1: exact PTO backfill, abort, and guarded downgrade."""

import sqlite3
from datetime import date
from decimal import Decimal
from io import StringIO

import pytest
from alembic import command
from alembic.script import ScriptDirectory

from apps.server.database import open_database
from apps.server.identity.admin import delete_user_account
from apps.server.identity.models import User, UserRole
from apps.server.migrations import (
    current_revision,
    make_config,
    model_diff,
    plan,
    sqlite_url,
)
from apps.travel.backend.models import LeavePolicy, Setting
from apps.travel.backend.routers.pto import _payload
from apps.travel.backend.services.assemble import snapshot_pto
from apps.travel.backend.services.leave_buckets import hpd_setting_key, sick_prompt_setting_key
from apps.travel.backend.services.pto import Policy, Usage

PARENT = "site_user_birthday_v1"
REVISION = "site_leave_buckets_v1"
TODAY = date(2026, 6, 1)
AS_OF = date(2026, 1, 1)
COMPATIBLE = {
    "site_schema_v1",
    "site_auth_challenge_purpose_v2",
    "site_trip_pto_days_v1",
    "site_media_membership_v1",
    "site_media_progress_v1",
    "site_catalog_title_sort_v1",
    "site_trip_create_attempt_v1",
    "site_town_v1",
    "site_user_birthday_v1",
}
# hpd, balance_days, accrual, unit, cadence, cap
CASES = (
    ("8", "10", "15", "day", "yearly", "20"),
    ("7.5", "-1.5", "3.25", "hour", "biweekly", "30"),
    ("0.5", "0.0001", "0", "day", "weekly", None),
    ("24", "12.3456", "1.5", "day", "monthly", "1"),
    ("7.25", "2.5", "8", "hour", "semimonthly", None),
)


def _cfg(database):
    return make_config(sqlite_url(database))


def _dump(database) -> str:
    with sqlite3.connect(database) as db:
        return "\n".join(db.iterdump())


def _owner_tables(database) -> set[str]:
    """Tables whose user_id column references users.id after the upgrade."""
    with sqlite3.connect(database) as db:
        owners: set[str] = set()
        names = db.execute(
            "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'"
        ).fetchall()
        for (name,) in names:
            quoted = '"' + name.replace('"', '""') + '"'
            keys = db.execute(f"PRAGMA foreign_key_list({quoted})").fetchall()
            for fk in keys:
                if fk[2] == "users" and fk[3] == "user_id" and fk[4] == "id":
                    owners.add(name)
                    break
        return owners


def _runtime_error(exc: BaseException, text: str) -> bool:
    seen: set[int] = set()
    current: BaseException | None = exc
    while current is not None and id(current) not in seen:
        seen.add(id(current))
        if type(current) is RuntimeError and str(current) == text:
            return True
        current = current.__cause__ or current.__context__
    return False


def _chain(exc: BaseException) -> str:
    parts = []
    seen: set[int] = set()
    current: BaseException | None = exc
    while current is not None and id(current) not in seen:
        seen.add(id(current))
        parts.append(str(current))
        current = current.__cause__ or current.__context__
    return " ".join(parts)


def _parent(database) -> None:
    command.upgrade(_cfg(database), PARENT)


def _insert_user(db: sqlite3.Connection, email: str) -> None:
    db.execute(
        "INSERT INTO users (email, display_name, role, is_active, must_change_password, "
        "created_at, updated_at) VALUES (?, ?, 'user', 1, 0, '2026-01-01', '2026-01-01')",
        (email, email),
    )


def _insert_policy(db, user_id, hpd, balance, accrual, unit, cadence, cap, as_of="2026-01-01"):
    db.execute(
        "INSERT INTO pto_policy (user_id, configured, accrual_amount, accrual_unit, "
        "accrual_cadence, hours_per_day, balance_days, balance_as_of, annual_cap_days) "
        "VALUES (?, 1, ?, ?, ?, ?, ?, ?, ?)",
        (user_id, accrual, unit, cadence, hpd, balance, as_of, cap),
    )


def _expected_policy(hpd, balance, accrual, unit, cadence, cap, usages) -> dict:
    policy = Policy(
        configured=True,
        accrual_amount=Decimal(accrual),
        accrual_unit=unit,
        accrual_cadence=cadence,
        hours_per_day=Decimal(hpd),
        balance_days=Decimal(balance),
        balance_as_of=AS_OF,
        annual_cap_days=Decimal(cap) if cap is not None else None,
    )
    return snapshot_pto(policy, usages, TODAY)


def _read(database, user_id: int) -> dict:
    opened = open_database(f"sqlite:///{database}")
    db = opened.sessionmaker()
    try:
        return _payload(db, user_id, today=TODAY)
    finally:
        db.close()
        opened.engine.dispose()


def test_upgrade_is_lossless_and_get_pto_is_unchanged(tmp_path):
    database = tmp_path / "site.db"
    _parent(database)
    with sqlite3.connect(database) as db:
        for index, case in enumerate(CASES, start=1):
            _insert_user(db, f"u{index}@example.com")
            _insert_policy(db, index, *case)
        _insert_user(db, "none@example.com")
        db.execute(
            "INSERT INTO pto_entries (user_id, trip_id, start_date, end_date, days, label, kind) "
            "VALUES (1, NULL, '2026-03-02', '2026-03-02', '1.0000', 'Appointment', 'manual')"
        )
        db.commit()
    command.upgrade(_cfg(database), REVISION)
    assert current_revision(database) == REVISION
    assert model_diff(database) == []
    assert ScriptDirectory.from_config(_cfg(database)).get_heads() == [REVISION]
    with sqlite3.connect(database) as db:
        assert db.execute(
            "SELECT count(*) FROM leave_policies WHERE bucket = 'sick'"
        ).fetchone() == (0,)
        assert db.execute("SELECT count(*) FROM pto_entries WHERE bucket != 'pto'").fetchone() == (
            0,
        )
        assert {
            row[0]
            for row in db.execute(
                "SELECT compatible_head FROM site_revision_compatibility WHERE revision = ?",
                (REVISION,),
            )
        } == COMPATIBLE
        assert db.execute(
            "SELECT count(*) FROM site_revision_compatibility WHERE revision = ?",
            (REVISION,),
        ).fetchone() == (len(COMPATIBLE),)
        leave = {
            row[0]: row
            for row in db.execute(
                "SELECT user_id, start_balance_hours, accrual_hours, cap_hours, accrual_cadence, "
                "balance_as_of, configured, year_start, bucket FROM leave_policies"
            )
        }
        assert 6 not in leave
        for index, (hpd, balance, accrual, unit, cadence, cap) in enumerate(CASES, start=1):
            (
                _user,
                start,
                accrued,
                stored_cap,
                stored_cadence,
                as_of,
                configured,
                year_start,
                bucket,
            ) = leave[index]
            hpd_d = Decimal(hpd)
            assert bucket == "pto" and configured == 1 and year_start == "01-01"
            assert stored_cadence == cadence and as_of == "2026-01-01"
            assert Decimal(start) / hpd_d == Decimal(balance)
            assert Decimal(start) == Decimal(balance) * hpd_d
            if unit == "hour":
                assert Decimal(accrued) == Decimal(accrual)
            else:
                assert Decimal(accrued) / hpd_d == Decimal(accrual)
            if cap is None:
                assert stored_cap is None
            else:
                assert Decimal(stored_cap) / hpd_d == Decimal(cap)
            setting = db.execute(
                "SELECT value FROM settings WHERE key = ?",
                (f"user:{index}:pto_hours_per_day",),
            ).fetchone()
            assert Decimal(setting[0]) == hpd_d
        sql = db.execute("SELECT sql FROM sqlite_master WHERE name = 'leave_policies'").fetchone()[
            0
        ]
        entry = db.execute("SELECT sql FROM sqlite_master WHERE name = 'pto_entries'").fetchone()[0]
        assert "ck_leave_policies_bucket" in sql and "uq_leave_policies_user_bucket" in sql
        assert "ck_pto_entries_bucket" in entry
    usage = [Usage(1, date(2026, 3, 2), date(2026, 3, 2), Decimal("1.0000"), "Appointment", None)]
    for index, case in enumerate(CASES, start=1):
        body = _read(database, index)
        assert body["policy"] == _expected_policy(*case, usage if index == 1 else [])
        if index == 1:
            assert set(body["entries"][0]) == {
                "id",
                "trip_id",
                "start_date",
                "end_date",
                "days",
                "label",
                "kind",
                "notes",
                "charges",
                "bucket",
                "hours",
            }
            assert body["entries"][0]["days"] == "1.0000"
            assert body["entries"][0]["bucket"] == "pto"
            assert body["entries"][0]["hours"] == "8"
    assert _read(database, 6)["policy"]["configured"] is False
    assert _read(database, 6)["entries"] == []


@pytest.mark.parametrize(
    ("column", "value", "field"),
    [
        ("hours_per_day", "0", "hours_per_day"),
        ("hours_per_day", "abc", "hours_per_day"),
        ("accrual_unit", "week", "accrual_unit"),
        ("accrual_cadence", "daily", "accrual_cadence"),
        ("balance_days", "NaN", "balance_days"),
        ("balance_days", "0.1234567", "balance_days"),
    ],
)
def test_abort_leaves_the_database_untouched(tmp_path, column, value, field):
    database = tmp_path / "site.db"
    _parent(database)
    with sqlite3.connect(database) as db:
        _insert_user(db, "a@example.com")
        row = {
            "hours_per_day": "8",
            "balance_days": "1",
            "accrual_amount": "1",
            "accrual_unit": "day",
            "accrual_cadence": "yearly",
            "annual_cap_days": None,
        }
        row[column] = value
        _insert_policy(
            db,
            1,
            row["hours_per_day"],
            row["balance_days"],
            row["accrual_amount"],
            row["accrual_unit"],
            row["accrual_cadence"],
            row["annual_cap_days"],
        )
        db.commit()
    before = _dump(database)
    with pytest.raises(Exception) as caught:
        command.upgrade(_cfg(database), REVISION)
    assert f"pto_policy id=1: {field} does not convert exactly" in _chain(caught.value)
    assert _dump(database) == before
    assert current_revision(database) == PARENT


def test_conflicting_hours_setting_aborts_without_writes(tmp_path):
    database = tmp_path / "site.db"
    _parent(database)
    with sqlite3.connect(database) as db:
        _insert_user(db, "a@example.com")
        _insert_policy(db, 1, "8", "1", "1", "day", "yearly", None)
        db.execute("INSERT INTO settings (key, value) VALUES ('user:1:pto_hours_per_day', '9')")
        db.commit()
    before = _dump(database)
    with pytest.raises(Exception) as caught:
        command.upgrade(_cfg(database), REVISION)
    assert "pto_policy id=1: hours_per_day does not convert exactly" in _chain(caught.value)
    assert _dump(database) == before
    assert current_revision(database) == PARENT


def test_overprecise_hours_per_day_raises_the_named_runtime_error(tmp_path):
    """Products that store must still abort hpd of more than 6 dp as RuntimeError.

    balance 0, hour-unit accrual 0, and no cap all store. The setting insert is
    the call that used to raise ValueError("more than 6 dp") before any DDL.
    """
    database = tmp_path / "site.db"
    _parent(database)
    with sqlite3.connect(database) as db:
        _insert_user(db, "a@example.com")
        _insert_policy(db, 1, "8.0000001", "0", "0", "hour", "yearly", None)
        db.commit()
    before = _dump(database)
    with pytest.raises(Exception) as caught:
        command.upgrade(_cfg(database), REVISION)
    assert _runtime_error(
        caught.value,
        "site_leave_buckets_v1: pto_policy id=1: hours_per_day "
        "does not convert exactly; no changes made.",
    )
    assert _dump(database) == before
    assert current_revision(database) == PARENT


def test_downgrade_round_trip_restores_pto_output(tmp_path):
    database = tmp_path / "site.db"
    _parent(database)
    with sqlite3.connect(database) as db:
        _insert_user(db, "day@example.com")
        _insert_user(db, "hour@example.com")
        _insert_policy(db, 1, "8", "10.2500", "15.5000", "day", "yearly", "20.0000")
        _insert_policy(db, 2, "7.5", "-1.2500", "3.2500", "hour", "biweekly", None)
        db.execute(
            "INSERT INTO pto_entries (user_id, trip_id, start_date, end_date, days, label, kind) "
            "VALUES (1, NULL, '2026-04-01', '2026-04-01', '0.5000', 'Errand', 'manual')"
        )
        db.commit()
    before = {
        1: _expected_policy(
            "8",
            "10.2500",
            "15.5000",
            "day",
            "yearly",
            "20.0000",
            [Usage(1, date(2026, 4, 1), date(2026, 4, 1), Decimal("0.5000"), "Errand", None)],
        ),
        2: _expected_policy("7.5", "-1.2500", "3.2500", "hour", "biweekly", None, []),
    }
    command.upgrade(_cfg(database), REVISION)
    command.downgrade(_cfg(database), PARENT)
    assert current_revision(database) == PARENT
    with sqlite3.connect(database) as db:
        tables = {
            row[0] for row in db.execute("SELECT name FROM sqlite_master WHERE type = 'table'")
        }
        assert "leave_policies" not in tables
        assert "bucket" not in {row[1] for row in db.execute("PRAGMA table_info(pto_entries)")}
        assert db.execute(
            "SELECT count(*) FROM settings WHERE key LIKE 'user:%:pto_hours_per_day' "
            "OR key LIKE 'user:%:pto_sick_prompt_dismissed'"
        ).fetchone() == (0,)
        assert db.execute(
            "SELECT count(*) FROM site_revision_compatibility WHERE revision = ?",
            (REVISION,),
        ).fetchone() == (0,)
        stored = {
            row[0]: row
            for row in db.execute(
                "SELECT user_id, accrual_unit, accrual_amount, hours_per_day, balance_days, "
                "annual_cap_days, accrual_cadence, balance_as_of FROM pto_policy"
            )
        }
    kept = (
        "balance_saved",
        "balance_today",
        "accrued_since",
        "used_since",
        "hours_per_day",
        "annual_cap_days",
    )
    hour = stored[2]
    assert hour[1] == "hour"
    restored_hour = _expected_policy(hour[3], hour[4], hour[2], hour[1], hour[6], hour[5], [])
    assert restored_hour == before[2]
    day = stored[1]
    restored_day = _expected_policy(
        day[3],
        day[4],
        day[2],
        day[1],
        day[6],
        day[5],
        [Usage(1, date(2026, 4, 1), date(2026, 4, 1), Decimal("0.5000"), "Errand", None)],
    )
    assert {key: restored_day[key] for key in kept} == {key: before[1][key] for key in kept}
    command.upgrade(_cfg(database), REVISION)
    assert current_revision(database) == REVISION
    assert model_diff(database) == []


def test_downgrade_guard_refuses_sick_until_the_env_is_set(tmp_path, monkeypatch):
    database = tmp_path / "site.db"
    _parent(database)
    with sqlite3.connect(database) as db:
        _insert_user(db, "a@example.com")
        _insert_policy(db, 1, "8", "1", "1", "day", "yearly", None)
        db.commit()
    command.upgrade(_cfg(database), REVISION)
    with sqlite3.connect(database) as db:
        db.execute(
            "INSERT INTO pto_entries (user_id, trip_id, start_date, end_date, days, label, kind, bucket) "
            "VALUES (1, NULL, '2026-05-01', '2026-05-01', '1.0000', 'Sick day', 'manual', 'sick')"
        )
        db.execute(
            "INSERT INTO leave_policies (user_id, bucket, configured, start_balance_hours, "
            "balance_as_of, accrual_hours, accrual_cadence, year_start) "
            "VALUES (1, 'sick', 1, '8', '2026-01-01', '0', 'yearly', '01-01')"
        )
        db.commit()
    before = _dump(database)
    monkeypatch.delenv("TPTO1_DOWNGRADE_DROP_SICK", raising=False)
    with pytest.raises(Exception) as caught:
        command.downgrade(_cfg(database), PARENT)
    assert "1 sick entries and 1 sick policies exist" in _chain(caught.value)
    assert _dump(database) == before
    assert current_revision(database) == REVISION
    monkeypatch.setenv("TPTO1_DOWNGRADE_DROP_SICK", "1")
    command.downgrade(_cfg(database), PARENT)
    assert current_revision(database) == PARENT
    with sqlite3.connect(database) as db:
        assert "leave_policies" not in {
            row[0] for row in db.execute("SELECT name FROM sqlite_master WHERE type = 'table'")
        }
        assert db.execute(
            "SELECT count(*) FROM pto_entries WHERE label = 'Sick day'"
        ).fetchone() == (0,)


def test_offline_plan_renders_the_backfill_and_downgrade_refuses(tmp_path):
    database = tmp_path / "site.db"
    _parent(database)
    with sqlite3.connect(database) as db:
        _insert_user(db, "a@example.com")
        _insert_policy(db, 1, "8", "10", "15", "day", "yearly", "20")
        db.commit()
    before = _dump(database)
    stdout = StringIO()
    import sys

    previous = sys.stdout
    sys.stdout = stdout
    try:
        assert plan(sqlite_url(database)) == 0
    finally:
        sys.stdout = previous
    rendered = stdout.getvalue()
    assert "CREATE TABLE leave_policies" in rendered
    assert "INSERT INTO leave_policies" in rendered
    assert "CREATE INDEX ix_pto_entries_user_id ON pto_entries (user_id)" in rendered
    assert "CREATE INDEX ix_pto_entries_start_date ON pto_entries (start_date)" in rendered
    assert "'80'" in rendered or "'80.000000'" in rendered or "80" in rendered
    assert f"'{REVISION}', 'site_user_birthday_v1'" in rendered
    assert _dump(database) == before
    command.upgrade(_cfg(database), REVISION)
    with sqlite3.connect(database) as db:
        online = db.execute(
            "SELECT start_balance_hours, accrual_hours, cap_hours FROM leave_policies"
        ).fetchone()
    assert online == ("80", "120", "160")
    for value in online:
        assert value in rendered
    with pytest.raises(Exception) as caught:
        command.downgrade(_cfg(database), f"{REVISION}:{PARENT}", sql=True)
    assert "downgrade runs online only" in _chain(caught.value)


def test_delete_user_removes_leave_rows_and_both_settings(tmp_path):
    database = tmp_path / "site.db"
    command.upgrade(_cfg(database), "head")
    assert "leave_policies" in _owner_tables(database)
    opened = open_database(f"sqlite:///{database}")
    db = opened.sessionmaker()
    try:
        kept = User(
            email="kept@example.invalid",
            display_name="Kept",
            role=UserRole.user,
            username="kept",
            is_active=True,
            must_change_password=False,
        )
        deleted = User(
            email="deleted@example.invalid",
            display_name="Deleted",
            role=UserRole.user,
            username="deleted",
            is_active=True,
            must_change_password=False,
        )
        db.add_all([kept, deleted])
        db.flush()
        for person, hours in ((kept, "8"), (deleted, "7.5")):
            db.add(
                LeavePolicy(
                    user_id=person.id,
                    bucket="pto",
                    configured=True,
                    start_balance_hours=hours,
                    balance_as_of=AS_OF,
                    accrual_hours="1",
                    accrual_cadence="yearly",
                    year_start="03-01",
                )
            )
            db.add(Setting(key=hpd_setting_key(person.id), value=hours))
            db.add(Setting(key=sick_prompt_setting_key(person.id), value="1"))
        db.commit()
        deleted_id = deleted.id
        kept_id = kept.id
        delete_user_account(db, deleted, actor_user_id=kept.id)
        db.commit()
        assert db.query(LeavePolicy).filter(LeavePolicy.user_id == deleted_id).count() == 0
        assert db.get(Setting, hpd_setting_key(deleted_id)) is None
        assert db.get(Setting, sick_prompt_setting_key(deleted_id)) is None
        assert db.query(LeavePolicy).filter(LeavePolicy.user_id == kept_id).count() == 1
        kept_hours = db.get(Setting, hpd_setting_key(kept_id))
        kept_prompt = db.get(Setting, sick_prompt_setting_key(kept_id))
        assert kept_hours is not None and kept_hours.value == "8"
        assert kept_prompt is not None and kept_prompt.value == "1"
    finally:
        db.close()
        opened.engine.dispose()
