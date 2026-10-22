"""PTO accrual is a forward estimate from a saved balance."""

import sys
from datetime import date, timedelta
from decimal import Decimal
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from apps.travel.backend.services.dates import weekday_count
from apps.travel.backend.services.pto import Policy, Usage, walk


def policy(**overrides) -> Policy:
    base = dict(
        configured=True,
        accrual_amount=Decimal(0),
        accrual_unit="day",
        accrual_cadence="yearly",
        hours_per_day=Decimal(8),
        balance_days=Decimal(10),
        balance_as_of=date(2026, 1, 1),
        annual_cap_days=None,
    )
    base.update(overrides)
    return Policy(**base)


def test_weekday_count_includes_only_monday_through_friday():
    monday = date(2026, 11, 2)
    while monday.weekday() != 0:
        monday += timedelta(days=1)
    assert weekday_count(monday, monday + timedelta(days=4)) == 5
    assert weekday_count(monday + timedelta(days=5), monday + timedelta(days=6)) == 0
    assert weekday_count(monday + timedelta(days=4), monday + timedelta(days=7)) == 2


def test_zero_accrual_subtracts_future_pto_only():
    taken = Usage(1, date(2026, 1, 15), date(2026, 1, 15), Decimal(2), "Appointment", None)
    assert walk(policy(), [], date(2026, 1, 1)).balance == Decimal(10)
    assert walk(policy(), [taken], date(2026, 1, 14)).balance == Decimal(10)
    assert walk(policy(), [taken], date(2026, 1, 15)).balance == Decimal(8)


def test_yearly_rate_accrues_one_day_per_day_when_rate_is_365():
    row = policy(accrual_amount=Decimal(365), balance_days=Decimal(0))
    assert walk(row, [], date(2026, 1, 1)).balance == Decimal(0)
    assert walk(row, [], date(2026, 1, 2)).balance == Decimal(1)
    assert walk(row, [], date(2027, 1, 1)).balance == Decimal(365)


def test_cap_pauses_accrual_until_usage_makes_room():
    row = policy(accrual_amount=Decimal(365), annual_cap_days=Decimal(10))
    assert walk(row, [], date(2026, 1, 3)).balance == Decimal(10)
    usage = Usage(1, date(2026, 1, 2), date(2026, 1, 2), Decimal(4), "Off", None)
    # Jan 2 accrues nothing at the cap, then usage drops the balance to 6.
    # Jan 3 accrues 1.
    assert walk(row, [usage], date(2026, 1, 3)).balance == Decimal(7)


def test_hours_accrual_converts_with_hours_per_day():
    # 8 hours each biweekly period is 1 day per 14 days.
    row = policy(
        accrual_amount=Decimal(8),
        accrual_unit="hour",
        accrual_cadence="biweekly",
        hours_per_day=Decimal(8),
        balance_days=Decimal(0),
    )
    assert walk(row, [], date(2026, 1, 15)).balance == Decimal(1)
