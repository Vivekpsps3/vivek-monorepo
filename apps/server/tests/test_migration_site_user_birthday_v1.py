"""Birthday schema migration site_user_birthday_v1."""

import sqlite3
from pathlib import Path

from alembic import command

from apps.server.migrations import current_revision, make_config, model_diff, sqlite_url

PREVIOUS = "site_town_v1"
REVISION = "site_user_birthday_v1"
COMPATIBLE_HEADS = {
    "site_schema_v1",
    "site_auth_challenge_purpose_v2",
    "site_trip_pto_days_v1",
    "site_media_membership_v1",
    "site_media_progress_v1",
    "site_catalog_title_sort_v1",
    "site_trip_create_attempt_v1",
    "site_town_v1",
}
INDEX = "ix_episode_progress_user_watched_on"


def _upgrade_to(database: Path, revision: str) -> None:
    command.upgrade(make_config(sqlite_url(database)), revision)


def _index_names(db: sqlite3.Connection, table: str) -> set[str]:
    return {row[1] for row in db.execute(f'PRAGMA index_list("{table}")')}


def _columns(db: sqlite3.Connection, table: str) -> dict[str, tuple]:
    return {row[1]: row for row in db.execute(f'PRAGMA table_info("{table}")')}


def test_index_is_missing_on_the_previous_head(tmp_path: Path) -> None:
    database = tmp_path / "site.db"
    _upgrade_to(database, PREVIOUS)
    assert current_revision(database) == PREVIOUS
    with sqlite3.connect(database) as db:
        assert INDEX not in _index_names(db, "episode_progress")
        assert "birthday" not in _columns(db, "users")
        assert "pixels_show_age" not in _columns(db, "users")


def test_upgrade_adds_columns_index_and_compatibility_rows(tmp_path: Path) -> None:
    database = tmp_path / "site.db"
    _upgrade_to(database, PREVIOUS)
    with sqlite3.connect(database) as db:
        db.execute(
            "INSERT INTO users (email, display_name, role, is_active, must_change_password, "
            "created_at, updated_at) VALUES "
            "('kept@example.invalid', 'Kept', 'user', 1, 0, '2026-01-01', '2026-01-01')"
        )
        db.commit()
    _upgrade_to(database, "head")
    assert current_revision(database) == REVISION
    assert model_diff(database) == []
    with sqlite3.connect(database) as db:
        columns = _columns(db, "users")
        birthday = columns["birthday"]
        show_age = columns["pixels_show_age"]
        assert birthday[2].upper() == "DATE"
        assert birthday[3] == 0
        assert birthday[4] is None
        assert show_age[2].upper() == "BOOLEAN"
        assert show_age[3] == 1
        assert str(show_age[4]) in {"0", "'0'"}
        assert db.execute("SELECT email, birthday, pixels_show_age FROM users").fetchone() == (
            "kept@example.invalid",
            None,
            0,
        )
        info = db.execute(f'PRAGMA index_info("{INDEX}")').fetchall()
        assert [row[2] for row in info] == ["user_id", "watched_on"]
        assert INDEX in _index_names(db, "episode_progress")
        heads = {
            row[0]
            for row in db.execute(
                "SELECT compatible_head FROM site_revision_compatibility WHERE revision = ?",
                (REVISION,),
            )
        }
        assert heads == COMPATIBLE_HEADS
        assert len(heads) == 8
        assert "habits" in {
            row[0] for row in db.execute("SELECT name FROM sqlite_master WHERE type = 'table'")
        }


def test_downgrade_drops_only_this_revision_and_upgrade_again(tmp_path: Path) -> None:
    database = tmp_path / "site.db"
    _upgrade_to(database, "head")
    config = make_config(sqlite_url(database))
    command.downgrade(config, "-1")
    assert current_revision(database) == PREVIOUS
    with sqlite3.connect(database) as db:
        columns = _columns(db, "users")
        assert "birthday" not in columns
        assert "pixels_show_age" not in columns
        assert INDEX not in _index_names(db, "episode_progress")
        assert db.execute(
            "SELECT COUNT(*) FROM site_revision_compatibility WHERE revision = ?",
            (REVISION,),
        ).fetchone() == (0,)
        assert "habits" in {
            row[0] for row in db.execute("SELECT name FROM sqlite_master WHERE type = 'table'")
        }
        assert "ix_habit_checkins_user_day" in _index_names(db, "habit_checkins")
    command.upgrade(config, "head")
    assert current_revision(database) == REVISION
    assert model_diff(database) == []
    with sqlite3.connect(database) as db:
        assert "birthday" in _columns(db, "users")
        assert INDEX in _index_names(db, "episode_progress")
