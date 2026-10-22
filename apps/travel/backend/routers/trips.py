"""Trips and everything that belongs to one trip."""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from apps.travel.backend.database import get_db
from apps.travel.backend.models import (
    BudgetLine,
    Note,
    Parking,
    PlanItem,
    Reminder,
    Stay,
    Transport,
    Trip,
)
from apps.travel.backend.schemas import (
    BudgetLineIn,
    NoteIn,
    ParkingIn,
    PlanIn,
    ReminderIn,
    StayIn,
    TransportIn,
    TripCreate,
    TripPatch,
)
from apps.travel.backend.deps import get_geocoder, require_actor
from apps.travel.backend.services.assemble import build_trip, load_trip, pto_context
from apps.travel.backend.services.dates import ensure_stay_inside
from apps.travel.backend.services.places import pin_trip
from apps.travel.backend.services.pto import sync_trip_pto
from apps.travel.backend.services.records import (
    apply_budget_line,
    apply_parking,
    apply_plan,
    apply_reminder,
    apply_stay,
    apply_transport,
    pto_override,
    touch,
)

router = APIRouter()


def _trip_or_404(db: Session, trip_id: int) -> Trip:
    trip = db.get(Trip, trip_id)
    if trip is None or trip.user_id != require_actor().id:
        raise HTTPException(status_code=404, detail="That trip is not here.")
    return trip


def _detail(db: Session, trip_id: int, fetch=None) -> dict:
    trip = load_trip(db, trip_id, require_actor().id)
    if trip is None:
        raise HTTPException(status_code=404, detail="That trip is not here.")
    if fetch is not None:
        pin_trip(db, trip, fetch)
        db.flush()
    _row, policy, usages = pto_context(db)
    return build_trip(trip, policy, usages)


def _check_stay(trip: Trip, body: StayIn) -> None:
    try:
        ensure_stay_inside(trip.start_date, trip.end_date, body.arrive_on, body.leave_on)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


def _check_transport_link(db: Session, trip_id: int, transport_id: int | None) -> None:
    if transport_id is None:
        return
    row = db.get(Transport, transport_id)
    if row is None or row.trip_id != trip_id:
        raise HTTPException(status_code=422, detail="Pick a flight or ride on this trip.")


def _check_stay_link(db: Session, trip_id: int, stay_id: int | None) -> None:
    if stay_id is None:
        return
    row = db.get(Stay, stay_id)
    if row is None or row.trip_id != trip_id:
        raise HTTPException(status_code=422, detail="Pick a city on this trip.")


@router.get("/trips/{trip_id}")
def read_trip(trip_id: int, db: Session = Depends(get_db), fetch=Depends(get_geocoder)):
    return _detail(db, trip_id, fetch)


@router.post("/trips", status_code=201)
def create_trip(body: TripCreate, db: Session = Depends(get_db), fetch=Depends(get_geocoder)):
    trip = Trip(
        user_id=require_actor().id,
        title=body.title,
        start_date=body.start_date,
        end_date=body.end_date,
        status=body.status,
        origin_label=body.origin_label,
        notes=body.notes,
        counts_as_pto=body.counts_as_pto,
        pto_days=pto_override(body.pto_days),
    )
    db.add(trip)
    db.flush()
    for index, stay in enumerate(body.stays):
        _check_stay(trip, stay)
        row = Stay(trip_id=trip.id, sort_order=index)
        apply_stay(row, stay)
        db.add(row)
    for index, transport in enumerate(body.transports):
        row = Transport(trip_id=trip.id, sort_order=index)
        apply_transport(row, transport)
        db.add(row)
    sync_trip_pto(db, trip)
    db.flush()
    return _detail(db, trip.id, fetch)


@router.patch("/trips/{trip_id}")
def update_trip(trip_id: int, body: TripPatch, db: Session = Depends(get_db)):
    trip = _trip_or_404(db, trip_id)
    data = body.model_dump(exclude_unset=True)
    if "title" in data:
        trip.title = data["title"]
    if "start_date" in data:
        trip.start_date = data["start_date"]
    if "end_date" in data:
        trip.end_date = data["end_date"]
    if trip.end_date < trip.start_date:
        raise HTTPException(
            status_code=422, detail="The return date has to be on or after the day you leave."
        )
    if "status" in data:
        trip.status = data["status"]
    if "origin_label" in data:
        trip.origin_label = data["origin_label"] or None
    if "notes" in data:
        trip.notes = data["notes"] or None
    if "counts_as_pto" in data:
        trip.counts_as_pto = data["counts_as_pto"]
    if "pto_days" in data:
        trip.pto_days = pto_override(data["pto_days"])
    touch(trip)
    sync_trip_pto(db, trip)
    db.flush()
    return _detail(db, trip.id)


@router.delete("/trips/{trip_id}", status_code=204)
def delete_trip(trip_id: int, db: Session = Depends(get_db)):
    trip = _trip_or_404(db, trip_id)
    db.delete(trip)


@router.post("/trips/{trip_id}/stays", status_code=201)
def create_stay(
    trip_id: int, body: StayIn, db: Session = Depends(get_db), fetch=Depends(get_geocoder)
):
    trip = _trip_or_404(db, trip_id)
    _check_stay(trip, body)
    sort_order = max((stay.sort_order for stay in trip.stays), default=-1) + 1
    row = Stay(trip_id=trip.id, sort_order=sort_order)
    apply_stay(row, body)
    db.add(row)
    touch(trip)
    db.flush()
    return _detail(db, trip.id, fetch)


@router.patch("/stays/{stay_id}")
def update_stay(
    stay_id: int, body: StayIn, db: Session = Depends(get_db), fetch=Depends(get_geocoder)
):
    row = db.get(Stay, stay_id)
    if row is None:
        raise HTTPException(status_code=404, detail="That city is not here.")
    trip = _trip_or_404(db, row.trip_id)
    _check_stay(trip, body)
    apply_stay(row, body)
    touch(trip)
    db.flush()
    return _detail(db, trip.id, fetch)


@router.delete("/stays/{stay_id}", status_code=204)
def delete_stay(stay_id: int, db: Session = Depends(get_db)):
    row = db.get(Stay, stay_id)
    if row is None:
        raise HTTPException(status_code=404, detail="That city is not here.")
    trip = _trip_or_404(db, row.trip_id)
    db.delete(row)
    touch(trip)


@router.post("/trips/{trip_id}/transports", status_code=201)
def create_transport(trip_id: int, body: TransportIn, db: Session = Depends(get_db)):
    trip = _trip_or_404(db, trip_id)
    sort_order = max((item.sort_order for item in trip.transports), default=-1) + 1
    row = Transport(trip_id=trip.id, sort_order=sort_order)
    apply_transport(row, body)
    db.add(row)
    touch(trip)
    db.flush()
    return _detail(db, trip.id)


@router.patch("/transports/{transport_id}")
def update_transport(transport_id: int, body: TransportIn, db: Session = Depends(get_db)):
    row = db.get(Transport, transport_id)
    if row is None:
        raise HTTPException(status_code=404, detail="That ride is not here.")
    trip = _trip_or_404(db, row.trip_id)
    apply_transport(row, body)
    touch(trip)
    db.flush()
    return _detail(db, trip.id)


@router.delete("/transports/{transport_id}", status_code=204)
def delete_transport(transport_id: int, db: Session = Depends(get_db)):
    row = db.get(Transport, transport_id)
    if row is None:
        raise HTTPException(status_code=404, detail="That ride is not here.")
    trip = _trip_or_404(db, row.trip_id)
    db.query(Parking).filter(Parking.transport_id == row.id).update({Parking.transport_id: None})
    db.delete(row)
    touch(trip)


@router.post("/trips/{trip_id}/plans", status_code=201)
def create_plan(
    trip_id: int, body: PlanIn, db: Session = Depends(get_db), fetch=Depends(get_geocoder)
):
    trip = _trip_or_404(db, trip_id)
    _check_stay_link(db, trip.id, body.stay_id)
    sort_order = max((item.sort_order for item in trip.plans), default=-1) + 1
    row = PlanItem(trip_id=trip.id, sort_order=sort_order)
    apply_plan(row, body)
    db.add(row)
    touch(trip)
    db.flush()
    return _detail(db, trip.id, fetch)


@router.patch("/plans/{plan_id}")
def update_plan(
    plan_id: int, body: PlanIn, db: Session = Depends(get_db), fetch=Depends(get_geocoder)
):
    row = db.get(PlanItem, plan_id)
    if row is None:
        raise HTTPException(status_code=404, detail="That plan is not here.")
    trip = _trip_or_404(db, row.trip_id)
    _check_stay_link(db, trip.id, body.stay_id)
    apply_plan(row, body)
    touch(trip)
    db.flush()
    return _detail(db, trip.id, fetch)


@router.delete("/plans/{plan_id}", status_code=204)
def delete_plan(plan_id: int, db: Session = Depends(get_db)):
    row = db.get(PlanItem, plan_id)
    if row is None:
        raise HTTPException(status_code=404, detail="That plan is not here.")
    trip = _trip_or_404(db, row.trip_id)
    db.delete(row)
    touch(trip)


@router.post("/trips/{trip_id}/parking", status_code=201)
def create_parking(
    trip_id: int, body: ParkingIn, db: Session = Depends(get_db), fetch=Depends(get_geocoder)
):
    trip = _trip_or_404(db, trip_id)
    _check_transport_link(db, trip.id, body.transport_id)
    row = Parking(trip_id=trip.id)
    apply_parking(row, body)
    db.add(row)
    touch(trip)
    db.flush()
    return _detail(db, trip.id, fetch)


@router.patch("/parking/{parking_id}")
def update_parking(
    parking_id: int, body: ParkingIn, db: Session = Depends(get_db), fetch=Depends(get_geocoder)
):
    row = db.get(Parking, parking_id)
    if row is None:
        raise HTTPException(status_code=404, detail="That parking note is not here.")
    trip = _trip_or_404(db, row.trip_id)
    _check_transport_link(db, trip.id, body.transport_id)
    apply_parking(row, body)
    touch(trip)
    db.flush()
    return _detail(db, trip.id, fetch)


@router.delete("/parking/{parking_id}", status_code=204)
def delete_parking(parking_id: int, db: Session = Depends(get_db)):
    row = db.get(Parking, parking_id)
    if row is None:
        raise HTTPException(status_code=404, detail="That parking note is not here.")
    trip = _trip_or_404(db, row.trip_id)
    db.delete(row)
    touch(trip)


@router.post("/trips/{trip_id}/notes", status_code=201)
def create_note(trip_id: int, body: NoteIn, db: Session = Depends(get_db)):
    trip = _trip_or_404(db, trip_id)
    db.add(Note(trip_id=trip.id, body=body.body, on_date=body.on_date))
    touch(trip)
    db.flush()
    return _detail(db, trip.id)


@router.delete("/notes/{note_id}", status_code=204)
def delete_note(note_id: int, db: Session = Depends(get_db)):
    row = db.get(Note, note_id)
    if row is None:
        raise HTTPException(status_code=404, detail="That note is not here.")
    trip = _trip_or_404(db, row.trip_id)
    db.delete(row)
    touch(trip)


@router.post("/trips/{trip_id}/reminders", status_code=201)
def create_reminder(trip_id: int, body: ReminderIn, db: Session = Depends(get_db)):
    trip = _trip_or_404(db, trip_id)
    row = Reminder(trip_id=trip.id)
    apply_reminder(row, body)
    db.add(row)
    touch(trip)
    db.flush()
    return _detail(db, trip.id)


@router.patch("/reminders/{reminder_id}")
def update_reminder(reminder_id: int, body: ReminderIn, db: Session = Depends(get_db)):
    row = db.get(Reminder, reminder_id)
    if row is None:
        raise HTTPException(status_code=404, detail="That reminder is not here.")
    trip = _trip_or_404(db, row.trip_id)
    apply_reminder(row, body)
    touch(trip)
    db.flush()
    return _detail(db, trip.id)


@router.delete("/reminders/{reminder_id}", status_code=204)
def delete_reminder(reminder_id: int, db: Session = Depends(get_db)):
    row = db.get(Reminder, reminder_id)
    if row is None:
        raise HTTPException(status_code=404, detail="That reminder is not here.")
    trip = _trip_or_404(db, row.trip_id)
    db.delete(row)
    touch(trip)


@router.post("/trips/{trip_id}/budget-lines", status_code=201)
def create_budget_line(trip_id: int, body: BudgetLineIn, db: Session = Depends(get_db)):
    trip = _trip_or_404(db, trip_id)
    row = BudgetLine(trip_id=trip.id, amount_cents=0)
    try:
        apply_budget_line(row, body)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    db.add(row)
    touch(trip)
    db.flush()
    return _detail(db, trip.id)


@router.patch("/budget-lines/{line_id}")
def update_budget_line(line_id: int, body: BudgetLineIn, db: Session = Depends(get_db)):
    row = db.get(BudgetLine, line_id)
    if row is None:
        raise HTTPException(status_code=404, detail="That cost is not here.")
    trip = _trip_or_404(db, row.trip_id)
    try:
        apply_budget_line(row, body)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    touch(trip)
    db.flush()
    return _detail(db, trip.id)


@router.delete("/budget-lines/{line_id}", status_code=204)
def delete_budget_line(line_id: int, db: Session = Depends(get_db)):
    row = db.get(BudgetLine, line_id)
    if row is None:
        raise HTTPException(status_code=404, detail="That cost is not here.")
    trip = _trip_or_404(db, row.trip_id)
    db.delete(row)
    touch(trip)
