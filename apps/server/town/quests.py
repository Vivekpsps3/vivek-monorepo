"""Optional chapter journal. One recorded game action per step.

A repeat of the stored action returns the current journal and does not bump
the revision. This module does not grant Stamps, Town XP, or life records.
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
from apps.server.town.models import QuestJournal, QuestStep
from apps.server.town.quest_catalog import QUESTS, quest_by_id, step_by_id

_CHECK = "Check the highlighted fields."
_ACTION = "That step already records a different action."
_ORDER = "Record the next step of this quest."


class _Write(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    quest_id: str
    step_id: str
    action_id: str
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
    # A zero-row update takes SQLite's reserved lock before the journal read.
    db.execute(text("UPDATE town_quest_journals SET revision = revision WHERE 0"))
    db.execute(text("UPDATE town_quest_steps SET action_id = action_id WHERE 0"))


def _revision(db: Session, user_id: int) -> int:
    found = db.scalar(select(QuestJournal.revision).where(QuestJournal.user_id == user_id))
    return 0 if found is None else int(found)


def _recorded(db: Session, user_id: int) -> dict[tuple[str, str], str]:
    rows = db.execute(
        select(QuestStep.quest_id, QuestStep.step_id, QuestStep.action_id).where(
            QuestStep.user_id == user_id
        )
    ).all()
    return {(quest_id, step_id): action_id for quest_id, step_id, action_id in rows}


def _conflict(current: int) -> APIError:
    return APIError(409, "quest_conflict", f"This journal was saved at revision {current}.")


def _journal(db: Session, user_id: int) -> dict[str, Any]:
    revision = _revision(db, user_id)
    recorded = _recorded(db, user_id)
    quests: list[dict[str, Any]] = []
    for quest in QUESTS:
        steps: list[dict[str, Any]] = []
        completed = 0
        prefix = True
        for step in quest.steps:
            action = recorded.get((quest.id, step.id))
            if prefix and action is not None:
                completed += 1
            else:
                prefix = False
            steps.append(
                {
                    "id": step.id,
                    "label": step.label,
                    "action_id": step.action_id,
                    "source": step.source,
                    "sample_action_id": step.sample_action_id,
                    "sample_label": step.sample_label,
                    "sample_detail": step.sample_detail,
                    "recorded_action": action,
                }
            )
        quests.append(
            {
                "id": quest.id,
                "title": quest.title,
                "detail": quest.detail,
                "completed": completed,
                "total": len(quest.steps),
                "steps": steps,
            }
        )
    return {"revision": revision, "quests": quests}


def read_journal(db: Session, user_id: int) -> dict[str, Any]:
    return _journal(db, user_id)


def _raced(
    db: Session, user_id: int, quest_id: str, step_id: str, action_id: str
) -> tuple[dict[str, Any], bool]:
    stored = _recorded(db, user_id).get((quest_id, step_id))
    if stored == action_id:
        return _journal(db, user_id), False
    if stored is not None:
        raise APIError(409, "quest_action", _ACTION)
    raise _conflict(_revision(db, user_id))


def _insert(
    db: Session, user_id: int, quest_id: str, step_id: str, action_id: str, now: datetime
) -> None:
    db.add(
        QuestStep(
            user_id=user_id,
            quest_id=quest_id,
            step_id=step_id,
            action_id=action_id,
            created_at=now,
        )
    )


def _write(
    db: Session,
    user_id: int,
    quest_id: str,
    step_id: str,
    action_id: str,
    expected: int,
    now: datetime,
) -> tuple[dict[str, Any], bool]:
    if expected == 0:
        db.add(QuestJournal(user_id=user_id, revision=1, updated_at=now))
        _insert(db, user_id, quest_id, step_id, action_id, now)
        try:
            db.flush()
        except IntegrityError:
            db.rollback()
            return _raced(db, user_id, quest_id, step_id, action_id)
        return _journal(db, user_id), True
    result = cast(
        CursorResult[Any],
        db.execute(
            text(
                "UPDATE town_quest_journals SET revision = revision + 1, updated_at = :updated_at "
                "WHERE user_id = :user_id AND revision = :expected"
            ),
            {"updated_at": now, "user_id": user_id, "expected": expected},
        ),
    )
    if result.rowcount != 1:
        raise _conflict(_revision(db, user_id))
    _insert(db, user_id, quest_id, step_id, action_id, now)
    try:
        db.flush()
    except IntegrityError:
        db.rollback()
        return _raced(db, user_id, quest_id, step_id, action_id)
    return _journal(db, user_id), True


def record_step(
    db: Session, user_id: int, payload: dict[str, Any], now: datetime
) -> tuple[dict[str, Any], bool]:
    parsed = _parse(payload)
    quest = quest_by_id(parsed.quest_id)
    step = step_by_id(quest, parsed.step_id) if quest is not None else None
    if quest is None or step is None or parsed.action_id not in step.actions():
        raise APIError(422, "validation_error", _CHECK)
    _lock(db)
    recorded = _recorded(db, user_id)
    stored = recorded.get((quest.id, step.id))
    if stored is not None:
        if stored == parsed.action_id:
            return _journal(db, user_id), False
        raise APIError(409, "quest_action", _ACTION)
    for earlier in quest.steps:
        if earlier.id == step.id:
            break
        if (quest.id, earlier.id) not in recorded:
            raise APIError(409, "quest_step", _ORDER)
    current = _revision(db, user_id)
    if current != parsed.expected_revision:
        raise _conflict(current)
    return _write(db, user_id, quest.id, step.id, parsed.action_id, current, now)
