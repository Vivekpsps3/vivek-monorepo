"""PTO balance, accrual, and what-if days. Secondary to the trip ledger."""

from datetime import date
from decimal import ROUND_HALF_UP, Decimal

from fastapi import APIRouter, Depends, HTTPException
from fastapi.exceptions import RequestValidationError
from sqlalchemy.orm import Session

from apps.server.auth import Principal, require_principal
from apps.travel.backend.database import get_db
from apps.travel.backend.models import PtoEntry, PtoPolicy
from apps.travel.backend.schemas import PtoEntryIn, PtoPolicyIn
from apps.travel.backend.services.assemble import snapshot_pto
from apps.travel.backend.services.dates import weekday_count
from apps.travel.backend.services.leave_buckets import (
    hours_per_day,
    hours_per_day_text,
    legacy_policy_field_errors,
    mirror_legacy_policy,
    policy_for_bucket,
    policy_for_read,
    sick_prompt_dismissed,
)
from apps.travel.backend.services.leave_math import fmt_hours
from apps.travel.backend.services.money import DAY_STEP, parse_days, store_days
from apps.travel.backend.services.pto import (
    load_usages,
    preview_take,
    usage_charges_payload,
)

_BUCKETS = ("pto", "sick")
_MISSING = "That leave bucket is not here."

router = APIRouter()


def _quantize(value: Decimal) -> Decimal:
    return Decimal(str(value)).quantize(DAY_STEP, rounding=ROUND_HALF_UP)


def _policy_row(db: Session, user_id: int) -> PtoPolicy | None:
    return db.query(PtoPolicy).filter(PtoPolicy.user_id == user_id).one_or_none()


def _payload(db: Session, user_id: int, today: date | None = None) -> dict:
    from apps.travel.backend.routers.leave import bucket_state

    today = today or date.today()
    policy = policy_for_read(db, user_id)
    hpd = hours_per_day(db, user_id)
    stored, usages = load_usages(db, user_id)
    entries = [
        {
            "id": entry.id,
            "trip_id": entry.trip_id,
            "start_date": entry.start_date,
            "end_date": entry.end_date,
            "days": store_days(usage.days),
            "label": entry.label,
            "kind": entry.kind,
            "notes": entry.notes,
            "charges": usage_charges_payload(usage),
            "bucket": entry.bucket,
            "hours": fmt_hours(usage.days * hpd),
        }
        for entry, usage in zip(stored, usages, strict=True)
    ]
    return {
        "policy": snapshot_pto(policy, usages, today),
        "entries": entries,
        "hours_per_day": hours_per_day_text(db, user_id),
        "pto_sick_prompt_dismissed": sick_prompt_dismissed(db, user_id),
        "buckets": {name: bucket_state(db, user_id, name, usages, today, hpd) for name in _BUCKETS},
    }


@router.get("/pto")
def read_pto(
    db: Session = Depends(get_db, scope="function"),
    principal: Principal = Depends(require_principal),
):
    return _payload(db, principal.id)


@router.put("/pto/policy")
def save_policy(
    body: PtoPolicyIn,
    db: Session = Depends(get_db, scope="function"),
    principal: Principal = Depends(require_principal),
):
    row = _policy_row(db, principal.id)
    if row is None:
        row = PtoPolicy(user_id=principal.id, balance_as_of=body.balance_as_of)
        db.add(row)
    row.configured = True
    row.accrual_amount = store_days(_quantize(body.accrual_amount))
    row.accrual_unit = body.accrual_unit
    row.accrual_cadence = body.accrual_cadence
    row.hours_per_day = store_days(_quantize(body.hours_per_day))
    row.balance_days = store_days(_quantize(body.balance_days))
    row.balance_as_of = body.balance_as_of
    row.annual_cap_days = (
        store_days(_quantize(body.annual_cap_days)) if body.annual_cap_days is not None else None
    )
    inexact = legacy_policy_field_errors(row)
    if inexact:
        raise RequestValidationError(
            [
                {
                    "type": "value_error",
                    "loc": ("body", field),
                    "msg": f"Value error, {text}",
                    "input": None,
                }
                for field, text in inexact.items()
            ]
        )
    mirror_legacy_policy(db, row)
    db.flush()
    return _payload(db, principal.id)


@router.post("/pto/entries", status_code=201)
def create_entry(
    body: PtoEntryIn,
    db: Session = Depends(get_db, scope="function"),
    principal: Principal = Depends(require_principal),
):
    days = (
        body.days
        if body.days is not None
        else Decimal(weekday_count(body.start_date, body.end_date))
    )
    row = PtoEntry(
        user_id=principal.id,
        trip_id=None,
        start_date=body.start_date,
        end_date=body.end_date,
        days=store_days(parse_days(days)),
        label=body.label,
        kind="manual",
        notes=body.notes,
        bucket=body.bucket,
    )
    db.add(row)
    db.flush()
    return _payload(db, principal.id)


@router.delete("/pto/entries/{entry_id}", status_code=204)
def delete_entry(
    entry_id: int,
    db: Session = Depends(get_db, scope="function"),
    principal: Principal = Depends(require_principal),
):
    row = db.get(PtoEntry, entry_id)
    if row is None or row.user_id != principal.id:
        raise HTTPException(status_code=404, detail="That PTO entry is not here.")
    if row.trip_id is not None:
        raise HTTPException(
            status_code=400, detail="This PTO comes from a trip. Change it on the trip."
        )
    db.delete(row)


@router.get("/pto/preview")
def preview(
    start: date,
    end: date,
    days: Decimal | None = None,
    bucket: str = "pto",
    db: Session = Depends(get_db, scope="function"),
    principal: Principal = Depends(require_principal),
):
    if bucket not in _BUCKETS:
        raise HTTPException(status_code=404, detail=_MISSING)
    policy = policy_for_bucket(db, principal.id, bucket)
    _stored, usages = load_usages(db, principal.id)
    chosen = [usage for usage in usages if usage.bucket == bucket]
    try:
        parsed = parse_days(days) if days is not None else None
        body = preview_take(policy, chosen, start, end, parsed)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    body["bucket"] = bucket
    return body
