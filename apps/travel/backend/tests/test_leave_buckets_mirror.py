"""Legacy PUT /pto/policy mirrors into leave_policies. Hours strings stay exact."""

from datetime import date
from decimal import Decimal

import pytest
from sqlalchemy.orm import sessionmaker

from apps.server.auth import Principal, require_principal
from apps.travel.backend.models import LeavePolicy, Setting
from apps.travel.backend.services.leave_buckets import (
    hpd_setting_key,
    parse_hours,
    store_hours,
)


def test_store_hours_trims_and_rejects_a_seventh_decimal():
    assert store_hours(Decimal("-0")) == "0"
    assert store_hours(Decimal("0")) == "0"
    assert store_hours(Decimal("1.500000")) == "1.5"
    assert store_hours(Decimal("1.230000")) == "1.23"
    assert store_hours(Decimal("1E+3")) == "1000"
    assert store_hours(Decimal("1.234567")) == "1.234567"
    assert "e" not in store_hours(Decimal("1E+3")).lower()
    with pytest.raises(ValueError):
        store_hours(Decimal("1.2345678"))
    assert parse_hours("1.5") == Decimal("1.5")
    assert parse_hours(store_hours(Decimal("8"))) == Decimal("8")
    with pytest.raises(ValueError):
        parse_hours("NaN")


def _session(client):
    return sessionmaker(bind=client.app.state.database.engine)()


def test_legacy_put_mirrors_pto_and_preserves_year_start(client):
    body = {
        "accrual_amount": "1.5",
        "accrual_unit": "day",
        "accrual_cadence": "yearly",
        "hours_per_day": "7.5",
        "balance_days": "10",
        "balance_as_of": "2026-01-01",
        "annual_cap_days": "20",
    }
    saved = client.put("/api/pto/policy", json=body)
    assert saved.status_code == 200, saved.text
    assert set(saved.json()) == {"policy", "entries"}
    db = _session(client)
    try:
        row = db.query(LeavePolicy).filter(LeavePolicy.user_id == 1).one()
        assert row.bucket == "pto"
        assert row.configured is True
        assert row.start_balance_hours == "75"
        assert row.accrual_hours == "11.25"
        assert row.cap_hours == "150"
        assert row.year_start == "01-01"
        assert row.accrual_cadence == "yearly"
        assert row.balance_as_of == date(2026, 1, 1)
        assert db.get(Setting, hpd_setting_key(1)).value == "7.5000"
        row.year_start = "04-15"
        db.commit()
    finally:
        db.close()
    again = client.put(
        "/api/pto/policy",
        json={**body, "balance_days": "12", "annual_cap_days": None},
    )
    assert again.status_code == 200, again.text
    assert again.json()["policy"]["balance_saved"] == "12.0000"
    assert again.json()["policy"]["annual_cap_days"] is None
    db = _session(client)
    try:
        row = db.query(LeavePolicy).filter(LeavePolicy.user_id == 1).one()
        assert row.start_balance_hours == "90"
        assert row.cap_hours is None
        assert row.year_start == "04-15"
        assert db.get(Setting, hpd_setting_key(1)).value == "7.5000"
    finally:
        db.close()
    client.app.dependency_overrides[require_principal] = lambda: Principal(2, "other", "Other")
    other = client.put("/api/pto/policy", json={**body, "balance_days": "1", "hours_per_day": "8"})
    assert other.status_code == 200, other.text
    client.app.dependency_overrides[require_principal] = lambda: Principal(1, "tester", "Tester")
    db = _session(client)
    try:
        first = db.query(LeavePolicy).filter(LeavePolicy.user_id == 1).one()
        second = db.query(LeavePolicy).filter(LeavePolicy.user_id == 2).one()
        assert first.start_balance_hours == "90"
        assert first.year_start == "04-15"
        assert second.start_balance_hours == "8"
        assert second.user_id == 2
        assert db.get(Setting, hpd_setting_key(2)).value == "8.0000"
        assert db.get(Setting, hpd_setting_key(1)).value == "7.5000"
    finally:
        db.close()
