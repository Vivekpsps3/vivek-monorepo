"""Home and calendar reads."""

from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from database import get_db
from services.assemble import build_calendar, build_home

router = APIRouter()


@router.get("/home")
def home(db: Session = Depends(get_db)):
    return build_home(db)


@router.get("/calendar")
def calendar(
    start: date = Query(...),
    end: date = Query(...),
    db: Session = Depends(get_db),
):
    try:
        return build_calendar(db, start, end)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
