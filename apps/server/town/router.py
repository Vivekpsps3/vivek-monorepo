"""Town routes."""

import re
from datetime import date, datetime
from typing import Annotated

from fastapi import APIRouter, Depends, Query, Request, Response
from sqlalchemy.orm import Session

from apps.server.auth import Principal, require_principal
from apps.server.database import get_db
from apps.server.errors import APIError
from apps.server.identity.models import User
from apps.server.identity.session import get_current_user
from apps.server.town import writes
from apps.server.town.clock import get_town_clock, resolve_tz
from apps.server.town.schemas import CheckinDays, CheckinResult, Habit, HabitList, Town
from apps.server.town.service import read_checkins, read_habits, read_town
from packages.time.today import today_in_zone

router = APIRouter(prefix="/town", tags=["town"])

_DATE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
_CHECK_FIELDS = "Check the highlighted fields."


def _reject() -> APIError:
    # Bad or missing from/to: field_errors stays null (Q4).
    return APIError(422, "validation_error", _CHECK_FIELDS)


def _date_param(value: str | None) -> date:
    if value is None or _DATE.fullmatch(value) is None:
        raise _reject()
    try:
        return date.fromisoformat(value)
    except ValueError:
        raise _reject() from None


def _archived_flag(value: str | None) -> bool:
    # Absent, blank, or 0 excludes archived habits. Any other value is 422 (Q3).
    if value is None or value in {"", "0"}:
        return False
    if value == "1":
        return True
    raise _reject()


def _zone(tz: str | None, now: datetime) -> tuple[str, date]:
    zone = resolve_tz(tz)
    return zone, today_in_zone(zone, now)


@router.get("", response_model=Town)
def get_town(
    tz: str | None = None,
    db: Session = Depends(get_db, scope="function"),
    principal: Principal = Depends(require_principal),
    now: datetime = Depends(get_town_clock),
) -> Town:
    zone = resolve_tz(tz)
    return Town.model_validate(read_town(db, principal.id, today_in_zone(zone, now), zone))


@router.get("/habits", response_model=HabitList)
def get_habits(
    tz: str | None = None,
    include_archived: str | None = None,
    db: Session = Depends(get_db, scope="function"),
    principal: Principal = Depends(require_principal),
    now: datetime = Depends(get_town_clock),
) -> HabitList:
    zone = resolve_tz(tz)
    return HabitList.model_validate(
        read_habits(
            db,
            principal.id,
            today_in_zone(zone, now),
            zone,
            include_archived=_archived_flag(include_archived),
        )
    )


@router.get("/habits/{habit_id}/checkins", response_model=CheckinDays)
def get_checkins(
    habit_id: int,
    start: Annotated[str | None, Query(alias="from")] = None,
    end: Annotated[str | None, Query(alias="to")] = None,
    tz: str | None = None,
    db: Session = Depends(get_db, scope="function"),
    principal: Principal = Depends(require_principal),
) -> CheckinDays:
    resolve_tz(tz)  # accepted like the other reads; stored days are already local
    first = _date_param(start)
    last = _date_param(end)
    if first > last or (last - first).days > 120:
        raise _reject()
    return CheckinDays.model_validate(read_checkins(db, principal.id, habit_id, first, last))


@router.post("/habits", response_model=Habit, status_code=201)
async def post_habit(
    request: Request,
    tz: str | None = None,
    db: Session = Depends(get_db, scope="function"),
    user: User = Depends(get_current_user),
    now: datetime = Depends(get_town_clock),
) -> Habit:
    zone, today = _zone(tz, now)
    payload = await writes.create_habit(db, user.id, today, now, zone, request)
    return Habit.model_validate(payload)


@router.patch("/habits/{habit_id}", response_model=Habit)
async def patch_habit(
    habit_id: int,
    request: Request,
    tz: str | None = None,
    db: Session = Depends(get_db, scope="function"),
    user: User = Depends(get_current_user),
    now: datetime = Depends(get_town_clock),
) -> Habit:
    zone, today = _zone(tz, now)
    payload = await writes.patch_habit(db, user.id, habit_id, today, now, zone, request)
    return Habit.model_validate(payload)


@router.post("/habits/{habit_id}/checkins", response_model=CheckinResult)
async def post_checkin(
    habit_id: int,
    request: Request,
    response: Response,
    tz: str | None = None,
    db: Session = Depends(get_db, scope="function"),
    user: User = Depends(get_current_user),
    now: datetime = Depends(get_town_clock),
) -> CheckinResult:
    zone, today = _zone(tz, now)
    payload, status = await writes.create_checkin(db, user.id, habit_id, today, now, zone, request)
    response.status_code = status
    return CheckinResult.model_validate(payload)


@router.delete("/habits/{habit_id}/checkins/{day}", response_model=CheckinResult)
def delete_checkin(
    habit_id: int,
    day: str,
    tz: str | None = None,
    db: Session = Depends(get_db, scope="function"),
    user: User = Depends(get_current_user),
    now: datetime = Depends(get_town_clock),
) -> CheckinResult:
    zone, today = _zone(tz, now)
    payload = writes.delete_checkin(db, user.id, habit_id, day, today, zone, now)
    return CheckinResult.model_validate(payload)
