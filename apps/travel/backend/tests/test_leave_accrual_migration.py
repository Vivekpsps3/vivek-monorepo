"""site_leave_accrual_v1 keeps every policy and allocation and stays daily."""

import sqlite3
from datetime import date
from fractions import Fraction

from alembic import command
from alembic.script import ScriptDirectory

from apps.server.migrations import (
    current_revision,
    head_revision,
    make_config,
    model_diff,
    sqlite_url,
)
from apps.travel.backend.services.leave_math import Bucket, walk_bucket

PARENT = "site_leave_carry_v1"
REVISION = "site_leave_accrual_v1"
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
    "site_leave_buckets_v1",
    "site_world_v1",
    "site_leave_carry_v1",
}
POLICIES = (
    "user_id, bucket, configured, start_balance_hours, balance_as_of, accrual_hours, "
    "accrual_cadence, cap_hours, year_start, carry_forward"
)
ALLOCATIONS = "trip_id, on_date, amount, provenance, migration_source"
ENTRIES = "user_id, trip_id, start_date, end_date, days, label, kind, bucket"


def _cfg(database):
    return make_config(sqlite_url(database))


def _rows(db, sql: str):
    return db.execute(sql).fetchall()


def test_upgrade_preserves_rows_and_keeps_one_daily_head(tmp_path):
    database = tmp_path / "site.db"
    command.upgrade(_cfg(database), PARENT)
    with sqlite3.connect(database) as db:
        db.execute(
            "INSERT INTO users (email, display_name, role, is_active, must_change_password, "
            "created_at, updated_at) VALUES ('pto@example.com', 'PTO', 'user', 1, 0, "
            "'2026-01-01', '2026-01-01')"
        )
        db.execute(
            f"INSERT INTO leave_policies ({POLICIES}) VALUES "
            "(1, 'pto', 1, '40', '2026-01-01', '8', 'monthly', '80', '01-01', 1)"
        )
        db.execute(
            f"INSERT INTO leave_policies ({POLICIES}) VALUES "
            "(1, 'sick', 1, '-1.5', '2024-02-29', '0', 'semimonthly', NULL, '02-29', 0)"
        )
        db.execute(
            "INSERT INTO trips (user_id, title, start_date, end_date, status, counts_as_pto, "
            "pto_days, created_at, updated_at) VALUES "
            "(1, 'Kyoto', '2026-10-23', '2026-10-24', 'planning', 1, '1.5000', "
            "'2026-01-01', '2026-01-01')"
        )
        db.execute(
            f"INSERT INTO trip_pto_days ({ALLOCATIONS}) VALUES "
            "(1, '2026-10-23', '1.0000', 'override', 'backfill-automatic'), "
            "(1, '2026-10-24', '0.5000', 'default', NULL)"
        )
        db.execute(
            f"INSERT INTO pto_entries ({ENTRIES}) VALUES "
            "(1, NULL, '2026-02-02', '2026-02-02', '1.0000', 'Clinic', 'manual', 'sick')"
        )
        db.commit()
        before_policies = _rows(db, f"SELECT {POLICIES} FROM leave_policies ORDER BY bucket")
        before_allocations = _rows(db, f"SELECT {ALLOCATIONS} FROM trip_pto_days ORDER BY on_date")
        before_entries = _rows(db, f"SELECT {ENTRIES} FROM pto_entries ORDER BY id")
        assert len(before_policies) == 2
        assert len(before_allocations) == 2

    command.upgrade(_cfg(database), REVISION)
    assert current_revision(database) == REVISION
    assert ScriptDirectory.from_config(_cfg(database)).get_heads() == [head_revision()]
    assert head_revision() == REVISION
    assert model_diff(database) == []
    with sqlite3.connect(database) as db:
        assert (
            _rows(db, f"SELECT {POLICIES} FROM leave_policies ORDER BY bucket") == before_policies
        )
        assert (
            _rows(db, f"SELECT {ALLOCATIONS} FROM trip_pto_days ORDER BY on_date")
            == before_allocations
        )
        assert _rows(db, f"SELECT {ENTRIES} FROM pto_entries ORDER BY id") == before_entries
        added = _rows(
            db,
            "SELECT accrual_mode, accrual_anchor, accrual_version FROM leave_policies "
            "ORDER BY bucket",
        )
        assert added == [("daily", None, 0), ("daily", None, 0)]
        compatible = {
            row[0]
            for row in db.execute(
                "SELECT compatible_head FROM site_revision_compatibility WHERE revision = ?",
                (REVISION,),
            )
        }
        assert compatible == COMPATIBLE
        assert db.execute("PRAGMA foreign_key_check").fetchall() == []

    kept = dict(
        zip(
            (
                "user_id",
                "bucket",
                "configured",
                "start",
                "as_of",
                "amount",
                "cadence",
                "cap",
                "year_start",
                "carry",
            ),
            before_policies[1],
            strict=True,
        )
    )
    # Ordered by bucket: pto, then sick. Sick accrues nothing, so the old walk stays put.
    bucket = Bucket(
        kept["bucket"],
        True,
        Fraction(kept["start"]),
        date.fromisoformat(kept["as_of"]),
        Fraction(kept["amount"]),
        kept["cadence"],
        None if kept["cap"] is None else Fraction(kept["cap"]),
        kept["year_start"],
        bool(kept["carry"]),
    )
    assert bucket.accrual_mode == "daily"
    on = date(2026, 11, 11)
    assert walk_bucket(bucket, {}, on)[0] == Fraction(kept["start"])

    command.downgrade(_cfg(database), PARENT)
    assert current_revision(database) == PARENT
    with sqlite3.connect(database) as db:
        names = {row[1] for row in db.execute("PRAGMA table_info(leave_policies)")}
        assert "accrual_mode" not in names
        assert "accrual_anchor" not in names
        assert "accrual_version" not in names
        assert (
            _rows(db, f"SELECT {POLICIES} FROM leave_policies ORDER BY bucket") == before_policies
        )
        assert (
            _rows(db, f"SELECT {ALLOCATIONS} FROM trip_pto_days ORDER BY on_date")
            == before_allocations
        )
        assert db.execute(
            "SELECT count(*) FROM site_revision_compatibility WHERE revision = ?",
            (REVISION,),
        ).fetchone() == (0,)
