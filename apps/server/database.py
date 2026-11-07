"""One SQLite engine and session lifecycle for every domain.

Importing this module does not open a database or create a file. The site
factory calls open_database and stores it on app.state. Domain routes share get_db.

autoflush is off: Finance flushes explicitly so an unrelated SELECT cannot
write a pending auth row. expire_on_commit is off: callers read attributes
after their own commit while the session is still open. Travel and Media
flush explicitly too, so one sessionmaker covers all three.
"""

from __future__ import annotations

import logging
import os
from contextlib import suppress
from dataclasses import dataclass
from pathlib import Path

from fastapi import Request
from sqlalchemy import create_engine, event
from sqlalchemy.engine import Engine, make_url
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool


@dataclass(frozen=True)
class Database:
    url: str
    engine: Engine
    sessionmaker: sessionmaker[Session]


def database_url() -> str:
    value = os.environ.get("SITE_DATABASE_URL", "")
    parsed = make_url(value)
    if (
        parsed.drivername != "sqlite"
        or not parsed.database
        or not Path(parsed.database).is_absolute()
    ):
        raise RuntimeError("SITE_DATABASE_URL must name an absolute local SQLite file")
    if not Path(parsed.database).is_file():
        raise RuntimeError(
            "Site database is missing. Initialize or migrate it before starting the site."
        )
    return value


def configure_engine(engine: Engine) -> Engine:
    @event.listens_for(engine, "connect")
    def configure(connection, _record):
        cursor = connection.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.execute("PRAGMA busy_timeout=5000")
        cursor.close()

    return engine


class _EngineParameterFilter(logging.Filter):
    def filter(self, record: logging.LogRecord) -> bool:
        # Handler filters also see application logs propagated to root. Logger
        # filters alone do not cover records emitted by named Engine children.
        name = "sqlalchemy.engine.Engine"
        if record.name != name and not record.name.startswith(name + "."):
            return True
        # Result rows may have a logging_token prefix or a non-string payload.
        # No Engine DEBUG output is safe to retain, regardless of its format.
        if record.levelno <= logging.DEBUG:
            return False
        message = record.msg
        if not isinstance(message, str):
            return True
        # SQLAlchemy prefixes parameter templates with [logging_token] when set.
        return not (
            message.endswith(("[%s] %r", "[raw sql] %r")) or message.startswith("[raw sql]")
        )


def _silence_engine_parameters(engine: Engine) -> None:
    drop = _EngineParameterFilter()
    name = "sqlalchemy.engine.Engine"
    if engine.logging_name:
        name += f".{engine.logging_name}"
    logger: logging.Logger | None = logging.getLogger(name)
    while isinstance(logger, logging.Logger):
        chosen = (
            [logger] if logger.name == name or logger.name == "sqlalchemy.engine.Engine" else []
        )
        for target in [*chosen, *logger.handlers]:
            if not any(isinstance(item, _EngineParameterFilter) for item in target.filters):
                target.addFilter(drop)
        parent = logger.parent
        logger = parent if logger.propagate and isinstance(parent, logging.Logger) else None


def _memory(database: str | None) -> bool:
    name = database or ""
    return name == ":memory:" or name.endswith(":memory:")


def open_database(url: str) -> Database:
    """Open the one engine. A file URL must be absolute. Missing files are created by SQLite."""
    parsed = make_url(url)
    if parsed.drivername != "sqlite":
        raise RuntimeError("The site database must be a local SQLite file")
    memory = _memory(parsed.database)
    if not memory and (not parsed.database or not Path(parsed.database).is_absolute()):
        raise RuntimeError("SITE_DATABASE_URL must name an absolute local SQLite file")
    kwargs: dict = {
        "connect_args": {"check_same_thread": False},
        "hide_parameters": True,
        "echo": False,
    }
    if memory:
        kwargs["poolclass"] = StaticPool
    engine = configure_engine(create_engine(url, **kwargs))
    _silence_engine_parameters(engine)
    factory = sessionmaker(autocommit=False, autoflush=False, expire_on_commit=False, bind=engine)
    return Database(url=url, engine=engine, sessionmaker=factory)


def release_for_provider_io(db: Session) -> None:
    """Commit the open unit of work so provider IO does not hold a write."""
    if db.in_transaction():
        db.commit()


def get_db(request: Request):
    """One unit of work: commit before response delivery, roll back on failure, then close.

    Consumers use Depends(get_db, scope="function") so a success never reaches
    the caller before commit (including commit-time constraint errors)."""
    db = request.app.state.database.sessionmaker()
    try:
        yield db
        db.commit()
    except Exception:
        # A failed rollback must not replace the original error. Rollback
        # messages can include statement parameters.
        with suppress(Exception):
            db.rollback()
        raise
    finally:
        db.close()
