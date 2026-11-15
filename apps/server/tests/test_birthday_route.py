"""Owner-only birthday route: validation, CSRF, privacy, and audit."""

import asyncio
import logging
import logging.config
import re
import traceback
from datetime import date, timedelta
from pathlib import Path
from typing import cast

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient
from sqlalchemy import text
from sqlalchemy.exc import OperationalError, SQLAlchemyError
from sqlalchemy.orm import Session

from apps.server.database import open_database
from apps.server.errors import APIError
from apps.server.identity import birthday as birthday_route
from apps.server.identity.birthday import (
    MSG_FUTURE,
    _commit,
)
from apps.server.identity.models import AuditEvent, User, UserRole, UserSession
from apps.server.identity.session import _hash_secret, utc_now_naive
from apps.server.tests.test_composition import _app


def _call(client, method, url, token=None, csrf=None, **kwargs):
    # The shared helper sets the cookie only. Writes also need the header.
    client.cookies.clear()
    headers = dict(kwargs.pop("headers", {}))
    if token:
        cookie = f"finance_session={token}"
        if csrf:
            cookie += f"; finance_csrf={csrf}"
            headers["X-CSRF-Token"] = csrf
        headers["Cookie"] = cookie
    response = getattr(client, method)(url, headers=headers, **kwargs)
    client.cookies.clear()
    return response


TODAY = date(2026, 10, 30)
SECRET = "1919-08-26"
_DATE_TEXT = re.compile(r"\d{4}.\d{2}.\d{2}|\d{8}")


def _freeze_today(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr("apps.server.identity.birthday.server_today", lambda: TODAY)


def _user(
    database,
    user_id: int,
    token: str,
    csrf: str,
    *,
    role: UserRole = UserRole.user,
) -> None:
    now = utc_now_naive()
    db = database.sessionmaker()
    db.add(
        User(
            id=user_id,
            email=f"user{user_id}@example.invalid",
            display_name=f"User {user_id}",
            username=f"user{user_id}",
            role=role,
            is_active=True,
        )
    )
    db.flush()
    db.add(
        UserSession(
            user_id=user_id,
            token_hash=_hash_secret(token),
            csrf_token_hash=_hash_secret(csrf),
            expires_at=now + timedelta(hours=2),
        )
    )
    db.commit()
    db.close()


def _open(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    _freeze_today(monkeypatch)
    monkeypatch.delenv("API_KEY", raising=False)
    monkeypatch.delenv("FINANCE_API_KEY", raising=False)
    monkeypatch.setenv("LOCAL_DEV_AUTH", "0")
    return _app(tmp_path)


def _echoes(body: object) -> list[str]:
    found: list[str] = []
    if isinstance(body, dict):
        for key, value in body.items():
            found.extend(_echoes(key))
            found.extend(_echoes(value))
    elif isinstance(body, list):
        for item in body:
            found.extend(_echoes(item))
    elif isinstance(body, str):
        found.extend(_DATE_TEXT.findall(body))
    elif isinstance(body, int) and not isinstance(body, bool):
        found.append(str(body))
    return found


def test_get_and_patch_round_trip(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    application, database = _open(tmp_path, monkeypatch)
    _user(database, 1, "token-a", "csrf-a")
    saved = {"birthday": "1996-03-14", "show_age": True}
    with TestClient(application) as client:
        initial = _call(client, "get", "/api/account/birthday", "token-a")
        assert initial.status_code == 200
        assert initial.json() == {"birthday": None, "show_age": False}
        assert "no-store" in initial.headers["cache-control"]
        patched = _call(
            client,
            "patch",
            "/api/account/birthday",
            "token-a",
            "csrf-a",
            json=saved,
        )
        assert patched.status_code == 200
        assert patched.json() == saved
        again = _call(client, "get", "/api/account/birthday", "token-a")
        assert again.json() == saved
        edge = _call(
            client,
            "patch",
            "/api/account/birthday",
            "token-a",
            "csrf-a",
            json={"birthday": "1900-01-01", "show_age": False},
        )
        assert edge.status_code == 200
        assert edge.json() == {"birthday": "1900-01-01", "show_age": False}
        leap = _call(
            client,
            "patch",
            "/api/account/birthday",
            "token-a",
            "csrf-a",
            json={"birthday": "2000-02-29", "show_age": True},
        )
        assert leap.status_code == 200
        latest = (TODAY + timedelta(days=1)).isoformat()
        slack = _call(
            client,
            "patch",
            "/api/account/birthday",
            "token-a",
            "csrf-a",
            json={"birthday": latest, "show_age": False},
        )
        assert slack.status_code == 200
        assert slack.json()["birthday"] == latest
        today = _call(
            client,
            "patch",
            "/api/account/birthday",
            "token-a",
            "csrf-a",
            json={"birthday": TODAY.isoformat(), "show_age": True},
        )
        assert today.status_code == 200
        cleared = _call(
            client,
            "patch",
            "/api/account/birthday",
            "token-a",
            "csrf-a",
            json={"birthday": None, "show_age": False},
        )
        assert cleared.status_code == 200
        assert cleared.json() == {"birthday": None, "show_age": False}
    db = database.sessionmaker()
    try:
        user = db.get(User, 1)
        assert user is not None
        assert user.birthday is None
        assert user.pixels_show_age is False
        audits = db.query(AuditEvent).filter(AuditEvent.event_type == "account.birthday_changed")
        assert audits.count() == 6
        assert all(row.detail is None for row in audits)
        assert {row.actor_user_id for row in audits} == {1}
        assert {row.target_user_id for row in audits} == {1}
    finally:
        db.close()


def test_missing_session_is_401(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    application, _database = _open(tmp_path, monkeypatch)
    with TestClient(application) as client:
        got = client.get("/api/account/birthday")
        assert got.status_code == 401
        assert got.json()["detail"] == "Login required"
        patched = client.patch(
            "/api/account/birthday",
            json={"birthday": SECRET, "show_age": True},
        )
        assert patched.status_code == 401
        assert SECRET not in patched.text


def test_patch_without_csrf_is_403(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    application, database = _open(tmp_path, monkeypatch)
    _user(database, 1, "token-a", "csrf-a")
    body = {"birthday": SECRET, "show_age": True}
    with TestClient(application) as client:
        missing = _call(client, "patch", "/api/account/birthday", "token-a", json=body)
        assert missing.status_code == 403
        assert missing.json()["detail"] == "Invalid CSRF token"
        assert SECRET not in missing.text
        wrong = _call(client, "patch", "/api/account/birthday", "token-a", "other", json=body)
        assert wrong.status_code == 403
        assert SECRET not in wrong.text
        allowed = _call(client, "get", "/api/account/birthday", "token-a")
        assert allowed.status_code == 200
        assert allowed.json() == {"birthday": None, "show_age": False}
    db = database.sessionmaker()
    try:
        assert (
            db.query(AuditEvent).filter(AuditEvent.event_type == "account.birthday_changed").count()
            == 0
        )
    finally:
        db.close()


def test_cross_user_patch_does_not_change_the_other_account(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    application, database = _open(tmp_path, monkeypatch)
    _user(database, 1, "token-a", "csrf-a")
    _user(database, 2, "token-b", "csrf-b")
    with TestClient(application) as client:
        first = _call(
            client,
            "patch",
            "/api/account/birthday",
            "token-a",
            "csrf-a",
            json={"birthday": "1984-07-19", "show_age": True},
        )
        assert first.status_code == 200
        second = _call(
            client,
            "patch",
            "/api/account/birthday",
            "token-b",
            "csrf-b",
            json={"birthday": "1972-11-02", "show_age": False},
        )
        assert second.status_code == 200
        assert _call(client, "get", "/api/account/birthday", "token-a").json() == {
            "birthday": "1984-07-19",
            "show_age": True,
        }
        assert _call(client, "get", "/api/account/birthday", "token-b").json() == {
            "birthday": "1972-11-02",
            "show_age": False,
        }
        again = _call(
            client,
            "patch",
            "/api/account/birthday",
            "token-b",
            "csrf-b",
            json={"birthday": None, "show_age": True},
        )
        assert again.status_code == 200
        assert _call(client, "get", "/api/account/birthday", "token-a").json()["birthday"] == (
            "1984-07-19"
        )
    db = database.sessionmaker()
    try:
        owner = db.get(User, 1)
        other = db.get(User, 2)
        assert owner is not None and other is not None
        assert owner.birthday == date(1984, 7, 19)
        assert owner.pixels_show_age is True
        assert other.birthday is None
        assert other.pixels_show_age is True
    finally:
        db.close()


def test_real_server_clock_accepts_a_past_date_and_rejects_a_far_future_one(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.delenv("API_KEY", raising=False)
    monkeypatch.delenv("FINANCE_API_KEY", raising=False)
    monkeypatch.setenv("LOCAL_DEV_AUTH", "0")
    application, database = _app(tmp_path)
    _user(database, 1, "token-a", "csrf-a")
    with TestClient(application) as client:
        saved = _call(
            client,
            "patch",
            "/api/account/birthday",
            "token-a",
            "csrf-a",
            json={"birthday": "1990-01-01", "show_age": False},
        )
        assert saved.status_code == 200
        assert saved.json() == {"birthday": "1990-01-01", "show_age": False}
        rejected = _call(
            client,
            "patch",
            "/api/account/birthday",
            "token-a",
            "csrf-a",
            json={"birthday": "2999-01-01", "show_age": False},
        )
        assert rejected.status_code == 422
        assert rejected.json() == {"detail": MSG_FUTURE}
        assert "2999-01-01" not in rejected.text


def test_commit_failure_does_not_log_or_return_the_birthday(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, caplog: pytest.LogCaptureFixture
) -> None:
    caplog.set_level(logging.DEBUG)
    application, database = _open(tmp_path, monkeypatch)
    _user(database, 1, "token-a", "csrf-a")

    def locked(self: Session) -> None:
        raise OperationalError(
            f"UPDATE users SET birthday='{SECRET}'",
            {"birthday": SECRET},
            Exception(f"database is locked: {SECRET}"),
        )

    monkeypatch.setattr(Session, "commit", locked)
    with TestClient(application) as client:
        failed = _call(
            client,
            "patch",
            "/api/account/birthday",
            "token-a",
            "csrf-a",
            json={"birthday": SECRET, "show_age": True},
        )
    assert failed.status_code == 500
    body = failed.json()
    assert body["code"] == "internal"
    assert body["message"] == "Internal server error"
    assert body["detail"] == "Internal server error"
    assert SECRET not in failed.text
    assert SECRET not in caplog.text
    for record in caplog.records:
        assert SECRET not in record.getMessage()
        if record.exc_info and record.exc_info[1] is not None:
            assert SECRET not in str(record.exc_info[1])
            cause = getattr(record.exc_info[1], "__cause__", None)
            assert cause is None or SECRET not in str(cause)


def _driver_error() -> OperationalError:
    return OperationalError(
        f"UPDATE users SET birthday='{SECRET}'",
        {"birthday": SECRET},
        Exception(f"database is locked: {SECRET}"),
    )


def _captured_logs(caplog: pytest.LogCaptureFixture, capsys: pytest.CaptureFixture[str]) -> str:
    parts = [caplog.text]
    for record in caplog.records:
        parts.append(record.getMessage())
        if record.exc_text:
            parts.append(record.exc_text)
        if record.exc_info and record.exc_info[1] is not None:
            parts.append("".join(traceback.format_exception(record.exc_info[1])))
    captured = capsys.readouterr()
    parts.append(captured.out)
    parts.append(captured.err)
    return "\n".join(parts)


def _watch_logs(caplog: pytest.LogCaptureFixture) -> None:
    caplog.set_level(logging.DEBUG)
    for name in ("sqlalchemy", "sqlalchemy.engine", "finance_api", "site"):
        caplog.set_level(logging.DEBUG, logger=name)


def test_commit_and_rollback_failure_does_not_leak_the_birthday(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    caplog: pytest.LogCaptureFixture,
    capsys: pytest.CaptureFixture[str],
) -> None:
    _watch_logs(caplog)
    application, database = _open(tmp_path, monkeypatch)
    _user(database, 1, "token-a", "csrf-a")
    calls = {"n": 0}
    original = Session.rollback

    def rollback(self: Session) -> None:
        calls["n"] += 1
        if calls["n"] <= 2:
            raise _driver_error()
        original(self)

    def commit(self: Session) -> None:
        raise _driver_error()

    monkeypatch.setattr(Session, "commit", commit)
    monkeypatch.setattr(Session, "rollback", rollback)
    with TestClient(application) as client:
        failed = _call(
            client,
            "patch",
            "/api/account/birthday",
            "token-a",
            "csrf-a",
            json={"birthday": SECRET, "show_age": True},
        )
    assert calls["n"] >= 1
    assert failed.status_code == 500
    assert failed.json()["code"] == "internal"
    assert failed.json()["message"] == "Internal server error"
    assert failed.json()["detail"] == "Internal server error"
    assert SECRET not in failed.text
    assert SECRET not in _captured_logs(caplog, capsys)


def _assert_no_secret(value: object, secret: str, seen: set[int], where: str) -> None:
    """str, repr, date.isoformat, and instance attributes all count as hits."""
    marker = id(value)
    if marker in seen:
        return
    seen.add(marker)
    assert secret not in str(value), where
    assert secret not in repr(value), where
    if isinstance(value, date):
        assert secret not in value.isoformat(), where
    children: list[object] = []
    if isinstance(value, dict):
        children.extend(value.values())
    elif isinstance(value, (list, tuple, set, frozenset)):
        children.extend(value)
    elif getattr(type(value), "__module__", "").startswith("apps.server."):
        attrs = getattr(value, "__dict__", None)
        if isinstance(attrs, dict):
            children.extend(attrs.values())
    for child in children:
        _assert_no_secret(child, secret, seen, where)


def _assert_birthday_is_detached(error: BaseException, secret: str, *names: str) -> None:
    """The client error must not chain, or retain, the value that caused it."""
    assert error.__context__ is None
    assert error.__cause__ is None
    assert secret not in str(error.args)
    assert secret not in repr(error.args)
    found: list[str] = []
    seen: set[int] = set()
    frame = error.__traceback__
    while frame is not None:
        found.append(frame.tb_frame.f_code.co_name)
        where = frame.tb_frame.f_code.co_name
        for value in frame.tb_frame.f_locals.values():
            _assert_no_secret(value, secret, seen, where)
        frame = frame.tb_next
    for name in names:
        assert name in found


def _secret_body_request(note: bool = False) -> birthday_route.Request:
    """Stream the body once. The request does not keep those bytes."""

    class _Request:
        def __init__(self) -> None:
            text = '{"birthday":"' + SECRET + '","show_age":true'
            if note:
                text += ',"note":"' + SECRET + '"'
            body = (text + "}").encode()
            self.headers = {"content-length": str(len(body))}
            self._pending: bytes | None = body

        async def stream(self):
            body = self._pending
            del self._pending
            if body:
                yield body

    return cast(birthday_route.Request, _Request())


def test_commit_failure_frame_omits_the_submitted_birthday(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(birthday_route, "server_today", lambda: TODAY)

    class _Owner:
        id = 1
        birthday = None
        pixels_show_age = False
        updated_at = None

    class _Rows:
        def __init__(self, owner: _Owner) -> None:
            self._owner = owner

        def add(self, _row: object) -> None:
            return None

        def commit(self) -> None:
            raise _driver_error()

        def rollback(self) -> None:
            self._owner.birthday = None
            raise _driver_error()

    owner = _Owner()
    with pytest.raises(APIError) as caught:
        asyncio.run(
            birthday_route.update_birthday(
                _secret_body_request(),
                cast(Session, _Rows(owner)),
                cast(User, owner),
            )
        )
    error = caught.value
    assert error.status_code == 500
    assert error.message == "Internal server error"
    _assert_birthday_is_detached(error, SECRET, "update_birthday", "_commit")


def test_engine_hides_bound_parameters(tmp_path: Path) -> None:
    database = open_database(f"sqlite:///{tmp_path / 'hide.db'}")
    assert database.engine.hide_parameters is True
    db = database.sessionmaker()
    try:
        with pytest.raises(SQLAlchemyError) as caught:
            db.execute(
                text("SELECT * FROM missing WHERE birthday = :birthday"),
                {"birthday": SECRET},
            )
    finally:
        db.close()
    assert SECRET not in str(caught.value)
    assert "SQL parameters hidden" in str(caught.value)


def _client_error(body: bytes) -> HTTPException:
    class _Request:
        def __init__(self, payload: bytes) -> None:
            self.headers = {"content-length": str(len(payload))}
            self._pending: bytes | None = payload

        async def stream(self):
            pending, self._pending = self._pending, None
            if pending:
                yield pending

    request = cast(birthday_route.Request, _Request(body))
    session, user = cast(Session, object()), cast(User, object())
    del body
    with pytest.raises(HTTPException) as caught:
        asyncio.run(birthday_route.update_birthday(request, session, user))
    return caught.value


def test_commit_and_rollback_failure_log_omits_birthday_context(
    tmp_path: Path, caplog: pytest.LogCaptureFixture, capsys: pytest.CaptureFixture[str]
) -> None:
    _watch_logs(caplog)
    database = open_database(f"sqlite:///{tmp_path / 'reset.db'}")
    dialect = database.engine.dialect
    state = {"n": 0}
    real_rollback = dialect.do_rollback

    def do_commit(_connection: object) -> None:
        raise _driver_error()

    def do_rollback(connection) -> None:
        state["n"] += 1
        if state["n"] == 1:
            return real_rollback(connection)
        raise OperationalError("ROLLBACK", {}, Exception("reset failed"))

    dialect.__dict__.update(do_commit=do_commit, do_rollback=do_rollback)
    db = database.sessionmaker()
    try:
        db.execute(text("select 1"))
        caplog.clear()
        with pytest.raises(APIError) as caught:
            _commit(db)
        error = caught.value
        assert caplog.handler.level == logging.DEBUG
        assert error.__context__ is None
        assert error.__cause__ is None
        chained: BaseException | None = error
        seen: set[int] = set()
        while chained is not None and id(chained) not in seen:
            seen.add(id(chained))
            assert SECRET not in str(chained)
            assert SECRET not in repr(chained)
            chained = chained.__context__
        logged = _captured_logs(caplog, capsys)
        assert "Exception during reset" in logged
        assert SECRET not in logged
        assert state["n"] >= 2
    finally:
        db.close()
        database.engine.dispose()
