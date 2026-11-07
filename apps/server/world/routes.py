"""GET /api/world: owner-scoped, read-only. Habits only in this PR (W2a)."""

from __future__ import annotations

from datetime import UTC, datetime

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from apps.server.auth import Principal, require_principal
from apps.server.database import get_db
from apps.server.world.read import read_world, resolve_range, resolve_zone
from apps.server.world.schemas import WorldResponse
from packages.time.today import today_in_zone

router = APIRouter(prefix="/world", tags=["world"])


def get_world_clock() -> datetime:
    """The world clock lives here (no clock.py); tests override this dependency."""
    return datetime.now(UTC)


@router.get("", response_model=WorldResponse)
def get_world(
    tz: str | None = None,
    from_: str | None = Query(default=None, alias="from"),
    to: str | None = None,
    principal: Principal = Depends(require_principal),
    db: Session = Depends(get_db, scope="function"),
    now: datetime = Depends(get_world_clock),
) -> dict:
    zone = resolve_zone(tz)
    today = today_in_zone(zone, now=now)
    from_date, to_date, _current_week = resolve_range(today, from_, to)
    return read_world(db, principal.id, today, from_date, to_date)
