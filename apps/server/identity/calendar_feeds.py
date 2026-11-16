"""Owner-only capability lifecycle. Raw capabilities are returned once, never saved."""

import hashlib
import logging
import re
import secrets
import traceback
from typing import Annotated, Literal
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, ConfigDict, Field, field_validator
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from apps.server.auth import Principal, require_principal
from apps.server.database import get_db
from apps.server.identity.challenge_auth import configured_challenge_origins
from apps.server.identity.models import CalendarFeed
from apps.server.path_ids import bounded_path_id
from apps.server.rate_limit import enforce_calendar_feed_limit

router = APIRouter(prefix="/api/account/calendar-feeds", tags=["calendar feeds"])
FeedId = Annotated[int, bounded_path_id("Calendar subscription not found")]


def _redact(value: str) -> str:
    return re.sub(r"(?i)([?&]token=)[^&\s\"'<>]*", r"\1[redacted]", value)


class CapabilityLogFilter(logging.Filter):
    def filter(self, record: logging.LogRecord) -> bool:
        # Cover URL-encoded query values and traceback exception messages too.
        message = record.getMessage()
        redacted = _redact(message)
        if redacted != message:
            record.msg, record.args = redacted, ()
        if record.exc_info:
            rendered = "".join(traceback.format_exception(*record.exc_info))
            redacted_trace = _redact(rendered)
            if redacted_trace != rendered:
                record.exc_text = redacted_trace
                record.exc_info = None
        elif record.exc_text:
            record.exc_text = _redact(record.exc_text)
        return True


def redact_capability_logs() -> None:
    loggers = [
        logging.getLogger(),
        *[
            item
            for item in logging.Logger.manager.loggerDict.values()
            if isinstance(item, logging.Logger)
        ],
    ]
    for logger in loggers:
        for handler in logger.handlers:
            if not any(isinstance(item, CapabilityLogFilter) for item in handler.filters):
                handler.addFilter(CapabilityLogFilter())


class FeedIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    scope: Literal["travel", "media"]
    timezone: str = Field(min_length=1, max_length=100)

    @field_validator("timezone")
    @classmethod
    def valid_zone(cls, value: str) -> str:
        try:
            ZoneInfo(value)
        except (ZoneInfoNotFoundError, ValueError, OSError):
            raise ValueError("Use a valid IANA timezone.") from None
        return value


def token_hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def public_feed(row: CalendarFeed) -> dict:
    return {"id": row.id, "scope": row.scope, "timezone": row.timezone}


def secure_origin(request: Request) -> str:
    origin = str(request.base_url).rstrip("/")
    if request.url.scheme != "https" or origin not in configured_challenge_origins():
        raise HTTPException(
            status_code=422, detail="Calendar subscriptions require a configured HTTPS origin."
        )
    return origin


def revealed(row: CalendarFeed, origin: str, token: str) -> dict:
    return {**public_feed(row), "url": f"{origin}/calendar/feed.ics?token={token}"}


@router.get("")
def list_feeds(
    principal: Principal = Depends(require_principal),
    db: Session = Depends(get_db, scope="function"),
):
    return [
        public_feed(row)
        for row in db.query(CalendarFeed)
        .filter(CalendarFeed.user_id == principal.id)
        .order_by(CalendarFeed.id)
    ]


@router.post("", status_code=201)
def create_feed(
    body: FeedIn,
    request: Request,
    principal: Principal = Depends(require_principal),
    db: Session = Depends(get_db, scope="function"),
):
    origin = secure_origin(request)
    enforce_calendar_feed_limit(request, f"owner:{principal.id}")
    token = secrets.token_urlsafe(32)
    row = CalendarFeed(
        user_id=principal.id, scope=body.scope, timezone=body.timezone, token_hash=token_hash(token)
    )
    db.add(row)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=409,
            detail="That calendar subscription already exists. Rotate its URL instead.",
        ) from None
    return revealed(row, origin, token)


@router.post("/{feed_id}/rotate")
def rotate_feed(
    feed_id: FeedId,
    request: Request,
    principal: Principal = Depends(require_principal),
    db: Session = Depends(get_db, scope="function"),
):
    row = (
        db.query(CalendarFeed)
        .filter(CalendarFeed.id == feed_id, CalendarFeed.user_id == principal.id)
        .first()
    )
    if row is None:
        raise HTTPException(status_code=404, detail="Calendar subscription not found")
    origin = secure_origin(request)
    enforce_calendar_feed_limit(request, f"owner:{principal.id}")
    token = secrets.token_urlsafe(32)
    changed = (
        db.query(CalendarFeed)
        .filter(
            CalendarFeed.id == row.id,
            CalendarFeed.user_id == principal.id,
            CalendarFeed.token_hash == row.token_hash,
        )
        .update({CalendarFeed.token_hash: token_hash(token)}, synchronize_session=False)
    )
    if changed != 1:
        db.rollback()
        raise HTTPException(
            status_code=409, detail="Calendar subscription changed. Reload and try again."
        )
    db.commit()
    return revealed(row, origin, token)


@router.delete("/{feed_id}", status_code=204)
def revoke_feed(
    feed_id: FeedId,
    principal: Principal = Depends(require_principal),
    db: Session = Depends(get_db, scope="function"),
):
    result = (
        db.query(CalendarFeed)
        .filter(CalendarFeed.id == feed_id, CalendarFeed.user_id == principal.id)
        .delete(synchronize_session=False)
    )
    if result != 1:
        raise HTTPException(status_code=404, detail="Calendar subscription not found")
    db.commit()
