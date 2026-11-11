"""CSRF repair commits the winning hash before the cookie, and a loser does not publish one."""

import threading
from pathlib import Path

from fastapi.testclient import TestClient
from sqlalchemy import event
from sqlalchemy.orm import Session
from starlette.requests import Request
from starlette.responses import Response

from apps.finance.backend.models import Base as FinanceBase
from apps.server.database import open_database
from apps.server.identity import session as identity_session
from apps.server.identity.models import User, UserSession
from apps.server.identity.routes import me
from apps.server.identity.session import (
    _hash_secret,
    commit_csrf_repair,
    create_session,
    create_user,
    emit_committed_csrf,
    refresh_session_cookies,
    repair_csrf_cookie,
)
from apps.server.main import Dependencies, Settings, create_app


def _database(tmp_path: Path):
    database = open_database(f"sqlite:///{tmp_path / 'csrf-repair.db'}")

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


def _request(cookie: str) -> Request:
    scope = {
        "type": "http",
        "asgi": {"version": "3.0"},
        "http_version": "1.1",
        "method": "GET",
        "scheme": "http",
        "path": "/api/auth/me",
        "raw_path": b"/api/auth/me",
        "query_string": b"",
        "headers": [
            (b"host", b"testserver"),
            (b"cookie", cookie.encode()),
        ],
        "client": ("127.0.0.1", 5000),
        "server": ("testserver", 80),
    }
    return Request(scope)


def _cookie(response: Response, name: str) -> str | None:
    prefix = f"{name}=".encode()
    for key, value in response.raw_headers:
        if key.lower() == b"set-cookie" and value.startswith(prefix):
            return value.split(b";", 1)[0].split(b"=", 1)[1].decode()
    return None


def _issued(response, name: str) -> list[str]:
    prefix = f"{name}="
    return [
        header.split(";", 1)[0].split("=", 1)[1]
        for header in response.headers.get_list("set-cookie")
        if header.startswith(prefix)
    ]


def _hash_row(database, session_id: int) -> str:
    db = database.sessionmaker()
    try:
        return db.query(UserSession.csrf_token_hash).filter(UserSession.id == session_id).scalar()
    finally:
        db.close()


def _open_session(database):
    db = database.sessionmaker()
    user = create_user(
        db,
        email="csrf-repair@example.test",
        display_name="Csrf Repair",
        must_change_password=False,
    )
    response = Response()
    csrf = create_session(db, user, _request(""), response)
    token = _cookie(response, "finance_session")
    assert token
    assert csrf
    session_id = int(db.query(UserSession).filter(UserSession.user_id == user.id).one().id)
    user_id = int(user.id)
    db.close()
    return token, csrf, session_id, user_id


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


def test_repair_commits_the_hash_before_the_cookie_and_a_mutation_works(tmp_path, monkeypatch):
    application, database = _database(tmp_path)
    try:
        _token, original, session_id, _user_id = _open_session(database)
        real_set = identity_session.set_csrf_cookie
        seen: list[str] = []

        def checking(response, csrf, real=real_set):
            assert _hash_row(database, session_id) == _hash_secret(csrf)
            assert csrf != "stale-token"
            seen.append(csrf)
            real(response, csrf)

        monkeypatch.setattr(identity_session, "set_csrf_cookie", checking)
        with TestClient(application) as client:
            client.cookies.set("finance_session", _token)
            client.cookies.set("finance_csrf", original)
            matched = client.get("/api/auth/me")
            assert matched.status_code == 200
            assert _issued(matched, "finance_csrf") == [original]
            assert _hash_row(database, session_id) == _hash_secret(original)

            kept = [cookie for cookie in client.cookies.jar if cookie.name != "finance_csrf"]
            client.cookies.jar.clear()
            for cookie in kept:
                client.cookies.jar.set_cookie(cookie)
            missing = client.get("/api/auth/me")
            assert missing.status_code == 200
            assert _issued(missing, "finance_csrf") == []
            assert _hash_row(database, session_id) == _hash_secret(original)
            client.headers["X-CSRF-Token"] = original
            assert client.post("/api/auth/session").status_code == 200

            client.cookies.set("finance_csrf", "stale-token")
            client.headers["X-CSRF-Token"] = "stale-token"
            assert client.post("/api/auth/session").status_code == 403
            repaired = client.get("/api/auth/me")
            assert repaired.status_code == 200
            issued = _issued(repaired, "finance_csrf")
            assert issued == seen[-1:]
            assert len(issued) == 1
            assert issued[0] != "stale-token"
            assert _hash_row(database, session_id) == _hash_secret(issued[0])
            client.headers["X-CSRF-Token"] = issued[0]
            assert client.post("/api/auth/session").status_code == 200
    finally:
        database.engine.dispose()


def test_repair_commit_failure_does_not_publish_a_cookie(tmp_path, monkeypatch):
    application, database = _database(tmp_path)
    try:
        token, original, session_id, _user_id = _open_session(database)
        real_repair = identity_session.commit_csrf_repair
        real_commit = Session.commit
        state = {"inside": False, "failed": False}

        def wrapped(db, session, observed, fresh):
            state["inside"] = True
            try:
                return real_repair(db, session, observed, fresh)
            finally:
                state["inside"] = False

        def commit(self):
            if state["inside"]:
                state["failed"] = True
                raise RuntimeError("synthetic commit failure")
            return real_commit(self)

        monkeypatch.setattr(identity_session, "commit_csrf_repair", wrapped)
        monkeypatch.setattr(Session, "commit", commit)
        with TestClient(application) as client:
            client.cookies.set("finance_session", token)
            client.cookies.set("finance_csrf", "stale-token")
            repaired = client.get("/api/auth/me")
            assert repaired.status_code == 200, repaired.text
            assert _issued(repaired, "finance_csrf") == []
        assert state["failed"] is True
        assert _hash_row(database, session_id) == _hash_secret(original)
    finally:
        database.engine.dispose()


def test_concurrent_repairs_publish_only_the_committed_token(tmp_path, monkeypatch):
    _application, database = _database(tmp_path)
    try:
        token, _original, session_id, user_id = _open_session(database)
        barrier = threading.Barrier(2)
        real = commit_csrf_repair

        def gated(db, session, observed, fresh):
            barrier.wait(5)
            return real(db, session, observed, fresh)

        monkeypatch.setattr(identity_session, "commit_csrf_repair", gated)
        responses: list[Response] = []

        def once():
            db = database.sessionmaker()
            try:
                user = db.query(User).filter(User.id == user_id).one()
                response = Response()
                me(
                    _request(f"finance_session={token}; finance_csrf=stale-token"),
                    response,
                    db,
                    user,
                )
                responses.append(response)
            finally:
                db.close()

        _join([once, once])
        issued = [value for response in responses if (value := _cookie(response, "finance_csrf"))]
        assert len(issued) == 1
        winner = _hash_row(database, session_id)
        assert winner == _hash_secret(issued[0])
        assert _hash_secret("stale-token") != winner
        silent = [response for response in responses if _cookie(response, "finance_csrf") is None]
        assert len(silent) == 1
    finally:
        monkeypatch.setattr(identity_session, "commit_csrf_repair", real)
        database.engine.dispose()


def test_refresh_does_not_overwrite_the_repair_winner(tmp_path, monkeypatch):
    _application, database = _database(tmp_path)
    try:
        token, original, session_id, _user_id = _open_session(database)
        barrier = threading.Barrier(2)
        real_emit = emit_committed_csrf

        def gated(db, response, row_id, csrf):
            barrier.wait(5)
            return real_emit(db, response, row_id, csrf)

        monkeypatch.setattr(identity_session, "emit_committed_csrf", gated)
        found: dict[str, Response] = {}

        def repair():
            db = database.sessionmaker()
            try:
                response = Response()
                repair_csrf_cookie(
                    db,
                    _request(f"finance_session={token}; finance_csrf=stale-token"),
                    response,
                )
                found["repair"] = response
            finally:
                db.close()

        def refresh():
            db = database.sessionmaker()
            try:
                row = db.query(UserSession).filter(UserSession.id == session_id).one()
                response = Response()
                refresh_session_cookies(
                    db,
                    _request(f"finance_session={token}; finance_csrf={original}"),
                    response,
                    row,
                )
                found["refresh"] = response
            finally:
                db.close()

        _join([repair, refresh])
        winner = _hash_row(database, session_id)
        repair_cookie = _cookie(found["repair"], "finance_csrf")
        refresh_cookie = _cookie(found["refresh"], "finance_csrf")
        assert repair_cookie
        assert winner == _hash_secret(repair_cookie)
        assert refresh_cookie in (None, repair_cookie)
        assert refresh_cookie != original
        assert winner != _hash_secret(original)
    finally:
        monkeypatch.setattr(identity_session, "emit_committed_csrf", real_emit)
        database.engine.dispose()
