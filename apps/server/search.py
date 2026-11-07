"""GET /api/search — scoped unified search (Bundle S).

Read-only, owner-scoped, no provider or HTTP client imports: matching is a
case-insensitive (ASCII, SQLite LIKE) substring search over the caller's
own trips, stays, plan items and media entries. SQLite LIKE folds case for
ASCII only, so Unicode titles match case-sensitively beyond ASCII — that
is acceptable and documented here per the spec.

Results rank exact > prefix > word-prefix > substring, best field wins,
and are merged across sources in travel-then-media order.
"""

from __future__ import annotations

import json
import re

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from apps.media.backend.models import CatalogItem, UserEntry
from apps.server.auth import Principal, require_principal
from apps.server.database import get_db
from apps.travel.backend.models import PlanItem, Stay, Trip

router = APIRouter(tags=["search"])

MAX_Q_LENGTH = 100
MAX_RECENT_REFS = 5

_APP_ORDER = {"travel": 0, "media": 1}
_KIND_ORDER = {"trip": 0, "place": 1, "plan": 2, "media": 3}
# Field rank for breaking score ties: title first, then the others.
_FIELD_RANK = {"title": 0, "origin": 1, "city": 1, "place": 1, "creator": 1, "lodging": 2, "tag": 2}

_WORDS = re.compile(r"[^\W_]+", re.UNICODE)


def _escape_like(text: str) -> str:
    return text.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


def _like(column, needle: str):
    """ASCII case-insensitive substring match with wildcards escaped."""
    return func.lower(column).like(f"%{_escape_like(needle.lower())}%", escape="\\")


def _contains(value: str | None, needle: str) -> bool:
    return value is not None and needle.lower() in value.lower()


def _score(value: str, needle: str) -> int:
    """0 exact, 1 prefix, 2 word-prefix, 3 other substring. Assumes a match."""
    folded = value.casefold()
    target = needle.casefold()
    if folded == target:
        return 0
    if folded.startswith(target):
        return 1
    if any(word.startswith(target) for word in _WORDS.findall(folded)):
        return 2
    return 3


def _best(fields: list[tuple[str, str | None]], needle: str) -> tuple[int, str] | None:
    """Best (score, matched-field) over the fields that contain the needle."""
    best: tuple[int, int, str] | None = None
    for name, value in fields:
        if not _contains(value, needle):
            continue
        candidate = (_score(value or "", needle), _FIELD_RANK[name], name)
        if best is None or candidate < best:
            best = candidate
    if best is None:
        return None
    return best[0], best[2]


class _Hit:
    __slots__ = (
        "app",
        "detail",
        "href",
        "id",
        "kind",
        "matched",
        "media_kind",
        "on",
        "score",
        "title",
    )

    def __init__(self, *, app, kind, id, title, detail, on, matched, href, media_kind, score):
        self.app = app
        self.kind = kind
        self.id = id
        self.title = title
        self.detail = detail
        self.on = on
        self.matched = matched
        self.href = href
        self.media_kind = media_kind
        self.score = score

    def sort_key(self):
        return (
            self.score,
            _APP_ORDER[self.app],
            _KIND_ORDER[self.kind],
            self.title.casefold(),
            self.id,
        )

    def payload(self) -> dict:
        return {
            "app": self.app,
            "kind": self.kind,
            "id": self.id,
            "title": self.title,
            "detail": self.detail,
            "date": self.on.isoformat() if self.on is not None else None,
            "matched": self.matched,
            "href": self.href,
            "media_kind": self.media_kind,
        }


def _trip_detail(cities: list[str]) -> str | None:
    unique = list(dict.fromkeys(city for city in cities if city))
    return ", ".join(unique[:3]) if unique else None


def _search_trips(db: Session, uid: int, needle: str, limit: int) -> list[_Hit]:
    rows = (
        db.execute(
            select(Trip)
            .where(
                Trip.user_id == uid,
                or_(_like(Trip.title, needle), _like(Trip.origin_label, needle)),
            )
            .limit(limit + 1)
        )
        .scalars()
        .all()
    )
    stays = (
        db.execute(
            select(Stay)
            .where(Stay.trip_id.in_([trip.id for trip in rows] or [0]))
            .order_by(Stay.trip_id, Stay.sort_order, Stay.id)
        )
        .scalars()
        .all()
    )
    cities: dict[int, list[str]] = {}
    for stay in stays:
        cities.setdefault(stay.trip_id, []).append(stay.city)
    hits = []
    for trip in rows:
        best = _best([("title", trip.title), ("origin", trip.origin_label)], needle)
        if best is None:
            continue
        score, matched = best
        hits.append(
            _Hit(
                app="travel",
                kind="trip",
                id=trip.id,
                title=trip.title,
                detail=_trip_detail(cities.get(trip.id, [])),
                on=trip.start_date,
                matched=matched,
                href=f"/travel/trips/{trip.id}",
                media_kind=None,
                score=score,
            )
        )
    return hits


def _search_places(db: Session, uid: int, needle: str, limit: int) -> list[_Hit]:
    rows = db.execute(
        select(Stay, Trip)
        .join(Trip, Stay.trip_id == Trip.id)
        .where(
            Trip.user_id == uid,
            or_(_like(Stay.city, needle), _like(Stay.lodging_name, needle)),
        )
        .limit(limit + 1)
    ).all()
    hits = []
    for stay, trip in rows:
        best = _best([("city", stay.city), ("lodging", stay.lodging_name)], needle)
        if best is None:
            continue
        score, matched = best
        hits.append(
            _Hit(
                app="travel",
                kind="place",
                id=stay.id,
                title=stay.lodging_name or stay.city,
                detail=trip.title,
                on=stay.arrive_on,
                matched=matched,
                href=f"/travel/trips/{trip.id}",
                media_kind=None,
                score=score,
            )
        )
    return hits


def _search_plans(db: Session, uid: int, needle: str, limit: int) -> list[_Hit]:
    rows = db.execute(
        select(PlanItem, Trip)
        .join(Trip, PlanItem.trip_id == Trip.id)
        .where(
            Trip.user_id == uid,
            or_(_like(PlanItem.title, needle), _like(PlanItem.place_name, needle)),
        )
        .limit(limit + 1)
    ).all()
    hits = []
    for plan, trip in rows:
        best = _best([("title", plan.title), ("place", plan.place_name)], needle)
        if best is None:
            continue
        score, matched = best
        detail = trip.title
        if plan.place_name:
            detail = f"{trip.title} · {plan.place_name}"
        hits.append(
            _Hit(
                app="travel",
                kind="plan",
                id=plan.id,
                title=plan.title,
                detail=detail,
                on=plan.on_date,
                matched=matched,
                href=f"/travel/trips/{trip.id}",
                media_kind=None,
                score=score,
            )
        )
    return hits


def _tags_of(raw: str | None) -> list[str]:
    if not raw:
        return []
    try:
        decoded = json.loads(raw)
    except ValueError:
        return []
    if not isinstance(decoded, list):
        return []
    return [tag for tag in decoded if isinstance(tag, str)]


def _search_media(db: Session, uid: int, needle: str, limit: int) -> list[_Hit]:
    rows = db.execute(
        select(UserEntry, CatalogItem)
        .join(CatalogItem, UserEntry.catalog_id == CatalogItem.id)
        .where(
            UserEntry.user_id == uid,
            or_(
                _like(CatalogItem.title, needle),
                _like(CatalogItem.creator, needle),
                # Pre-filter on the tags JSON text; confirmed per-tag below.
                _like(UserEntry.tags, needle),
            ),
        )
        .limit(limit + 1)
    ).all()
    hits = []
    for entry, catalog in rows:
        fields: list[tuple[str, str | None]] = [
            ("title", catalog.title),
            ("creator", catalog.creator),
        ]
        tag_best: tuple[int, str] | None = None
        for tag in _tags_of(entry.tags):
            if _contains(tag, needle):
                candidate = (_score(tag, needle), "tag")
                if tag_best is None or candidate[0] < tag_best[0]:
                    tag_best = candidate
        best = _best(fields, needle)
        if tag_best is not None and (best is None or tag_best[0] < best[0]):
            best = tag_best
        if best is None:
            continue
        score, matched = best
        detail_parts = [
            part for part in (catalog.creator, str(catalog.year) if catalog.year else None) if part
        ]
        hits.append(
            _Hit(
                app="media",
                kind="media",
                id=entry.id,
                title=catalog.title,
                detail=" · ".join(detail_parts) if detail_parts else None,
                on=None,
                matched=matched,
                href=f"/media/item/{entry.id}",
                media_kind=catalog.kind,
                score=score,
            )
        )
    return hits


_SOURCES = (_search_trips, _search_places, _search_plans, _search_media)


def _resolve_recent(db: Session, uid: int, app: str, kind: str, item_id: int) -> _Hit | None:
    """One owner-scoped recent ref, or None when unknown/not owned."""
    if app == "travel" and kind == "trip":
        trip = db.execute(
            select(Trip).where(Trip.id == item_id, Trip.user_id == uid)
        ).scalar_one_or_none()
        if trip is None:
            return None
        stays = (
            db.execute(
                select(Stay).where(Stay.trip_id == trip.id).order_by(Stay.sort_order, Stay.id)
            )
            .scalars()
            .all()
        )
        return _Hit(
            app=app,
            kind=kind,
            id=trip.id,
            title=trip.title,
            detail=_trip_detail([stay.city for stay in stays]),
            on=trip.start_date,
            matched="title",
            href=f"/travel/trips/{trip.id}",
            media_kind=None,
            score=0,
        )
    if app == "travel" and kind == "place":
        stay_row = db.execute(
            select(Stay, Trip)
            .join(Trip, Stay.trip_id == Trip.id)
            .where(Stay.id == item_id, Trip.user_id == uid)
        ).first()
        if stay_row is None:
            return None
        stay, trip = stay_row
        return _Hit(
            app=app,
            kind=kind,
            id=stay.id,
            title=stay.lodging_name or stay.city,
            detail=trip.title,
            on=stay.arrive_on,
            matched="title",
            href=f"/travel/trips/{trip.id}",
            media_kind=None,
            score=0,
        )
    if app == "travel" and kind == "plan":
        plan_row = db.execute(
            select(PlanItem, Trip)
            .join(Trip, PlanItem.trip_id == Trip.id)
            .where(PlanItem.id == item_id, Trip.user_id == uid)
        ).first()
        if plan_row is None:
            return None
        plan, trip = plan_row
        detail = trip.title
        if plan.place_name:
            detail = f"{trip.title} · {plan.place_name}"
        return _Hit(
            app=app,
            kind=kind,
            id=plan.id,
            title=plan.title,
            detail=detail,
            on=plan.on_date,
            matched="title",
            href=f"/travel/trips/{trip.id}",
            media_kind=None,
            score=0,
        )
    if app == "media" and kind == "media":
        media_row = db.execute(
            select(UserEntry, CatalogItem)
            .join(CatalogItem, UserEntry.catalog_id == CatalogItem.id)
            .where(UserEntry.id == item_id, UserEntry.user_id == uid)
        ).first()
        if media_row is None:
            return None
        entry, catalog = media_row
        detail_parts = [
            part for part in (catalog.creator, str(catalog.year) if catalog.year else None) if part
        ]
        return _Hit(
            app=app,
            kind=kind,
            id=entry.id,
            title=catalog.title,
            detail=" · ".join(detail_parts) if detail_parts else None,
            on=None,
            matched="title",
            href=f"/media/item/{entry.id}",
            media_kind=catalog.kind,
            score=0,
        )
    return None


_REF_KINDS = {("travel", "trip"), ("travel", "place"), ("travel", "plan"), ("media", "media")}


def _parse_recent(raw: str) -> list[tuple[str, str, int]]:
    refs = [part.strip() for part in raw.split(",") if part.strip()]
    if not refs or len(refs) > MAX_RECENT_REFS:
        raise HTTPException(status_code=422, detail="Invalid recent refs")
    parsed = []
    for ref in refs:
        parts = ref.split(":")
        if len(parts) != 3:
            raise HTTPException(status_code=422, detail="Invalid recent refs")
        app, kind, raw_id = parts
        if (app, kind) not in _REF_KINDS or not raw_id.isdigit() or int(raw_id) < 1:
            raise HTTPException(status_code=422, detail="Invalid recent refs")
        parsed.append((app, kind, int(raw_id)))
    return parsed


@router.get("/search")
def search(
    response: Response,
    q: str | None = None,
    recent: str | None = None,
    limit: int = Query(default=20, ge=1, le=20),
    principal: Principal = Depends(require_principal),
    db: Session = Depends(get_db, scope="function"),
) -> dict:
    response.headers["Cache-Control"] = "no-store"
    if q is not None and recent is not None:
        raise HTTPException(status_code=422, detail="q and recent are mutually exclusive")
    if recent is not None:
        recent_hits = []
        for app, kind, item_id in _parse_recent(recent):
            hit = _resolve_recent(db, principal.id, app, kind, item_id)
            if hit is not None:
                recent_hits.append(hit)
        return {
            "q": None,
            "results": [hit.payload() for hit in recent_hits],
            "truncated": False,
        }
    needle = " ".join((q or "").split())
    if len(needle) > MAX_Q_LENGTH:
        raise HTTPException(status_code=422, detail="q is too long")
    if len(needle) < 2:
        # Too short to search: an empty 200, and no query is run.
        return {"q": needle, "results": [], "truncated": False}
    hits: list[_Hit] = []
    for source in _SOURCES:
        hits.extend(source(db, principal.id, needle, limit))
    truncated = len(hits) > limit
    hits.sort(key=lambda hit: hit.sort_key())
    return {
        "q": needle,
        "results": [hit.payload() for hit in hits[:limit]],
        "truncated": truncated,
    }
