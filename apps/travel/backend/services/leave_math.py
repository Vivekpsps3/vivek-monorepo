"""Hours walk, chart segments, and leave-policy field checks.

Balances stay Fractions until a response is formatted. `segments` jumps from
event to event: it never walks every day.
"""

from __future__ import annotations

import math
import re
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
    "year_before",
    "year",
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
CARRY_COPY = "Choose whether unused hours carry into the next policy year."
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
    carry_forward: bool = True

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
        carry_forward=bool(getattr(row, "carry_forward", True)),
    )


def walk_bucket(bucket: Bucket, charges: dict[date, Fraction], on: date) -> tuple[Fraction, bool]:
    """End-of-day balance on `on`, and whether `on` is before the balance date.

    With carry forward off, positive unused hours drop to zero at each
    policy-year start, before that day's accrual and charges.
    """
    if on < bucket.balance_as_of:
        return bucket.start_balance_hours, True
    balance = bucket.start_balance_hours
    day = bucket.balance_as_of + timedelta(days=1)
    while day <= on:
        balance = _drop_unused(balance, day, bucket)
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


def _year_parts(year_start: str) -> tuple[int, int]:
    month, day = year_start.split("-")
    return int(month), int(day)


def _is_year_start(day: date, year_start: str) -> bool:
    month, dom = _year_parts(year_start)
    return day.month == month and day.day == dom


def _drop_unused(balance: Fraction, day: date, bucket: Bucket) -> Fraction:
    """Zero positive unused hours on a policy-year start when that bucket opts out."""
    if bucket.carry_forward or not _is_year_start(day, bucket.year_start) or balance <= 0:
        return balance
    return Fraction(0)


def year_starts_between(year_start: str, after: date, through: date) -> list[date]:
    """Policy-year starts in (after, through]."""
    if through <= after:
        return []
    month, dom = _year_parts(year_start)
    year = after.year
    candidate = date(year, month, dom)
    if candidate <= after:
        candidate = date(year + 1, month, dom)
    found: list[date] = []
    while candidate <= through:
        found.append(candidate)
        candidate = date(candidate.year + 1, month, dom)
    return found


def policy_year(today: date, year_start: str) -> tuple[date, date, int, bool]:
    """Return policy-year end, horizon end, days left, and that the next year is included.

    The horizon is the last day of the following policy year all year long.
    ``rolled_over`` stays true because the chart no longer waits for the last 60 days.
    """
    month, dom = _year_parts(year_start)
    start = date(today.year, month, dom)
    if start > today:
        start = date(today.year - 1, month, dom)
    end = date(start.year + 1, month, dom) - timedelta(days=1)
    horizon = date(start.year + 2, month, dom) - timedelta(days=1)
    days_left = (end - today).days
    return end, horizon, days_left, True


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


def _apply_span(
    balance: Fraction,
    start: date,
    end: date,
    daily: Fraction,
    cap: Fraction | None,
    bucket: Bucket,
) -> Fraction:
    """Accrue each day after ``start`` through ``end``, dropping unused hours at year starts."""
    if end <= start:
        return balance
    if bucket.carry_forward:
        return _apply_n(balance, (end - start).days, daily, cap)
    cursor = start
    for boundary in year_starts_between(bucket.year_start, start, end):
        before = boundary - timedelta(days=1)
        balance = _apply_n(balance, (before - cursor).days, daily, cap)
        if balance > 0:
            balance = Fraction(0)
        balance, _added = _accrue(balance, daily, cap)
        cursor = boundary
    return _apply_n(balance, (end - cursor).days, daily, cap)


def _mark_years(kinds: dict[date, set[str]], bucket: Bucket, as_of: date, horizon: date) -> None:
    """The series steps through every policy-year start inside the horizon."""
    for boundary in year_starts_between(bucket.year_start, as_of, horizon):
        kinds[boundary].add("year")
        before = boundary - timedelta(days=1)
        if as_of < before <= horizon:
            kinds[before].add("year_before")


def _accrue_gap(
    balance: Fraction,
    cursor: date,
    gap_end: date,
    daily: Fraction,
    cap: Fraction | None,
    bucket: Bucket,
    kinds: dict[date, set[str]],
    as_of: date,
    horizon: date,
) -> Fraction:
    """Accrue (cursor, gap_end] and mark the days accrual reaches the cap."""
    if gap_end <= cursor:
        return balance
    if bucket.carry_forward:
        hit = _cap_on(balance, cursor + timedelta(days=1), gap_end, daily, cap)
        balance = _apply_n(balance, (gap_end - cursor).days, daily, cap)
        _mark_cap(kinds, hit, as_of, horizon)
        return balance
    for boundary in year_starts_between(bucket.year_start, cursor, gap_end):
        before = boundary - timedelta(days=1)
        if before > cursor:
            hit = _cap_on(balance, cursor + timedelta(days=1), before, daily, cap)
            balance = _apply_n(balance, (before - cursor).days, daily, cap)
            _mark_cap(kinds, hit, as_of, horizon)
        if balance > 0:
            balance = Fraction(0)
        before_acc = balance
        balance, _added = _accrue(balance, daily, cap)
        if cap is not None and before_acc < cap and balance >= cap:
            _mark_cap(kinds, boundary, as_of, horizon)
        cursor = boundary
    if gap_end > cursor:
        hit = _cap_on(balance, cursor + timedelta(days=1), gap_end, daily, cap)
        balance = _apply_n(balance, (gap_end - cursor).days, daily, cap)
        _mark_cap(kinds, hit, as_of, horizon)
    return balance


def _end_of(
    balance: Fraction,
    prev: date,
    when: date,
    daily: Fraction,
    cap: Fraction | None,
    bucket: Bucket,
    charges: dict[date, Fraction],
) -> Fraction:
    """End-of-day balance on ``when`` after finishing ``prev``."""
    balance = _apply_span(balance, prev, when - timedelta(days=1), daily, cap, bucket)
    balance = _drop_unused(balance, when, bucket)
    balance, _added = _accrue(balance, daily, cap)
    return balance - charges.get(when, Fraction(0))


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
    _mark_years(kinds, bucket, as_of, horizon)
    balance = bucket.start_balance_hours
    cursor = as_of
    upcoming = sorted(day for day in charges if as_of < day <= horizon)
    for day in upcoming:
        gap_end = day - timedelta(days=1)
        balance = _accrue_gap(balance, cursor, gap_end, daily, cap, bucket, kinds, as_of, horizon)
        balance = _drop_unused(balance, day, bucket)
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
    _accrue_gap(balance, cursor, horizon, daily, cap, bucket, kinds, as_of, horizon)
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
            balance = _end_of(balance, prev, when, daily, cap, bucket, charges)
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
    """Shared hours text gate. Rejects long, non-ASCII, and underscore numerals.

    One comma is a decimal point. The value is not quarter-rounded here; blur
    rounding belongs to the form that edited the field.
    """
    text = raw.strip().replace("\u2212", "-").replace("\u2013", "-")
    if text.count(",") > 1 or ("," in text and "." in text):
        return None
    text = text.replace(",", ".")
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
    stored_carry = True if stored is None else bool(getattr(stored, "carry_forward", True))

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

    carry = raw.get("carry_forward")
    if "carry_forward" not in raw or carry is None:
        clean["carry_forward"] = stored_carry
    elif isinstance(carry, bool):
        clean["carry_forward"] = carry
    else:
        errors["carry_forward"] = CARRY_COPY
    if errors:
        return None, errors
    return clean, {}
