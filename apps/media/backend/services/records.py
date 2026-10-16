"""Personal library reads and writes. Metadata refreshes never touch reviews."""

import json
from datetime import date, datetime, timezone

from sqlalchemy import or_
from sqlalchemy.orm import Session

from models import CatalogItem, Episode, EpisodeProgress, Experience, Release, SeasonProgress, UserEntry, utc_now
from services.clock import today
from services.validate import (
    EXPERIENCE_KINDS,
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
            value = value.replace(tzinfo=timezone.utc)
        return value.astimezone(timezone.utc).isoformat()
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


def entry_card(entry: UserEntry) -> dict:
    catalog = entry.catalog
    return {
        "id": entry.id,
        "kind": catalog.kind,
        "title": catalog.title,
        "creator": catalog.creator,
        "year": catalog.year,
        "artwork_url": catalog.artwork_url,
        "status": entry.status,
        "rating": entry.rating,
        "favorite": entry.favorite,
        "anticipated": entry.anticipated,
        "progress_label": progress_label(entry),
        "updated_at": iso(entry.updated_at),
        "review_updated_at": iso(entry.review_updated_at),
    }


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
    if not any(key in body for key in ("release_on", "release_precision", "release_status", "releases")):
        return
    releases = body.get("releases")
    if isinstance(releases, list) and releases:
        for item in releases:
            if not isinstance(item, dict):
                continue
            add_release(db, catalog, item)
        return
    if "release_on" in body or "release_precision" in body or "release_status" in body:
        add_release(db, catalog, {
            "released_on": body.get("release_on"),
            "precision": body.get("release_precision") or ("day" if body.get("release_on") else "unknown"),
            "status": body.get("release_status") or "scheduled",
            "region": body.get("region"),
            "platform": body.get("platform"),
            "note": body.get("release_note"),
        })


def add_release(db: Session, catalog: CatalogItem, item: dict) -> None:
    precision = choice(item.get("precision"), PRECISIONS, "Release precision", "unknown")
    status = choice(item.get("status"), RELEASE_STATUSES, "Release status", "unknown")
    released_on = parse_date(item.get("released_on"), "Release date")
    if precision in {"month", "year"} and released_on is not None:
        released_on = date(released_on.year, 1 if precision == "year" else released_on.month, 1)
    db.add(Release(
        catalog_id=catalog.id,
        region=clean_text(item.get("region"), 40, "Region"),
        platform=clean_text(item.get("platform"), 80, "Platform"),
        released_on=released_on,
        precision=precision,
        status=status,
        note=clean_text(item.get("note"), 300, "Release note"),
    ))


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
        .filter(Episode.catalog_id == catalog.id, Episode.season_number == season, Episode.episode_number == number)
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
        cleaned.append({
            "provider": clean_text(item.get("provider"), 40, "Provider") or label,
            "label": label,
            "value": number,
            "scale": clean_text(item.get("scale"), 20, "Scale") or "",
            "votes": item.get("votes") if isinstance(item.get("votes"), int) else None,
        })
    return cleaned


def new_entry(db: Session, user_id: int, catalog: CatalogItem, body: dict) -> UserEntry:
    entry = UserEntry(
        user_id=user_id,
        catalog_id=catalog.id,
        status=choice(body.get("status"), STATUSES, "Status", "anticipating" if body.get("anticipated") else "want"),
        rating=rating_value(body.get("rating")) if "rating" in body else None,
        review=clean_text(body.get("review"), 20000, "Review"),
        review_spoiler=bool(body.get("review_spoiler")),
        summary=clean_text(body.get("summary"), 400, "Summary"),
        favorite=bool(body.get("favorite")),
        anticipated=bool(body.get("anticipated")) or body.get("status") == "anticipating",
        progress_value=number_or_none(body.get("progress_value"), "Progress"),
        progress_unit=choice(body.get("progress_unit"), PROGRESS_UNITS, "Progress unit", None) if body.get("progress_unit") else None,
    )
    if entry.review:
        entry.review_updated_at = utc_now()
    if entry.progress_unit == "percent" and entry.progress_value is not None and not 0 <= entry.progress_value <= 100:
        fail("Percent progress is between 0 and 100.")
    db.add(entry)
    db.flush()
    return entry


def number_or_none(value, field: str) -> float | None:
    if value is None or value == "":
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        fail(f"{field} must be a number.")


def patch_entry(db: Session, entry: UserEntry, body: dict) -> UserEntry:
    before_rating = entry.rating
    before_review = entry.review
    if "status" in body:
        entry.status = choice(body.get("status"), STATUSES, "Status")
    if "rating" in body:
        entry.rating = rating_value(body.get("rating"))
    if "review" in body:
        entry.review = clean_text(body.get("review"), 20000, "Review")
    if "review_spoiler" in body:
        entry.review_spoiler = bool(body.get("review_spoiler"))
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
        entry.anticipated = bool(body.get("anticipated"))
    if "progress_value" in body:
        entry.progress_value = number_or_none(body.get("progress_value"), "Progress")
    if "progress_unit" in body:
        entry.progress_unit = choice(body.get("progress_unit"), PROGRESS_UNITS, "Progress unit") if body.get("progress_unit") else None
    if entry.progress_unit == "percent" and entry.progress_value is not None and not 0 <= entry.progress_value <= 100:
        fail("Percent progress is between 0 and 100.")
    if entry.review != before_review:
        entry.review_updated_at = utc_now()
    fill_only = entry.catalog.source != "manual"
    apply_catalog_fields(entry.catalog, {key: body[key] for key in ("title", "creator", "year", "overview", "artwork_url") if key in body}, fill_blanks_only=fill_only)
    store_release(db, entry.catalog, body)
    entry.updated_at = utc_now()
    db.flush()
    return entry


def add_experience(db: Session, entry: UserEntry, body: dict) -> Experience:
    started = parse_date(body.get("started_on"), "Start date")
    finished = parse_date(body.get("finished_on"), "End date")
    if started and finished and finished < started:
        fail("The end date is before the start date.")
    row = Experience(
        user_id=entry.user_id,
        entry_id=entry.id,
        kind=choice(body.get("kind"), EXPERIENCE_KINDS, "Experience"),
        started_on=started,
        finished_on=finished,
        rating=rating_value(body.get("rating")) if "rating" in body else None,
        notes=clean_text(body.get("notes"), 20000, "Notes"),
        spoiler=bool(body.get("spoiler")),
    )
    db.add(row)
    entry.updated_at = utc_now()
    db.flush()
    return row


def patch_experience(row: Experience, body: dict) -> None:
    if "kind" in body:
        row.kind = choice(body.get("kind"), EXPERIENCE_KINDS, "Experience")
    if "started_on" in body:
        row.started_on = parse_date(body.get("started_on"), "Start date")
    if "finished_on" in body:
        row.finished_on = parse_date(body.get("finished_on"), "End date")
    if row.started_on and row.finished_on and row.finished_on < row.started_on:
        fail("The end date is before the start date.")
    if "rating" in body:
        row.rating = rating_value(body.get("rating"))
    if "notes" in body:
        row.notes = clean_text(body.get("notes"), 20000, "Notes")
    if "spoiler" in body:
        row.spoiler = bool(body.get("spoiler"))


def list_library(db: Session, user_id: int, kind: str | None, status: str | None, query: str | None, sort: str) -> list[UserEntry]:
    rows = db.query(UserEntry).join(CatalogItem).filter(UserEntry.user_id == user_id)
    if kind:
        rows = rows.filter(CatalogItem.kind == choice(kind, KINDS, "Media type"))
    if status:
        rows = rows.filter(UserEntry.status == choice(status, STATUSES, "Status"))
    if query:
        like = f"%{query.strip()}%"
        rows = rows.filter(or_(CatalogItem.title.ilike(like), CatalogItem.creator.ilike(like)))
    rows = rows.all()
    if sort == "rating":
        rows.sort(key=lambda entry: (entry.rating is None, -(entry.rating or 0), entry.catalog.title.lower()))
    elif sort == "release":
        rows.sort(key=lambda entry: (entry.catalog.year is None, -(entry.catalog.year or 0), entry.catalog.title.lower()))
    elif sort == "added":
        rows.sort(key=lambda entry: entry.created_at, reverse=True)
    else:
        rows.sort(key=lambda entry: entry.updated_at, reverse=True)
    return rows


def episode_state(db: Session, user_id: int, catalog: CatalogItem) -> dict:
    episodes = (
        db.query(Episode)
        .filter(Episode.catalog_id == catalog.id)
        .order_by(Episode.season_number, Episode.episode_number)
        .all()
    )
    progress = {
        row.episode_id: row
        for row in db.query(EpisodeProgress).filter(EpisodeProgress.user_id == user_id, EpisodeProgress.episode_id.in_([ep.id for ep in episodes] or [-1]))
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


def season_views(db: Session, user_id: int, entry_id: int | None, episodes: list[Episode]) -> list[dict]:
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
        views.append({
            "season_number": number,
            "episode_count": counts.get(number, 0),
            "watched": bool(row.watched) if row is not None else False,
            "rating": None if row is None else row.rating,
        })
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


def mark_watched(db: Session, user_id: int, episode: Episode, watched: bool, watched_on: date | None) -> None:
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


def detail(db: Session, entry: UserEntry) -> dict:
    experiences = (
        db.query(Experience)
        .filter(Experience.entry_id == entry.id, Experience.user_id == entry.user_id)
        .all()
    )
    experiences.sort(key=lambda row: (row.finished_on or row.started_on or date.min, row.id))
    releases = db.query(Release).filter(Release.catalog_id == entry.catalog_id).all()
    show = episode_state(db, entry.user_id, entry.catalog) if entry.catalog.kind == "tv" else None
    return {
        **entry_card(entry),
        "catalog": catalog_dict(entry.catalog),
        "review": entry.review,
        "review_spoiler": entry.review_spoiler,
        "summary": entry.summary,
        "tags": loads(entry.tags, []),
        "progress_value": entry.progress_value,
        "progress_unit": entry.progress_unit,
        "created_at": iso(entry.created_at),
        "experiences": [
            {
                "id": row.id,
                "kind": row.kind,
                "started_on": iso(row.started_on),
                "finished_on": iso(row.finished_on),
                "rating": row.rating,
                "notes": row.notes,
                "spoiler": row.spoiler,
                "created_at": iso(row.created_at),
            }
            for row in experiences
        ],
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
    }


def saved_source_keys(db: Session, user_id: int) -> set[tuple[str, str]]:
    rows = (
        db.query(CatalogItem.source, CatalogItem.source_id)
        .join(UserEntry, UserEntry.catalog_id == CatalogItem.id)
        .filter(UserEntry.user_id == user_id, CatalogItem.source_id.is_not(None))
        .all()
    )
    return {(source, source_id) for source, source_id in rows}
