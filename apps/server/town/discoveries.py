"""Discoverable Town objects. One journal stamp per hotspot, no currency.

A repeat of a found hotspot returns the current journal and does not add a
row. A different hotspot with a stale revision is not applied. These writes
do not touch trips, library rows, habits, stamps, or health records.
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
from apps.server.town.discovery_catalog import DISCOVERIES, discovery_by_id
from apps.server.town.models import DiscoveryJournal, DiscoveryStamp

_CHECK = "Check the highlighted fields."


class _Write(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    discovery_id: str
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
    db.execute(text("UPDATE town_discovery_journals SET revision = revision WHERE 0"))
    db.execute(text("UPDATE town_discovery_stamps SET discovery_id = discovery_id WHERE 0"))


def _revision(db: Session, user_id: int) -> int:
    found = db.scalar(select(DiscoveryJournal.revision).where(DiscoveryJournal.user_id == user_id))
    return 0 if found is None else int(found)


def _found(db: Session, user_id: int) -> set[str]:
    rows = db.scalars(
        select(DiscoveryStamp.discovery_id).where(DiscoveryStamp.user_id == user_id)
    ).all()
    return set(rows)


def _conflict(current: int) -> APIError:
    return APIError(409, "discovery_conflict", f"This journal was saved at revision {current}.")


def _journal(db: Session, user_id: int) -> dict[str, Any]:
    found = _found(db, user_id)
    discoveries: list[dict[str, Any]] = []
    for item in DISCOVERIES:
        discoveries.append(
            {
                "id": item.id,
                "name": item.name,
                "district": item.district,
                "hint": item.hint,
                "reaction": item.reaction,
                "found": item.id in found,
            }
        )
    return {"revision": _revision(db, user_id), "discoveries": discoveries}


def read_journal(db: Session, user_id: int) -> dict[str, Any]:
    return _journal(db, user_id)


def _raced(db: Session, user_id: int, discovery_id: str) -> tuple[dict[str, Any], bool]:
    if discovery_id in _found(db, user_id):
        return _journal(db, user_id), False
    raise _conflict(_revision(db, user_id))


def _write(
    db: Session, user_id: int, discovery_id: str, expected: int, now: datetime
) -> tuple[dict[str, Any], bool]:
    if expected != 0:
        result = cast(
            CursorResult[Any],
            db.execute(
                text(
                    "UPDATE town_discovery_journals SET revision = revision + 1, "
                    "updated_at = :updated_at WHERE user_id = :user_id AND revision = :expected"
                ),
                {"updated_at": now, "user_id": user_id, "expected": expected},
            ),
        )
        if result.rowcount != 1:
            db.rollback()
            raise _conflict(_revision(db, user_id))
    else:
        db.add(DiscoveryJournal(user_id=user_id, revision=1, updated_at=now))
    db.add(
        DiscoveryStamp(
            user_id=user_id,
            discovery_id=discovery_id,
            created_at=now,
        )
    )
    try:
        db.flush()
    except IntegrityError:
        db.rollback()
        return _raced(db, user_id, discovery_id)
    return _journal(db, user_id), True


def record_discovery(
    db: Session, user_id: int, payload: dict[str, Any], now: datetime
) -> tuple[dict[str, Any], bool]:
    parsed = _parse(payload)
    if discovery_by_id(parsed.discovery_id) is None:
        raise APIError(422, "validation_error", _CHECK)
    _lock(db)
    if parsed.discovery_id in _found(db, user_id):
        return _journal(db, user_id), False
    current = _revision(db, user_id)
    if current != parsed.expected_revision:
        raise _conflict(current)
    return _write(db, user_id, parsed.discovery_id, current, now)
