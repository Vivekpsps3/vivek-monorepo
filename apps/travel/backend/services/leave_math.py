"""Hours walk, chart segments, and leave-policy field checks.

Balances stay Fractions until a response is formatted. `segments` jumps from
event to event: it never walks every day.
"""

from __future__ import annotations

import math
from collections import defaultdict
from dataclasses import dataclass
from datetime import date, timedelta
from decimal import Decimal, InvalidOperation
from fractions import Fraction
from typing import TypedDict

from apps.travel.backend.services.money import fmt_days
from apps.travel.backend.services.pto import PERIOD_DAYS, _accrue

HOUR_STEP = Decimal("0.000001")
_CADENCES = {"weekly", "biweekly", "semimonthly", "monthly", "yearly"}
_MONTHS = ("Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec")
_KIND_ORDER = (
    "as_of",
    "month",
    "charge_before",
    "cap_before",
    "charge",
    "cap",
    "resume",
    "zero",
    "today",
    "horizon",
)
_MAX = Decimal("8784")
_MIN_START = Decimal("-8784")
_MIN_AS_OF = date(2000, 1, 1)
START_COPY = "Starting balance has to be between \u22128784 and 8784 hours."
ACCRUAL_COPY = "Accrual has to be between 0 and 8784 hours."
CADENCE_COPY = "Pick how often you earn time off."
CAP_COPY = "Cap has to be more than 0 and up to 8784 hours, or blank."
YEAR_COPY = "Pick a valid date."
HPD_COPY = "Hours in a workday has to be more than 0 and up to 24, with at most 2 decimals."


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


def quantize_hours(value: Fraction) -> Decimal:
    return _decimal(value).quantize(HOUR_STEP, rounding="ROUND_HALF_UP")


def _decimal(value: Fraction) -> Decimal:
    return Decimal(value.numerator) / Decimal(value.denominator)


def policy_year(today: date, year_start: str) -> tuple[date, date, int, bool]:
    """Return policy-year end, horizon end, days left, and whether the chart rolled."""
    month, day = (int(part) for part in year_start.split("-"))
    start = date(today.year, month, day)
    if start > today:
        start = date(today.year - 1, month, day)
    end = date(start.year + 1, month, day) - timedelta(days=1)
    days_left = (end - today).days
    if days_left < 60:
        horizon = date(start.year + 2, month, day) - timedelta(days=1)
        return end, horizon, days_left, True
    return end, end, days_left, False


def _apply_n(balance: Fraction, days: int, daily: Fraction, cap: Fraction | None) -> Fraction:
    if days <= 0 or daily <= 0:
        return balance
    if cap is not None and balance >= cap:
        return balance
    gained = daily * days
    if cap is None or gained <= cap - balance:
        return balance + gained
    return cap


def _cap_on(
    balance: Fraction, start: date, end: date, daily: Fraction, cap: Fraction | None
) -> date | None:
    if cap is None or daily <= 0 or end < start or balance >= cap:
        return None
    room = cap - balance
    steps = int(-(-room // daily))
    when = start + timedelta(days=steps - 1)
    if when > end:
        return None
    return when


def _mark_cap(kinds: dict[date, set[str]], when: date | None, as_of: date, horizon: date) -> None:
    if when is None or when < as_of or when > horizon:
        return
    kinds[when].add("cap")
    before = when - timedelta(days=1)
    if as_of < before <= horizon:
        kinds[before].add("cap_before")


class _Point(TypedDict):
    on: date
    balance: Fraction
    projected: bool
    kinds: list[str]


def segments(
    bucket: Bucket,
    charges: dict[date, Fraction],
    today: date,
    horizon: date,
) -> list[_Point]:
    """O(events) chart points. Kinds for one date stay in a stable order."""
    as_of = bucket.balance_as_of
    daily = bucket.daily
    cap = bucket.cap_hours
    if as_of > horizon:
        only = ["as_of"]
        if bucket.start_balance_hours < 0:
            only.append("zero")
        return [_point(as_of, bucket.start_balance_hours, only, today)]

    kinds: dict[date, set[str]] = defaultdict(set)
    kinds[as_of].add("as_of")
    negative = as_of if bucket.start_balance_hours < 0 else None
    if negative is not None:
        kinds[as_of].add("zero")
    balance = bucket.start_balance_hours
    cursor = as_of
    upcoming = sorted(day for day in charges if as_of < day <= horizon)
    for day in upcoming:
        gap_end = day - timedelta(days=1)
        hit = _cap_on(balance, cursor + timedelta(days=1), gap_end, daily, cap)
        balance = _apply_n(balance, (gap_end - cursor).days, daily, cap)
        _mark_cap(kinds, hit, as_of, horizon)
        before = balance
        balance, _added = _accrue(balance, daily, cap)
        reached = cap is not None and before < cap and balance >= cap
        balance -= charges[day]
        if reached:
            _mark_cap(kinds, day, as_of, horizon)
        if cap is not None and (before >= cap or reached) and balance < cap:
            resume = day + timedelta(days=1)
            if resume <= horizon:
                kinds[resume].add("resume")
        if negative is None and balance < 0:
            negative = day
            kinds[day].add("zero")
        kinds[day].add("charge")
        prior = day - timedelta(days=1)
        if prior >= as_of:
            kinds[prior].add("charge_before")
        cursor = day
    tail_start = cursor + timedelta(days=1)
    hit = _cap_on(balance, tail_start, horizon, daily, cap)
    _mark_cap(kinds, hit, as_of, horizon)
    year, month = as_of.year, as_of.month + 1
    if month == 13:
        year, month = year + 1, 1
    while True:
        current = date(year, month, 1)
        if current > horizon:
            break
        if current > as_of:
            kinds[current].add("month")
        month += 1
        if month == 13:
            year, month = year + 1, 1
    if as_of <= today <= horizon:
        kinds[today].add("today")
    kinds[horizon].add("horizon")

    points: list[_Point] = []
    balance = bucket.start_balance_hours
    prev = as_of
    for when in sorted(kinds):
        if when != as_of:
            gap_end = when - timedelta(days=1)
            balance = _apply_n(balance, (gap_end - prev).days, daily, cap)
            balance, _added = _accrue(balance, daily, cap)
            balance -= charges.get(when, Fraction(0))
            prev = when
        ordered = [name for name in _KIND_ORDER if name in kinds[when]]
        points.append(_point(when, balance, ordered, today))
    return points


def _point(when: date, balance: Fraction, kinds: list[str], today: date) -> _Point:
    return {
        "on": when,
        "balance": balance,
        "projected": when > today,
        "kinds": kinds,
    }


def parse_loose(raw: object) -> Decimal | None:
    if isinstance(raw, bool) or raw is None:
        return None
    if isinstance(raw, str):
        text = raw.strip()
        if not text or "," in text or "e" in text.lower():
            return None
    elif isinstance(raw, int):
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
    exponent = value.normalize().as_tuple().exponent
    return isinstance(exponent, int) and exponent < -places


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
