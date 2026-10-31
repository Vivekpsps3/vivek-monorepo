"""Mark the next aired episode and name the one that changed."""

from fastapi import HTTPException
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from apps.media.backend.models import Episode, EpisodeProgress, UserEntry, utc_now
from apps.media.backend.services import records
from apps.media.backend.services.clock import today
from apps.media.backend.services.validate import fail


def mark_next_checked(
    db: Session,
    user_id: int,
    entry: UserEntry,
    expected_episode_id: int | None,
) -> tuple[dict, dict]:
    if entry.catalog.kind != "tv":
        fail("Episode progress is for shows.")
    state = records.episode_state(db, user_id, entry.catalog)
    nxt = state["next_episode"]
    if nxt is None:
        raise HTTPException(status_code=409, detail="Add episodes, or you are already caught up.")
    if expected_episode_id is not None and expected_episode_id != nxt["id"]:
        raise HTTPException(
            status_code=409,
            detail="That episode is no longer next. Refresh to see your progress.",
        )
    episode = db.get(Episode, nxt["id"])
    if episode is None:
        records.fail_missing()
    conflict = HTTPException(
        status_code=409,
        detail="That episode is no longer next. Refresh to see your progress.",
    )
    watched_on = today()
    if not records.is_released(episode.air_date, watched_on):
        fail("This episode has not aired yet.")
    marks = db.query(EpisodeProgress).filter(
        EpisodeProgress.user_id == user_id, EpisodeProgress.episode_id == episode.id
    )
    failed = False
    try:
        if marks.first() is None:
            # uq_episode_progress arbitrates competing inserts, including a late winner.
            db.add(
                EpisodeProgress(
                    user_id=user_id, episode_id=episode.id, watched=True, watched_on=watched_on
                )
            )
            db.flush()
        elif (
            marks.filter(EpisodeProgress.watched.is_(False)).update(
                records.watched_values(True, watched_on)
            )
            != 1
        ):
            # A row found after the check may already belong to another successful request.
            db.rollback()
            raise conflict
    except IntegrityError:
        db.rollback()
        failed = True
    # Raised outside the handler so the driver error is not attached as __context__.
    if failed:
        raise conflict from None
    entry.updated_at = utc_now()
    db.flush()
    marked = {
        "episode_id": nxt["id"],
        "season_number": nxt["season_number"],
        "episode_number": nxt["episode_number"],
        "title": nxt["title"],
        "label": f"S{nxt['season_number']}E{nxt['episode_number']}",
    }
    return records.episode_state(db, user_id, entry.catalog), marked
