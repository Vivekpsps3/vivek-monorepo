"""Apply the unified site schema, or adopt a database that already has it.

Production state is the SQLite file named by SITE_DATABASE_URL
(sqlite:////data/site.db in Compose). The site container's root filesystem is
read-only; this command writes only that database file, plus a backup when
SITE_BACKUP_DIR is mounted (the deploy one-shot mounts /backups).

An existing v1 database is stamped at the baseline revision. Stamp writes the
site_alembic_version table and does not rewrite application rows. A missing
database is created by running the revisions. The historical Finance Alembic
chain is a different environment and must not be pointed at this file.

Usage:
    python -m apps.server.migrations
    python -m apps.server.migrations --check
    python -m apps.server.migrations revision --autogenerate -m "describe the change"
"""
import argparse
import ast
import importlib.util
import json
import os
from pathlib import Path
import sqlite3
import tempfile

from alembic import command
from alembic.autogenerate import compare_metadata
from alembic.config import Config
from alembic.runtime.migration import MigrationContext
from alembic.script import ScriptDirectory
from sqlalchemy import create_engine
from sqlalchemy.engine import make_url
from sqlalchemy.pool import NullPool

from apps.server.schema import MIGRATION_VERSION_TABLE, VERSION

_HEAD = None


def include_name(name, type_, parent_names):
    del parent_names
    return not (type_ == "table" and name == MIGRATION_VERSION_TABLE)


def include_object(object_, name, type_, reflected, compare_to):
    del object_, reflected, compare_to
    return not (type_ == "table" and name == MIGRATION_VERSION_TABLE)


def package_dir() -> Path:
    return Path(__file__).resolve().parent


def make_config(url: str) -> Config:
    cfg = Config(str(package_dir() / "alembic.ini"))
    cfg.set_main_option("script_location", str(package_dir() / "alembic"))
    cfg.set_main_option("sqlalchemy.url", url)
    return cfg


def sqlite_url(path: Path) -> str:
    return f"sqlite:///{path.resolve()}"


def database_path(url: str) -> Path:
    parsed = make_url(url)
    if parsed.drivername != "sqlite" or not parsed.database or parsed.database == ":memory:":
        raise RuntimeError("Migrations require an on-disk SQLite database")
    path = Path(parsed.database)
    if not path.is_absolute():
        raise RuntimeError("SITE_DATABASE_URL must name an absolute SQLite path")
    return path


def head_revision() -> str:
    global _HEAD
    if _HEAD is None:
        script = ScriptDirectory.from_config(make_config("sqlite://"))
        head = script.get_current_head()
        if not head:
            raise RuntimeError("Site migration history has no head")
        _HEAD = head
    return _HEAD


def schema_signature(path: Path) -> tuple:
    """Schema objects except the site revision table, in a stable order."""
    with sqlite3.connect(path) as db:
        rows = db.execute(
            """
            SELECT type, name, tbl_name, COALESCE(sql, '')
            FROM sqlite_master
            WHERE name NOT LIKE 'sqlite_%' AND name != ?
            ORDER BY type, name
            """,
            (MIGRATION_VERSION_TABLE,),
        ).fetchall()
    return tuple(tuple(row) for row in rows)


def table_names(path: Path) -> set[str]:
    with sqlite3.connect(path) as db:
        return {row[0] for row in db.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")}


def current_revision(path: Path) -> str | None:
    if not path.is_file() or path.stat().st_size == 0:
        return None
    with sqlite3.connect(path) as db:
        present = db.execute(
            "SELECT 1 FROM sqlite_master WHERE type='table' AND name=?",
            (MIGRATION_VERSION_TABLE,),
        ).fetchone()
        if not present:
            return None
        row = db.execute(f'SELECT version_num FROM "{MIGRATION_VERSION_TABLE}"').fetchone()
    return row[0] if row else None


def classify(path: Path) -> str:
    if not path.is_file() or path.stat().st_size == 0:
        return "empty"
    names = table_names(path)
    if not names:
        return "empty"
    if MIGRATION_VERSION_TABLE in names:
        return "managed"
    if "site_schema" not in names:
        raise RuntimeError("Database is not a site database; refusing to migrate")
    with sqlite3.connect(path) as db:
        version = db.execute("SELECT version FROM site_schema WHERE id=1").fetchone()
    if version != (VERSION,):
        raise RuntimeError(f"Database schema {version[0] if version else 'missing'}; refusing to adopt. Expected site schema version {VERSION}.")
    return "adopt"


def model_diff(path: Path):
    """Operations Alembic would generate to make this file match the models.

    Constraint order inside CREATE TABLE is not significant; SQLite preserves
    the statement text, and that text is not stable across process hash seeds.
    """
    from apps.server.schema import metadata

    current = metadata()
    engine = create_engine(sqlite_url(path), poolclass=NullPool)
    try:
        with engine.connect() as connection:
            context = MigrationContext.configure(
                connection,
                opts={
                    "compare_type": True,
                    "compare_server_default": True,
                    "include_name": include_name,
                    "include_object": include_object,
                    "version_table": MIGRATION_VERSION_TABLE,
                    "target_metadata": current,
                },
            )
            return compare_metadata(context, current)
    finally:
        engine.dispose()


def _diff_summary(diff) -> str:
    parts = []
    for item in diff:
        kind = item[0] if item else "change"
        subject = item[1] if len(item) > 1 else ""
        name = getattr(subject, "name", None) or (subject if isinstance(subject, str) else "")
        parts.append(f"{kind} {name}".strip())
    return ", ".join(parts[:12])


def _load_backup():
    for candidate in (Path("/app/backup-site.py"), package_dir().parents[1] / "scripts" / "backup-site.py"):
        if candidate.is_file():
            spec = importlib.util.spec_from_file_location("backup_site", candidate)
            module = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(module)
            return module
    raise RuntimeError("Backup tool is missing; refusing to migrate while SITE_BACKUP_DIR is set")


def backup_if_configured(path: Path) -> None:
    directory = os.environ.get("SITE_BACKUP_DIR", "").strip()
    if not directory:
        return
    if not path.is_file() or path.stat().st_size == 0:
        return
    keep = int(os.environ.get("SITE_BACKUP_KEEP", "1"))
    _load_backup().backup(path, Path(directory), keep)


def _enable_wal(path: Path) -> None:
    with sqlite3.connect(path) as db:
        mode = db.execute("PRAGMA journal_mode=WAL").fetchone()
        if not mode or str(mode[0]).lower() != "wal":
            raise RuntimeError("Failed to enable WAL")
        db.execute("PRAGMA wal_checkpoint(TRUNCATE)")


def adopt_or_upgrade(url: str, *, require_existing: bool = False) -> str:
    """Stamp a matching v1 database, or upgrade a managed or empty one.

    Returns ``stamped``, ``upgraded``, or ``current``. Raises without writing
    application tables when the database is not the baseline schema.
    """
    path = database_path(url)
    if require_existing and not path.is_file():
        raise RuntimeError("Site database is missing; refusing to create one")
    path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    state = classify(path)
    before = current_revision(path) if state == "managed" else None
    if state != "empty":
        backup_if_configured(path)
    if state == "adopt":
        diff = model_diff(path)
        if diff:
            raise RuntimeError(
                "Refusing to stamp this database; its schema does not match the site baseline. "
                "No changes were applied. " + _diff_summary(diff)
            )
        command.stamp(make_config(url), "head")
        action = "stamped"
    else:
        command.upgrade(make_config(url), "head")
        action = "upgraded" if current_revision(path) != before else "current"
    _enable_wal(path)
    os.chmod(path, 0o600)
    revision = current_revision(path)
    expected = head_revision()
    if revision != expected:
        raise RuntimeError(f"Migration finished at {revision}, not {expected}")
    print(json.dumps({"event": "schema_migration", "action": action, "revision": revision}), flush=True)
    return action


def _revision_is_empty(source: str) -> bool:
    found = {}
    for node in ast.parse(source).body:
        if isinstance(node, ast.FunctionDef) and node.name in {"upgrade", "downgrade"}:
            body = list(node.body)
            if body and isinstance(body[0], ast.Expr) and isinstance(getattr(body[0], "value", None), ast.Constant):
                body = body[1:]
            found[node.name] = len(body) == 1 and isinstance(body[0], ast.Pass)
    return found.get("upgrade") is True and found.get("downgrade") is True


def check_drift() -> None:
    """Upgrade a temporary database and fail if autogenerate finds a model diff."""
    with tempfile.TemporaryDirectory(prefix="site-drift-") as temporary:
        root = Path(temporary)
        database = root / "site.db"
        cfg = make_config(sqlite_url(database))
        command.upgrade(cfg, "head")
        versions = root / "versions"
        versions.mkdir()
        real_versions = package_dir() / "alembic" / "versions"
        cfg.set_main_option("version_path_separator", "os")
        cfg.set_main_option("version_locations", os.pathsep.join((str(real_versions), str(versions))))
        command.revision(
            cfg,
            message="drift check",
            autogenerate=True,
            version_path=str(versions),
            rev_id="driftcheck",
        )
        script = next(versions.glob("*.py"))
        source = script.read_text()
        if not _revision_is_empty(source):
            raise SystemExit("model/migration drift: autogenerate produced operations\n" + source)
    print(json.dumps({"event": "schema_drift_check", "status": "ok", "revision": head_revision()}), flush=True)


def main(argv=None) -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--url", default=os.environ.get("SITE_DATABASE_URL", ""))
    parser.add_argument("--check", action="store_true", help="Fail if models differ from the migrations")
    parser.add_argument("--require-existing", action="store_true", help="Refuse to create a missing database")
    sub = parser.add_subparsers(dest="command")
    revision = sub.add_parser("revision", help="Create a new revision script")
    revision.add_argument("-m", "--message", required=True)
    revision.add_argument("--autogenerate", action="store_true")
    args = parser.parse_args(argv)
    if args.check:
        check_drift()
        return
    if not args.url:
        parser.error("Set SITE_DATABASE_URL or pass --url")
    if args.command == "revision":
        command.revision(make_config(args.url), message=args.message, autogenerate=args.autogenerate)
        return
    adopt_or_upgrade(args.url, require_existing=args.require_existing)


if __name__ == "__main__":
    main()
