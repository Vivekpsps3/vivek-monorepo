"""Reachable resident dialogue and nondecaying ranks.

One completion per resident and conversation identity. Rank is that count,
from 0 through 5, and nothing deletes a completion. Only welcome grants
2 Stamps, once, through the existing stamp ledger. The directory lists every
resident, including the one the ambient hour marks away.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any, cast

from pydantic import BaseModel, ConfigDict, ValidationError, field_validator
from sqlalchemy import select, text
from sqlalchemy.engine import CursorResult
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from apps.server.errors import APIError
from apps.server.town.models import DialogueCompletion, DialogueJournal
from apps.server.town.resident_catalog import (
    CONVERSATIONS,
    RESIDENTS,
    conversation_by_id,
    is_present,
    meeting_grant_key,
    resident_by_id,
)
from apps.server.town.stamps import grant_stamps

_CHECK = "Check the highlighted fields."


class _Write(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    resident_id: str
    conversation_id: str
    expected_revision: int

    @field_validator("expected_revision")
    @classmethod
    def _revision(cls, value: int) -> int:
        if value < 0 or value > 1_000_000:
            raise ValueError("expected_revision")
        return value


def _parse(payload: dict[str, Any]) -> _Write:
    try:
        return _Write.model_validate(payload)
    except ValidationError:
        raise APIError(422, "validation_error", _CHECK) from None


def _lock(db: Session) -> None:
    db.execute(text("UPDATE town_dialogue_journals SET revision = revision WHERE 0"))
    db.execute(text("UPDATE town_dialogue_completions SET resident_id = resident_id WHERE 0"))


def _revision(db: Session, user_id: int) -> int:
    found = db.scalar(select(DialogueJournal.revision).where(DialogueJournal.user_id == user_id))
    return 0 if found is None else int(found)


def _completed(db: Session, user_id: int) -> dict[str, set[str]]:
    rows = db.execute(
        select(DialogueCompletion.resident_id, DialogueCompletion.conversation_id).where(
            DialogueCompletion.user_id == user_id
        )
    ).all()
    found: dict[str, set[str]] = {}
    for resident_id, conversation_id in rows:
        found.setdefault(resident_id, set()).add(conversation_id)
    return found


def _conflict(current: int) -> APIError:
    return APIError(409, "dialogue_conflict", f"This directory was saved at revision {current}.")


def _directory(db: Session, user_id: int, hour: int) -> dict[str, Any]:
    if hour < 0 or hour > 23:
        raise APIError(422, "validation_error", _CHECK)
    completed = _completed(db, user_id)
    residents: list[dict[str, Any]] = []
    for index, resident in enumerate(RESIDENTS):
        done = completed.get(resident.id, set())
        conversations: list[dict[str, Any]] = []
        for conversation in CONVERSATIONS:
            conversations.append(
                {
                    "id": conversation.id,
                    "title": conversation.title,
                    "line": conversation.line,
                    "stamps": conversation.stamps,
                    "completed": conversation.id in done,
                }
            )
        residents.append(
            {
                "id": resident.id,
                "name": resident.name,
                "place": resident.place,
                "purpose": resident.purpose,
                "present": is_present(index, hour),
                "rank": len(done),
                "conversations": conversations,
            }
        )
    return {"revision": _revision(db, user_id), "hour": hour, "residents": residents}


def read_directory(db: Session, user_id: int, hour: int) -> dict[str, Any]:
    return _directory(db, user_id, hour)


def _raced(
    db: Session, user_id: int, resident_id: str, conversation_id: str, hour: int
) -> tuple[dict[str, Any], bool]:
    done = _completed(db, user_id).get(resident_id, set())
    if conversation_id in done:
        return _directory(db, user_id, hour), False
    raise _conflict(_revision(db, user_id))


def _insert(
    db: Session, user_id: int, resident_id: str, conversation_id: str, now: datetime
) -> None:
    db.add(
        DialogueCompletion(
            user_id=user_id,
            resident_id=resident_id,
            conversation_id=conversation_id,
            created_at=now,
        )
    )


def _grant_welcome(db: Session, user_id: int, resident_id: str, now: datetime) -> None:
    grant_stamps(
        db,
        user_id,
        {
            "grant_key": meeting_grant_key(resident_id),
            "amount": 2,
            "consumer": "quest",
        },
        now,
    )


def _write(
    db: Session,
    user_id: int,
    resident_id: str,
    conversation_id: str,
    expected: int,
    hour: int,
    now: datetime,
) -> tuple[dict[str, Any], bool]:
    # Welcome uses the stamp ledger before the completion row. A lost revision
    # rolls that grant back with the insert. A duplicate receipt stays one grant.
    if conversation_id == "welcome":
        _grant_welcome(db, user_id, resident_id, now)
    if expected != 0:
        result = cast(
            CursorResult[Any],
            db.execute(
                text(
                    "UPDATE town_dialogue_journals SET revision = revision + 1, "
                    "updated_at = :updated_at WHERE user_id = :user_id AND revision = :expected"
                ),
                {"updated_at": now, "user_id": user_id, "expected": expected},
            ),
        )
        if result.rowcount != 1:
            db.rollback()
            raise _conflict(_revision(db, user_id))
    else:
        db.add(DialogueJournal(user_id=user_id, revision=1, updated_at=now))
    _insert(db, user_id, resident_id, conversation_id, now)
    try:
        db.flush()
    except IntegrityError:
        db.rollback()
        return _raced(db, user_id, resident_id, conversation_id, hour)
    return _directory(db, user_id, hour), True


def complete_conversation(
    db: Session, user_id: int, payload: dict[str, Any], now: datetime, hour: int
) -> tuple[dict[str, Any], bool]:
    parsed = _parse(payload)
    resident = resident_by_id(parsed.resident_id)
    conversation = conversation_by_id(parsed.conversation_id)
    if resident is None or conversation is None:
        raise APIError(422, "validation_error", _CHECK)
    if hour < 0 or hour > 23:
        raise APIError(422, "validation_error", _CHECK)
    _lock(db)
    done = _completed(db, user_id).get(parsed.resident_id, set())
    if parsed.conversation_id in done:
        return _directory(db, user_id, hour), False
    current = _revision(db, user_id)
    if current != parsed.expected_revision:
        raise _conflict(current)
    return _write(
        db,
        user_id,
        parsed.resident_id,
        parsed.conversation_id,
        current,
        hour,
        now,
    )
