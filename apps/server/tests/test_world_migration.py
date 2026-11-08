"""site_world_v1 migration contract (L1a), modelled on the Town migration."""

import sqlite3
from pathlib import Path

import pytest
from alembic import command
from sqlalchemy import text

from apps.server.database import open_database
from apps.server.identity.admin import delete_user_account
from apps.server.identity.models import User, UserRole
from apps.server.migrate import check_integrity
from apps.server.migrations import make_config
from apps.server.schema import OWNER_TABLES, metadata

PREVIOUS = "site_leave_buckets_v1"
REVISION = "site_world_v1"
COMPATIBLE_HEADS = {
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
}


def _heads(config) -> list[str]:
    from alembic.script import ScriptDirectory

    return ScriptDirectory.from_config(config).get_heads()


def _upgrade(tmp_path: Path, target: str = REVISION) -> Path:
    database = tmp_path / "world-migration.db"
    config = make_config(f"sqlite:///{database}")
    command.upgrade(config, target)
    return database


def _insert_user(db: sqlite3.Connection, user_id: int = 1) -> None:
    db.execute(
        "INSERT INTO users (id, email, display_name, role, is_active, "
        "must_change_password, created_at, updated_at) "
        "VALUES (?, ?, ?, 'user', 1, 0, '2026-01-01', '2026-01-01')",
        (user_id, f"user{user_id}@example.invalid", f"User {user_id}"),
    )


def _insert_concept(
    db: sqlite3.Connection,
    user_id: int,
    name: str,
    key: str,
    archived_at: str | None = None,
) -> None:
    db.execute(
        "INSERT INTO world_concepts (user_id, name, name_key, note, source, "
        "understood_on, archived_at, created_at, updated_at) "
        "VALUES (?, ?, ?, NULL, NULL, '2026-10-14', ?, "
        "'2026-10-01T00:00:00+00:00', '2026-10-01T00:00:00+00:00')",
        (user_id, name, key, archived_at),
    )


def test_leave_carry_forward_is_the_only_head(tmp_path) -> None:
    database = tmp_path / "heads.db"
    config = make_config(f"sqlite:///{database}")
    assert _heads(config) == ["site_leave_carry_v1"]


def test_world_concepts_registered_in_unified_schema() -> None:
    assert "world_concepts" in OWNER_TABLES
    assert "world_concepts" in metadata().tables


def test_upgrade_creates_world_concepts_and_allows_downgrade(tmp_path) -> None:
    database = _upgrade(tmp_path)
    with sqlite3.connect(database) as db:
        columns = {row[1]: row[2] for row in db.execute("PRAGMA table_info(world_concepts)")}
        indexes = {row[1] for row in db.execute("PRAGMA index_list(world_concepts)")}
        compatible = {
            row[0]
            for row in db.execute(
                "SELECT compatible_head FROM site_revision_compatibility WHERE revision = ?",
                (REVISION,),
            )
        }
        assert columns == {
            "id": "INTEGER",
            "user_id": "INTEGER",
            "name": "VARCHAR(80)",
            "name_key": "VARCHAR(120)",
            "note": "TEXT",
            "source": "VARCHAR(500)",
            "understood_on": "DATE",
            "archived_at": "DATETIME",
            "created_at": "DATETIME",
            "updated_at": "DATETIME",
        }
        assert indexes >= {
            "ix_world_concepts_user_id",
            "ix_world_concepts_user_understood",
            "uq_world_concepts_active_name",
        }
        assert compatible == COMPATIBLE_HEADS

    config = make_config(f"sqlite:///{database}")
    command.downgrade(config, PREVIOUS)
    with sqlite3.connect(database) as db:
        assert (
            db.execute(
                "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'world_concepts'"
            ).fetchone()
            is None
        )
        assert db.execute(
            "SELECT COUNT(*) FROM site_revision_compatibility WHERE revision = ?",
            (REVISION,),
        ).fetchone() == (0,)
    command.upgrade(config, REVISION)
    command.downgrade(config, PREVIOUS)
    command.upgrade(config, REVISION)
    with sqlite3.connect(database) as db:
        db.execute("PRAGMA foreign_keys=ON")
        check_integrity(db)  # raises on any integrity / FK violation


def test_migrated_schema_enforces_owner_fk_and_active_name_uniqueness(tmp_path) -> None:
    database = _upgrade(tmp_path)
    with sqlite3.connect(database) as db:
        db.execute("PRAGMA foreign_keys=ON")
        assert db.execute("PRAGMA foreign_keys").fetchone() == (1,)
        _insert_user(db)
        with pytest.raises(sqlite3.IntegrityError):
            _insert_concept(db, 999, "Concept A", "concept a")
    with sqlite3.connect(database) as db:
        db.execute("PRAGMA foreign_keys=ON")
        _insert_concept(db, 1, "Concept A", "concept a")
        with pytest.raises(sqlite3.IntegrityError):
            _insert_concept(db, 1, "Concept A", "concept a")
        # An archived row does not block the name.
        db.execute("UPDATE world_concepts SET archived_at = '2026-10-20T00:00:00+00:00'")
        _insert_concept(db, 1, "concept a", "concept a")


def test_delete_user_account_removes_world_concepts_for_that_user_only(
    tmp_path: Path,
) -> None:
    database = _upgrade(tmp_path)
    config = make_config(f"sqlite:///{database}")
    command.upgrade(config, "head")
    opened = open_database(f"sqlite:///{database}")
    db = opened.sessionmaker()
    try:
        kept = User(
            email="kept@example.invalid",
            display_name="Kept",
            role=UserRole.user,
            username="kept",
        )
        gone = User(
            email="gone@example.invalid",
            display_name="Gone",
            role=UserRole.user,
            username="gone",
        )
        db.add_all([kept, gone])
        db.flush()
        kept_id, gone_id = kept.id, gone.id
        for user_id, name in ((kept_id, "Concept A"), (gone_id, "Concept A")):
            db.execute(
                text(
                    "INSERT INTO world_concepts (user_id, name, name_key, "
                    "understood_on, created_at, updated_at) VALUES "
                    "(:user_id, :name, :key, '2026-10-14', "
                    "'2026-10-01T00:00:00+00:00', '2026-10-01T00:00:00+00:00')"
                ),
                {"user_id": user_id, "name": name, "key": name.casefold()},
            )
        db.commit()

        delete_user_account(db, gone, actor_user_id=kept_id)
        db.commit()

        assert (
            db.execute(
                text("SELECT COUNT(*) FROM world_concepts WHERE user_id = :u"),
                {"u": gone_id},
            ).scalar_one()
            == 0
        )
        assert (
            db.execute(
                text("SELECT COUNT(*) FROM world_concepts WHERE user_id = :u"),
                {"u": kept_id},
            ).scalar_one()
            == 1
        )
    finally:
        db.close()
