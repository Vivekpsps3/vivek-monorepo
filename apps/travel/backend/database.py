"""SQLite session for the travel app.

The database file is separate from finance. TRAVEL_DATABASE_URL defaults to
apps/travel/backend/travel.db. Do not point it at finance.db.
"""

import os

from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker

from apps.travel.backend.models import Base

engine = None
SessionLocal = None


def resolve_database_url(raw_url: str) -> str:
    """Keep relative SQLite files anchored to this backend directory."""
    if not raw_url.startswith("sqlite:///") or raw_url.startswith("sqlite:////") or ":memory:" in raw_url:
        return raw_url
    relative_path = raw_url.removeprefix("sqlite:///")
    if os.path.isabs(relative_path):
        return raw_url
    backend_dir = os.path.dirname(os.path.abspath(__file__))
    absolute_path = os.path.abspath(os.path.join(backend_dir, relative_path))
    return f"sqlite:///{absolute_path}"


def _enable_foreign_keys(dbapi_connection, _connection_record) -> None:
    cursor = dbapi_connection.cursor()
    cursor.execute("PRAGMA foreign_keys=ON")
    cursor.close()


def init_db(url: str | None = None) -> str:
    """Create the engine and tables. Returns the resolved URL."""
    global engine, SessionLocal
    resolved = resolve_database_url(url or os.getenv("TRAVEL_DATABASE_URL", "sqlite:///./travel.db"))
    if engine is not None:
        engine.dispose()
    engine = create_engine(resolved, connect_args={"check_same_thread": False})
    event.listen(engine, "connect", _enable_foreign_keys)
    SessionLocal = sessionmaker(autocommit=False, autoflush=True, expire_on_commit=False, bind=engine)
    Base.metadata.create_all(bind=engine)
    _ensure_user_columns()
    return resolved


def _ensure_user_columns() -> None:
    """Add owner columns to a travel database created before finance sign-in."""
    if engine is None:
        return
    with engine.begin() as conn:
        for table in ("trips", "pto_policy", "pto_entries"):
            rows = conn.exec_driver_sql(f"PRAGMA table_info({table})").fetchall()
            if not rows or any(row[1] == "user_id" for row in rows):
                continue
            conn.exec_driver_sql(f"ALTER TABLE {table} ADD COLUMN user_id INTEGER")
        conn.exec_driver_sql("CREATE INDEX IF NOT EXISTS ix_trips_user_id ON trips(user_id)")
        conn.exec_driver_sql("CREATE INDEX IF NOT EXISTS ix_pto_entries_user_id ON pto_entries(user_id)")
        conn.exec_driver_sql("CREATE UNIQUE INDEX IF NOT EXISTS uq_pto_policy_user_id ON pto_policy(user_id)")


def get_db():
    if SessionLocal is None:
        init_db()
    db = SessionLocal()
    try:
        yield db
        db.commit()
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


def bind_database(shared_engine) -> None:
    """Bind the domain to the site's engine; schema changes run offline."""
    global engine, SessionLocal
    engine = shared_engine
    SessionLocal = sessionmaker(autocommit=False, autoflush=True, expire_on_commit=False, bind=engine)
