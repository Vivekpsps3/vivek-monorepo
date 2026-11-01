"""Town read route. The remaining read routes and response models belong to TB2B-1b."""

from datetime import datetime

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from apps.server.auth import Principal, require_principal
from apps.server.database import get_db
from apps.server.town.clock import get_town_clock, resolve_tz
from apps.server.town.service import read_town
from packages.time.today import today_in_zone

router = APIRouter(prefix="/town", tags=["town"])


@router.get("")
def get_town(
    tz: str | None = None,
    db: Session = Depends(get_db, scope="function"),
    principal: Principal = Depends(require_principal),
    now: datetime = Depends(get_town_clock),
) -> dict:
    zone = resolve_tz(tz)
    return read_town(db, principal.id, today_in_zone(zone, now), zone)
