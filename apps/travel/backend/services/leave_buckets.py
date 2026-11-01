"""Hours storage and the legacy PTO policy mirror.

The migration duplicates these rules on purpose and does not import this module.
"""

from decimal import Decimal, Inexact, InvalidOperation, Rounded, localcontext

from sqlalchemy.orm import Session

from apps.travel.backend.deps import settings_key
from apps.travel.backend.models import LeavePolicy, PtoPolicy, Setting
from apps.travel.backend.services.money import store_days
from apps.travel.backend.services.pto import Policy, policy_from_row

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


_INEXACT = "Hours can have at most 6 decimal places."


def _setting_value(db: Session, key: str) -> str | None:
    row = db.get(Setting, key)
    return None if row is None else row.value


def hours_setting_text(db: Session, user_id: int) -> str | None:
    return _setting_value(db, hpd_setting_key(user_id))


def hours_per_day(db: Session, user_id: int) -> Decimal:
    text = hours_setting_text(db, user_id)
    if text is None:
        return Decimal("8")
    return Decimal(text)


def hours_per_day_text(db: Session, user_id: int) -> str:
    """Trimmed hours spelling. The legacy mirror may have stored 4 dp days."""
    return store_hours(hours_per_day(db, user_id))


def set_hours_per_day(db: Session, user_id: int, text: str) -> None:
    key = hpd_setting_key(user_id)
    row = db.get(Setting, key)
    if row is None:
        db.add(Setting(key=key, value=text))
    else:
        row.value = text


def sick_prompt_dismissed(db: Session, user_id: int) -> bool:
    return _setting_value(db, sick_prompt_setting_key(user_id)) == "1"


def set_sick_prompt(db: Session, user_id: int, dismissed: bool) -> None:
    key = sick_prompt_setting_key(user_id)
    row = db.get(Setting, key)
    if not dismissed:
        if row is not None:
            db.delete(row)
        return
    if row is None:
        db.add(Setting(key=key, value="1"))
    else:
        row.value = "1"


def _configured_leave(db: Session, user_id: int, bucket: str) -> LeavePolicy | None:
    row = (
        db.query(LeavePolicy)
        .filter(LeavePolicy.user_id == user_id, LeavePolicy.bucket == bucket)
        .one_or_none()
    )
    if row is None or not row.configured:
        return None
    return row


def _hours_match(stored: str | None, expected: str | None) -> bool:
    if stored is None or expected is None:
        return stored is None and expected is None
    return Decimal(stored) == Decimal(expected)


def _legacy_is_exact_preimage(legacy: PtoPolicy, leave: LeavePolicy, hpd: Decimal) -> bool:
    if not legacy.configured or Decimal(legacy.hours_per_day) != hpd:
        return False
    if (
        leave.balance_as_of != legacy.balance_as_of
        or leave.accrual_cadence != legacy.accrual_cadence
    ):
        return False
    try:
        start = store_hours(exact_hours_from_days(Decimal(legacy.balance_days), hpd))
        accrual = _hours_for_amount(Decimal(legacy.accrual_amount), legacy.accrual_unit, hpd)
        cap = None
        if legacy.annual_cap_days is not None:
            cap = store_hours(exact_hours_from_days(Decimal(legacy.annual_cap_days), hpd))
    except (ValueError, InvalidOperation, ArithmeticError):
        return False
    return (
        _hours_match(leave.start_balance_hours, start)
        and _hours_match(leave.accrual_hours, accrual)
        and _hours_match(leave.cap_hours, cap)
    )


def _policy_from_hours(leave: LeavePolicy, hpd: Decimal) -> Policy:
    cap = None if leave.cap_hours is None else Decimal(leave.cap_hours) / hpd
    return Policy(
        configured=True,
        accrual_amount=Decimal(leave.accrual_hours),
        accrual_unit="hour",
        accrual_cadence=leave.accrual_cadence,
        hours_per_day=hpd,
        balance_days=Decimal(leave.start_balance_hours) / hpd,
        balance_as_of=leave.balance_as_of,
        annual_cap_days=cap,
    )


def policy_for_bucket(db: Session, user_id: int, bucket: str) -> Policy:
    """Day Policy for one bucket. PTO keeps a still-exact legacy row byte-for-byte."""
    leave = _configured_leave(db, user_id, bucket)
    if leave is None:
        return policy_from_row(None)
    hpd = hours_per_day(db, user_id)
    if bucket == "pto":
        legacy = db.query(PtoPolicy).filter(PtoPolicy.user_id == user_id).one_or_none()
        if legacy is not None and _legacy_is_exact_preimage(legacy, leave, hpd):
            return policy_from_row(legacy)
    return _policy_from_hours(leave, hpd)


def policy_for_read(db: Session, user_id: int) -> Policy:
    return policy_for_bucket(db, user_id, "pto")


def dual_write_pto_policy(db: Session, user_id: int) -> None:
    """Upsert the rollback pto_policy copy from the PTO leave row and the hpd Setting."""
    hpd = hours_per_day(db, user_id)
    leave = _configured_leave(db, user_id, "pto")
    row = db.query(PtoPolicy).filter(PtoPolicy.user_id == user_id).one_or_none()
    if leave is None:
        if row is not None:
            row.hours_per_day = store_days(hpd)
        return
    if row is None:
        row = PtoPolicy(user_id=user_id, balance_as_of=leave.balance_as_of)
        db.add(row)
    row.configured = True
    row.balance_days = store_days(Decimal(leave.start_balance_hours) / hpd)
    row.annual_cap_days = (
        None if leave.cap_hours is None else store_days(Decimal(leave.cap_hours) / hpd)
    )
    row.accrual_unit = "hour"
    row.accrual_amount = store_days(Decimal(leave.accrual_hours))
    row.hours_per_day = store_days(hpd)
    row.accrual_cadence = leave.accrual_cadence
    row.balance_as_of = leave.balance_as_of


def legacy_policy_field_errors(row: PtoPolicy) -> dict[str, str]:
    """Day or hour amounts that do not fit in 6 dp hours, keyed by request field."""
    try:
        hpd = Decimal(row.hours_per_day)
    except (InvalidOperation, ValueError):
        return {"hours_per_day": _INEXACT}
    if not hpd.is_finite() or hpd <= 0 or hpd > 24:
        return {"hours_per_day": _INEXACT}
    checks: list[tuple[str, Decimal, str]] = [
        ("balance_days", Decimal(row.balance_days), "day"),
        ("accrual_amount", Decimal(row.accrual_amount), row.accrual_unit),
    ]
    if row.annual_cap_days is not None:
        checks.append(("annual_cap_days", Decimal(row.annual_cap_days), "day"))
    errors: dict[str, str] = {}
    for field, amount, unit in checks:
        try:
            if unit == "hour":
                store_hours(amount)
            elif unit == "day":
                exact_hours_from_days(amount, hpd)
            else:
                raise ValueError(unit)
        except (ValueError, InvalidOperation, ArithmeticError):
            errors[field] = _INEXACT
    return errors
