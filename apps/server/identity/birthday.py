"""Owner-only birthday for Life in Pixels.

The date is returned only by this route. It is not written to audit detail,
logs, ``/auth/me``, or admin payloads, and validation errors do not echo it.
"""

import json
import re
from contextlib import suppress
from datetime import UTC, date, datetime, timedelta
from typing import Annotated, NoReturn

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import Response
from pydantic import BaseModel, ConfigDict
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from apps.server.database import get_db
from apps.server.errors import APIError
from apps.server.identity.models import User
from apps.server.identity.session import audit_event, get_current_user, utc_now_naive

router = APIRouter(tags=["account"])

_FULL_ISO_DATE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
_EARLIEST = date(1900, 1, 1)
_FIELDS = frozenset({"birthday", "show_age"})

MSG_FULL_DATE = "Enter a full date."
MSG_YEAR = "Enter a year after 1900."
MSG_FUTURE = "Birthday can't be in the future."
MSG_SHOW_AGE = "Show age must be true or false."
MSG_UNKNOWN = "Unknown field."

_MAX_BODY_BYTES = 4096
_MAX_DECLARED_DIGITS = 10
_UTF8_BOM = b"\xef\xbb\xbf"


class BirthdayView(BaseModel):
    model_config = ConfigDict(extra="forbid")

    birthday: date | None
    show_age: bool


def server_today() -> date:
    """UTC calendar date. The route allows one extra day of timezone slack."""
    return datetime.now(UTC).date()


def _reject(detail: str) -> NoReturn:
    raise HTTPException(status_code=422, detail=detail) from None


def _view(user: User) -> BirthdayView:
    return BirthdayView(birthday=user.birthday, show_age=bool(user.pixels_show_age))


def _parse_birthday(value: object, today: date) -> date | None:
    if value is None:
        return None
    if not isinstance(value, str) or _FULL_ISO_DATE.fullmatch(value) is None:
        _reject(MSG_FULL_DATE)
    try:
        parsed = date.fromisoformat(value)
    except ValueError:
        parsed = None
    # Raised outside the handler so the parse error, which can carry the date,
    # is not attached as __context__.
    if parsed is None:
        _reject(MSG_FULL_DATE)
    if parsed < _EARLIEST:
        _reject(MSG_YEAR)
    if parsed > today + timedelta(days=1):
        _reject(MSG_FUTURE)
    return parsed


def _parse_body(payload: object, today: date) -> tuple[date | None, bool]:
    if not isinstance(payload, dict):
        _reject(MSG_FULL_DATE)
    if "birthday" not in payload:
        _reject(MSG_FULL_DATE)
    birthday = _parse_birthday(payload["birthday"], today)
    show_age = payload.get("show_age")
    if not isinstance(show_age, bool):
        _reject(MSG_SHOW_AGE)
    if set(payload) - _FIELDS:
        _reject(MSG_UNKNOWN)
    return birthday, show_age


def _commit(db: Session) -> None:
    failed = False
    try:
        db.commit()
    except SQLAlchemyError:
        failed = True
        with suppress(SQLAlchemyError):
            db.rollback()
    # Raised outside the handler so the driver error, which can carry the
    # birthday, is not attached as __context__.
    if failed:
        raise APIError(500, "internal", "Internal server error") from None


def _declared_body_status(declared: str) -> int | None:
    """400 for a non-ascii digit, 413 over the cap, else None.

    int() is not used for a non-ascii digit or for more than 10 digits.
    Past 4300 digits int() raises ValueError and the route would answer 500.
    """
    if any(not character.isascii() and character.isdigit() for character in declared):
        return 400
    if not declared.isascii() or not declared.isdigit():
        return None
    if len(declared) > _MAX_DECLARED_DIGITS:
        return 413
    if int(declared) > _MAX_BODY_BYTES:
        return 413
    return None


async def _read_body(request: Request) -> bytes | None:
    """At most 4 KB. None means the declared or actual size exceeded the cap."""
    if _declared_body_status(request.headers.get("content-length", "")) is not None:
        return None
    body = bytearray()
    async for chunk in request.stream():
        if len(body) + len(chunk) > _MAX_BODY_BYTES:
            return None
        body.extend(chunk)
    return bytes(body)


@router.get("/account/birthday", response_model=BirthdayView)
def read_birthday(
    current_user: Annotated[User, Depends(get_current_user)],
) -> BirthdayView:
    return _view(current_user)


@router.patch("/account/birthday", response_model=BirthdayView)
async def update_birthday(
    request: Request,
    db: Annotated[Session, Depends(get_db, scope="function")],
    current_user: Annotated[User, Depends(get_current_user)],
) -> BirthdayView | Response:
    # Parsed here, not by a body model, so the shared validation handler
    # cannot echo the submitted date in its default ``input`` field.
    blocked = _declared_body_status(request.headers.get("content-length", ""))
    if blocked is not None:
        return Response(status_code=blocked)
    raw = await _read_body(request)
    if raw is None:
        return Response(status_code=413)
    rejected = False
    birthday: date | None = None
    show_age = False
    try:
        if not raw:
            parsed: object = None
        elif raw.startswith(_UTF8_BOM):
            rejected = True
            parsed = None
        else:
            parsed = json.loads(raw.decode("utf-8"))
        if not rejected:
            birthday, show_age = _parse_body(parsed, server_today())
    except (ValueError, RecursionError):
        rejected = True
    if rejected:
        _reject(MSG_FULL_DATE)
    current_user.birthday = birthday
    current_user.pixels_show_age = show_age
    current_user.updated_at = utc_now_naive()
    audit_event(
        db,
        "account.birthday_changed",
        actor_user_id=current_user.id,
        target_user_id=current_user.id,
        detail=None,
    )
    _commit(db)
    db.refresh(current_user)
    return _view(current_user)
