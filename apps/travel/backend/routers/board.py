"""Home and calendar reads."""

from datetime import date
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from apps.server.auth import Principal, require_principal
from apps.travel.backend.database import get_db
from apps.travel.backend.schemas import HomeResponse
from apps.travel.backend.services.assemble import build_calendar, build_home, build_summary
from packages.time.today import today_in_zone

router = APIRouter()


@router.get("/home", response_model=HomeResponse)
def home(
    db: Session = Depends(get_db, scope="function"),
    principal: Principal = Depends(require_principal),
):
    return build_home(db, user_id=principal.id)


@router.get("/summary")
def summary(
    tz: str | None = None,
    db: Session = Depends(get_db, scope="function"),
    principal: Principal = Depends(require_principal),
):
    try:
        zone = (tz or "").strip()
        if zone:
            ZoneInfo(zone)
        today = today_in_zone(zone) if zone else None
    except (ZoneInfoNotFoundError, ValueError, OSError) as exc:
        raise HTTPException(status_code=422, detail="Use a valid IANA timezone.") from exc
    return build_summary(db, today=today, user_id=principal.id)


@router.get("/calendar")
def calendar(
    start: date = Query(...),
    end: date = Query(...),
    tz: str | None = None,
    db: Session = Depends(get_db, scope="function"),
    principal: Principal = Depends(require_principal),
):
    try:
        today = today_in_zone(tz) if (tz or "").strip() else None
        return build_calendar(db, start, end, today=today, user_id=principal.id)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
