"""Preview a flight calendar booking. This route does not save a trip."""

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from apps.server.auth import Principal, require_principal
from apps.travel.backend.database import get_db
from apps.travel.backend.schemas import CalendarBookingIn
from apps.travel.backend.services.calendar_booking import preview_booking

router = APIRouter()


@router.post("/calendar-bookings/preview")
def preview_calendar_booking(
    body: CalendarBookingIn,
    db: Session = Depends(get_db, scope="function"),
    principal: Principal = Depends(require_principal),
):
    return preview_booking(db, principal.id, body.text)
