"""Response contract for GET /api/pixels.

There are deliberately no Finance fields anywhere in this schema: Finance
activity is vault-only and the server can never see it.
"""

from datetime import date
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

SourceStatus = Literal["ok", "absent", "unavailable"]


class PixelDay(BaseModel):
    model_config = ConfigDict(extra="forbid")

    date: date
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

    birthday: date | None
    show_age: bool


class PixelsResponse(BaseModel):
    model_config = ConfigDict(extra="forbid", populate_by_name=True)

    from_: date = Field(alias="from")
    to: date
    days: list[PixelDay]
    sources: PixelSources
    first_activity_on: date | None
    profile: PixelProfile | None = None
