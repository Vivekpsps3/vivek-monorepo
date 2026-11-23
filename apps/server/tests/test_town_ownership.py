"""Town ownership migration site_town_ownership_v1.

Valid history is copied unchanged. Cross-owner children and the finite
style, cadence, slot, name, and key checks are rejected. A habit that still
has history cannot be deleted. Account deletion still removes that owner's
rows, children first.
"""

import hashlib
import sqlite3
from pathlib import Path
from types import SimpleNamespace

import pytest
from alembic import command
from alembic.script import ScriptDirectory
from fastapi.testclient import TestClient
from sqlalchemy import text
from sqlalchemy.orm import Session

from apps.server.database import open_database
from apps.server.identity.admin import delete_user_account
from apps.server.identity.models import User, UserRole
from apps.server.identity.session import get_current_user
from apps.server.main import Dependencies, Settings, create_app
from apps.server.migrations import (
    current_revision,
    head_revision,
    make_config,
    model_diff,
    sqlite_url,
)
from apps.server.tests.test_town_api_read import CLOCK
from apps.server.tests.test_town_api_write import _quiet
from apps.server.town.clock import get_town_clock
from apps.server.town.constants import HABIT_NAME_MAX, LOT_UNLOCK_LV, SLOT_DEFAULT_STYLE

PARENT = "site_calendar_feeds_v1"
REVISION = "site_town_ownership_v1"


def _later_model(diff) -> tuple[set[str], set[str]]:
    columns: set[str] = set()
    tables: set[str] = set()
    later_tables = {
        "trip_drafts",
        "trip_draft_legs",
        "trip_draft_proposals",
        "town_stamp_wallets",
        "town_stamp_receipts",
        "town_stamp_entitlements",
        "town_room_layouts",
    }
    for item in diff:
        if item[0] == "add_column":
            columns.add(f"{item[2]}.{item[3].name}")
        elif item[0] == "add_table":
            tables.add(str(getattr(item[1], "name", None)))
        elif item[0] == "add_index":
            table = getattr(getattr(item[1], "table", None), "name", None)
            if table not in later_tables:
                raise AssertionError(item)
        else:
            raise AssertionError(item)
    return columns, tables


TABLES = ("habits", "habit_checkins", "habit_cadences")
CHECKS = {
    "ck_habits_building_style": "building_style IN ('forge', 'garden', 'cottage')",
    "ck_habits_per_week": "per_week BETWEEN 1 AND 7",
    "ck_habits_slot": "slot BETWEEN 0 AND 5",
    "ck_habits_name": "length(name) BETWEEN 1 AND 40",
    "ck_habits_name_key": "length(name_key) BETWEEN 1 AND 40",
    "ck_habit_cadences_per_week": "per_week BETWEEN 1 AND 7",
}


def _cfg(database: Path):
    return make_config(sqlite_url(database))


def _upgrade_to(database: Path, revision: str) -> None:
    command.upgrade(_cfg(database), revision)


def _snapshot(database: Path) -> dict[str, tuple]:
    with sqlite3.connect(database) as db:
        dumped = {}
        for table in TABLES:
            columns = [row[1] for row in db.execute(f'PRAGMA table_info("{table}")')]
            quoted = ", ".join(f'"{column}"' for column in columns)
            dumped[table] = tuple(
                db.execute(f'SELECT {quoted} FROM "{table}" ORDER BY id').fetchall()
            )
        return dumped


def _digest(snapshot: dict[str, tuple]) -> str:
    payload = repr(tuple((table, snapshot[table]) for table in TABLES)).encode()
    return hashlib.sha256(payload).hexdigest()


def _insert_user(db: sqlite3.Connection, email: str, name: str) -> int:
    cursor = db.execute(
        "INSERT INTO users (email, display_name, role, is_active, must_change_password, "
        "created_at, updated_at) VALUES (?, ?, 'user', 1, 0, '2026-01-01', '2026-01-01')",
        (email, name),
    )
    assert cursor.lastrowid is not None
    return int(cursor.lastrowid)


def _seed_valid(db: sqlite3.Connection) -> dict[str, int]:
    owner = _insert_user(db, "owner@example.invalid", "Owner")
    other = _insert_user(db, "other@example.invalid", "Other")
    habit = db.execute(
        "INSERT INTO habits (user_id, name, slot, building_style, per_week, created_on, "
        "created_at, archived_at, archived_on, name_key) VALUES "
        "(?, 'Morning', 0, 'forge', 7, '2026-01-01', '2026-01-01T00:00:00+00:00', "
        "NULL, NULL, 'morning')",
        (owner,),
    ).lastrowid
    archived = db.execute(
        "INSERT INTO habits (user_id, name, slot, building_style, per_week, created_on, "
        "created_at, archived_at, archived_on, name_key) VALUES "
        "(?, 'Old', 0, 'garden', 1, '2026-01-02', '2026-01-02T00:00:00+00:00', "
        "'2026-02-01T00:00:00+00:00', '2026-02-01', 'old')",
        (owner,),
    ).lastrowid
    long_name = "n" * 40
    second = db.execute(
        "INSERT INTO habits (user_id, name, slot, building_style, per_week, created_on, "
        "created_at, archived_at, archived_on, name_key) VALUES "
        "(?, ?, 5, 'cottage', 1, '2026-01-03', '2026-01-03T00:00:00+00:00', NULL, NULL, ?)",
        (other, long_name, long_name),
    ).lastrowid
    checkin = db.execute(
        "INSERT INTO habit_checkins (habit_id, user_id, day, created_at) VALUES "
        "(?, ?, '2026-10-01', '2026-10-01T00:00:00+00:00')",
        (habit, owner),
    ).lastrowid
    cadence = db.execute(
        "INSERT INTO habit_cadences (habit_id, user_id, per_week, effective_from, created_at) "
        "VALUES (?, ?, 7, '2026-10-05', '2026-10-01T00:00:00+00:00')",
        (habit, owner),
    ).lastrowid
    assert habit is not None
    assert archived is not None
    assert second is not None
    assert checkin is not None
    assert cadence is not None
    return {
        "owner": owner,
        "other": other,
        "habit": habit,
        "archived": archived,
        "second": second,
        "checkin": checkin,
        "cadence": cadence,
    }


def _parent_with_seed(tmp_path: Path) -> tuple[Path, dict[str, int]]:
    database = tmp_path / "site.db"
    _upgrade_to(database, PARENT)
    with sqlite3.connect(database) as db:
        ids = _seed_valid(db)
        db.commit()
    return database, ids


def test_upgrade_preserves_multi_owner_history_and_is_the_only_head(tmp_path: Path) -> None:
    database, ids = _parent_with_seed(tmp_path)
    before = _snapshot(database)
    digest = _digest(before)
    _upgrade_to(database, REVISION)
    assert current_revision(database) == REVISION
    assert head_revision() == "site_town_layouts_v1"
    assert ScriptDirectory.from_config(_cfg(database)).get_heads() == ["site_town_layouts_v1"]
    assert _later_model(model_diff(database)) == (
        {"transports.fa_flight_id"},
        {
            "trip_drafts",
            "trip_draft_legs",
            "trip_draft_proposals",
            "town_stamp_wallets",
            "town_stamp_receipts",
            "town_stamp_entitlements",
            "town_room_layouts",
        },
    )
    after = _snapshot(database)
    assert after == before
    assert _digest(after) == digest
    with sqlite3.connect(database) as db:
        defined = {
            row[0]: row[1]
            for row in db.execute(
                "SELECT name, sql FROM sqlite_master WHERE type = 'table' AND name IN "
                "('habits', 'habit_checkins', 'habit_cadences')"
            )
        }
        for name, expression in CHECKS.items():
            assert name in defined["habits"] or name in defined["habit_cadences"]
            assert expression in (defined["habits"] + defined["habit_cadences"])
        assert "uq_habits_id_user" in defined["habits"]
        assert "fk_habit_checkins_owner" in defined["habit_checkins"]
        assert "fk_habit_cadences_owner" in defined["habit_cadences"]
        assert "sqlite_autoindex_habit_checkins_1" in {
            row[1] for row in db.execute('PRAGMA index_list("habit_checkins")')
        }
        assert "ix_habit_cadences_user_id" in {
            row[1] for row in db.execute('PRAGMA index_list("habit_cadences")')
        }
        partials = {
            row[0]: row[1]
            for row in db.execute(
                "SELECT name, sql FROM sqlite_master WHERE type = 'index' AND tbl_name = 'habits'"
            )
        }
        assert "WHERE archived_at IS NULL" in partials["uq_habits_active_slot"]
        assert "WHERE archived_at IS NULL" in partials["uq_habits_active_name"]
        for table in ("habit_checkins", "habit_cadences"):
            owner_deletes = {
                row[6]
                for row in db.execute(f'PRAGMA foreign_key_list("{table}")')
                if row[2] == "habits"
            }
            assert owner_deletes == {"RESTRICT"}
        db.execute("PRAGMA foreign_keys=ON")
        db.execute(
            "INSERT INTO habits (user_id, name, slot, building_style, per_week, created_on, "
            "created_at, name_key) VALUES (?, 'A', 1, 'forge', 1, '2026-03-01', "
            "'2026-03-01T00:00:00+00:00', 'a')",
            (ids["owner"],),
        )
        with pytest.raises(sqlite3.IntegrityError):
            db.execute(
                "INSERT INTO habits (user_id, name, slot, building_style, per_week, created_on, "
                "created_at, name_key) VALUES (?, 'Dawn', 1, 'garden', 7, '2026-03-02', "
                "'2026-03-02T00:00:00+00:00', 'dawn')",
                (ids["owner"],),
            )
        db.rollback()
    command.downgrade(_cfg(database), PARENT)
    assert current_revision(database) == PARENT
    assert _snapshot(database) == before
    with sqlite3.connect(database) as db:
        assert db.execute(
            "SELECT COUNT(*) FROM site_revision_compatibility WHERE revision = ?",
            (REVISION,),
        ).fetchone() == (0,)
        checkins = db.execute(
            "SELECT sql FROM sqlite_master WHERE name = 'habit_checkins'"
        ).fetchone()
        assert checkins is not None
        assert "fk_habit_checkins_owner" not in checkins[0]
    _upgrade_to(database, REVISION)
    assert _snapshot(database) == before
    assert _later_model(model_diff(database)) == (
        {"transports.fa_flight_id"},
        {
            "trip_drafts",
            "trip_draft_legs",
            "trip_draft_proposals",
            "town_stamp_wallets",
            "town_stamp_receipts",
            "town_stamp_entitlements",
            "town_room_layouts",
        },
    )


@pytest.mark.parametrize(
    ("statement", "label"),
    [
        (
            "UPDATE habits SET building_style = 'castle' WHERE id = :habit",
            "habits building_style",
        ),
        ("UPDATE habits SET per_week = 0 WHERE id = :habit", "habits per_week"),
        ("UPDATE habits SET per_week = 8 WHERE id = :habit", "habits per_week"),
        ("UPDATE habits SET slot = -1 WHERE id = :habit", "habits slot"),
        ("UPDATE habits SET slot = 6 WHERE id = :habit", "habits slot"),
        ("UPDATE habits SET name = '' WHERE id = :habit", "habits name"),
        ("UPDATE habits SET name = :long WHERE id = :habit", "habits name"),
        ("UPDATE habits SET name_key = '' WHERE id = :habit", "habits name_key"),
        ("UPDATE habits SET name_key = :long WHERE id = :habit", "habits name_key"),
        (
            "UPDATE habit_cadences SET per_week = 0 WHERE id = :cadence",
            "habit_cadences per_week",
        ),
        (
            "UPDATE habit_cadences SET per_week = 8 WHERE id = :cadence",
            "habit_cadences per_week",
        ),
        (
            "INSERT INTO habit_checkins (habit_id, user_id, day, created_at) "
            "VALUES (:habit, :other, '2026-10-02', '2026-10-02T00:00:00+00:00')",
            "habit_checkins owner does not match its habit",
        ),
        (
            "INSERT INTO habit_cadences (habit_id, user_id, per_week, effective_from, created_at) "
            "VALUES (:habit, :other, 3, '2026-10-12', '2026-10-02T00:00:00+00:00')",
            "habit_cadences owner does not match its habit",
        ),
        (
            "INSERT INTO habit_checkins (habit_id, user_id, day, created_at) "
            "VALUES (999, :owner, '2026-10-03', '2026-10-03T00:00:00+00:00')",
            "habit_checkins habit is missing",
        ),
        (
            "INSERT INTO habit_cadences (habit_id, user_id, per_week, effective_from, created_at) "
            "VALUES (999, :owner, 3, '2026-10-19', '2026-10-03T00:00:00+00:00')",
            "habit_cadences habit is missing",
        ),
    ],
)
def test_preflight_fails_without_changing_rows(tmp_path: Path, statement: str, label: str) -> None:
    database, ids = _parent_with_seed(tmp_path)
    params = {**ids, "long": "x" * 41}
    with sqlite3.connect(database) as db:
        db.execute("PRAGMA foreign_keys=OFF")
        db.execute(statement, params)
        db.commit()
    before = _snapshot(database)
    with pytest.raises(RuntimeError, match=label):
        _upgrade_to(database, REVISION)
    assert current_revision(database) == PARENT
    assert _snapshot(database) == before
    with sqlite3.connect(database) as db:
        leftovers = db.execute("SELECT name FROM sqlite_master WHERE name LIKE '_new_%'").fetchall()
    assert leftovers == []


def test_database_rejects_cross_owner_children_and_invalid_values(tmp_path: Path) -> None:
    database, ids = _parent_with_seed(tmp_path)
    _upgrade_to(database, REVISION)
    with sqlite3.connect(database) as db:
        db.execute("PRAGMA foreign_keys=ON")
        rejected = (
            (
                "INSERT INTO habit_checkins (habit_id, user_id, day, created_at) "
                "VALUES (?, ?, '2026-10-02', '2026-10-02T00:00:00+00:00')",
                (ids["habit"], ids["other"]),
            ),
            (
                "INSERT INTO habit_cadences (habit_id, user_id, per_week, effective_from, created_at) "
                "VALUES (?, ?, 3, '2026-10-12', '2026-10-02T00:00:00+00:00')",
                (ids["habit"], ids["other"]),
            ),
            (
                "UPDATE habits SET building_style = 'castle' WHERE id = ?",
                (ids["habit"],),
            ),
            ("UPDATE habits SET per_week = 0 WHERE id = ?", (ids["habit"],)),
            ("UPDATE habits SET per_week = 8 WHERE id = ?", (ids["habit"],)),
            ("UPDATE habits SET slot = 6 WHERE id = ?", (ids["habit"],)),
            ("UPDATE habits SET name = '' WHERE id = ?", (ids["habit"],)),
            ("UPDATE habits SET name = ? WHERE id = ?", ("y" * 41, ids["habit"])),
            ("UPDATE habits SET name_key = '' WHERE id = ?", (ids["habit"],)),
            ("UPDATE habit_cadences SET per_week = 9 WHERE id = ?", (ids["cadence"],)),
        )
        for sql, params in rejected:
            with pytest.raises(sqlite3.IntegrityError):
                db.execute(sql, params)
        db.execute(
            "INSERT INTO habit_checkins (habit_id, user_id, day, created_at) "
            "VALUES (?, ?, '2026-10-02', '2026-10-02T00:00:00+00:00')",
            (ids["second"], ids["other"]),
        )
        assert db.execute("PRAGMA foreign_key_check").fetchall() == []


def test_habit_delete_is_restricted_until_children_are_gone(tmp_path: Path) -> None:
    database, ids = _parent_with_seed(tmp_path)
    _upgrade_to(database, REVISION)
    with sqlite3.connect(database) as db:
        db.execute("PRAGMA foreign_keys=ON")
        with pytest.raises(sqlite3.IntegrityError):
            db.execute("DELETE FROM habits WHERE id = ?", (ids["habit"],))
        db.execute("DELETE FROM habit_checkins WHERE habit_id = ?", (ids["habit"],))
        with pytest.raises(sqlite3.IntegrityError):
            db.execute("DELETE FROM habits WHERE id = ?", (ids["habit"],))
        db.execute("DELETE FROM habit_cadences WHERE habit_id = ?", (ids["habit"],))
        db.execute("DELETE FROM habits WHERE id = ?", (ids["habit"],))
        assert db.execute(
            "SELECT COUNT(*) FROM habits WHERE id = ?", (ids["habit"],)
        ).fetchone() == (0,)
        assert db.execute(
            "SELECT COUNT(*) FROM habits WHERE id = ?", (ids["second"],)
        ).fetchone() == (1,)


def test_account_delete_removes_ordered_owner_rows(tmp_path: Path) -> None:
    database, _ids = _parent_with_seed(tmp_path)
    _upgrade_to(database, "head")
    opened = open_database(f"sqlite:///{database}")
    db: Session = opened.sessionmaker()
    try:
        kept = User(
            email="kept@example.invalid",
            display_name="Kept",
            role=UserRole.user,
            username="kept",
            is_active=True,
            must_change_password=False,
        )
        removed = User(
            email="removed@example.invalid",
            display_name="Removed",
            role=UserRole.user,
            username="removed",
            is_active=True,
            must_change_password=False,
        )
        db.add_all([kept, removed])
        db.commit()
        for user_id, slot, name in (
            (kept.id, 2, "Kept habit"),
            (removed.id, 3, "Removed habit"),
        ):
            db.execute(
                text(
                    "INSERT INTO habits (user_id, name, slot, building_style, per_week, "
                    "created_on, created_at, name_key) VALUES "
                    "(:user_id, :name, :slot, 'cottage', 3, '2026-04-01', "
                    "'2026-04-01T00:00:00+00:00', :key)"
                ),
                {"user_id": user_id, "name": name, "slot": slot, "key": name.casefold()},
            )
            habit_id = int(db.execute(text("SELECT last_insert_rowid()")).scalar_one())
            db.execute(
                text(
                    "INSERT INTO habit_checkins (habit_id, user_id, day, created_at) "
                    "VALUES (:habit_id, :user_id, '2026-04-01', '2026-04-01T00:00:00+00:00')"
                ),
                {"habit_id": habit_id, "user_id": user_id},
            )
            db.execute(
                text(
                    "INSERT INTO habit_cadences (habit_id, user_id, per_week, effective_from, "
                    "created_at) VALUES (:habit_id, :user_id, 3, '2026-04-06', "
                    "'2026-04-01T00:00:00+00:00')"
                ),
                {"habit_id": habit_id, "user_id": user_id},
            )
        db.commit()
        delete_user_account(db, removed, actor_user_id=kept.id)
        db.commit()
        for table in TABLES:
            assert (
                db.execute(
                    text(f'SELECT COUNT(*) FROM "{table}" WHERE user_id = :owner'),
                    {"owner": removed.id},
                ).scalar_one()
                == 0
            )
            assert (
                db.execute(
                    text(f'SELECT COUNT(*) FROM "{table}" WHERE user_id = :owner'),
                    {"owner": kept.id},
                ).scalar_one()
                == 1
            )
        assert db.execute(text("PRAGMA foreign_key_check")).all() == []
    finally:
        db.close()
        opened.engine.dispose()


def test_upgraded_api_stays_scoped_and_keeps_validation_errors(tmp_path: Path, monkeypatch) -> None:
    _quiet(monkeypatch)
    database_path = tmp_path / "site.db"
    _upgrade_to(database_path, "head")
    with sqlite3.connect(database_path) as db:
        owner = _insert_user(db, "api-owner@example.invalid", "Api")
        db.commit()
    url = f"sqlite:///{database_path}"
    opened = open_database(url)
    application = create_app(
        Settings(database_url=url, release="test", web_root=tmp_path / "web", openapi=False),
        Dependencies(
            database=opened,
            check_schema=False,
            check_frontend=False,
        ),
    )
    application.dependency_overrides[get_town_clock] = lambda: CLOCK
    application.dependency_overrides[get_current_user] = lambda: SimpleNamespace(id=owner)
    try:
        with TestClient(application) as client:
            created = client.post(
                "/api/town/habits",
                params={"tz": "America/Los_Angeles"},
                json={"name": "Morning", "slot": 0, "per_week": 7},
            )
            assert created.status_code == 201, created.text
            habit_id = created.json()["id"]
            checked = client.post(
                f"/api/town/habits/{habit_id}/checkins",
                params={"tz": "America/Los_Angeles"},
                json={"day": "2026-10-29"},
            )
            assert checked.status_code == 201, checked.text
            rejected = client.post(
                "/api/town/habits",
                params={"tz": "America/Los_Angeles"},
                json={"name": "Castle", "slot": 1, "per_week": 7, "building_style": "castle"},
            )
            assert rejected.status_code == 422
            assert rejected.json()["field_errors"] == {
                "building_style": "building_style must be one of the town styles"
            }
            application.dependency_overrides[get_current_user] = lambda: SimpleNamespace(
                id=owner + 1
            )
            foreign = client.post(
                f"/api/town/habits/{habit_id}/checkins",
                params={"tz": "America/Los_Angeles"},
                json={"day": "2026-10-29"},
            )
            assert foreign.status_code == 404
            assert foreign.json()["code"] == "habit_not_found"
        with sqlite3.connect(database_path) as db:
            db.execute("PRAGMA foreign_keys=ON")
            with pytest.raises(sqlite3.IntegrityError):
                db.execute(
                    "INSERT INTO habit_checkins (habit_id, user_id, day, created_at) "
                    "VALUES (?, ?, '2026-10-28', '2026-10-28T00:00:00+00:00')",
                    (habit_id, owner + 1),
                )
            assert db.execute(
                "SELECT user_id FROM habit_checkins WHERE habit_id = ?",
                (habit_id,),
            ).fetchall() == [(owner,)]
    finally:
        opened.engine.dispose()


def test_offline_plan_does_not_rewrite_town_rows(tmp_path: Path) -> None:
    from io import StringIO

    plan = StringIO()
    config = _cfg(tmp_path / "plan.db")
    config.stdout = plan
    command.upgrade(config, f"{PARENT}:{REVISION}", sql=True)
    sql = plan.getvalue()
    assert "site_town_ownership_v1 preflight failed" not in sql
    assert "SELECT CASE WHEN EXISTS" in sql
    assert "THEN 1/0 ELSE 1 END" in sql
    for table in TABLES:
        assert f"DELETE FROM {table}" not in sql
        assert f'DELETE FROM "{table}"' not in sql
        assert f"UPDATE {table}" not in sql
        assert f'UPDATE "{table}"' not in sql
    assert "fk_habit_checkins_owner" in sql
    assert "uq_habits_id_user" in sql


def test_check_text_matches_the_accepted_stored_representation() -> None:
    assert tuple(dict.fromkeys(SLOT_DEFAULT_STYLE)) == ("forge", "garden", "cottage")
    assert len(LOT_UNLOCK_LV) == 6
    assert HABIT_NAME_MAX == 40
    assert CHECKS["ck_habits_building_style"] == (
        "building_style IN ('forge', 'garden', 'cottage')"
    )
    assert "BETWEEN 1 AND 7" in CHECKS["ck_habits_per_week"]
    assert "BETWEEN 0 AND 5" in CHECKS["ck_habits_slot"]
    assert "BETWEEN 1 AND 40" in CHECKS["ck_habits_name"]
    assert "BETWEEN 1 AND 40" in CHECKS["ck_habits_name_key"]
