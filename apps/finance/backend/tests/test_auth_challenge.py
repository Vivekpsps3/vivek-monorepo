import os

os.environ["DATABASE_URL"] = "sqlite:///:memory:"

from fastapi.testclient import TestClient
from sqlalchemy import delete
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.hazmat.primitives.asymmetric.utils import decode_dss_signature
import base64

from conftest import authenticated_client
from apps.finance.backend.main import Base, app, engine, market_data
from apps.finance.backend.models import UserRole
from apps.finance.backend.rate_limit import _buckets


def setup_function():
    Base.metadata.create_all(bind=engine)
    market_data.clear_memory_cache()
    with engine.begin() as conn:
        for table in reversed(Base.metadata.sorted_tables):
            conn.execute(delete(table))


def passwordless_material():
    private_key = ec.generate_private_key(ec.SECP256R1())
    public_key_b64 = base64.b64encode(
        private_key.public_key().public_bytes(
            serialization.Encoding.DER, serialization.PublicFormat.SubjectPublicKeyInfo
        )
    ).decode()
    return {
        "public_key_b64": public_key_b64,
        "vault": {
            "kdf_salt_b64": "MTIzNDU2Nzg5MDEyMzQ1Ng==",
            "wrapped_dek_b64": "MTIzNDU2Nzg5MDEyMzQ1Njc4OTAxMjM0NTY3ODkwMTIzNDU2Nzg=",
            "recovery_wrapped_dek_b64": "",
        },
        "auth": {
            "kdf_salt_b64": "MTIzNDU2Nzg5MDEyMzQ1Ng==",
            "kdf_iterations": 310000,
            "wrapped_private_key_b64": "MTIzNDU2Nzg5MDEyMzQ1Njc4OTAxMjM0NTY3ODkwMTIzNDU2Nzg=",
            "recovery_wrapped_private_key_b64": "",
        },
    }


def test_admin_invitation_returns_one_time_enrollment_token():
    admin = authenticated_client(app, email="admin@example.com", role=UserRole.admin)

    response = admin.post(
        "/api/admin/users",
        json={"username": "new.user", "display_name": "New User", "role": "user"},
    )

    assert response.status_code == 200
    assert response.json()["enrollment_token"]
    assert "password" not in response.json()


def test_invitation_enrollment_consumes_token_and_creates_session():
    admin = authenticated_client(app, email="admin@example.com", role=UserRole.admin)
    invitation = admin.post(
        "/api/admin/users",
        json={"username": "new.user", "display_name": "New User", "role": "user"},
    ).json()
    client = TestClient(app)

    response = client.post(
        f"/api/auth/invitations/{invitation['enrollment_token']}/enroll",
        json=passwordless_material(),
    )

    assert response.status_code == 200
    assert response.json()["user"]["email"] == "new.user@pending.local"
    assert client.get("/api/auth/me").status_code == 200
    assert client.get("/api/vault/status").json()["exists"] is True
    assert (
        client.post(
            f"/api/auth/invitations/{invitation['enrollment_token']}/enroll",
            json=passwordless_material(),
        ).status_code
        == 401
    )


def test_passwordless_lookup_returns_all_cross_browser_wrapping_metadata():
    client = TestClient(app)
    material = passwordless_material()
    response = client.post(
        "/api/auth/bootstrap/passwordless",
        json={
            "username": "first.admin",
            "display_name": "First Admin",
            **material,
        },
    )
    assert response.status_code == 200

    lookup = TestClient(app).post("/api/auth/passwordless/lookup", json={"username": "first.admin"})

    assert lookup.status_code == 200
    assert lookup.json()["vault"] == material["vault"] | {
        "kdf_algorithm": "PBKDF2",
        "kdf_iterations": 310000,
        "key_version": 1,
        "username": "first.admin",
    }
    assert lookup.json()["auth"] == material["auth"]


def test_passwordless_lookup_accepts_account_email():
    client = TestClient(app)
    material = passwordless_material()
    assert (
        client.post(
            "/api/auth/bootstrap/passwordless",
            json={
                "username": "first.admin",
                "display_name": "First Admin",
                **material,
            },
        ).status_code
        == 200
    )

    by_email = TestClient(app).post(
        "/api/auth/passwordless/lookup",
        json={"username": "first.admin@pending.local"},
    )
    assert by_email.status_code == 200
    assert by_email.json()["vault"]["username"] == "first.admin"
    assert by_email.json()["vault"]["wrapped_dek_b64"] == material["vault"]["wrapped_dek_b64"]


def test_passwordless_lookup_and_challenge_do_not_reveal_whether_a_user_exists():
    client = TestClient(app)
    material = passwordless_material()
    client.post(
        "/api/auth/bootstrap/passwordless",
        json={
            "username": "first.admin",
            "display_name": "First Admin",
            **material,
        },
    )

    known_lookup = TestClient(app).post(
        "/api/auth/passwordless/lookup", json={"username": "first.admin"}
    )
    unknown_lookup = TestClient(app).post(
        "/api/auth/passwordless/lookup", json={"username": "unknown.user"}
    )
    assert known_lookup.status_code == unknown_lookup.status_code == 200
    assert known_lookup.json().keys() == unknown_lookup.json().keys()
    assert known_lookup.json()["vault"].keys() == unknown_lookup.json()["vault"].keys()
    assert known_lookup.json()["auth"].keys() == unknown_lookup.json()["auth"].keys()

    known_challenge = TestClient(app).post(
        "/api/auth/passwordless/challenge", json={"username": "first.admin"}
    )
    unknown_challenge = TestClient(app).post(
        "/api/auth/passwordless/challenge", json={"username": "unknown.user"}
    )
    assert known_challenge.status_code == unknown_challenge.status_code == 200
    assert known_challenge.json().keys() == unknown_challenge.json().keys()


def test_passwordless_endpoints_are_rate_limited(monkeypatch):
    monkeypatch.setenv("RATE_LIMIT_PER_MIN", "1")
    _buckets.clear()
    client = TestClient(app)

    assert (
        client.post("/api/auth/passwordless/lookup", json={"username": "unknown.user"}).status_code
        == 200
    )
    assert (
        client.post("/api/auth/passwordless/lookup", json={"username": "unknown.user"}).status_code
        == 429
    )
    _buckets.clear()


def test_migration_session_cannot_access_normal_authenticated_routes():
    client = TestClient(app)
    from apps.finance.backend.auth import create_user
    from apps.finance.backend.database import SessionLocal

    db = SessionLocal()
    try:
        create_user(
            db, email="legacy@example.com", display_name="Legacy", password="legacy-password"
        )
        db.commit()
    finally:
        db.close()

    login = client.post(
        "/api/auth/login/migrate",
        json={"email": "legacy@example.com", "password": "legacy-password"},
    )
    assert login.status_code == 200
    assert client.get("/api/auth/me").status_code == 403


def test_passwordless_enroll_rejects_email_as_username_and_creates_vault():
    client = TestClient(app)
    from apps.finance.backend.auth import create_user
    from apps.finance.backend.database import SessionLocal

    db = SessionLocal()
    try:
        create_user(
            db, email="legacy@example.com", display_name="Legacy", password="legacy-password"
        )
        db.commit()
    finally:
        db.close()

    login = client.post(
        "/api/auth/login/migrate",
        json={"email": "legacy@example.com", "password": "legacy-password"},
    )
    assert login.status_code == 200
    client.headers["X-CSRF-Token"] = login.json()["csrf_token"]
    material = passwordless_material()

    bad = client.post(
        "/api/auth/passwordless/enroll",
        json={"username": "legacy@example.com", **material},
    )
    assert bad.status_code == 422

    good = client.post(
        "/api/auth/passwordless/enroll",
        json={"username": "legacy.user", **material},
    )
    assert good.status_code == 200
    assert good.json()["ok"] is True
    assert client.get("/api/auth/me").status_code == 200
    vault = client.get("/api/vault/status")
    assert vault.status_code == 200
    assert vault.json()["exists"] is True


def test_authenticated_user_can_update_signing_key_wrap():
    client = TestClient(app)
    material = passwordless_material()
    bootstrap = client.post(
        "/api/auth/bootstrap/passwordless",
        json={
            "username": "first.admin",
            "display_name": "First Admin",
            **material,
        },
    )
    client.headers["X-CSRF-Token"] = bootstrap.json()["csrf_token"]
    replacement = {
        **material["auth"],
        "wrapped_private_key_b64": "YW5vdGhlci1sb25nLWVuY3J5cHRlZC1wcml2YXRlLWtleS1wYXlsb2Fk",
        "recovery_wrapped_private_key_b64": "",
    }

    response = client.put("/api/auth/passwordless/wraps", json=replacement)

    assert response.status_code == 200
    assert (
        TestClient(app)
        .post("/api/auth/passwordless/lookup", json={"username": "first.admin"})
        .json()["auth"]
        == replacement
    )


def test_open_passwordless_signup_creates_user_without_invitation():
    admin = TestClient(app)
    material = passwordless_material()
    assert (
        admin.post(
            "/api/auth/bootstrap/passwordless",
            json={
                "username": "first.admin",
                "display_name": "First Admin",
                **material,
            },
        ).status_code
        == 200
    )

    client = TestClient(app)
    signup_material = passwordless_material()
    response = client.post(
        "/api/auth/signup/passwordless",
        json={"username": "open.user", "display_name": "Open User", **signup_material},
    )

    assert response.status_code == 200
    assert response.json()["user"]["username"] == "open.user"
    assert response.json()["user"]["role"] == "user"
    assert client.get("/api/vault/status").json()["exists"] is True
    assert client.get("/api/auth/me").status_code == 200


def test_bootstrap_rejects_a_non_p256_authentication_key():
    client = TestClient(app)
    material = passwordless_material()
    material["public_key_b64"] = "aGVsbG8td29ybGQtcHVibGljLWtleQ=="

    response = client.post(
        "/api/auth/bootstrap/passwordless",
        json={
            "username": "first.admin",
            "display_name": "First Admin",
            **material,
        },
    )

    assert response.status_code == 400


def test_password_login_is_unmounted():
    client = TestClient(app)
    response = client.post(
        "/api/auth/login", json={"email": "legacy@example.com", "password": "legacy-password"}
    )
    assert response.status_code == 404


def test_passwordless_bootstrap_creates_first_admin_and_vault():
    client = TestClient(app)
    material = passwordless_material()

    response = client.post(
        "/api/auth/bootstrap/passwordless",
        json={
            "username": "first.admin",
            "display_name": "First Admin",
            **material,
        },
    )

    assert response.status_code == 200
    assert response.json()["user"]["role"] == "admin"
    assert client.get("/api/vault/status").json()["exists"] is True


def test_challenge_login_rejects_replay():
    private_key = ec.generate_private_key(ec.SECP256R1())
    public_key_b64 = base64.b64encode(
        private_key.public_key().public_bytes(
            serialization.Encoding.DER, serialization.PublicFormat.SubjectPublicKeyInfo
        )
    ).decode()
    client = TestClient(app)
    material = passwordless_material()
    material["public_key_b64"] = public_key_b64
    client.post(
        "/api/auth/bootstrap/passwordless",
        json={
            "username": "first.admin",
            "display_name": "First Admin",
            **material,
        },
    )
    challenger = TestClient(app)
    challenge = challenger.post(
        "/api/auth/passwordless/challenge", json={"username": "first.admin"}
    ).json()
    der = private_key.sign(challenge["message"].encode(), ec.ECDSA(hashes.SHA256()))
    r, s = decode_dss_signature(der)
    signature_b64 = base64.b64encode(r.to_bytes(32, "big") + s.to_bytes(32, "big")).decode()
    payload = {
        "username": "first.admin",
        "challenge_id": challenge["challenge_id"],
        "challenge": challenge["challenge"],
        "message": challenge["message"],
        "signature_b64": signature_b64,
    }

    assert challenger.post("/api/auth/passwordless/verify", json=payload).status_code == 200
    assert challenger.post("/api/auth/passwordless/verify", json=payload).status_code == 401
