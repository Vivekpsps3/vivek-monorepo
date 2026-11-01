"""Leave-bucket policies, the hours chart, and PTO settings."""

from datetime import date
from decimal import Decimal
from fractions import Fraction

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from apps.server.auth import Principal, require_principal
from apps.server.errors import APIError
from apps.travel.backend.database import get_db
from apps.travel.backend.models import LeavePolicy
from apps.travel.backend.routers.pto import _payload
from apps.travel.backend.schemas import LeavePolicyIn, PtoSettingsIn
from apps.travel.backend.services.leave_buckets import (
    dual_write_pto_policy,
    hours_per_day,
    hours_per_day_text,
    hours_setting_text,
    set_hours_per_day,
    set_sick_prompt,
    sick_prompt_dismissed,
    store_hours,
)
from apps.travel.backend.services.leave_math import (
    bucket_from_row,
    fmt_hours,
    policy_year,
    quantize_hours,
    segments,
    validate_hours_per_day,
    validate_policy_body,
    walk_bucket,
)
from apps.travel.backend.services.money import fmt_days
from apps.travel.backend.services.pto import _charge_pairs, load_usages

router = APIRouter()
_BUCKETS = ("pto", "sick")
_CHECK = "Check the highlighted fields."
_MISSING = "That leave bucket is not here."


def _known(bucket: str) -> None:
    if bucket not in _BUCKETS:
        raise HTTPException(status_code=404, detail=_MISSING)


def _leave_row(db: Session, user_id: int, bucket: str) -> LeavePolicy | None:
    return (
        db.query(LeavePolicy)
        .filter(LeavePolicy.user_id == user_id, LeavePolicy.bucket == bucket)
        .one_or_none()
    )


def _charges(usages, hpd: Decimal) -> dict[date, Fraction]:
    found: dict[date, Fraction] = {}
    scale = Fraction(hpd)
    for usage in usages:
        for taken_on, amount in _charge_pairs(usage):
            if amount:
                found[taken_on] = found.get(taken_on, Fraction(0)) + Fraction(amount) * scale
    return found


def _days(balance: Fraction, hpd: Decimal) -> Decimal:
    return (Decimal(balance.numerator) / Decimal(balance.denominator)) / hpd


def _configured(row: LeavePolicy | None) -> bool:
    return row is not None and bool(row.configured)


def bucket_state(db: Session, user_id: int, bucket: str, usages, today: date, hpd: Decimal):
    row = _leave_row(db, user_id, bucket)
    if not _configured(row):
        return None
    assert row is not None
    parsed = bucket_from_row(row)
    charges = _charges([usage for usage in usages if usage.bucket == bucket], hpd)
    balance, before = walk_bucket(parsed, charges, today)
    cap = parsed.cap_hours
    return {
        "bucket": bucket,
        "configured": True,
        "start_balance_hours": row.start_balance_hours,
        "balance_as_of": row.balance_as_of,
        "accrual_hours": row.accrual_hours,
        "accrual_cadence": row.accrual_cadence,
        "cap_hours": row.cap_hours,
        "year_start": row.year_start,
        "balance_today_hours": fmt_hours(balance),
        "balance_today_days": fmt_days(_days(balance, hpd)),
        "at_cap": cap is not None and balance >= cap,
        "today_before_balance_date": before,
    }


def series_body(db: Session, user_id: int, today: date) -> dict:
    hpd = hours_per_day(db, user_id)
    _stored, usages = load_usages(db, user_id)
    rows = {name: _leave_row(db, user_id, name) for name in _BUCKETS}
    pto_row, sick_row = rows["pto"], rows["sick"]
    if _configured(pto_row) and pto_row is not None:
        year_bucket, year_start = "pto", pto_row.year_start
    elif _configured(sick_row) and sick_row is not None:
        year_bucket, year_start = "sick", sick_row.year_start
    else:
        year_bucket, year_start = None, "01-01"
    end, horizon, days_left, rolled = policy_year(today, year_start)

    def one(name: str):
        row = rows[name]
        if not _configured(row):
            return None
        assert row is not None
        parsed = bucket_from_row(row)
        charges = _charges([usage for usage in usages if usage.bucket == name], hpd)
        points = []
        first = None
        # Point balances match walk_bucket. Reading them keeps this response
        # on the event list instead of stepping through every day since as_of.
        today_balance = parsed.start_balance_hours
        horizon_balance = parsed.start_balance_hours
        for point in segments(parsed, charges, today, horizon):
            if point["on"] == today:
                today_balance = point["balance"]
            if point["on"] == horizon:
                horizon_balance = point["balance"]
            shown = quantize_hours(point["balance"])
            public = {
                "on": point["on"],
                "hours": store_hours(shown),
                "days": fmt_days(shown / hpd),
                "projected": point["projected"],
                "kinds": point["kinds"],
            }
            points.append(public)
            if first is None and "zero" in point["kinds"]:
                first = {
                    "on": public["on"],
                    "hours": public["hours"],
                    "days": public["days"],
                    "projected": public["projected"],
                }
        cap = parsed.cap_hours
        return {
            "bucket": name,
            "cap_hours": row.cap_hours,
            "at_cap_today": cap is not None and today_balance >= cap,
            "balance_today_hours": fmt_hours(today_balance),
            "balance_today_days": fmt_days(_days(today_balance, hpd)),
            "balance_horizon_hours": fmt_hours(horizon_balance),
            "balance_horizon_days": fmt_days(_days(horizon_balance, hpd)),
            "first_negative": first,
            "points": points,
        }

    return {
        "today": today,
        "hours_per_day": hours_per_day_text(db, user_id),
        "horizon_end": horizon,
        "policy_year_end": end,
        "rolled_over": rolled,
        "days_left_in_policy_year": days_left,
        "year_start_bucket": year_bucket,
        "pto": one("pto"),
        "sick": one("sick"),
    }


def _fail(errors: dict[str, str]) -> None:
    raise APIError(422, "validation_error", _CHECK, field_errors=errors)


@router.get("/pto/policies/{bucket}")
def read_policy(
    bucket: str,
    db: Session = Depends(get_db, scope="function"),
    principal: Principal = Depends(require_principal),
):
    _known(bucket)
    _stored, usages = load_usages(db, principal.id)
    state = bucket_state(
        db, principal.id, bucket, usages, date.today(), hours_per_day(db, principal.id)
    )
    if state is None:
        return {"bucket": bucket, "configured": False}
    return state


@router.put("/pto/policies/{bucket}")
def save_policy(
    bucket: str,
    body: LeavePolicyIn,
    db: Session = Depends(get_db, scope="function"),
    principal: Principal = Depends(require_principal),
):
    _known(bucket)
    row = _leave_row(db, principal.id, bucket)
    clean, errors = validate_policy_body(body.model_dump(), row, date.today())
    if errors:
        _fail(errors)
    assert clean is not None
    if row is None:
        row = LeavePolicy(user_id=principal.id, bucket=bucket, balance_as_of=clean["balance_as_of"])
        db.add(row)
    row.configured = True
    row.start_balance_hours = store_hours(clean["start_balance_hours"])
    row.balance_as_of = clean["balance_as_of"]
    row.accrual_hours = store_hours(clean["accrual_hours"])
    row.accrual_cadence = clean["accrual_cadence"]
    row.cap_hours = None if clean["cap_hours"] is None else store_hours(clean["cap_hours"])
    row.year_start = clean["year_start"]
    db.flush()
    if bucket == "pto":
        if hours_setting_text(db, principal.id) is None:
            set_hours_per_day(db, principal.id, store_hours(Decimal("8")))
        dual_write_pto_policy(db, principal.id)
        db.flush()
    return _payload(db, principal.id)


@router.get("/pto/series")
def read_series(
    db: Session = Depends(get_db, scope="function"),
    principal: Principal = Depends(require_principal),
):
    return series_body(db, principal.id, date.today())


@router.put("/settings/pto")
def save_pto_settings(
    body: PtoSettingsIn,
    db: Session = Depends(get_db, scope="function"),
    principal: Principal = Depends(require_principal),
):
    errors: dict[str, str] = {}
    new_hours = None
    if "hours_per_day" in body.model_fields_set:
        new_hours, message = validate_hours_per_day(
            body.hours_per_day, hours_setting_text(db, principal.id)
        )
        if message:
            errors["hours_per_day"] = message
    if errors:
        _fail(errors)
    if new_hours is not None:
        set_hours_per_day(db, principal.id, store_hours(new_hours))
        dual_write_pto_policy(db, principal.id)
    if "sick_prompt_dismissed" in body.model_fields_set and isinstance(
        body.sick_prompt_dismissed, bool
    ):
        set_sick_prompt(db, principal.id, body.sick_prompt_dismissed)
    db.flush()
    return {
        "hours_per_day": hours_per_day_text(db, principal.id),
        "sick_prompt_dismissed": sick_prompt_dismissed(db, principal.id),
    }
