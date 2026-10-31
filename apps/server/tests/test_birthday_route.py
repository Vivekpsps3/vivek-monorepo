"""Owner-only birthday route: validation, CSRF, privacy, and audit."""

import asyncio
import logging
import os
import re
import time
import traceback
from datetime import UTC, date, datetime, timedelta, tzinfo
from pathlib import Path
from typing import cast

import pytest
from fastapi import HTTPException
from fastapi.responses import Response
from fastapi.testclient import TestClient
from sqlalchemy import text
from sqlalchemy.exc import OperationalError, SQLAlchemyError
from sqlalchemy.orm import Session

from apps.server.database import open_database
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


def _assert_birthday_is_detached(error: BaseException, secret: str) -> None:
    """The client error must not chain, or retain, the value that caused it."""
    assert error.__context__ is None
    assert error.__cause__ is None
    assert secret not in repr(error.args)
    frame = error.__traceback__
    while frame is not None:
        for value in frame.tb_frame.f_locals.values():
            assert secret not in repr(value)
        frame = frame.tb_next


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


def test_debug_root_does_not_log_a_birthday_query(
    tmp_path: Path, caplog: pytest.LogCaptureFixture
) -> None:
    sqlalchemy_log = logging.getLogger("sqlalchemy")
    engine_log = logging.getLogger("sqlalchemy.engine")
    previous = (sqlalchemy_log.level, engine_log.level)
    sqlalchemy_log.setLevel(logging.DEBUG)
    engine_log.setLevel(logging.DEBUG)
    caplog.set_level(logging.DEBUG)
    try:
        _application, database = _app(tmp_path)
        assert engine_log.getEffectiveLevel() >= logging.WARNING
        assert database.engine.echo is False
        assert database.engine.hide_parameters is True
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
        assert SECRET not in caplog.text
        for record in caplog.records:
            assert SECRET not in record.getMessage()
    finally:
        sqlalchemy_log.setLevel(previous[0])
        engine_log.setLevel(previous[1])


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
