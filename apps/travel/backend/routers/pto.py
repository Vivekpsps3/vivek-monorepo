"""PTO balance, accrual, and what-if days. Secondary to the trip ledger."""

from datetime import date
from decimal import ROUND_HALF_UP, Decimal

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from database import get_db
from models import PtoEntry, PtoPolicy
from schemas import PtoEntryIn, PtoPolicyIn
from services.assemble import snapshot_pto
from services.dates import weekday_count
from services.money import DAY_STEP, fmt_days, parse_days
from services.pto import policy_from_row, preview_take, usages_from_rows

router = APIRouter()


def _quantize(value: Decimal) -> Decimal:
    return Decimal(str(value)).quantize(DAY_STEP, rounding=ROUND_HALF_UP)


def _entries(db: Session):
    return db.query(PtoEntry).order_by(PtoEntry.start_date, PtoEntry.id).all()


def _payload(db: Session, today: date | None = None) -> dict:
    today = today or date.today()
    row = db.get(PtoPolicy, 1)
    policy = policy_from_row(row)
    usages = usages_from_rows(_entries(db))
    entries = [
        {
            "id": entry.id,
            "trip_id": entry.trip_id,
            "start_date": entry.start_date,
            "end_date": entry.end_date,
            "days": fmt_days(Decimal(entry.days)),
            "label": entry.label,
            "kind": entry.kind,
            "notes": entry.notes,
        }
        for entry in _entries(db)
    ]
    return {"policy": snapshot_pto(policy, usages, today), "entries": entries}


@router.get("/pto")
def read_pto(db: Session = Depends(get_db)):
    return _payload(db)


@router.put("/pto/policy")
def save_policy(body: PtoPolicyIn, db: Session = Depends(get_db)):
    row = db.get(PtoPolicy, 1)
    if row is None:
        row = PtoPolicy(id=1, balance_as_of=body.balance_as_of)
        db.add(row)
    row.configured = True
    row.accrual_amount = fmt_days(_quantize(body.accrual_amount))
    row.accrual_unit = body.accrual_unit
    row.accrual_cadence = body.accrual_cadence
    row.hours_per_day = fmt_days(_quantize(body.hours_per_day))
    row.balance_days = fmt_days(_quantize(body.balance_days))
    row.balance_as_of = body.balance_as_of
    row.annual_cap_days = fmt_days(_quantize(body.annual_cap_days)) if body.annual_cap_days is not None else None
    db.flush()
    return _payload(db)


@router.post("/pto/entries", status_code=201)
def create_entry(body: PtoEntryIn, db: Session = Depends(get_db)):
    days = body.days if body.days is not None else Decimal(weekday_count(body.start_date, body.end_date))
    row = PtoEntry(
        trip_id=None,
        start_date=body.start_date,
        end_date=body.end_date,
        days=fmt_days(parse_days(days)),
        label=body.label,
        kind="manual",
        notes=body.notes,
    )
    db.add(row)
    db.flush()
    return _payload(db)


@router.delete("/pto/entries/{entry_id}", status_code=204)
def delete_entry(entry_id: int, db: Session = Depends(get_db)):
    row = db.get(PtoEntry, entry_id)
    if row is None:
        raise HTTPException(status_code=404, detail="That PTO entry is not here.")
    if row.trip_id is not None:
        raise HTTPException(status_code=400, detail="This PTO comes from a trip. Change it on the trip.")
    db.delete(row)


@router.get("/pto/preview")
def preview(
    start: date,
    end: date,
    days: Decimal | None = None,
    db: Session = Depends(get_db),
):
    policy = policy_from_row(db.get(PtoPolicy, 1))
    usages = usages_from_rows(_entries(db))
    try:
        parsed = parse_days(days) if days is not None else None
        return preview_take(policy, usages, start, end, parsed)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
