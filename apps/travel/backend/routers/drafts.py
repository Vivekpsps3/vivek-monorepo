"""Draft trips. A proposal is not a saved fact, and a draft charges no PTO."""

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, selectinload

from apps.server.auth import Principal, require_principal
from apps.server.path_ids import bounded_path_id
from apps.travel.backend.database import get_db
from apps.travel.backend.models import TripDraft
from apps.travel.backend.schemas import TripDraftPatch, TripDraftWrite
from apps.travel.backend.services.drafts import (
    DraftConflict,
    create_draft,
    draft_out,
    find_attempt,
    load_draft,
    replace_draft,
)

router = APIRouter()
_MISSING = "That draft is not here."
_STALE = "This draft changed. Your unsaved typing is still only on this screen."


def _missing() -> HTTPException:
    return HTTPException(status_code=404, detail=_MISSING)


@router.get("/trip-drafts")
def list_drafts(
    db: Session = Depends(get_db, scope="function"),
    principal: Principal = Depends(require_principal),
):
    rows = (
        db.query(TripDraft)
        .filter(TripDraft.user_id == principal.id)
        .options(selectinload(TripDraft.legs), selectinload(TripDraft.proposals))
        .order_by(TripDraft.id)
        .all()
    )
    return {"drafts": [draft_out(row) for row in rows]}


@router.post("/trip-drafts", status_code=201)
def save_draft(
    body: TripDraftWrite,
    db: Session = Depends(get_db, scope="function"),
    principal: Principal = Depends(require_principal),
):
    previous = find_attempt(db, principal.id, body.client_request_id)
    if previous is not None:
        return draft_out(previous)
    try:
        draft = create_draft(db, principal.id, body)
    except IntegrityError:
        db.rollback()
        previous = find_attempt(db, principal.id, body.client_request_id)
        if previous is None:
            raise
        return draft_out(previous)
    return draft_out(draft)


@router.get("/trip-drafts/{draft_id}")
def read_draft(
    draft_id: Annotated[int, bounded_path_id("That draft is not here.")],
    db: Session = Depends(get_db, scope="function"),
    principal: Principal = Depends(require_principal),
):
    draft = load_draft(db, draft_id, principal.id)
    if draft is None:
        raise _missing()
    return draft_out(draft)


@router.patch("/trip-drafts/{draft_id}")
def update_draft(
    draft_id: Annotated[int, bounded_path_id("That draft is not here.")],
    body: TripDraftPatch,
    db: Session = Depends(get_db, scope="function"),
    principal: Principal = Depends(require_principal),
):
    draft = load_draft(db, draft_id, principal.id)
    if draft is None:
        raise _missing()
    try:
        saved = replace_draft(db, draft, body)
    except DraftConflict:
        raise HTTPException(status_code=409, detail=_STALE) from None
    return draft_out(saved)
