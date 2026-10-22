import os
import sys
from pathlib import Path

os.environ["DATABASE_URL"] = "sqlite:///:memory:"
# A developer shell or .env.development must not turn the local auth bypass on during tests.
os.environ["LOCAL_DEV_AUTH"] = "0"
os.environ.pop("FINANCE_DEV_ENV_FILE", None)

sys.path.insert(0, str(Path(__file__).resolve().parents[4]))

from fastapi.testclient import TestClient

from apps.finance.backend.auth import create_user
from apps.finance.backend.database import SQLALCHEMY_DATABASE_URL, SessionLocal
from apps.finance.backend.models import UserRole, UserSession

if ":memory:" not in SQLALCHEMY_DATABASE_URL:
    raise RuntimeError(f"Tests must not run against a file database: {SQLALCHEMY_DATABASE_URL}")

TEST_PASSWORD = "correct-horse-battery-staple"


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


def authenticated_client(app, email: str = "user@example.com", role: UserRole = UserRole.user) -> TestClient:
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
