"""Finance session names.

The engine is opened by apps.server.database. Importing this module does not
create a file. init_database remains for the historical Finance Alembic tests;
the site process does not call it.
"""

from __future__ import annotations

import logging
import os
from typing import cast

from sqlalchemy import inspect
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session, sessionmaker

from apps.finance.backend.models import Base
from apps.server.database import Database, get_db

# Bound by publish(). Untyped None would make every caller look optional.
engine = cast(Engine, None)
SessionLocal = cast(sessionmaker[Session], None)
SQLALCHEMY_DATABASE_URL = ""


def publish(database: Database) -> None:
    global engine, SessionLocal, SQLALCHEMY_DATABASE_URL
    engine = database.engine
    SessionLocal = database.sessionmaker
    SQLALCHEMY_DATABASE_URL = database.url


def init_database() -> None:
    from alembic import command
    from alembic.config import Config

    from apps.finance.backend.legacy_schema_guard import assert_safe_to_remove_legacy_schema

    if engine is None:
        raise RuntimeError("Database is not open")
    # Check before create_all or any historical upgrade can change the source DB.
    with engine.connect() as connection:
        assert_safe_to_remove_legacy_schema(connection)
        existing_tables = {
            name for name in inspect(connection).get_table_names() if not name.startswith("sqlite_")
        }
    is_fresh_database = not existing_tables

    Base.metadata.create_all(bind=engine)

    # A clean file database gets the current schema directly. Historical migrations
    # remain available for existing databases that need the guarded cleanup revision.
    if ":memory:" not in SQLALCHEMY_DATABASE_URL:
        log = logging.getLogger(__name__)
        strict = os.getenv("ALEMBIC_STRICT", "1").lower() not in ("0", "false", "no")
        try:
            here = os.path.dirname(os.path.abspath(__file__))
            alembic_cfg = Config(os.path.join(here, "alembic.ini"))
            alembic_cfg.set_main_option("script_location", os.path.join(here, "alembic"))
            alembic_cfg.set_main_option("sqlalchemy.url", SQLALCHEMY_DATABASE_URL)
            if is_fresh_database:
                command.stamp(alembic_cfg, "head")
            else:
                command.upgrade(alembic_cfg, "head")
        except Exception as exc:
            if strict:
                log.error("Alembic upgrade failed (ALEMBIC_STRICT=1): %s", exc)
                raise
            log.warning("Alembic upgrade skipped or failed: %s", exc)


__all__ = [
    "SQLALCHEMY_DATABASE_URL",
    "SessionLocal",
    "engine",
    "get_db",
    "init_database",
    "publish",
]
