"""Apply the unified site schema, or adopt a database that already has it.

Production state is the SQLite file named by SITE_DATABASE_URL
(sqlite:////data/site.db in Compose). The site container's root filesystem is
read-only; this command writes only that database file, plus a backup when
SITE_BACKUP_DIR is mounted (the deploy one-shot mounts /backups). Startup does
not call this module.

An existing v1 database is stamped at the baseline revision. Stamp writes the
site_alembic_version table and does not rewrite application rows. A missing
database is created by running the revisions. The historical Finance Alembic
chain is a different environment and must not be pointed at this file.

Usage:
    python -m apps.server.migrations
    python -m apps.server.migrations --plan
    python -m apps.server.migrations --check
    python -m apps.server.migrations revision --autogenerate -m "describe the change"
"""
import argparse
import ast
import importlib.util
import io
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
from sqlalchemy import create_engine, event
from sqlalchemy.engine import make_url
from sqlalchemy.pool import NullPool

from apps.server.schema import COMPATIBILITY_TABLE, FINANCE_REVISION, MIGRATION_VERSION_TABLE, VERSION

SQLITE_TIMEOUT_SECONDS = 30
_IGNORED_TABLES = {MIGRATION_VERSION_TABLE, COMPATIBILITY_TABLE}

_HEAD = None


def include_name(name, type_, parent_names):
    del parent_names
    return not (type_ == "table" and name in _IGNORED_TABLES)


def include_object(object_, name, type_, reflected, compare_to):
    del object_, reflected, compare_to
    return not (type_ == "table" and name in _IGNORED_TABLES)


def connect(path: Path, *, readonly: bool = False) -> sqlite3.Connection:
    """Open SQLite. Inspection uses mode=ro so a plan cannot create -wal/-shm files."""
    if readonly:
        return sqlite3.connect(
            f"{path.resolve().as_uri()}?mode=ro",
            uri=True,
            timeout=SQLITE_TIMEOUT_SECONDS,
        )
    return sqlite3.connect(path, timeout=SQLITE_TIMEOUT_SECONDS)


def package_dir() -> Path:
    return Path(__file__).resolve().parent


def make_config(url: str) -> Config:
    cfg = Config(str(package_dir() / "alembic.ini"))
    cfg.set_main_option("script_location", str(package_dir() / "alembic"))
    cfg.set_main_option("sqlalchemy.url", url)
    return cfg


def sqlite_url(path: Path, *, readonly: bool = False) -> str:
    resolved = path.resolve()
    if readonly:
        # SQLAlchemy's SQLite dialect treats uri=true as a URI filename.
        return f"sqlite:///file:{resolved.as_posix()}?mode=ro&uri=true"
    return f"sqlite:///{resolved}"


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
    with connect(path, readonly=True) as db:
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
    with connect(path, readonly=True) as db:
        return {row[0] for row in db.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")}


def current_revision(path: Path) -> str | None:
    if not path.is_file() or path.stat().st_size == 0:
        return None
    with connect(path, readonly=True) as db:
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
        if current_revision(path) is None:
            raise RuntimeError(
                "site_alembic_version is present but has no revision row. "
                "Refusing to upgrade from base. Restore from a pre-migration backup."
            )
        return "managed"
    if "site_schema" not in names:
        raise RuntimeError("Database is not a site database; refusing to migrate")
    with connect(path, readonly=True) as db:
        version = db.execute("SELECT version FROM site_schema WHERE id=1").fetchone()
    if version != (VERSION,):
        raise RuntimeError(f"Database schema {version[0] if version else 'missing'}; refusing to adopt. Expected site schema version {VERSION}.")
    return "adopt"


def model_diff(path: Path, *, readonly: bool = False):
    """Operations Alembic would generate to make this file match the models.

    Constraint order inside CREATE TABLE is not significant; SQLite preserves
    the statement text, and that text is not stable across process hash seeds.
    ``readonly`` opens the file with mode=ro. ``--plan`` uses that so the
    comparison cannot create sidecar files or require a writable directory.
    """
    from apps.server.schema import metadata

    current = metadata()
    engine = create_engine(
        sqlite_url(path, readonly=readonly),
        poolclass=NullPool,
        connect_args={"timeout": SQLITE_TIMEOUT_SECONDS},
    )

    @event.listens_for(engine, "connect")
    def _busy(dbapi_connection, _record):
        cursor = dbapi_connection.cursor()
        cursor.execute(f"PRAGMA busy_timeout={SQLITE_TIMEOUT_SECONDS * 1000}")
        cursor.close()

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
    revision = current_revision(path) or "none"
    # Retention is separate from hourly SITE_BACKUP_KEEP. The backup tool keeps
    # at least three premigrate-* files and does not prune site-* snapshots.
    _load_backup().backup(path, Path(directory), kind="premigrate", revision=revision)


def _enable_wal(path: Path) -> None:
    mode_bits = path.stat().st_mode & 0o777
    with connect(path) as db:
        mode = db.execute("PRAGMA journal_mode").fetchone()
        if mode and str(mode[0]).lower() == "wal":
            if mode_bits != 0o600:
                os.chmod(path, 0o600)
            return
        mode = db.execute("PRAGMA journal_mode=WAL").fetchone()
        if not mode or str(mode[0]).lower() != "wal":
            raise RuntimeError("Failed to enable WAL")
        db.execute("PRAGMA wal_checkpoint(TRUNCATE)")
    os.chmod(path, 0o600)


def foreign_key_violations(path: Path) -> list[tuple]:
    """Rows from PRAGMA foreign_key_check. Empty means the file can be migrated."""
    with connect(path, readonly=True) as db:
        return [tuple(row) for row in db.execute("PRAGMA foreign_key_check")]


def _finance_marker(path: Path) -> str | None:
    with connect(path, readonly=True) as db:
        try:
            rows = db.execute("SELECT version_num FROM alembic_version ORDER BY version_num").fetchall()
        except sqlite3.OperationalError:
            return None
    if rows == [(FINANCE_REVISION,)]:
        return FINANCE_REVISION
    return None


def _reject_adopt(path: Path, *, readonly: bool = False) -> str | None:
    """Return a refusal reason, or None when the database may be stamped."""
    diff = model_diff(path, readonly=readonly)
    if diff:
        return (
            "Refusing to stamp this database; its schema does not match the site baseline. "
            "No changes were applied. " + _diff_summary(diff)
        )
    if _finance_marker(path) != FINANCE_REVISION:
        return (
            "Refusing to stamp this database; alembic_version is not "
            f"{FINANCE_REVISION}. No changes were applied."
        )
    return None


def _stamp_sql(revision: str) -> str:
    table = MIGRATION_VERSION_TABLE
    return (
        f"CREATE TABLE {table} (\n"
        "    version_num VARCHAR(32) NOT NULL,\n"
        f"    CONSTRAINT {table}_pkc PRIMARY KEY (version_num)\n"
        ");\n\n"
        f"INSERT INTO {table} (version_num) VALUES ('{revision}');\n"
    )


def _fk_refusal(path: Path, verb: str) -> str | None:
    violations = foreign_key_violations(path)
    if not violations:
        return None
    preview = "; ".join(str(row) for row in violations[:20])
    return f"foreign_key_check failed; refusing to {verb}. {preview}"


def _offline_sql(url: str, start: str, end: str) -> str:
    buffer = io.StringIO()
    cfg = make_config(url)
    cfg.stdout = buffer
    command.upgrade(cfg, f"{start}:{end}", sql=True)
    return buffer.getvalue()


def plan(url: str, *, require_existing: bool = False) -> int:
    """Print the migration decision and SQL. Does not create or modify the file."""
    path = database_path(url)
    if not path.exists():
        state = "missing"
        revision = None
    elif path.stat().st_size == 0:
        state = "empty"
        revision = None
    else:
        try:
            state = classify(path)
        except RuntimeError as exc:
            print(json.dumps({
                "event": "schema_migration_plan",
                "state": "refuse",
                "revision": current_revision(path),
                "head": head_revision(),
                "action": "refuse",
                "detail": str(exc),
            }), flush=True)
            return 1
        revision = current_revision(path) if state == "managed" else None
    head = head_revision()
    reported = "empty" if state == "missing" else state
    report = {
        "event": "schema_migration_plan",
        "state": reported,
        "revision": revision,
        "head": head,
        "action": None,
        "detail": "",
    }
    sql = ""
    code = 0
    if require_existing and state in {"missing", "empty"}:
        report["action"] = "refuse"
        report["detail"] = "Site database is missing or empty; refusing to create one"
        code = 1
    elif state == "adopt":
        reason = _reject_adopt(path, readonly=True) or _fk_refusal(path, "stamp")
        if reason:
            report["action"] = "refuse"
            report["detail"] = reason
            code = 1
        else:
            report["action"] = "stamp"
            report["schema_diff"] = []
            report["foreign_key_check"] = []
            report["detail"] = "Would record the baseline revision and not rewrite application tables"
            sql = _stamp_sql(head)
    elif state in {"missing", "empty"}:
        report["action"] = "upgrade"
        report["detail"] = "Would create the schema by running revisions from base to head"
        sql = _offline_sql(url, "base", head)
    elif revision == head:
        report["action"] = "current"
        report["detail"] = "Already at head"
    else:
        reason = _fk_refusal(path, "upgrade")
        if reason:
            report["action"] = "refuse"
            report["detail"] = reason
            code = 1
        else:
            report["action"] = "upgrade"
            report["foreign_key_check"] = []
            report["detail"] = f"Would upgrade {revision} to {head}"
            sql = _offline_sql(url, revision, head)
    print(json.dumps(report), flush=True)
    if sql:
        print(sql, end="" if sql.endswith("\n") else "\n", flush=True)
    return code


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
    if require_existing and state == "empty":
        raise RuntimeError("Site database is empty; refusing to create one")
    before = current_revision(path) if state == "managed" else None
    if state == "adopt":
        reason = _reject_adopt(path)
        if reason:
            raise RuntimeError(reason)
    # A no-op deploy is already at head. Backing up there rotates the
    # premigrate set and can delete the snapshot taken before the last real
    # migration. Stamp and a pending upgrade are the writes that need one.
    will_write = state == "adopt" or (state == "managed" and before != head_revision())
    if will_write:
        backup_if_configured(path)
    if state == "adopt":
        command.stamp(make_config(url), "head")
        action = "stamped"
    else:
        command.upgrade(make_config(url), "head")
        action = "upgraded" if current_revision(path) != before else "current"
    _enable_wal(path)
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
    parser.add_argument("--plan", action="store_true", help="Print the decision and SQL without writing")
    parser.add_argument("--require-existing", action="store_true", help="Refuse to create a missing or empty database")
    sub = parser.add_subparsers(dest="command")
    revision = sub.add_parser("revision", help="Create a new revision script")
    revision.add_argument("-m", "--message", required=True)
    revision.add_argument("--autogenerate", action="store_true")
    args = parser.parse_args(argv)
    if args.check and args.plan:
        parser.error("--check and --plan are mutually exclusive")
    if args.check:
        check_drift()
        return
    if not args.url:
        parser.error("Set SITE_DATABASE_URL or pass --url")
    if args.plan:
        raise SystemExit(plan(args.url, require_existing=args.require_existing))
    if args.command == "revision":
        command.revision(make_config(args.url), message=args.message, autogenerate=args.autogenerate)
        return
    adopt_or_upgrade(args.url, require_existing=args.require_existing)


if __name__ == "__main__":
    main()
