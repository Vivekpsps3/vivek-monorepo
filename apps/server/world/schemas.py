"""Response models for GET /api/world (worldgen design section 3.2).

Trips and finished media are W3a; concepts are L1a. The concept model is
declared minimal here so the OpenAPI shape is stable, and the endpoint
returns an empty list for concepts until L1a lands.
"""

from __future__ import annotations

from datetime import date
from typing import Any

from pydantic import BaseModel, ConfigDict, model_serializer


class WorldMeta(BaseModel):
    today: date
    current_week: date
    start_week: date
    version: int


class WorldPlace(BaseModel):
    label: str
    lat_e2: int | None


class WorldTrip(BaseModel):
    id: int
    title: str
    start: date
    end: date
    place: WorldPlace | None


class WorldFinished(BaseModel):
    entry_id: int
    kind: str
    title: str
    on: date


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
    # Omitted from the JSON unless some finished rows were capped away (> 0),
    # matching the engine's `finished_more?` shape in the design (section 3.2).
    finished_more: int = 0
    habits: list[WorldHabit]
    concepts: list[WorldConcept]

    @model_serializer(mode="wrap", when_used="json")
    def _omit_empty_finished_more(self, handler: Any) -> Any:
        data = handler(self)
        if not self.finished_more:
            data.pop("finished_more", None)
        return data


class WorldResponse(BaseModel):
    meta: WorldMeta
    weeks: list[WorldWeek]
