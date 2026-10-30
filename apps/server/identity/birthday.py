"""Owner-only birthday for Life in Pixels.

The date is returned only by this route. It is not written to audit detail,
logs, ``/auth/me``, or admin payloads, and validation errors do not echo it.
"""

import json
import re
from datetime import UTC, date, datetime, timedelta
from typing import Annotated, NoReturn

from fastapi import APIRouter, Depends, HTTPException, Request
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


class BirthdayView(BaseModel):
    model_config = ConfigDict(extra="forbid")

    birthday: date | None
    show_age: bool


def server_today() -> date:
    """UTC calendar date. The route allows one extra day of timezone slack."""
    return datetime.now(UTC).date()


def _reject(detail: str) -> NoReturn:
    raise HTTPException(status_code=422, detail=detail)


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
) -> BirthdayView:
    # Parsed here, not by a body model, so the shared validation handler
    # cannot echo the submitted date in its default ``input`` field.
    raw = await request.body()
    try:
        parsed: object = json.loads(raw) if raw else None
    except (json.JSONDecodeError, UnicodeDecodeError):
        _reject(MSG_FULL_DATE)
    birthday, show_age = _parse_body(parsed, server_today())
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
    try:
        db.commit()
    except SQLAlchemyError:
        # The driver error string includes the UPDATE parameters. Drop that
        # chain so the shared handler cannot write the birthday to the log.
        db.rollback()
        raise APIError(500, "internal", "Internal server error") from None
    db.refresh(current_user)
    return _view(current_user)
