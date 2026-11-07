"""Birthday route coverage for the finance gate.

That gate runs this directory and also measures apps/server/identity.
"""

import asyncio
from typing import cast

from fastapi import Request
from sqlalchemy.exc import OperationalError
from sqlalchemy.orm import Session

from apps.finance.backend.main import app
from apps.finance.backend.tests.conftest import authenticated_client
from apps.server.identity import birthday as birthday_route
from apps.server.identity.birthday import (
    MSG_FULL_DATE,
    MSG_FUTURE,
    MSG_SHOW_AGE,
    MSG_UNKNOWN,
    MSG_YEAR,
    _read_body,
)

_DATE = "1919-08-26"


def test_finance_suite_covers_the_birthday_route(monkeypatch) -> None:
    client = authenticated_client(app, email="birthday-owner@example.com")
    initial = client.get("/api/account/birthday")
    assert initial.status_code == 200
    assert initial.json() == {"birthday": None, "show_age": False}

    saved = client.patch(
        "/api/account/birthday",
        json={"birthday": "1996-03-14", "show_age": True},
    )
    assert saved.status_code == 200
    assert saved.json() == {"birthday": "1996-03-14", "show_age": True}
    cleared = client.patch(
        "/api/account/birthday",
        json={"birthday": None, "show_age": False},
    )
    assert cleared.status_code == 200
    assert cleared.json() == {"birthday": None, "show_age": False}

    rejected_bodies = [
        ({"birthday": "03-14-1996", "show_age": True}, MSG_FULL_DATE),
        ({"birthday": 19960314, "show_age": True}, MSG_FULL_DATE),
        ({"birthday": "1900-02-29", "show_age": True}, MSG_FULL_DATE),
        ({"birthday": "1899-12-31", "show_age": False}, MSG_YEAR),
        ({"birthday": "2999-01-01", "show_age": False}, MSG_FUTURE),
        ({"birthday": "1996-03-14", "show_age": "true"}, MSG_SHOW_AGE),
        ({"show_age": True}, MSG_FULL_DATE),
        ({"birthday": "1996-03-14", "show_age": True, "note": "x"}, MSG_UNKNOWN),
    ]
    for body, detail in rejected_bodies:
        rejected = client.patch("/api/account/birthday", json=body)
        assert rejected.status_code == 422
        assert rejected.json() == {"detail": detail}

    valid = b'{"birthday":"1996-03-14","show_age":true}'
    malformed = (
        b"",
        b"{",
        b"null",
        b"[]",
        b'"birthday"',
        b"true",
        b"1",
        b"\xff",
        b'{"birthday":"1919-08-26"\xff}',
        b"\xef\xbb\xbf" + valid,
        valid.decode().encode("utf-16"),
        valid.decode().encode("utf-32"),
    )
    for content in malformed:
        rejected = client.patch(
            "/api/account/birthday",
            content=content,
            headers={"Content-Type": "application/json"},
        )
        assert rejected.status_code == 422
        assert rejected.json() == {"detail": MSG_FULL_DATE}
        assert _DATE not in rejected.text

    oversized = client.patch(
        "/api/account/birthday",
        content=b"x" * 4097,
        headers={"Content-Type": "application/json"},
    )
    assert oversized.status_code == 413
    assert oversized.content == b""

    class Declared:
        def __init__(self) -> None:
            self.headers = {"content-length": "4097"}

        async def stream(self):
            yield b"{}"
            raise AssertionError("cap returned after the header")

    class Streamed:
        def __init__(self) -> None:
            self.headers: dict[str, str] = {}

        async def stream(self):
            yield b"a" * 4000
            yield b"b" * 200

    assert asyncio.run(_read_body(cast(Request, Declared()))) is None
    assert asyncio.run(_read_body(cast(Request, Streamed()))) is None

    monkeypatch.setattr(birthday_route, "_MAX_BODY_BYTES", 2_000_000)
    digits = b"9" * 4301
    for content in (
        b"[" * 100000,
        b'{"a":' * 50000,
        b'{"birthday":' + digits + b',"show_age":true}',
        b'{"birthday":"1996-03-14","show_age":' + digits + b"}",
    ):
        rejected = client.patch(
            "/api/account/birthday",
            content=content,
            headers={"Content-Type": "application/json"},
        )
        assert rejected.status_code == 422
        assert rejected.json() == {"detail": MSG_FULL_DATE}
        assert digits.decode() not in rejected.text

    calls = {"n": 0}
    original = Session.rollback

    def locked(self: Session) -> None:
        raise OperationalError(
            "UPDATE users SET birthday=?",
            {"birthday": _DATE},
            Exception("database is locked"),
        )

    def rollback(self: Session) -> None:
        calls["n"] += 1
        if calls["n"] == 1:
            raise OperationalError(
                "ROLLBACK birthday",
                {"birthday": _DATE},
                Exception(f"rollback failed: {_DATE}"),
            )
        original(self)

    monkeypatch.setattr(Session, "commit", locked)
    monkeypatch.setattr(Session, "rollback", rollback)
    failed = client.patch(
        "/api/account/birthday",
        json={"birthday": _DATE, "show_age": True},
    )
    assert failed.status_code == 500
    assert failed.json()["code"] == "internal"
    assert failed.json()["message"] == "Internal server error"
    assert _DATE not in failed.text
