import logging
import os

os.environ["DATABASE_URL"] = "sqlite:///:memory:"

from fastapi.testclient import TestClient
from sqlalchemy import delete
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.hazmat.primitives.asymmetric.utils import decode_dss_signature
import base64

from conftest import authenticated_client
from apps.finance.backend.kdf_policy import LEGACY_PBKDF2_ITERATIONS, MIN_PBKDF2_ITERATIONS
from apps.finance.backend.main import Base, app, engine, market_data
from apps.finance.backend.models import UserRole
from apps.finance.backend.rate_limit import clear_limits
from apps.finance.backend.services.auth_decoy import AUTH_WRAP_BYTES


def setup_function():
    Base.metadata.create_all(bind=engine)
    market_data.clear_memory_cache()
    clear_limits()
    with engine.begin() as conn:
        for table in reversed(Base.metadata.sorted_tables):
            conn.execute(delete(table))


def _b64(n: int) -> str:
    return base64.b64encode(b"x" * n).decode("ascii")


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
            "kdf_salt_b64": _b64(16),
            "kdf_iterations": MIN_PBKDF2_ITERATIONS,
            "wrapped_dek_b64": _b64(60),
            "recovery_wrapped_dek_b64": "",
        },
        "auth": {
            "kdf_salt_b64": _b64(16),
            "kdf_iterations": MIN_PBKDF2_ITERATIONS,
            "wrapped_private_key_b64": _b64(AUTH_WRAP_BYTES),
            "recovery_wrapped_private_key_b64": "",
        },
    }


def _raw_signature(private_key, message: str) -> str:
    der = private_key.sign(message.encode(), ec.ECDSA(hashes.SHA256()))
    r, s = decode_dss_signature(der)
    return base64.b64encode(r.to_bytes(32, "big") + s.to_bytes(32, "big")).decode()


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


def test_passwordless_lookup_returns_signing_wrap_and_keeps_the_vault_on_the_session():
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
    assert lookup.json() == {"auth": material["auth"]}
    assert "wrapped_dek" not in lookup.text
    vault = client.get("/api/vault/status")
    assert vault.status_code == 200
    assert vault.json()["wrapped_dek_b64"] == material["vault"]["wrapped_dek_b64"]
    assert TestClient(app).get("/api/vault/status").status_code == 401


def test_passwordless_lookup_does_not_link_a_username_to_its_email():
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
    by_name = TestClient(app).post(
        "/api/auth/passwordless/lookup", json={"username": "first.admin"}
    )
    repeated = TestClient(app).post(
        "/api/auth/passwordless/lookup",
        json={"username": "first.admin@pending.local"},
    )
    assert by_email.status_code == 200
    assert by_email.json() == repeated.json()
    assert (
        by_email.json()["auth"]["wrapped_private_key_b64"]
        != by_name.json()["auth"]["wrapped_private_key_b64"]
    )
    assert by_email.json()["auth"]["kdf_iterations"] == MIN_PBKDF2_ITERATIONS
    assert (
        by_name.json()["auth"]["wrapped_private_key_b64"]
        == material["auth"]["wrapped_private_key_b64"]
    )
    assert "username" not in by_email.text
    assert "wrapped_dek" not in by_email.text


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
    unknown = TestClient(app)
    unknown_lookup = unknown.post(
        "/api/auth/passwordless/lookup", json={"username": "unknown.user"}
    )
    repeated = unknown.post("/api/auth/passwordless/lookup", json={"username": "unknown.user"})
    assert known_lookup.status_code == unknown_lookup.status_code == repeated.status_code == 200
    assert unknown_lookup.json() == repeated.json()
    assert known_lookup.json().keys() == unknown_lookup.json().keys()
    assert known_lookup.json()["auth"].keys() == unknown_lookup.json()["auth"].keys()
    assert (
        known_lookup.json()["auth"]["kdf_iterations"]
        == unknown_lookup.json()["auth"]["kdf_iterations"]
        == MIN_PBKDF2_ITERATIONS
    )
    assert len(known_lookup.json()["auth"]["kdf_salt_b64"]) == len(
        unknown_lookup.json()["auth"]["kdf_salt_b64"]
    )
    assert len(known_lookup.json()["auth"]["wrapped_private_key_b64"]) == len(
        unknown_lookup.json()["auth"]["wrapped_private_key_b64"]
    )
    assert (
        len(base64.b64decode(unknown_lookup.json()["auth"]["wrapped_private_key_b64"]))
        == AUTH_WRAP_BYTES
    )
    other = TestClient(app).post(
        "/api/auth/passwordless/lookup", json={"username": "other.missing"}
    )
    assert other.json()["auth"]["kdf_salt_b64"] != unknown_lookup.json()["auth"]["kdf_salt_b64"]

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
    clear_limits()
    client = TestClient(app)

    assert (
        client.post("/api/auth/passwordless/lookup", json={"username": "unknown.user"}).status_code
        == 200
    )
    assert (
        client.post("/api/auth/passwordless/lookup", json={"username": "unknown.user"}).status_code
        == 429
    )
    clear_limits()


def test_passwordless_lookup_is_not_limited_per_account(monkeypatch):
    monkeypatch.setenv("AUTH_ACCOUNT_RATE_LIMIT_PER_MIN", "1")
    monkeypatch.setenv("AUTH_PAIR_RATE_LIMIT_PER_MIN", "1")
    monkeypatch.setenv("AUTH_IP_RATE_LIMIT_PER_MIN", "10")
    clear_limits()
    client = TestClient(app)

    assert (
        client.post("/api/auth/passwordless/lookup", json={"username": "alice.user"}).status_code
        == 200
    )
    assert (
        client.post("/api/auth/passwordless/lookup", json={"username": "alice.user"}).status_code
        == 200
    )
    assert (
        client.post("/api/auth/passwordless/challenge", json={"username": "alice.user"}).status_code
        == 200
    )
    assert (
        client.post("/api/auth/passwordless/challenge", json={"username": "alice.user"}).status_code
        == 429
    )
    assert (
        client.post("/api/auth/passwordless/challenge", json={"username": "bob.user"}).status_code
        == 200
    )

    monkeypatch.setenv("AUTH_PAIR_RATE_LIMIT_PER_MIN", "10")
    monkeypatch.setenv("AUTH_IP_RATE_LIMIT_PER_MIN", "1")
    clear_limits()
    assert (
        client.post("/api/auth/passwordless/challenge", json={"username": "alice.user"}).status_code
        == 200
    )
    assert (
        client.post("/api/auth/passwordless/challenge", json={"username": "bob.user"}).status_code
        == 429
    )


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


def test_open_passwordless_signup_creates_user_without_invitation(monkeypatch):
    monkeypatch.setenv("AUTH_SIGNUP_MODE", "open")
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


def _enroll_legacy_user(private_key):
    """Insert an already-enrolled account the way production stored 310k wraps."""
    from apps.finance.backend.auth import utc_now_naive
    from apps.finance.backend.database import SessionLocal
    from apps.finance.backend.models import User, UserVault

    public_key_b64 = base64.b64encode(
        private_key.public_key().public_bytes(
            serialization.Encoding.DER, serialization.PublicFormat.SubjectPublicKeyInfo
        )
    ).decode()
    db = SessionLocal()
    try:
        user = User(
            email="legacy.user@pending.local",
            display_name="Legacy User",
            role=UserRole.user,
            is_active=True,
            must_change_password=False,
            username="legacy.user",
            auth_public_key_b64=public_key_b64,
            auth_algorithm="ECDSA_P256_SHA256",
            auth_key_version=1,
            auth_kdf_salt_b64=_b64(16),
            auth_kdf_iterations=LEGACY_PBKDF2_ITERATIONS,
            auth_wrapped_private_key_b64=_b64(AUTH_WRAP_BYTES),
            auth_recovery_wrapped_private_key_b64="legacy-auth-recovery-not-served",
            passwordless_enrolled_at=utc_now_naive(),
        )
        db.add(user)
        db.flush()
        db.add(
            UserVault(
                user_id=user.id,
                kdf_algorithm="PBKDF2",
                kdf_salt_b64=_b64(16),
                kdf_iterations=LEGACY_PBKDF2_ITERATIONS,
                wrapped_dek_b64=_b64(60),
                recovery_wrapped_dek_b64="legacy-dek-recovery-not-served",
                key_version=1,
            )
        )
        db.commit()
    finally:
        db.close()
    return public_key_b64


def _verify(client: TestClient, private_key, username: str) -> dict:
    challenge = client.post("/api/auth/passwordless/challenge", json={"username": username}).json()
    payload = {
        "username": username,
        "challenge_id": challenge["challenge_id"],
        "challenge": challenge["challenge"],
        "message": challenge["message"],
        "signature_b64": _raw_signature(private_key, challenge["message"]),
    }
    response = client.post("/api/auth/passwordless/verify", json=payload)
    assert response.status_code == 200, response.text
    return response.json()


def test_existing_user_with_legacy_kdf_can_still_log_in_and_rewrap(caplog):
    private_key = ec.generate_private_key(ec.SECP256R1())
    _enroll_legacy_user(private_key)
    anonymous = TestClient(app)

    lookup = anonymous.post("/api/auth/passwordless/lookup", json={"username": "legacy.user"})
    assert lookup.status_code == 200
    assert lookup.json()["auth"]["kdf_iterations"] == LEGACY_PBKDF2_ITERATIONS
    assert "wrapped_dek" not in lookup.text
    assert "legacy-auth-recovery" not in lookup.text
    assert "legacy-dek-recovery" not in lookup.text
    by_email = anonymous.post(
        "/api/auth/passwordless/lookup", json={"username": "legacy.user@pending.local"}
    )
    assert (
        by_email.json()["auth"]["wrapped_private_key_b64"]
        != lookup.json()["auth"]["wrapped_private_key_b64"]
    )
    assert by_email.json()["auth"]["kdf_iterations"] == MIN_PBKDF2_ITERATIONS

    client = TestClient(app)
    session = _verify(client, private_key, "legacy.user")
    client.headers["X-CSRF-Token"] = session["csrf_token"]
    stored = client.get("/api/auth/passwordless/wraps")
    assert stored.status_code == 200
    assert stored.json()["auth"]["kdf_iterations"] == LEGACY_PBKDF2_ITERATIONS
    assert "legacy-auth-recovery" not in stored.text
    assert TestClient(app).get("/api/auth/passwordless/wraps").status_code == 401
    vault = client.get("/api/vault/status")
    assert vault.status_code == 200
    assert vault.json()["kdf_iterations"] == LEGACY_PBKDF2_ITERATIONS
    assert vault.json()["exists"] is True
    assert TestClient(app).get("/api/vault/status").status_code == 401

    upgraded_auth = {
        "kdf_salt_b64": _b64(16),
        "kdf_iterations": MIN_PBKDF2_ITERATIONS,
        "wrapped_private_key_b64": _b64(AUTH_WRAP_BYTES),
        "recovery_wrapped_private_key_b64": "",
    }
    with caplog.at_level(logging.INFO, logger="finance.auth"):
        assert client.put("/api/auth/passwordless/wraps", json=upgraded_auth).status_code == 200
        assert (
            client.put(
                "/api/vault/wraps",
                json={
                    "kdf_salt_b64": _b64(16),
                    "kdf_iterations": MIN_PBKDF2_ITERATIONS,
                    "wrapped_dek_b64": _b64(60),
                },
            ).status_code
            == 200
        )
    assert "signing-key wrap KDF iterations raised" in caplog.text
    assert "vault wrap KDF iterations raised" in caplog.text

    again = TestClient(app)
    assert (
        again.post("/api/auth/passwordless/lookup", json={"username": "legacy.user"}).json()[
            "auth"
        ]["kdf_iterations"]
        == MIN_PBKDF2_ITERATIONS
    )
    _verify(again, private_key, "legacy.user")
    assert again.get("/api/vault/status").json()["kdf_iterations"] == MIN_PBKDF2_ITERATIONS


def test_signup_is_closed_by_default_and_does_not_enumerate_usernames():
    client = TestClient(app)
    assert (
        client.post(
            "/api/auth/bootstrap/passwordless",
            json={
                "username": "first.admin",
                "display_name": "First Admin",
                **passwordless_material(),
            },
        ).status_code
        == 200
    )
    policy = client.get("/api/auth/signup-policy")
    assert policy.json() == {"mode": "closed", "signup_open": False, "invite_code_required": False}

    taken = TestClient(app).post(
        "/api/auth/signup/passwordless",
        json={
            "username": "first.admin",
            "display_name": "Taken",
            **passwordless_material(),
        },
    )
    missing = TestClient(app).post(
        "/api/auth/signup/passwordless",
        json={
            "username": "missing.user",
            "display_name": "Missing",
            **passwordless_material(),
        },
    )
    assert taken.status_code == missing.status_code == 403
    assert taken.json() == missing.json() == {"detail": "Signup is not available"}


def test_signup_invite_code_and_allowlist(monkeypatch):
    monkeypatch.setenv("AUTH_SIGNUP_MODE", "invite")
    monkeypatch.setenv("AUTH_INVITE_CODES", "household-code")
    client = TestClient(app)
    assert (
        client.post(
            "/api/auth/bootstrap/passwordless",
            json={
                "username": "first.admin",
                "display_name": "First Admin",
                **passwordless_material(),
            },
        ).status_code
        == 200
    )

    wrong = TestClient(app).post(
        "/api/auth/signup/passwordless",
        json={
            "username": "invited.user",
            "invite_code": "nope",
            **passwordless_material(),
        },
    )
    missing_code = TestClient(app).post(
        "/api/auth/signup/passwordless",
        json={
            "username": "invited.user",
            **passwordless_material(),
        },
    )
    assert wrong.status_code == missing_code.status_code == 403
    assert wrong.json() == missing_code.json()

    created = TestClient(app).post(
        "/api/auth/signup/passwordless",
        json={
            "username": "invited.user",
            "display_name": "Invited",
            "invite_code": "household-code",
            **passwordless_material(),
        },
    )
    assert created.status_code == 200
    assert created.json()["user"]["role"] == "user"
    duplicate = TestClient(app).post(
        "/api/auth/signup/passwordless",
        json={
            "username": "invited.user",
            "invite_code": "household-code",
            **passwordless_material(),
        },
    )
    unknown = TestClient(app).post(
        "/api/auth/signup/passwordless",
        json={
            "username": "someone.else",
            "invite_code": "household-code",
            **passwordless_material(),
        },
    )
    # The second name is new, so it succeeds. The taken name uses the same 403 as a failed code,
    # which is covered above. A second successful signup is fine; existence of the first is not a 409.
    assert duplicate.status_code == 403
    assert duplicate.json()["detail"] == "Signup is not available"
    assert unknown.status_code == 200

    monkeypatch.setenv("AUTH_SIGNUP_MODE", "allowlist")
    monkeypatch.setenv("AUTH_SIGNUP_ALLOWLIST", "household.user")
    blocked = TestClient(app).post(
        "/api/auth/signup/passwordless",
        json={
            "username": "not.listed",
            **passwordless_material(),
        },
    )
    allowed = TestClient(app).post(
        "/api/auth/signup/passwordless",
        json={
            "username": "household.user",
            "display_name": "Household",
            **passwordless_material(),
        },
    )
    assert blocked.status_code == 403
    assert blocked.json()["detail"] == "Signup is not available"
    assert allowed.status_code == 200
    taken_allowance = TestClient(app).post(
        "/api/auth/signup/passwordless",
        json={
            "username": "household.user",
            **passwordless_material(),
        },
    )
    assert taken_allowance.status_code == 403
    assert taken_allowance.json() == blocked.json()


def test_attacker_pair_budget_does_not_block_login_from_another_ip(monkeypatch):
    monkeypatch.setenv("AUTH_PAIR_RATE_LIMIT_PER_MIN", "2")
    monkeypatch.setenv("AUTH_FAILED_VERIFY_RATE_LIMIT_PER_MIN", "60")
    monkeypatch.setenv("AUTH_IP_RATE_LIMIT_PER_MIN", "100")
    monkeypatch.setenv("RATE_LIMIT_PER_MIN", "")
    clear_limits()
    private_key = ec.generate_private_key(ec.SECP256R1())
    _enroll_legacy_user(private_key)
    attacker = TestClient(app, client=("203.0.113.5", 50000))
    owner = TestClient(app, client=("203.0.113.9", 50000))

    assert (
        attacker.post(
            "/api/auth/passwordless/challenge", json={"username": "legacy.user"}
        ).status_code
        == 200
    )
    assert (
        attacker.post(
            "/api/auth/passwordless/challenge", json={"username": "legacy.user"}
        ).status_code
        == 200
    )
    assert (
        attacker.post(
            "/api/auth/passwordless/challenge", json={"username": "legacy.user"}
        ).status_code
        == 429
    )
    assert (
        attacker.post("/api/auth/passwordless/lookup", json={"username": "legacy.user"}).status_code
        == 200
    )
    assert (
        attacker.post("/api/auth/passwordless/lookup", json={"username": "legacy.user"}).status_code
        == 200
    )

    _verify(owner, private_key, "legacy.user")
    assert owner.get("/api/vault/status").status_code == 200


def test_failed_verify_cap_counts_failures_for_the_account(monkeypatch):
    monkeypatch.setenv("AUTH_PAIR_RATE_LIMIT_PER_MIN", "20")
    monkeypatch.setenv("AUTH_FAILED_VERIFY_RATE_LIMIT_PER_MIN", "1")
    monkeypatch.setenv("AUTH_IP_RATE_LIMIT_PER_MIN", "100")
    clear_limits()
    private_key = ec.generate_private_key(ec.SECP256R1())
    _enroll_legacy_user(private_key)
    attacker = TestClient(app, client=("203.0.113.5", 50000))
    other = TestClient(app, client=("203.0.113.9", 50000))
    forged = {
        "challenge_id": "not-a-real-challenge",
        "challenge": "y" * 32,
        "message": "not-a-real-challenge-message",
        "signature_b64": _b64(64),
    }
    bad = attacker.post("/api/auth/passwordless/verify", json={"username": "legacy.user", **forged})
    assert bad.status_code == 401
    blocked = other.post(
        "/api/auth/passwordless/verify", json={"username": "legacy.user", **forged}
    )
    unknown = other.post(
        "/api/auth/passwordless/verify", json={"username": "nobody.user", **forged}
    )
    assert blocked.status_code == 429
    assert unknown.status_code == 401
    _verify(TestClient(app, client=("203.0.113.10", 50000)), private_key, "legacy.user")


def test_valid_signature_succeeds_while_the_failed_verify_cap_is_tripped(monkeypatch):
    monkeypatch.setenv("AUTH_PAIR_RATE_LIMIT_PER_MIN", "20")
    monkeypatch.setenv("AUTH_FAILED_VERIFY_RATE_LIMIT_PER_MIN", "60")
    monkeypatch.setenv("AUTH_IP_RATE_LIMIT_PER_MIN", "100")
    monkeypatch.setenv("RATE_LIMIT_PER_MIN", "")
    clear_limits()
    private_key = ec.generate_private_key(ec.SECP256R1())
    _enroll_legacy_user(private_key)
    forged = {
        "username": "legacy.user",
        "challenge_id": "not-a-real-challenge",
        "challenge": "y" * 32,
        "message": "not-a-real-challenge-message",
        "signature_b64": _b64(64),
    }
    for host in ("198.51.100.1", "198.51.100.2", "198.51.100.3"):
        attacker = TestClient(app, client=(host, 50000))
        for _ in range(20):
            assert attacker.post("/api/auth/passwordless/verify", json=forged).status_code == 401
    assert (
        TestClient(app, client=("198.51.100.4", 50000))
        .post("/api/auth/passwordless/verify", json=forged)
        .status_code
        == 429
    )
    _verify(TestClient(app, client=("203.0.113.9", 50000)), private_key, "legacy.user")


def test_session_wrap_updates_are_not_on_the_login_budget(monkeypatch):
    monkeypatch.setenv("AUTH_IP_RATE_LIMIT_PER_MIN", "10")
    monkeypatch.setenv("AUTH_ACCOUNT_RATE_LIMIT_PER_MIN", "1")
    clear_limits()
    private_key = ec.generate_private_key(ec.SECP256R1())
    _enroll_legacy_user(private_key)
    client = TestClient(app, client=("203.0.113.8", 50000))
    session = _verify(client, private_key, "legacy.user")
    client.headers["X-CSRF-Token"] = session["csrf_token"]
    monkeypatch.setenv("AUTH_IP_RATE_LIMIT_PER_MIN", "1")
    clear_limits()
    body = {
        "kdf_salt_b64": _b64(16),
        "kdf_iterations": MIN_PBKDF2_ITERATIONS,
        "wrapped_private_key_b64": _b64(AUTH_WRAP_BYTES),
        "recovery_wrapped_private_key_b64": "",
    }
    assert client.put("/api/auth/passwordless/wraps", json=body).status_code == 200
    assert client.put("/api/auth/passwordless/wraps", json=body).status_code == 200
    anonymous = TestClient(app, client=("203.0.113.8", 50000))
    assert (
        anonymous.post(
            "/api/auth/passwordless/lookup", json={"username": "legacy.user"}
        ).status_code
        == 200
    )
    assert (
        anonymous.post(
            "/api/auth/passwordless/lookup", json={"username": "legacy.user"}
        ).status_code
        == 429
    )


def test_spoofed_forwarded_for_does_not_split_the_ip_bucket(monkeypatch):
    monkeypatch.setenv("AUTH_IP_RATE_LIMIT_PER_MIN", "1")
    monkeypatch.setenv("RATE_LIMIT_PER_MIN", "")
    clear_limits()
    client = TestClient(app, client=("203.0.113.7", 50000))
    first = client.post(
        "/api/auth/passwordless/lookup",
        json={"username": "alice.user"},
        headers={"X-Forwarded-For": "198.51.100.1"},
    )
    second = client.post(
        "/api/auth/passwordless/lookup",
        json={"username": "alice.user"},
        headers={"X-Forwarded-For": "198.51.100.2"},
    )
    assert first.status_code == 200
    assert second.status_code == 429


def test_client_key_buckets_ipv6_by_prefix_and_ignores_forwarded_for():
    from starlette.requests import Request

    from apps.finance.backend.rate_limit import _client_key

    def request_from(host: str, forwarded: str | None = None) -> Request:
        headers = []
        if forwarded is not None:
            headers.append((b"x-forwarded-for", forwarded.encode()))
        return Request(
            {
                "type": "http",
                "asgi": {"version": "3.0"},
                "http_version": "1.1",
                "method": "POST",
                "scheme": "http",
                "path": "/",
                "raw_path": b"/",
                "query_string": b"",
                "headers": headers,
                "client": (host, 1234),
                "server": ("test", 80),
            }
        )

    left = _client_key(request_from("203.0.113.5", "198.51.100.9"))
    right = _client_key(request_from("203.0.113.5", "198.51.100.10"))
    assert left == right == "203.0.113.5"
    assert _client_key(request_from("2001:db8:1:2::1")) == _client_key(
        request_from("2001:db8:1:2::abcd")
    )
    assert _client_key(request_from("2001:db8:1:2::1")) != _client_key(
        request_from("2001:db8:1:3::1")
    )
    assert _client_key(request_from("::ffff:203.0.113.5")) == "203.0.113.5"


def test_new_rate_limit_bucket_uses_a_clock_past_the_first_minute():
    """A missing bucket must open its window even when the host just booted.

    ``window_start`` defaults to 0. On a machine up for less than 60 seconds,
    ``time.monotonic() - 0 < 60`` and the reset in ``_consume`` does not run.
    The finance conftest shifts that clock so coverage does not depend on uptime.
    """
    from apps.finance.backend import rate_limit

    clear_limits()
    assert rate_limit._consume(rate_limit._auth_ip_buckets, "203.0.113.77", 5) is True
    _count, window_start = rate_limit._auth_ip_buckets["203.0.113.77"]
    assert window_start >= 10_000


def test_rate_limit_table_evicts_the_oldest_key():
    from apps.finance.backend import rate_limit

    clear_limits()
    for index in range(rate_limit._MAX_BUCKETS):
        assert rate_limit._consume(rate_limit._auth_ip_buckets, f"198.51.100.{index}", 2)
    assert rate_limit._consume(rate_limit._auth_ip_buckets, "203.0.113.50", 2) is True
    assert "203.0.113.50" in rate_limit._auth_ip_buckets
    assert "198.51.100.0" not in rate_limit._auth_ip_buckets
    assert len(rate_limit._auth_ip_buckets) == rate_limit._MAX_BUCKETS
    assert rate_limit._consume(rate_limit._auth_ip_buckets, "203.0.113.50", 2) is True
    assert rate_limit._consume(rate_limit._auth_ip_buckets, "203.0.113.50", 2) is False


def test_decoy_secret_file_survives_restart_and_a_short_file_is_replaced(
    tmp_path, monkeypatch, caplog
):
    from apps.finance.backend.services.auth_decoy import (
        decoy_passwordless_material,
        reset_decoy_state,
    )

    monkeypatch.delenv("AUTH_DECOY_SECRET", raising=False)
    database = tmp_path / "site.db"
    database.write_bytes(b"")
    monkeypatch.setattr(
        "apps.finance.backend.database.SQLALCHEMY_DATABASE_URL",
        f"sqlite:///{database}",
    )
    reset_decoy_state()
    first = decoy_passwordless_material("ghost.user")
    secret = tmp_path / "auth-decoy-secret"
    assert secret.stat().st_size >= 32
    assert secret.stat().st_mode & 0o777 == 0o600
    reset_decoy_state()
    assert decoy_passwordless_material("ghost.user") == first

    secret.write_bytes(b"short")
    reset_decoy_state()
    with caplog.at_level(logging.ERROR, logger="finance.auth"):
        regenerated = decoy_passwordless_material("ghost.user")
    assert "regenerating" in caplog.text
    assert regenerated != first
    assert secret.stat().st_size >= 32
    assert not list(tmp_path.glob(".auth-decoy-secret.*"))
    reset_decoy_state()
    assert decoy_passwordless_material("ghost.user") == regenerated
    reset_decoy_state()


def test_unreadable_decoy_secret_is_left_in_place(tmp_path, monkeypatch, caplog):
    from pathlib import Path

    from apps.finance.backend.services.auth_decoy import (
        decoy_passwordless_material,
        reset_decoy_state,
    )

    monkeypatch.delenv("AUTH_DECOY_SECRET", raising=False)
    database = tmp_path / "site.db"
    database.write_bytes(b"")
    secret = tmp_path / "auth-decoy-secret"
    original = b"k" * 32
    secret.write_bytes(original)
    monkeypatch.setattr(
        "apps.finance.backend.database.SQLALCHEMY_DATABASE_URL",
        f"sqlite:///{database}",
    )
    original_read = Path.read_bytes

    def deny(self, *args, **kwargs):
        if self == secret:
            raise PermissionError(13, "Permission denied")
        return original_read(self, *args, **kwargs)

    monkeypatch.setattr(Path, "read_bytes", deny)
    reset_decoy_state()
    with caplog.at_level(logging.ERROR, logger="finance.auth"):
        decoy_passwordless_material("ghost.user")
    assert "cannot be read" in caplog.text
    assert "process-local" in caplog.text
    assert original_read(secret) == original
    reset_decoy_state()


def test_bootstrap_rejects_a_weaker_than_current_kdf():
    material = passwordless_material()
    material["auth"]["kdf_iterations"] = LEGACY_PBKDF2_ITERATIONS
    material["vault"]["kdf_iterations"] = LEGACY_PBKDF2_ITERATIONS
    response = TestClient(app).post(
        "/api/auth/bootstrap/passwordless",
        json={
            "username": "first.admin",
            "display_name": "First Admin",
            **material,
        },
    )
    assert response.status_code == 422
