"""Leave-bucket policies, the hours chart, and PTO settings."""

from datetime import date
from decimal import Decimal
from fractions import Fraction

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from apps.server.auth import Principal, require_principal
from apps.server.errors import APIError
from apps.travel.backend.database import get_db
from apps.travel.backend.deps import settings_key
from apps.travel.backend.models import LeavePolicy, Setting
from apps.travel.backend.routers.pto import _payload
from apps.travel.backend.schemas import LeavePolicyIn, PtoSettingsIn, SickRemovalIn
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
    Bucket,
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
_SICK_REVISION = "sick_policy_revision"
_SICK_CONFLICT = "Sick policy changed. Nothing was removed."
_SICK_ABSENT = "Sick policy is not set up."


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


def _sick_revision_key(user_id: int) -> str:
    return settings_key(user_id, _SICK_REVISION)


def _sick_revision(db: Session, user_id: int) -> int:
    row = db.get(Setting, _sick_revision_key(user_id))
    if row is None:
        return 0
    try:
        value = int(row.value)
    except (TypeError, ValueError):
        return 0
    return value if value >= 0 else 0


def _bump_sick_revision(db: Session, user_id: int) -> int:
    """Advance this owner's Sick revision after a successful save."""
    key = _sick_revision_key(user_id)
    for _attempt in range(4):
        row = db.get(Setting, key)
        if row is None:
            try:
                with db.begin_nested():
                    db.add(Setting(key=key, value="1"))
                    db.flush()
            except IntegrityError:
                continue
            return 1
        try:
            current = int(row.value)
        except (TypeError, ValueError):
            current = 0
        updated = (
            db.query(Setting)
            .filter(Setting.key == key, Setting.value == str(current))
            .update({Setting.value: str(current + 1)}, synchronize_session="fetch")
        )
        if updated == 1:
            return current + 1
        db.expire(row)
    raise APIError(409, "sick_policy_conflict", _SICK_CONFLICT)


def _claim_sick_revision(db: Session, user_id: int, expected: int) -> None:
    """Apply a removal only when the confirmed revision is still current."""
    if expected < 0:
        raise APIError(409, "sick_policy_conflict", _SICK_CONFLICT)
    key = _sick_revision_key(user_id)
    updated = (
        db.query(Setting)
        .filter(Setting.key == key, Setting.value == str(expected))
        .update({Setting.value: str(expected + 1)}, synchronize_session="fetch")
    )
    if updated == 1:
        return
    existing = db.get(Setting, key)
    if existing is None and expected == 0:
        try:
            with db.begin_nested():
                db.add(Setting(key=key, value="1"))
                db.flush()
        except IntegrityError:
            raise APIError(409, "sick_policy_conflict", _SICK_CONFLICT) from None
        return
    raise APIError(409, "sick_policy_conflict", _SICK_CONFLICT)


def _reset_sick_setup(row: LeavePolicy, today: date) -> None:
    row.configured = False
    row.start_balance_hours = "0"
    row.balance_as_of = today
    row.accrual_hours = "0"
    row.accrual_cadence = "yearly"
    row.cap_hours = None
    row.year_start = "01-01"
    row.carry_forward = True


def _bucket_from_clean(bucket: str, clean: dict) -> Bucket:
    cap = clean["cap_hours"]
    return Bucket(
        bucket=bucket,
        configured=True,
        start_balance_hours=Fraction(clean["start_balance_hours"]),
        balance_as_of=clean["balance_as_of"],
        accrual_hours=Fraction(clean["accrual_hours"]),
        accrual_cadence=clean["accrual_cadence"],
        cap_hours=None if cap is None else Fraction(cap),
        year_start=clean["year_start"],
        carry_forward=bool(clean["carry_forward"]),
    )


def bucket_state(db: Session, user_id: int, bucket: str, usages, today: date, hpd: Decimal):
    row = _leave_row(db, user_id, bucket)
    if not _configured(row):
        return None
    assert row is not None
    parsed = bucket_from_row(row)
    charges = _charges([usage for usage in usages if usage.bucket == bucket], hpd)
    balance, before = walk_bucket(parsed, charges, today)
    cap = parsed.cap_hours
    state = {
        "bucket": bucket,
        "configured": True,
        "start_balance_hours": row.start_balance_hours,
        "balance_as_of": row.balance_as_of,
        "accrual_hours": row.accrual_hours,
        "accrual_cadence": row.accrual_cadence,
        "cap_hours": row.cap_hours,
        "year_start": row.year_start,
        "carry_forward": bool(row.carry_forward),
        "balance_today_hours": fmt_hours(balance),
        "balance_today_days": fmt_days(_days(balance, hpd)),
        "at_cap": cap is not None and balance >= cap,
        "today_before_balance_date": before,
    }
    if bucket == "sick":
        state["revision"] = _sick_revision(db, user_id)
    return state


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
        bucket_horizon = policy_year(today, parsed.year_start)[1]
        charges = _charges([usage for usage in usages if usage.bucket == name], hpd)
        points = []
        first = None
        # Point balances match walk_bucket. Reading them keeps this response
        # on the event list instead of stepping through every day since as_of.
        today_balance = parsed.start_balance_hours
        horizon_balance = parsed.start_balance_hours
        for point in segments(parsed, charges, today, bucket_horizon):
            if point["on"] == today:
                today_balance = point["balance"]
            if point["on"] == bucket_horizon:
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
            "horizon_end": bucket_horizon,
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
    row.carry_forward = clean["carry_forward"]
    db.flush()
    if bucket == "sick":
        _bump_sick_revision(db, principal.id)
    if bucket == "pto":
        if hours_setting_text(db, principal.id) is None:
            set_hours_per_day(db, principal.id, store_hours(Decimal("8")))
        dual_write_pto_policy(db, principal.id)
        db.flush()
    return _payload(db, principal.id)


@router.post("/pto/policies/sick/removal")
def remove_sick_policy(
    body: SickRemovalIn,
    db: Session = Depends(get_db, scope="function"),
    principal: Principal = Depends(require_principal),
):
    """Unconfigure this owner's Sick policy. Ledger rows and PTO stay."""
    row = _leave_row(db, principal.id, "sick")
    if row is None:
        raise APIError(404, "sick_policy_missing", _SICK_ABSENT)
    if not row.configured:
        raise APIError(409, "sick_policy_conflict", _SICK_CONFLICT)
    _claim_sick_revision(db, principal.id, body.revision)
    _reset_sick_setup(row, date.today())
    set_sick_prompt(db, principal.id, False)
    db.flush()
    return _payload(db, principal.id)


@router.post("/pto/policies/{bucket}/impact")
def preview_policy_impact(
    bucket: str,
    body: LeavePolicyIn,
    db: Session = Depends(get_db, scope="function"),
    principal: Principal = Depends(require_principal),
):
    """Project a dated balance correction. Does not write policy or ledger rows."""
    _known(bucket)
    row = _leave_row(db, principal.id, bucket)
    if not _configured(row):
        raise HTTPException(status_code=404, detail=_MISSING)
    clean, errors = validate_policy_body(body.model_dump(), row, date.today())
    if errors:
        _fail(errors)
    assert clean is not None
    assert row is not None
    hpd = hours_per_day(db, principal.id)
    _stored, usages = load_usages(db, principal.id)
    charges = _charges([usage for usage in usages if usage.bucket == bucket], hpd)
    balance, _before = walk_bucket(_bucket_from_clean(bucket, clean), charges, date.today())
    return {
        "bucket": bucket,
        "balance_today_hours": fmt_hours(balance),
        "balance_today_days": fmt_days(_days(balance, hpd)),
        "entries_rewritten": False,
    }


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
