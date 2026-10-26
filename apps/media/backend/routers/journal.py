import httpx
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from apps.media.backend.database import get_db
from apps.media.backend.models import Episode, Experience
from apps.media.backend.services import providers, records
from apps.media.backend.services.calendar import build_calendar
from apps.media.backend.services.providers import UA
from apps.media.backend.services.summary import build_summary, next_episodes
from apps.media.backend.services.validate import clean_text
from apps.server.auth import Principal, require_principal
from apps.server.database import release_for_provider_io

router = APIRouter()


@router.get("/me")
def me(principal: Principal = Depends(require_principal)):
    return {"username": principal.username or "", "display_name": principal.display_name}


@router.get("/summary")
def summary(db: Session = Depends(get_db), principal: Principal = Depends(require_principal)):
    return build_summary(db, principal.id)


@router.get("/calendar")
def calendar(
    month: str | None = None,
    tz: str | None = None,
    db: Session = Depends(get_db),
    principal: Principal = Depends(require_principal),
):
    user_id = principal.id
    http = httpx.Client(
        timeout=8.0,
        headers={"User-Agent": UA, "Accept": "application/sparql-results+json, application/json"},
    )
    try:
        return build_calendar(db, user_id, month, http, tz)
    finally:
        http.close()


@router.get("/library")
def library(
    kind: str | None = None,
    status: str | None = None,
    q: str | None = None,
    sort: str = "activity",
    db: Session = Depends(get_db),
    principal: Principal = Depends(require_principal),
):
    sort = sort.strip().lower()
    if sort not in {"added", "rating", "activity", "release", "title"}:
        sort = "activity"
    user_id = principal.id
    rows = records.list_library(db, user_id, kind, status, q, sort)
    records.apply_artist_portraits(db, rows)
    # The Continue rail is the only summary slice the library paints.
    # Chip and sort changes must not rebuild upcoming, reviews, and counts.
    return {
        "items": [records.library_card(db, row) for row in rows],
        "continue": next_episodes(db, user_id),
    }


@router.get("/movies")
def movies(db: Session = Depends(get_db), principal: Principal = Depends(require_principal)):
    http = httpx.Client(
        timeout=12.0,
        headers={"User-Agent": UA, "Accept": "text/html,application/json"},
        follow_redirects=True,
    )
    try:
        results = providers.popular_movies(db, http)
    except Exception:
        results = []
    finally:
        http.close()
    return {"results": results}


@router.post("/library")
def create_manual(
    body: dict, db: Session = Depends(get_db), principal: Principal = Depends(require_principal)
):
    entry = records.create_manual(db, principal.id, body)
    return records.detail(db, entry)


@router.post("/library/from-provider")
def create_from_provider(
    body: dict, db: Session = Depends(get_db), principal: Principal = Depends(require_principal)
):
    entry, already = records.create_from_provider(db, principal.id, body)
    payload = records.detail(db, entry)
    payload["already_saved"] = already
    return payload


@router.get("/entries/{entry_id}")
def read_entry(
    entry_id: int, db: Session = Depends(get_db), principal: Principal = Depends(require_principal)
):
    entry = records.owned_entry(db, principal.id, entry_id)
    records.apply_artist_portraits(db, [entry], deep=True)
    return records.detail(db, entry)


_DISCOGRAPHY_RELEASES = {"studio", "single", "ep", "live", "remix", "compilation"}


def _discography_artist(db: Session, user_id: int, entry_id: int):
    entry = records.owned_entry(db, user_id, entry_id)
    catalog = entry.catalog
    if catalog.kind != "artist" or catalog.source != "musicbrainz" or not catalog.source_id:
        raise HTTPException(
            status_code=422, detail="Discography is for a saved MusicBrainz artist."
        )
    return entry


@router.get("/entries/{entry_id}/discography")
def discography(
    entry_id: int,
    group_offset: int = Query(0, ge=0, le=10000),
    release_offset: int = Query(0, ge=0, le=10000),
    release: str = "studio",
    db: Session = Depends(get_db),
    principal: Principal = Depends(require_principal),
):
    """One page of public releases. Nothing here is saved."""
    entry = _discography_artist(db, principal.id, entry_id)
    chosen = release.strip().lower()
    if chosen not in _DISCOGRAPHY_RELEASES:
        raise HTTPException(status_code=422, detail="That release filter is not available.")
    catalog = entry.catalog
    http = httpx.Client(timeout=20.0, headers={"User-Agent": UA, "Accept": "application/json"})
    try:
        release_for_provider_io(db)
        if chosen == "studio":
            payload = providers.musicbrainz_artist_catalog(
                http,
                catalog.source_id,
                group_offset=group_offset,
                release_offset=release_offset,
                max_pages=1,
            )
        else:
            payload = providers.musicbrainz_artist_catalog(
                http,
                catalog.source_id,
                group_offset=group_offset,
                release_offset=release_offset,
                max_pages=1,
                release_type=chosen,
            )
    except Exception:
        raise HTTPException(
            status_code=503, detail="The discography could not be loaded."
        ) from None
    finally:
        http.close()
    if not isinstance(payload, dict):
        raise HTTPException(status_code=503, detail="The discography could not be loaded.")
    saved = records.saved_source_ids(db, principal.id)
    albums = []
    for album in payload.get("albums") or []:
        if not isinstance(album, dict):
            continue
        source_id = album.get("source_id") if isinstance(album.get("source_id"), str) else None
        key = ("musicbrainz", source_id) if source_id else None
        tracks = []
        for track in album.get("tracks") or []:
            if not isinstance(track, dict):
                continue
            track_id = track.get("source_id") if isinstance(track.get("source_id"), str) else None
            track_key = ("musicbrainz", track_id) if track_id else None
            track_row = {
                "source_id": track_id,
                "title": track.get("title") if isinstance(track.get("title"), str) else "Untitled",
                "position": track.get("position")
                if isinstance(track.get("position"), int)
                else None,
                "saved": bool(track_key and track_key in saved),
            }
            if track_key and track_key in saved:
                track_row["saved_id"] = saved[track_key]
            tracks.append(track_row)
        row = {
            "source_id": source_id,
            "title": album.get("title") if isinstance(album.get("title"), str) else "Untitled",
            "year": album.get("year") if isinstance(album.get("year"), int) else None,
            "artwork_url": album.get("artwork_url")
            if isinstance(album.get("artwork_url"), str)
            else None,
            "saved": bool(key and key in saved),
            "tracks": tracks,
        }
        if key and key in saved:
            row["saved_id"] = saved[key]
        albums.append(row)
    return {
        "partial": bool(payload.get("partial")),
        "group_offset": payload.get("group_offset") or 0,
        "release_offset": payload.get("release_offset") or 0,
        "release": chosen,
        "albums": albums,
    }


@router.post("/entries/{entry_id}/discography")
def save_discography_item(
    entry_id: int,
    body: dict,
    db: Session = Depends(get_db),
    principal: Principal = Depends(require_principal),
):
    """Save one discovered album or song. Does not save the rest of the page."""
    artist = _discography_artist(db, principal.id, entry_id)
    entry, already = records.save_discovered(db, principal.id, artist, body)
    payload = records.entry_card(entry)
    payload["already_saved"] = already
    return payload


@router.patch("/entries/{entry_id}")
def patch_entry(
    entry_id: int,
    body: dict,
    db: Session = Depends(get_db),
    principal: Principal = Depends(require_principal),
):
    entry = records.owned_entry(db, principal.id, entry_id)
    records.patch_entry(db, entry, body)
    return records.detail(db, entry)


@router.delete("/entries/{entry_id}")
def delete_entry(
    entry_id: int, db: Session = Depends(get_db), principal: Principal = Depends(require_principal)
):
    entry = records.owned_entry(db, principal.id, entry_id)
    db.query(Experience).filter(
        Experience.entry_id == entry.id, Experience.user_id == entry.user_id
    ).delete()
    from apps.media.backend.models import AlbumRating, EpisodeProgress, SeasonProgress, TrackRating

    db.query(SeasonProgress).filter(
        SeasonProgress.user_id == entry.user_id,
        SeasonProgress.entry_id == entry.id,
    ).delete(synchronize_session=False)
    episode_ids = [
        row.id for row in db.query(Episode.id).filter(Episode.catalog_id == entry.catalog_id)
    ]
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


@router.post("/entries/{entry_id}/albums")
def add_album(
    entry_id: int,
    body: dict,
    db: Session = Depends(get_db),
    principal: Principal = Depends(require_principal),
):
    entry = records.owned_entry(db, principal.id, entry_id)
    before = (entry.rating, entry.review)
    records.add_album(db, entry, body)
    db.refresh(entry)
    if (entry.rating, entry.review) != before:
        raise HTTPException(status_code=500, detail="An album changed the artist rating.")
    return records.detail(db, entry)


@router.post("/entries/{entry_id}/albums/{album_id}/tracks")
def add_track(
    entry_id: int,
    album_id: int,
    body: dict,
    db: Session = Depends(get_db),
    principal: Principal = Depends(require_principal),
):
    entry = records.owned_entry(db, principal.id, entry_id)
    before = (entry.rating, entry.review)
    records.add_track(db, entry, album_id, body)
    db.refresh(entry)
    if (entry.rating, entry.review) != before:
        raise HTTPException(status_code=500, detail="A song changed the artist rating.")
    return records.detail(db, entry)


@router.post("/entries/{entry_id}/albums/{album_id}/rating")
def rate_album(
    entry_id: int,
    album_id: int,
    body: dict,
    db: Session = Depends(get_db),
    principal: Principal = Depends(require_principal),
):
    entry = records.owned_entry(db, principal.id, entry_id)
    before = (entry.rating, entry.review, entry.summary)
    records.save_album_rating(db, entry, album_id, body)
    db.refresh(entry)
    if (entry.rating, entry.review, entry.summary) != before:
        raise HTTPException(status_code=500, detail="An album score changed the artist rating.")
    return records.detail(db, entry)


@router.post("/entries/{entry_id}/tracks/{track_id}/rating")
def rate_track(
    entry_id: int,
    track_id: int,
    body: dict,
    db: Session = Depends(get_db),
    principal: Principal = Depends(require_principal),
):
    entry = records.owned_entry(db, principal.id, entry_id)
    before = (entry.rating, entry.review, entry.summary)
    records.save_track_rating(db, entry, track_id, body)
    db.refresh(entry)
    if (entry.rating, entry.review, entry.summary) != before:
        raise HTTPException(status_code=500, detail="A song score changed the artist rating.")
    return records.detail(db, entry)


@router.post("/entries/{entry_id}/seasons")
def save_season(
    entry_id: int,
    body: dict,
    db: Session = Depends(get_db),
    principal: Principal = Depends(require_principal),
):
    entry = records.owned_entry(db, principal.id, entry_id)
    before = (entry.rating, entry.review)
    records.save_season(db, entry, body)
    db.refresh(entry)
    if (entry.rating, entry.review) != before:
        raise HTTPException(status_code=500, detail="A season changed the overall review.")
    return records.detail(db, entry)


@router.post("/entries/{entry_id}/episodes")
def add_episode(
    entry_id: int,
    body: dict,
    db: Session = Depends(get_db),
    principal: Principal = Depends(require_principal),
):
    entry = records.owned_entry(db, principal.id, entry_id)
    if entry.catalog.kind != "tv":
        raise HTTPException(status_code=422, detail="Episodes belong on a show.")
    records.upsert_episode(db, entry.catalog, body)
    return records.detail(db, entry)


@router.post("/entries/{entry_id}/episodes/{episode_id}/watched")
def watched(
    entry_id: int,
    episode_id: int,
    body: dict,
    db: Session = Depends(get_db),
    principal: Principal = Depends(require_principal),
):
    entry = records.owned_entry(db, principal.id, entry_id)
    episode = db.get(Episode, episode_id)
    if episode is None or episode.catalog_id != entry.catalog_id:
        raise HTTPException(status_code=404, detail="That episode is not on this show.")
    watched_on = (
        records.parse_date(body.get("watched_on"), "Watched on") if body.get("watched_on") else None
    )
    records.mark_watched(db, principal.id, episode, bool(body.get("watched", True)), watched_on)
    return records.detail(db, entry)


@router.post("/entries/{entry_id}/episodes/next")
def next_episode(
    entry_id: int, db: Session = Depends(get_db), principal: Principal = Depends(require_principal)
):
    entry = records.owned_entry(db, principal.id, entry_id)
    state = records.mark_next(db, principal.id, entry)
    payload = records.detail(db, entry)
    payload["show"] = state
    return payload


@router.get("/entries/{entry_id}/web")
def entry_web(
    entry_id: int, db: Session = Depends(get_db), principal: Principal = Depends(require_principal)
):
    """Collaborators for an artist, or sequels and spin-offs for a movie."""
    entry = records.owned_entry(db, principal.id, entry_id)
    catalog = entry.catalog
    if catalog.kind == "artist":
        nodes = records.cached_collaborators(catalog)
        if nodes is None and catalog.source == "musicbrainz" and catalog.source_id:
            http = httpx.Client(
                timeout=20.0, headers={"User-Agent": UA, "Accept": "application/json"}
            )
            try:
                release_for_provider_io(db)
                nodes = records.store_collaborators(
                    catalog, providers.musicbrainz_collaborators(http, catalog.source_id)
                )
            except Exception:
                nodes = records.store_collaborators(catalog, [])
            finally:
                http.close()
        return {"kind": "artist", "nodes": nodes or []}
    if catalog.kind in {"movie", "tv"}:
        from apps.media.backend.services.followups import Budget, follow_ups

        http = httpx.Client(timeout=20.0, headers={"User-Agent": UA, "Accept": "application/json"})
        try:
            rows = follow_ups(db, catalog, http, Budget(limit=2))
        except Exception:
            rows = []
        finally:
            http.close()
        nodes = [
            {"title": row.get("title"), "relation": row.get("relation"), "year": row.get("year")}
            for row in rows
            if isinstance(row, dict) and row.get("title")
        ]
        return {"kind": catalog.kind, "nodes": nodes}
    return {"kind": catalog.kind, "nodes": []}


@router.get("/search")
def search(
    q: str = Query(""),
    kind: str | None = None,
    db: Session = Depends(get_db),
    principal: Principal = Depends(require_principal),
):
    query = clean_text(q, 120, "Search", required=True)
    if len(query) < 2:
        raise HTTPException(status_code=422, detail="Type at least two letters.")
    user_id = principal.id
    payload = providers.search(db, query, kind)
    providers.attach_artist_portraits(db, payload["results"])
    saved = records.saved_source_ids(db, user_id)
    for result in payload["results"]:
        key = (result.get("source"), result.get("source_id"))
        result["already_saved"] = key in saved
        if key in saved:
            result["saved_id"] = saved[key]
    return payload
