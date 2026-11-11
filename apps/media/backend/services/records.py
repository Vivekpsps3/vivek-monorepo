"""Personal library reads and writes. Metadata refreshes never touch reviews."""

import json
import math
import time
from collections.abc import Callable, Sequence
from datetime import UTC, date, datetime
from typing import Any, NamedTuple, NoReturn

from fastapi import HTTPException
from sqlalchemy import and_, case, func, or_
from sqlalchemy.orm import Session, aliased, contains_eager

from apps.media.backend.models import (
    CatalogItem,
    Episode,
    EpisodeProgress,
    MusicLink,
    Release,
    SeasonProgress,
    SeriesLifecycle,
    UserEntry,
    utc_now,
)
from apps.media.backend.services.clock import today
from apps.media.backend.services.validate import (
    ARTIST_STATUSES,
    KINDS,
    PRECISIONS,
    PROGRESS_UNITS,
    RELEASE_STATUSES,
    SOURCES,
    STATUSES,
    choice,
    clean_text,
    fail,
    http_url,
    https_artwork,
    parse_date,
    rating_value,
    season_number,
    watched_flag,
)
from apps.media.backend.services.when import is_released

# Public links. A row here is not a personal save.
_ALBUM_RELATIONS = ("artist-album", "artist-release-group")
_TRACK_RELATIONS = ("album-recording", "release-group-recording")


def dumps(value) -> str | None:
    if value is None:
        return None
    return json.dumps(value, separators=(",", ":"))


def loads(value, fallback):
    if not value:
        return fallback
    try:
        return json.loads(value)
    except json.JSONDecodeError:
        return fallback


def iso(value: datetime | date | None) -> str | None:
    if value is None:
        return None
    if isinstance(value, datetime):
        if value.tzinfo is None:
            value = value.replace(tzinfo=UTC)
        return value.astimezone(UTC).isoformat()
    return value.isoformat()


def catalog_dict(row: CatalogItem) -> dict:
    return {
        "id": row.id,
        "kind": row.kind,
        "title": row.title,
        "creator": row.creator,
        "year": row.year,
        "overview": row.overview,
        "artwork_url": row.artwork_url,
        "genres": loads(row.genres, []),
        "source": row.source,
        "source_id": row.source_id,
        "extra": loads(row.extra, {}),
        "external_ratings": loads(row.external_ratings, []),
    }


def artist_is_followed(entry: UserEntry) -> bool:
    """Follow flag wins. A missing flag uses the legacy status only as a fallback."""
    if entry.followed is not None:
        return bool(entry.followed)
    return entry.status not in {"dropped", "unfollowed"}


def displayed_status(entry: UserEntry) -> str:
    """Artists are following or unfollowed. The stored legacy status is not shown."""
    if entry.catalog.kind != "artist":
        return entry.status
    return "following" if artist_is_followed(entry) else "unfollowed"


def entry_card(entry: UserEntry) -> dict:
    catalog = entry.catalog
    return {
        "id": entry.id,
        "kind": catalog.kind,
        "title": catalog.title,
        "creator": catalog.creator,
        "year": catalog.year,
        "artwork_url": entry.portrait_url
        if catalog.kind == "artist" and entry.portrait_url
        else catalog.artwork_url,
        "status": displayed_status(entry),
        "rating": entry.rating,
        "favorite": entry.favorite,
        "anticipated": entry.anticipated,
        "progress_value": entry.progress_value,
        "progress_unit": entry.progress_unit,
        "progress_label": progress_label(entry),
        "updated_at": iso(entry.updated_at),
        "review_updated_at": iso(entry.review_updated_at),
    }


def library_cards(db: Session, entries: list[UserEntry]) -> list[dict]:
    """Read only card facts for this page, without hydrating detail relationships."""
    from apps.media.backend.services.metadata import lifecycle_payload

    if not entries:
        return []
    user_id = entries[0].user_id
    shows = [entry.catalog_id for entry in entries if entry.catalog.kind == "tv"]
    artists = [entry.catalog_id for entry in entries if entry.catalog.kind == "artist"]
    flags = _library_episode_flags(db, user_id, shows)
    lifecycles = (
        {
            row.catalog_id: row
            for row in db.query(SeriesLifecycle).filter(SeriesLifecycle.catalog_id.in_(shows)).all()
        }
        if shows
        else {}
    )
    counts = _saved_child_counts(db, user_id, artists)
    cards = []
    for entry in entries:
        card = entry_card(entry)
        kind = entry.catalog.kind
        if kind == "tv":
            card["lifecycle"] = lifecycle_payload(lifecycles.get(entry.catalog_id))
            card.update(
                flags.get(entry.catalog_id, {"caught_up": False, "metadata_incomplete": True})
            )
        elif kind == "artist":
            card["saved_count"] = counts.get(entry.catalog_id, 0)
        elif kind == "track":
            extra = loads(entry.catalog.extra, {})
            raw = (
                extra.get("album") or extra.get("album_title") if isinstance(extra, dict) else None
            )
            if isinstance(raw, str) and raw.strip():
                card["album"] = raw.strip()
        cards.append(card)
    return cards


def _library_episode_flags(db: Session, user_id: int, catalog_ids: list[int]) -> dict[int, dict]:
    if not catalog_ids:
        return {}
    released = and_(Episode.season_number > 0, Episode.air_date <= today())
    unknown = and_(Episode.season_number > 0, Episode.air_date.is_(None))
    unwatched = and_(
        released, or_(EpisodeProgress.watched.is_(None), EpisodeProgress.watched.is_(False))
    )
    rows = (
        db.query(
            Episode.catalog_id,
            func.sum(case((released, 1), else_=0)),
            func.sum(case((unknown, 1), else_=0)),
            func.sum(case((unwatched, 1), else_=0)),
        )
        .outerjoin(
            EpisodeProgress,
            and_(EpisodeProgress.episode_id == Episode.id, EpisodeProgress.user_id == user_id),
        )
        .filter(Episode.catalog_id.in_(catalog_ids))
        .group_by(Episode.catalog_id)
        .all()
    )
    return {
        catalog_id: {
            "caught_up": bool(aired and not undated and not remaining),
            "metadata_incomplete": bool(undated),
        }
        for catalog_id, aired, undated, remaining in rows
    }


def _saved_child_counts(db: Session, user_id: int, artist_ids: list[int]) -> dict[int, int]:
    if not artist_ids:
        return {}
    albums = (
        db.query(MusicLink.parent_catalog_id, func.count(func.distinct(UserEntry.id)))
        .join(UserEntry, UserEntry.catalog_id == MusicLink.child_catalog_id)
        .join(CatalogItem, CatalogItem.id == UserEntry.catalog_id)
        .filter(
            MusicLink.parent_catalog_id.in_(artist_ids),
            MusicLink.relation.in_(_ALBUM_RELATIONS),
            UserEntry.user_id == user_id,
            CatalogItem.kind == "album",
        )
        .group_by(MusicLink.parent_catalog_id)
    )
    track_link = aliased(MusicLink)
    tracks = (
        db.query(MusicLink.parent_catalog_id, func.count(func.distinct(UserEntry.id)))
        .join(track_link, track_link.parent_catalog_id == MusicLink.child_catalog_id)
        .join(UserEntry, UserEntry.catalog_id == track_link.child_catalog_id)
        .join(CatalogItem, CatalogItem.id == UserEntry.catalog_id)
        .filter(
            MusicLink.parent_catalog_id.in_(artist_ids),
            MusicLink.relation.in_(_ALBUM_RELATIONS),
            track_link.relation.in_(_TRACK_RELATIONS),
            UserEntry.user_id == user_id,
            CatalogItem.kind == "track",
        )
        .group_by(MusicLink.parent_catalog_id)
    )
    counts: dict[int, int] = {}
    for catalog_id, count in albums.union_all(tracks).all():
        counts[catalog_id] = counts.get(catalog_id, 0) + count
    return counts


def progress_label(entry: UserEntry) -> str | None:
    if entry.progress_value is None:
        return None
    unit = entry.progress_unit or ""
    if unit == "percent":
        return f"{entry.progress_value:g}%"
    if unit == "page":
        return f"p. {entry.progress_value:g}"
    if unit == "episode":
        return f"Episode {entry.progress_value:g}"
    if unit == "hour":
        return f"{entry.progress_value:g} h"
    return f"{entry.progress_value:g}"


def owned_entry(db: Session, user_id: int, entry_id: int) -> UserEntry:
    entry = db.get(UserEntry, entry_id)
    if entry is None or entry.user_id != user_id:
        fail_missing()
    return entry


def fail_missing() -> NoReturn:
    from fastapi import HTTPException

    raise HTTPException(status_code=404, detail="That item is not in your library.")


def apply_catalog_fields(row: CatalogItem, body: dict, *, fill_blanks_only: bool) -> None:
    for field, limit in (("title", 300), ("creator", 300), ("overview", 8000)):
        if field not in body:
            continue
        value = clean_text(body.get(field), limit, field.capitalize(), required=field == "title")
        if fill_blanks_only and getattr(row, field):
            continue
        if value is not None or field != "title":
            setattr(row, field, value)
    if "year" in body and not (fill_blanks_only and row.year):
        year = body.get("year")
        if year in (None, ""):
            row.year = None
        else:
            try:
                year = int(year)
            except (TypeError, ValueError):
                fail("Year must be a number.")
            if year < 1000 or year > 3000:
                fail("Year is out of range.")
            row.year = year
    if "artwork_url" in body and not (fill_blanks_only and row.artwork_url):
        row.artwork_url = http_url(body.get("artwork_url"))
    row.updated_at = utc_now()


def store_release(db: Session, catalog: CatalogItem, body: dict) -> None:
    if not any(
        key in body for key in ("release_on", "release_precision", "release_status", "releases")
    ):
        return
    releases = body.get("releases")
    if isinstance(releases, list) and releases:
        for item in releases:
            if not isinstance(item, dict):
                continue
            add_release(db, catalog, item)
        return
    if "release_on" in body or "release_precision" in body or "release_status" in body:
        add_release(
            db,
            catalog,
            {
                "released_on": body.get("release_on"),
                "precision": body.get("release_precision")
                or ("day" if body.get("release_on") else "unknown"),
                "status": body.get("release_status") or "scheduled",
                "region": body.get("region"),
                "platform": body.get("platform"),
                "note": body.get("release_note"),
            },
        )


def add_release(db: Session, catalog: CatalogItem, item: dict) -> None:
    precision = choice(item.get("precision"), PRECISIONS, "Release precision", "unknown")
    status = choice(item.get("status"), RELEASE_STATUSES, "Release status", "unknown")
    released_on = parse_date(item.get("released_on"), "Release date")
    if precision in {"month", "year"} and released_on is not None:
        released_on = date(released_on.year, 1 if precision == "year" else released_on.month, 1)
    db.add(
        Release(
            catalog_id=catalog.id,
            region=clean_text(item.get("region"), 40, "Region"),
            platform=clean_text(item.get("platform"), 80, "Platform"),
            released_on=released_on,
            precision=precision,
            status=status,
            note=clean_text(item.get("note"), 300, "Release note"),
        )
    )


def store_episodes(db: Session, catalog: CatalogItem, episodes: list | None) -> None:
    if catalog.kind != "tv" or not episodes:
        return
    for item in episodes:
        if not isinstance(item, dict):
            continue
        upsert_episode(db, catalog, item)


def upsert_episode(db: Session, catalog: CatalogItem, item: dict) -> Episode:
    try:
        season = int(item.get("season_number"))
        number = int(item.get("episode_number"))
    except (TypeError, ValueError):
        fail("Season and episode need numbers.")
    if season < 0 or number < 1:
        fail("Episode numbers start at 1.")
    row = (
        db.query(Episode)
        .filter(
            Episode.catalog_id == catalog.id,
            Episode.season_number == season,
            Episode.episode_number == number,
        )
        .one_or_none()
    )
    if row is None:
        row = Episode(catalog_id=catalog.id, season_number=season, episode_number=number)
        db.add(row)
    title = clean_text(item.get("title"), 300, "Episode title")
    if title:
        row.title = title
    if "air_date" in item:
        row.air_date = parse_date(item.get("air_date"), "Air date")
    overview = clean_text(item.get("overview"), 8000, "Episode overview")
    if overview and not row.overview:
        row.overview = overview
    if item.get("source_id") and not row.source_id:
        row.source_id = clean_text(item.get("source_id"), 120, "Episode id")
    db.flush()
    return row


def create_manual(db: Session, user_id: int, body: dict) -> UserEntry:
    kind = choice(body.get("kind"), KINDS, "Media type")
    title = clean_text(body.get("title"), 300, "Title", required=True)
    catalog = CatalogItem(
        kind=kind,
        title=title,
        creator=clean_text(body.get("creator"), 300, "Creator"),
        overview=clean_text(body.get("overview"), 8000, "Description"),
        artwork_url=http_url(body.get("artwork_url")),
        source="manual",
        genres=dumps(body.get("genres") if isinstance(body.get("genres"), list) else []),
        extra=dumps(body.get("extra") if isinstance(body.get("extra"), dict) else {}),
        external_ratings=dumps([]),
    )
    if body.get("year") not in (None, ""):
        apply_catalog_fields(catalog, {"year": body.get("year")}, fill_blanks_only=False)
    db.add(catalog)
    db.flush()
    store_release(db, catalog, body)
    entry = new_entry(db, user_id, catalog, body)
    return entry


def _metadata_pending(catalog: CatalogItem) -> bool:
    extra = loads(catalog.extra, {})
    return isinstance(extra, dict) and extra.get("metadata_pending") is True


def _text_or_blank(value, limit: int) -> str | None:
    if not isinstance(value, str):
        return None
    text = value.strip()
    if not text:
        return None
    return text[:limit]


def _apply_authoritative(db: Session, catalog: CatalogItem, detail: dict) -> None:
    """Fill shared fields from the adapter. Leave a written overview alone."""
    title = _text_or_blank(detail.get("title"), 300)
    if title:
        catalog.title = title
    if not catalog.creator:
        catalog.creator = _text_or_blank(detail.get("creator"), 300)
    if not catalog.overview:
        catalog.overview = _text_or_blank(detail.get("overview"), 8000)
    if not catalog.artwork_url:
        catalog.artwork_url = https_artwork(detail.get("artwork_url"))
    if catalog.year is None and isinstance(detail.get("year"), int):
        year = detail["year"]
        if 1000 <= year <= 3000:
            catalog.year = year
    if not loads(catalog.genres, []):
        genres = detail.get("genres")
        if not isinstance(genres, list):
            genres = []
        catalog.genres = dumps(
            [item.strip() for item in genres if isinstance(item, str) and item.strip()][:12]
        )
    if not loads(catalog.external_ratings, []):
        catalog.external_ratings = dumps(normalize_ratings(detail.get("external_ratings")))
    extra = loads(catalog.extra, {})
    if not isinstance(extra, dict):
        extra = {}
    incoming = detail.get("extra")
    if not isinstance(incoming, dict):
        incoming = {}
    for key, value in incoming.items():
        if key not in {"metadata_pending", "provenance"} and key not in extra:
            extra[key] = value
    mark = detail.get("provenance")
    if not isinstance(mark, dict):
        from apps.media.backend.services.providers import provenance

        mark = provenance(catalog.source, "official")
    extra["provenance"] = mark
    extra["metadata_pending"] = False
    catalog.extra = dumps(extra)
    catalog.updated_at = utc_now()
    has_release = db.query(Release.id).filter(Release.catalog_id == catalog.id).first() is not None
    if not has_release:
        store_release(db, catalog, {"releases": detail.get("releases") or []})
        db.flush()
    if catalog.kind == "tv":
        has_episode = (
            db.query(Episode.id).filter(Episode.catalog_id == catalog.id).first() is not None
        )
        if not has_episode:
            episodes = []
            for item in detail.get("episodes") or []:
                if not isinstance(item, dict):
                    continue
                try:
                    season = int(item.get("season_number"))
                    number = int(item.get("episode_number"))
                except (TypeError, ValueError):
                    continue
                if season < 0 or number < 1:
                    continue
                episodes.append(item)
            store_episodes(db, catalog, episodes)
        from apps.media.backend.services.metadata import ingest_series

        ingest_series(db, catalog, detail)


def _detail_matches(detail, source: str, kind: str, source_id: str) -> bool:
    if not isinstance(detail, dict):
        return False
    if detail.get("source") != source or detail.get("kind") != kind:
        return False
    found = detail.get("source_id")
    return isinstance(found, str) and found.strip().casefold() == source_id.casefold()


def _catalog_by_source(db: Session, source: str, source_id: str | None) -> CatalogItem | None:
    if not source_id:
        return None
    return (
        db.query(CatalogItem)
        .filter(CatalogItem.source == source, CatalogItem.source_id == source_id)
        .one_or_none()
    )


def _new_pending_catalog(
    db: Session, kind: str, title: str, source: str, source_id: str
) -> CatalogItem:
    catalog = CatalogItem(
        kind=kind,
        title=title,
        source=source,
        source_id=source_id,
        genres=dumps([]),
        extra=dumps(
            {
                "metadata_pending": True,
                "provenance": {"provider": source, "coverage": "pending", "fetched_at": None},
            }
        ),
        external_ratings=dumps([]),
    )
    db.add(catalog)
    db.flush()
    return catalog


def _entry_for_catalog(
    db: Session, user_id: int, catalog: CatalogItem, body: dict
) -> tuple[UserEntry, bool]:
    existing = (
        db.query(UserEntry)
        .filter(UserEntry.user_id == user_id, UserEntry.catalog_id == catalog.id)
        .one_or_none()
    )
    if existing is not None:
        return existing, True
    return new_entry(db, user_id, catalog, body), False


def _album_detail_fits(detail: dict, requested_id: str, group_id: str) -> bool:
    if detail.get("source") != "musicbrainz" or detail.get("kind") != "album":
        return False
    found = detail.get("source_id")
    allowed = {requested_id.casefold(), group_id.casefold()}
    if isinstance(found, str) and found.strip().casefold() in allowed:
        return True
    extra = detail.get("extra")
    if not isinstance(extra, dict):
        return False
    marked = extra.get("release_group_id")
    return isinstance(marked, str) and marked.casefold() == group_id.casefold()


def _identity_from_detail(
    detail: dict, requested_id: str
) -> tuple[str | None, str | None, str | None, bool]:
    """Group id, pressing id, primary artist id, and whether the release named no artist."""
    from apps.media.backend.services.providers import mbid as mb

    raw_extra = detail.get("extra")
    extra: dict = raw_extra if isinstance(raw_extra, dict) else {}
    group = mb(extra.get("release_group_id"))
    artist = mb(extra.get("artist_id"))
    pressing = mb(extra.get("release_id"))
    found = mb(detail.get("source_id")) if isinstance(detail.get("source_id"), str) else None
    requested = mb(requested_id)
    if group and found and found != group:
        pressing = pressing or found
    elif group and requested and requested != group:
        pressing = pressing or requested
    if pressing == group:
        pressing = None
    return group, pressing, artist, bool(group and not artist)


def _album_identity_resolved(catalog: CatalogItem) -> bool:
    from apps.media.backend.services.providers import mbid as mb

    extra = _extra(catalog)
    group = extra.get("release_group_id")
    if not isinstance(group, str) or not mb(group) or group != catalog.source_id:
        return False
    if mb(extra.get("artist_id")):
        return True
    return extra.get("artist_uncredited") is True


def _remember_album_identity(
    catalog: CatalogItem,
    group_id: str | None,
    pressing_id: str | None,
    artist_id: str | None,
    uncredited: bool,
) -> None:
    extra = _extra(catalog)
    if group_id and catalog.source_id == group_id:
        extra["release_group_id"] = group_id
    if pressing_id and pressing_id != catalog.source_id:
        ids = extra.get("release_ids")
        if not isinstance(ids, list):
            ids = []
        current = extra.get("release_id")
        if isinstance(current, str) and current and current not in ids:
            ids.append(current)
        if pressing_id not in ids:
            ids.append(pressing_id)
        if not isinstance(current, str) or not current:
            extra["release_id"] = pressing_id
        extra["release_ids"] = ids
    if artist_id:
        extra["artist_id"] = artist_id
        extra.pop("artist_uncredited", None)
    elif uncredited and group_id and catalog.source_id == group_id:
        extra["artist_uncredited"] = True
    _save_extra(catalog, extra)


def _link_saved_artists(
    db: Session, user_id: int, album: CatalogItem, artist_id: str | None
) -> None:
    """Link this album under a saved artist with this MusicBrainz id. Names are ignored."""
    from apps.media.backend.services.providers import mbid as mb

    artist_id = mb(artist_id)
    if not artist_id or album.kind != "album":
        return
    artists = (
        db.query(UserEntry)
        .join(CatalogItem, UserEntry.catalog_id == CatalogItem.id)
        .filter(
            UserEntry.user_id == user_id,
            CatalogItem.kind == "artist",
            CatalogItem.source == "musicbrainz",
            CatalogItem.source_id == artist_id,
        )
        .all()
    )
    for artist in artists:
        found = (
            db.query(MusicLink.id)
            .filter(
                MusicLink.parent_catalog_id == artist.catalog_id,
                MusicLink.child_catalog_id == album.id,
                MusicLink.relation.in_(_ALBUM_RELATIONS),
            )
            .first()
        )
        if found is not None:
            continue
        _ensure_link(
            db,
            artist.catalog_id,
            album.id,
            "artist-release-group",
            _next_position(db, artist.catalog_id, _ALBUM_RELATIONS),
            artist.catalog.title,
        )


def _copy_blank_album_fields(keeper: CatalogItem, duplicate: CatalogItem) -> None:
    if not keeper.artwork_url and duplicate.artwork_url:
        keeper.artwork_url = duplicate.artwork_url
    if keeper.year is None and duplicate.year is not None:
        keeper.year = duplicate.year
    if not keeper.creator and duplicate.creator:
        keeper.creator = duplicate.creator
    if not keeper.overview and duplicate.overview:
        keeper.overview = duplicate.overview
    extra = _extra(keeper)
    other = _extra(duplicate)
    for key in ("artist_id", "release_group_id", "release_id", "primary_type"):
        if not extra.get(key) and other.get(key):
            extra[key] = other[key]
    if (
        extra.get("artist_uncredited") is not True
        and other.get("artist_uncredited") is True
        and not extra.get("artist_id")
    ):
        extra["artist_uncredited"] = True
    ids: list[str] = []
    for source in (extra, other):
        listed = source.get("release_ids")
        if isinstance(listed, list):
            ids.extend(item for item in listed if isinstance(item, str) and item not in ids)
        one = source.get("release_id")
        if isinstance(one, str) and one and one not in ids:
            ids.append(one)
    if ids:
        extra["release_ids"] = ids
        if not extra.get("release_id"):
            extra["release_id"] = ids[0]
    _save_extra(keeper, extra)


def _fill_blank_entry(keeper: UserEntry, duplicate: UserEntry) -> None:
    """Keep the group entry. Copy a personal mark only where the keeper is blank."""
    if keeper.rating is None and duplicate.rating is not None:
        keeper.rating = duplicate.rating
    if not keeper.review and duplicate.review:
        keeper.review = duplicate.review
        keeper.review_spoiler = duplicate.review_spoiler
        keeper.review_updated_at = duplicate.review_updated_at
    if not keeper.summary and duplicate.summary:
        keeper.summary = duplicate.summary
    if not keeper.tags and duplicate.tags:
        keeper.tags = duplicate.tags
    if duplicate.favorite:
        keeper.favorite = True
    if duplicate.anticipated:
        keeper.anticipated = True


def _retarget_entry_dependents(db: Session, old_id: int, new_id: int) -> None:
    from apps.media.backend.models import AlbumRating, Experience, ProgressOperation, TrackRating

    for experience in db.query(Experience).filter(Experience.entry_id == old_id).all():
        experience.entry_id = new_id
    for operation in db.query(ProgressOperation).filter(ProgressOperation.entry_id == old_id).all():
        operation.entry_id = new_id
    for album_rating in db.query(AlbumRating).filter(AlbumRating.entry_id == old_id).all():
        kept_album = (
            db.query(AlbumRating)
            .filter(
                AlbumRating.user_id == album_rating.user_id,
                AlbumRating.entry_id == new_id,
                AlbumRating.album_id == album_rating.album_id,
            )
            .one_or_none()
        )
        if kept_album is None:
            album_rating.entry_id = new_id
        elif kept_album.rating is None and album_rating.rating is not None:
            kept_album.rating = album_rating.rating
            db.delete(album_rating)
        else:
            db.delete(album_rating)
    for track_rating in db.query(TrackRating).filter(TrackRating.entry_id == old_id).all():
        kept_track = (
            db.query(TrackRating)
            .filter(
                TrackRating.user_id == track_rating.user_id,
                TrackRating.entry_id == new_id,
                TrackRating.track_id == track_rating.track_id,
            )
            .one_or_none()
        )
        if kept_track is None:
            track_rating.entry_id = new_id
        elif kept_track.rating is None and track_rating.rating is not None:
            kept_track.rating = track_rating.rating
            db.delete(track_rating)
        else:
            db.delete(track_rating)
    for season in db.query(SeasonProgress).filter(SeasonProgress.entry_id == old_id).all():
        kept_season = (
            db.query(SeasonProgress)
            .filter(
                SeasonProgress.user_id == season.user_id,
                SeasonProgress.entry_id == new_id,
                SeasonProgress.season_number == season.season_number,
            )
            .one_or_none()
        )
        if kept_season is None:
            season.entry_id = new_id
        else:
            db.delete(season)
    db.flush()


def _retarget_user_entries(db: Session, old_catalog_id: int, new_catalog_id: int) -> None:
    entries = db.query(UserEntry).filter(UserEntry.catalog_id == old_catalog_id).all()
    for entry in entries:
        keeper = (
            db.query(UserEntry)
            .filter(UserEntry.user_id == entry.user_id, UserEntry.catalog_id == new_catalog_id)
            .one_or_none()
        )
        if keeper is None:
            entry.catalog_id = new_catalog_id
            continue
        _fill_blank_entry(keeper, entry)
        _retarget_entry_dependents(db, entry.id, keeper.id)
        db.delete(entry)
    db.flush()


def _retarget_music_links(db: Session, old_id: int, new_id: int) -> None:
    links = (
        db.query(MusicLink)
        .filter(or_(MusicLink.parent_catalog_id == old_id, MusicLink.child_catalog_id == old_id))
        .all()
    )
    removed = []
    updates = []
    for link in links:
        parent = new_id if link.parent_catalog_id == old_id else link.parent_catalog_id
        child = new_id if link.child_catalog_id == old_id else link.child_catalog_id
        if parent == child:
            removed.append(link)
            continue
        clash = (
            db.query(MusicLink)
            .filter(
                MusicLink.parent_catalog_id == parent,
                MusicLink.child_catalog_id == child,
                MusicLink.relation == link.relation,
                MusicLink.id != link.id,
            )
            .one_or_none()
        )
        if clash is not None:
            removed.append(link)
            continue
        updates.append((link, parent, child))
    for link in removed:
        db.delete(link)
    db.flush()
    for link, parent, child in updates:
        link.parent_catalog_id = parent
        link.child_catalog_id = child
    db.flush()


def _retarget_releases(db: Session, old_id: int, new_id: int) -> None:
    for row in db.query(Release).filter(Release.catalog_id == old_id).all():
        row.catalog_id = new_id
    lifecycle = db.query(SeriesLifecycle).filter(SeriesLifecycle.catalog_id == old_id).one_or_none()
    if lifecycle is not None:
        keeper = (
            db.query(SeriesLifecycle).filter(SeriesLifecycle.catalog_id == new_id).one_or_none()
        )
        if keeper is None:
            lifecycle.catalog_id = new_id
        else:
            db.delete(lifecycle)
    db.flush()


def _merge_album_catalog(
    db: Session, keeper: CatalogItem, duplicate: CatalogItem, pressing_id: str | None
) -> CatalogItem:
    """One album for the release group. The pressing id stays on that row."""
    if keeper.id == duplicate.id:
        return keeper
    _copy_blank_album_fields(keeper, duplicate)
    _retarget_music_links(db, duplicate.id, keeper.id)
    _retarget_releases(db, duplicate.id, keeper.id)
    _retarget_user_entries(db, duplicate.id, keeper.id)
    db.flush()
    db.delete(duplicate)
    db.flush()
    if pressing_id:
        _remember_album_identity(keeper, keeper.source_id, pressing_id, None, False)
    return keeper


def _claim_album_group(
    db: Session,
    *,
    group_id: str,
    pressing_id: str | None,
    requested_id: str,
    title: str,
    requested_row: CatalogItem | None,
    strict: bool,
) -> CatalogItem | None:
    """Store the release group as the album. A pressing row is attached, not kept apart.

    A group id that already belongs to another kind is not reused. ``strict``
    reports that the same way a save already rejects a provider id of the wrong kind.
    """
    group = _catalog_by_source(db, "musicbrainz", group_id)
    if group is not None and group.kind != "album":
        if strict:
            fail("That provider id is already a different type.")
        return None
    pressing = None
    if pressing_id and pressing_id != group_id:
        pressing = _catalog_by_source(db, "musicbrainz", pressing_id)
    if (
        pressing is None
        and requested_row is not None
        and requested_row.source_id not in {None, group_id}
    ):
        pressing = requested_row
    if pressing is not None and pressing.kind != "album":
        if strict:
            fail("That provider id is already a different type.")
        return None
    if group is None and pressing is not None:
        pressing.source_id = group_id
        db.flush()
        return pressing
    if group is None:
        return _new_pending_catalog(db, "album", title, "musicbrainz", group_id)
    if pressing is not None and pressing.id != group.id:
        return _merge_album_catalog(db, group, pressing, pressing_id or requested_id)
    return group


def _place_musicbrainz_album(
    db: Session,
    user_id: int,
    *,
    title: str,
    requested_id: str,
    requested_row: CatalogItem | None,
    group_id: str,
    pressing_id: str | None,
    artist_id: str | None,
    uncredited: bool,
    detail: dict | None,
    strict: bool,
) -> CatalogItem:
    from apps.media.backend.services.providers import mbid as mb

    claimed = _claim_album_group(
        db,
        group_id=group_id,
        pressing_id=pressing_id,
        requested_id=requested_id,
        title=title,
        requested_row=requested_row,
        strict=strict,
    )
    if claimed is None:
        if strict or requested_row is None:
            fail("That provider id is already a different type.")
        extra = _extra(requested_row)
        extra["identity_blocked"] = True
        extra["release_group_id"] = group_id
        if artist_id:
            extra["artist_id"] = artist_id
        _save_extra(requested_row, extra)
        _link_saved_artists(db, user_id, requested_row, artist_id)
        return requested_row
    if (
        detail is not None
        and _metadata_pending(claimed)
        and _album_detail_fits(detail, requested_id, group_id)
    ):
        _apply_authoritative(db, claimed, detail)
    _remember_album_identity(claimed, group_id, pressing_id, artist_id, uncredited)
    stored_artist = artist_id or mb(_extra(claimed).get("artist_id"))
    _link_saved_artists(db, user_id, claimed, stored_artist)
    return claimed


def _save_musicbrainz_album(
    db: Session, user_id: int, body: dict, source_id: str, title: str
) -> tuple[UserEntry, bool]:
    """The album is the release group. The id being saved may be one pressing of it."""
    from apps.media.backend.services import providers
    from apps.server.database import release_for_provider_io

    raw_hint = body.get("extra")
    hinted: dict = raw_hint if isinstance(raw_hint, dict) else {}
    group_id = providers.mbid(hinted.get("release_group_id"))
    pressing_id = providers.mbid(hinted.get("release_id"))
    if group_id and group_id != source_id:
        pressing_id = pressing_id or source_id
    elif pressing_id == group_id:
        pressing_id = None

    requested = _catalog_by_source(db, "musicbrainz", source_id)
    if requested is not None and requested.kind != "album":
        fail("That provider id is already a different type.")

    known = _catalog_by_source(db, "musicbrainz", group_id) if group_id else None
    need_detail = not (
        known is not None
        and known.kind == "album"
        and not _metadata_pending(known)
        and _album_identity_resolved(known)
        and (requested is None or requested.id == known.id)
    )
    detail = None
    if need_detail:
        release_for_provider_io(db)
        detail = providers.lookup_detail("musicbrainz", "album", source_id)

    artist_id = None
    uncredited = False
    if (
        isinstance(detail, dict)
        and detail.get("source") == "musicbrainz"
        and detail.get("kind") == "album"
    ):
        parsed_group, parsed_pressing, artist_id, uncredited = _identity_from_detail(
            detail, source_id
        )
        if parsed_group:
            group_id = parsed_group
        if parsed_pressing:
            pressing_id = parsed_pressing
    if pressing_id == group_id:
        pressing_id = None

    if not group_id:
        catalog = requested or _new_pending_catalog(db, "album", title, "musicbrainz", source_id)
        if (
            detail is not None
            and _metadata_pending(catalog)
            and _detail_matches(detail, "musicbrainz", "album", source_id)
        ):
            _apply_authoritative(db, catalog, detail)
        return _entry_for_catalog(db, user_id, catalog, body)

    catalog = _place_musicbrainz_album(
        db,
        user_id,
        title=title,
        requested_id=source_id,
        requested_row=requested
        if requested is not None and requested.source_id != group_id
        else None,
        group_id=group_id,
        pressing_id=pressing_id,
        artist_id=artist_id,
        uncredited=uncredited,
        detail=detail if isinstance(detail, dict) else None,
        strict=True,
    )
    return _entry_for_catalog(db, user_id, catalog, body)


def create_from_provider(db: Session, user_id: int, body: dict) -> tuple[UserEntry, bool]:
    """Save the person's row first. Canonical fields come from detail, not the browser."""
    from apps.media.backend.services import providers
    from apps.server.database import release_for_provider_io

    source = choice(body.get("source"), SOURCES - {"manual"}, "Source")
    source_id = clean_text(body.get("source_id"), 120, "Provider id", required=True)
    kind = choice(body.get("kind"), KINDS, "Media type")
    if source not in providers.sources_for_kind(kind):
        fail("That source does not cover this type.")
    title = clean_text(body.get("title"), 300, "Title", required=True)
    if source == "musicbrainz" and kind == "album" and providers.mbid(source_id):
        return _save_musicbrainz_album(db, user_id, body, source_id, title)
    catalog = _catalog_by_source(db, source, source_id)
    if catalog is not None and catalog.kind != kind:
        fail("That provider id is already a different type.")
    detail = None
    if catalog is None or _metadata_pending(catalog):
        release_for_provider_io(db)
        detail = providers.lookup_detail(source, kind, source_id)
    if catalog is None:
        catalog = _new_pending_catalog(db, kind, title, source, source_id)
    if detail is not None and _detail_matches(detail, source, kind, source_id):
        _apply_authoritative(db, catalog, detail)
    return _entry_for_catalog(db, user_id, catalog, body)


# One explicit refresh may repair only a page of albums, and only until this deadline.
# The cap is the bound: a caller cannot turn the command back into a full-history scan.
_REPAIR_BATCH = 8
_REPAIR_DEADLINE_SECONDS = 2.0


class _AlbumRepair(NamedTuple):
    catalog_id: int
    source_id: str
    title: str
    action: str
    group_id: str | None
    pressing_id: str | None
    artist_id: str | None
    uncredited: bool


def _repair_limit(batch_limit: int) -> int:
    if isinstance(batch_limit, bool) or not isinstance(batch_limit, int) or batch_limit < 1:
        return 1
    return min(batch_limit, _REPAIR_BATCH)


def _repair_deadline(deadline_seconds: float) -> float:
    if isinstance(deadline_seconds, bool) or not isinstance(deadline_seconds, (int, float)):
        return _REPAIR_DEADLINE_SECONDS
    if deadline_seconds < 0:
        return _REPAIR_DEADLINE_SECONDS
    return float(deadline_seconds)


def _repair_ids(catalog_ids: Sequence[object]) -> list[int]:
    chosen: list[int] = []
    seen: set[int] = set()
    for item_id in catalog_ids:
        if isinstance(item_id, bool) or not isinstance(item_id, int) or item_id in seen:
            continue
        seen.add(item_id)
        chosen.append(item_id)
    return chosen


def _repair_roster(db: Session, user_id: int, catalog_ids: list[int]) -> list[CatalogItem]:
    rows = (
        db.query(CatalogItem)
        .join(UserEntry, UserEntry.catalog_id == CatalogItem.id)
        .filter(
            UserEntry.user_id == user_id,
            CatalogItem.id.in_(catalog_ids),
            CatalogItem.kind == "album",
            CatalogItem.source == "musicbrainz",
            CatalogItem.source_id.is_not(None),
        )
        .all()
    )
    by_id = {row.id: row for row in rows}
    return [by_id[item_id] for item_id in catalog_ids if item_id in by_id]


def _repair_candidate(catalog: CatalogItem) -> _AlbumRepair:
    from apps.media.backend.services.providers import mbid as mb

    extra = _extra(catalog)
    source_id = catalog.source_id or ""
    artist = mb(extra.get("artist_id"))
    if extra.get("identity_blocked") is True or _album_identity_resolved(catalog):
        return _AlbumRepair(catalog.id, source_id, catalog.title, "link", None, None, artist, False)
    group = mb(extra.get("release_group_id"))
    pressing = mb(extra.get("release_id"))
    uncredited = extra.get("artist_uncredited") is True
    if group and source_id != group:
        return _AlbumRepair(
            catalog.id,
            source_id,
            catalog.title,
            "stored",
            group,
            pressing or mb(source_id),
            artist,
            uncredited,
        )
    return _AlbumRepair(catalog.id, source_id, catalog.title, "lookup", None, None, None, False)


def _commit_album_repair(
    db: Session, user_id: int, candidate: _AlbumRepair, detail: dict | None
) -> str:
    """Write one album through the save path. Returns repaired, unresolved, linked, or skipped."""
    catalog = db.get(CatalogItem, candidate.catalog_id)
    if catalog is None or catalog.source_id != candidate.source_id:
        return "skipped"
    if candidate.action == "link":
        _link_saved_artists(db, user_id, catalog, candidate.artist_id)
        return "linked"
    fetched = detail if candidate.action == "lookup" else None
    if candidate.action == "lookup":
        if (
            not isinstance(fetched, dict)
            or fetched.get("source") != "musicbrainz"
            or fetched.get("kind") != "album"
        ):
            return "unresolved"
        group, pressing, artist, uncredited = _identity_from_detail(fetched, candidate.source_id)
        if not group:
            return "unresolved"
    else:
        group, pressing, artist, uncredited = (
            candidate.group_id,
            candidate.pressing_id,
            candidate.artist_id,
            candidate.uncredited,
        )
        fetched = None
        if not group:
            return "unresolved"
    claimed = _place_musicbrainz_album(
        db,
        user_id,
        title=catalog.title,
        requested_id=candidate.source_id,
        requested_row=None if catalog.source_id == group else catalog,
        group_id=group,
        pressing_id=pressing,
        artist_id=artist,
        uncredited=uncredited,
        detail=fetched,
        strict=False,
    )
    if _album_identity_resolved(claimed):
        return "repaired"
    return "unresolved"


def repair_musicbrainz_albums(
    db: Session,
    user_id: int,
    catalog_ids: Sequence[object],
    *,
    batch_limit: int = 1,
    deadline_seconds: float = _REPAIR_DEADLINE_SECONDS,
    details: dict[int, dict] | None = None,
    clock: Callable[[], float] | None = None,
) -> dict[str, Any]:
    """Repair release-group identity for the given saved albums.

    The caller lists catalog ids. At most eight are examined, and provider
    lookups stop when ``deadline_seconds`` has elapsed. Lookups run only after
    the open transaction is committed. Identity writes start after those lookups
    return, through ``_place_musicbrainz_album``. A lookup exception writes
    nothing. A later retry is safe: resolved albums are not looked up again,
    and each owner's notes, ratings, and membership stay on that owner's row.
    """
    from apps.media.backend.services import providers
    from apps.server.database import release_for_provider_io

    requested = _repair_ids(catalog_ids)
    if not requested:
        return {
            "examined": 0,
            "processed": 0,
            "lookups": 0,
            "repaired": 0,
            "unresolved": [],
            "remaining": 0,
            "stopped": "done",
        }
    limit = _repair_limit(batch_limit)
    deadline = _repair_deadline(deadline_seconds)
    now = clock or time.monotonic
    started = now()
    supplied = details or {}
    owned = _repair_roster(db, user_id, requested)
    chosen = owned[:limit]
    beyond = owned[limit:]
    candidates = [_repair_candidate(row) for row in chosen]
    staged: list[tuple[_AlbumRepair, dict | None]] = []
    lookups = 0
    released = False
    for candidate in candidates:
        if now() - started >= deadline:
            break
        detail = supplied.get(candidate.catalog_id)
        if candidate.action == "lookup" and not isinstance(detail, dict):
            if not released:
                release_for_provider_io(db)
                released = True
            lookups += 1
            detail = providers.lookup_detail("musicbrainz", "album", candidate.source_id)
        staged.append((candidate, detail if isinstance(detail, dict) else None))
    repaired = 0
    unresolved: list[int] = []
    for candidate, detail in staged:
        outcome = _commit_album_repair(db, user_id, candidate, detail)
        if outcome == "repaired":
            repaired += 1
        elif outcome == "unresolved":
            unresolved.append(candidate.catalog_id)
    remaining = len(chosen) - len(staged) + len(beyond)
    if len(staged) < len(chosen):
        stopped = "deadline"
    elif beyond:
        stopped = "batch"
    else:
        stopped = "done"
    return {
        "examined": len(chosen),
        "processed": len(staged),
        "lookups": lookups,
        "repaired": repaired,
        "unresolved": unresolved,
        "remaining": remaining,
        "stopped": stopped,
    }


def _entry_on_release_group(db: Session, user_id: int, detail: dict) -> UserEntry | None:
    from apps.media.backend.services.providers import mbid as mb

    extra = detail.get("extra")
    if not isinstance(extra, dict):
        return None
    group = mb(extra.get("release_group_id"))
    if not group:
        return None
    catalog = _catalog_by_source(db, "musicbrainz", group)
    if catalog is None:
        return None
    return (
        db.query(UserEntry)
        .filter(UserEntry.user_id == user_id, UserEntry.catalog_id == catalog.id)
        .one_or_none()
    )


def finish_album_refresh(db: Session, entry: UserEntry, detail: dict) -> UserEntry:
    """Place one refreshed album, then fill blank shared fields.

    The saved row stays metadata-pending when the release group is still unknown.
    A merge keeps the caller's surviving entry, including when the pressing row
    is folded into a release group this person already saved.
    """
    user_id = entry.user_id
    entry_id = entry.id
    catalog_id = entry.catalog_id
    repair_musicbrainz_albums(
        db,
        user_id,
        [catalog_id],
        batch_limit=1,
        deadline_seconds=_REPAIR_DEADLINE_SECONDS,
        details={catalog_id: detail},
    )
    survivor = db.query(UserEntry).filter(UserEntry.id == entry_id).one_or_none()
    if survivor is None:
        survivor = _entry_on_release_group(db, user_id, detail)
    if survivor is None:
        fail_missing()
    catalog = survivor.catalog
    resolved = _album_identity_resolved(catalog)
    _apply_authoritative(db, catalog, detail)
    if not resolved:
        extra = _extra(catalog)
        extra["metadata_pending"] = True
        _save_extra(catalog, extra)
    return survivor


def save_discovered(
    db: Session, user_id: int, artist: UserEntry, body: dict
) -> tuple[UserEntry, bool]:
    """Save one album or song from a discography browse. Does not save the other."""
    if artist.catalog.kind != "artist":
        fail("Discography is for a saved artist.")
    kind = choice(body.get("kind"), {"album", "track"}, "Media type")
    source_id = clean_text(body.get("source_id"), 120, "Provider id", required=True)
    title = clean_text(body.get("title"), 300, "Title", required=True)
    creator = clean_text(body.get("creator"), 300, "Creator") or artist.catalog.title
    year = _year(body.get("year"))
    raw_extra = body.get("extra")
    extra = raw_extra if isinstance(raw_extra, dict) else {}
    album_title = clean_text(body.get("album_title"), 300, "Album")
    if kind == "track" and album_title and not extra.get("album"):
        extra = {**extra, "album": album_title}
    entry, already = create_from_provider(
        db,
        user_id,
        {
            "source": "musicbrainz",
            "source_id": source_id,
            "kind": kind,
            "title": title,
            "creator": creator,
            "year": year,
            "artwork_url": body.get("artwork_url"),
            "status": body.get("status") or "want",
            "extra": extra,
        },
    )
    if kind == "album":
        _ensure_link(
            db,
            artist.catalog_id,
            entry.catalog_id,
            "artist-release-group",
            _next_position(db, artist.catalog_id, _ALBUM_RELATIONS),
            artist.catalog.title,
        )
        return entry, already
    album_source = clean_text(body.get("album_source_id"), 120, "Album id")
    if album_source:
        album = _public_catalog(
            db,
            kind="album",
            source="musicbrainz",
            source_id=album_source,
            title=album_title or "Untitled",
            creator=creator,
            year=year,
            artwork=None,
        )
        _ensure_link(
            db,
            artist.catalog_id,
            album.id,
            "artist-release-group",
            _next_position(db, artist.catalog_id, _ALBUM_RELATIONS),
            artist.catalog.title,
        )
        raw_position = body.get("position")
        if isinstance(raw_position, bool) or not isinstance(raw_position, int) or raw_position < 1:
            position = _next_position(db, album.id, _TRACK_RELATIONS)
        else:
            position = raw_position
        _ensure_link(
            db,
            album.id,
            entry.catalog_id,
            "release-group-recording",
            position,
        )
    return entry, already


def normalize_ratings(value) -> list:
    if not isinstance(value, list):
        return []
    cleaned = []
    for item in value:
        if not isinstance(item, dict):
            continue
        label = clean_text(item.get("label") or item.get("provider"), 40, "Rating label")
        if not label or item.get("value") is None:
            continue
        try:
            number = float(item["value"])
        except (TypeError, ValueError):
            continue
        cleaned.append(
            {
                "provider": clean_text(item.get("provider"), 40, "Provider") or label,
                "label": label,
                "value": number,
                "scale": clean_text(item.get("scale"), 20, "Scale") or "",
                "votes": item.get("votes") if isinstance(item.get("votes"), int) else None,
            }
        )
    return cleaned


def personal_status(kind: str, body: dict) -> str:
    if kind == "artist":
        if body.get("anticipated"):
            fail("Artists are followed, not anticipating.")
        return choice(body.get("status"), ARTIST_STATUSES, "Status", "following")
    return choice(
        body.get("status"),
        STATUSES,
        "Status",
        "anticipating" if body.get("anticipated") else "want",
    )


def new_entry(db: Session, user_id: int, catalog: CatalogItem, body: dict) -> UserEntry:
    status = personal_status(catalog.kind, body)
    entry = UserEntry(
        user_id=user_id,
        catalog_id=catalog.id,
        status=status,
        rating=rating_value(body.get("rating")) if "rating" in body else None,
        review=clean_text(body.get("review"), 20000, "Review"),
        summary=clean_text(body.get("summary"), 400, "Summary"),
        favorite=bool(body.get("favorite")),
        anticipated=False
        if catalog.kind == "artist"
        else bool(body.get("anticipated")) or status == "anticipating",
        progress_value=progress_number(body.get("progress_value")),
        progress_unit=choice(body.get("progress_unit"), PROGRESS_UNITS, "Progress unit", None)
        if body.get("progress_unit")
        else None,
    )
    if catalog.kind == "artist":
        entry.followed = status == "following"
        entry.follow_provenance = "explicit"
    if entry.review:
        entry.review_updated_at = utc_now()
    if (
        entry.progress_unit == "percent"
        and entry.progress_value is not None
        and not 0 <= entry.progress_value <= 100
    ):
        fail("Percent progress is between 0 and 100.")
    db.add(entry)
    db.flush()
    return entry


def number_or_none(value, field: str) -> float | None:
    if value is None or value == "":
        return None
    try:
        number = float(value)
    except (TypeError, ValueError):
        fail(f"{field} must be a number.")
    if isinstance(number, float) and not math.isfinite(number):
        fail(f"{field} must be a number.")
    return number


def progress_number(value) -> float | None:
    number = number_or_none(value, "Progress")
    if number is not None and number < 0:
        fail("Progress must be zero or more.")
    return number


_REVIEW_KEYS = {"review", "review_base"}


def assert_review_base(entry: UserEntry, body: dict) -> None:
    """409 when a note save started from a review the server no longer has.

    An identical review, and nothing else, is a no-op success: a client can
    time out after the server stored the note, then retry with the base it
    started from. Other fields in the same body are still checked against
    that base, so a stale note cannot ride along with a status change.
    """
    if "review" not in body or "review_base" not in body:
        return
    same_review = clean_text(body.get("review"), 20000, "Review") == entry.review
    other_fields = any(key not in _REVIEW_KEYS for key in body)
    if same_review and not other_fields:
        return
    current = iso(entry.review_updated_at) or ""
    incoming = body.get("review_base")
    if ("" if incoming is None else str(incoming)) != current:
        raise HTTPException(status_code=409, detail="This note changed in another tab.")


def _entry_snapshot(entry: UserEntry) -> tuple:
    catalog = entry.catalog
    return (
        entry.status,
        entry.rating,
        entry.review,
        entry.summary,
        entry.tags,
        bool(entry.favorite),
        bool(entry.anticipated),
        entry.progress_value,
        entry.progress_unit,
        catalog.title,
        catalog.creator,
        catalog.year,
        catalog.overview,
        catalog.artwork_url,
    )


def patch_entry(db: Session, entry: UserEntry, body: dict) -> UserEntry:
    assert_review_base(entry, body)
    before = _entry_snapshot(entry)
    before_review = entry.review
    records_release = any(
        key in body for key in ("release_on", "release_precision", "release_status", "releases")
    )
    if "status" in body:
        if entry.catalog.kind == "artist":
            state = choice(body.get("status"), ARTIST_STATUSES, "Status")
            entry.status = state
            entry.followed = state == "following"
            if not str(entry.follow_provenance or "").startswith("legacy:"):
                entry.follow_provenance = "explicit"
        else:
            entry.status = choice(body.get("status"), STATUSES, "Status")
    if "rating" in body:
        entry.rating = rating_value(body.get("rating"))
    if "review" in body:
        entry.review = clean_text(body.get("review"), 20000, "Review")
    if "summary" in body:
        entry.summary = clean_text(body.get("summary"), 400, "Summary")
    if "tags" in body:
        tags = body.get("tags")
        if tags is None:
            entry.tags = None
        elif not isinstance(tags, list) or any(not isinstance(tag, str) for tag in tags):
            fail("Tags must be a list of words.")
        else:
            entry.tags = dumps([tag.strip() for tag in tags if tag.strip()][:20])
    if "favorite" in body:
        entry.favorite = bool(body.get("favorite"))
    if "anticipated" in body:
        if entry.catalog.kind == "artist":
            if body.get("anticipated"):
                fail("Artists are followed, not anticipating.")
            entry.anticipated = False
        else:
            entry.anticipated = bool(body.get("anticipated"))
    if "progress_value" in body:
        entry.progress_value = progress_number(body.get("progress_value"))
    if "progress_unit" in body:
        entry.progress_unit = (
            choice(body.get("progress_unit"), PROGRESS_UNITS, "Progress unit")
            if body.get("progress_unit")
            else None
        )
    if (
        entry.progress_unit == "percent"
        and entry.progress_value is not None
        and not 0 <= entry.progress_value <= 100
    ):
        fail("Percent progress is between 0 and 100.")
    if entry.review != before_review:
        entry.review_updated_at = utc_now()
    fill_only = entry.catalog.source != "manual"
    apply_catalog_fields(
        entry.catalog,
        {
            key: body[key]
            for key in ("title", "creator", "year", "overview", "artwork_url")
            if key in body
        },
        fill_blanks_only=fill_only,
    )
    store_release(db, entry.catalog, body)
    if _entry_snapshot(entry) != before or records_release:
        entry.updated_at = utc_now()
    db.flush()
    return entry


def _artist_followed_filter(followed: bool):
    is_followed = or_(
        UserEntry.followed.is_(True),
        and_(
            UserEntry.followed.is_(None),
            UserEntry.status.notin_(("dropped", "unfollowed")),
        ),
    )
    return is_followed if followed else ~is_followed


def list_library(
    db: Session,
    user_id: int,
    kind: str | None,
    status: str | None,
    query: str | None,
    sort: str,
    offset: int = 0,
    limit: int = 50,
    favorite: bool = False,
    tags: list[str] | None = None,
) -> tuple[list[UserEntry], int]:
    rows = db.query(UserEntry).join(CatalogItem).filter(UserEntry.user_id == user_id)
    if favorite:
        rows = rows.filter(UserEntry.favorite.is_(True))
    if kind:
        rows = rows.filter(CatalogItem.kind == choice(kind, KINDS, "Media type"))
    if status:
        if status in ARTIST_STATUSES:
            if kind and kind != "artist":
                return [], 0
            rows = rows.filter(
                CatalogItem.kind == "artist",
                _artist_followed_filter(status == "following"),
            )
        elif status in STATUSES:
            if kind == "artist":
                return [], 0
            rows = rows.filter(CatalogItem.kind != "artist", UserEntry.status == status)
        else:
            choice(status, STATUSES, "Status")
    if query:
        like = f"%{query.strip()}%"
        rows = rows.filter(or_(CatalogItem.title.ilike(like), CatalogItem.creator.ilike(like)))
    if tags:
        from apps.media.backend.services.tag_filter import tags_clause

        rows = rows.filter(tags_clause(tags, db))
    total = rows.count()
    title = CatalogItem.title_sort
    if sort == "rating":
        rows = rows.order_by(
            UserEntry.rating.is_(None), UserEntry.rating.desc(), title, UserEntry.id
        )
    elif sort == "release":
        rows = rows.order_by(
            CatalogItem.year.is_(None), CatalogItem.year.desc(), title, UserEntry.id
        )
    elif sort == "added":
        rows = rows.order_by(UserEntry.created_at.desc(), UserEntry.id.desc())
    elif sort == "title":
        rows = rows.order_by(title, UserEntry.id)
    else:
        rows = rows.order_by(UserEntry.updated_at.desc(), UserEntry.id.desc())
    # Apply the window in SQL before materializing catalog rows or computing cards.
    found = rows.options(contains_eager(UserEntry.catalog)).offset(offset).limit(limit).all()
    return list(found), total


def episode_state(db: Session, user_id: int, catalog: CatalogItem) -> dict:
    episodes = (
        db.query(Episode)
        .filter(Episode.catalog_id == catalog.id)
        .order_by(Episode.season_number, Episode.episode_number)
        .all()
    )
    progress = {
        row.episode_id: row
        for row in db.query(EpisodeProgress).filter(
            EpisodeProgress.user_id == user_id,
            EpisodeProgress.episode_id.in_([ep.id for ep in episodes] or [-1]),
        )
    }
    current = today()
    serialized: list[dict] = []
    next_episode = None
    upcoming = []
    for episode in episodes:
        mark = progress.get(episode.id)
        watched = bool(mark and mark.watched)
        released = episode.air_date is not None and episode.air_date <= current
        item = {
            "id": episode.id,
            "season_number": episode.season_number,
            "episode_number": episode.episode_number,
            "title": episode.title,
            "air_date": iso(episode.air_date),
            "overview": episode.overview,
            "watched": watched,
            "watched_on": iso(mark.watched_on) if mark else None,
            "released": released,
        }
        serialized.append(item)
        if not watched and released and episode.season_number > 0 and next_episode is None:
            next_episode = item
        if (
            not watched
            and episode.season_number > 0
            and episode.air_date
            and episode.air_date > current
        ):
            upcoming.append(item)
    watched_count = sum(1 for item in serialized if item["watched"])
    entry = (
        db.query(UserEntry)
        .filter(UserEntry.user_id == user_id, UserEntry.catalog_id == catalog.id)
        .one_or_none()
    )
    return {
        "episodes": serialized,
        "watched_count": watched_count,
        "episode_count": len(serialized),
        "next_episode": next_episode,
        "upcoming_episodes": upcoming[:4],
        "caught_up": any(item["released"] and item["season_number"] > 0 for item in serialized)
        and not any(item["air_date"] is None and item["season_number"] > 0 for item in serialized)
        and next_episode is None,
        "metadata_incomplete": not serialized
        or any(item["air_date"] is None for item in serialized if item["season_number"] > 0),
        "seasons": season_views(db, user_id, entry.id if entry is not None else None, episodes),
    }


def season_views(
    db: Session, user_id: int, entry_id: int | None, episodes: list[Episode]
) -> list[dict]:
    counts: dict[int, int] = {}
    for episode in episodes:
        counts[episode.season_number] = counts.get(episode.season_number, 0) + 1
    progress: dict[int, SeasonProgress] = {}
    if entry_id is not None:
        rows = db.query(SeasonProgress).filter(
            SeasonProgress.user_id == user_id,
            SeasonProgress.entry_id == entry_id,
        )
        progress = {row.season_number: row for row in rows}
    views = []
    marks = {
        mark.episode_id: mark
        for mark in db.query(EpisodeProgress).filter(
            EpisodeProgress.user_id == user_id,
            EpisodeProgress.episode_id.in_([episode.id for episode in episodes]),
        )
    }
    for number in sorted(set(counts) | set(progress)):
        row = progress.get(number)
        known = [episode for episode in episodes if episode.season_number == number]
        manual = not known or any(episode.air_date is None for episode in known)
        views.append(
            {
                "season_number": number,
                "episode_count": counts.get(number, 0),
                "watched": all(
                    bool(marks.get(episode.id) and marks[episode.id].watched) for episode in known
                )
                if known and not manual
                else bool(row.watched)
                if row is not None
                else False,
                "manual": manual,
                "rating": None if row is None else row.rating,
            }
        )
    return views


def save_season(db: Session, entry: UserEntry, body: dict) -> None:
    if entry.catalog.kind != "tv":
        fail("Seasons belong on a show.")
    if any(key in body for key in ("notes", "review", "summary", "description")):
        fail("A season does not have its own description. The show review is the overall opinion.")
    number = season_number(body.get("season_number"))
    row = (
        db.query(SeasonProgress)
        .filter(
            SeasonProgress.user_id == entry.user_id,
            SeasonProgress.entry_id == entry.id,
            SeasonProgress.season_number == number,
        )
        .one_or_none()
    )
    if "watched" in body:
        watched = watched_flag(body.get("watched"))
    else:
        watched = bool(row.watched) if row is not None else False
    if "rating" in body:
        rating = rating_value(body.get("rating"))
    else:
        rating = None if row is None else row.rating
    if "watched" in body:
        episodes = (
            db.query(Episode)
            .filter(Episode.catalog_id == entry.catalog_id, Episode.season_number == number)
            .all()
        )
        for episode in episodes:
            if episode.air_date is None:
                continue
            if watched and (episode.air_date is None or episode.air_date > today()):
                continue
            mark = (
                db.query(EpisodeProgress)
                .filter(
                    EpisodeProgress.user_id == entry.user_id,
                    EpisodeProgress.episode_id == episode.id,
                )
                .one_or_none()
            )
            if watched and mark is not None and mark.watched:
                continue
            mark_watched(db, entry.user_id, episode, watched, today() if watched else None)
    if not watched and rating is None:
        if row is not None:
            db.delete(row)
            entry.updated_at = utc_now()
            db.flush()
        return
    if row is None:
        row = SeasonProgress(user_id=entry.user_id, entry_id=entry.id, season_number=number)
        db.add(row)
    row.watched = watched
    row.rating = rating
    entry.updated_at = utc_now()
    db.flush()


def watched_values(watched: bool, watched_on: date | None) -> dict[Any, Any]:
    """Columns a watched edit writes. Personal edits clear operation_token."""
    return {
        "watched": watched,
        "watched_on": watched_on if watched else None,
        "operation_token": None,
    }


def mark_watched(
    db: Session, user_id: int, episode: Episode, watched: bool, watched_on: date | None
) -> None:
    if watched and not is_released(episode.air_date, today()):
        fail("This episode has not aired yet.")
    row = (
        db.query(EpisodeProgress)
        .filter(EpisodeProgress.user_id == user_id, EpisodeProgress.episode_id == episode.id)
        .one_or_none()
    )
    if row is None:
        row = EpisodeProgress(user_id=user_id, episode_id=episode.id)
        db.add(row)
    for column, value in watched_values(watched, watched_on).items():
        setattr(row, column, value)
    db.flush()


def store_collaborators(catalog: CatalogItem, rows) -> list[dict]:
    clean = []
    for row in rows or []:
        if not isinstance(row, dict) or not isinstance(row.get("name"), str):
            continue
        clean.append(
            {
                "source_id": row.get("source_id")
                if isinstance(row.get("source_id"), str)
                else None,
                "name": row["name"][:200],
                "relation": str(row.get("relation") or "collaboration")[:40],
            }
        )
    extra = _extra(catalog)
    extra["collaborators"] = clean[:16]
    _save_extra(catalog, extra)
    return extra["collaborators"]


def cached_collaborators(catalog: CatalogItem):
    extra = _extra(catalog)
    rows = extra.get("collaborators") if "collaborators" in extra else None
    return rows if isinstance(rows, list) else None


def _extra(catalog: CatalogItem) -> dict:
    extra = loads(catalog.extra, {})
    return extra if isinstance(extra, dict) else {}


def _save_extra(catalog: CatalogItem, extra: dict) -> None:
    catalog.extra = dumps(extra)
    catalog.updated_at = utc_now()


def _year(value) -> int | None:
    if value in (None, ""):
        return None
    try:
        year = int(value)
    except (TypeError, ValueError):
        fail("Year must be a number from 1000 to 3000.")
    if year < 1000 or year > 3000:
        fail("Year must be a number from 1000 to 3000.")
    return year


def _manual_catalog(
    db: Session,
    *,
    kind: str,
    title: str,
    creator: str | None,
    year: int | None = None,
    artwork: str | None = None,
    extra: dict | None = None,
) -> CatalogItem:
    row = CatalogItem(
        kind=kind,
        title=title,
        creator=creator,
        year=year,
        artwork_url=artwork,
        source="manual",
        genres=dumps([]),
        extra=dumps(extra or {}),
        external_ratings=dumps([]),
    )
    db.add(row)
    db.flush()
    return row


def _public_catalog(
    db: Session,
    *,
    kind: str,
    source: str,
    source_id: str,
    title: str,
    creator: str | None,
    year: int | None,
    artwork: str | None,
) -> CatalogItem:
    """A public album row so a saved song can name its release. Not a membership."""
    row = _catalog_by_source(db, source, source_id)
    if row is not None:
        if row.kind != kind:
            fail("That provider id is already a different type.")
        return row
    row = CatalogItem(
        kind=kind,
        title=title,
        creator=creator,
        year=year,
        artwork_url=artwork,
        source=source,
        source_id=source_id,
        genres=dumps([]),
        extra=dumps({}),
        external_ratings=dumps([]),
    )
    db.add(row)
    db.flush()
    return row


def _next_position(db: Session, parent_catalog_id: int, relations: tuple[str, ...]) -> int:
    positions = [
        row[0]
        for row in db.query(MusicLink.position)
        .filter(
            MusicLink.parent_catalog_id == parent_catalog_id,
            MusicLink.relation.in_(relations),
        )
        .all()
    ]
    return (max(positions) + 1) if positions else 1


def _link_child(
    db: Session,
    parent_catalog_id: int,
    child_catalog_id: int,
    relation: str,
    position: int,
    credit: str | None = None,
) -> MusicLink:
    link = MusicLink(
        parent_catalog_id=parent_catalog_id,
        child_catalog_id=child_catalog_id,
        relation=relation,
        namespace="manual",
        position=position,
        credit=credit,
        provenance="explicit-save",
    )
    db.add(link)
    db.flush()
    return link


def _ensure_link(
    db: Session,
    parent_catalog_id: int,
    child_catalog_id: int,
    relation: str,
    position: int,
    credit: str | None = None,
) -> MusicLink:
    found = (
        db.query(MusicLink)
        .filter(
            MusicLink.parent_catalog_id == parent_catalog_id,
            MusicLink.child_catalog_id == child_catalog_id,
            MusicLink.relation == relation,
        )
        .one_or_none()
    )
    if found is not None:
        return found
    return _link_child(db, parent_catalog_id, child_catalog_id, relation, position, credit)


def _album_memberships(db: Session, entry: UserEntry) -> list[tuple[UserEntry, MusicLink]]:
    rows = (
        db.query(UserEntry, MusicLink)
        .join(MusicLink, MusicLink.child_catalog_id == UserEntry.catalog_id)
        .filter(
            UserEntry.user_id == entry.user_id,
            MusicLink.parent_catalog_id == entry.catalog_id,
            MusicLink.relation.in_(_ALBUM_RELATIONS),
        )
        .all()
    )
    found: dict[int, tuple[UserEntry, MusicLink]] = {}
    for child, link in rows:
        if child.catalog.kind == "album":
            found.setdefault(child.id, (child, link))
    ordered = list(found.values())
    ordered.sort(
        key=lambda pair: (
            pair[0].catalog.year is None,
            pair[0].catalog.year or 0,
            pair[0].catalog.title.casefold(),
            pair[0].id,
        )
    )
    return ordered


def _track_memberships(
    db: Session, user_id: int, album_catalog_ids: list[int]
) -> list[tuple[UserEntry, MusicLink]]:
    if not album_catalog_ids:
        return []
    rows = (
        db.query(UserEntry, MusicLink)
        .join(MusicLink, MusicLink.child_catalog_id == UserEntry.catalog_id)
        .filter(
            UserEntry.user_id == user_id,
            MusicLink.parent_catalog_id.in_(album_catalog_ids),
            MusicLink.relation.in_(_TRACK_RELATIONS),
        )
        .all()
    )
    found: dict[int, tuple[UserEntry, MusicLink]] = {}
    for child, link in rows:
        if child.catalog.kind == "track":
            found.setdefault(child.id, (child, link))
    ordered = list(found.values())
    ordered.sort(key=lambda pair: (pair[1].position, pair[0].catalog.title.casefold(), pair[0].id))
    return ordered


def _linked_album_ids(db: Session, entry: UserEntry) -> list[int]:
    rows = (
        db.query(MusicLink.child_catalog_id)
        .filter(
            MusicLink.parent_catalog_id == entry.catalog_id,
            MusicLink.relation.in_(_ALBUM_RELATIONS),
        )
        .all()
    )
    return list(dict.fromkeys(row[0] for row in rows))


def _saved_album(db: Session, entry: UserEntry, album_id: int) -> UserEntry:
    album = db.get(UserEntry, album_id)
    if album is None or album.user_id != entry.user_id or album.catalog.kind != "album":
        fail_missing()
    if entry.catalog.kind == "album":
        if album.id != entry.id:
            fail_missing()
        return album
    if entry.catalog.kind != "artist":
        fail("Albums belong on an artist.")
    linked = (
        db.query(MusicLink.id)
        .filter(
            MusicLink.parent_catalog_id == entry.catalog_id,
            MusicLink.child_catalog_id == album.catalog_id,
            MusicLink.relation.in_(_ALBUM_RELATIONS),
        )
        .first()
    )
    if linked is None:
        fail_missing()
    return album


def add_album(db: Session, entry: UserEntry, body: dict) -> None:
    if entry.catalog.kind != "artist":
        fail("Albums belong on an artist.")
    title = clean_text(body.get("title"), 300, "Album", required=True)
    catalog = _manual_catalog(
        db,
        kind="album",
        title=title,
        creator=entry.catalog.title,
        year=_year(body.get("year")),
        artwork=http_url(body.get("artwork_url")) if body.get("artwork_url") else None,
    )
    new_entry(db, entry.user_id, catalog, {"status": "want"})
    _link_child(
        db,
        entry.catalog_id,
        catalog.id,
        "artist-album",
        _next_position(db, entry.catalog_id, _ALBUM_RELATIONS),
        entry.catalog.title,
    )


def add_track(db: Session, entry: UserEntry, album_id: int, body: dict) -> None:
    album = _saved_album(db, entry, album_id)
    title = clean_text(body.get("title"), 300, "Song", required=True)
    catalog = _manual_catalog(
        db,
        kind="track",
        title=title,
        creator=album.catalog.creator or entry.catalog.title,
        extra={"album": album.catalog.title},
    )
    new_entry(db, entry.user_id, catalog, {"status": "want"})
    _link_child(
        db,
        album.catalog_id,
        catalog.id,
        "album-recording",
        _next_position(db, album.catalog_id, _TRACK_RELATIONS),
    )


def save_album_rating(db: Session, entry: UserEntry, album_id: int, body: dict) -> None:
    if entry.catalog.kind != "artist":
        fail("Albums belong on an artist.")
    album = _saved_album(db, entry, album_id)
    if "rating" not in body:
        fail("Rating is required.")
    album.rating = rating_value(body.get("rating"))
    album.updated_at = utc_now()
    db.flush()


def save_track_rating(db: Session, entry: UserEntry, track_id: int, body: dict) -> None:
    if entry.catalog.kind not in {"artist", "album"}:
        fail("Songs belong on an artist or an album.")
    track = db.get(UserEntry, track_id)
    if track is None or track.user_id != entry.user_id or track.catalog.kind != "track":
        fail_missing()
    if entry.catalog.kind == "album":
        parents = [entry.catalog_id]
    else:
        parents = [album.catalog_id for album, _link in _album_memberships(db, entry)]
    linked = (
        db.query(MusicLink.id)
        .filter(
            MusicLink.parent_catalog_id.in_(parents or [-1]),
            MusicLink.child_catalog_id == track.catalog_id,
            MusicLink.relation.in_(_TRACK_RELATIONS),
        )
        .first()
    )
    if linked is None:
        fail_missing()
    if "rating" not in body:
        fail("Rating is required.")
    track.rating = rating_value(body.get("rating"))
    track.updated_at = utc_now()
    db.flush()


def _track_payload(track: UserEntry, link: MusicLink) -> dict:
    return {
        "id": track.id,
        "title": track.catalog.title,
        "position": link.position,
        "rating": track.rating,
    }


def _album_payload(album: UserEntry, tracks: list[dict]) -> dict:
    return {
        "id": album.id,
        "title": album.catalog.title,
        "year": album.catalog.year,
        "artwork_url": album.catalog.artwork_url,
        "rating": album.rating,
        "tracks": tracks,
    }


def music_state(db: Session, entry: UserEntry) -> dict:
    """Saved albums and songs only. Public metadata is not membership."""
    if entry.catalog.kind == "album":
        tracks = _track_memberships(db, entry.user_id, [entry.catalog_id])
        return {
            "partial": False,
            "saved_children": [entry_card(track) for track, _link in tracks],
            "albums": [
                _album_payload(entry, [_track_payload(track, link) for track, link in tracks])
            ],
        }
    albums = _album_memberships(db, entry)
    child_entries = {album.id: album for album, _link in albums}
    saved_album_ids = {album.catalog_id for album, _link in albums}
    grouped: dict[int, list] = {}
    songs: list[dict] = []
    seen_songs: set[int] = set()
    for track, link in _track_memberships(db, entry.user_id, _linked_album_ids(db, entry)):
        child_entries[track.id] = track
        if link.parent_catalog_id in saved_album_ids:
            grouped.setdefault(link.parent_catalog_id, []).append(_track_payload(track, link))
        elif track.id not in seen_songs:
            seen_songs.add(track.id)
            songs.append(_track_payload(track, link))
    return {
        "partial": False,
        "albums": [
            _album_payload(album, grouped.get(album.catalog_id, [])) for album, _link in albums
        ],
        "songs": songs,
        "saved_children": [entry_card(child) for child in child_entries.values()],
    }


def detail(db: Session, entry: UserEntry) -> dict:
    from apps.media.backend.services.metadata import lifecycle
    from apps.media.backend.services.portraits import attribution

    releases = db.query(Release).filter(Release.catalog_id == entry.catalog_id).all()
    show = episode_state(db, entry.user_id, entry.catalog) if entry.catalog.kind == "tv" else None
    return {
        **entry_card(entry),
        "catalog": catalog_dict(entry.catalog),
        "portrait": attribution(entry),
        "lifecycle": lifecycle(db, entry.catalog_id) if entry.catalog.kind == "tv" else None,
        "review": entry.review,
        "summary": entry.summary,
        "tags": loads(entry.tags, []),
        "progress_value": entry.progress_value,
        "progress_unit": entry.progress_unit,
        "created_at": iso(entry.created_at),
        "releases": [
            {
                "id": row.id,
                "region": row.region,
                "platform": row.platform,
                "released_on": iso(row.released_on),
                "precision": row.precision,
                "status": row.status,
                "note": row.note,
            }
            for row in releases
        ],
        "show": show,
        "music": music_state(db, entry) if entry.catalog.kind in {"artist", "album"} else None,
    }


def saved_source_ids(db: Session, user_id: int) -> dict[tuple[str, str], int]:
    rows = (
        db.query(CatalogItem.source, CatalogItem.source_id, UserEntry.id)
        .join(UserEntry, UserEntry.catalog_id == CatalogItem.id)
        .filter(UserEntry.user_id == user_id, CatalogItem.source_id.is_not(None))
        .all()
    )
    return {(source, source_id): entry_id for source, source_id, entry_id in rows}


def saved_artist_artwork(db: Session, user_id: int) -> dict[tuple[str, str], str]:
    rows = (
        db.query(CatalogItem.source, CatalogItem.source_id, UserEntry.portrait_url)
        .join(UserEntry, UserEntry.catalog_id == CatalogItem.id)
        .filter(
            UserEntry.user_id == user_id,
            CatalogItem.kind == "artist",
            UserEntry.portrait_url.is_not(None),
        )
        .all()
    )
    return {
        (source, identity): artwork for source, identity, artwork in rows if identity and artwork
    }
