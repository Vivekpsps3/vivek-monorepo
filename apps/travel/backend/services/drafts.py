"""Incomplete trip drafts.

A confirmed field is written only from the request's own field. An arrival
time, an airport, and a proposal never become the return date, a stay, or a
PTO charge.
"""

from datetime import UTC, datetime

from sqlalchemy.orm import Session, selectinload

from apps.travel.backend.models import TripDraft, TripDraftLeg, TripDraftProposal
from apps.travel.backend.services.assemble import transport_out
from apps.travel.backend.services.records import apply_transport


class DraftConflict(Exception):
    """The caller's revision is no longer the saved draft."""


def load_draft(db: Session, draft_id: int, user_id: int) -> TripDraft | None:
    return (
        db.query(TripDraft)
        .populate_existing()
        .filter(TripDraft.id == draft_id, TripDraft.user_id == user_id)
        .options(selectinload(TripDraft.legs), selectinload(TripDraft.proposals))
        .one_or_none()
    )


def find_attempt(db: Session, user_id: int, key: str | None) -> TripDraft | None:
    if not key:
        return None
    found = (
        db.query(TripDraft)
        .filter(TripDraft.user_id == user_id, TripDraft.client_request_id == key)
        .one_or_none()
    )
    if found is None:
        return None
    return load_draft(db, found.id, user_id)


def draft_out(draft: TripDraft) -> dict:
    return {
        "id": draft.id,
        "lifecycle": draft.lifecycle,
        "title": draft.title,
        "start_date": draft.start_date,
        "end_date": draft.end_date,
        "destination_label": draft.destination_label,
        "origin_label": draft.origin_label,
        "notes": draft.notes,
        "revision": draft.revision,
        "legs": [transport_out(leg) for leg in draft.legs],
        "proposals": [
            {"field": row.field, "value": row.value, "source": row.source}
            for row in draft.proposals
        ],
    }


def _assign_confirmed(draft: TripDraft, body) -> None:
    """Copy confirmed fields only. Proposals and leg times are not consulted."""

    draft.title = body.title
    draft.start_date = body.start_date
    draft.end_date = body.end_date
    draft.destination_label = body.destination_label
    draft.origin_label = body.origin_label
    draft.notes = body.notes
    draft.lifecycle = "draft"


def _replace_children(db: Session, draft: TripDraft, body) -> None:
    for existing_proposal in list(draft.proposals):
        db.delete(existing_proposal)
    for existing_leg in list(draft.legs):
        db.delete(existing_leg)
    db.flush()
    for index, leg in enumerate(body.legs):
        stored = TripDraftLeg(draft_id=draft.id, sort_order=index)
        apply_transport(stored, leg)
        db.add(stored)
    for proposal in body.proposals:
        db.add(
            TripDraftProposal(
                draft_id=draft.id,
                field=proposal.field,
                value=proposal.value,
                source=proposal.source,
            )
        )


def create_draft(db: Session, user_id: int, body) -> TripDraft:
    draft = TripDraft(
        user_id=user_id,
        client_request_id=body.client_request_id,
        revision=1,
    )
    _assign_confirmed(draft, body)
    db.add(draft)
    db.flush()
    _replace_children(db, draft, body)
    db.flush()
    loaded = load_draft(db, draft.id, user_id)
    if loaded is None:
        raise RuntimeError("The draft disappeared during save.")
    return loaded


def replace_draft(db: Session, draft: TripDraft, body) -> TripDraft:
    if body.revision != draft.revision:
        raise DraftConflict
    _assign_confirmed(draft, body)
    draft.revision += 1
    draft.updated_at = datetime.now(UTC)
    _replace_children(db, draft, body)
    db.flush()
    loaded = load_draft(db, draft.id, draft.user_id)
    if loaded is None:
        raise RuntimeError("The draft disappeared during save.")
    return loaded
