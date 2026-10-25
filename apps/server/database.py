"""One SQLite engine and session lifecycle for every domain.

Importing this module does not open a database or create a file. The site
factory calls open_database, then install. Domain routes share get_db.

autoflush is off: Finance flushes explicitly so an unrelated SELECT cannot
write a pending auth row. expire_on_commit is off: callers read attributes
after their own commit while the session is still open. Travel and Media
flush explicitly too, so one sessionmaker covers all three.
"""

from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

from sqlalchemy import create_engine, event
from sqlalchemy.engine import Engine, make_url
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

_current: Database | None = None


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
    kwargs: dict = {"connect_args": {"check_same_thread": False}}
    if memory:
        kwargs["poolclass"] = StaticPool
    engine = configure_engine(create_engine(url, **kwargs))
    factory = sessionmaker(autocommit=False, autoflush=False, expire_on_commit=False, bind=engine)
    return Database(url=url, engine=engine, sessionmaker=factory)


def install(database: Database) -> None:
    global _current
    _current = database


def current() -> Database:
    if _current is None:
        raise RuntimeError("Database is not open")
    return _current


def get_db():
    """One unit of work: commit on success, roll back on failure, then close."""
    db = current().sessionmaker()
    try:
        yield db
        db.commit()
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()
