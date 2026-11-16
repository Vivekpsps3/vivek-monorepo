"""Atomic credential rotation preserves keys, records and usable prior state on failure."""

import base64
import os
from concurrent.futures import ThreadPoolExecutor
from datetime import timedelta
from threading import Barrier

os.environ["DATABASE_URL"] = "sqlite:///:memory:"

import pytest
from cryptography.exceptions import InvalidTag
from cryptography.hazmat.primitives import serialization
from fastapi import HTTPException
from fastapi.testclient import TestClient
from sqlalchemy import delete
from sqlalchemy.orm import Session

from apps.finance.backend.database import SessionLocal
from apps.finance.backend.kdf_policy import MIN_PBKDF2_ITERATIONS
from apps.finance.backend.main import Base, app, engine
from apps.finance.backend.services import encrypted_storage
from apps.finance.backend.tests.test_auth_challenge import _enroll_legacy_user, _verify
from apps.finance.backend.tests.test_challenge_binding import _enroll, _race_database, _relax
from apps.finance.backend.tests.test_change_username import (
    PASSPHRASE,
    _b64,
    _derive,
    _open_signup,
    _pack,
    _proof,
    _signup,
    _unpack,
)
from apps.server.identity import credential_rotation
from apps.server.identity.models import AuthChallenge, User, UserSession
from apps.server.rate_limit import clear_limits

ENDPOINT = "/api/auth/passwordless/credentials"
NEW_PASSPHRASE = "new correct horse battery staple"


def setup_function():
    Base.metadata.create_all(bind=engine)
    clear_limits()
    with engine.begin() as connection:
        for table in reversed(Base.metadata.sorted_tables):
            connection.execute(delete(table))


def _rotation(client, key, *, username="owner.name", revision=None, purpose="credential_rotation"):
    wraps = client.get(ENDPOINT).json()
    auth = {**wraps["auth"], "kdf_salt_b64": _b64(os.urandom(16))}
    vault = {
        name: wraps["vault"][name] for name in ("kdf_salt_b64", "kdf_iterations", "wrapped_dek_b64")
    }
    vault["kdf_salt_b64"] = _b64(os.urandom(16))
    return {
        "expected_wrap_revision": revision or wraps["wrap_revision"],
        "auth": auth,
        "vault": vault,
        **_proof(client, key, username, purpose),
    }


def _sessions():
    with SessionLocal() as db:
        return [(row.id, row.revoked_at) for row in db.query(UserSession).order_by(UserSession.id)]


def _another_session(client, key):
    other = TestClient(app)
    login = other.post(
        "/api/auth/passwordless/verify",
        json={"username": "owner.name", **_proof(client, key, "owner.name")},
    )
    assert login.status_code == 200, login.text
    other.headers["X-CSRF-Token"] = login.json()["csrf_token"]
    return other


def test_rotation_rewraps_the_same_keys_without_changing_any_collection_or_index(monkeypatch):
    _open_signup(monkeypatch)
    client, key, _auth, _vault, dek = _signup("owner.name", passphrase=PASSPHRASE)
    other = _another_session(client, key)
    foreign, _key, _a, _v, _d = _signup("foreign.owner")
    records = [
        {
            "collection": name,
            "client_id": "synthetic_0001",
            "ciphertext_b64": _pack(dek, b"private fixture"),
            "schema_version": 2,
            "key_version": 1,
            "indexes": [{"index_name": "synthetic", "index_value_b64": _b64(b"blind index")}],
        }
        for name in sorted(encrypted_storage.ALLOWED_COLLECTIONS)
    ]
    assert client.post("/api/vault/records/upsert", json={"records": records}).status_code == 200
    before = client.get("/api/vault/recovery-snapshot").json()
    with SessionLocal() as db:
        indexes_before = [
            (r.collection, r.client_id, r.index_name, r.index_value_b64)
            for r in db.query(encrypted_storage.EncryptedRecordIndex).order_by(
                encrypted_storage.EncryptedRecordIndex.id
            )
        ]
    body = _rotation(client, key)
    pkcs8 = key.private_bytes(
        serialization.Encoding.DER, serialization.PrivateFormat.PKCS8, serialization.NoEncryption()
    )
    for payload, field, raw in (
        (body["auth"], "wrapped_private_key_b64", pkcs8),
        (body["vault"], "wrapped_dek_b64", dek),
    ):
        payload[field] = _pack(
            _derive(
                NEW_PASSPHRASE, base64.b64decode(payload["kdf_salt_b64"]), payload["kdf_iterations"]
            ),
            raw,
        )
    changed = client.post(ENDPOINT, json=body)
    assert changed.status_code == 200, changed.text
    assert changed.json()["wrap_revision"] == body["expected_wrap_revision"] + 1
    assert changed.json()["auth"] == body["auth"]
    assert changed.json()["vault"]["wrapped_dek_b64"] == body["vault"]["wrapped_dek_b64"]
    after = client.get("/api/vault/recovery-snapshot").json()
    assert after == before
    with SessionLocal() as db:
        assert [
            (r.collection, r.client_id, r.index_name, r.index_value_b64)
            for r in db.query(encrypted_storage.EncryptedRecordIndex).order_by(
                encrypted_storage.EncryptedRecordIndex.id
            )
        ] == indexes_before
    assert (
        _unpack(
            _derive(
                NEW_PASSPHRASE,
                base64.b64decode(body["vault"]["kdf_salt_b64"]),
                MIN_PBKDF2_ITERATIONS,
            ),
            body["vault"]["wrapped_dek_b64"],
        )
        == dek
    )
    assert (
        _unpack(
            _derive(
                NEW_PASSPHRASE,
                base64.b64decode(body["auth"]["kdf_salt_b64"]),
                MIN_PBKDF2_ITERATIONS,
            ),
            body["auth"]["wrapped_private_key_b64"],
        )
        == pkcs8
    )
    with pytest.raises(InvalidTag):
        _unpack(
            _derive(
                PASSPHRASE, base64.b64decode(body["vault"]["kdf_salt_b64"]), MIN_PBKDF2_ITERATIONS
            ),
            body["vault"]["wrapped_dek_b64"],
        )
    assert client.get("/api/auth/me").status_code == 200
    assert other.get("/api/auth/me").status_code == 401
    assert foreign.get("/api/auth/me").status_code == 200
    assert client.post(ENDPOINT, json=body).status_code == 401
    assert client.get(ENDPOINT).json() == changed.json()


@pytest.mark.parametrize("failure", ["second_write", "commit"])
def test_second_write_or_commit_failure_rolls_back_both_wraps_revision_proof_and_sessions(
    monkeypatch, failure
):
    _open_signup(monkeypatch)
    client, key, _a, _v, _d = _signup("owner.name")
    other = _another_session(client, key)
    before = client.get(ENDPOINT).json()
    sessions = _sessions()
    body = _rotation(client, key)
    original = encrypted_storage.update_vault_wraps

    def second_write(db, *args, **kwargs):
        original(db, *args, **kwargs)
        db.flush()
        raise RuntimeError("synthetic write failure")

    def commit(_db):
        raise RuntimeError("synthetic commit failure")

    with monkeypatch.context() as patch:
        if failure == "second_write":
            patch.setattr(encrypted_storage, "update_vault_wraps", second_write)
        else:
            patch.setattr(Session, "commit", commit)
        response = client.post(ENDPOINT, json=body)
        assert response.status_code == 500
    assert client.get(ENDPOINT).json() == before
    assert _sessions() == sessions
    assert other.get("/api/auth/me").status_code == 200
    # The entire failed transaction rolled back; retrying can use the still-fresh proof.
    assert client.post(ENDPOINT, json=body).status_code == 200


def test_stale_revision_rejects_both_writes_and_preserves_sessions(monkeypatch):
    _open_signup(monkeypatch)
    client, key, _a, _v, _d = _signup("owner.name")
    stale = _rotation(client, key)
    # A legacy KDF writer also participates in the shared revision.
    assert client.put("/api/auth/passwordless/wraps", json=stale["auth"]).status_code == 200
    other = _another_session(client, key)
    before = client.get(ENDPOINT).json()
    sessions = _sessions()
    assert client.post(ENDPOINT, json=stale).status_code == 409
    assert client.get(ENDPOINT).json() == before
    assert _sessions() == sessions
    assert other.get("/api/auth/me").status_code == 200
    assert client.put("/api/vault/wraps", json=stale["vault"]).status_code == 200
    assert client.get(ENDPOINT).json()["wrap_revision"] == before["wrap_revision"] + 1


@pytest.mark.parametrize(
    "case,expected",
    [
        ("foreign", 401),
        ("missing_csrf", 403),
        ("login", 401),
        ("username_change", 401),
        ("expired", 401),
        ("forged_signature", 401),
        ("foreign_origin", 401),
        ("auth_kdf", 422),
        ("vault_kdf", 422),
        ("auth_salt", 400),
        ("vault_salt", 400),
        ("auth_wrap", 400),
        ("vault_wrap", 400),
        ("plaintext", 422),
    ],
)
def test_rotation_rejections_do_not_mutate_wraps_records_or_sessions(monkeypatch, case, expected):
    _open_signup(monkeypatch)
    _relax(monkeypatch)
    client, key, _a, _v, _d = _signup("owner.name")
    before = client.get(ENDPOINT).json()
    body = _rotation(
        client, key, purpose=case if case in {"login", "username_change"} else "credential_rotation"
    )
    headers = {}
    if case == "foreign":
        foreign, foreign_key, _a, _v, _d = _signup("foreign.owner")
        body.update(_proof(foreign, foreign_key, "foreign.owner", "credential_rotation"))
    elif case == "missing_csrf":
        del client.headers["X-CSRF-Token"]
    elif case == "expired":
        with SessionLocal() as db:
            challenge = db.query(AuthChallenge).filter_by(challenge_id=body["challenge_id"]).one()
            challenge.expires_at -= timedelta(minutes=10)
            db.commit()
    elif case == "forged_signature":
        body["signature_b64"] = _b64(b"x" * 64)
    elif case == "foreign_origin":
        headers["Origin"] = "https://foreign.example"
    elif case in {"auth_kdf", "vault_kdf"}:
        body[case.split("_")[0]]["kdf_iterations"] = MIN_PBKDF2_ITERATIONS - 1
    elif case in {"auth_salt", "vault_salt"}:
        body[case.split("_")[0]]["kdf_salt_b64"] = "!" * 24
    elif case == "auth_wrap":
        body["auth"]["wrapped_private_key_b64"] = "!" * 64
    elif case == "vault_wrap":
        body["vault"]["wrapped_dek_b64"] = "!" * 64
    elif case == "plaintext":
        body["passphrase"] = "must never be accepted"
    sessions = _sessions()
    response = client.post(ENDPOINT, json=body, headers=headers)
    assert response.status_code == expected, response.text
    assert client.get(ENDPOINT).json() == before
    assert _sessions() == sessions
    assert client.get("/api/vault/records").json() == []


def test_legacy_wrap_reads_preserve_lower_iterations_and_recovery_material():
    from cryptography.hazmat.primitives.asymmetric import ec

    key = ec.generate_private_key(ec.SECP256R1())
    _enroll_legacy_user(key)
    client = TestClient(app)
    login = _verify(client, key, "legacy.user")
    client.headers["X-CSRF-Token"] = login["csrf_token"]
    response = client.get(ENDPOINT)
    assert response.status_code == 200, response.text
    assert response.json()["auth"]["kdf_iterations"] == 310000
    assert response.json()["vault"]["kdf_iterations"] == 310000
    assert "legacy-auth-recovery-not-served" not in response.text
    body = _rotation(client, key, username="legacy.user")
    body["auth"]["kdf_iterations"] = MIN_PBKDF2_ITERATIONS
    body["vault"]["kdf_iterations"] = MIN_PBKDF2_ITERATIONS
    assert client.post(ENDPOINT, json=body).status_code == 200
    with SessionLocal() as db:
        user = db.query(User).filter_by(username="legacy.user").one()
        assert user.auth_recovery_wrapped_private_key_b64 == "legacy-auth-recovery-not-served"
        assert (
            encrypted_storage.get_vault(db, user.id).recovery_wrapped_dek_b64
            == "legacy-dek-recovery-not-served"
        )
    assert TestClient(app).get(ENDPOINT).status_code == 401


def test_concurrent_expected_revision_has_one_committed_winner(tmp_path, monkeypatch):
    _open_signup(monkeypatch)
    _relax(monkeypatch)
    application, database = _race_database(tmp_path)
    try:
        with TestClient(application) as client:
            _key, user_id = _enroll(client, "owner.name")
        ready = Barrier(2)

        def attempt():
            with database.sessionmaker() as db:
                owner = db.get(User, user_id)
                expected = owner.credential_wrap_revision
                ready.wait(5)
                try:
                    credential_rotation.advance_wrap_revision(db, user_id, expected)
                    db.commit()
                    return 200
                except HTTPException as error:
                    db.rollback()
                    return error.status_code

        with ThreadPoolExecutor(max_workers=2) as executor:
            results = list(executor.map(lambda _: attempt(), range(2)))
        assert sorted(results) == [200, 409]
        with database.sessionmaker() as db:
            assert db.get(User, user_id).credential_wrap_revision == 2
    finally:
        database.engine.dispose()
