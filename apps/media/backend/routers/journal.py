import httpx
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from database import get_db
from deps import require_actor
from models import Episode, Experience
from services import providers, records
from services.calendar import build_calendar
from services import providers
from services.providers import UA
from services.summary import build_summary
from services.validate import clean_text

router = APIRouter()


@router.get("/summary")
def summary(db: Session = Depends(get_db)):
    return build_summary(db, require_actor().id)


@router.get("/calendar")
def calendar(month: str | None = None, db: Session = Depends(get_db)):
    user_id = require_actor().id
    http = httpx.Client(
        timeout=8.0,
        headers={"User-Agent": UA, "Accept": "application/sparql-results+json, application/json"},
    )
    try:
        return build_calendar(db, user_id, month, http)
    finally:
        http.close()


@router.get("/library")
def library(
    kind: str | None = None,
    status: str | None = None,
    q: str | None = None,
    sort: str = "activity",
    db: Session = Depends(get_db),
):
    if sort not in {"added", "rating", "activity", "release"}:
        raise HTTPException(status_code=422, detail="Sort is not recognized.")
    rows = records.list_library(db, require_actor().id, kind, status, q, sort)
    return {"items": [records.entry_card(row) for row in rows]}


@router.post("/library")
def create_manual(body: dict, db: Session = Depends(get_db)):
    entry = records.create_manual(db, require_actor().id, body)
    return records.detail(db, entry)


@router.post("/library/from-provider")
def create_from_provider(body: dict, db: Session = Depends(get_db)):
    entry, already = records.create_from_provider(db, require_actor().id, body)
    _load_artist_catalog(db, entry)
    payload = records.detail(db, entry)
    payload["already_saved"] = already
    return payload


@router.get("/entries/{entry_id}")
def read_entry(entry_id: int, db: Session = Depends(get_db)):
    entry = records.owned_entry(db, require_actor().id, entry_id)
    _load_artist_catalog(db, entry)
    return records.detail(db, entry)


@router.patch("/entries/{entry_id}")
def patch_entry(entry_id: int, body: dict, db: Session = Depends(get_db)):
    entry = records.owned_entry(db, require_actor().id, entry_id)
    records.patch_entry(db, entry, body)
    return records.detail(db, entry)


@router.delete("/entries/{entry_id}")
def delete_entry(entry_id: int, db: Session = Depends(get_db)):
    entry = records.owned_entry(db, require_actor().id, entry_id)
    db.query(Experience).filter(Experience.entry_id == entry.id, Experience.user_id == entry.user_id).delete()
    from models import AlbumRating, EpisodeProgress, SeasonProgress, TrackRating
    db.query(SeasonProgress).filter(
        SeasonProgress.user_id == entry.user_id,
        SeasonProgress.entry_id == entry.id,
    ).delete(synchronize_session=False)
    episode_ids = [row.id for row in db.query(Episode.id).filter(Episode.catalog_id == entry.catalog_id)]
    if episode_ids:
        db.query(EpisodeProgress).filter(
            EpisodeProgress.user_id == entry.user_id,
            EpisodeProgress.episode_id.in_(episode_ids),
        ).delete(synchronize_session=False)
    db.query(AlbumRating).filter(
        AlbumRating.user_id == entry.user_id,
        AlbumRating.entry_id == entry.id,
    ).delete(synchronize_session=False)
    db.query(TrackRating).filter(
        TrackRating.user_id == entry.user_id,
        TrackRating.entry_id == entry.id,
    ).delete(synchronize_session=False)
    db.delete(entry)
    return {"deleted": True}


@router.post("/entries/{entry_id}/experiences")
def add_experience(entry_id: int, body: dict, db: Session = Depends(get_db)):
    entry = records.owned_entry(db, require_actor().id, entry_id)
    before = (entry.rating, entry.review)
    records.add_experience(db, entry, body)
    db.refresh(entry)
    if (entry.rating, entry.review) != before:
        raise HTTPException(status_code=500, detail="An experience changed the overall review.")
    return records.detail(db, entry)


@router.patch("/entries/{entry_id}/experiences/{experience_id}")
def patch_experience(entry_id: int, experience_id: int, body: dict, db: Session = Depends(get_db)):
    entry = records.owned_entry(db, require_actor().id, entry_id)
    row = db.get(Experience, experience_id)
    if row is None or row.entry_id != entry.id or row.user_id != entry.user_id:
        raise HTTPException(status_code=404, detail="That experience is not on this item.")
    records.patch_experience(row, body)
    entry.updated_at = records.utc_now()
    return records.detail(db, entry)


@router.delete("/entries/{entry_id}/experiences/{experience_id}")
def delete_experience(entry_id: int, experience_id: int, db: Session = Depends(get_db)):
    entry = records.owned_entry(db, require_actor().id, entry_id)
    row = db.get(Experience, experience_id)
    if row is None or row.entry_id != entry.id or row.user_id != entry.user_id:
        raise HTTPException(status_code=404, detail="That experience is not on this item.")
    db.delete(row)
    return records.detail(db, entry)


@router.post("/entries/{entry_id}/albums")
def add_album(entry_id: int, body: dict, db: Session = Depends(get_db)):
    entry = records.owned_entry(db, require_actor().id, entry_id)
    before = (entry.rating, entry.review)
    records.add_album(db, entry, body)
    db.refresh(entry)
    if (entry.rating, entry.review) != before:
        raise HTTPException(status_code=500, detail="An album changed the artist rating.")
    return records.detail(db, entry)


@router.post("/entries/{entry_id}/albums/{album_id}/tracks")
def add_track(entry_id: int, album_id: int, body: dict, db: Session = Depends(get_db)):
    entry = records.owned_entry(db, require_actor().id, entry_id)
    before = (entry.rating, entry.review)
    records.add_track(db, entry, album_id, body)
    db.refresh(entry)
    if (entry.rating, entry.review) != before:
        raise HTTPException(status_code=500, detail="A song changed the artist rating.")
    return records.detail(db, entry)


@router.post("/entries/{entry_id}/albums/{album_id}/rating")
def rate_album(entry_id: int, album_id: int, body: dict, db: Session = Depends(get_db)):
    entry = records.owned_entry(db, require_actor().id, entry_id)
    before = (entry.rating, entry.review, entry.summary)
    records.save_album_rating(db, entry, album_id, body)
    db.refresh(entry)
    if (entry.rating, entry.review, entry.summary) != before:
        raise HTTPException(status_code=500, detail="An album score changed the artist rating.")
    return records.detail(db, entry)


@router.post("/entries/{entry_id}/tracks/{track_id}/rating")
def rate_track(entry_id: int, track_id: int, body: dict, db: Session = Depends(get_db)):
    entry = records.owned_entry(db, require_actor().id, entry_id)
    before = (entry.rating, entry.review, entry.summary)
    records.save_track_rating(db, entry, track_id, body)
    db.refresh(entry)
    if (entry.rating, entry.review, entry.summary) != before:
        raise HTTPException(status_code=500, detail="A song score changed the artist rating.")
    return records.detail(db, entry)


def _load_artist_catalog(db: Session, entry) -> None:
    if not records.artist_needs_catalog(entry.catalog):
        return
    http = httpx.Client(timeout=20.0, headers={"User-Agent": UA, "Accept": "application/json"})
    try:
        if not records.catalog_list_complete(entry.catalog):
            group_offset, release_offset = records.catalog_resume(entry.catalog)
            source_id = entry.catalog.source_id

            def fetch_page():
                if group_offset or release_offset:
                    return providers.musicbrainz_artist_catalog(
                        http, source_id, group_offset=group_offset, release_offset=release_offset
                    )
                return providers.musicbrainz_artist_catalog(http, source_id)

            if group_offset or release_offset:
                payload = fetch_page()
            else:
                payload = providers.cached_call(db, f"musicbrainz:artist-catalog:{source_id}", fetch_page)
            if not isinstance(payload, dict):
                return
            records.store_music_catalog(db, entry.catalog, payload.get("albums") or [])
            records.remember_catalog_page(entry.catalog, payload)
        remaining = records.backfill_missing_tracks(db, entry.catalog, http)
        records.mark_catalog_loaded(entry.catalog, (not records.catalog_list_complete(entry.catalog)) or remaining)
    except Exception:
        return
    finally:
        http.close()


@router.post("/entries/{entry_id}/seasons")
def save_season(entry_id: int, body: dict, db: Session = Depends(get_db)):
    entry = records.owned_entry(db, require_actor().id, entry_id)
    before = (entry.rating, entry.review)
    records.save_season(db, entry, body)
    db.refresh(entry)
    if (entry.rating, entry.review) != before:
        raise HTTPException(status_code=500, detail="A season changed the overall review.")
    return records.detail(db, entry)


@router.post("/entries/{entry_id}/episodes")
def add_episode(entry_id: int, body: dict, db: Session = Depends(get_db)):
    entry = records.owned_entry(db, require_actor().id, entry_id)
    if entry.catalog.kind != "tv":
        raise HTTPException(status_code=422, detail="Episodes belong on a show.")
    records.upsert_episode(db, entry.catalog, body)
    return records.detail(db, entry)


@router.post("/entries/{entry_id}/episodes/{episode_id}/watched")
def watched(entry_id: int, episode_id: int, body: dict, db: Session = Depends(get_db)):
    entry = records.owned_entry(db, require_actor().id, entry_id)
    episode = db.get(Episode, episode_id)
    if episode is None or episode.catalog_id != entry.catalog_id:
        raise HTTPException(status_code=404, detail="That episode is not on this show.")
    watched_on = records.parse_date(body.get("watched_on"), "Watched on") if body.get("watched_on") else None
    records.mark_watched(db, require_actor().id, episode, bool(body.get("watched", True)), watched_on)
    return records.detail(db, entry)


@router.post("/entries/{entry_id}/episodes/next")
def next_episode(entry_id: int, db: Session = Depends(get_db)):
    entry = records.owned_entry(db, require_actor().id, entry_id)
    state = records.mark_next(db, require_actor().id, entry)
    payload = records.detail(db, entry)
    payload["show"] = state
    return payload


@router.get("/search")
def search(q: str = Query(""), kind: str | None = None, db: Session = Depends(get_db)):
    query = clean_text(q, 120, "Search", required=True)
    if len(query) < 2:
        raise HTTPException(status_code=422, detail="Type at least two letters.")
    user_id = require_actor().id
    payload = providers.search(db, query, kind)
    saved = records.saved_source_keys(db, user_id)
    for result in payload["results"]:
        result["already_saved"] = (result.get("source"), result.get("source_id")) in saved
    return payload
