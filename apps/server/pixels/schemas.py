"""Response contract for GET /api/pixels.

There are deliberately no Finance fields anywhere in this schema: Finance
activity is vault-only and the server can never see it.
"""

import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

SourceStatus = Literal["ok", "absent", "unavailable"]


class PixelDay(BaseModel):
    model_config = ConfigDict(extra="forbid")

    date: datetime.date
    town: int | None = None
    media: int | None = None
    trip: int | None = None


class PixelSources(BaseModel):
    model_config = ConfigDict(extra="forbid")

    town: SourceStatus
    media: SourceStatus
    travel: SourceStatus


class PixelProfile(BaseModel):
    model_config = ConfigDict(extra="forbid")

    birthday: datetime.date | None
    show_age: bool


class PixelsResponse(BaseModel):
    model_config = ConfigDict(extra="forbid", populate_by_name=True)

    from_: datetime.date = Field(alias="from")
    to: datetime.date
    days: list[PixelDay]
    sources: PixelSources
    first_activity_on: datetime.date | None
    profile: PixelProfile | None = None


class PixelFact(BaseModel):
    """One existing source row on the selected civil day. Not a score."""

    model_config = ConfigDict(extra="forbid")

    id: str
    namespace: Literal["habit_checkin", "episode_progress", "trip"]
    occurrence_id: int
    kind: Literal["checkin", "episode", "trip_span"]
    date: datetime.date
    span_start: datetime.date | None = None
    span_end: datetime.date | None = None
    coverage: Literal["complete", "truncated"]
    provenance: str
    title: str | None = None
    route: str


class PixelAnnotation(BaseModel):
    """An active concept understanding. Archiving, deleting, or redate removes it."""

    model_config = ConfigDict(extra="forbid")

    id: str
    concept_id: int
    name: str
    understood_on: datetime.date
    provenance: str


class SourceCoverage(BaseModel):
    model_config = ConfigDict(extra="forbid")

    status: SourceStatus
    included: int
    total: int
    truncated: bool


class PixelCoverage(BaseModel):
    model_config = ConfigDict(extra="forbid")

    town: SourceCoverage
    media: SourceCoverage
    travel: SourceCoverage
    concepts: SourceCoverage


class PixelDifference(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str
    text: str


class PixelDayCounts(BaseModel):
    """The same channel counts as GET /api/pixels for this day. Not a second score."""

    model_config = ConfigDict(extra="forbid")

    town: int | None = None
    media: int | None = None
    trip: int | None = None


class PixelDayResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    date: datetime.date
    facts: list[PixelFact]
    annotations: list[PixelAnnotation]
    coverage: PixelCoverage
    differences: list[PixelDifference]
    counts: PixelDayCounts
