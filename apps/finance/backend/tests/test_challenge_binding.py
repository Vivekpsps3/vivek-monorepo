"""The signature has to match the challenge the server issued, and the action."""

import os

os.environ["DATABASE_URL"] = "sqlite:///:memory:"

from fastapi.testclient import TestClient
from sqlalchemy import delete
from sqlalchemy.exc import IntegrityError

from apps.finance.backend.database import engine
from apps.finance.backend.main import Base, app
from apps.finance.backend.tests.test_change_username import (
    _open_signup,
    _proof,
    _raw_signature,
    _signup,
)
from apps.server.rate_limit import clear_limits


def setup_function():
    Base.metadata.create_all(bind=engine)
    clear_limits()
    with engine.begin() as conn:
        for table in reversed(Base.metadata.sorted_tables):
            conn.execute(delete(table))


ANYTHING = "anything"


def _issued(client: TestClient, username: str, purpose: str = "login") -> dict:
    response = client.post(
        "/api/auth/passwordless/challenge",
        json={"username": username, "purpose": purpose},
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["challenge_id"] in body["message"]
    assert purpose in body["message"]
    return body


def _verify(client: TestClient, username: str, challenge: dict, message: str, signature: str):
    return client.post(
        "/api/auth/passwordless/verify",
        json={
            "username": username,
            "challenge_id": challenge["challenge_id"],
            "challenge": challenge["challenge"],
            "message": message,
            "signature_b64": signature,
        },
    )


def _rename(client: TestClient, new_name: str, challenge: dict, message: str, signature: str):
    return client.patch(
        "/api/account/username",
        json={
            "username": new_name,
            "challenge_id": challenge["challenge_id"],
            "challenge": challenge["challenge"],
            "message": message,
            "signature_b64": signature,
        },
    )


def test_verify_rejects_replayed_message_against_a_new_challenge(monkeypatch):
    _open_signup(monkeypatch)
    client, private_key, _auth, _vault, _dek = _signup("owner.name")
    first = _issued(client, "owner.name")
    signature = _raw_signature(private_key, first["message"])
    second = _issued(client, "owner.name")
    replayed = _verify(client, "owner.name", second, first["message"], signature)
    assert replayed.status_code == 401
    assert client.get("/api/auth/me").status_code == 200


def test_rename_rejects_replayed_message_against_a_new_challenge(monkeypatch):
    _open_signup(monkeypatch)
    client, private_key, _auth, _vault, _dek = _signup("owner.name")
    first = _issued(client, "owner.name", "username_change")
    signature = _raw_signature(private_key, first["message"])
    second = _issued(client, "owner.name", "username_change")
    replayed = _rename(client, "renamed.owner", second, first["message"], signature)
    assert replayed.status_code == 401
    assert client.get("/api/auth/me").json()["user"]["username"] == "owner.name"


def test_verify_rejects_signature_over_anything(monkeypatch):
    _open_signup(monkeypatch)
    client, private_key, _auth, _vault, _dek = _signup("owner.name")
    challenge = _issued(client, "owner.name")
    signed = _verify(
        client,
        "owner.name",
        challenge,
        ANYTHING,
        _raw_signature(private_key, ANYTHING),
    )
    assert signed.status_code == 401


def test_rename_rejects_signature_over_anything(monkeypatch):
    _open_signup(monkeypatch)
    client, private_key, _auth, _vault, _dek = _signup("owner.name")
    challenge = _issued(client, "owner.name", "username_change")
    signed = _rename(
        client,
        "renamed.owner",
        challenge,
        ANYTHING,
        _raw_signature(private_key, ANYTHING),
    )
    assert signed.status_code == 401
    assert client.get("/api/auth/me").json()["user"]["username"] == "owner.name"


def test_collision_race_keeps_the_challenge_spent(monkeypatch):
    _open_signup(monkeypatch)
    client, private_key, _auth, _vault, _dek = _signup("owner.name")
    proof = _proof(client, private_key, "owner.name", purpose="username_change")
    body = {"username": "renamed.owner", **proof}

    def boom(*_args, **_kwargs):
        raise IntegrityError("UPDATE users", {}, Exception("unique"))

    monkeypatch.setattr("apps.server.identity.username_change.apply_username", boom)
    first = client.patch("/api/account/username", json=body)
    assert first.status_code == 409
    second = client.patch("/api/account/username", json=body)
    assert second.status_code == 401
    assert client.get("/api/auth/me").json()["user"]["username"] == "owner.name"


def test_second_spend_fails_for_login_and_rename(monkeypatch):
    _open_signup(monkeypatch)
    client, private_key, _auth, _vault, _dek = _signup("owner.name")
    login = _proof(client, private_key, "owner.name")
    anonymous = TestClient(app)
    first_login = anonymous.post(
        "/api/auth/passwordless/verify", json={"username": "owner.name", **login}
    )
    assert first_login.status_code == 200, first_login.text
    second_login = anonymous.post(
        "/api/auth/passwordless/verify", json={"username": "owner.name", **login}
    )
    assert second_login.status_code == 401

    renamed = _proof(client, private_key, "owner.name", purpose="username_change")
    body = {"username": "renamed.owner", **renamed}
    first_rename = client.patch("/api/account/username", json=body)
    assert first_rename.status_code == 200, first_rename.text
    second_rename = client.patch("/api/account/username", json=body)
    assert second_rename.status_code == 401
    assert client.get("/api/auth/me").json()["user"]["username"] == "renamed.owner"


def test_login_challenge_cannot_rename(monkeypatch):
    _open_signup(monkeypatch)
    client, private_key, _auth, _vault, _dek = _signup("owner.name")
    login = _proof(client, private_key, "owner.name", purpose="login")
    rejected = client.patch("/api/account/username", json={"username": "renamed.owner", **login})
    assert rejected.status_code == 401
    assert client.get("/api/auth/me").json()["user"]["username"] == "owner.name"


def test_username_change_challenge_cannot_login(monkeypatch):
    _open_signup(monkeypatch)
    client, private_key, _auth, _vault, _dek = _signup("owner.name")
    rename = _proof(client, private_key, "owner.name", purpose="username_change")
    rejected = client.post(
        "/api/auth/passwordless/verify", json={"username": "owner.name", **rename}
    )
    assert rejected.status_code == 401
    assert client.get("/api/auth/me").json()["user"]["username"] == "owner.name"
