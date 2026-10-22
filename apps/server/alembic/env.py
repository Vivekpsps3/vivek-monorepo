"""Alembic environment for the unified site database.

One transaction wraps the whole upgrade. SQLite DDL is transactional, so a
failure rolls the revision back instead of leaving a partially applied schema.
The version table is site_alembic_version, deliberately not the historical
Finance table alembic_version.
"""
import sys
from pathlib import Path

from alembic import context
from sqlalchemy import engine_from_config, event, pool

ROOT = Path(__file__).resolve().parents[3]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from apps.server.migrations import include_name, include_object
from apps.server.schema import MIGRATION_VERSION_TABLE

config = context.config

def target_metadata():
    # Resolve at call time so a drift check sees the models loaded in-process.
    from apps.server.schema import metadata

    return metadata()


def _configure(**kwargs):
    context.configure(
        target_metadata=target_metadata(),
        version_table=MIGRATION_VERSION_TABLE,
        include_name=include_name,
        include_object=include_object,
        compare_type=True,
        compare_server_default=True,
        render_as_batch=True,
        transactional_ddl=True,
        transaction_per_migration=False,
        **kwargs,
    )


def run_migrations_offline() -> None:
    _configure(url=config.get_main_option("sqlalchemy.url"), literal_binds=True, dialect_opts={"paramstyle": "named"})
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    section = dict(config.get_section(config.config_ini_section, {}))
    section["sqlalchemy.url"] = config.get_main_option("sqlalchemy.url")
    connectable = engine_from_config(section, prefix="sqlalchemy.", poolclass=pool.NullPool)

    @event.listens_for(connectable, "connect")
    def _pragmas(dbapi_connection, _record):
        # Python 3.12 sqlite3 legacy transaction control autocommits DDL unless
        # a BEGIN is already open, and SELECT does not open one. Without this,
        # a failed revision can leave its CREATE TABLE behind while rolling
        # back the following INSERT. PRAGMAs are set first; foreign_keys cannot
        # be changed inside a transaction.
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.execute("PRAGMA busy_timeout=30000")
        cursor.close()
        dbapi_connection.autocommit = False

    with connectable.connect() as connection:
        _configure(connection=connection)
        with context.begin_transaction():
            context.run_migrations()
    connectable.dispose()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
