"""PTO projection.

The saved balance is what you have at the end of the balance date. Accrual is
spread evenly from the day after that date. A date-allocated trip is subtracted
on each selected date after that balance. A legacy total or manual entry that
was never assigned to dates is still subtracted on its start date. A cap pauses
accrual while the balance is already at the cap. This does not change trip
plans or finance records.

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
PTO_PROVENANCE_OVERRIDE = "override"
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
    # Empty means the whole total is charged on start_date. Date rows fill this.
    charges: tuple[tuple[date, Decimal], ...] = ()


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


def _charge_pairs(usage: Usage) -> tuple[tuple[date, Decimal], ...]:
    """Per-date charges win. Otherwise the whole total sits on the start date."""
    if usage.charges:
        return usage.charges
    if usage.days:
        return ((usage.start_date, usage.days),)
    return ()


def walk(policy: Policy, usages: list[Usage], on: date) -> Walk:
    """Balance at the end of `on`. Accrual uses exact fractions, then rounds to a ten-thousandth of a day."""
    if on < policy.balance_as_of:
        return Walk(policy.balance_days, Decimal(0), Decimal(0), before_balance_date=True)
    usage_on: dict[date, Fraction] = {}
    for usage in usages:
        for taken_on, amount in _charge_pairs(usage):
            if taken_on > policy.balance_as_of and amount:
                usage_on[taken_on] = usage_on.get(taken_on, Fraction(0)) + Fraction(amount)
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


def _provenance_for(day: date, amount: Decimal) -> str:
    if amount == default_pto_amount(day):
        return PTO_PROVENANCE_DEFAULT
    return PTO_PROVENANCE_OVERRIDE


def sync_allocated_pto_days(db, trip, choices: dict | None = None) -> list:
    """Keep one amount per in-range date, or leave a legacy total unallocated.

    An existing choice stays put. A date added to the span gets the weekday
    default. ``choices`` replaces a legacy total: named dates are stored, and
    any other date in the span keeps its row or gets the weekday default.
    A named date outside the trip is rejected before anything is written.
    Rows outside the span are removed.
    """
    from apps.travel.backend.models import TripPtoDay

    rows = db.query(TripPtoDay).filter(TripPtoDay.trip_id == trip.id).all()
    invalid_span = trip.end_date < trip.start_date
    if choices:
        for on_date, amount in choices.items():
            validate_pto_day(trip.start_date, trip.end_date, on_date, amount)
        trip.pto_days = None
    if invalid_span or (not choices and pto_allocation_mode(trip.pto_days) == PTO_MODE_LEGACY):
        trip.pto_mode = PTO_MODE_LEGACY
        for row in rows:
            db.delete(row)
        return []
    by_date = {row.on_date: row for row in rows}
    trip.pto_mode = PTO_MODE_DATES
    chosen = choices or {}
    kept = []
    for day in iter_dates(trip.start_date, trip.end_date):
        row = by_date.pop(day, None)
        if day in chosen:
            amount = store_days(validate_pto_day(trip.start_date, trip.end_date, day, chosen[day]))
            provenance = _provenance_for(day, Decimal(amount))
            if row is None:
                row = TripPtoDay(
                    trip_id=trip.id,
                    on_date=day,
                    amount=amount,
                    provenance=provenance,
                    migration_source=None,
                )
                db.add(row)
            else:
                row.amount = amount
                row.provenance = provenance
        elif row is None:
            amount = store_days(
                validate_pto_day(trip.start_date, trip.end_date, day, default_pto_amount(day))
            )
            row = TripPtoDay(
                trip_id=trip.id,
                on_date=day,
                amount=amount,
                provenance=PTO_PROVENANCE_DEFAULT,
                migration_source=None,
            )
            db.add(row)
        kept.append(row)
    for row in by_date.values():
        db.delete(row)
    return kept


def sync_trip_pto(db, trip, choices: dict | None = None) -> None:
    """Keep one PTO row aligned with the trip. Manual rows are left alone.

    Date rows are the amount. The entry total is their sum, and forecasts
    subtract each row on its own date. Turning the trip off drops the entry
    and leaves the rows in place.
    """
    from apps.travel.backend.models import PtoEntry

    rows = sync_allocated_pto_days(db, trip, choices)
    entry = db.query(PtoEntry).filter(PtoEntry.trip_id == trip.id).one_or_none()
    if not trip.counts_as_pto:
        if entry is not None:
            db.delete(entry)
        return
    if trip.pto_mode == PTO_MODE_DATES:
        days = sum((Decimal(row.amount) for row in rows), Decimal(0))
    else:
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


def _day_rows_for(db, trip_ids: list[int]) -> list:
    from apps.travel.backend.models import TripPtoDay

    if not trip_ids:
        return []
    return db.query(TripPtoDay).filter(TripPtoDay.trip_id.in_(trip_ids)).all()


def usages_from_rows(rows, day_rows=()) -> list[Usage]:
    """Date rows replace the entry total. A row without dates stays a lump."""
    grouped: dict[int, list] = {}
    for day in day_rows:
        grouped.setdefault(day.trip_id, []).append(day)
    usages = []
    for row in rows:
        days = Decimal(row.days)
        charges: tuple[tuple[date, Decimal], ...] = ()
        owned = grouped.get(row.trip_id) if row.trip_id else None
        if owned:
            charges = tuple(
                (item.on_date, Decimal(item.amount))
                for item in sorted(owned, key=lambda item: (item.on_date, item.id or 0))
                if Decimal(item.amount) != 0
            )
            days = sum((amount for _on, amount in charges), Decimal(0))
        usages.append(
            Usage(
                id=row.id,
                start_date=row.start_date,
                end_date=row.end_date,
                days=days,
                label=row.label,
                trip_id=row.trip_id,
                charges=charges,
            )
        )
    return usages


def load_usages(db, user_id: int) -> tuple[list, list[Usage]]:
    from apps.travel.backend.models import PtoEntry

    entries = (
        db.query(PtoEntry)
        .filter(PtoEntry.user_id == user_id)
        .order_by(PtoEntry.start_date, PtoEntry.id)
        .all()
    )
    day_rows = _day_rows_for(db, [row.trip_id for row in entries if row.trip_id])
    return entries, usages_from_rows(entries, day_rows)


def usage_charges_payload(usage: Usage) -> list[dict]:
    return [
        {"on_date": on, "amount": fmt_days(amount)} for on, amount in _charge_pairs(usage) if amount
    ]


def stored_pto_total(trip) -> tuple[Decimal, bool]:
    """(days, auto). Date rows are the total. A legacy value stays as stored."""
    rows = [
        row for row in (trip.pto_day_rows or []) if trip.start_date <= row.on_date <= trip.end_date
    ]
    if trip.pto_mode == PTO_MODE_DATES or (trip.pto_mode is None and rows):
        total = sum((Decimal(row.amount) for row in rows), Decimal(0))
        auto = bool(rows) and all(row.provenance == PTO_PROVENANCE_DEFAULT for row in rows)
        return total, auto
    return effective_pto_days(trip.pto_days, trip.start_date, trip.end_date)


def pto_dates_payload(trip) -> list[dict]:
    rows = sorted(
        (
            row
            for row in (trip.pto_day_rows or [])
            if trip.start_date <= row.on_date <= trip.end_date
        ),
        key=lambda row: row.on_date,
    )
    return [
        {
            "on_date": row.on_date,
            "amount": fmt_days(Decimal(row.amount)),
            "provenance": row.provenance,
        }
        for row in rows
    ]


def counted_pto_dates(trip, start: date, end: date) -> list[date]:
    """Dates in the window that this trip actually counts. Legacy totals are not guessed."""
    if not trip.counts_as_pto or trip.pto_mode != PTO_MODE_DATES:
        return []
    return [
        row.on_date
        for row in sorted(trip.pto_day_rows or [], key=lambda row: row.on_date)
        if start <= row.on_date <= end and Decimal(row.amount) > 0
    ]


def pto_conflicts(usages: list[Usage]) -> list[dict]:
    """Two uses of one day that add up to more than a workday.

    A single legacy or manual total above one is left alone. It was never
    assigned to dates, so it is not capped and not called a conflict.
    """
    buckets: dict[date, list[tuple[str, Decimal, int | None]]] = {}
    for usage in usages:
        for on, amount in _charge_pairs(usage):
            if not amount:
                continue
            buckets.setdefault(on, []).append((usage.label, amount, usage.trip_id))
    found = []
    for on in sorted(buckets):
        items = buckets[on]
        if len(items) < 2:
            continue
        total = sum((amount for _label, amount, _trip_id in items), Decimal(0))
        if total <= PTO_DAY_LIMIT:
            continue
        found.append(
            {
                "on_date": on,
                "amount": fmt_days(total),
                "labels": [label for label, _amount, _trip_id in items],
                "trip_ids": [trip_id for _label, _amount, trip_id in items if trip_id is not None],
            }
        )
    return found


def _later_than_balance(usage: Usage | None, balance_as_of: date) -> bool:
    if usage is None:
        return False
    return any(on > balance_as_of and amount for on, amount in _charge_pairs(usage))


def _projection_conflicts(usages: list[Usage], trip_id: int | None) -> list[dict]:
    if trip_id is None:
        return []
    return [item for item in pto_conflicts(usages) if trip_id in item["trip_ids"]]


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
        "conflicts": _projection_conflicts(usages, trip.id),
    }
    if not trip.counts_as_pto:
        payload["note"] = "This trip is not counted as PTO. Day choices are kept."
        return payload
    if not policy.configured:
        payload["note"] = "Set a balance and accrual rate to project leftover PTO."
        return payload
    own = next((usage for usage in usages if usage.trip_id == trip.id), None)
    later = _later_than_balance(own, policy.balance_as_of)
    if trip.start_date <= policy.balance_as_of and not later:
        payload["note"] = (
            "This leave date is on or before your PTO balance date, so there is no forward projection."
        )
        return payload
    if trip.start_date <= policy.balance_as_of:
        payload["note"] = (
            "Days on or before your balance date stay in that balance. Later selected days are deducted."
        )
        payload["leftover_after"] = fmt_days(walk(policy, usages, trip.end_date).balance)
        return payload
    available = walk(policy, usages, trip.start_date - timedelta(days=1)).balance
    leftover = walk(policy, usages, trip.end_date).balance
    payload["balance_when_you_leave"] = fmt_days(available)
    payload["leftover_after"] = fmt_days(leftover)
    return payload


def _preview_usage(start: date, end: date, days: Decimal | None) -> Usage:
    if days is None:
        charges = tuple(
            (day, default_pto_amount(day))
            for day in iter_dates(start, end)
            if default_pto_amount(day)
        )
        charged = sum((amount for _day, amount in charges), Decimal(0))
        return Usage(None, start, end, charged, "Preview", None, charges)
    charged = parse_days(days)
    return Usage(None, start, end, charged, "Preview", None, ())


def preview_take(
    policy: Policy, usages: list[Usage], start: date, end: date, days: Decimal | None
) -> dict:
    if end < start:
        raise ValueError("The return date has to be on or after the day you leave.")
    hypothetical = _preview_usage(start, end, days)
    payload = {
        "start_date": start,
        "end_date": end,
        "days": fmt_days(hypothetical.days),
        "auto": days is None,
        "configured": policy.configured,
        "balance_when_you_leave": None,
        "leftover_after": None,
        "note": "This preview adds these days on top of PTO already recorded.",
        "charges": usage_charges_payload(hypothetical),
    }
    if not policy.configured:
        payload["note"] = "Set a balance and accrual rate to project PTO."
        return payload
    later = _later_than_balance(hypothetical, policy.balance_as_of)
    if start <= policy.balance_as_of and not later:
        payload["note"] = "Set the balance date before this leave date to project a balance."
        return payload
    if start <= policy.balance_as_of:
        payload["note"] = (
            "Days on or before your balance date stay in that balance. Later selected days are deducted."
        )
        payload["leftover_after"] = fmt_days(walk(policy, [*usages, hypothetical], end).balance)
        return payload
    available = walk(policy, usages, start - timedelta(days=1)).balance
    leftover = walk(policy, [*usages, hypothetical], end).balance
    payload["balance_when_you_leave"] = fmt_days(available)
    payload["leftover_after"] = fmt_days(leftover)
    return payload
