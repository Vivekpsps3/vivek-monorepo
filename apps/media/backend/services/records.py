"""Personal library reads and writes. Metadata refreshes never touch reviews."""

import json
import math
import re
import time
from collections.abc import Callable, Sequence
from datetime import UTC, date, datetime
from typing import Any, NamedTuple, NoReturn

from fastapi import HTTPException
from sqlalchemy import and_, func, or_
from sqlalchemy.orm import Session, aliased, contains_eager, joinedload

from apps.media.backend.models import (
    CatalogItem,
    Episode,
    EpisodeProgress,
    Experience,
    MusicLink,
    Release,
    SeasonProgress,
    SeriesLifecycle,
    UserEntry,
    utc_now,
)
from apps.media.backend.services.clock import today
from apps.media.backend.services.textutil import excerpt
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
# A saved song that is not riding on a saved album. Still not a follow.
_DIRECT_TRACK = "artist-recording"
_MEMBER_ROLES = frozenset({"primary", "collaboration", "various"})
_CREDIT_ROLES = frozenset({"primary", "collaboration", "featured", "various"})


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


_AUTHOR_ID = re.compile(r"^openlibrary:OL[1-9]\d{0,12}A$")
_SERIES_ID = re.compile(r"^openlibrary:OL[1-9]\d{0,12}S$")


def _link_name(value: object) -> str | None:
    if not isinstance(value, str):
        return None
    text = " ".join(value.split())
    return text[:300] or None


def _book_identity(raw: object, pattern: re.Pattern[str]) -> dict | None:
    """A canonical Open Library id. A display name never becomes an id."""
    if not isinstance(raw, dict):
        return None
    ident = raw.get("id")
    if not isinstance(ident, str) or pattern.fullmatch(ident) is None:
        return None
    return {"id": ident, "name": _link_name(raw.get("name"))}


def _first_identity(raw: object, pattern: re.Pattern[str]) -> dict | None:
    rows = raw if isinstance(raw, list) else [raw] if isinstance(raw, dict) else []
    for item in rows:
        found = _book_identity(item, pattern)
        if found is not None:
            return found
    return None


def book_links(catalog: CatalogItem) -> dict:
    """Author and series links already stored on the catalog. This does not guess."""
    extra = loads(catalog.extra, {})
    if not isinstance(extra, dict):
        return {"author": None, "series": None}
    return {
        "author": _first_identity(extra.get("authors"), _AUTHOR_ID),
        "series": _first_identity(extra.get("series"), _SERIES_ID),
    }


def library_cards(db: Session, entries: list[UserEntry]) -> list[dict]:
    """Read only card facts for this page, without hydrating detail relationships."""
    from apps.media.backend.services.metadata import lifecycle_payload

    if not entries:
        return []
    user_id = entries[0].user_id
    shows = [entry.catalog_id for entry in entries if entry.catalog.kind == "tv"]
    artists = [entry.catalog_id for entry in entries if entry.catalog.kind == "artist"]
    movie_ids = [entry.id for entry in entries if entry.catalog.kind == "movie"]
    viewings = _recorded_viewings(db, user_id, movie_ids)
    progress = _library_show_progress(db, user_id, shows)
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
        if kind == "movie":
            card["viewed_on"] = viewings.get(entry.id)
        elif kind == "tv":
            card["lifecycle"] = lifecycle_payload(lifecycles.get(entry.catalog_id))
            card.update(progress.get(entry.catalog_id, _EMPTY_SHOW))
        elif kind == "artist":
            card["saved_count"] = counts.get(entry.catalog_id, 0)
        elif kind == "book":
            card.update(book_links(entry.catalog))
            card["note"] = excerpt(entry.review, 160) or None
        elif kind == "game":
            card["note"] = excerpt(entry.review, 160) or None
            card["unopened"] = game_unopened(entry)
        elif kind == "track":
            extra = loads(entry.catalog.extra, {})
            raw = (
                extra.get("album") or extra.get("album_title") if isinstance(extra, dict) else None
            )
            if isinstance(raw, str) and raw.strip():
                card["album"] = raw.strip()
        cards.append(card)
    groups = _page_artist_groups(db, user_id, entries)
    for card in cards:
        found = groups.get(card["id"])
        if found:
            card["artist_groups"] = found
    return cards


_EMPTY_SHOW = {
    "caught_up": False,
    "metadata_incomplete": True,
    "episode_count": 0,
    "watched_count": 0,
    "continuation": None,
}


def _recorded_viewings(db: Session, user_id: int, entry_ids: list[int]) -> dict[int, str]:
    """Latest user-recorded film date. completed_on is not a viewing date."""
    if not entry_ids:
        return {}
    rows = (
        db.query(Experience.entry_id, Experience.finished_on)
        .filter(
            Experience.user_id == user_id,
            Experience.entry_id.in_(entry_ids),
            Experience.kind == "watch",
            Experience.finished_on.is_not(None),
        )
        .all()
    )
    latest: dict[int, date] = {}
    for entry_id, finished in rows:
        if finished is None:
            continue
        current = latest.get(entry_id)
        if current is None or finished > current:
            latest[entry_id] = finished
    return {entry_id: finished.isoformat() for entry_id, finished in latest.items()}


def _library_show_progress(db: Session, user_id: int, catalog_ids: list[int]) -> dict[int, dict]:
    """Page-scoped episode facts. This is not a second progress store."""
    if not catalog_ids:
        return {}
    current = today()
    episodes = (
        db.query(Episode)
        .filter(Episode.catalog_id.in_(catalog_ids))
        .order_by(Episode.catalog_id, Episode.season_number, Episode.episode_number, Episode.id)
        .all()
    )
    ids = [episode.id for episode in episodes]
    watched: set[int] = set()
    if ids:
        watched = {
            row.episode_id
            for row in db.query(EpisodeProgress.episode_id)
            .filter(
                EpisodeProgress.user_id == user_id,
                EpisodeProgress.episode_id.in_(ids),
                EpisodeProgress.watched.is_(True),
            )
            .all()
        }
    grouped: dict[int, list[Episode]] = {catalog_id: [] for catalog_id in catalog_ids}
    for episode in episodes:
        grouped.setdefault(episode.catalog_id, []).append(episode)
    found: dict[int, dict] = {}
    for catalog_id, rows in grouped.items():
        regular = [episode for episode in rows if episode.season_number > 0]
        undated = any(episode.air_date is None for episode in regular)
        remaining = [
            episode
            for episode in regular
            if episode.air_date is not None
            and episode.air_date <= current
            and episode.id not in watched
        ]
        future = [
            episode
            for episode in regular
            if episode.air_date is not None
            and episode.air_date > current
            and episode.id not in watched
        ]
        aired = [
            episode
            for episode in regular
            if episode.air_date is not None and episode.air_date <= current
        ]
        chosen = remaining[0] if remaining else future[0] if future else None
        continuation = None
        if chosen is not None and chosen.air_date is not None:
            continuation = {
                "episode_id": chosen.id,
                "season": chosen.season_number,
                "episode": chosen.episode_number,
                "title": chosen.title,
                "air_date": iso(chosen.air_date),
                "state": "next" if chosen.air_date <= current else "upcoming",
            }
        found[catalog_id] = {
            "caught_up": bool(aired) and not undated and not remaining,
            "metadata_incomplete": not rows or undated,
            "episode_count": len(regular),
            "watched_count": sum(1 for episode in regular if episode.id in watched),
            "continuation": continuation,
        }
    return found


def _saved_child_ids(db: Session, user_id: int, artist_ids: list[int]) -> dict[int, set[int]]:
    """Distinct saved album and song entries under these artists. This user's rows only."""
    found: dict[int, set[int]] = {artist_id: set() for artist_id in artist_ids}
    if not artist_ids:
        return found
    albums = (
        db.query(MusicLink.parent_catalog_id, UserEntry.id)
        .join(UserEntry, UserEntry.catalog_id == MusicLink.child_catalog_id)
        .join(CatalogItem, CatalogItem.id == UserEntry.catalog_id)
        .filter(
            MusicLink.parent_catalog_id.in_(artist_ids),
            MusicLink.relation.in_(_ALBUM_RELATIONS),
            UserEntry.user_id == user_id,
            CatalogItem.kind == "album",
        )
    )
    track_link = aliased(MusicLink)
    through_albums = (
        db.query(MusicLink.parent_catalog_id, UserEntry.id)
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
    )
    direct = (
        db.query(MusicLink.parent_catalog_id, UserEntry.id)
        .join(UserEntry, UserEntry.catalog_id == MusicLink.child_catalog_id)
        .join(CatalogItem, CatalogItem.id == UserEntry.catalog_id)
        .filter(
            MusicLink.parent_catalog_id.in_(artist_ids),
            MusicLink.relation == _DIRECT_TRACK,
            UserEntry.user_id == user_id,
            CatalogItem.kind == "track",
        )
    )
    for parent_id, entry_id in albums.union_all(through_albums).union_all(direct).all():
        if parent_id in found:
            found[parent_id].add(entry_id)
    return found


def _saved_child_counts(db: Session, user_id: int, artist_ids: list[int]) -> dict[int, int]:
    return {
        artist_id: len(entry_ids)
        for artist_id, entry_ids in _saved_child_ids(db, user_id, artist_ids).items()
    }


def _saved_group_entries(db: Session, user_id: int, artist_id: int) -> list[UserEntry]:
    """This user's saved albums and songs under one artist, each entry once."""
    chosen = _saved_child_ids(db, user_id, [artist_id]).get(artist_id) or set()
    if not chosen:
        return []
    rows = db.query(UserEntry).filter(UserEntry.user_id == user_id, UserEntry.id.in_(chosen)).all()
    rows.sort(
        key=lambda entry: (
            0 if entry.catalog.kind == "album" else 1,
            entry.catalog.year is None,
            entry.catalog.year or 0,
            entry.catalog.title.casefold(),
            entry.id,
        )
    )
    return rows


def _page_artist_groups(
    db: Session, user_id: int, entries: list[UserEntry]
) -> dict[int, list[dict]]:
    """Artist summaries for albums and songs on this page. No query for other kinds."""
    targets = [entry for entry in entries if entry.catalog.kind in {"album", "track"}]
    if not targets:
        return {}
    catalog_ids = list({entry.catalog_id for entry in targets})
    link_rows = (
        db.query(
            MusicLink.child_catalog_id,
            MusicLink.parent_catalog_id,
            MusicLink.relation,
            MusicLink.position,
            MusicLink.id,
        )
        .filter(
            MusicLink.child_catalog_id.in_(catalog_ids),
            MusicLink.relation.in_((*_ALBUM_RELATIONS, _DIRECT_TRACK, *_TRACK_RELATIONS)),
        )
        .all()
    )
    album_ids = {
        parent
        for _child, parent, relation, _pos, _link in link_rows
        if relation in _TRACK_RELATIONS
    }
    album_rows = (
        db.query(
            MusicLink.child_catalog_id,
            MusicLink.parent_catalog_id,
            MusicLink.position,
            MusicLink.id,
        )
        .filter(
            MusicLink.child_catalog_id.in_(album_ids),
            MusicLink.relation.in_(_ALBUM_RELATIONS),
        )
        .all()
        if album_ids
        else []
    )
    artist_ids: set[int] = set()
    direct: dict[int, list[tuple[int, int, int]]] = {}
    for child, parent, relation, position, link_id in link_rows:
        if relation in _ALBUM_RELATIONS or relation == _DIRECT_TRACK:
            direct.setdefault(child, []).append((parent, position or 0, link_id))
            artist_ids.add(parent)
    via_album: dict[int, list[tuple[int, int, int]]] = {}
    for child, parent, position, link_id in album_rows:
        via_album.setdefault(child, []).append((parent, position or 0, link_id))
        artist_ids.add(parent)
    track_albums: dict[int, list[int]] = {}
    for child, parent, relation, _position, _link_id in link_rows:
        if relation in _TRACK_RELATIONS:
            track_albums.setdefault(child, []).append(parent)
    if not artist_ids:
        return {}
    artists = {
        row.id: row
        for row in db.query(CatalogItem)
        .filter(CatalogItem.id.in_(artist_ids), CatalogItem.kind == "artist")
        .all()
    }
    if not artists:
        return {}
    owned = {
        row.catalog_id: row
        for row in db.query(UserEntry)
        .filter(UserEntry.user_id == user_id, UserEntry.catalog_id.in_(list(artists)))
        .all()
    }
    counts = _saved_child_counts(db, user_id, list(artists))

    def summary(artist_id: int) -> dict:
        artist = artists[artist_id]
        entry = owned.get(artist_id)
        followed = entry is not None and artist_is_followed(entry)
        return {
            "catalog_id": artist.id,
            "title": artist.title,
            "followed": followed,
            "entry_id": None if entry is None else entry.id,
            "saved_count": counts.get(artist_id, 0),
        }

    grouped: dict[int, list[dict]] = {}
    for entry in targets:
        chosen: list[tuple[int, int, int]] = []
        if entry.catalog.kind == "album":
            chosen.extend(direct.get(entry.catalog_id, []))
        else:
            chosen.extend(item for item in direct.get(entry.catalog_id, []) if item[0] in artists)
            for album_id in track_albums.get(entry.catalog_id, []):
                chosen.extend(via_album.get(album_id, []))
        ordered: list[dict] = []
        seen: set[int] = set()
        chosen.sort(key=lambda item: (item[1], item[2]))
        for artist_id, _position, _link_id in chosen:
            if artist_id not in artists or artist_id in seen:
                continue
            seen.add(artist_id)
            ordered.append(summary(artist_id))
        if ordered:
            grouped[entry.id] = ordered
    return grouped


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


def game_unopened(entry: UserEntry) -> bool:
    """True when this membership has not started the game.

    Want or anticipating with no recorded progress is unopened. Any recorded
    value, or playing, paused, dropped, or played, is not. Another owner's
    row is never read.
    """
    if entry.progress_value is not None:
        return False
    return entry.status in {"want", "anticipating"}


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


def _identity_present(body: dict) -> bool:
    return body.get("artist_catalog_id") not in (None, "") or body.get("artist_identity") not in (
        None,
        "",
    )


def _artist_from_catalog_id(db: Session, user_id: int, raw) -> CatalogItem:
    if isinstance(raw, bool) or not isinstance(raw, int):
        fail("Artist is not a saved person.")
    row = db.get(CatalogItem, raw)
    if row is None or row.kind != "artist":
        fail("Artist is not a saved person.")
    if row.source in {"musicbrainz", "manual"} and row.source_id:
        return row
    owned = (
        db.query(UserEntry.id)
        .filter(UserEntry.user_id == user_id, UserEntry.catalog_id == row.id)
        .first()
    )
    if owned is None:
        fail("Artist is not a saved person.")
    return row


def _artist_from_identity(db: Session, raw, *, title: str, creator: str | None) -> CatalogItem:
    """A stable id, never the title or the display name, selects the person."""
    if not isinstance(raw, dict):
        fail("Artist identity must name a person, not a title.")
    source = raw.get("source")
    if source not in {"manual", "musicbrainz"}:
        fail("That artist source is not available.")
    source_id = clean_text(raw.get("source_id"), 120, "Artist id", required=True)
    name = clean_text(raw.get("name"), 300, "Artist")
    if source == "musicbrainz":
        from apps.media.backend.services.providers import mbid as mb

        parsed = mb(source_id)
        if not parsed:
            fail("That artist id is not a MusicBrainz id.")
        source_id = parsed.casefold()
    else:
        folded = source_id.casefold()
        blocked = {title.casefold()}
        if creator:
            blocked.add(creator.casefold())
        if name:
            blocked.add(name.casefold())
        if folded in blocked:
            fail("An artist id cannot be the title.")
    artist = _ensure_artist_catalog(db, source, source_id, name)
    if artist is None:
        fail("That artist id is already a different type.")
    return artist


def _explicit_artist(
    db: Session, user_id: int, body: dict, *, title: str, creator: str | None
) -> CatalogItem | None:
    if not _identity_present(body):
        return None
    chosen = None
    raw_id = body.get("artist_catalog_id")
    if raw_id not in (None, ""):
        chosen = _artist_from_catalog_id(db, user_id, raw_id)
    raw_identity = body.get("artist_identity")
    if raw_identity not in (None, ""):
        other = _artist_from_identity(db, raw_identity, title=title, creator=creator)
        if chosen is not None and other.id != chosen.id:
            fail("Those artist identities do not match.")
        chosen = other
    return chosen


def _write_explicit_credit(catalog: CatalogItem, artist: CatalogItem) -> None:
    if _membership_credits(catalog):
        return
    from apps.media.backend.services.providers import VARIOUS_ARTISTS_MBID

    source = artist.source if artist.source in {"musicbrainz", "manual"} else None
    source_id = artist.source_id
    if source == "musicbrainz" and source_id:
        source_id = source_id.casefold()
    if not source or not source_id:
        return
    role = "various" if source == "musicbrainz" and source_id == VARIOUS_ARTISTS_MBID else "primary"
    extra = _extra(catalog)
    extra["artist_credits"] = [
        {"source": source, "source_id": source_id, "name": artist.title, "role": role}
    ]
    if source == "musicbrainz":
        extra["artist_id"] = source_id
    _save_extra(catalog, extra)


def _link_known_artist(db: Session, artist: CatalogItem, child: CatalogItem) -> None:
    """Membership in an artist row the person already has, including one with no provider id."""
    relation: str
    relations: tuple[str, ...]
    if child.kind == "album":
        relation = "artist-release-group"
        relations = _ALBUM_RELATIONS
    elif child.kind == "track":
        relation = _DIRECT_TRACK
        relations = (_DIRECT_TRACK,)
    else:
        return
    if artist.id == child.id:
        return
    _ensure_link(
        db,
        artist.id,
        child.id,
        relation,
        _next_position(db, artist.id, relations),
        artist.title,
    )


def _group_saved_release(
    db: Session, user_id: int, catalog: CatalogItem, body: dict, detail: dict | None = None
) -> None:
    """Group this save under canonical artists. Does not follow anyone or save a discography."""
    if catalog.kind not in {"album", "track"}:
        return
    _store_detail_credits(catalog, detail)
    if not _membership_credits(catalog) and _identity_present(body):
        artist = _explicit_artist(db, user_id, body, title=catalog.title, creator=catalog.creator)
        if artist is not None:
            _write_explicit_credit(catalog, artist)
            if not artist.source_id:
                _link_known_artist(db, artist, catalog)
    _link_canonical_artists(db, catalog)


def create_manual(db: Session, user_id: int, body: dict) -> UserEntry:
    kind = choice(body.get("kind"), KINDS, "Media type")
    title = clean_text(body.get("title"), 300, "Title", required=True)
    creator = clean_text(body.get("creator"), 300, "Creator")
    if kind not in {"artist", "album", "track"} and _identity_present(body):
        fail("That artist identity belongs on music.")
    artist = (
        _explicit_artist(db, user_id, body, title=title, creator=creator)
        if kind in {"artist", "album", "track"}
        else None
    )
    if kind == "artist" and artist is not None:
        entry, _already = _entry_for_catalog(db, user_id, artist, body)
        return entry
    supplied = body.get("extra")
    raw_extra = supplied if isinstance(supplied, dict) else {}
    extra = {
        key: value
        for key, value in raw_extra.items()
        if key not in {"artist_credits", "artist_id", "artist_catalog_id"}
    }
    catalog = CatalogItem(
        kind=kind,
        title=title,
        creator=creator,
        overview=clean_text(body.get("overview"), 8000, "Description"),
        artwork_url=http_url(body.get("artwork_url")),
        source="manual",
        genres=dumps(body.get("genres") if isinstance(body.get("genres"), list) else []),
        extra=dumps(extra),
        external_ratings=dumps([]),
    )
    if body.get("year") not in (None, ""):
        apply_catalog_fields(catalog, {"year": body.get("year")}, fill_blanks_only=False)
    db.add(catalog)
    db.flush()
    if kind == "tv":
        note_manual_lifecycle(db, catalog, raw_extra.get("lifecycle"))
    store_release(db, catalog, body)
    entry = new_entry(db, user_id, catalog, body)
    if artist is not None:
        _write_explicit_credit(catalog, artist)
        if not artist.source_id:
            _link_known_artist(db, artist, catalog)
        _link_canonical_artists(db, catalog)
    return entry


def note_manual_lifecycle(db: Session, catalog: CatalogItem, raw) -> None:
    """Record a show's production lifecycle when a manual save names one.

    Personal watch progress stays on the entry and its episodes. Provider
    refresh still owns later reconciliation.
    """
    if catalog.kind != "tv" or not isinstance(raw, str) or not raw.strip():
        return
    from apps.media.backend.services.metadata import normalize_lifecycle

    text = raw.strip()[:80]
    row = db.query(SeriesLifecycle).filter(SeriesLifecycle.catalog_id == catalog.id).one_or_none()
    if row is None:
        row = SeriesLifecycle(catalog_id=catalog.id, completeness="unknown")
        db.add(row)
    row.lifecycle = normalize_lifecycle(text)
    row.raw_value = text
    row.source = catalog.source
    row.source_id = catalog.source_id
    row.fetched_at = utc_now()
    row.freshness = "fresh"
    if not row.completeness:
        row.completeness = "unknown"
    db.flush()


def record_viewing(db: Session, entry: UserEntry, value) -> bool:
    """Store a film date the person supplied. Never copies completed_on."""
    if entry.catalog.kind != "movie":
        fail("A viewing date belongs on a film.")
    when = parse_date(value, "Watched on")
    rows = (
        db.query(Experience)
        .filter(
            Experience.user_id == entry.user_id,
            Experience.entry_id == entry.id,
            Experience.kind == "watch",
        )
        .order_by(Experience.id)
        .all()
    )
    dated = [row.finished_on for row in rows if row.finished_on is not None]
    current = max(dated) if dated else None
    if when == current:
        return False
    if when is None:
        changed = False
        for row in rows:
            if row.finished_on is not None:
                row.finished_on = None
                changed = True
        return changed
    if rows:
        rows[0].finished_on = when
        for extra in rows[1:]:
            if extra.finished_on is not None:
                extra.finished_on = None
    else:
        db.add(
            Experience(
                user_id=entry.user_id,
                entry_id=entry.id,
                kind="watch",
                finished_on=when,
                spoiler=False,
                created_at=utc_now(),
            )
        )
    return True


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
    extra.pop("metadata_retries", None)
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
        extra["artist_id"] = artist_id.casefold()
        extra.pop("artist_uncredited", None)
    elif uncredited and group_id and catalog.source_id == group_id:
        extra["artist_uncredited"] = True
    _save_extra(catalog, extra)


def _clean_credit(row) -> dict | None:
    if not isinstance(row, dict):
        return None
    role = row.get("role")
    if role not in _CREDIT_ROLES:
        return None
    source = row.get("source") if row.get("source") in {"musicbrainz", "manual"} else None
    source_id = row.get("source_id") if isinstance(row.get("source_id"), str) else None
    if source == "musicbrainz":
        from apps.media.backend.services.providers import mbid as mb

        parsed = mb(source_id)
        source_id = parsed.casefold() if parsed else None
        if source_id is None:
            source = None
    elif source == "manual" and source_id is not None:
        source_id = source_id.strip()[:120] or None
        if source_id is None:
            source = None
    raw_name = row.get("name")
    name = raw_name.strip()[:200] if isinstance(raw_name, str) else ""
    if not source_id and not name:
        return None
    return {"source": source, "source_id": source_id, "name": name or None, "role": role}


def _store_detail_credits(catalog: CatalogItem, detail: dict | None) -> None:
    """Keep provider credits already fetched with this album or song. No new lookup."""
    if not isinstance(detail, dict):
        return
    incoming = detail.get("extra")
    if not isinstance(incoming, dict) or not isinstance(incoming.get("artist_credits"), list):
        return
    extra = _extra(catalog)
    if isinstance(extra.get("artist_credits"), list) and extra.get("artist_credits"):
        return
    extra["artist_credits"] = incoming["artist_credits"]
    if not extra.get("artist_id") and isinstance(incoming.get("artist_id"), str):
        extra["artist_id"] = incoming["artist_id"]
    _save_extra(catalog, extra)


def _membership_credits(catalog: CatalogItem) -> list[dict]:
    """Credits that own this save. Featured names and bare titles are not members."""
    extra = _extra(catalog)
    stored = extra.get("artist_credits")
    if isinstance(stored, list) and stored:
        members = []
        for row in stored:
            clean = _clean_credit(row)
            if clean is None or clean["role"] not in _MEMBER_ROLES:
                continue
            if not clean["source"] or not clean["source_id"]:
                continue
            members.append(clean)
        return members
    from apps.media.backend.services.providers import VARIOUS_ARTISTS_MBID
    from apps.media.backend.services.providers import mbid as mb

    artist_id = mb(extra.get("artist_id"))
    if artist_id is None or catalog.kind not in {"album", "track"}:
        return []
    artist_id = artist_id.casefold()
    role = "various" if artist_id == VARIOUS_ARTISTS_MBID else "primary"
    name = catalog.creator if isinstance(catalog.creator, str) else None
    return [{"source": "musicbrainz", "source_id": artist_id, "name": name, "role": role}]


def _artist_catalog_by_source(db: Session, source: str, source_id: str) -> CatalogItem | None:
    if source == "musicbrainz":
        return (
            db.query(CatalogItem)
            .filter(
                CatalogItem.source == source,
                func.lower(CatalogItem.source_id) == source_id.casefold(),
            )
            .one_or_none()
        )
    return _catalog_by_source(db, source, source_id)


def _ensure_artist_catalog(
    db: Session, source: str, source_id: str, name: str | None
) -> CatalogItem | None:
    """Public artist row for one identity. Does not create a personal follow."""
    if source == "musicbrainz":
        source_id = source_id.casefold()
    row = _artist_catalog_by_source(db, source, source_id)
    if row is not None:
        if row.kind != "artist":
            return None
        if (
            source == "musicbrainz"
            and row.title == "Uncredited"
            and name
            and _metadata_pending(row)
        ):
            row.title = name[:300]
        return row
    title = (name or "").strip()[:300] or "Uncredited"
    if source == "manual":
        created = _manual_catalog(db, kind="artist", title=title, creator=None)
        created.source_id = source_id
        db.flush()
        return created
    return _new_pending_catalog(db, "artist", title, source, source_id)


def _link_canonical_artists(db: Session, child: CatalogItem) -> None:
    """One link per canonical artist. A link is not a follow and not a discography."""
    relation: str
    relations: tuple[str, ...]
    if child.kind == "album":
        relation = "artist-release-group"
        relations = _ALBUM_RELATIONS
    elif child.kind == "track":
        relation = _DIRECT_TRACK
        relations = (_DIRECT_TRACK,)
    else:
        return
    seen: set[tuple[str, str]] = set()
    for credit in _membership_credits(child):
        key = (credit["source"], credit["source_id"])
        if key in seen:
            continue
        seen.add(key)
        artist = _ensure_artist_catalog(
            db, credit["source"], credit["source_id"], credit.get("name")
        )
        if artist is None or artist.id == child.id:
            continue
        _ensure_link(
            db,
            artist.id,
            child.id,
            relation,
            _next_position(db, artist.id, relations),
            artist.title,
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
    if not extra.get("artist_credits") and other.get("artist_credits"):
        extra["artist_credits"] = other["artist_credits"]
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
    _user_id: int,
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
            extra["artist_id"] = artist_id.casefold()
        _save_extra(requested_row, extra)
        _store_detail_credits(requested_row, detail)
        _link_canonical_artists(db, requested_row)
        return requested_row
    if (
        detail is not None
        and _metadata_pending(claimed)
        and _album_detail_fits(detail, requested_id, group_id)
    ):
        _apply_authoritative(db, claimed, detail)
    _store_detail_credits(claimed, detail)
    _remember_album_identity(claimed, group_id, pressing_id, artist_id, uncredited)
    _link_canonical_artists(db, claimed)
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
        entry, already = _entry_for_catalog(db, user_id, catalog, body)
        _group_saved_release(
            db, user_id, catalog, body, detail if isinstance(detail, dict) else None
        )
        return entry, already

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
    entry, already = _entry_for_catalog(db, user_id, catalog, body)
    _group_saved_release(db, user_id, catalog, body, detail if isinstance(detail, dict) else None)
    return entry, already


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
    entry, already = _entry_for_catalog(db, user_id, catalog, body)
    if catalog.kind in {"album", "track"}:
        _group_saved_release(
            db, user_id, catalog, body, detail if isinstance(detail, dict) else None
        )
    return entry, already


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
    db: Session, _user_id: int, candidate: _AlbumRepair, detail: dict | None
) -> str:
    """Write one album through the save path. Returns repaired, unresolved, linked, or skipped."""
    catalog = db.get(CatalogItem, candidate.catalog_id)
    if catalog is None or catalog.source_id != candidate.source_id:
        return "skipped"
    if candidate.action == "link":
        _link_canonical_artists(db, catalog)
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
        _user_id,
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


_FINISHED_KINDS = frozenset({"movie", "tv", "book", "game"})


def apply_completion_day(entry: UserEntry, kind: str, previous_status: str | None) -> None:
    """Stamp completed_on when a finished kind becomes completed, and clear it otherwise.

    The column is not a response field. Credit is derived from the current row,
    so leaving completed or deleting the entry retracts it.
    """
    if kind not in _FINISHED_KINDS:
        return
    if entry.status == "completed" and previous_status != "completed":
        entry.completed_on = today()
    elif entry.status != "completed":
        entry.completed_on = None


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
    apply_completion_day(entry, catalog.kind, None)
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


def assert_review_base(entry: UserEntry, body: dict) -> bool:
    """409 when a note save started from a review the server no longer has.

    An identical review, and nothing else, returns True so the caller can skip
    the write. A client can time out after the server stored the note, then
    retry with the base it started from. Other fields in the same body are
    still checked against that base, so a stale note cannot ride along with a
    status change.
    """
    if "review" not in body or "review_base" not in body:
        return False
    same_review = clean_text(body.get("review"), 20000, "Review") == entry.review
    other_fields = any(key not in _REVIEW_KEYS for key in body)
    if same_review and not other_fields:
        return True
    current = iso(entry.review_updated_at) or ""
    incoming = body.get("review_base")
    if ("" if incoming is None else str(incoming)) != current:
        raise HTTPException(status_code=409, detail="This note changed in another tab.")
    return False


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
    if assert_review_base(entry, body):
        return entry
    if "viewed_on" in body:
        if entry.catalog.kind != "movie":
            fail("A viewing date belongs on a film.")
        parse_date(body.get("viewed_on"), "Watched on")
    previous_status = entry.status
    before = _entry_snapshot(entry)
    viewing_changed = False
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
    if "viewed_on" in body:
        viewing_changed = record_viewing(db, entry, body.get("viewed_on"))
    apply_completion_day(entry, entry.catalog.kind, previous_status)
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
    if _entry_snapshot(entry) != before or records_release or viewing_changed:
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


def _direct_track_memberships(db: Session, entry: UserEntry) -> list[tuple[UserEntry, MusicLink]]:
    """Songs saved under the artist without riding on one of that artist's albums."""
    rows = (
        db.query(UserEntry, MusicLink)
        .join(MusicLink, MusicLink.child_catalog_id == UserEntry.catalog_id)
        .filter(
            UserEntry.user_id == entry.user_id,
            MusicLink.parent_catalog_id == entry.catalog_id,
            MusicLink.relation == _DIRECT_TRACK,
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
    if entry.catalog.kind == "artist":
        for track, link in _direct_track_memberships(db, entry):
            if track.id in child_entries:
                continue
            child_entries[track.id] = track
            songs.append(_track_payload(track, link))
    return {
        "partial": False,
        "albums": [
            _album_payload(album, grouped.get(album.catalog_id, [])) for album, _link in albums
        ],
        "songs": songs,
        "saved_children": [entry_card(child) for child in child_entries.values()],
    }


def _grouped_artist_ids(db: Session, user_id: int) -> list[int]:
    """Canonical artists this user follows or has saved music under. No provider read."""
    child_catalog = aliased(CatalogItem)
    saved_albums = (
        db.query(MusicLink.parent_catalog_id.label("artist_id"))
        .join(UserEntry, UserEntry.catalog_id == MusicLink.child_catalog_id)
        .join(child_catalog, child_catalog.id == UserEntry.catalog_id)
        .filter(
            UserEntry.user_id == user_id,
            child_catalog.kind == "album",
            MusicLink.relation.in_(_ALBUM_RELATIONS),
        )
    )
    direct_tracks = (
        db.query(MusicLink.parent_catalog_id.label("artist_id"))
        .join(UserEntry, UserEntry.catalog_id == MusicLink.child_catalog_id)
        .join(child_catalog, child_catalog.id == UserEntry.catalog_id)
        .filter(
            UserEntry.user_id == user_id,
            child_catalog.kind == "track",
            MusicLink.relation == _DIRECT_TRACK,
        )
    )
    track_link = aliased(MusicLink)
    through_albums = (
        db.query(MusicLink.parent_catalog_id.label("artist_id"))
        .join(track_link, track_link.parent_catalog_id == MusicLink.child_catalog_id)
        .join(UserEntry, UserEntry.catalog_id == track_link.child_catalog_id)
        .join(child_catalog, child_catalog.id == UserEntry.catalog_id)
        .filter(
            UserEntry.user_id == user_id,
            child_catalog.kind == "track",
            MusicLink.relation.in_(_ALBUM_RELATIONS),
            track_link.relation.in_(_TRACK_RELATIONS),
        )
    )
    owned = (
        db.query(UserEntry.catalog_id.label("artist_id"))
        .join(CatalogItem, CatalogItem.id == UserEntry.catalog_id)
        .filter(UserEntry.user_id == user_id, CatalogItem.kind == "artist")
    )
    union = saved_albums.union(direct_tracks, through_albums, owned).subquery()
    rows = (
        db.query(CatalogItem.id)
        .join(union, union.c.artist_id == CatalogItem.id)
        .filter(CatalogItem.kind == "artist")
        .all()
    )
    return [row.id for row in rows]


def _load_group_children(
    db: Session, user_id: int, child_ids_by_artist: dict[int, set[int]]
) -> dict[int, list[UserEntry]]:
    wanted = {entry_id for ids in child_ids_by_artist.values() for entry_id in ids}
    by_id: dict[int, UserEntry] = {}
    if wanted:
        rows = (
            db.query(UserEntry)
            .options(joinedload(UserEntry.catalog))
            .filter(UserEntry.user_id == user_id, UserEntry.id.in_(wanted))
            .all()
        )
        by_id = {row.id: row for row in rows}
    ordered: dict[int, list[UserEntry]] = {}
    for artist_id, ids in child_ids_by_artist.items():
        children = [by_id[entry_id] for entry_id in ids if entry_id in by_id]
        children.sort(
            key=lambda entry: (
                0 if entry.catalog.kind == "album" else 1,
                entry.catalog.year is None,
                entry.catalog.year or 0,
                entry.catalog.title.casefold(),
                entry.id,
            )
        )
        ordered[artist_id] = children
    return ordered


def _nests_for_page(
    db: Session, children_by_artist: dict[int, list[UserEntry]]
) -> dict[int, dict[str, list]]:
    """Albums once, their saved songs inside, and songs whose album is not saved."""
    albums_by_artist: dict[int, list[UserEntry]] = {}
    tracks_by_artist: dict[int, list[UserEntry]] = {}
    album_catalog_ids: set[int] = set()
    track_catalog_ids: set[int] = set()
    for artist_id, children in children_by_artist.items():
        albums = [child for child in children if child.catalog.kind == "album"]
        tracks = [child for child in children if child.catalog.kind == "track"]
        albums_by_artist[artist_id] = albums
        tracks_by_artist[artist_id] = tracks
        album_catalog_ids.update(album.catalog_id for album in albums)
        track_catalog_ids.update(track.catalog_id for track in tracks)
    links: list[MusicLink] = []
    if album_catalog_ids and track_catalog_ids:
        links = (
            db.query(MusicLink)
            .filter(
                MusicLink.relation.in_(_TRACK_RELATIONS),
                MusicLink.parent_catalog_id.in_(album_catalog_ids),
                MusicLink.child_catalog_id.in_(track_catalog_ids),
            )
            .all()
        )
    by_pair: dict[tuple[int, int], MusicLink] = {}
    for link in links:
        key = (link.parent_catalog_id, link.child_catalog_id)
        current = by_pair.get(key)
        if current is None or (link.position or 0, link.id) < (current.position or 0, current.id):
            by_pair[key] = link
    nests: dict[int, dict[str, list]] = {}
    for artist_id, albums in albums_by_artist.items():
        tracks = tracks_by_artist.get(artist_id, [])
        songs_by_album: dict[int, list[tuple[int, int, UserEntry]]] = {
            album.catalog_id: [] for album in albums
        }
        placed: set[int] = set()
        album_ids = {album.catalog_id for album in albums}
        for track in tracks:
            for album_id in album_ids:
                matched = by_pair.get((album_id, track.catalog_id))
                if matched is None:
                    continue
                songs_by_album[album_id].append((matched.position or 0, track.id, track))
                placed.add(track.id)
        album_rows = []
        for album in albums:
            ordered = sorted(songs_by_album[album.catalog_id], key=lambda item: (item[0], item[1]))
            card = entry_card(album)
            card["songs"] = [entry_card(item[2]) for item in ordered]
            album_rows.append(card)
        loose = [track for track in tracks if track.id not in placed]
        loose.sort(key=lambda entry: (entry.catalog.title.casefold(), entry.id))
        nests[artist_id] = {
            "albums": album_rows,
            "songs": [entry_card(track) for track in loose],
        }
    return nests


def _entry_has_tags(entry: UserEntry | None, tags: list[str]) -> bool:
    if entry is None:
        return False
    stored = loads(entry.tags, [])
    if not isinstance(stored, list):
        return False
    keys = {tag.casefold() for tag in stored if isinstance(tag, str)}
    return all(tag.casefold() in keys for tag in tags)


def _group_stamp(
    entry: UserEntry | None, children: list[UserEntry], catalog: CatalogItem, field: str
) -> float:
    values = []
    if entry is not None:
        values.append(getattr(entry, field))
    values.extend(getattr(child, field) for child in children)
    if not values:
        values.append(getattr(catalog, field))
    stamps = [value.timestamp() for value in values if value is not None]
    return max(stamps) if stamps else 0.0


def _group_artwork(catalog: CatalogItem, owned: UserEntry | None) -> str | None:
    """This artist's portrait or catalog image. Album art and ratings stay on the album."""
    if owned is not None and owned.portrait_url:
        return owned.portrait_url
    return catalog.artwork_url


def _artist_group_payload(
    catalog: CatalogItem,
    owned: UserEntry | None,
    children: list[UserEntry],
    nest: dict[str, list] | None,
) -> dict:
    shape = nest or {"albums": [], "songs": []}
    return {
        "catalog_id": catalog.id,
        "title": catalog.title,
        "source": catalog.source,
        "followed": owned is not None and artist_is_followed(owned),
        "entry_id": None if owned is None else owned.id,
        "rating": None if owned is None else owned.rating,
        "artwork_url": _group_artwork(catalog, owned),
        "saved_count": len(children),
        "albums": shape["albums"],
        "songs": shape["songs"],
        "saved_children": [entry_card(child) for child in children],
    }


def list_saved_artist_groups(
    db: Session,
    user_id: int,
    query: str | None,
    status: str | None,
    sort: str,
    offset: int,
    limit: int,
    favorite: bool,
    tags: list[str] | None,
) -> tuple[list[dict], int]:
    """One page of artist groups. A read does not follow, write, or import a catalog."""
    if status:
        if status in STATUSES:
            return [], 0
        choice(status, ARTIST_STATUSES, "Status")
    artist_ids = _grouped_artist_ids(db, user_id)
    if not artist_ids:
        return [], 0
    catalogs = {
        row.id: row for row in db.query(CatalogItem).filter(CatalogItem.id.in_(artist_ids)).all()
    }
    owned = {
        row.catalog_id: row
        for row in db.query(UserEntry)
        .filter(UserEntry.user_id == user_id, UserEntry.catalog_id.in_(list(catalogs)))
        .all()
    }
    child_map = _saved_child_ids(db, user_id, list(catalogs))
    children_of = _load_group_children(db, user_id, child_map)
    needle = query.strip().casefold() if query and query.strip() else ""
    chosen: list[tuple[CatalogItem, UserEntry | None, list[UserEntry]]] = []
    for artist_id, catalog in catalogs.items():
        entry = owned.get(artist_id)
        children = children_of.get(artist_id, [])
        followed = entry is not None and artist_is_followed(entry)
        if status == "following" and not followed:
            continue
        if status == "unfollowed" and followed:
            continue
        if favorite and not (
            (entry is not None and entry.favorite) or any(child.favorite for child in children)
        ):
            continue
        if tags and not (
            _entry_has_tags(entry, tags) or any(_entry_has_tags(child, tags) for child in children)
        ):
            continue
        if needle:
            names = [catalog.title, *(child.catalog.title for child in children)]
            names.extend(child.catalog.creator or "" for child in children)
            if not any(needle in name.casefold() for name in names):
                continue
        chosen.append((catalog, entry, children))

    def sort_key(item: tuple[CatalogItem, UserEntry | None, list[UserEntry]]):
        catalog, entry, children = item
        title = catalog.title_sort or catalog.title.casefold()
        ident = catalog.id
        if sort == "title":
            return (title, ident)
        if sort == "rating":
            rating = None if entry is None else entry.rating
            return (rating is None, -(rating or 0), title, ident)
        if sort == "release":
            years = [
                child.catalog.year
                for child in children
                if child.catalog.kind == "album" and child.catalog.year is not None
            ]
            year = max(years) if years else None
            return (year is None, -(year or 0), title, ident)
        if sort == "added":
            return (-_group_stamp(entry, children, catalog, "created_at"), ident)
        return (-_group_stamp(entry, children, catalog, "updated_at"), -ident)

    chosen.sort(key=sort_key)
    total = len(chosen)
    window = chosen[offset : offset + limit]
    nests = _nests_for_page(db, {catalog.id: children for catalog, _entry, children in window})
    items = [
        _artist_group_payload(catalog, entry, children, nests.get(catalog.id))
        for catalog, entry, children in window
    ]
    return items, total


def saved_artist_group(db: Session, user_id: int, catalog_id: int) -> dict:
    """Saved albums and songs for one canonical artist. Does not follow or import."""
    catalog = db.get(CatalogItem, catalog_id)
    if catalog is None or catalog.kind != "artist":
        fail_missing()
    owned = (
        db.query(UserEntry)
        .filter(UserEntry.user_id == user_id, UserEntry.catalog_id == catalog.id)
        .one_or_none()
    )
    children = _saved_group_entries(db, user_id, catalog.id)
    if owned is None and not children:
        fail_missing()
    nest = _nests_for_page(db, {catalog.id: children}).get(catalog.id)
    return _artist_group_payload(catalog, owned, children, nest)


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
        **(
            {"viewed_on": _recorded_viewings(db, entry.user_id, [entry.id]).get(entry.id)}
            if entry.catalog.kind == "movie"
            else {}
        ),
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
