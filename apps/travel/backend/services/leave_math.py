"""Hours walk and leave-policy field checks.

Balances stay Fractions until a response is formatted.
"""

from __future__ import annotations

import math
import re
from dataclasses import dataclass
from datetime import date, timedelta
from decimal import Decimal, InvalidOperation
from fractions import Fraction

from apps.travel.backend.services.money import fmt_days
from apps.travel.backend.services.pto import PERIOD_DAYS, _accrue

_CADENCES = {"weekly", "biweekly", "semimonthly", "monthly", "yearly"}
_MONTHS = ("Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec")
_MAX = Decimal("8784")
_MIN_START = Decimal("-8784")
_MIN_AS_OF = date(2000, 1, 1)
START_COPY = "Starting balance has to be between \u22128784 and 8784 hours."
ACCRUAL_COPY = "Accrual has to be between 0 and 8784 hours."
CADENCE_COPY = "Pick how often you earn time off."
CAP_COPY = "Cap has to be more than 0 and up to 8784 hours, or blank."
YEAR_COPY = "Pick a valid date."
HPD_COPY = "Hours in a workday has to be more than 0 and up to 24, with at most 2 decimals."

# ASCII only. Integer part is at most 6 digits; the length cap stops a long fraction
# before Decimal() parses it. Default-context normalize() is never used for the dp count.
_HOUR_TEXT_MAX = 32
_HOUR_TOKEN = re.compile(r"^[+-]?[0-9]{1,6}(\.[0-9]+)?$", re.ASCII)


@dataclass(frozen=True)
class Bucket:
    bucket: str
    configured: bool
    start_balance_hours: Fraction
    balance_as_of: date
    accrual_hours: Fraction
    accrual_cadence: str
    cap_hours: Fraction | None
    year_start: str

    @property
    def daily(self) -> Fraction:
        if self.accrual_hours <= 0:
            return Fraction(0)
        return self.accrual_hours / PERIOD_DAYS[self.accrual_cadence]


def bucket_from_row(row) -> Bucket:
    cap = None if row.cap_hours is None else Fraction(Decimal(row.cap_hours))
    return Bucket(
        bucket=row.bucket,
        configured=bool(row.configured),
        start_balance_hours=Fraction(Decimal(row.start_balance_hours)),
        balance_as_of=row.balance_as_of,
        accrual_hours=Fraction(Decimal(row.accrual_hours)),
        accrual_cadence=row.accrual_cadence,
        cap_hours=cap,
        year_start=row.year_start,
    )


def walk_bucket(bucket: Bucket, charges: dict[date, Fraction], on: date) -> tuple[Fraction, bool]:
    """End-of-day balance on `on`, and whether `on` is before the balance date."""
    if on < bucket.balance_as_of:
        return bucket.start_balance_hours, True
    balance = bucket.start_balance_hours
    day = bucket.balance_as_of + timedelta(days=1)
    while day <= on:
        balance, _added = _accrue(balance, bucket.daily, bucket.cap_hours)
        balance -= charges.get(day, Fraction(0))
        day += timedelta(days=1)
    return balance, False


def format_long(value: date) -> str:
    return f"{_MONTHS[value.month - 1]} {value.day}, {value.year}"


def as_of_copy(today: date) -> str:
    return f"Pick a date from Jan 1, 2000 to {format_long(today + timedelta(days=366))}."


def fmt_hours(value: Fraction | Decimal) -> str:
    amount = _decimal(value) if isinstance(value, Fraction) else Decimal(value)
    return fmt_days(amount)


def _decimal(value: Fraction) -> Decimal:
    return Decimal(value.numerator) / Decimal(value.denominator)


def fractional_digits(value: Decimal) -> int:
    """Fractional digits after trailing zeros are removed.

    Counted from the coefficient. Context.normalize() rounds at prec 28 first,
    so a long numeral looks like it has no fraction.
    """
    _sign, digits, exponent = value.as_tuple()
    if not isinstance(exponent, int):
        return _HOUR_TEXT_MAX + 1
    index = len(digits)
    while index > 0 and digits[index - 1] == 0:
        index -= 1
        exponent += 1
    if index == 0 or exponent >= 0:
        return 0
    return -exponent


def parse_hour_token(raw: str) -> Decimal | None:
    """Shared hours text gate. Rejects long, non-ASCII, and underscore numerals."""
    text = raw.strip()
    if len(text) > _HOUR_TEXT_MAX or _HOUR_TOKEN.fullmatch(text) is None:
        return None
    try:
        value = Decimal(text)
    except InvalidOperation:
        return None
    if not value.is_finite():
        return None
    return value


def parse_loose(raw: object) -> Decimal | None:
    if isinstance(raw, bool) or raw is None:
        return None
    if isinstance(raw, str):
        return parse_hour_token(raw)
    if isinstance(raw, int):
        text = str(raw)
    elif isinstance(raw, float):
        if not math.isfinite(raw):
            return None
        text = format(Decimal(str(raw)), "f")
        if "e" in text.lower():
            return None
    else:
        return None
    try:
        value = Decimal(text)
    except InvalidOperation:
        return None
    if not value.is_finite():
        return None
    return value


def _too_precise(value: Decimal, places: int) -> bool:
    return fractional_digits(value) > places


def _same(value: Decimal, stored: str | None) -> bool:
    return stored is not None and value == Decimal(stored)


def _year_ok(text: str) -> bool:
    if len(text) != 5 or text[2] != "-":
        return False
    month_text, day_text = text.split("-")
    if not (month_text.isdigit() and day_text.isdigit()):
        return False
    try:
        date(2023, int(month_text), int(day_text))
    except ValueError:
        return False
    return True


def validate_hours_per_day(raw: object, stored: str | None) -> tuple[Decimal | None, str | None]:
    value = parse_loose(raw)
    if value is None:
        return None, HPD_COPY
    if _same(value, stored):
        return value, None
    if _too_precise(value, 2) or value <= 0 or value > 24:
        return None, HPD_COPY
    return value, None


def validate_policy_body(raw: dict, stored, today: date) -> tuple[dict | None, dict[str, str]]:
    """Return cleaned fields, or field_errors. Grandfather equals the stored value."""
    errors: dict[str, str] = {}
    clean: dict = {}
    stored_start = None if stored is None else stored.start_balance_hours
    stored_accrual = None if stored is None else stored.accrual_hours
    stored_cap = None if stored is None else stored.cap_hours
    stored_cadence = None if stored is None else stored.accrual_cadence
    stored_year = None if stored is None else stored.year_start
    stored_as_of = None if stored is None else stored.balance_as_of

    start = parse_loose(raw.get("start_balance_hours"))
    if start is None or (
        not _same(start, stored_start)
        and (_too_precise(start, 6) or start < _MIN_START or start > _MAX)
    ):
        errors["start_balance_hours"] = START_COPY
    else:
        clean["start_balance_hours"] = start

    as_of_raw = raw.get("balance_as_of")
    parsed_as_of = None
    if isinstance(as_of_raw, str) and len(as_of_raw.strip()) == 10:
        try:
            parsed_as_of = date.fromisoformat(as_of_raw.strip())
        except ValueError:
            parsed_as_of = None
    limit = today + timedelta(days=366)
    if parsed_as_of is None or (
        parsed_as_of != stored_as_of and (parsed_as_of < _MIN_AS_OF or parsed_as_of > limit)
    ):
        errors["balance_as_of"] = as_of_copy(today)
    else:
        clean["balance_as_of"] = parsed_as_of

    accrual = parse_loose(raw.get("accrual_hours"))
    if accrual is None or (
        not _same(accrual, stored_accrual)
        and (_too_precise(accrual, 6) or accrual < 0 or accrual > _MAX)
    ):
        errors["accrual_hours"] = ACCRUAL_COPY
    else:
        clean["accrual_hours"] = accrual

    cadence = raw.get("accrual_cadence")
    if not isinstance(cadence, str) or (cadence not in _CADENCES and cadence != stored_cadence):
        errors["accrual_cadence"] = CADENCE_COPY
    else:
        clean["accrual_cadence"] = cadence

    if "cap_hours" not in raw or raw.get("cap_hours") is None or raw.get("cap_hours") == "":
        clean["cap_hours"] = None
    else:
        cap = parse_loose(raw.get("cap_hours"))
        if cap is None or (
            not _same(cap, stored_cap) and (_too_precise(cap, 6) or cap <= 0 or cap > _MAX)
        ):
            errors["cap_hours"] = CAP_COPY
        else:
            clean["cap_hours"] = cap

    if raw.get("year_start") is None:
        clean["year_start"] = stored_year or "01-01"
    else:
        year = raw.get("year_start")
        text = year.strip() if isinstance(year, str) else ""
        if text != stored_year and not _year_ok(text):
            errors["year_start"] = YEAR_COPY
        else:
            clean["year_start"] = text
    if errors:
        return None, errors
    return clean, {}
