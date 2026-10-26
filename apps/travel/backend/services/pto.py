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

from apps.travel.backend.services.dates import iter_dates, weekday_count
from apps.travel.backend.services.money import (
    DAY_STEP,
    fmt_days,
    parse_days,
    store_days,
    stored_days,
)

PERIOD_DAYS = {
    "weekly": Fraction(7),
    "biweekly": Fraction(14),
    "semimonthly": Fraction(365, 24),
    "monthly": Fraction(365, 12),
    "yearly": Fraction(365),
}
PTO_MODE_DATES = "dates"
PTO_MODE_LEGACY = "legacy"
PTO_PROVENANCE_DEFAULT = "default"
# Rows inserted by the allocation revision. App-created rows leave this blank.
MIGRATION_SOURCE_AUTOMATIC = "backfill-automatic"
PTO_DAY_LIMIT = Decimal(1)


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
            usage_on[usage.start_date] = usage_on.get(usage.start_date, Fraction(0)) + Fraction(
                usage.days
            )
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


def default_pto_amount(day: date) -> Decimal:
    """Monday–Friday counts as one day. Saturday and Sunday count as zero."""
    return Decimal(0 if day.weekday() >= 5 else 1)


def pto_allocation_mode(pto_days: str | None) -> str:
    """Blank uses the weekday policy. Any stored total stays unallocated."""
    if pto_days is None or pto_days == "":
        return PTO_MODE_DATES
    return PTO_MODE_LEGACY


def validate_pto_day(start: date, end: date, on_date: date, amount: object) -> Decimal:
    """A stored day is finite, from 0 through 1, and inside the trip."""
    parsed = parse_days(amount)
    if parsed > PTO_DAY_LIMIT:
        raise ValueError("A PTO day cannot be more than 1.")
    if end < start or on_date < start or on_date > end:
        raise ValueError("PTO dates have to sit inside the trip.")
    return parsed


def backfill_statements() -> tuple[str, str, str]:
    """SQL for the allocation revision. Idempotent and lossless.

    Automatic trips gain one default row per date. A stored total, including
    zero, a fraction, or a value equal to the weekday count, is marked legacy
    and is not assigned to dates. Invalid spans are legacy too. Manual
    ``pto_entries`` are not mentioned here, so they stay as they are.
    """
    insert = f"""
        INSERT INTO trip_pto_days (trip_id, on_date, amount, provenance, migration_source)
        WITH RECURSIVE span AS (
            SELECT id AS trip_id, start_date AS on_date, end_date
            FROM trips
            WHERE (pto_days IS NULL OR pto_days = '')
              AND end_date >= start_date
              AND id NOT IN (SELECT trip_id FROM trip_pto_days)
            UNION ALL
            SELECT trip_id, date(on_date, '+1 day'), end_date
            FROM span
            WHERE on_date < end_date
        )
        SELECT
            trip_id,
            on_date,
            CASE
                WHEN CAST(strftime('%w', on_date) AS INTEGER) IN (0, 6) THEN '0.0000'
                ELSE '1.0000'
            END,
            '{PTO_PROVENANCE_DEFAULT}',
            '{MIGRATION_SOURCE_AUTOMATIC}'
        FROM span
    """
    mark_dates = f"""
        UPDATE trips
        SET pto_mode = '{PTO_MODE_DATES}'
        WHERE pto_mode IS NULL
          AND (pto_days IS NULL OR pto_days = '')
          AND end_date >= start_date
    """
    mark_legacy = f"""
        UPDATE trips
        SET pto_mode = '{PTO_MODE_LEGACY}'
        WHERE pto_mode IS NULL
    """
    return insert, mark_dates, mark_legacy


def backfill_trip_pto_days(connection) -> tuple[int, int, int]:
    """Run the allocation backfill. Returns (dates trips, legacy trips, day rows)."""
    from sqlalchemy import text

    for statement in backfill_statements():
        connection.execute(text(statement))
    dates_trips = int(
        connection.execute(
            text("SELECT count(*) FROM trips WHERE pto_mode = :mode"),
            {"mode": PTO_MODE_DATES},
        ).scalar_one()
    )
    legacy_trips = int(
        connection.execute(
            text("SELECT count(*) FROM trips WHERE pto_mode = :mode"),
            {"mode": PTO_MODE_LEGACY},
        ).scalar_one()
    )
    day_rows = int(connection.execute(text("SELECT count(*) FROM trip_pto_days")).scalar_one())
    return dates_trips, legacy_trips, day_rows


def sync_allocated_pto_days(db, trip) -> None:
    """Store weekday defaults, or keep an explicit total unallocated.

    In-range rows keep migration provenance. Amounts stay on the weekday
    policy so the stored days and the start-date charge describe one total.
    A later per-date edit has to change the charge in the same transaction.
    """
    from apps.travel.backend.models import TripPtoDay

    rows = db.query(TripPtoDay).filter(TripPtoDay.trip_id == trip.id).all()
    invalid_span = trip.end_date < trip.start_date
    if pto_allocation_mode(trip.pto_days) == PTO_MODE_LEGACY or invalid_span:
        trip.pto_mode = PTO_MODE_LEGACY
        for row in rows:
            db.delete(row)
        return
    by_date = {row.on_date: row for row in rows}
    trip.pto_mode = PTO_MODE_DATES
    for day in iter_dates(trip.start_date, trip.end_date):
        amount = store_days(
            validate_pto_day(trip.start_date, trip.end_date, day, default_pto_amount(day))
        )
        row = by_date.pop(day, None)
        if row is None:
            db.add(
                TripPtoDay(
                    trip_id=trip.id,
                    on_date=day,
                    amount=amount,
                    provenance=PTO_PROVENANCE_DEFAULT,
                    migration_source=None,
                )
            )
            continue
        row.amount = amount
        row.provenance = PTO_PROVENANCE_DEFAULT
    for row in by_date.values():
        db.delete(row)


def sync_trip_pto(db, trip) -> None:
    """Keep one PTO row aligned with the trip. Manual rows are left alone.

    The entry is still subtracted on the trip start date. Per-date rows are
    the stored allocation; they do not change that charge in this revision.
    """
    from apps.travel.backend.models import PtoEntry

    sync_allocated_pto_days(db, trip)
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
    entry.days = store_days(days)
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


def trip_projection(
    policy: Policy, usages: list[Usage], trip, effective: Decimal, auto: bool
) -> dict:
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


def preview_take(
    policy: Policy, usages: list[Usage], start: date, end: date, days: Decimal | None
) -> dict:
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
