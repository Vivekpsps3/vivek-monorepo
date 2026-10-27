"""Explicit saved metadata refresh. Reads never fan out to providers."""

from datetime import UTC, datetime, timedelta

from sqlalchemy.orm import Session

from apps.media.backend.models import CatalogItem, Episode, SeriesLifecycle, UserEntry, utc_now
from apps.media.backend.services.validate import choice, clean_text, fail, parse_date
from apps.server.database import release_for_provider_io
from apps.server.errors import APIError


def normalize_lifecycle(value) -> str:
    text = str(value or "").strip().casefold()
    if text in {
        "running",
        "returning series",
        "in production",
        "planned",
        "pilot",
        "ongoing",
        "to be determined",
    }:
        return "ongoing"
    if text in {"canceled", "cancelled"}:
        return "canceled"
    return "ended" if text == "ended" else "unknown"


def lifecycle(db: Session, catalog_id: int) -> dict:
    row = db.query(SeriesLifecycle).filter(SeriesLifecycle.catalog_id == catalog_id).one_or_none()
    return lifecycle_payload(row)


def lifecycle_payload(row: SeriesLifecycle | None) -> dict:
    """The same freshness contract for one detail or a batch of library cards."""
    if row is None:
        return {
            "state": "unknown",
            "freshness": "unknown",
            "completeness": "unknown",
            "fetched_at": None,
        }
    fetched = row.fetched_at
    if fetched is not None and fetched.tzinfo is None:
        fetched = fetched.replace(tzinfo=UTC)
    return {
        "state": row.lifecycle,
        "raw_value": row.raw_value,
        "source": row.source,
        "source_id": row.source_id,
        "fetched_at": fetched.isoformat() if fetched else None,
        "freshness": "fresh"
        if fetched and datetime.now(UTC) - fetched < timedelta(hours=24)
        else "stale"
        if fetched
        else "unknown",
        "completeness": row.completeness,
    }


def ingest_series(db: Session, catalog: CatalogItem, detail: dict) -> None:
    extra = detail.get("extra")
    if not isinstance(extra, dict):
        extra = {}
    raw = extra.get("lifecycle")
    row = db.query(SeriesLifecycle).filter(SeriesLifecycle.catalog_id == catalog.id).one_or_none()
    if row is None:
        row = SeriesLifecycle(catalog_id=catalog.id)
        db.add(row)
    row.lifecycle = normalize_lifecycle(raw)
    row.raw_value = str(raw)[:80] if raw else None
    row.source = catalog.source
    row.source_id = catalog.source_id
    row.fetched_at = utc_now()
    row.freshness = "fresh"
    row.completeness = extra.get("episode_completeness", "partial")
    # Keep stable provider identities and personal marks when episode numbering changes.
    stored = db.query(Episode).filter(Episode.catalog_id == catalog.id).all()
    by_source = {episode.source_id: episode for episode in stored if episode.source_id}
    by_number = {(episode.season_number, episode.episode_number): episode for episode in stored}
    for item in detail.get("episodes") or []:
        if not isinstance(item, dict):
            continue
        season, number = item.get("season_number"), item.get("episode_number")
        if (
            isinstance(season, bool)
            or isinstance(number, bool)
            or not isinstance(season, int)
            or not isinstance(number, int)
            or season < 0
            or number < 1
        ):
            continue
        identity = str(item["source_id"])[:120] if item.get("source_id") else None
        episode = by_source.get(identity) if identity else None
        at_number = by_number.get((season, number))
        if episode is None:
            # A different upstream id at the same number is a conflict, never a silent replacement.
            if (
                at_number is not None
                and identity
                and at_number.source_id
                and identity != at_number.source_id
            ):
                row.completeness = "partial"
                continue
            episode = at_number
        elif at_number is not None and at_number is not episode:
            row.completeness = "partial"
            continue
        if episode is None:
            episode = Episode(catalog_id=catalog.id, season_number=season, episode_number=number)
            db.add(episode)
        else:
            by_number.pop((episode.season_number, episode.episode_number), None)
        episode.season_number, episode.episode_number = season, number
        episode.source_id = identity or episode.source_id
        episode.title = str(item["title"])[:300] if item.get("title") else episode.title
        episode.overview = (
            str(item["overview"])[:4000] if item.get("overview") else episode.overview
        )
        episode.air_date = parse_date(item.get("air_date"), "Air date")
        by_number[(season, number)] = episode
        if identity:
            by_source[identity] = episode
    db.flush()


def refresh(db: Session, entry: UserEntry, body: dict | None = None) -> None:
    from apps.media.backend.services import providers, records

    catalog = entry.catalog
    source, identity = catalog.source, catalog.source_id
    linking = catalog.source == "manual" and body is not None
    if linking and body is not None:
        if catalog.kind != "tv":
            fail("Metadata linking is for a manual show.")
        source = choice(body.get("source"), set(providers.sources_for_kind("tv")), "Series source")
        identity = clean_text(body.get("source_id"), 120, "Provider id", required=True)
        if source not in providers.sources_for_kind("tv"):
            fail("Choose a supported series source.")
        duplicate = (
            db.query(CatalogItem.id)
            .filter(
                CatalogItem.source == source,
                CatalogItem.source_id == identity,
                CatalogItem.id != catalog.id,
            )
            .first()
        )
        if duplicate:
            raise APIError(
                409,
                "identity_conflict",
                "This provider show already exists. Keep this entry or open the existing show; your progress has not changed.",
            )
    if source == "manual" or not identity:
        fail("Link a provider identity before refreshing this item.")
    release_for_provider_io(db)
    key = f"saved-detail:{source}:{catalog.kind}:{identity}"

    def load():
        found = providers.lookup_detail(source, catalog.kind, identity)
        if not found:
            raise ValueError("Provider detail unavailable")
        return [found]

    providers.SEARCH_CACHE.retry_failure(key)
    outcome = providers.SEARCH_CACHE.run(key, load)
    detail = outcome.rows[0] if outcome.rows else None
    if detail is None or not records._detail_matches(detail, source, catalog.kind, identity):
        raise APIError(
            502,
            "provider_unavailable",
            "Metadata could not refresh. Your saved item, photo, review and progress are unchanged.",
        )
    if linking:
        catalog.source, catalog.source_id = source, identity
    records._apply_authoritative(db, catalog, detail)
    db.flush()
