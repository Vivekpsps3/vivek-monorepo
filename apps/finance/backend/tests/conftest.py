import os
import sys
import time
import types
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

from apps.finance.backend.auth import create_user
from apps.finance.backend.database import SQLALCHEMY_DATABASE_URL, SessionLocal
from apps.finance.backend.models import UserRole, UserSession

if ":memory:" not in SQLALCHEMY_DATABASE_URL:
    raise RuntimeError(f"Tests must not run against a file database: {SQLALCHEMY_DATABASE_URL}")

TEST_PASSWORD = "correct-horse-battery-staple"


@pytest.fixture(autouse=True)
def _reset_rate_limits():
    from apps.finance.backend.rate_limit import clear_limits

    clear_limits()
    yield
    clear_limits()


@pytest.fixture(autouse=True)
def _pin_rate_limit_coverage(monkeypatch):
    """Make the two uptime-dependent rate-limit statements always run.

    A missing bucket is stored with window_start 0. ``time.monotonic() - 0``
    is at least 60 only after the host has been up for a minute, so
    ``_consume``'s window reset and ``failed_verify_blocked``'s early return
    are covered on a warm machine and missed on a fresh CI runner. That is
    two statements, and it moves the finance total between 84.28% and 84.37%.
    Shift the clock rate_limit reads, and drop limiter env vars a ``.env``
    may have loaded, so both paths are stable. Tests that need a cap set it
    themselves after this fixture.
    """
    from apps.finance.backend import rate_limit

    started = time.monotonic()

    def shifted() -> float:
        return 10_000.0 + (time.monotonic() - started)

    monkeypatch.setattr(rate_limit, "time", types.SimpleNamespace(monotonic=shifted))
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
