"""Atomic catch-up and compare-and-set undo. Air-date cutoff is the server's date."""

import json
from uuid import uuid4

from sqlalchemy import update
from sqlalchemy.orm import Session

from apps.media.backend.models import (
    Episode,
    EpisodeProgress,
    ProgressOperation,
    UserEntry,
    utc_now,
)
from apps.media.backend.services.clock import today
from apps.media.backend.services.validate import fail, season_number, watched_flag
from apps.server.errors import APIError


def _lock(db: Session, entry: UserEntry) -> None:
    # SQLite takes its write lock before reading progress, serializing competing commands.
    db.execute(update(UserEntry).where(UserEntry.id == entry.id).values(updated_at=utc_now()))


def catch_up(db: Session, entry: UserEntry, body: dict) -> dict:
    if entry.catalog.kind != "tv":
        fail("Episode progress is for shows.")
    specials = watched_flag(body.get("include_specials", False))
    season = season_number(body["season_number"]) if "season_number" in body else None
    _lock(db, entry)
    cutoff = today()
    episodes = db.query(Episode).filter(
        Episode.catalog_id == entry.catalog_id,
        Episode.air_date.is_not(None),
        Episode.air_date <= cutoff,
    )
    if not specials:
        episodes = episodes.filter(Episode.season_number > 0)
    if season is not None:
        episodes = episodes.filter(Episode.season_number == season)
    eligible = episodes.order_by(Episode.season_number, Episode.episode_number).all()
    marks = {
        row.episode_id: row
        for row in db.query(EpisodeProgress).filter(
            EpisodeProgress.user_id == entry.user_id,
            EpisodeProgress.episode_id.in_([episode.id for episode in eligible]),
        )
    }
    token = str(uuid4())
    changed = []
    for episode in eligible:
        mark = marks.get(episode.id)
        if mark is not None and mark.watched:
            continue
        if mark is None:
            mark = EpisodeProgress(user_id=entry.user_id, episode_id=episode.id)
            db.add(mark)
        mark.watched = True
        mark.watched_on = cutoff
        mark.operation_token = token
        changed.append(episode.id)
    if changed:
        db.add(
            ProgressOperation(
                token=token,
                user_id=entry.user_id,
                entry_id=entry.id,
                changed_ids=json.dumps(changed),
            )
        )
    db.flush()
    return {
        "operation_token": token if changed else None,
        "changed_ids": changed,
        "eligible_count": len(eligible),
        "cutoff": cutoff.isoformat(),
        "include_specials": specials,
    }


def undo(db: Session, entry: UserEntry, token: str) -> dict:
    _lock(db, entry)
    operation = db.get(ProgressOperation, token)
    if operation is None or operation.user_id != entry.user_id or operation.entry_id != entry.id:
        raise APIError(404, "not_found", "That progress action was not found.")
    if operation.undone:
        return {"undone_ids": [], "conflict_ids": [], "already_undone": True}
    changed = json.loads(operation.changed_ids)
    marks = (
        db.query(EpisodeProgress)
        .filter(
            EpisodeProgress.user_id == entry.user_id,
            EpisodeProgress.episode_id.in_(changed),
            EpisodeProgress.operation_token == token,
            EpisodeProgress.watched.is_(True),
        )
        .all()
    )
    undone = []
    for mark in marks:
        mark.watched = False
        mark.watched_on = None
        mark.operation_token = None
        undone.append(mark.episode_id)
    operation.undone = True
    db.flush()
    return {
        "undone_ids": undone,
        "conflict_ids": sorted(set(changed) - set(undone)),
        "already_undone": False,
    }
