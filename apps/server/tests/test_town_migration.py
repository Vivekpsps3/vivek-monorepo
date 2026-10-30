"""Town schema migration site_town_v1."""

import sqlite3
import sys
from pathlib import Path

import pytest
from alembic import command
from sqlalchemy import create_engine, inspect, text
from sqlalchemy.orm import Session

sys.path.insert(0, str(Path(__file__).resolve().parents[3]))

from apps.server.database import open_database
from apps.server.errors import APIError
from apps.server.identity.admin import delete_user_account
from apps.server.identity.models import User, UserRole
from apps.server.migrate import check_integrity
from apps.server.migrations import current_revision, make_config, sqlite_url
from apps.server.schema import OWNER_TABLES, metadata
from apps.server.town.models import make_name_key

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


def _insert_user(
    db: sqlite3.Connection,
    *,
    email: str = "town@example.invalid",
    display_name: str = "Town",
) -> int:
    cursor = db.execute(
        "INSERT INTO users (email, display_name, role, is_active, must_change_password, created_at, updated_at) "
        "VALUES (?, ?, 'user', 1, 0, '2026-01-01', '2026-01-01')",
        (email, display_name),
    )
    assert cursor.lastrowid is not None
    return int(cursor.lastrowid)


def _insert_habit(
    db: sqlite3.Connection,
    *,
    slot: int,
    name: str,
    name_key: str,
    archived_at: str | None = None,
    user_id: int = 1,
) -> int:
    cursor = db.execute(
        "INSERT INTO habits (user_id, name, slot, building_style, per_week, created_on, created_at, "
        "archived_at, archived_on, name_key) "
        "VALUES (?, ?, ?, 'forge', 7, '2026-01-01', '2026-01-01T00:00:00+00:00', ?, NULL, ?)",
        (user_id, name, slot, archived_at, name_key),
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
        first = _insert_user(db)
        _insert_habit(db, slot=0, name="Morning", name_key="morning", user_id=first)
        with pytest.raises(sqlite3.IntegrityError):
            _insert_habit(db, slot=0, name="Dawn", name_key="dawn", user_id=first)
        _insert_habit(
            db,
            slot=0,
            name="Old morning",
            name_key="old morning",
            archived_at="2026-02-01T00:00:00+00:00",
            user_id=first,
        )
        _insert_habit(db, slot=1, name="Walk", name_key="walk", user_id=first)
        with pytest.raises(sqlite3.IntegrityError):
            _insert_habit(db, slot=2, name="Walk again", name_key="walk", user_id=first)
        _insert_habit(
            db,
            slot=3,
            name="Walk archived",
            name_key="walk",
            archived_at="2026-02-01T00:00:00+00:00",
            user_id=first,
        )
        second = _insert_user(db, email="other@example.invalid", display_name="Other")
        _insert_habit(db, slot=0, name="Morning", name_key="morning", user_id=second)
        with pytest.raises(sqlite3.IntegrityError):
            _insert_habit(db, slot=0, name="Dawn", name_key="dawn", user_id=second)
        with pytest.raises(sqlite3.IntegrityError):
            _insert_habit(db, slot=1, name="Morning again", name_key="morning", user_id=second)
        assert db.execute("SELECT COUNT(*) FROM habits").fetchone() == (5,)


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


def test_check_integrity_flags_habit_owner_mismatch(tmp_path: Path) -> None:
    database = _upgrade(tmp_path)
    with sqlite3.connect(database) as db:
        check_integrity(db)
        db.execute("PRAGMA foreign_keys=ON")
        owner = _insert_user(db)
        other = _insert_user(db, email="other@example.invalid", display_name="Other")
        habit_id = _insert_habit(db, slot=0, name="Morning", name_key="morning", user_id=owner)
        db.execute(
            "INSERT INTO habit_checkins (habit_id, user_id, day, created_at) "
            "VALUES (?, ?, '2026-10-01', '2026-10-01T00:00:00+00:00')",
            (habit_id, owner),
        )
        db.execute(
            "INSERT INTO habit_cadences (habit_id, user_id, per_week, effective_from, created_at) "
            "VALUES (?, ?, 7, '2026-10-01', '2026-10-01T00:00:00+00:00')",
            (habit_id, owner),
        )
        check_integrity(db)
        db.execute(
            "INSERT INTO habit_checkins (habit_id, user_id, day, created_at) "
            "VALUES (?, ?, '2026-10-02', '2026-10-02T00:00:00+00:00')",
            (habit_id, other),
        )
        with pytest.raises(RuntimeError, match="Ownership mismatch in habit_checkins"):
            check_integrity(db)
        db.execute("DELETE FROM habit_checkins WHERE user_id = ?", (other,))
        db.execute(
            "INSERT INTO habit_cadences (habit_id, user_id, per_week, effective_from, created_at) "
            "VALUES (?, ?, 3, '2026-10-08', '2026-10-08T00:00:00+00:00')",
            (habit_id, other),
        )
        with pytest.raises(RuntimeError, match="Ownership mismatch in habit_cadences"):
            check_integrity(db)
        db.execute("DELETE FROM habit_cadences WHERE user_id = ?", (other,))
        check_integrity(db)


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


def _town_row_count(db: Session, table: str, user_id: int) -> int:
    return int(
        db.execute(
            text(f'SELECT COUNT(*) FROM "{table}" WHERE user_id = :owner'),
            {"owner": user_id},
        ).scalar_one()
    )


def _insert_account_habit(db: Session, user_id: int) -> int:
    db.execute(
        text(
            "INSERT INTO habits (user_id, name, slot, building_style, per_week, created_on, "
            "created_at, archived_at, archived_on, name_key) "
            "VALUES (:user_id, 'Morning', 0, 'forge', 7, '2026-01-01', "
            "'2026-01-01T00:00:00+00:00', NULL, NULL, 'morning')"
        ),
        {"user_id": user_id},
    )
    habit_id = int(db.execute(text("SELECT last_insert_rowid()")).scalar_one())
    db.execute(
        text(
            "INSERT INTO habit_checkins (habit_id, user_id, day, created_at) "
            "VALUES (:habit_id, :user_id, '2026-10-01', '2026-10-01T00:00:00+00:00')"
        ),
        {"habit_id": habit_id, "user_id": user_id},
    )
    db.execute(
        text(
            "INSERT INTO habit_cadences (habit_id, user_id, per_week, effective_from, created_at) "
            "VALUES (:habit_id, :user_id, 7, '2026-10-01', '2026-10-01T00:00:00+00:00')"
        ),
        {"habit_id": habit_id, "user_id": user_id},
    )
    return habit_id


def test_delete_user_account_removes_town_rows_for_that_user_only(tmp_path: Path) -> None:
    database = _upgrade(tmp_path)
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
        db.commit()
        kept_habit = _insert_account_habit(db, kept.id)
        deleted_habit = _insert_account_habit(db, deleted.id)
        db.commit()

        delete_user_account(db, deleted, actor_user_id=kept.id)
        db.commit()

        for table in ("habit_checkins", "habit_cadences", "habits"):
            assert _town_row_count(db, table, deleted.id) == 0
            assert _town_row_count(db, table, kept.id) == 1
        assert db.get(User, deleted.id) is None
        assert db.get(User, kept.id) is not None
        assert (
            db.execute(
                text("SELECT id FROM habits WHERE user_id = :owner"),
                {"owner": kept.id},
            ).scalar_one()
            == kept_habit
        )
        assert (
            db.execute(
                text("SELECT habit_id FROM habit_checkins WHERE user_id = :owner"),
                {"owner": kept.id},
            ).scalar_one()
            == kept_habit
        )
        assert (
            db.execute(
                text("SELECT habit_id FROM habit_cadences WHERE user_id = :owner"),
                {"owner": kept.id},
            ).scalar_one()
            == kept_habit
        )
        assert (
            db.execute(
                text("SELECT id FROM habits WHERE id = :habit_id"),
                {"habit_id": deleted_habit},
            ).first()
            is None
        )
    finally:
        db.close()
        opened.engine.dispose()


def test_make_name_key_rejects_casefold_longer_than_40() -> None:
    assert make_name_key("ß" * 20) == "ss" * 20
    assert len(make_name_key("ß" * 20)) == 40
    assert make_name_key("Morning") == "morning"
    with pytest.raises(APIError) as caught:
        make_name_key("ß" * 40)
    assert caught.value.status_code == 422
    assert caught.value.code == "name_too_long"
    assert caught.value.message == "Use 1 to 40 characters."


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
