"""Concept endpoints for the Lit Map (design section 4.3).

Local implementation: nothing is imported from apps/server/town (D11).
All endpoints are owner-scoped; an unknown or another owner's id is a 404,
never a 403. CSRF is enforced by the session layer behind
require_principal, as everywhere else in the app.

Interim error copy (WG-19) lives in the message constants below; the codes
are stable: concept_name_invalid, concept_name_taken, concept_date_invalid,
concept_invalid (with field_errors), concept_limit, invalid_tz (W2a's).
"""

from __future__ import annotations

import unicodedata
from datetime import date, datetime
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from apps.server.auth import Principal, require_principal
from apps.server.database import get_db
from apps.server.errors import APIError
from apps.server.path_ids import bounded_path_id
from apps.server.world.models import WorldConcept, make_concept_name_key
from apps.server.world.read import resolve_zone
from apps.server.world.routes import get_world_clock
from apps.server.world.schemas import Concept, ConceptCreate, ConceptPatch
from packages.time.today import today_in_zone

router = APIRouter(prefix="/world/concepts", tags=["world"])

NAME_LIMIT = 80
NOTE_LIMIT = 2000
SOURCE_LIMIT = 500
ROW_LIMIT = 500
EARLIEST_UNDERSTOOD = date(2000, 1, 1)

NAME_INVALID_MESSAGE = "Enter a name of 1 to 80 characters, without control characters."
NAME_TAKEN_MESSAGE = "You already have a concept with that name."
DATE_INVALID_MESSAGE = "That date isn't available for a concept."
LIMIT_MESSAGE = "Delete a concept to free a space. You can keep at most 500."
NOTE_INVALID_MESSAGE = "Notes can be at most 2,000 characters."
SOURCE_INVALID_MESSAGE = "Source must be a single line of at most 500 characters."

_concepts = WorldConcept.__table__


def _clean_name(raw: str) -> tuple[str, str]:
    """WG-18 interim: NFC, strip, 1-80 chars, no Cc/Cf characters."""
    name = unicodedata.normalize("NFC", raw).strip()
    if not 1 <= len(name) <= NAME_LIMIT or any(
        unicodedata.category(char) in ("Cc", "Cf") for char in name
    ):
        raise APIError(422, "concept_name_invalid", NAME_INVALID_MESSAGE)
    return name, make_concept_name_key(name)


def _clean_note(raw: str | None) -> str | None:
    if raw is None or not raw.strip():
        return None
    if len(raw) > NOTE_LIMIT:
        raise APIError(
            422,
            "concept_invalid",
            "That concept can't be saved.",
            field_errors={"note": NOTE_INVALID_MESSAGE},
        )
    return raw


def _clean_source(raw: str | None) -> str | None:
    if raw is None or not raw.strip():
        return None
    if len(raw) > SOURCE_LIMIT or "\n" in raw or "\r" in raw:
        raise APIError(
            422,
            "concept_invalid",
            "That concept can't be saved.",
            field_errors={"source": SOURCE_INVALID_MESSAGE},
        )
    return raw


def _check_understood(day: date | None, tz: str | None, now: datetime) -> None:
    if day is None:
        return
    zone = resolve_zone(tz)
    today = today_in_zone(zone, now=now)
    if not EARLIEST_UNDERSTOOD <= day <= today:
        raise APIError(422, "concept_date_invalid", DATE_INVALID_MESSAGE)


def _active_name_taken(
    db: Session, user_id: int, name_key: str, *, exclude_id: int | None = None
) -> bool:
    stmt = select(_concepts.c.id).where(
        _concepts.c.user_id == user_id,
        _concepts.c.name_key == name_key,
        _concepts.c.archived_at.is_(None),
    )
    if exclude_id is not None:
        stmt = stmt.where(_concepts.c.id != exclude_id)
    return db.execute(stmt.limit(1)).first() is not None


NOT_FOUND = "That concept doesn't exist."
ConceptId = Annotated[int, bounded_path_id(NOT_FOUND)]


def _owned(db: Session, user_id: int, concept_id: int) -> WorldConcept:
    concept = db.get(WorldConcept, concept_id)
    if concept is None or concept.user_id != user_id:
        # The T1F path-id contract: an invalid id and an unknown (or
        # another owner's) id return this same 404 body.
        raise HTTPException(status_code=404, detail=NOT_FOUND)
    return concept


def _payload(concept: WorldConcept) -> dict:
    return {
        "id": concept.id,
        "name": concept.name,
        "note": concept.note,
        "source": concept.source,
        "understood_on": concept.understood_on,
        "archived": concept.archived_at is not None,
        "created_at": concept.created_at,
        "updated_at": concept.updated_at,
    }


@router.get("", response_model=list[Concept])
def list_concepts(
    archived: int = Query(default=0),
    principal: Principal = Depends(require_principal),
    db: Session = Depends(get_db, scope="function"),
) -> list[dict]:
    rows = (
        db.execute(select(WorldConcept).where(WorldConcept.user_id == principal.id)).scalars().all()
    )
    visible = [row for row in rows if (row.archived_at is not None) == bool(archived)]
    not_yet = sorted(
        (row for row in visible if row.understood_on is None),
        key=lambda row: (row.created_at, row.id),
        reverse=True,
    )
    understood = sorted(
        (row for row in visible if row.understood_on is not None),
        key=lambda row: (row.understood_on, row.id),
        reverse=True,
    )
    return [_payload(row) for row in [*not_yet, *understood]]


@router.post("", response_model=Concept, status_code=201)
def create_concept(
    body: ConceptCreate,
    principal: Principal = Depends(require_principal),
    db: Session = Depends(get_db, scope="function"),
    now: datetime = Depends(get_world_clock),
) -> dict:
    name, name_key = _clean_name(body.name)
    note = _clean_note(body.note)
    source = _clean_source(body.source)
    _check_understood(body.understood_on, body.tz, now)
    total = db.execute(select(func.count()).where(_concepts.c.user_id == principal.id)).scalar_one()
    if total >= ROW_LIMIT:
        raise APIError(409, "concept_limit", LIMIT_MESSAGE)
    if _active_name_taken(db, principal.id, name_key):
        raise APIError(409, "concept_name_taken", NAME_TAKEN_MESSAGE)
    concept = WorldConcept(
        user_id=principal.id,
        name=name,
        name_key=name_key,
        note=note,
        source=source,
        understood_on=body.understood_on,
        archived_at=None,
        created_at=now,
        updated_at=now,
    )
    db.add(concept)
    db.flush()
    return _payload(concept)


@router.patch("/{concept_id}", response_model=Concept)
def patch_concept(
    concept_id: ConceptId,
    body: ConceptPatch,
    principal: Principal = Depends(require_principal),
    db: Session = Depends(get_db, scope="function"),
    now: datetime = Depends(get_world_clock),
) -> dict:
    concept = _owned(db, principal.id, concept_id)
    fields = body.model_fields_set
    if "tz" in fields:
        resolve_zone(body.tz)
    if "name" in fields and body.name is not None:
        name, name_key = _clean_name(body.name)
        concept.name = name
        concept.name_key = name_key
    if "note" in fields:
        concept.note = _clean_note(body.note)
    if "source" in fields:
        concept.source = _clean_source(body.source)
    if "understood_on" in fields:
        _check_understood(body.understood_on, body.tz, now)
        concept.understood_on = body.understood_on
    if "archived" in fields and body.archived is not None:
        concept.archived_at = now if body.archived else None
    # Unarchiving (or renaming) into an active name collision is a 409, and
    # the row must not be left half-updated: check before flushing.
    if concept.archived_at is None and _active_name_taken(
        db, principal.id, concept.name_key, exclude_id=concept.id
    ):
        db.rollback()
        raise APIError(409, "concept_name_taken", NAME_TAKEN_MESSAGE)
    concept.updated_at = now
    db.flush()
    return _payload(concept)


@router.delete("/{concept_id}", status_code=204)
def delete_concept(
    concept_id: ConceptId,
    principal: Principal = Depends(require_principal),
    db: Session = Depends(get_db, scope="function"),
) -> Response:
    concept = _owned(db, principal.id, concept_id)
    db.delete(concept)
    db.flush()
    return Response(status_code=204)
