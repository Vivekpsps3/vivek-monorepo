"""Birthday route coverage for the finance gate.

That gate runs this directory and also measures apps/server/identity.
"""

from sqlalchemy.exc import OperationalError
from sqlalchemy.orm import Session

from apps.finance.backend.main import app
from apps.finance.backend.tests.conftest import authenticated_client
from apps.server.identity.birthday import (
    MSG_FULL_DATE,
    MSG_FUTURE,
    MSG_SHOW_AGE,
    MSG_UNKNOWN,
    MSG_YEAR,
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

    malformed = (
        b"",
        b"{",
        b"null",
        b"[]",
        b"\xff",
        b'{"birthday":"1919-08-26"\xff}',
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

    def locked(self: Session) -> None:
        raise OperationalError(
            "UPDATE users SET birthday=?",
            {"birthday": _DATE},
            Exception("database is locked"),
        )

    monkeypatch.setattr(Session, "commit", locked)
    failed = client.patch(
        "/api/account/birthday",
        json={"birthday": _DATE, "show_age": True},
    )
    assert failed.status_code == 500
    assert failed.json()["code"] == "internal"
    assert failed.json()["message"] == "Internal server error"
    assert _DATE not in failed.text
