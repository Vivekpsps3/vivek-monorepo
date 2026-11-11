"""The signature has to match the challenge the server issued, and the action."""

import os
import threading
from pathlib import Path

os.environ["DATABASE_URL"] = "sqlite:///:memory:"

from fastapi import HTTPException
from fastapi.testclient import TestClient
from sqlalchemy import delete, event
from sqlalchemy.exc import IntegrityError
from starlette.requests import Request
from starlette.responses import Response

from apps.finance.backend.database import engine
from apps.finance.backend.main import Base, app
from apps.finance.backend.tests.test_change_username import (
    _open_signup,
    _proof,
    _raw_signature,
    _signing_material,
    _signup,
)
from apps.server.identity import challenge_auth
from apps.server.identity.challenge_auth import CHALLENGE_FAILURE_DETAIL, PURPOSE_LOGIN
from apps.server.identity.models import User, UserSession
from apps.server.identity.schemas import UsernameChangeRequest
from apps.server.identity.session import create_session
from apps.server.identity.username_change import change_username
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


def _relax(monkeypatch):
    monkeypatch.setenv("AUTH_PAIR_RATE_LIMIT_PER_MIN", "100")
    monkeypatch.setenv("AUTH_IP_RATE_LIMIT_PER_MIN", "100")
    monkeypatch.delenv("RATE_LIMIT_PER_MIN", raising=False)
    clear_limits()


def _issued_proof(client, private_key, username, purpose="login", headers=None):
    challenge = client.post(
        "/api/auth/passwordless/challenge",
        json={"username": username, "purpose": purpose},
        headers=headers,
    )
    assert challenge.status_code == 200, challenge.text
    body = challenge.json()
    proof = {
        "challenge_id": body["challenge_id"],
        "challenge": body["challenge"],
        "message": body["message"],
        "signature_b64": _raw_signature(private_key, body["message"]),
    }
    return body, proof


def _origin_line(origin: str) -> str:
    return f"\n{origin}\n"


def test_same_site_and_development_clients_sign_in_and_rename(monkeypatch):
    """Issue and verify bind the same configured origin. Forwarded headers do not."""
    _open_signup(monkeypatch)
    _relax(monkeypatch)
    client, private_key, _auth, _vault, _dek = _signup("owner.name")
    forwarded = {
        "X-Forwarded-Host": "evil.example",
        "X-Forwarded-Proto": "https",
        "Forwarded": "proto=https;host=evil.example",
    }
    issued, proof = _issued_proof(client, private_key, "owner.name", headers=forwarded)
    assert _origin_line("http://testserver") in issued["message"]
    assert "evil.example" not in issued["message"]
    assert "\nlogin\n" in issued["message"]
    anonymous = TestClient(app)
    signed_in = anonymous.post(
        "/api/auth/passwordless/verify",
        json={"username": "owner.name", **proof},
        headers=forwarded,
    )
    assert signed_in.status_code == 200, signed_in.text
    assert anonymous.get("/api/auth/me").json()["user"]["username"] == "owner.name"

    monkeypatch.delenv("CORS_ORIGINS")
    for origin in (
        "http://127.0.0.1:4200",
        "http://localhost:4200",
        "http://127.0.0.1:8000",
        "http://localhost:8000",
    ):
        headers = {"Origin": origin, **forwarded}
        dev_issued, dev_proof = _issued_proof(client, private_key, "owner.name", headers=headers)
        assert _origin_line(origin) in dev_issued["message"]
        assert "evil.example" not in dev_issued["message"]
        dev_client = TestClient(app)
        verified = dev_client.post(
            "/api/auth/passwordless/verify",
            json={"username": "owner.name", **dev_proof},
            headers=headers,
        )
        assert verified.status_code == 200, verified.text

    monkeypatch.setenv("CORS_ORIGINS", "https://vivekpanchagnula.com")
    public = {"Origin": "https://vivekpanchagnula.com", **forwarded}
    renamed_issued, renamed_proof = _issued_proof(
        client, private_key, "owner.name", purpose="username_change", headers=public
    )
    assert _origin_line("https://vivekpanchagnula.com") in renamed_issued["message"]
    assert "\nusername_change\n" in renamed_issued["message"]
    assert "evil.example" not in renamed_issued["message"]
    renamed = client.patch(
        "/api/account/username",
        json={"username": "renamed.owner", **renamed_proof},
        headers=public,
    )
    assert renamed.status_code == 200, renamed.text
    assert renamed.json()["username"] == "renamed.owner"
    absent = client.post(
        "/api/auth/passwordless/challenge",
        json={"username": "renamed.owner"},
        headers=forwarded,
    )
    assert absent.status_code == 401
    assert absent.json()["detail"] == CHALLENGE_FAILURE_DETAIL


def test_bad_origins_reject_a_captured_proof_without_spending_it(monkeypatch):
    _open_signup(monkeypatch)
    _relax(monkeypatch)
    client, private_key, _auth, _vault, _dek = _signup("owner.name")
    _issued, proof = _issued_proof(client, private_key, "owner.name")
    anonymous = TestClient(app)
    malformed = (
        {"Origin": "null"},
        {"Origin": ""},
        {"Origin": "not-an-origin"},
        {"Origin": "https://evil.example"},
        {"Origin": "https://evil.example/phish"},
        {"Origin": "http://user:pass@127.0.0.1:4200"},
        {"Origin": "http://127.0.0.1:4200?next=1"},
        {"Origin": "http://127.0.0.1:4200.evil.test"},
        {"Origin": "http://localhost:4200/login"},
    )
    for headers in malformed:
        rejected = anonymous.post(
            "/api/auth/passwordless/verify",
            json={"username": "owner.name", **proof},
            headers=headers,
        )
        assert rejected.status_code == 401, headers
        assert rejected.json() == {"detail": CHALLENGE_FAILURE_DETAIL}
        assert anonymous.get("/api/auth/me").status_code == 401
    other_allowed = {"Origin": "http://localhost:4200"}
    mismatched = anonymous.post(
        "/api/auth/passwordless/verify",
        json={"username": "owner.name", **proof},
        headers=other_allowed,
    )
    assert mismatched.status_code == 401
    assert anonymous.get("/api/auth/me").status_code == 401
    monkeypatch.setenv("CORS_ORIGINS", "https://vivekpanchagnula.com")
    absent = anonymous.post(
        "/api/auth/passwordless/verify",
        json={"username": "owner.name", **proof},
        headers={
            "X-Forwarded-Host": "vivekpanchagnula.com",
            "X-Forwarded-Proto": "https",
            "Forwarded": "proto=https;host=vivekpanchagnula.com",
        },
    )
    assert absent.status_code == 401
    assert absent.json()["detail"] == CHALLENGE_FAILURE_DETAIL
    monkeypatch.setenv(
        "CORS_ORIGINS",
        "http://testserver,http://localhost:4200,http://127.0.0.1:4200",
    )
    spent = anonymous.post(
        "/api/auth/passwordless/verify", json={"username": "owner.name", **proof}
    )
    assert spent.status_code == 200, spent.text

    rename_issued, rename_proof = _issued_proof(
        client, private_key, "owner.name", purpose="username_change"
    )
    assert _origin_line("http://testserver") in rename_issued["message"]
    blocked = client.patch(
        "/api/account/username",
        json={"username": "renamed.owner", **rename_proof},
        headers={"Origin": "https://evil.example"},
    )
    assert blocked.status_code == 401
    assert blocked.json()["detail"] == CHALLENGE_FAILURE_DETAIL
    assert client.get("/api/auth/me").json()["user"]["username"] == "owner.name"
    renamed = client.patch(
        "/api/account/username",
        json={"username": "renamed.owner", **rename_proof},
    )
    assert renamed.status_code == 200, renamed.text


def test_real_and_unknown_accounts_share_challenge_shapes(monkeypatch):
    _open_signup(monkeypatch)
    _relax(monkeypatch)
    client, _private_key, _auth, _vault, _dek = _signup("owner.name")
    foreign = {"Origin": "https://evil.example"}
    real = client.post(
        "/api/auth/passwordless/challenge",
        json={"username": "owner.name"},
        headers=foreign,
    )
    unknown = TestClient(app).post(
        "/api/auth/passwordless/challenge",
        json={"username": "ghost.user"},
        headers=foreign,
    )
    assert real.status_code == unknown.status_code == 401
    assert real.json() == unknown.json() == {"detail": CHALLENGE_FAILURE_DETAIL}
    real_verify = client.post(
        "/api/auth/passwordless/verify",
        json={
            "username": "owner.name",
            "challenge_id": "c" * 16,
            "challenge": "d" * 32,
            "message": "vault-auth-v1",
            "signature_b64": "e" * 16,
        },
        headers=foreign,
    )
    unknown_verify = TestClient(app).post(
        "/api/auth/passwordless/verify",
        json={
            "username": "ghost.user",
            "challenge_id": "c" * 16,
            "challenge": "d" * 32,
            "message": "vault-auth-v1",
            "signature_b64": "e" * 16,
        },
        headers=foreign,
    )
    assert real_verify.status_code == unknown_verify.status_code == 401
    assert real_verify.json() == unknown_verify.json()

    known = client.post("/api/auth/passwordless/challenge", json={"username": "owner.name"})
    missing = TestClient(app).post(
        "/api/auth/passwordless/challenge", json={"username": "ghost.user"}
    )
    assert known.status_code == missing.status_code == 200
    assert known.json().keys() == missing.json().keys()
    assert _origin_line("http://testserver") in known.json()["message"]
    assert _origin_line("http://testserver") in missing.json()["message"]
    assert "\nlogin\n" in known.json()["message"]
    assert "\nlogin\n" in missing.json()["message"]


def test_cross_owner_proof_does_not_rename_or_sign_in(monkeypatch):
    _open_signup(monkeypatch)
    _relax(monkeypatch)
    owner, owner_key, _auth, _vault, _dek = _signup("owner.name")
    other, _other_key, _a, _v, _d = _signup("other.user")
    login = _proof(owner, owner_key, "owner.name")
    anonymous = TestClient(app)
    rejected = anonymous.post(
        "/api/auth/passwordless/verify", json={"username": "other.user", **login}
    )
    assert rejected.status_code == 401
    assert rejected.json()["detail"] == CHALLENGE_FAILURE_DETAIL
    assert anonymous.get("/api/auth/me").status_code == 401
    still = anonymous.post(
        "/api/auth/passwordless/verify", json={"username": "owner.name", **login}
    )
    assert still.status_code == 200, still.text

    rename = _proof(owner, owner_key, "owner.name", purpose="username_change")
    stolen = other.patch("/api/account/username", json={"username": "stolen.name", **rename})
    assert stolen.status_code == 401
    assert stolen.json()["detail"] == CHALLENGE_FAILURE_DETAIL
    assert other.get("/api/auth/me").json()["user"]["username"] == "other.user"
    assert owner.get("/api/auth/me").json()["user"]["username"] == "owner.name"
    kept = owner.patch("/api/account/username", json={"username": "renamed.owner", **rename})
    assert kept.status_code == 200, kept.text
    assert other.get("/api/auth/me").json()["user"]["username"] == "other.user"


def _race_database(tmp_path: Path):
    from apps.finance.backend.models import Base as FinanceBase
    from apps.server.database import open_database
    from apps.server.main import Dependencies, Settings, create_app

    database = open_database(f"sqlite:///{tmp_path / 'challenge-race.db'}")

    @event.listens_for(database.engine, "connect")
    def _busy(dbapi_connection, _record):
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA busy_timeout=5000")
        cursor.close()

    FinanceBase.metadata.create_all(database.engine)
    with database.engine.begin() as connection:
        connection.exec_driver_sql("PRAGMA journal_mode=WAL")
    application = create_app(
        Settings(
            database_url=database.url,
            release="test",
            web_root=Path("/app/web/finance"),
            openapi=False,
        ),
        Dependencies(database=database, check_schema=False, check_frontend=False),
    )
    return application, database


def _binding_request() -> Request:
    scope = {
        "type": "http",
        "asgi": {"version": "3.0"},
        "http_version": "1.1",
        "method": "POST",
        "scheme": "http",
        "path": "/api/auth/passwordless/verify",
        "raw_path": b"/api/auth/passwordless/verify",
        "query_string": b"",
        "headers": [(b"host", b"testserver")],
        "client": ("127.0.0.1", 5000),
        "server": ("testserver", 80),
    }
    return Request(scope)


def _enroll(client: TestClient, username: str):
    private_key, public_key_b64, auth, vault, _dek = _signing_material(None)
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
    return private_key, int(response.json()["user"]["id"])


def _join(calls):
    errors: list[BaseException] = []
    threads = []
    for call in calls:

        def run(target=call):
            try:
                target()
            except Exception as exc:
                errors.append(exc)

        threads.append(threading.Thread(target=run))
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join(10)
        assert not thread.is_alive()
    assert errors == []


def test_concurrent_login_spend_opens_one_session(tmp_path, monkeypatch):
    _open_signup(monkeypatch)
    _relax(monkeypatch)
    application, database = _race_database(tmp_path)
    real_consume = challenge_auth._consume
    try:
        with TestClient(application) as client:
            private_key, user_id = _enroll(client, "owner.name")
            _issued, proof = _issued_proof(client, private_key, "owner.name")
        before = database.sessionmaker()
        starting = before.query(UserSession).filter(UserSession.user_id == user_id).count()
        before.close()
        assert starting == 1
        barrier = threading.Barrier(2)

        def gated(db, challenge):
            barrier.wait(5)
            return real_consume(db, challenge)

        monkeypatch.setattr(challenge_auth, "_consume", gated)
        outcomes: list[int] = []

        def once():
            db = database.sessionmaker()
            request = _binding_request()
            try:
                origin = challenge_auth.bound_challenge_origin(request, PURPOSE_LOGIN)
                user = db.query(User).filter(User.id == user_id).one()
                if challenge_auth.verify_challenge(
                    db,
                    user,
                    proof["challenge_id"],
                    proof["challenge"],
                    proof["message"],
                    proof["signature_b64"],
                    origin,
                    PURPOSE_LOGIN,
                ):
                    create_session(db, user, request, Response())
                    outcomes.append(200)
                else:
                    db.rollback()
                    outcomes.append(401)
            finally:
                db.close()

        _join([once, once])
        assert sorted(outcomes) == [200, 401]
        check = database.sessionmaker()
        sessions = check.query(UserSession).filter(UserSession.user_id == user_id).count()
        user = check.query(User).filter(User.id == user_id).one()
        check.close()
        assert sessions == 2
        assert user.username == "owner.name"
    finally:
        monkeypatch.setattr(challenge_auth, "_consume", real_consume)
        database.engine.dispose()


def test_concurrent_rename_spend_changes_the_user_once(tmp_path, monkeypatch):
    _open_signup(monkeypatch)
    _relax(monkeypatch)
    application, database = _race_database(tmp_path)
    real_consume = challenge_auth._consume
    try:
        with TestClient(application) as client:
            private_key, user_id = _enroll(client, "owner.name")
            _issued, proof = _issued_proof(
                client, private_key, "owner.name", purpose="username_change"
            )
        before = database.sessionmaker()
        starting = before.query(UserSession).filter(UserSession.user_id == user_id).count()
        before.close()
        barrier = threading.Barrier(2)

        def gated(db, challenge):
            barrier.wait(5)
            return real_consume(db, challenge)

        monkeypatch.setattr(challenge_auth, "_consume", gated)
        outcomes: list[tuple[int, str]] = []

        def once(new_name: str):
            db = database.sessionmaker()
            request = _binding_request()
            user = db.query(User).filter(User.id == user_id).one()
            body = UsernameChangeRequest(
                username=new_name,
                challenge_id=proof["challenge_id"],
                challenge=proof["challenge"],
                message=proof["message"],
                signature_b64=proof["signature_b64"],
            )
            try:
                change_username(db, user, body, request)
                db.commit()
                outcomes.append((200, new_name))
            except HTTPException as exc:
                outcomes.append((exc.status_code, new_name))
            finally:
                db.close()

        _join([lambda: once("renamed.one"), lambda: once("renamed.two")])
        assert sorted(status for status, _name in outcomes) == [200, 401]
        winner = next(name for status, name in outcomes if status == 200)
        loser = next(name for status, name in outcomes if status == 401)
        check = database.sessionmaker()
        user = check.query(User).filter(User.id == user_id).one()
        sessions = check.query(UserSession).filter(UserSession.user_id == user_id).count()
        check.close()
        assert user.username == winner
        assert user.username != loser
        assert sessions == starting
    finally:
        monkeypatch.setattr(challenge_auth, "_consume", real_consume)
        database.engine.dispose()
