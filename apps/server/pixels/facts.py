"""Selected-day facts for GET /api/pixels/day.

The rows are a projection of habit check-ins, watched episodes, trips, and
active concept understandings. There is no fact table. Channel counts stay on
the range query. Concept annotations are not score channels.
"""

from __future__ import annotations

from datetime import date
from typing import Any, Literal

from sqlalchemy import inspect, text
from sqlalchemy.orm import Session

from apps.server.pixels.schemas import (
    PixelAnnotation,
    PixelCoverage,
    PixelDayCounts,
    PixelDayResponse,
    PixelDifference,
    PixelFact,
    SourceCoverage,
    SourceStatus,
)

# One selected day can still be crowded. The score count stays complete.
FACT_CAP = 50

CHECKIN_PROVENANCE = (
    "Pixels counts this habit check-in on its civil day. "
    "A Town streak is a separate run of check-ins and is not an extra point on this day."
)
EPISODE_PROVENANCE = (
    "Pixels counts this watched episode on watched_on. "
    "That count can also earn Town credit. "
    "A finished book, movie, show, or game is a World artifact and is not this episode count."
)
TRIP_PROVENANCE = (
    "Pixels counts this trip on each civil day from its start through its end. "
    "Town credits a booked or done trip once, on the day after it ends."
)
CONCEPT_PROVENANCE = (
    "This is the concept's understood date. "
    "Archiving, deleting, or moving the date removes the annotation. "
    "It does not change the Pixels score."
)

DIFFERENCES: tuple[PixelDifference, ...] = (
    PixelDifference(
        id="episode-versus-finished",
        text=(
            "A watched episode counts in Pixels on watched_on and can earn Town credit. "
            "A finished book, movie, show, or game is a World artifact and can earn Town credit. "
            "It is not a Pixels media count."
        ),
    ),
    PixelDifference(
        id="trip-span-versus-credit",
        text=(
            "Pixels counts each civil day a trip spans. "
            "Town credits a booked or done trip once, on the day after it ends."
        ),
    ),
    PixelDifference(
        id="concept-not-score",
        text=(
            "A concept understanding is a dated learning annotation. "
            "Archiving, deleting, or changing its date removes that annotation. "
            "It does not change the Pixels score."
        ),
    ),
    PixelDifference(
        id="budget-versus-streak",
        text=(
            "A Finance budget-kept day and a Town habit streak are different records. "
            "This response does not include Finance amounts."
        ),
    ),
)

_CHECKINS = (
    "SELECT c.id AS id, h.name AS title FROM habit_checkins AS c "
    "LEFT JOIN habits AS h ON h.id = c.habit_id AND h.user_id = c.user_id "
    "WHERE c.user_id = :me AND c.day = :day ORDER BY c.id LIMIT :limit"
)
_EPISODES = (
    "SELECT p.id AS id, cat.title AS title FROM episode_progress AS p "
    "LEFT JOIN episodes AS e ON e.id = p.episode_id "
    "LEFT JOIN catalog_items AS cat ON cat.id = e.catalog_id "
    "WHERE p.user_id = :me AND p.watched_on = :day ORDER BY p.id LIMIT :limit"
)
_TRIPS = (
    "SELECT id, title, start_date, end_date FROM trips "
    "WHERE user_id = :me AND end_date >= :day AND start_date <= :day "
    "ORDER BY id LIMIT :limit"
)
_CONCEPT_COUNT = (
    "SELECT COUNT(*) AS n FROM world_concepts "
    "WHERE user_id = :me AND understood_on = :day AND archived_at IS NULL"
)
_CONCEPTS = (
    "SELECT id, name, understood_on FROM world_concepts "
    "WHERE user_id = :me AND understood_on = :day AND archived_at IS NULL "
    "ORDER BY id LIMIT :limit"
)


def _as_status(value: str) -> SourceStatus:
    if value == "ok":
        return "ok"
    if value == "absent":
        return "absent"
    return "unavailable"


def _as_date(value: object) -> date:
    if isinstance(value, date):
        return value
    return date.fromisoformat(str(value)[:10])


def _text(value: object) -> str | None:
    if not isinstance(value, str) or value == "":
        return None
    return value


def _select(db: Session, statement: str, params: dict[str, Any]) -> Any:
    return db.execute(text(statement), params)


def _empty(status: SourceStatus, total: int = 0) -> SourceCoverage:
    return SourceCoverage(status=status, included=0, total=total, truncated=False)


def _flag(coverage: SourceCoverage) -> Literal["complete", "truncated"]:
    if coverage.truncated:
        return "truncated"
    return "complete"


def _bounded(
    db: Session,
    *,
    status: SourceStatus,
    known_total: int,
    count_sql: str | None,
    row_sql: str,
    params: dict[str, Any],
) -> tuple[list[Any], SourceCoverage]:
    if status != "ok":
        return [], _empty(status)
    try:
        total = known_total
        if count_sql is not None:
            total = int(_select(db, count_sql, params).scalar_one())
        rows: list[Any] = []
        if total > 0:
            rows = list(_select(db, row_sql, {**params, "limit": FACT_CAP}).all())
        included = len(rows)
        return rows, SourceCoverage(
            status="ok",
            included=included,
            total=total,
            truncated=total > included,
        )
    except Exception:
        db.rollback()
        return [], _empty("unavailable", known_total)


def _concept_status(db: Session) -> SourceStatus:
    try:
        if not inspect(db.get_bind()).has_table("world_concepts"):
            return "absent"
    except Exception:
        db.rollback()
        return "unavailable"
    return "ok"


def _checkin(row: Any, day: date, coverage: SourceCoverage) -> PixelFact:
    return PixelFact(
        id=f"habit_checkin:{int(row.id)}",
        namespace="habit_checkin",
        occurrence_id=int(row.id),
        kind="checkin",
        date=day,
        coverage=_flag(coverage),
        provenance=CHECKIN_PROVENANCE,
        title=_text(row.title),
        route="/town/",
    )


def _episode(row: Any, day: date, coverage: SourceCoverage) -> PixelFact:
    return PixelFact(
        id=f"episode_progress:{int(row.id)}",
        namespace="episode_progress",
        occurrence_id=int(row.id),
        kind="episode",
        date=day,
        coverage=_flag(coverage),
        provenance=EPISODE_PROVENANCE,
        title=_text(row.title),
        route="/media/",
    )


def _trip(row: Any, day: date, coverage: SourceCoverage) -> PixelFact:
    return PixelFact(
        id=f"trip:{int(row.id)}",
        namespace="trip",
        occurrence_id=int(row.id),
        kind="trip_span",
        date=day,
        span_start=_as_date(row.start_date),
        span_end=_as_date(row.end_date),
        coverage=_flag(coverage),
        provenance=TRIP_PROVENANCE,
        title=_text(row.title),
        route=f"/travel/trips/{int(row.id)}",
    )


def _annotation(row: Any) -> PixelAnnotation:
    return PixelAnnotation(
        id=f"world_concept:{int(row.id)}",
        concept_id=int(row.id),
        name=str(row.name),
        understood_on=_as_date(row.understood_on),
        provenance=CONCEPT_PROVENANCE,
    )


def project_day(
    db: Session,
    user_id: int,
    day: date,
    *,
    town_status: str,
    media_status: str,
    travel_status: str,
    town_count: int,
    media_count: int,
    trip_count: int,
) -> PixelDayResponse:
    params: dict[str, Any] = {"me": user_id, "day": day.isoformat()}
    checkins, town = _bounded(
        db,
        status=_as_status(town_status),
        known_total=town_count,
        count_sql=None,
        row_sql=_CHECKINS,
        params=params,
    )
    episodes, media = _bounded(
        db,
        status=_as_status(media_status),
        known_total=media_count,
        count_sql=None,
        row_sql=_EPISODES,
        params=params,
    )
    trips, travel = _bounded(
        db,
        status=_as_status(travel_status),
        known_total=trip_count,
        count_sql=None,
        row_sql=_TRIPS,
        params=params,
    )
    concept_rows, concepts = _bounded(
        db,
        status=_concept_status(db),
        known_total=0,
        count_sql=_CONCEPT_COUNT,
        row_sql=_CONCEPTS,
        params=params,
    )
    facts = [
        *[_checkin(row, day, town) for row in checkins],
        *[_episode(row, day, media) for row in episodes],
        *[_trip(row, day, travel) for row in trips],
    ]
    facts.sort(key=lambda fact: fact.id)
    annotations = [_annotation(row) for row in concept_rows]
    annotations.sort(key=lambda item: item.concept_id)
    return PixelDayResponse(
        date=day,
        facts=facts,
        annotations=annotations,
        coverage=PixelCoverage(town=town, media=media, travel=travel, concepts=concepts),
        differences=list(DIFFERENCES),
        counts=PixelDayCounts(
            town=town_count or None,
            media=media_count or None,
            trip=trip_count or None,
        ),
    )
