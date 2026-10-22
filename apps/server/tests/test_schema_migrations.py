import os
from pathlib import Path
import sqlite3
import sys

import pytest
from sqlalchemy import Column, Integer, Table, create_engine, text

sys.path.insert(0, str(Path(__file__).resolve().parents[3]))
from alembic import command
from apps.server.migrations import (
    adopt_or_upgrade,
    check_drift,
    current_revision,
    head_revision,
    make_config,
    schema_signature,
    sqlite_url,
    table_names,
)
from apps.server.schema import VERSION, assert_ready, metadata


def legacy_site_database(path: Path) -> None:
    """A database shaped the way production was built before site revisions existed."""
    engine = create_engine(sqlite_url(path))
    metadata().create_all(engine)
    with engine.begin() as connection:
        connection.execute(text("INSERT INTO site_schema (id, version) VALUES (1, 1)"))
        connection.execute(text("INSERT INTO alembic_version (version_num) VALUES ('e0f6a2b3c4d5')"))
        connection.execute(text(
            "INSERT INTO users (email, display_name, role, is_active, must_change_password, created_at, updated_at) "
            "VALUES ('keeper@example.invalid', 'Keeper', 'user', 1, 0, '2026-01-01', '2026-01-01')"
        ))
        connection.execute(text(
            "INSERT INTO trips (user_id, title, start_date, end_date, status, counts_as_pto, created_at, updated_at) "
            "VALUES (1, 'Keep me', '2026-01-01', '2026-01-02', 'planning', 1, '2026-01-01', '2026-01-01')"
        ))
    engine.dispose()
    with sqlite3.connect(path) as db:
        assert db.execute("PRAGMA journal_mode=WAL").fetchone()[0] == "wal"


def dump_rows(path: Path) -> dict:
    with sqlite3.connect(path) as db:
        names = [
            row[0] for row in db.execute(
                "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' "
                "AND name != 'site_alembic_version' ORDER BY name"
            )
        ]
        dumped = {}
        for name in names:
            columns = [row[1] for row in db.execute(f'PRAGMA table_info("{name}")')]
            quoted = ",".join(f'"{column}"' for column in columns)
            dumped[name] = db.execute(f'SELECT {quoted} FROM "{name}" ORDER BY {quoted}').fetchall()
    return dumped


def test_empty_database_is_created_by_migrations(tmp_path):
    database = tmp_path / "site.db"
    assert adopt_or_upgrade(sqlite_url(database)) == "upgraded"
    assert database.stat().st_mode & 0o777 == 0o600
    with sqlite3.connect(database) as db:
        assert db.execute("PRAGMA journal_mode").fetchone()[0] == "wal"
        assert db.execute("PRAGMA integrity_check").fetchone() == ("ok",)
        assert db.execute("SELECT version FROM site_schema WHERE id=1").fetchone() == (VERSION,)
        assert db.execute("SELECT version_num FROM alembic_version").fetchone() == ("e0f6a2b3c4d5",)
        assert db.execute("SELECT version_num FROM site_alembic_version").fetchone() == (head_revision(),)
        assert any(row[2] == "users" for row in db.execute("PRAGMA foreign_key_list(trips)"))
        assert "auth_recovery_wrapped_private_key_b64" in {row[1] for row in db.execute("PRAGMA table_info(users)")}
        assert "recovery_wrapped_dek_b64" in {row[1] for row in db.execute("PRAGMA table_info(user_vaults)")}
    engine = create_engine(sqlite_url(database))
    with engine.connect() as connection:
        assert_ready(connection)
    engine.dispose()
    assert adopt_or_upgrade(sqlite_url(database)) == "current"


def test_existing_v1_database_is_stamped_without_data_changes(tmp_path):
    database = tmp_path / "site.db"
    legacy_site_database(database)
    before_schema = schema_signature(database)
    before_rows = dump_rows(database)
    before_tables = table_names(database)
    assert adopt_or_upgrade(sqlite_url(database)) == "stamped"
    assert schema_signature(database) == before_schema
    assert dump_rows(database) == before_rows
    assert table_names(database) - before_tables == {"site_alembic_version"}
    assert current_revision(database) == head_revision()
    with sqlite3.connect(database) as db:
        assert db.execute("SELECT title FROM trips").fetchone() == ("Keep me",)
        assert db.execute("PRAGMA foreign_key_check").fetchall() == []
    assert adopt_or_upgrade(sqlite_url(database)) == "current"


def test_stamp_refuses_a_database_that_does_not_match_the_baseline(tmp_path):
    database = tmp_path / "site.db"
    legacy_site_database(database)
    with sqlite3.connect(database) as db:
        db.execute("ALTER TABLE users ADD COLUMN unexpected TEXT")
        db.execute("UPDATE users SET unexpected='keep'")
    with pytest.raises(RuntimeError, match="Refusing to stamp"):
        adopt_or_upgrade(sqlite_url(database))
    assert current_revision(database) is None
    with sqlite3.connect(database) as db:
        assert db.execute("SELECT unexpected FROM users").fetchone() == ("keep",)
        assert "site_alembic_version" not in table_names(database)


def test_stamp_refuses_an_unexpected_site_schema_version(tmp_path):
    database = tmp_path / "site.db"
    legacy_site_database(database)
    with sqlite3.connect(database) as db:
        db.execute("UPDATE site_schema SET version=9")
    with pytest.raises(RuntimeError, match="refusing to adopt"):
        adopt_or_upgrade(sqlite_url(database))
    assert current_revision(database) is None


def test_relative_database_url_is_rejected(tmp_path):
    with pytest.raises(RuntimeError, match="absolute"):
        adopt_or_upgrade("sqlite:///relative.db")


def test_require_existing_does_not_create_a_database(tmp_path):
    database = tmp_path / "missing.db"
    with pytest.raises(RuntimeError, match="missing"):
        adopt_or_upgrade(sqlite_url(database), require_existing=True)
    assert not database.exists()


def test_autogenerate_reports_no_drift():
    check_drift()


def test_drift_check_fails_when_a_model_is_added(monkeypatch):
    from apps.server import schema as site_schema

    original = site_schema.metadata

    def extra():
        copied = original()
        Table("drift_marker", copied, Column("id", Integer, primary_key=True))
        return copied

    monkeypatch.setattr(site_schema, "metadata", extra)
    with pytest.raises(SystemExit, match="drift"):
        check_drift()


def test_failed_revision_rolls_back_instead_of_half_applying(tmp_path):
    database = tmp_path / "site.db"
    url = sqlite_url(database)
    adopt_or_upgrade(url)
    with sqlite3.connect(database) as db:
        db.execute(
            "INSERT INTO users (email, display_name, role, is_active, must_change_password, created_at, updated_at) "
            "VALUES ('a@b.c', 'A', 'user', 1, 0, '2026-01-01', '2026-01-01')"
        )
    before = dump_rows(database)
    extra = tmp_path / "versions"
    extra.mkdir()
    (extra / "boom_break.py").write_text(
        'revision = "boom00000001"\n'
        'down_revision = "site_schema_v1"\n'
        "branch_labels = None\ndepends_on = None\n"
        "from alembic import op\n"
        "def upgrade():\n"
        "    op.execute('CREATE TABLE half_applied (id INTEGER PRIMARY KEY)')\n"
        "    op.execute('INSERT INTO half_applied (id) VALUES (1)')\n"
        "    raise RuntimeError('intentional migration failure')\n"
        "def downgrade():\n"
        "    pass\n"
    )
    cfg = make_config(url)
    real_versions = Path(__file__).resolve().parents[1] / "alembic" / "versions"
    cfg.set_main_option("version_path_separator", "os")
    cfg.set_main_option("version_locations", os.pathsep.join((str(real_versions), str(extra))))
    with pytest.raises(Exception, match="intentional migration failure"):
        command.upgrade(cfg, "head")
    assert "half_applied" not in table_names(database)
    assert current_revision(database) == "site_schema_v1"
    assert dump_rows(database) == before


def test_backup_hook_runs_before_stamp_and_failure_leaves_the_database(tmp_path, monkeypatch):
    database = tmp_path / "site.db"
    legacy_site_database(database)
    backups = tmp_path / "backups"
    monkeypatch.setenv("SITE_BACKUP_DIR", str(backups))
    monkeypatch.setenv("SITE_BACKUP_KEEP", "1")
    assert adopt_or_upgrade(sqlite_url(database)) == "stamped"
    snapshot = next(backups.glob("site-*.db"))
    with sqlite3.connect(snapshot) as db:
        names = {row[0] for row in db.execute("SELECT name FROM sqlite_master WHERE type='table'")}
        assert "site_alembic_version" not in names
        assert db.execute("SELECT title FROM trips").fetchone() == ("Keep me",)

    adoptable = tmp_path / "adoptable.db"
    legacy_site_database(adoptable)
    monkeypatch.setenv("SITE_BACKUP_DIR", str(tmp_path / "blocked"))

    def fail_backup(*_args, **_kwargs):
        raise RuntimeError("disk full")

    import apps.server.migrations as migrations

    monkeypatch.setattr(migrations, "_load_backup", lambda: type("Tool", (), {"backup": staticmethod(fail_backup)})())
    with pytest.raises(RuntimeError, match="disk full"):
        adopt_or_upgrade(sqlite_url(adoptable))
    assert current_revision(adoptable) is None
