"""Owner-only birthday route: validation, CSRF, privacy, and audit."""

import asyncio
import json
import logging
import logging.config
import os
import re
import time
import traceback
from datetime import UTC, date, datetime, timedelta, tzinfo
from pathlib import Path
from typing import Any, cast

import pytest
from fastapi import HTTPException
from fastapi.responses import Response
from fastapi.testclient import TestClient
from sqlalchemy import text
from sqlalchemy.exc import OperationalError, SQLAlchemyError
from sqlalchemy.orm import Session

from apps.server.database import _EngineParameterFilter, open_database
from apps.server.errors import APIError
from apps.server.identity import birthday as birthday_route
from apps.server.identity.birthday import (
    MSG_FULL_DATE,
    MSG_FUTURE,
    MSG_SHOW_AGE,
    MSG_UNKNOWN,
    MSG_YEAR,
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


@pytest.mark.parametrize(
    ("body", "detail"),
    [
        ({"birthday": "1996-3-14", "show_age": False}, MSG_FULL_DATE),
        ({"birthday": "1996/03/14", "show_age": False}, MSG_FULL_DATE),
        ({"birthday": "03-14-1996", "show_age": False}, MSG_FULL_DATE),
        ({"birthday": "1996-03-14T00:00:00", "show_age": False}, MSG_FULL_DATE),
        ({"birthday": "19960314", "show_age": False}, MSG_FULL_DATE),
        ({"birthday": "", "show_age": False}, MSG_FULL_DATE),
        ({"birthday": "1996-02-31", "show_age": False}, MSG_FULL_DATE),
        ({"birthday": "1996-13-01", "show_age": False}, MSG_FULL_DATE),
        ({"birthday": "1900-02-29", "show_age": False}, MSG_FULL_DATE),
        ({"birthday": " 1996-03-14", "show_age": False}, MSG_FULL_DATE),
        ({"birthday": "1996-03-14 ", "show_age": False}, MSG_FULL_DATE),
        ({"birthday": 19960314, "show_age": False}, MSG_FULL_DATE),
        ({"show_age": False}, MSG_FULL_DATE),
        ({"birthday": "1899-12-31", "show_age": False}, MSG_YEAR),
        ({"birthday": "0900-01-01", "show_age": True}, MSG_YEAR),
        ({"birthday": "2026-11-01", "show_age": False}, MSG_FUTURE),
        ({"birthday": "1996-03-14", "show_age": 1}, MSG_SHOW_AGE),
        ({"birthday": "1996-03-14", "show_age": 0}, MSG_SHOW_AGE),
        ({"birthday": "1996-03-14", "show_age": "true"}, MSG_SHOW_AGE),
        ({"birthday": "1996-03-14", "show_age": "false"}, MSG_SHOW_AGE),
        ({"birthday": "1996-03-14", "show_age": None}, MSG_SHOW_AGE),
        ({"birthday": None}, MSG_SHOW_AGE),
        ({"birthday": None, "show_age": False, "extra": 1}, MSG_UNKNOWN),
        ({"birthday": "1996-03-14", "show_age": True, "note": "1996-03-14"}, MSG_UNKNOWN),
    ],
)
def test_patch_rejects_invalid_bodies(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, body: object, detail: str
) -> None:
    application, database = _open(tmp_path, monkeypatch)
    _user(database, 1, "token-a", "csrf-a")
    kept = {"birthday": "1980-05-05", "show_age": True}
    with TestClient(application) as client:
        saved = _call(client, "patch", "/api/account/birthday", "token-a", "csrf-a", json=kept)
        assert saved.status_code == 200
        rejected = _call(client, "patch", "/api/account/birthday", "token-a", "csrf-a", json=body)
        assert rejected.status_code == 422
        assert rejected.json() == {"detail": detail}
        for token in _echoes(body):
            assert token not in rejected.text
        current = _call(client, "get", "/api/account/birthday", "token-a")
        assert current.json() == kept


def test_patch_rejects_malformed_json(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    application, database = _open(tmp_path, monkeypatch)
    _user(database, 1, "token-a", "csrf-a")
    raw = b'{"birthday": "1919-08-26"'
    array = b'["1919-08-26"]'
    with TestClient(application) as client:
        invalid_utf8 = b'{"birthday":"1919-08-26"\xff}'
        for content in (
            b"",
            raw,
            array,
            b"null",
            b'"1919-08-26"',
            b'"birthday"',
            b"true",
            b"1",
            b"false",
            invalid_utf8,
        ):
            rejected = _call(
                client,
                "patch",
                "/api/account/birthday",
                "token-a",
                "csrf-a",
                content=content,
                headers={"Content-Type": "application/json"},
            )
            assert rejected.status_code == 422
            assert rejected.json() == {"detail": MSG_FULL_DATE}
            assert SECRET not in rejected.text
            assert "1919-08-26" not in rejected.text


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


def test_birthday_stays_out_of_me_logs_admin_and_errors(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, caplog: pytest.LogCaptureFixture
) -> None:
    caplog.set_level(logging.DEBUG)
    application, database = _open(tmp_path, monkeypatch)
    _user(database, 1, "token-a", "csrf-a")
    _user(database, 2, "token-admin", "csrf-admin", role=UserRole.admin)
    body = {"birthday": SECRET, "show_age": False}
    with TestClient(application) as client:
        saved = _call(client, "patch", "/api/account/birthday", "token-a", "csrf-a", json=body)
        assert saved.status_code == 200
        assert saved.json()["birthday"] == SECRET
        me = _call(client, "get", "/api/auth/me", "token-a")
        assert me.status_code == 200
        assert SECRET not in me.text
        assert "birthday" not in me.json()["user"]
        assert "show_age" not in me.json()["user"]
        users = _call(client, "get", "/api/admin/users", "token-admin")
        metrics = _call(client, "get", "/api/admin/metrics", "token-admin")
        assert users.status_code == 200
        assert metrics.status_code == 200
        assert SECRET not in users.text
        assert SECRET not in metrics.text
        leaked = _call(
            client,
            "patch",
            "/api/account/birthday",
            "token-a",
            "csrf-a",
            json={"birthday": f"{SECRET}T00:00:00", "show_age": True},
        )
        assert leaked.status_code == 422
        assert SECRET not in leaked.text
    assert SECRET not in caplog.text
    db = database.sessionmaker()
    try:
        rows = db.query(AuditEvent).filter(AuditEvent.event_type == "account.birthday_changed")
        assert rows.count() == 1
        row = rows.one()
        assert row.detail is None
        assert SECRET not in (row.detail or "")
        assert SECRET not in row.event_type
    finally:
        db.close()


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


def test_write_failure_raises_api_error_without_a_cause() -> None:
    class Boom:
        def commit(self) -> None:
            raise _driver_error()

        def rollback(self) -> None:
            raise _driver_error()

    with pytest.raises(APIError) as caught:
        _commit(cast(Session, Boom()))
    error = caught.value
    assert error.__suppress_context__ is True
    _assert_birthday_is_detached(error, SECRET)
    rendered = "".join(traceback.format_exception(error))
    assert SECRET not in rendered
    assert error.status_code == 500
    assert error.message == "Internal server error"


def test_reject_does_not_chain_the_parse_error(monkeypatch: pytest.MonkeyPatch) -> None:
    class _Date:
        @staticmethod
        def fromisoformat(_value: str) -> date:
            raise ValueError(SECRET)

    monkeypatch.setattr(birthday_route, "date", _Date)
    with pytest.raises(HTTPException) as caught:
        birthday_route._parse_birthday("1996-03-14", TODAY)
    error = caught.value
    assert error.status_code == 422
    assert error.detail == MSG_FULL_DATE
    assert error.__suppress_context__ is True
    _assert_birthday_is_detached(error, SECRET)

    def explode_json(_text: str) -> object:
        raise ValueError(SECRET)

    monkeypatch.setattr(birthday_route.json, "loads", explode_json)

    class Request:
        def __init__(self) -> None:
            self.headers = {"content-length": "2"}

        async def stream(self):
            yield b"{}"

    with pytest.raises(HTTPException) as body_error:
        asyncio.run(
            birthday_route.update_birthday(
                cast(birthday_route.Request, Request()),
                cast(Session, object()),
                cast(User, object()),
            )
        )
    raised = body_error.value
    assert raised.status_code == 422
    assert raised.detail == MSG_FULL_DATE
    _assert_birthday_is_detached(raised, SECRET)


def test_reject_frame_omits_the_submitted_birthday(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(birthday_route, "server_today", lambda: date(1900, 1, 1))
    with pytest.raises(HTTPException) as caught:
        asyncio.run(
            birthday_route.update_birthday(
                _secret_body_request(),
                cast(Session, object()),
                cast(User, object()),
            )
        )
    error = caught.value
    assert error.status_code == 422
    assert error.detail == MSG_FUTURE
    _assert_birthday_is_detached(error, SECRET, "update_birthday", "_parse_body", "_parse_birthday")


def test_sibling_note_is_absent_when_parse_rejects(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(birthday_route, "server_today", lambda: date(1900, 1, 1))
    with pytest.raises(HTTPException) as caught:
        asyncio.run(
            birthday_route.update_birthday(
                _secret_body_request(note=True),
                cast(Session, object()),
                cast(User, object()),
            )
        )
    error = caught.value
    assert error.status_code == 422
    assert error.detail == MSG_FUTURE
    _assert_birthday_is_detached(error, SECRET, "update_birthday", "_parse_body", "_parse_birthday")


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


def test_debug_root_does_not_log_a_birthday_query(
    tmp_path: Path, caplog: pytest.LogCaptureFixture, capsys: pytest.CaptureFixture[str]
) -> None:
    sqlalchemy_log = logging.getLogger("sqlalchemy")
    engine_log = logging.getLogger("sqlalchemy.engine")
    engine_logger = logging.getLogger("sqlalchemy.engine.Engine")
    previous = (sqlalchemy_log.level, engine_log.level)

    class _Capture(logging.Handler):
        def __init__(self) -> None:
            super().__init__()
            self.messages: list[str] = []

        def emit(self, record: logging.LogRecord) -> None:
            self.messages.append(record.getMessage())

    # Parent handler installed before open_database, so the propagate walk
    # attaches the parameter filter to the handler itself.
    propagation = _Capture()
    propagation.setLevel(logging.DEBUG)
    sqlalchemy_log.addHandler(propagation)
    sqlalchemy_log.setLevel(logging.DEBUG)
    engine_log.setLevel(logging.DEBUG)
    engine_logger.setLevel(logging.DEBUG)
    caplog.set_level(logging.DEBUG)
    database = None
    try:
        _application, database = _app(tmp_path)
        assert engine_logger.getEffectiveLevel() == logging.DEBUG
        assert database.engine.echo is False
        assert database.engine.hide_parameters is True
        assert any(isinstance(item, _EngineParameterFilter) for item in engine_log.filters)
        assert any(isinstance(item, _EngineParameterFilter) for item in engine_logger.filters)
        assert any(isinstance(item, _EngineParameterFilter) for item in propagation.filters)
        assert not any(
            isinstance(item, _EngineParameterFilter) for item in logging.getLogger().filters
        )
        _user(database, 1, "token-a", "csrf-a")
        db = database.sessionmaker()
        try:
            user = db.query(User).filter(User.id == 1).one()
            user.birthday = date.fromisoformat(SECRET)
            db.commit()
            loaded = db.query(User).filter(User.birthday == date.fromisoformat(SECRET)).one()
            assert loaded.birthday is not None
            assert loaded.birthday.isoformat() == SECRET
        finally:
            db.close()

        def clean(text_out: str) -> None:
            assert SECRET not in text_out
            assert "1919" not in text_out
            assert any(token in text_out for token in ("SELECT", "UPDATE", "INSERT"))
            for record in caplog.records:
                assert SECRET not in record.getMessage()

        clean(_captured_logs(caplog, capsys))

        # Logger filters off: only handlers on the propagate walk can drop parameters.
        saved_filters = [(logger, list(logger.filters)) for logger in (engine_log, engine_logger)]
        for logger, _filters in saved_filters:
            logger.filters.clear()
        propagation.messages.clear()
        try:
            engine_logger.debug("[%s] %r", "SELECT", {"birthday": SECRET})
            engine_logger.debug("Row %r", SECRET)
            engine_logger.debug("[raw sql] %s", SECRET)
            engine_logger.debug("SELECT users")
            for message in propagation.messages:
                assert SECRET not in message
                assert "1919" not in message
            assert "SELECT users" in propagation.messages
        finally:
            for logger, filters in saved_filters:
                logger.filters[:] = filters
            caplog.clear()

        def again() -> None:
            caplog.clear()
            session = database.sessionmaker()
            try:
                row = session.query(User).filter(User.id == 1).one()
                assert row.birthday is not None
                assert row.birthday.isoformat() == SECRET
            finally:
                session.close()
            text_out = _captured_logs(caplog, capsys)
            assert SECRET not in text_out
            assert "1919" not in text_out
            assert any(token in text_out for token in ("SELECT", "UPDATE", "INSERT"))
            for record in caplog.records:
                assert SECRET not in record.getMessage()

        database.engine.echo = "debug"
        database.engine.hide_parameters = False
        assert database.engine.echo == "debug"
        again()
        cfg: dict[str, Any] = {"version": 1, "incremental": True}
        cfg["loggers"] = {"sqlalchemy.engine": {"level": "DEBUG"}}
        logging.config.dictConfig(cfg)
        engine_logger.setLevel(logging.DEBUG)
        assert engine_log.getEffectiveLevel() == logging.DEBUG
        again()
    finally:
        sqlalchemy_log.removeHandler(propagation)
        sqlalchemy_log.setLevel(previous[0])
        engine_log.setLevel(previous[1])
        engine_logger.handlers.clear()
        engine_logger.setLevel(logging.NOTSET)
        if database is not None:
            database.engine.echo = False
            database.engine.hide_parameters = True
            database.engine.dispose()


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


def test_server_today_follows_utc_when_the_local_date_differs(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    previous = os.environ.get("TZ")
    os.environ["TZ"] = "America/Los_Angeles"
    time.tzset()
    try:
        instant = datetime(2026, 10, 30, 2, 0, tzinfo=UTC)
        assert instant.astimezone().date() == date(2026, 10, 29)

        class _Clock:
            @staticmethod
            def now(tz: object = None) -> datetime:
                assert isinstance(tz, tzinfo)
                assert tz is UTC
                return instant.astimezone(tz)

        monkeypatch.setattr(birthday_route, "datetime", _Clock)
        assert birthday_route.server_today() == date(2026, 10, 30)
        monkeypatch.delenv("API_KEY", raising=False)
        monkeypatch.delenv("FINANCE_API_KEY", raising=False)
        monkeypatch.setenv("LOCAL_DEV_AUTH", "0")
        application, database = _app(tmp_path)
        _user(database, 1, "token-a", "csrf-a")
        with TestClient(application) as client:
            allowed = _call(
                client,
                "patch",
                "/api/account/birthday",
                "token-a",
                "csrf-a",
                json={"birthday": "2026-10-31", "show_age": False},
            )
            assert allowed.status_code == 200
            assert allowed.json()["birthday"] == "2026-10-31"
            rejected = _call(
                client,
                "patch",
                "/api/account/birthday",
                "token-a",
                "csrf-a",
                json={"birthday": "2026-11-01", "show_age": False},
            )
            assert rejected.status_code == 422
            assert rejected.json() == {"detail": MSG_FUTURE}
    finally:
        if previous is None:
            os.environ.pop("TZ", None)
        else:
            os.environ["TZ"] = previous
        time.tzset()


def test_non_utf8_and_bom_bodies_are_422(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    application, database = _open(tmp_path, monkeypatch)
    _user(database, 1, "token-a", "csrf-a")
    valid = b'{"birthday":"1996-03-14","show_age":true}'
    bodies = (
        b"\xef\xbb\xbf" + valid,
        valid.decode().encode("utf-16"),
        valid.decode().encode("utf-16-be"),
        valid.decode().encode("utf-32"),
        valid.decode().encode("utf-32-le"),
    )
    with TestClient(application) as client:
        for content in bodies:
            rejected = _call(
                client,
                "patch",
                "/api/account/birthday",
                "token-a",
                "csrf-a",
                content=content,
                headers={"Content-Type": "application/json"},
            )
            assert rejected.status_code == 422
            assert rejected.json() == {"detail": MSG_FULL_DATE}
            assert "1996-03-14" not in rejected.text
        current = _call(client, "get", "/api/account/birthday", "token-a")
        assert current.json()["birthday"] is None


def test_bodies_over_4kb_are_413_before_parsing(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    application, database = _open(tmp_path, monkeypatch)
    _user(database, 1, "token-a", "csrf-a")
    with TestClient(application) as client:
        oversized = _call(
            client,
            "patch",
            "/api/account/birthday",
            "token-a",
            "csrf-a",
            content=b"[" * 4097,
            headers={"Content-Type": "application/json"},
        )
        assert oversized.status_code == 413
        assert oversized.content == b""
        declared = _call(
            client,
            "patch",
            "/api/account/birthday",
            "token-a",
            "csrf-a",
            content=b"{}",
            headers={"Content-Type": "application/json", "Content-Length": "4097"},
        )
        assert declared.status_code == 413
        huge = _call(
            client,
            "patch",
            "/api/account/birthday",
            "token-a",
            "csrf-a",
            content=b"{}",
            headers={"Content-Type": "application/json", "Content-Length": "9" * 4301},
        )
        assert huge.status_code == 413
        assert huge.content == b""
        core = b'{"birthday":null,"show_age":false}'
        exact = core + b" " * (4096 - len(core))

        def post(content: object, length: str | None = None) -> int:
            headers = {"Content-Type": "application/json"}
            if length is not None:
                headers["Content-Length"] = length
            args = (client, "patch", "/api/account/birthday", "token-a", "csrf-a")
            return _call(*args, content=content, headers=headers).status_code

        def one(payload: bytes):
            yield payload

        assert post(exact) == 200
        assert post(one(exact)) == 200
        assert post(exact + b" ") == 413
        assert post(one(exact + b" ")) == 413
        assert post(b"{}", "4096") == 422
        assert post(b"{}", "4097") == 413
        assert post(b"{}", "0000004096") == 422
        assert post(b"{}", "0000004097") == 413
        assert post(b"{}", "00000004096") == 413
        current = _call(client, "get", "/api/account/birthday", "token-a")
        assert current.json() == {"birthday": None, "show_age": False}


def test_non_ascii_digit_content_length_is_400() -> None:
    class Request:
        def __init__(self) -> None:
            self.headers = {"content-length": "²"}

        async def stream(self):
            raise AssertionError("body should not be read")

    response = asyncio.run(
        birthday_route.update_birthday(
            cast(birthday_route.Request, Request()),
            cast(Session, object()),
            cast(User, object()),
        )
    )
    assert isinstance(response, Response)
    assert response.status_code == 400
    assert response.body == b""


def test_read_body_rejects_a_4301_digit_length_before_int() -> None:
    class Request:
        def __init__(self) -> None:
            self.headers = {"content-length": "9" * 4301}

        async def stream(self):
            raise AssertionError("int() should fail closed before the body is read")

    assert asyncio.run(birthday_route._read_body(cast(birthday_route.Request, Request()))) is None


def test_missing_and_understated_content_length_over_4kb_are_413(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    application, database = _open(tmp_path, monkeypatch)
    _user(database, 1, "token-a", "csrf-a")

    def missing_length():
        yield b"a" * 4096
        yield b"b"

    def understated():
        yield b"c" * 4096
        yield b"d"

    with TestClient(application) as client:
        missing = _call(
            client,
            "patch",
            "/api/account/birthday",
            "token-a",
            "csrf-a",
            content=missing_length(),
            headers={"Content-Type": "application/json"},
        )
        assert missing.status_code == 413
        assert missing.content == b""
        short = _call(
            client,
            "patch",
            "/api/account/birthday",
            "token-a",
            "csrf-a",
            content=understated(),
            headers={"Content-Type": "application/json", "Content-Length": "1"},
        )
        assert short.status_code == 413
        assert short.content == b""
        current = _call(client, "get", "/api/account/birthday", "token-a")
        assert current.json() == {"birthday": None, "show_age": False}


def test_parser_rejects_nested_and_huge_numbers_as_422(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    caplog: pytest.LogCaptureFixture,
    capsys: pytest.CaptureFixture[str],
) -> None:
    _watch_logs(caplog)
    monkeypatch.setattr(birthday_route, "_MAX_BODY_BYTES", 2_000_000)
    application, database = _open(tmp_path, monkeypatch)
    _user(database, 1, "token-a", "csrf-a")
    digits = b"9" * 4301
    payloads = (
        b"[" * 100000,
        b'{"a":' * 50000,
        b'{"birthday":' + digits + b',"show_age":true}',
        b'{"birthday":"1996-03-14","show_age":' + digits + b"}",
    )
    with TestClient(application) as client:
        for content in payloads:
            rejected = _call(
                client,
                "patch",
                "/api/account/birthday",
                "token-a",
                "csrf-a",
                content=content,
                headers={"Content-Type": "application/json"},
            )
            assert rejected.status_code == 422
            assert rejected.json() == {"detail": MSG_FULL_DATE}
            assert digits.decode() not in rejected.text
            assert "1996-03-14" not in rejected.text
    logged = _captured_logs(caplog, capsys)
    assert "Traceback" not in logged
    assert digits.decode() not in logged
    assert SECRET not in logged


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


def test_client_error_frames_omit_birthday_input(monkeypatch: pytest.MonkeyPatch) -> None:
    secret = SECRET.encode()

    def check(body: bytes, today: date, detail: str, *frames: str) -> HTTPException:
        monkeypatch.setattr(birthday_route, "server_today", lambda: today)
        error = _client_error(body)
        assert error.detail == detail
        _assert_birthday_is_detached(error, SECRET, *frames)
        return error

    def frame_locals(error: HTTPException, name: str) -> dict[str, Any]:
        frame = error.__traceback__
        while frame is not None:
            if frame.tb_frame.f_code.co_name == name:
                return frame.tb_frame.f_locals
            frame = frame.tb_next
        raise AssertionError(name)

    past = date(1900, 1, 1)
    prefix = b'{"birthday":"' + secret
    for show_age in (json.dumps(SECRET), json.dumps({"n": SECRET}), "true"):
        body = prefix + b'","show_age":' + show_age.encode() + b"}"
        error = check(body, past, MSG_FUTURE, "_parse_body", "_parse_birthday")
        assert "show_age" not in frame_locals(error, "_parse_body")
    regex_error = check(prefix + b'x","show_age":true}', TODAY, MSG_FULL_DATE, "_parse_birthday")
    assert "value" not in frame_locals(regex_error, "_parse_birthday")
    missing = check(b'{"note":"' + secret + b'"}', TODAY, MSG_FULL_DATE, "_parse_body")
    assert frame_locals(missing, "_parse_body")["payload"] == {}
    assert frame_locals(missing, "update_birthday")["parsed"] == {}
    show_age_error = check(
        prefix + b'","show_age":"' + secret + b'"}', TODAY, MSG_SHOW_AGE, "_parse_body"
    )
    show_age_locals = frame_locals(show_age_error, "_parse_body")
    assert "birthday" not in show_age_locals
    assert "show_age" not in show_age_locals
    unknown_error = check(
        prefix + b'","show_age":true,"n":"' + secret + b'"}',
        TODAY,
        MSG_UNKNOWN,
        "_parse_body",
    )
    assert "birthday" not in frame_locals(unknown_error, "_parse_body")
    raw_error = check(prefix, TODAY, MSG_FULL_DATE, "update_birthday")
    assert frame_locals(raw_error, "update_birthday")["raw"] == b""


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
