"""One bounded SQLite engine for every domain."""

import os
from pathlib import Path
from sqlalchemy import event
from sqlalchemy.engine import make_url


def database_url():
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


def configure_engine(engine):
    @event.listens_for(engine, "connect")
    def configure(connection, _record):
        cursor = connection.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.execute("PRAGMA busy_timeout=5000")
        cursor.close()

    return engine
