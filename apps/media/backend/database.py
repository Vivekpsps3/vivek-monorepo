"""SQLite for the media journal. Never point this at finance.db or travel.db."""

import os

from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker

from apps.media.backend.models import Base

engine = None
SessionLocal = None


def resolve_database_url(raw_url: str) -> str:
    if (
        not raw_url.startswith("sqlite:///")
        or raw_url.startswith("sqlite:////")
        or ":memory:" in raw_url
    ):
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
    global engine, SessionLocal
    resolved = resolve_database_url(url or os.getenv("MEDIA_DATABASE_URL", "sqlite:///./media.db"))
    if engine is not None:
        engine.dispose()
    engine = create_engine(resolved, connect_args={"check_same_thread": False})
    event.listen(engine, "connect", _enable_foreign_keys)
    SessionLocal = sessionmaker(
        autocommit=False, autoflush=True, expire_on_commit=False, bind=engine
    )
    Base.metadata.create_all(bind=engine)
    return resolved


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
    SessionLocal = sessionmaker(
        autocommit=False, autoflush=True, expire_on_commit=False, bind=engine
    )
