"""Hours storage and the legacy PTO policy mirror.

The migration duplicates these rules on purpose and does not import this module.
"""

from decimal import Decimal, Inexact, InvalidOperation, Rounded, localcontext

from sqlalchemy.orm import Session

from apps.travel.backend.deps import settings_key
from apps.travel.backend.models import LeavePolicy, PtoPolicy, Setting

HOUR_STEP = Decimal("0.000001")
_CADENCES = {"weekly", "biweekly", "semimonthly", "monthly", "yearly"}


def hpd_setting_key(user_id: int) -> str:
    return settings_key(user_id, "pto_hours_per_day")


def sick_prompt_setting_key(user_id: int) -> str:
    return settings_key(user_id, "pto_sick_prompt_dismissed")


def store_hours(value: Decimal) -> str:
    """Plain hours, no exponent. Trailing zeros are trimmed. More than 6 dp raises."""
    amount = Decimal(value)
    if not amount.is_finite():
        raise ValueError("Enter a finite number of hours.")
    if amount == 0:
        return "0"
    exponent = amount.normalize().as_tuple().exponent
    if isinstance(exponent, int) and exponent < -6:
        raise ValueError("Hours can have at most 6 decimal places.")
    text = format(amount, "f")
    if "." in text:
        text = text.rstrip("0").rstrip(".")
    return text or "0"


def parse_hours(value: str) -> Decimal:
    try:
        amount = Decimal(value)
    except (InvalidOperation, ValueError) as exc:
        raise ValueError("Enter a valid number of hours.") from exc
    if not amount.is_finite():
        raise ValueError("Enter a finite number of hours.")
    return amount


def exact_hours_from_days(days: Decimal, hpd: Decimal) -> Decimal:
    """days × hpd with Inexact trapped. The product must round-trip and fit in 6 dp."""
    with localcontext() as ctx:
        ctx.prec = 200
        ctx.traps[Inexact] = True
        ctx.traps[Rounded] = True
        try:
            product = Decimal(days) * Decimal(hpd)
            if product / Decimal(hpd) != Decimal(days):
                raise ValueError("hours do not convert exactly")
        except (Inexact, Rounded) as exc:
            raise ValueError("hours do not convert exactly") from exc
    if parse_hours(store_hours(product)) != product:
        raise ValueError("hours do not convert exactly")
    return product


def _hours_for_amount(amount: Decimal, unit: str, hpd: Decimal) -> str:
    if unit == "hour":
        return store_hours(amount)
    if unit == "day":
        return store_hours(exact_hours_from_days(amount, hpd))
    raise ValueError("accrual unit is not day or hour")


def mirror_legacy_policy(db: Session, row: PtoPolicy) -> None:
    """Copy a just-written pto_policy row into the PTO leave bucket and the hpd Setting."""
    hpd = Decimal(row.hours_per_day)
    if not hpd.is_finite() or hpd <= 0 or hpd > 24:
        raise ValueError("hours per day do not convert exactly")
    if row.accrual_cadence not in _CADENCES:
        raise ValueError("accrual cadence does not convert exactly")
    start = store_hours(exact_hours_from_days(Decimal(row.balance_days), hpd))
    accrual = _hours_for_amount(Decimal(row.accrual_amount), row.accrual_unit, hpd)
    cap = None
    if row.annual_cap_days is not None:
        cap = store_hours(exact_hours_from_days(Decimal(row.annual_cap_days), hpd))
    existing = (
        db.query(LeavePolicy)
        .filter(LeavePolicy.user_id == row.user_id, LeavePolicy.bucket == "pto")
        .one_or_none()
    )
    if existing is None:
        existing = LeavePolicy(
            user_id=row.user_id,
            bucket="pto",
            balance_as_of=row.balance_as_of,
            year_start="01-01",
        )
        db.add(existing)
    existing.configured = row.configured
    existing.start_balance_hours = start
    existing.balance_as_of = row.balance_as_of
    existing.accrual_hours = accrual
    existing.accrual_cadence = row.accrual_cadence
    existing.cap_hours = cap
    key = hpd_setting_key(row.user_id)
    setting = db.get(Setting, key)
    if setting is None:
        db.add(Setting(key=key, value=row.hours_per_day))
    else:
        setting.value = row.hours_per_day
