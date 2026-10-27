"""Hub-sized summary. Dates are compared at the precision the provider actually gave."""

from datetime import date

from sqlalchemy.orm import Session

from apps.media.backend.models import CatalogItem, MusicLink, Release, UserEntry
from apps.media.backend.services.clock import today
from apps.media.backend.services.records import (
    displayed_status,
    entry_card,
    episode_state,
    iso,
    progress_label,
)

_ALBUM_RELATIONS = ("artist-album", "artist-release-group")
_TRACK_RELATIONS = ("album-recording", "release-group-recording")


def build_summary(db: Session, user_id: int) -> dict:
    current = today()
    entries = db.query(UserEntry).filter(UserEntry.user_id == user_id).all()
    currently = [
        activity_card(db, entry)
        for entry in entries
        if entry.catalog.kind != "artist" and entry.status == "in_progress"
    ]
    currently.sort(key=lambda item: item["updated_at"] or "", reverse=True)
    reviewed = [entry for entry in entries if entry.review]
    reviewed.sort(key=lambda entry: entry.review_updated_at or entry.updated_at, reverse=True)
    recent_reviews = []
    for entry in reviewed[:4]:
        text = (entry.review or "").strip().replace("\n", " ")
        recent_reviews.append(
            {
                "id": entry.id,
                "kind": entry.catalog.kind,
                "title": entry.catalog.title,
                "rating": entry.rating,
                "review_excerpt": text[:140],
                "review_updated_at": iso(entry.review_updated_at),
            }
        )
    upcoming = []
    for entry in entries:
        if not is_anticipated(entry):
            continue
        release = primary_release(db, entry.catalog_id)
        when = classify_release(release, current)
        if when is None:
            continue
        upcoming.append(
            {
                "id": entry.id,
                "kind": entry.catalog.kind,
                "title": entry.catalog.title,
                "release_on": None if release is None else iso(release.released_on),
                "precision": "unknown" if release is None else release.precision,
                "release_status": "unknown" if release is None else release.status,
                "when": when,
            }
        )
    order = {
        "today": 0,
        "tomorrow": 1,
        "this_week": 2,
        "this_month": 3,
        "upcoming": 4,
        "postponed": 5,
        "unknown": 6,
        "recent": 7,
    }
    upcoming.sort(key=lambda item: (order.get(item["when"], 9), item["release_on"] or "9999"))
    return {
        "currently": currently[:6],
        "recent_reviews": recent_reviews,
        "upcoming": upcoming[:6],
        "next_episodes": next_episodes(db, user_id, entries),
        "counts": {
            "library": len(entries),
            "in_progress": len(currently),
            "anticipated": sum(1 for entry in entries if is_anticipated(entry)),
        },
    }


def next_episodes(db: Session, user_id: int, entries: list[UserEntry] | None = None) -> list:
    """Next episode for each show the reader is in, wants, or is anticipating."""
    if entries is None:
        entries = db.query(UserEntry).filter(UserEntry.user_id == user_id).all()
    found = []
    for entry in entries:
        if entry.catalog.kind != "tv" or entry.status not in {
            "in_progress",
            "want",
            "anticipating",
            "completed",
        }:
            continue
        state = episode_state(db, user_id, entry.catalog)
        if entry.status == "completed":
            from apps.media.backend.services.metadata import lifecycle

            if (
                lifecycle(db, entry.catalog_id)["state"] != "ongoing"
                or state["next_episode"] is None
            ):
                continue
        chosen = state["next_episode"] or (
            state["upcoming_episodes"][0] if state["upcoming_episodes"] else None
        )
        if chosen is None:
            continue
        aired = bool(chosen.get("released"))
        found.append(
            {
                "entry_id": entry.id,
                "episode_id": chosen["id"],
                "show_title": entry.catalog.title,
                "artwork_url": entry.catalog.artwork_url,
                "season": chosen["season_number"],
                "episode": chosen["episode_number"],
                "title": chosen.get("title"),
                "air_date": chosen.get("air_date"),
                "state": "next" if aired else "upcoming",
                "lifecycle": lifecycle(db, entry.catalog_id)
                if entry.status == "completed"
                else None,
            }
        )
    return found[:4]


def is_anticipated(entry: UserEntry) -> bool:
    if entry.catalog.kind == "artist":
        return False
    return bool(entry.anticipated or entry.status == "anticipating")


def card_with_progress(entry: UserEntry) -> dict:
    card = entry_card(entry)
    card["progress_label"] = progress_label(entry)
    return card


def activity_card(db: Session, entry: UserEntry) -> dict:
    """The song or album is the listen. The artist, when linked, is only the relationship."""
    card = card_with_progress(entry)
    artist = linked_artist(db, entry)
    if artist is not None:
        card["artist"] = artist
    return card


def linked_artist(db: Session, entry: UserEntry) -> dict | None:
    kind = entry.catalog.kind
    if kind == "album":
        album_ids = [entry.catalog_id]
    elif kind == "track":
        album_ids = [
            row[0]
            for row in db.query(MusicLink.parent_catalog_id)
            .filter(
                MusicLink.child_catalog_id == entry.catalog_id,
                MusicLink.relation.in_(_TRACK_RELATIONS),
            )
            .all()
        ]
    else:
        return None
    if not album_ids:
        return None
    found = (
        db.query(CatalogItem)
        .join(MusicLink, MusicLink.parent_catalog_id == CatalogItem.id)
        .filter(
            MusicLink.child_catalog_id.in_(album_ids),
            MusicLink.relation.in_(_ALBUM_RELATIONS),
            CatalogItem.kind == "artist",
        )
        .order_by(MusicLink.position, MusicLink.id)
        .first()
    )
    if found is None:
        return None
    saved = (
        db.query(UserEntry)
        .filter(UserEntry.user_id == entry.user_id, UserEntry.catalog_id == found.id)
        .one_or_none()
    )
    return {
        "title": found.title,
        "entry_id": None if saved is None else saved.id,
        "status": None if saved is None else displayed_status(saved),
    }


def primary_release(db: Session, catalog_id: int) -> Release | None:
    rows = db.query(Release).filter(Release.catalog_id == catalog_id).all()
    if not rows:
        return None
    rows.sort(key=lambda row: (row.status != "postponed", row.released_on or date.max))
    return rows[0]


def classify_release(release: Release | None, current: date) -> str | None:
    if release is None or release.precision == "unknown" or release.released_on is None:
        return "postponed" if release is not None and release.status == "postponed" else "unknown"
    if release.status == "postponed":
        return "postponed"
    released_on = release.released_on
    if release.precision == "year":
        return "upcoming" if released_on.year >= current.year else None
    if release.precision == "month":
        point = (released_on.year, released_on.month)
        now = (current.year, current.month)
        if point == now:
            return "this_month"
        if point > now:
            return "upcoming"
        previous = (
            (current.year, current.month - 1) if current.month > 1 else (current.year - 1, 12)
        )
        return "recent" if point == previous else None
    delta = (released_on - current).days
    if delta == 0:
        return "today"
    if delta == 1:
        return "tomorrow"
    if 1 < delta <= 7:
        return "this_week"
    if delta > 7:
        return "upcoming"
    if -14 <= delta < 0:
        return "recent"
    return None
