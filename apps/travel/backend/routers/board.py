"""Home and calendar reads."""

from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from apps.travel.backend.database import get_db
from apps.travel.backend.services.assemble import build_calendar, build_home, build_summary
from packages.time.today import today_in_zone

router = APIRouter()


@router.get("/home")
def home(db: Session = Depends(get_db)):
    return build_home(db)


@router.get("/summary")
def summary(db: Session = Depends(get_db)):
    return build_summary(db)


@router.get("/calendar")
def calendar(
    start: date = Query(...),
    end: date = Query(...),
    tz: str | None = None,
    db: Session = Depends(get_db),
):
    try:
        today = today_in_zone(tz) if (tz or "").strip() else None
        return build_calendar(db, start, end, today=today)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
