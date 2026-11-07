"""Response models for GET /api/world (worldgen design section 3.2).

Trips and finished media are W3a; their models are declared minimal here so
the OpenAPI shape is stable, and the endpoint returns empty lists for them
in this PR. Concepts are L1a: WorldConcept is filled in, and the Concept
models below back the /api/world/concepts endpoints (section 4.3).
"""

from __future__ import annotations

from datetime import date, datetime

from pydantic import BaseModel, ConfigDict


class WorldMeta(BaseModel):
    today: date
    current_week: date
    start_week: date
    version: int


class WorldTrip(BaseModel):
    """Minimal placeholder; W3a fills in the section 3.2 trip fields."""

    model_config = ConfigDict(extra="allow")


class WorldFinished(BaseModel):
    """Minimal placeholder; W3a fills in the section 3.2 finished fields."""

    model_config = ConfigDict(extra="allow")


class WorldConcept(BaseModel):
    id: int
    name: str
    on: date


class Concept(BaseModel):
    """One concept as the concepts API returns it (design section 4.3)."""

    id: int
    name: str
    note: str | None
    source: str | None
    understood_on: date | None
    archived: bool
    created_at: datetime
    updated_at: datetime


class ConceptCreate(BaseModel):
    name: str
    note: str | None = None
    source: str | None = None
    understood_on: date | None = None
    tz: str | None = None


class ConceptPatch(BaseModel):
    name: str | None = None
    note: str | None = None
    source: str | None = None
    understood_on: date | None = None
    archived: bool | None = None
    tz: str | None = None


class WorldHabit(BaseModel):
    habit_id: int
    name: str
    style: str
    archived: bool
    days: list[date]


class WorldWeek(BaseModel):
    week: date
    trips: list[WorldTrip]
    finished: list[WorldFinished]
    habits: list[WorldHabit]
    concepts: list[WorldConcept]


class WorldResponse(BaseModel):
    meta: WorldMeta
    weeks: list[WorldWeek]
