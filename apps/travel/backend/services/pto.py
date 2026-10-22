"""PTO projection.

The saved balance is what you have at the end of the balance date. Accrual is
spread evenly from the day after that date. PTO that starts after the balance
date is subtracted on the day it starts. A cap pauses accrual while the balance
is already at the cap. This does not change trip plans or finance records.

Yearly example: 15 days / year adds exactly 15 days across the next 365 days.
Semimonthly uses 24 periods per 365 days. Biweekly uses 14-day periods, so a
365-day stretch is about 26.07 periods rather than a payroll calendar.
"""

from dataclasses import dataclass
from datetime import date, timedelta
from decimal import Decimal
from fractions import Fraction

from apps.travel.backend.services.dates import weekday_count
from apps.travel.backend.services.money import DAY_STEP, fmt_days, parse_days, stored_days

PERIOD_DAYS = {
    "weekly": Fraction(7),
    "biweekly": Fraction(14),
    "semimonthly": Fraction(365, 24),
    "monthly": Fraction(365, 12),
    "yearly": Fraction(365),
}


@dataclass(frozen=True)
class Policy:
    configured: bool
    accrual_amount: Decimal
    accrual_unit: str
    accrual_cadence: str
    hours_per_day: Decimal
    balance_days: Decimal
    balance_as_of: date
    annual_cap_days: Decimal | None

    @property
    def daily_accrual(self) -> Fraction:
        if self.accrual_amount <= 0:
            return Fraction(0)
        per_period = Fraction(self.accrual_amount)
        if self.accrual_unit == "hour":
            per_period = Fraction(self.accrual_amount) / Fraction(self.hours_per_day)
        return per_period / PERIOD_DAYS[self.accrual_cadence]


@dataclass(frozen=True)
class Usage:
    id: int | None
    start_date: date
    end_date: date
    days: Decimal
    label: str
    trip_id: int | None


@dataclass(frozen=True)
class Walk:
    balance: Decimal
    accrued: Decimal
    used: Decimal
    before_balance_date: bool = False


def _days(value: Fraction) -> Decimal:
    return (Decimal(value.numerator) / Decimal(value.denominator)).quantize(DAY_STEP)


def _accrue(balance: Fraction, daily: Fraction, cap: Fraction | None) -> tuple[Fraction, Fraction]:
    if daily <= 0:
        return balance, Fraction(0)
    if cap is None:
        return balance + daily, daily
    if balance >= cap:
        return balance, Fraction(0)
    added = min(daily, cap - balance)
    return balance + added, added


def walk(policy: Policy, usages: list[Usage], on: date) -> Walk:
    """Balance at the end of `on`. Accrual uses exact fractions, then rounds to a ten-thousandth of a day."""
    if on < policy.balance_as_of:
        return Walk(policy.balance_days, Decimal(0), Decimal(0), before_balance_date=True)
    usage_on: dict[date, Fraction] = {}
    for usage in usages:
        if usage.start_date > policy.balance_as_of and usage.days:
            usage_on[usage.start_date] = usage_on.get(usage.start_date, Fraction(0)) + Fraction(usage.days)
    balance = Fraction(policy.balance_days)
    accrued = Fraction(0)
    used = Fraction(0)
    cap = Fraction(policy.annual_cap_days) if policy.annual_cap_days is not None else None
    day = policy.balance_as_of + timedelta(days=1)
    while day <= on:
        balance, added = _accrue(balance, policy.daily_accrual, cap)
        accrued += added
        take = usage_on.get(day, Fraction(0))
        balance -= take
        used += take
        day += timedelta(days=1)
    return Walk(_days(balance), _days(accrued), _days(used))


def effective_pto_days(pto_days: str | None, start: date, end: date) -> tuple[Decimal, bool]:
    """Return (days, auto). auto is true when the weekday span is used."""
    explicit = stored_days(pto_days)
    if explicit is None:
        return Decimal(weekday_count(start, end)), True
    return explicit, False


def sync_trip_pto(db, trip) -> None:
    """Keep one PTO row aligned with the trip. Manual rows are left alone."""
    from apps.travel.backend.models import PtoEntry

    entry = db.query(PtoEntry).filter(PtoEntry.trip_id == trip.id).one_or_none()
    if not trip.counts_as_pto:
        if entry is not None:
            db.delete(entry)
        return
    days, _auto = effective_pto_days(trip.pto_days, trip.start_date, trip.end_date)
    if entry is None:
        entry = PtoEntry(trip_id=trip.id, user_id=trip.user_id, kind="trip")
        db.add(entry)
    entry.user_id = trip.user_id
    entry.start_date = trip.start_date
    entry.end_date = trip.end_date
    entry.days = fmt_days(days)
    entry.label = trip.title
    entry.kind = "trip"


def policy_from_row(row) -> Policy:
    today = date.today()
    if row is None or not row.configured:
        return Policy(
            configured=False,
            accrual_amount=Decimal(0),
            accrual_unit="day",
            accrual_cadence="yearly",
            hours_per_day=Decimal(8),
            balance_days=Decimal(0),
            balance_as_of=today,
            annual_cap_days=None,
        )
    cap = stored_days(row.annual_cap_days)
    return Policy(
        configured=True,
        accrual_amount=Decimal(row.accrual_amount),
        accrual_unit=row.accrual_unit,
        accrual_cadence=row.accrual_cadence,
        hours_per_day=Decimal(row.hours_per_day),
        balance_days=Decimal(row.balance_days),
        balance_as_of=row.balance_as_of,
        annual_cap_days=cap,
    )


def usages_from_rows(rows) -> list[Usage]:
    return [
        Usage(
            id=row.id,
            start_date=row.start_date,
            end_date=row.end_date,
            days=Decimal(row.days),
            label=row.label,
            trip_id=row.trip_id,
        )
        for row in rows
    ]


def trip_projection(policy: Policy, usages: list[Usage], trip, effective: Decimal, auto: bool) -> dict:
    payload = {
        "counts": bool(trip.counts_as_pto),
        "days": fmt_days(effective if trip.counts_as_pto else Decimal(0)),
        "auto": auto,
        "configured": policy.configured,
        "balance_when_you_leave": None,
        "leftover_after": None,
        "note": None,
    }
    if not trip.counts_as_pto:
        payload["note"] = "This trip is not counted as PTO."
        return payload
    if not policy.configured:
        payload["note"] = "Set a balance and accrual rate to project leftover PTO."
        return payload
    if trip.start_date <= policy.balance_as_of:
        payload["note"] = (
            "This leave date is on or before your PTO balance date, so there is no forward projection."
        )
        return payload
    available = walk(policy, usages, trip.start_date - timedelta(days=1)).balance
    leftover = walk(policy, usages, trip.end_date).balance
    payload["balance_when_you_leave"] = fmt_days(available)
    payload["leftover_after"] = fmt_days(leftover)
    return payload


def preview_take(policy: Policy, usages: list[Usage], start: date, end: date, days: Decimal | None) -> dict:
    if end < start:
        raise ValueError("The return date has to be on or after the day you leave.")
    charged = days if days is not None else Decimal(weekday_count(start, end))
    charged = parse_days(charged)
    payload = {
        "start_date": start,
        "end_date": end,
        "days": fmt_days(charged),
        "auto": days is None,
        "configured": policy.configured,
        "balance_when_you_leave": None,
        "leftover_after": None,
        "note": "This preview adds these days on top of PTO already recorded.",
    }
    if not policy.configured:
        payload["note"] = "Set a balance and accrual rate to project PTO."
        return payload
    if start <= policy.balance_as_of:
        payload["note"] = "Set the balance date before this leave date to project a balance."
        return payload
    hypothetical = Usage(None, start, end, charged, "Preview", None)
    available = walk(policy, usages, start - timedelta(days=1)).balance
    leftover = walk(policy, [*usages, hypothetical], end).balance
    payload["balance_when_you_leave"] = fmt_days(available)
    payload["leftover_after"] = fmt_days(leftover)
    return payload
