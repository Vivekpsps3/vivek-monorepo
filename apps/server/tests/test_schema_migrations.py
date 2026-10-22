import os
from pathlib import Path
import sqlite3
import sys
import threading
import time

import pytest
from sqlalchemy import Column, Integer, Table, create_engine, text

sys.path.insert(0, str(Path(__file__).resolve().parents[3]))
from alembic import command
from apps.server.migrations import (
    adopt_or_upgrade,
    check_drift,
    connect,
    current_revision,
    database_path,
    head_revision,
    make_config,
    model_diff,
    plan,
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
    snapshot = next(backups.glob("premigrate-*.db"))
    manifest = __import__("json").loads(snapshot.with_suffix(".json").read_text())
    assert manifest["kind"] == "premigrate"
    assert manifest["revision"] == "none"
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


def test_require_existing_refuses_a_zero_byte_database(tmp_path):
    database = tmp_path / "site.db"
    database.write_bytes(b"")
    with pytest.raises(RuntimeError, match="empty"):
        adopt_or_upgrade(sqlite_url(database), require_existing=True)
    assert database.read_bytes() == b""
    assert current_revision(database) is None


def test_stamp_refuses_a_missing_finance_revision_marker(tmp_path):
    database = tmp_path / "site.db"
    legacy_site_database(database)
    with sqlite3.connect(database) as db:
        db.execute("DELETE FROM alembic_version")
    with pytest.raises(RuntimeError, match="alembic_version"):
        adopt_or_upgrade(sqlite_url(database))
    assert current_revision(database) is None
    assert "site_alembic_version" not in table_names(database)


def test_empty_version_table_is_refused(tmp_path):
    database = tmp_path / "site.db"
    adopt_or_upgrade(sqlite_url(database))
    with sqlite3.connect(database) as db:
        db.execute("DELETE FROM site_alembic_version")
    with pytest.raises(RuntimeError, match="present but has no revision"):
        adopt_or_upgrade(sqlite_url(database))
    with sqlite3.connect(database) as db:
        assert db.execute("SELECT COUNT(*) FROM site_alembic_version").fetchone() == (0,)
        assert db.execute("SELECT version FROM site_schema WHERE id=1").fetchone() == (VERSION,)


def test_plan_refuses_a_foreign_key_violation_without_writing(tmp_path, capsys, monkeypatch):
    database = tmp_path / "site.db"
    legacy_site_database(database)
    with sqlite3.connect(database) as db:
        db.execute("PRAGMA foreign_keys=OFF")
        db.execute(
            "INSERT INTO trips (user_id, title, start_date, end_date, status, counts_as_pto, created_at, updated_at) "
            "VALUES (42, 'orphan', '2026-01-01', '2026-01-02', 'planning', 1, '2026-01-01', '2026-01-01')"
        )
    before = database.read_bytes()
    assert plan(sqlite_url(database), require_existing=True) == 1
    assert database.read_bytes() == before
    refused = capsys.readouterr().out
    assert '"action": "refuse"' in refused
    assert "foreign_key_check failed; refusing to stamp" in refused
    assert "INSERT INTO site_alembic_version" not in refused

    fresh = tmp_path / "managed.db"
    adopt_or_upgrade(sqlite_url(fresh))
    with sqlite3.connect(fresh) as db:
        db.execute("PRAGMA foreign_keys=OFF")
        db.execute(
            "INSERT INTO trips (user_id, title, start_date, end_date, status, counts_as_pto, created_at, updated_at) "
            "VALUES (42, 'orphan', '2026-01-01', '2026-01-02', 'planning', 1, '2026-01-01', '2026-01-01')"
        )
    monkeypatch.setattr("apps.server.migrations.head_revision", lambda: "site_schema_v2")
    assert plan(sqlite_url(fresh)) == 1
    upgrade_refused = capsys.readouterr().out
    assert "foreign_key_check failed; refusing to upgrade" in upgrade_refused
    assert current_revision(fresh) == "site_schema_v1"


def test_noop_upgrade_does_not_take_or_rotate_premigrate_backups(tmp_path, monkeypatch):
    database = tmp_path / "site.db"
    backups = tmp_path / "backups"
    monkeypatch.setenv("SITE_BACKUP_DIR", str(backups))
    assert adopt_or_upgrade(sqlite_url(database)) == "upgraded"
    assert list(backups.glob("premigrate-*.db")) == []
    legacy = tmp_path / "legacy.db"
    legacy_site_database(legacy)
    assert adopt_or_upgrade(sqlite_url(legacy)) == "stamped"
    taken = sorted(backups.glob("premigrate-*.db"))
    assert len(taken) == 1
    assert adopt_or_upgrade(sqlite_url(legacy)) == "current"
    assert adopt_or_upgrade(sqlite_url(legacy)) == "current"
    assert sorted(backups.glob("premigrate-*.db")) == taken


def test_plan_prints_sql_without_writing(tmp_path, capsys):
    missing = tmp_path / "new.db"
    assert plan(sqlite_url(missing)) == 0
    assert not missing.exists()
    created = capsys.readouterr().out
    assert '"action": "upgrade"' in created
    assert "CREATE TABLE users" in created

    database = tmp_path / "site.db"
    legacy_site_database(database)
    signature = schema_signature(database)
    mode = database.stat().st_mode
    assert plan(sqlite_url(database)) == 0
    assert schema_signature(database) == signature
    assert database.stat().st_mode == mode
    assert current_revision(database) is None
    stamped = capsys.readouterr().out
    assert '"action": "stamp"' in stamped
    assert "INSERT INTO site_alembic_version" in stamped
    assert "CREATE TABLE users" not in stamped

    database.write_bytes(b"")
    assert plan(sqlite_url(database), require_existing=True) == 1
    assert database.read_bytes() == b""
    refused = capsys.readouterr().out
    assert '"action": "refuse"' in refused


def test_baseline_downgrade_is_refused(tmp_path):
    database = tmp_path / "site.db"
    url = sqlite_url(database)
    adopt_or_upgrade(url)
    with pytest.raises(NotImplementedError, match="not reversible"):
        command.downgrade(make_config(url), "base")
    assert current_revision(database) == head_revision()
    assert "users" in table_names(database)
    with sqlite3.connect(database) as db:
        assert db.execute("SELECT COUNT(*) FROM site_schema").fetchone() == (1,)


def _apply_extra(database: Path, source: str, rev_id: str):
    extra = database.parent / f"versions-{rev_id}"
    extra.mkdir()
    (extra / f"{rev_id}.py").write_text(source)
    cfg = make_config(sqlite_url(database))
    real_versions = Path(__file__).resolve().parents[1] / "alembic" / "versions"
    cfg.set_main_option("version_path_separator", "os")
    cfg.set_main_option("version_locations", os.pathsep.join((str(real_versions), str(extra))))
    command.upgrade(cfg, "head")


def _seed_batch_children(database: Path) -> None:
    with sqlite3.connect(database) as db:
        db.execute("PRAGMA foreign_keys=ON")
        db.execute(
            "INSERT INTO users (email, display_name, role, is_active, must_change_password, created_at, updated_at) "
            "VALUES ('parent@example.invalid', 'Parent', 'user', 1, 0, '2026-01-01', '2026-01-01')"
        )
        db.execute(
            "INSERT INTO trips (user_id, title, start_date, end_date, status, counts_as_pto, created_at, updated_at) "
            "VALUES (1, 'Non cascade', '2026-01-01', '2026-01-02', 'planning', 1, '2026-01-01', '2026-01-01')"
        )
        db.execute(
            "INSERT INTO catalog_items (kind, title, source, created_at, updated_at) "
            "VALUES ('movie', 'Child film', 'manual', '2026-01-01', '2026-01-01')"
        )
        db.execute(
            "INSERT INTO user_entries (user_id, catalog_id, status, review_spoiler, favorite, anticipated, created_at, updated_at) "
            "VALUES (1, 1, 'want', 0, 0, 0, '2026-01-01', '2026-01-01')"
        )
        db.execute(
            "INSERT INTO experiences (user_id, entry_id, kind, spoiler, created_at) "
            "VALUES (1, 1, 'watch', 0, '2026-01-01')"
        )
        db.commit()


def _recreate_table(database: Path, table: str, rev_id: str) -> None:
    _apply_extra(
        database,
        "import sqlalchemy as sa\n"
        "from alembic import op\n"
        f'revision = "{rev_id}"\n'
        'down_revision = "site_schema_v1"\n'
        "branch_labels = None\ndepends_on = None\n"
        "def upgrade():\n"
        f"    with op.batch_alter_table('{table}', recreate='always') as batch:\n"
        "        batch.add_column(sa.Column('batch_marker', sa.Integer(), nullable=True))\n"
        "def downgrade():\n"
        "    pass\n",
        rev_id,
    )


def test_batch_recreate_of_users_keeps_non_cascade_trips(tmp_path):
    database = tmp_path / "site.db"
    adopt_or_upgrade(sqlite_url(database))
    _seed_batch_children(database)
    _recreate_table(database, "users", "batchusers001")
    with sqlite3.connect(database) as db:
        db.execute("PRAGMA foreign_keys=ON")
        assert db.execute("SELECT COUNT(*) FROM trips").fetchone() == (1,)
        assert db.execute("SELECT title FROM trips").fetchone() == ("Non cascade",)
        assert db.execute("SELECT COUNT(*) FROM user_entries").fetchone() == (1,)
        assert db.execute("SELECT COUNT(*) FROM experiences").fetchone() == (1,)
        assert db.execute("PRAGMA foreign_key_check").fetchall() == []
        assert "batch_marker" in {row[1] for row in db.execute("PRAGMA table_info(users)")}
        assert "batch_marker" not in {row[1] for row in db.execute("PRAGMA table_info(user_entries)")}


def test_batch_recreate_of_user_entries_keeps_cascade_experiences(tmp_path):
    database = tmp_path / "site.db"
    adopt_or_upgrade(sqlite_url(database))
    _seed_batch_children(database)
    _recreate_table(database, "user_entries", "batchentry001")
    with sqlite3.connect(database) as db:
        db.execute("PRAGMA foreign_keys=ON")
        assert db.execute("SELECT COUNT(*) FROM user_entries").fetchone() == (1,)
        assert db.execute("SELECT COUNT(*) FROM experiences").fetchone() == (1,)
        assert db.execute("SELECT COUNT(*) FROM trips").fetchone() == (1,)
        assert db.execute("PRAGMA foreign_key_check").fetchall() == []
        assert "batch_marker" in {row[1] for row in db.execute("PRAGMA table_info(user_entries)")}
        assert "batch_marker" not in {row[1] for row in db.execute("PRAGMA table_info(users)")}


def test_database_path_rejects_a_file_uri_with_a_remote_authority():
    with pytest.raises(RuntimeError, match="localhost"):
        database_path("sqlite:///file://evil/data/x.db?uri=true")
    # A fragment stays inside the file URI. SQLAlchemy's own query (mode, uri)
    # is not part of that URI and still names the local path.
    with pytest.raises(RuntimeError, match="query or fragment"):
        database_path("sqlite:///file:///data/x.db#frag")
    assert database_path("sqlite:///file:///data/x.db?mode=ro&uri=true") == Path("/data/x.db")
    assert database_path("sqlite:///file://localhost/data/x.db?uri=true") == Path("/data/x.db")
    assert database_path("sqlite:///file:///data/x.db?uri=true") == Path("/data/x.db")


def test_in_place_baseline_edit_is_caught_by_model_diff(tmp_path, monkeypatch):
    """A revision edited in place still reports current, and the schema diff does not.

    ``--check`` upgrades a fresh database with the edited revision, so it
    stays green. A database already stamped at that revision does not gain
    the new column. Upgrade mode has to require an empty model diff.
    """
    published = tmp_path / "published.db"
    adopt_or_upgrade(sqlite_url(published))
    assert model_diff(published) == []
    assert current_revision(published) == head_revision()

    source = Path(__file__).resolve().parents[1] / "alembic" / "versions" / "site_schema_v1_baseline_schema.py"
    edited = tmp_path / "versions"
    edited.mkdir()
    original = source.read_text()
    needle = 'value TEXT NOT NULL, \\n\\tPRIMARY KEY ("key")'
    assert needle in original
    (edited / source.name).write_text(
        original.replace(needle, 'value TEXT NOT NULL, \\n\\tnote TEXT, \\n\\tPRIMARY KEY ("key")', 1)
    )

    from sqlalchemy import Column, Text
    from apps.server import schema as schema_module

    real_metadata = schema_module.metadata

    def metadata_with_note():
        meta = real_metadata()
        meta.tables["settings"].append_column(Column("note", Text(), nullable=True))
        return meta

    monkeypatch.setattr(schema_module, "metadata", metadata_with_note)
    fresh = tmp_path / "fresh.db"
    cfg = make_config(sqlite_url(fresh))
    cfg.set_main_option("version_path_separator", "os")
    cfg.set_main_option("version_locations", str(edited))
    command.upgrade(cfg, "head")
    assert model_diff(fresh) == []
    diff = model_diff(published)
    assert any(item and item[0] == "add_column" for item in diff)
    assert current_revision(published) == head_revision()


def test_sqlite_url_opens_a_database_whose_name_contains_reserved_characters(tmp_path):
    database = tmp_path / "q?mark#hash%.db"
    url = sqlite_url(database)
    readonly = sqlite_url(database, readonly=True)
    assert url == f"sqlite:///{database.resolve().as_uri()}?uri=true"
    assert readonly == f"sqlite:///{database.resolve().as_uri()}?mode=ro&uri=true"
    assert database_path(url) == database.resolve()
    assert database_path(readonly) == database.resolve()
    assert database_path("sqlite:////data/site.db") == Path("/data/site.db")
    adopt_or_upgrade(url)
    assert database.is_file()
    assert not (tmp_path / "q").exists()
    assert model_diff(database, readonly=True) == []
    with connect(database, readonly=True) as db:
        assert db.execute("SELECT version_num FROM site_alembic_version").fetchone()[0] == head_revision()


def test_foreign_key_violation_rolls_the_revision_back(tmp_path):
    database = tmp_path / "site.db"
    adopt_or_upgrade(sqlite_url(database))
    with pytest.raises(RuntimeError, match="foreign_key_check"):
        _apply_extra(
            database,
            "from alembic import op\n"
            'revision = "fkviol00001"\n'
            'down_revision = "site_schema_v1"\n'
            "branch_labels = None\ndepends_on = None\n"
            "def upgrade():\n"
            "    op.execute(\"INSERT INTO trips (user_id, title, start_date, end_date, status, counts_as_pto, created_at, updated_at) "
            "VALUES (999, 'orphan', '2026-01-01', '2026-01-02', 'planning', 1, '2026-01-01', '2026-01-01')\")\n"
            "def downgrade():\n"
            "    pass\n",
            "fkviol00001",
        )
    assert current_revision(database) == "site_schema_v1"
    with sqlite3.connect(database) as db:
        assert db.execute("SELECT COUNT(*) FROM trips").fetchone() == (0,)


def test_startup_accepts_only_recorded_forward_compatible_descendants(tmp_path, monkeypatch):
    database = tmp_path / "site.db"
    adopt_or_upgrade(sqlite_url(database))
    engine = create_engine(sqlite_url(database))
    with sqlite3.connect(database) as db:
        db.execute("UPDATE site_alembic_version SET version_num='site_schema_v2'")
    with engine.connect() as connection:
        with pytest.raises(RuntimeError, match="Refusing to migrate at startup"):
            assert_ready(connection)
    assert current_revision(database) == "site_schema_v2"
    with sqlite3.connect(database) as db:
        db.execute(
            "CREATE TABLE site_revision_compatibility ("
            "revision VARCHAR(32) NOT NULL, compatible_head VARCHAR(32) NOT NULL, "
            "PRIMARY KEY (revision, compatible_head))"
        )
        db.execute(
            "INSERT INTO site_revision_compatibility (revision, compatible_head) "
            "VALUES ('site_schema_v2', 'other_head')"
        )
    with engine.connect() as connection:
        with pytest.raises(RuntimeError, match="Refusing to migrate at startup"):
            assert_ready(connection)
    with sqlite3.connect(database) as db:
        db.execute(
            "INSERT INTO site_revision_compatibility (revision, compatible_head) "
            "VALUES ('site_schema_v2', 'site_schema_v1')"
        )
    with engine.connect() as connection:
        assert_ready(connection)
    monkeypatch.setattr("apps.server.migrations.head_revision", lambda: "site_schema_v2")
    with sqlite3.connect(database) as db:
        db.execute("UPDATE site_alembic_version SET version_num='site_schema_v1'")
    with engine.connect() as connection:
        with pytest.raises(RuntimeError, match="Refusing to migrate at startup"):
            assert_ready(connection)
    assert current_revision(database) == "site_schema_v1"
    engine.dispose()


def test_stamp_waits_out_a_writer_without_a_partial_revision(tmp_path):
    database = tmp_path / "site.db"
    legacy_site_database(database)
    holder = sqlite3.connect(database, timeout=30)
    holder.execute("BEGIN IMMEDIATE")
    holder.execute("UPDATE trips SET title='locked'")
    errors = []

    def run():
        try:
            adopt_or_upgrade(sqlite_url(database))
        except Exception as exc:
            errors.append(exc)

    worker = threading.Thread(target=run)
    worker.start()
    time.sleep(6)
    assert current_revision(database) is None
    holder.commit()
    holder.close()
    worker.join(timeout=15)
    assert not errors
    assert current_revision(database) == head_revision()
    with sqlite3.connect(database) as db:
        assert db.execute("SELECT title FROM trips").fetchone() == ("locked",)
