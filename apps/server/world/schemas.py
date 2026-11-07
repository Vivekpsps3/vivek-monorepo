"""Response models for GET /api/world (worldgen design section 3.2).

Trips and finished media are W3a; concepts are L1a. Their models are declared
minimal here so the OpenAPI shape is stable, and the endpoint always returns
empty lists for them in this PR.
"""

from __future__ import annotations

from datetime import date

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
    """Minimal placeholder; L1a fills in the section 3.2 concept fields."""

    model_config = ConfigDict(extra="allow")


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
