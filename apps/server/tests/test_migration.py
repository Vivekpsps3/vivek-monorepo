import importlib.util
import json
import os
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
    spec = importlib.util.spec_from_file_location("backup_site", Path(__file__).resolve().parents[3] / "scripts/backup-site.py")
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
        db.execute("INSERT INTO trips (id,user_id,title,start_date,end_date,status,counts_as_pto,created_at,updated_at) VALUES (1,999,'orphan','2026-01-01','2026-01-02','planning',1,'2026-01-01','2026-01-01')")
        with pytest.raises(RuntimeError, match="Foreign key"):
            check_integrity(db)


def test_migration_rejects_nonempty_unknown_tables(tmp_path):
    from apps.finance.backend.models import Base as Finance
    from apps.travel.backend.models import Base as Travel
    from apps.media.backend.models import Base as Media
    from sqlalchemy import create_engine
    sources = tmp_path / "sources"
    sources.mkdir()
    for domain, schema in (("finance", Finance.metadata), ("travel", Travel.metadata), ("media", Media.metadata)):
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
    spec = importlib.util.spec_from_file_location("backup_retention", Path(__file__).resolve().parents[3] / "scripts/backup-site.py")
    tool = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(tool)
    directory = tmp_path / "backups"
    first = tool.backup(database, directory)
    second = tool.backup(database, directory)
    assert not first.exists()
    assert not first.with_suffix(".json").exists()
    assert second.with_suffix(".json").is_file()
    assert tool.verify(second)["schema"] == 1
    monkeypatch.setattr(tool, "verify", lambda _: (_ for _ in ()).throw(RuntimeError("verification failed")))
    with pytest.raises(RuntimeError, match="verification failed"):
        tool.backup(database, directory)
    assert list(directory.glob("*.db")) == [second]
    assert second.with_suffix(".json").is_file()


def _load_backup_tool():
    spec = importlib.util.spec_from_file_location(
        "backup_retention_kinds", Path(__file__).resolve().parents[3] / "scripts/backup-site.py"
    )
    tool = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(tool)
    return tool


def test_premigrate_backups_stay_when_hourly_retention_deletes_site_snapshots(tmp_path):
    database = tmp_path / "site.db"
    migrate(database)
    tool = _load_backup_tool()
    directory = tmp_path / "backups"
    hourly = tool.backup(database, directory, keep=1)
    premigrate = [
        tool.backup(database, directory, kind="premigrate", revision=revision)
        for revision in ("rev_a", "rev_b", "rev_c", "rev_d")
    ]
    kept = sorted(directory.glob("premigrate-*.db"))
    assert len(kept) == 3
    assert hourly.is_file()
    assert not premigrate[0].exists()
    assert all(path.exists() for path in premigrate[1:])
    manifest = json.loads(premigrate[-1].with_suffix(".json").read_text())
    assert manifest["kind"] == "premigrate"
    assert manifest["revision"] == "rev_d"
    replacement = tool.backup(database, directory, keep=1)
    assert replacement.is_file()
    assert not hourly.exists()
    assert len(list(directory.glob("premigrate-*.db"))) == 3


def test_premigrate_keeps_one_snapshot_per_revision(tmp_path):
    database = tmp_path / "site.db"
    migrate(database)
    tool = _load_backup_tool()
    directory = tmp_path / "backups"
    taken = [
        tool.backup(database, directory, kind="premigrate", revision="site_schema_v1")
        for _ in range(4)
    ]
    kept = list(directory.glob("premigrate-*.db"))
    assert kept == [taken[-1]]


def test_retention_orders_by_filename_timestamp_not_mtime(tmp_path):
    database = tmp_path / "site.db"
    migrate(database)
    tool = _load_backup_tool()
    directory = tmp_path / "backups"
    made = [
        tool.backup(database, directory, kind="premigrate", revision=revision)
        for revision in ("rev_a", "rev_b", "rev_c")
    ]
    renamed = []
    for path, stamp in zip(made, ("20200101T000000", "20200102T000000", "20200103T000000")):
        # premigrate-<revision>-<stamp>-<id>.db and these revisions contain no hyphen.
        revision = path.name.split("-")[1]
        target = directory / f"premigrate-{revision}-{stamp}-aaaaaaaa.db"
        path.rename(target)
        path.with_suffix(".json").unlink(missing_ok=True)
        renamed.append(target)
    # Oldest filename gets the newest mtime. A mtime sort would keep it.
    os.utime(renamed[0], (2_000_000_000, 2_000_000_000))
    os.utime(renamed[2], (1_000_000_000, 1_000_000_000))
    tool.backup(database, directory, kind="premigrate", revision="rev_d")
    names = {path.name for path in directory.glob("premigrate-*.db")}
    assert renamed[0].name not in names
    assert renamed[2].name in names
    assert renamed[1].name in names
