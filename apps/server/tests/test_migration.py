import importlib.util
from pathlib import Path
import sqlite3
import sys

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[3]))
from apps.server.migrate import migrate, check_integrity


def test_fresh_database_and_backup_restore(tmp_path):
    database = tmp_path / "site.db"
    migrate(database)
    assert database.stat().st_mode & 0o777 == 0o600
    with sqlite3.connect(database) as db:
        check_integrity(db)
        assert db.execute("PRAGMA journal_mode").fetchone() == ("wal",)
    spec = importlib.util.spec_from_file_location(
        "backup_site", Path(__file__).resolve().parents[3] / "scripts/backup-site.py"
    )
    tool = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(tool)
    snapshot = tool.backup(database, tmp_path / "backups")
    database.unlink()
    assert tool.verify(snapshot)["schema"] == 1
    with pytest.raises(RuntimeError, match="missing"):
        tool.backup(database, tmp_path / "backups")


def test_migration_refuses_overwrite_and_missing_sources(tmp_path):
    database = tmp_path / "site.db"
    database.write_bytes(b"do not replace")
    with pytest.raises(RuntimeError, match="exists"):
        migrate(database)
    assert database.read_bytes() == b"do not replace"
    with pytest.raises(RuntimeError, match="missing"):
        migrate(tmp_path / "new.db", tmp_path)
    assert not (tmp_path / "new.db").exists()


def test_foreign_keys_and_owner_validation(tmp_path):
    database = tmp_path / "site.db"
    migrate(database)
    with sqlite3.connect(database) as db:
        db.execute(
            "INSERT INTO trips (id,user_id,title,start_date,end_date,status,counts_as_pto,created_at,updated_at) VALUES (1,999,'orphan','2026-01-01','2026-01-02','planning',1,'2026-01-01','2026-01-01')"
        )
        with pytest.raises(RuntimeError, match="Foreign key"):
            check_integrity(db)


def test_migration_rejects_nonempty_unknown_tables(tmp_path):
    from apps.finance.backend.models import Base as Finance
    from apps.travel.backend.models import Base as Travel
    from apps.media.backend.models import Base as Media
    from sqlalchemy import create_engine

    sources = tmp_path / "sources"
    sources.mkdir()
    for domain, schema in (
        ("finance", Finance.metadata),
        ("travel", Travel.metadata),
        ("media", Media.metadata),
    ):
        engine = create_engine(f"sqlite:///{sources}/{domain}.db")
        schema.create_all(engine)
        engine.dispose()
    with sqlite3.connect(sources / "finance.db") as db:
        db.execute("CREATE TABLE alembic_version(version_num TEXT)")
        db.execute("INSERT INTO alembic_version VALUES ('e0f6a2b3c4d5')")
        db.execute("CREATE TABLE forgotten_data (secret TEXT)")
        db.execute("INSERT INTO forgotten_data VALUES ('keep')")
    with pytest.raises(RuntimeError, match="Unrecognized nonempty"):
        migrate(tmp_path / "combined.db", sources)
    assert not (tmp_path / "combined.db").exists()


def test_latest_backup_replaces_previous_only_after_verification(tmp_path, monkeypatch):
    database = tmp_path / "site.db"
    migrate(database)
    spec = importlib.util.spec_from_file_location(
        "backup_retention", Path(__file__).resolve().parents[3] / "scripts/backup-site.py"
    )
    tool = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(tool)
    directory = tmp_path / "backups"
    first = tool.backup(database, directory)
    second = tool.backup(database, directory)
    assert not first.exists()
    assert not first.with_suffix(".json").exists()
    assert second.with_suffix(".json").is_file()
    assert tool.verify(second)["schema"] == 1
    monkeypatch.setattr(
        tool, "verify", lambda _: (_ for _ in ()).throw(RuntimeError("verification failed"))
    )
    with pytest.raises(RuntimeError, match="verification failed"):
        tool.backup(database, directory)
    assert list(directory.glob("*.db")) == [second]
    assert second.with_suffix(".json").is_file()
