import os
import sys
from pathlib import Path

import pytest

os.environ["DATABASE_URL"] = "sqlite:///:memory:"
# A developer shell or .env.development must not turn the local auth bypass on during tests.
os.environ["LOCAL_DEV_AUTH"] = "0"
os.environ.pop("FINANCE_DEV_ENV_FILE", None)
os.environ.pop("AUTH_SIGNUP_MODE", None)
os.environ.pop("AUTH_INVITE_CODES", None)
os.environ.pop("AUTH_SIGNUP_ALLOWLIST", None)
os.environ.pop("AUTH_DECOY_SECRET", None)
os.environ.pop("AUTH_IP_RATE_LIMIT_PER_MIN", None)
os.environ.pop("AUTH_ACCOUNT_RATE_LIMIT_PER_MIN", None)
os.environ.pop("AUTH_PAIR_RATE_LIMIT_PER_MIN", None)
os.environ.pop("AUTH_FAILED_VERIFY_RATE_LIMIT_PER_MIN", None)
os.environ.pop("RATE_LIMIT_PER_MIN", None)

sys.path.insert(0, str(Path(__file__).resolve().parents[4]))

from fastapi.testclient import TestClient

import apps.finance.backend.main as finance_main
from apps.finance.backend import database as finance_db
from apps.server.database import open_database
from apps.server.identity.models import UserRole, UserSession
from apps.server.identity.session import create_user
from apps.server.main import Dependencies, Settings, create_app

_database = open_database("sqlite:///:memory:")
finance_db.publish(_database)
finance_db.init_database()

_disabled = os.getenv("DISABLE_OPENAPI", "").lower() in ("1", "true", "yes")
_app = create_app(
    Settings(
        database_url=_database.url,
        release="test",
        web_root=Path("/app/web/finance"),
        openapi=not _disabled,
    ),
    Dependencies(database=_database, check_schema=False, check_frontend=False),
)
finance_main.app = _app
finance_main.engine = _database.engine
SQLALCHEMY_DATABASE_URL = finance_db.SQLALCHEMY_DATABASE_URL
SessionLocal = finance_db.SessionLocal

if ":memory:" not in SQLALCHEMY_DATABASE_URL:
    raise RuntimeError(f"Tests must not run against a file database: {SQLALCHEMY_DATABASE_URL}")

TEST_PASSWORD = "correct-horse-battery-staple"


@pytest.fixture(autouse=True)
def _reset_rate_limits():
    from apps.server.rate_limit import clear_limits

    clear_limits()
    yield
    clear_limits()


@pytest.fixture(autouse=True)
def _clear_rate_limit_env(monkeypatch):
    """Drop limiter env vars a ``.env`` may have loaded.

    A missing bucket starts at ``float('-inf')``, so the window reset does
    not depend on how long the host has been up.
    """
    for name in (
        "AUTH_IP_RATE_LIMIT_PER_MIN",
        "AUTH_ACCOUNT_RATE_LIMIT_PER_MIN",
        "AUTH_PAIR_RATE_LIMIT_PER_MIN",
        "AUTH_FAILED_VERIFY_RATE_LIMIT_PER_MIN",
        "RATE_LIMIT_PER_MIN",
    ):
        monkeypatch.delenv(name, raising=False)


def seed_user(email: str = "user@example.com", role: UserRole = UserRole.user):
    db = SessionLocal()
    try:
        user = create_user(
            db,
            email=email,
            display_name=email.split("@")[0].title(),
            password=TEST_PASSWORD,
            role=role,
            must_change_password=False,
        )
        db.commit()
        db.refresh(user)
        return user
    finally:
        db.close()


def authenticated_client(
    app, email: str = "user@example.com", role: UserRole = UserRole.user
) -> TestClient:
    user = seed_user(email=email, role=role)
    client = TestClient(app)
    res = client.post("/api/auth/login/migrate", json={"email": email, "password": TEST_PASSWORD})
    assert res.status_code == 200, res.text
    # This helper represents a fully authenticated test user, not a legacy migration session.
    db = SessionLocal()
    try:
        db.query(UserSession).filter(UserSession.user_id == user.id).update(
            {UserSession.migration_only: False}, synchronize_session=False
        )
        db.commit()
    finally:
        db.close()
    client.headers.update({"X-CSRF-Token": res.json()["csrf_token"]})
    return client
