"""Hub-sized summary. Dates are compared at the precision the provider actually gave."""

from datetime import date

from sqlalchemy.orm import Session

from apps.media.backend.models import CatalogItem, MusicLink, Release, SeriesLifecycle, UserEntry
from apps.media.backend.services.clock import today
from apps.media.backend.services.metadata import lifecycle_payload
from apps.media.backend.services.records import (
    _library_show_progress,
    _recorded_viewings,
    displayed_status,
    entry_card,
    iso,
    progress_label,
)
from apps.media.backend.services.when import classify_release, public_release_on

_NOW_STATUSES = {"in_progress", "want", "anticipating", "completed"}
_ENDED = {"ended", "canceled"}
_SHOW_FALLBACK = {
    "caught_up": False,
    "metadata_incomplete": True,
    "episode_count": 0,
    "watched_count": 0,
    "continuation": None,
}

_ALBUM_RELATIONS = ("artist-album", "artist-release-group")
_TRACK_RELATIONS = ("album-recording", "release-group-recording")
_DIRECT_TRACK = "artist-recording"


def build_summary(db: Session, user_id: int) -> dict:
    current = today()
    entries = db.query(UserEntry).filter(UserEntry.user_id == user_id).all()
    current_entries = [
        entry
        for entry in entries
        if entry.catalog.kind != "artist" and entry.status == "in_progress"
    ]
    current_entries.sort(key=lambda entry: iso(entry.updated_at) or "", reverse=True)
    shows = [
        entry for entry in entries if entry.catalog.kind == "tv" and entry.status in _NOW_STATUSES
    ]
    progress, lifecycles = show_facts(db, user_id, shows)
    viewings = _recorded_viewings(
        db, user_id, [entry.id for entry in current_entries if entry.catalog.kind == "movie"]
    )
    currently = []
    for entry in current_entries:
        card = activity_card(db, entry)
        if entry.catalog.kind == "movie":
            card["viewed_on"] = viewings.get(entry.id)
        elif entry.catalog.kind == "tv":
            card["lifecycle"] = lifecycle_payload(lifecycles.get(entry.catalog_id))
            card.update(progress.get(entry.catalog_id, _SHOW_FALLBACK))
        currently.append(card)
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
        precision = "unknown" if release is None else release.precision
        status = "unknown" if release is None else release.status
        released_on = None if release is None else release.released_on
        when = classify_release(precision, released_on, status, current)
        if when is None:
            continue
        upcoming.append(
            {
                "id": entry.id,
                "kind": entry.catalog.kind,
                "title": entry.catalog.title,
                "release_on": public_release_on(precision, released_on),
                "precision": precision,
                "release_status": status,
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
    upcoming.sort(
        key=lambda item: (
            order.get(item["when"] if isinstance(item["when"], str) else "", 9),
            str(item["release_on"] or "9999"),
        )
    )
    return {
        "currently": currently[:6],
        "recent_reviews": recent_reviews,
        "upcoming": upcoming[:6],
        "next_episodes": next_episodes(db, user_id, entries, progress, lifecycles),
        "counts": {
            "library": len(entries),
            "in_progress": len(currently),
            "anticipated": sum(1 for entry in entries if is_anticipated(entry)),
        },
    }


def show_facts(
    db: Session, user_id: int, shows: list[UserEntry]
) -> tuple[dict[int, dict], dict[int, SeriesLifecycle]]:
    """One continuation read for Now and the series shelf. Not a second episode store."""
    catalog_ids = [entry.catalog_id for entry in shows]
    if not catalog_ids:
        return {}, {}
    progress = _library_show_progress(db, user_id, catalog_ids)
    lifecycles = {
        row.catalog_id: row
        for row in db.query(SeriesLifecycle).filter(SeriesLifecycle.catalog_id.in_(catalog_ids))
    }
    return progress, lifecycles


def next_episodes(
    db: Session,
    user_id: int,
    entries: list[UserEntry] | None = None,
    progress: dict[int, dict] | None = None,
    lifecycles: dict[int, SeriesLifecycle] | None = None,
) -> list:
    """Continuation rows from the series shelf. The shelf still owns the action."""
    if entries is None:
        entries = db.query(UserEntry).filter(UserEntry.user_id == user_id).all()
    shows = [
        entry for entry in entries if entry.catalog.kind == "tv" and entry.status in _NOW_STATUSES
    ]
    if progress is None or lifecycles is None:
        progress, lifecycles = show_facts(db, user_id, shows)
    found = []
    for entry in shows:
        facts = progress.get(entry.catalog_id, _SHOW_FALLBACK)
        continuation = facts.get("continuation")
        if not isinstance(continuation, dict):
            continue
        lifecycle = lifecycle_payload(lifecycles.get(entry.catalog_id))
        if not on_now(continuation, bool(facts.get("caught_up")), lifecycle["state"]):
            continue
        found.append(
            {
                "entry_id": entry.id,
                "episode_id": continuation["episode_id"],
                "show_title": entry.catalog.title,
                "artwork_url": entry.catalog.artwork_url,
                "season": continuation["season"],
                "episode": continuation["episode"],
                "title": continuation.get("title"),
                "air_date": continuation.get("air_date"),
                "state": continuation["state"],
                "lifecycle": lifecycle if entry.status == "completed" else None,
            }
        )
    return found[:4]


def on_now(continuation: dict, caught_up: bool, lifecycle_state: str) -> bool:
    """Same inclusion as the series shelf button. Ended caught-up shows stay off Now."""
    state = continuation.get("state")
    if state == "upcoming" and caught_up and lifecycle_state in _ENDED:
        return False
    return state in {"next", "upcoming"}


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
    found = None
    if album_ids:
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
    if found is None and kind == "track":
        found = (
            db.query(CatalogItem)
            .join(MusicLink, MusicLink.parent_catalog_id == CatalogItem.id)
            .filter(
                MusicLink.child_catalog_id == entry.catalog_id,
                MusicLink.relation == _DIRECT_TRACK,
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
