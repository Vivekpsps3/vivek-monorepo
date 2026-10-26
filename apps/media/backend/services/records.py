"""Personal library reads and writes. Metadata refreshes never touch reviews."""

import json
import math
from datetime import UTC, date, datetime

from fastapi import HTTPException
from sqlalchemy import and_, or_
from sqlalchemy.orm import Session

from apps.media.backend.models import (
    CatalogItem,
    Episode,
    EpisodeProgress,
    MusicLink,
    Release,
    SeasonProgress,
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
        "artwork_url": catalog.artwork_url,
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


def library_card(db: Session, entry: UserEntry) -> dict:
    card = entry_card(entry)
    kind = entry.catalog.kind
    if kind == "artist":
        # Count saved children. Do not embed a discography.
        card["saved_count"] = saved_child_count(db, entry)
    elif kind == "track":
        extra = loads(entry.catalog.extra, {})
        album = ""
        if isinstance(extra, dict):
            raw = extra.get("album") or extra.get("album_title")
            if isinstance(raw, str):
                album = raw.strip()
        if album:
            card["album"] = album
    return card


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


def fail_missing() -> None:
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


def create_from_provider(db: Session, user_id: int, body: dict) -> tuple[UserEntry, bool]:
    source = choice(body.get("source"), SOURCES - {"manual"}, "Source")
    source_id = clean_text(body.get("source_id"), 120, "Provider id", required=True)
    kind = choice(body.get("kind"), KINDS, "Media type")
    catalog = (
        db.query(CatalogItem)
        .filter(CatalogItem.source == source, CatalogItem.source_id == source_id)
        .one_or_none()
    )
    if catalog is None:
        catalog = CatalogItem(
            kind=kind,
            title=clean_text(body.get("title"), 300, "Title", required=True),
            creator=clean_text(body.get("creator"), 300, "Creator"),
            overview=clean_text(body.get("overview"), 8000, "Description"),
            artwork_url=http_url(body.get("artwork_url")),
            source=source,
            source_id=source_id,
            genres=dumps(body.get("genres") if isinstance(body.get("genres"), list) else []),
            extra=dumps(body.get("extra") if isinstance(body.get("extra"), dict) else {}),
            external_ratings=dumps(normalize_ratings(body.get("external_ratings"))),
        )
        if body.get("year") not in (None, ""):
            apply_catalog_fields(catalog, {"year": body.get("year")}, fill_blanks_only=False)
        db.add(catalog)
        db.flush()
        store_release(db, catalog, body)
        store_episodes(db, catalog, body.get("episodes"))
    existing = (
        db.query(UserEntry)
        .filter(UserEntry.user_id == user_id, UserEntry.catalog_id == catalog.id)
        .one_or_none()
    )
    if existing is not None:
        return existing, True
    return new_entry(db, user_id, catalog, body), False


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
    db: Session, user_id: int, kind: str | None, status: str | None, query: str | None, sort: str
) -> list[UserEntry]:
    rows = db.query(UserEntry).join(CatalogItem).filter(UserEntry.user_id == user_id)
    if kind:
        rows = rows.filter(CatalogItem.kind == choice(kind, KINDS, "Media type"))
    if status:
        if status in ARTIST_STATUSES:
            if kind and kind != "artist":
                return []
            rows = rows.filter(
                CatalogItem.kind == "artist",
                _artist_followed_filter(status == "following"),
            )
        elif status in STATUSES:
            if kind == "artist":
                return []
            rows = rows.filter(CatalogItem.kind != "artist", UserEntry.status == status)
        else:
            choice(status, STATUSES, "Status")
    if query:
        like = f"%{query.strip()}%"
        rows = rows.filter(or_(CatalogItem.title.ilike(like), CatalogItem.creator.ilike(like)))
    found: list[UserEntry] = list(rows.all())
    if sort == "rating":
        found.sort(
            key=lambda entry: (
                entry.rating is None,
                -(entry.rating or 0),
                entry.catalog.title.lower(),
            )
        )
    elif sort == "release":
        found.sort(
            key=lambda entry: (
                entry.catalog.year is None,
                -(entry.catalog.year or 0),
                entry.catalog.title.lower(),
            )
        )
    elif sort == "added":
        found.sort(key=lambda entry: entry.created_at, reverse=True)
    elif sort == "title":
        found.sort(key=lambda entry: (entry.catalog.title.casefold(), entry.id))
    else:
        found.sort(key=lambda entry: entry.updated_at, reverse=True)
    return found


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
    serialized = []
    next_episode = None
    upcoming = []
    for episode in episodes:
        mark = progress.get(episode.id)
        watched = bool(mark and mark.watched)
        released = episode.air_date is None or episode.air_date <= current
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
        if not watched and released and next_episode is None:
            next_episode = item
        if not watched and episode.air_date and episode.air_date > current:
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
        "caught_up": bool(serialized) and next_episode is None,
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
    for number in sorted(set(counts) | set(progress)):
        row = progress.get(number)
        views.append(
            {
                "season_number": number,
                "episode_count": counts.get(number, 0),
                "watched": bool(row.watched) if row is not None else False,
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
    row.watched = watched
    row.watched_on = watched_on if watched else None
    db.flush()


def mark_next(db: Session, user_id: int, entry: UserEntry) -> dict:
    if entry.catalog.kind != "tv":
        fail("Episode progress is for shows.")
    state = episode_state(db, user_id, entry.catalog)
    nxt = state["next_episode"]
    if nxt is None:
        from fastapi import HTTPException

        raise HTTPException(status_code=409, detail="Add episodes, or you are already caught up.")
    episode = db.get(Episode, nxt["id"])
    mark_watched(db, user_id, episode, True, today())
    entry.updated_at = utc_now()
    return episode_state(db, user_id, entry.catalog)


def needs_collaborators(catalog: CatalogItem) -> bool:
    if catalog.kind != "artist" or catalog.source != "musicbrainz" or not catalog.source_id:
        return False
    return "collaborators" not in _extra(catalog)


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


def apply_artist_portraits(db: Session, entries, *, deep: bool = False) -> None:
    """Fill a blank artist image with a URL the browser can load."""
    import httpx

    from apps.media.backend.services import providers

    catalogs = []
    for entry in entries:
        catalog = getattr(entry, "catalog", None)
        if catalog is None or catalog.kind != "artist" or catalog.artwork_url:
            continue
        if catalog.source != "musicbrainz" or not providers.mbid(catalog.source_id or ""):
            continue
        catalogs.append(catalog)
    if not catalogs:
        return
    http = httpx.Client(
        timeout=8.0, headers={"User-Agent": providers.UA, "Accept": "application/json"}
    )
    try:
        images = providers.cached_artist_portraits(
            db, http, [catalog.source_id for catalog in catalogs], deep=deep
        )
    except Exception:
        return
    finally:
        http.close()
    for catalog in catalogs:
        url = images.get((catalog.source_id or "").lower())
        if isinstance(url, str) and url.startswith("https://"):
            catalog.artwork_url = url[:1000]


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
    row = (
        db.query(CatalogItem)
        .filter(CatalogItem.source == source, CatalogItem.source_id == source_id)
        .one_or_none()
    )
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


def saved_child_count(db: Session, entry: UserEntry) -> int:
    """Saved albums and songs linked to this artist. The artist is not included."""
    albums = _album_memberships(db, entry)
    tracks = _track_memberships(db, entry.user_id, _linked_album_ids(db, entry))
    return len(albums) + len({track.id for track, _link in tracks})


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
            "albums": [
                _album_payload(entry, [_track_payload(track, link) for track, link in tracks])
            ],
        }
    albums = _album_memberships(db, entry)
    saved_album_ids = {album.catalog_id for album, _link in albums}
    grouped: dict[int, list] = {}
    songs: list[dict] = []
    seen_songs: set[int] = set()
    for track, link in _track_memberships(db, entry.user_id, _linked_album_ids(db, entry)):
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
    }


def detail(db: Session, entry: UserEntry) -> dict:
    releases = db.query(Release).filter(Release.catalog_id == entry.catalog_id).all()
    show = episode_state(db, entry.user_id, entry.catalog) if entry.catalog.kind == "tv" else None
    return {
        **entry_card(entry),
        "catalog": catalog_dict(entry.catalog),
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


def saved_source_keys(db: Session, user_id: int) -> set[tuple[str, str]]:
    return set(saved_source_ids(db, user_id))
