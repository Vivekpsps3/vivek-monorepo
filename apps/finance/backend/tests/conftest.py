import base64
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
# The test client speaks http://testserver. Dev origins stay listed so those clients
# can be asserted explicitly. A developer shell must not replace this set.
os.environ["CORS_ORIGINS"] = (
    "http://testserver,http://localhost:4200,http://127.0.0.1:4200,"
    "http://localhost:8000,http://127.0.0.1:8000"
)

sys.path.insert(0, str(Path(__file__).resolve().parents[4]))

from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.hazmat.primitives.asymmetric.utils import decode_dss_signature
from fastapi.testclient import TestClient

import apps.finance.backend.main as finance_main
from apps.finance.backend import database as finance_db
from apps.server.database import open_database
from apps.server.identity.models import UserRole
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

# Synthetic signing key shared by fixture users; no vault is created implicitly.
_signing_key = ec.generate_private_key(ec.SECP256R1())
_public_key_b64 = base64.b64encode(
    _signing_key.public_key().public_bytes(
        serialization.Encoding.DER, serialization.PublicFormat.SubjectPublicKeyInfo
    )
).decode()


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
            role=role,
            must_change_password=False,
        )
        user.username = email
        user.auth_public_key_b64 = _public_key_b64
        user.auth_algorithm = "ECDSA_P256_SHA256"
        user.auth_key_version = 1
        db.commit()
        db.refresh(user)
        return user
    finally:
        db.close()


def sign_in(client: TestClient, email: str) -> None:
    # Bind both steps to the configured test origin, including local-dev clients.
    headers = {"Origin": "http://testserver"}
    challenge = client.post(
        "/api/auth/passwordless/challenge", json={"username": email}, headers=headers
    )
    assert challenge.status_code == 200, challenge.text
    body = challenge.json()
    der = _signing_key.sign(body["message"].encode(), ec.ECDSA(hashes.SHA256()))
    r, s = decode_dss_signature(der)
    response = client.post(
        "/api/auth/passwordless/verify",
        headers=headers,
        json={
            "username": email,
            "challenge_id": body["challenge_id"],
            "challenge": body["challenge"],
            "message": body["message"],
            "signature_b64": base64.b64encode(
                r.to_bytes(32, "big") + s.to_bytes(32, "big")
            ).decode(),
        },
    )
    assert response.status_code == 200, response.text
    client.headers["X-CSRF-Token"] = response.json()["csrf_token"]


def authenticated_client(
    app, email: str = "user@example.com", role: UserRole = UserRole.user
) -> TestClient:
    seed_user(email=email, role=role)
    client = TestClient(app)
    sign_in(client, email)
    return client
