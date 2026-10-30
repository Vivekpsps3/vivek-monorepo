"""Town schema migration site_town_v1."""

import sqlite3
import sys
from pathlib import Path

import pytest
from alembic import command
from sqlalchemy import create_engine, inspect

sys.path.insert(0, str(Path(__file__).resolve().parents[3]))

from apps.server.migrations import current_revision, make_config, sqlite_url
from apps.server.schema import OWNER_TABLES, metadata

PREVIOUS = "site_trip_create_attempt_v1"
REVISION = "site_town_v1"
COMPATIBLE_HEADS = {
    "site_schema_v1",
    "site_auth_challenge_purpose_v2",
    "site_trip_pto_days_v1",
    "site_media_membership_v1",
    "site_media_progress_v1",
    "site_catalog_title_sort_v1",
    "site_trip_create_attempt_v1",
}
TOWN_TABLES = ("habits", "habit_checkins", "habit_cadences")
NAMED_INDEXES = {
    "habits": {
        "ix_habits_user_id",
        "ix_habits_user_active",
        "uq_habits_active_slot",
        "uq_habits_active_name",
    },
    "habit_checkins": {
        "ix_habit_checkins_habit_id",
        "ix_habit_checkins_user_id",
        "ix_habit_checkins_user_day",
    },
    "habit_cadences": {"ix_habit_cadences_habit_id"},
}


def _upgrade(tmp_path: Path) -> Path:
    database = tmp_path / "site.db"
    config = make_config(sqlite_url(database))
    command.upgrade(config, PREVIOUS)
    assert current_revision(database) == PREVIOUS
    command.upgrade(config, "head")
    assert current_revision(database) == REVISION
    return database


def _index_names(db: sqlite3.Connection, table: str) -> set[str]:
    return {row[1] for row in db.execute(f'PRAGMA index_list("{table}")')}


def _insert_user(db: sqlite3.Connection) -> None:
    db.execute(
        "INSERT INTO users (email, display_name, role, is_active, must_change_password, created_at, updated_at) "
        "VALUES ('town@example.invalid', 'Town', 'user', 1, 0, '2026-01-01', '2026-01-01')"
    )


def _insert_habit(
    db: sqlite3.Connection,
    *,
    slot: int,
    name: str,
    name_key: str,
    archived_at: str | None = None,
) -> int:
    cursor = db.execute(
        "INSERT INTO habits (user_id, name, slot, building_style, per_week, created_on, created_at, "
        "archived_at, archived_on, name_key) "
        "VALUES (1, ?, ?, 'forge', 7, '2026-01-01', '2026-01-01T00:00:00+00:00', ?, NULL, ?)",
        (name, slot, archived_at, name_key),
    )
    assert cursor.lastrowid is not None
    return int(cursor.lastrowid)


def test_upgrade_from_previous_head_creates_town_schema(tmp_path: Path) -> None:
    database = _upgrade(tmp_path)
    engine = create_engine(sqlite_url(database))
    inspector = inspect(engine)
    with sqlite3.connect(database) as db:
        tables = {
            row[0] for row in db.execute("SELECT name FROM sqlite_master WHERE type = 'table'")
        }
        assert set(TOWN_TABLES) <= tables
        completed = next(
            row for row in db.execute("PRAGMA table_info(user_entries)") if row[1] == "completed_on"
        )
        done_at = next(
            row for row in db.execute("PRAGMA table_info(reminders)") if row[1] == "done_at"
        )
        assert completed[2:] == ("DATE", 0, None, 0)
        assert done_at[2:] == ("DATETIME", 0, None, 0)
        for table, expected in NAMED_INDEXES.items():
            assert expected <= _index_names(db, table)
        assert "ix_habit_checkins_user_day" in _index_names(db, "habit_checkins")
        partials = {
            row[0]: row[1]
            for row in db.execute(
                "SELECT name, sql FROM sqlite_master WHERE type = 'index' AND tbl_name = 'habits'"
            )
        }
        assert "WHERE archived_at IS NULL" in partials["uq_habits_active_slot"]
        assert "WHERE archived_at IS NULL" in partials["uq_habits_active_name"]
        heads = {
            row[0]
            for row in db.execute(
                "SELECT compatible_head FROM site_revision_compatibility WHERE revision = ?",
                (REVISION,),
            )
        }
        assert heads == COMPATIBLE_HEADS
        assert len(heads) == 7
    for table, expected in NAMED_INDEXES.items():
        reflected = {index["name"]: index for index in inspector.get_indexes(table)}
        assert expected <= set(reflected)
    habits = {index["name"]: index for index in inspector.get_indexes("habits")}
    assert str(habits["uq_habits_active_slot"]["dialect_options"]["sqlite_where"]) == (
        "archived_at IS NULL"
    )
    assert str(habits["uq_habits_active_name"]["dialect_options"]["sqlite_where"]) == (
        "archived_at IS NULL"
    )
    assert inspector.get_unique_constraints("habit_checkins") == [
        {"name": "uq_checkin_habit_day", "column_names": ["habit_id", "day"]}
    ]
    assert inspector.get_unique_constraints("habit_cadences") == [
        {"name": "uq_cadence_habit_from", "column_names": ["habit_id", "effective_from"]}
    ]
    habit_fk = inspector.get_foreign_keys("habit_checkins")
    assert {
        (fk["constrained_columns"][0], fk["referred_table"], fk["options"].get("ondelete"))
        for fk in habit_fk
    } == {("habit_id", "habits", "RESTRICT"), ("user_id", "users", None)}
    engine.dispose()


def test_downgrade_removes_town_schema_and_upgrade_again(tmp_path: Path) -> None:
    database = _upgrade(tmp_path)
    config = make_config(sqlite_url(database))
    command.downgrade(config, "-1")
    assert current_revision(database) == PREVIOUS
    with sqlite3.connect(database) as db:
        names = {row[0] for row in db.execute("SELECT name FROM sqlite_master")}
        assert not (set(TOWN_TABLES) & names)
        assert not any(name.startswith("ix_habit") or name.startswith("uq_habit") for name in names)
        assert "ix_habit_checkins_user_day" not in names
        assert "completed_on" not in {
            row[1] for row in db.execute("PRAGMA table_info(user_entries)")
        }
        assert "done_at" not in {row[1] for row in db.execute("PRAGMA table_info(reminders)")}
        assert db.execute(
            "SELECT COUNT(*) FROM site_revision_compatibility WHERE revision = ?",
            (REVISION,),
        ).fetchone() == (0,)
    command.upgrade(config, "head")
    assert current_revision(database) == REVISION
    with sqlite3.connect(database) as db:
        assert set(TOWN_TABLES) <= {
            row[0] for row in db.execute("SELECT name FROM sqlite_master WHERE type = 'table'")
        }
        assert "ix_habit_checkins_user_day" in _index_names(db, "habit_checkins")


def test_partial_unique_indexes_keep_one_active_row(tmp_path: Path) -> None:
    database = _upgrade(tmp_path)
    with sqlite3.connect(database) as db:
        db.execute("PRAGMA foreign_keys=ON")
        _insert_user(db)
        _insert_habit(db, slot=0, name="Morning", name_key="morning")
        with pytest.raises(sqlite3.IntegrityError):
            _insert_habit(db, slot=0, name="Dawn", name_key="dawn")
        _insert_habit(
            db,
            slot=0,
            name="Old morning",
            name_key="old morning",
            archived_at="2026-02-01T00:00:00+00:00",
        )
        _insert_habit(db, slot=1, name="Walk", name_key="walk")
        with pytest.raises(sqlite3.IntegrityError):
            _insert_habit(db, slot=2, name="Walk again", name_key="walk")
        _insert_habit(
            db,
            slot=3,
            name="Walk archived",
            name_key="walk",
            archived_at="2026-02-01T00:00:00+00:00",
        )
        assert db.execute("SELECT COUNT(*) FROM habits").fetchone() == (4,)


def test_checkin_and_cadence_uniqueness(tmp_path: Path) -> None:
    database = _upgrade(tmp_path)
    with sqlite3.connect(database) as db:
        db.execute("PRAGMA foreign_keys=ON")
        _insert_user(db)
        habit_id = _insert_habit(db, slot=0, name="Morning", name_key="morning")
        db.execute(
            "INSERT INTO habit_checkins (habit_id, user_id, day, created_at) "
            "VALUES (?, 1, '2026-10-01', '2026-10-01T00:00:00+00:00')",
            (habit_id,),
        )
        with pytest.raises(sqlite3.IntegrityError):
            db.execute(
                "INSERT INTO habit_checkins (habit_id, user_id, day, created_at) "
                "VALUES (?, 1, '2026-10-01', '2026-10-01T01:00:00+00:00')",
                (habit_id,),
            )
        db.execute(
            "INSERT INTO habit_cadences (habit_id, user_id, per_week, effective_from, created_at) "
            "VALUES (?, 1, 7, '2026-10-05', '2026-10-01T00:00:00+00:00')",
            (habit_id,),
        )
        with pytest.raises(sqlite3.IntegrityError):
            db.execute(
                "INSERT INTO habit_cadences (habit_id, user_id, per_week, effective_from, created_at) "
                "VALUES (?, 1, 3, '2026-10-05', '2026-10-02T00:00:00+00:00')",
                (habit_id,),
            )


def test_checkin_requires_a_habit_when_foreign_keys_are_on(tmp_path: Path) -> None:
    database = _upgrade(tmp_path)
    with sqlite3.connect(database) as db:
        db.execute("PRAGMA foreign_keys=ON")
        assert db.execute("PRAGMA foreign_keys").fetchone() == (1,)
        _insert_user(db)
        with pytest.raises(sqlite3.IntegrityError):
            db.execute(
                "INSERT INTO habit_checkins (habit_id, user_id, day, created_at) "
                "VALUES (999, 1, '2026-10-01', '2026-10-01T00:00:00+00:00')"
            )


def test_owner_tables_and_metadata_include_town() -> None:
    assert {"habits", "habit_checkins", "habit_cadences"} <= OWNER_TABLES
    tables = metadata().tables
    for name in TOWN_TABLES:
        assert name in tables
        referred = {
            element.target_fullname
            for constraint in tables[name].foreign_key_constraints
            for element in constraint.elements
        }
        assert "users.id" in referred
