"""Username changes keep the user id, sessions, and wrapped keys."""

import base64
import json
import os

os.environ["DATABASE_URL"] = "sqlite:///:memory:"

from cryptography.exceptions import InvalidTag
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.hazmat.primitives.asymmetric.utils import decode_dss_signature
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
from fastapi.testclient import TestClient
from sqlalchemy import delete
from sqlalchemy.exc import IntegrityError

from apps.finance.backend.database import SessionLocal
from apps.finance.backend.kdf_policy import MIN_PBKDF2_ITERATIONS
from apps.finance.backend.main import Base, app, engine
from apps.finance.backend.models import AuditEvent
from apps.finance.backend.rate_limit import clear_limits
from apps.finance.backend.services.auth_decoy import AUTH_WRAP_BYTES

PASSPHRASE = "correct horse battery staple"
COLLECTION = "assets"
CLIENT_ID = "asset_0001"


def setup_function():
    Base.metadata.create_all(bind=engine)
    clear_limits()
    with engine.begin() as conn:
        for table in reversed(Base.metadata.sorted_tables):
            conn.execute(delete(table))


def _b64(raw: bytes) -> str:
    return base64.b64encode(raw).decode("ascii")


def _raw_signature(private_key, message: str) -> str:
    der = private_key.sign(message.encode(), ec.ECDSA(hashes.SHA256()))
    r, s = decode_dss_signature(der)
    return _b64(r.to_bytes(32, "big") + s.to_bytes(32, "big"))


def _derive(passphrase: str, salt: bytes, iterations: int) -> bytes:
    return PBKDF2HMAC(
        algorithm=hashes.SHA256(), length=32, salt=salt, iterations=iterations
    ).derive(passphrase.encode())


def _pack(key: bytes, plaintext: bytes, aad: bytes | None = None) -> str:
    iv = os.urandom(12)
    return _b64(iv + AESGCM(key).encrypt(iv, plaintext, aad))


def _unpack(key: bytes, packed_b64: str, aad: bytes | None = None) -> bytes:
    packed = base64.b64decode(packed_b64)
    return AESGCM(key).decrypt(packed[:12], packed[12:], aad)


def _record_aad() -> bytes:
    return json.dumps([COLLECTION, CLIENT_ID, 1, 1], separators=(",", ":")).encode()


def _signing_material(passphrase: str | None):
    private_key = ec.generate_private_key(ec.SECP256R1())
    public_key_b64 = _b64(
        private_key.public_key().public_bytes(
            serialization.Encoding.DER, serialization.PublicFormat.SubjectPublicKeyInfo
        )
    )
    if passphrase is None:
        auth = {
            "kdf_salt_b64": _b64(b"s" * 16),
            "kdf_iterations": MIN_PBKDF2_ITERATIONS,
            "wrapped_private_key_b64": _b64(b"w" * AUTH_WRAP_BYTES),
            "recovery_wrapped_private_key_b64": "",
        }
        vault = {
            "kdf_salt_b64": _b64(b"t" * 16),
            "kdf_iterations": MIN_PBKDF2_ITERATIONS,
            "wrapped_dek_b64": _b64(b"d" * 60),
            "recovery_wrapped_dek_b64": "",
        }
        return private_key, public_key_b64, auth, vault, None

    auth_salt = os.urandom(16)
    vault_salt = os.urandom(16)
    dek = os.urandom(32)
    pkcs8 = private_key.private_bytes(
        serialization.Encoding.DER,
        serialization.PrivateFormat.PKCS8,
        serialization.NoEncryption(),
    )
    auth_key = _derive(passphrase, auth_salt, MIN_PBKDF2_ITERATIONS)
    vault_key = _derive(passphrase, vault_salt, MIN_PBKDF2_ITERATIONS)
    auth = {
        "kdf_salt_b64": _b64(auth_salt),
        "kdf_iterations": MIN_PBKDF2_ITERATIONS,
        "wrapped_private_key_b64": _pack(auth_key, pkcs8),
        "recovery_wrapped_private_key_b64": "",
    }
    vault = {
        "kdf_salt_b64": _b64(vault_salt),
        "kdf_iterations": MIN_PBKDF2_ITERATIONS,
        "wrapped_dek_b64": _pack(vault_key, dek),
        "recovery_wrapped_dek_b64": "",
    }
    return private_key, public_key_b64, auth, vault, dek


def _signup(username: str, *, passphrase: str | None = None):
    private_key, public_key_b64, auth, vault, dek = _signing_material(passphrase)
    client = TestClient(app)
    response = client.post(
        "/api/auth/signup/passwordless",
        json={
            "username": username,
            "display_name": username,
            "public_key_b64": public_key_b64,
            "auth": auth,
            "vault": vault,
        },
    )
    assert response.status_code == 200, response.text
    client.headers["X-CSRF-Token"] = response.json()["csrf_token"]
    return client, private_key, auth, vault, dek


def _proof(client: TestClient, private_key, username: str, purpose: str = "login") -> dict:
    challenge = client.post(
        "/api/auth/passwordless/challenge",
        json={"username": username, "purpose": purpose},
    ).json()
    return {
        "challenge_id": challenge["challenge_id"],
        "challenge": challenge["challenge"],
        "message": challenge["message"],
        "signature_b64": _raw_signature(private_key, challenge["message"]),
    }


def _rename(client: TestClient, private_key, current: str, new_name: str, **extra):
    body = {
        "username": new_name,
        **_proof(client, private_key, current, purpose="username_change"),
    }
    body.update(extra)
    return client.patch("/api/account/username", json=body)


def _audits() -> list[dict]:
    db = SessionLocal()
    try:
        rows = (
            db.query(AuditEvent)
            .filter(AuditEvent.event_type == "username_changed")
            .order_by(AuditEvent.id.asc())
            .all()
        )
        return [{"detail": row.detail, "created_at": row.created_at} for row in rows]
    finally:
        db.close()


def _open_signup(monkeypatch):
    monkeypatch.setenv("AUTH_SIGNUP_MODE", "open")


def test_rename_keeps_sessions_and_decrypts_with_the_same_wraps(monkeypatch):
    _open_signup(monkeypatch)
    client, private_key, auth, vault, dek = _signup("owner.name", passphrase=PASSPHRASE)
    assert dek is not None
    ciphertext = _pack(dek, json.dumps({"name": "savings"}).encode(), _record_aad())
    stored = client.post(
        "/api/vault/records/upsert",
        json={
            "records": [
                {
                    "collection": COLLECTION,
                    "client_id": CLIENT_ID,
                    "ciphertext_b64": ciphertext,
                    "schema_version": 1,
                    "key_version": 1,
                }
            ]
        },
    )
    assert stored.status_code == 200, stored.text

    same = _rename(client, private_key, "owner.name", "owner.name")
    assert same.status_code == 200, same.text
    assert same.json()["username"] == "owner.name"
    case_only = _rename(client, private_key, "owner.name", "Owner.Name")
    assert case_only.status_code == 200, case_only.text
    assert case_only.json()["username"] == "owner.name"
    assert case_only.json()["email"] == "owner.name@pending.local"

    other = TestClient(app)
    login = other.post(
        "/api/auth/passwordless/verify",
        json={"username": "owner.name", **_proof(other, private_key, "owner.name")},
    )
    assert login.status_code == 200, login.text
    other_cookie = other.cookies.get("finance_session")

    renamed = _rename(client, private_key, "owner.name", "renamed.owner")
    assert renamed.status_code == 200, renamed.text
    assert renamed.json()["username"] == "renamed.owner"
    assert renamed.json()["email"] == "renamed.owner@pending.local"

    me = client.get("/api/auth/me")
    assert me.status_code == 200
    assert me.json()["user"]["username"] == "renamed.owner"
    still = TestClient(app)
    still.cookies.set("finance_session", other_cookie)
    assert still.get("/api/auth/me").json()["user"]["username"] == "renamed.owner"

    status = client.get("/api/vault/status")
    assert status.status_code == 200
    body = status.json()
    assert body["kdf_salt_b64"] == vault["kdf_salt_b64"]
    assert body["wrapped_dek_b64"] == vault["wrapped_dek_b64"]
    lookup = TestClient(app).post(
        "/api/auth/passwordless/lookup", json={"username": "renamed.owner"}
    )
    assert lookup.json()["auth"]["kdf_salt_b64"] == auth["kdf_salt_b64"]
    assert lookup.json()["auth"]["wrapped_private_key_b64"] == auth["wrapped_private_key_b64"]

    opened = _unpack(
        _derive(PASSPHRASE, base64.b64decode(body["kdf_salt_b64"]), body["kdf_iterations"]),
        body["wrapped_dek_b64"],
    )
    row = client.get("/api/vault/records?collection=assets").json()[0]
    plain = json.loads(_unpack(opened, row["ciphertext_b64"], _record_aad()))
    assert plain == {"name": "savings"}

    fresh = TestClient(app)
    signed_in = fresh.post(
        "/api/auth/passwordless/verify",
        json={"username": "renamed.owner", **_proof(fresh, private_key, "renamed.owner")},
    )
    assert signed_in.status_code == 200, signed_in.text
    rejected = fresh.post(
        "/api/auth/passwordless/verify",
        json={"username": "owner.name", **_proof(fresh, private_key, "owner.name")},
    )
    assert rejected.status_code == 401

    rows = _audits()
    details = [json.loads(row["detail"] or "{}") for row in rows]
    assert any(
        item["success"] is True and item["new_username"] == "renamed.owner" for item in details
    )
    assert all(PASSPHRASE not in (row["detail"] or "") for row in rows)
    assert rows[-1]["created_at"] is not None


def test_wrong_passphrase_does_not_rename(monkeypatch):
    _open_signup(monkeypatch)
    client, private_key, auth, _vault, _dek = _signup("owner.name", passphrase=PASSPHRASE)
    wrong = _derive(
        "wrong passphrase!!", base64.b64decode(auth["kdf_salt_b64"]), auth["kdf_iterations"]
    )
    try:
        _unpack(wrong, auth["wrapped_private_key_b64"])
    except InvalidTag:
        pass
    else:
        raise AssertionError("wrong passphrase unwrapped the signing key")

    other_key = ec.generate_private_key(ec.SECP256R1())
    challenge = client.post(
        "/api/auth/passwordless/challenge", json={"username": "owner.name"}
    ).json()
    response = client.patch(
        "/api/account/username",
        json={
            "username": "renamed.owner",
            "challenge_id": challenge["challenge_id"],
            "challenge": challenge["challenge"],
            "message": challenge["message"],
            "signature_b64": _raw_signature(other_key, challenge["message"]),
        },
    )
    assert response.status_code == 401
    assert client.get("/api/auth/me").json()["user"]["username"] == "owner.name"
    row = _audits()[-1]
    detail = json.loads(row["detail"] or "{}")
    assert detail["success"] is False
    assert detail["old_username"] == "owner.name"
    assert detail["new_username"] == "renamed.owner"
    assert "wrong passphrase" not in (row["detail"] or "")
    assert challenge["challenge"] not in (row["detail"] or "")
    assert private_key is not None


def test_collision_includes_a_different_case(monkeypatch):
    _open_signup(monkeypatch)
    owner, owner_key, _auth, _vault, _dek = _signup("owner.name")
    _signup("other.user")
    same = _rename(owner, owner_key, "owner.name", "other.user")
    different_case = _rename(owner, owner_key, "owner.name", "Other.User")
    assert same.status_code == 409
    assert different_case.status_code == 409
    assert owner.get("/api/auth/me").json()["user"]["username"] == "owner.name"
    assert json.loads(_audits()[-1]["detail"] or "{}")["success"] is False


def test_invalid_username_is_400(monkeypatch):
    _open_signup(monkeypatch)
    client, private_key, _auth, _vault, _dek = _signup("owner.name")
    for candidate in ("ab", "has space", "user@email.com", "bad/name", "a" * 65, ""):
        response = _rename(client, private_key, "owner.name", candidate)
        assert response.status_code == 400, candidate
        assert response.json()["detail"] == "Invalid username"
    assert client.get("/api/auth/me").json()["user"]["username"] == "owner.name"


def test_missing_csrf_is_rejected(monkeypatch):
    _open_signup(monkeypatch)
    client, private_key, _auth, _vault, _dek = _signup("owner.name")
    bare = TestClient(app)
    bare.cookies.set("finance_session", client.cookies.get("finance_session"))
    response = bare.patch(
        "/api/account/username",
        json={"username": "renamed.owner", **_proof(client, private_key, "owner.name")},
    )
    assert response.status_code == 403
    assert client.get("/api/auth/me").json()["user"]["username"] == "owner.name"


def test_username_change_is_rate_limited(monkeypatch):
    _open_signup(monkeypatch)
    client, private_key, _auth, _vault, _dek = _signup("owner.name")

    monkeypatch.setenv("AUTH_PAIR_RATE_LIMIT_PER_MIN", "1")
    monkeypatch.setenv("AUTH_IP_RATE_LIMIT_PER_MIN", "100")
    monkeypatch.delenv("RATE_LIMIT_PER_MIN", raising=False)
    clear_limits()
    blocked = _rename(client, private_key, "owner.name", "renamed.owner")
    assert blocked.status_code == 429
    assert client.get("/api/auth/me").json()["user"]["username"] == "owner.name"

    monkeypatch.setenv("AUTH_PAIR_RATE_LIMIT_PER_MIN", "100")
    monkeypatch.setenv("AUTH_IP_RATE_LIMIT_PER_MIN", "1")
    clear_limits()
    limited_ip = _rename(client, private_key, "owner.name", "renamed.owner")
    assert limited_ip.status_code == 429

    monkeypatch.setenv("AUTH_IP_RATE_LIMIT_PER_MIN", "100")
    monkeypatch.setenv("RATE_LIMIT_PER_MIN", "1")
    clear_limits()
    assert (
        client.post("/api/auth/passwordless/challenge", json={"username": "owner.name"}).status_code
        == 200
    )
    limited_shared = client.patch(
        "/api/account/username",
        json={
            "username": "renamed.owner",
            "challenge_id": "c" * 16,
            "challenge": "d" * 32,
            "message": "vault-auth-v1",
            "signature_b64": "e" * 16,
        },
    )
    assert limited_shared.status_code == 429

    monkeypatch.setenv("RATE_LIMIT_PER_MIN", "100")
    monkeypatch.setenv("AUTH_FAILED_VERIFY_RATE_LIMIT_PER_MIN", "1")
    clear_limits()
    challenge = client.post(
        "/api/auth/passwordless/challenge", json={"username": "owner.name"}
    ).json()
    forged = {
        "username": "renamed.owner",
        "challenge_id": challenge["challenge_id"],
        "challenge": challenge["challenge"],
        "message": challenge["message"],
        "signature_b64": _b64(b"\x01" * 64),
    }
    assert client.patch("/api/account/username", json=forged).status_code == 401
    assert client.patch("/api/account/username", json=forged).status_code == 429
    assert client.get("/api/auth/me").json()["user"]["username"] == "owner.name"


def test_legacy_email_stays_and_a_taken_mailbox_conflicts(monkeypatch):
    _open_signup(monkeypatch)
    from apps.finance.backend.auth import create_user

    db = SessionLocal()
    try:
        create_user(
            db, email="legacy@example.com", display_name="Legacy", password="legacy-password"
        )
        db.commit()
    finally:
        db.close()
    client = TestClient(app)
    login = client.post(
        "/api/auth/login/migrate",
        json={"email": "legacy@example.com", "password": "legacy-password"},
    )
    client.headers["X-CSRF-Token"] = login.json()["csrf_token"]
    private_key, public_key_b64, auth, vault, _dek = _signing_material(None)
    enrolled = client.post(
        "/api/auth/passwordless/enroll",
        json={
            "username": "legacy.user",
            "public_key_b64": public_key_b64,
            "auth": auth,
            "vault": vault,
        },
    )
    assert enrolled.status_code == 200, enrolled.text
    renamed = _rename(client, private_key, "legacy.user", "renamed.legacy")
    assert renamed.status_code == 200, renamed.text
    assert renamed.json()["email"] == "legacy@example.com"
    assert renamed.json()["username"] == "renamed.legacy"

    _holder, _key, _auth, _vault, _dek = _signup("mailbox.holder")
    db = SessionLocal()
    try:
        from apps.finance.backend.models import User

        row = db.query(User).filter(User.username == "mailbox.holder").one()
        field = "email"
        setattr(row, field, "taken.name@pending.local")
        db.commit()
    finally:
        db.close()

    synthetic, synthetic_key, _a, _v, _d = _signup("synthetic.user")
    blocked = _rename(synthetic, synthetic_key, "synthetic.user", "taken.name")
    assert blocked.status_code == 409
    assert synthetic.get("/api/auth/me").json()["user"]["username"] == "synthetic.user"


def _retarget_username(current: str, username: str, email: str | None = None) -> None:
    from apps.finance.backend.models import User

    db = SessionLocal()
    try:
        row = db.query(User).filter(User.username == current).one()
        name_field = "username"
        setattr(row, name_field, username)
        if email is not None:
            mail_field = "email"
            setattr(row, mail_field, email)
        db.commit()
    finally:
        db.close()


def test_legacy_email_username_changes_without_moving_a_real_mailbox(monkeypatch):
    """A username that contains @ is the account label, not a mailbox alias."""
    _open_signup(monkeypatch)
    client, private_key, auth, _vault, _dek = _signup("legacy.seed")
    _retarget_username("legacy.seed", "Legacy.User@example.com")

    me = client.get("/api/auth/me")
    assert me.status_code == 200
    assert me.json()["user"]["username"] == "Legacy.User@example.com"
    assert me.json()["user"]["email"] == "legacy.seed@pending.local"

    anonymous = TestClient(app)
    found = anonymous.post(
        "/api/auth/passwordless/lookup", json={"username": "Legacy.User@example.com"}
    )
    lowered = anonymous.post(
        "/api/auth/passwordless/lookup", json={"username": "legacy.user@example.com"}
    )
    by_mailbox = anonymous.post(
        "/api/auth/passwordless/lookup", json={"username": "legacy.seed@pending.local"}
    )
    assert found.json()["auth"]["wrapped_private_key_b64"] == auth["wrapped_private_key_b64"]
    assert lowered.json()["auth"]["wrapped_private_key_b64"] == auth["wrapped_private_key_b64"]
    assert by_mailbox.json()["auth"]["wrapped_private_key_b64"] != auth["wrapped_private_key_b64"]

    challenge = anonymous.post(
        "/api/auth/passwordless/challenge",
        json={"username": "Legacy.User@example.com", "purpose": "username_change"},
    )
    assert challenge.status_code == 200, challenge.text
    issued = challenge.json()
    assert issued["challenge_id"] in issued["message"]
    assert "\nusername_change\n" in issued["message"]
    login_issue = anonymous.post(
        "/api/auth/passwordless/challenge", json={"username": "legacy.user@example.com"}
    )
    assert "\nlogin\n" in login_issue.json()["message"]

    signed_in = TestClient(app)
    verified = signed_in.post(
        "/api/auth/passwordless/verify",
        json={
            "username": "legacy.user@example.com",
            **_proof(anonymous, private_key, "legacy.user@example.com"),
        },
    )
    assert verified.status_code == 200, verified.text
    assert verified.json()["user"]["username"] == "Legacy.User@example.com"

    renamed = _rename(client, private_key, "Legacy.User@example.com", "Renamed.Legacy")
    assert renamed.status_code == 200, renamed.text
    assert renamed.json()["username"] == "renamed.legacy"
    assert renamed.json()["email"] == "legacy.seed@pending.local"
    detail = json.loads(_audits()[-1]["detail"] or "{}")
    assert detail["old_username"] == "Legacy.User@example.com"
    assert detail["new_username"] == "renamed.legacy"
    assert detail["success"] is True

    old_login = anonymous.post(
        "/api/auth/passwordless/verify",
        json={
            "username": "Legacy.User@example.com",
            **_proof(anonymous, private_key, "Legacy.User@example.com"),
        },
    )
    assert old_login.status_code == 401
    new_login = anonymous.post(
        "/api/auth/passwordless/verify",
        json={"username": "renamed.legacy", **_proof(anonymous, private_key, "renamed.legacy")},
    )
    assert new_login.status_code == 200, new_login.text


def test_synthetic_mailbox_follows_an_email_username_until_it_is_taken(monkeypatch):
    _open_signup(monkeypatch)
    client, private_key, _auth, _vault, _dek = _signup("legacy.seed")
    _retarget_username(
        "legacy.seed",
        "legacy.user@example.com",
        "legacy.user@example.com@pending.local",
    )
    holder, _key, _a, _v, _d = _signup("mailbox.holder")
    db = SessionLocal()
    try:
        from apps.finance.backend.models import User

        row = db.query(User).filter(User.username == "mailbox.holder").one()
        field = "email"
        setattr(row, field, "taken.name@pending.local")
        db.commit()
    finally:
        db.close()
    assert holder.get("/api/auth/me").status_code == 200

    blocked = _rename(client, private_key, "legacy.user@example.com", "taken.name")
    assert blocked.status_code == 409
    stayed = client.get("/api/auth/me").json()["user"]
    assert stayed["username"] == "legacy.user@example.com"
    assert stayed["email"] == "legacy.user@example.com@pending.local"
    failure = json.loads(_audits()[-1]["detail"] or "{}")
    assert failure["success"] is False
    assert failure["reason"] == "collision"
    assert failure["old_username"] == "legacy.user@example.com"

    renamed = _rename(client, private_key, "legacy.user@example.com", "fresh.name")
    assert renamed.status_code == 200, renamed.text
    assert renamed.json()["username"] == "fresh.name"
    assert renamed.json()["email"] == "fresh.name@pending.local"


def test_auth_me_repairs_a_stale_csrf_cookie(monkeypatch):
    _open_signup(monkeypatch)
    client, private_key, _auth, _vault, _dek = _signup("owner.name")
    original = client.cookies.get("finance_csrf")
    assert original
    assert client.get("/api/auth/me").status_code == 200
    assert client.cookies.get("finance_csrf") == original

    client.cookies.set("finance_csrf", "stale-token")
    client.headers["X-CSRF-Token"] = "stale-token"
    rejected = client.patch(
        "/api/account/username",
        json={
            "username": "renamed.owner",
            "challenge_id": "c" * 16,
            "challenge": "d" * 32,
            "message": "vault-auth-v1",
            "signature_b64": "e" * 16,
        },
    )
    assert rejected.status_code == 403
    repaired_me = client.get("/api/auth/me")
    assert repaired_me.status_code == 200
    issued = [
        header.split(";", 1)[0].split("=", 1)[1]
        for header in repaired_me.headers.get_list("set-cookie")
        if header.startswith("finance_csrf=")
    ]
    assert len(issued) == 1
    repaired = issued[0]
    assert repaired != "stale-token"
    kept = [cookie for cookie in client.cookies.jar if cookie.name != "finance_csrf"]
    client.cookies.jar.clear()
    for cookie in kept:
        client.cookies.jar.set_cookie(cookie)
    client.cookies.set("finance_csrf", repaired, path="/")
    client.headers["X-CSRF-Token"] = repaired
    renamed = _rename(client, private_key, "owner.name", "renamed.owner")
    assert renamed.status_code == 200, renamed.text


def test_auth_me_leaves_csrf_alone_when_the_cookie_is_absent(monkeypatch):
    _open_signup(monkeypatch)
    client, _private_key, _auth, _vault, _dek = _signup("owner.name")
    original = client.cookies.get("finance_csrf")
    assert original
    kept = [cookie for cookie in client.cookies.jar if cookie.name != "finance_csrf"]
    client.cookies.jar.clear()
    for cookie in kept:
        client.cookies.jar.set_cookie(cookie)
    repaired_me = client.get("/api/auth/me")
    assert repaired_me.status_code == 200
    assert not [
        header
        for header in repaired_me.headers.get_list("set-cookie")
        if header.startswith("finance_csrf=")
    ]
    client.headers["X-CSRF-Token"] = original
    rejected = client.patch(
        "/api/account/username",
        json={
            "username": "renamed.owner",
            "challenge_id": "c" * 16,
            "challenge": "d" * 32,
            "message": "vault-auth-v1",
            "signature_b64": "e" * 16,
        },
    )
    assert rejected.status_code == 401


def test_unique_constraint_race_reports_a_collision(monkeypatch):
    _open_signup(monkeypatch)
    client, private_key, _auth, _vault, _dek = _signup("owner.name")

    def boom(*_args, **_kwargs):
        raise IntegrityError("UPDATE users", {}, Exception("unique"))

    monkeypatch.setattr("apps.finance.backend.services.username_change.apply_username", boom)
    response = _rename(client, private_key, "owner.name", "renamed.owner")
    assert response.status_code == 409
    assert client.get("/api/auth/me").json()["user"]["username"] == "owner.name"
    detail = json.loads(_audits()[-1]["detail"] or "{}")
    assert detail["success"] is False
    assert detail["reason"] == "collision"
