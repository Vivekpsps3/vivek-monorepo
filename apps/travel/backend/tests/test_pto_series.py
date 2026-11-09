"""TPTO1B chart: horizon, segments equal the walk, and the series stays cheap."""

import random
import time
from datetime import date, timedelta
from fractions import Fraction
from itertools import pairwise

import pytest
from sqlalchemy.orm import sessionmaker

from apps.travel.backend.models import PtoEntry
from apps.travel.backend.services.leave_math import Bucket, segments, walk_bucket
from apps.travel.backend.services.pto import PERIOD_DAYS
from apps.travel.backend.tests.test_pto_buckets import _policy, pin

TODAY = date(2026, 6, 15)


def _put(client, bucket="pto", **overrides):
    saved = client.put(f"/api/pto/policies/{bucket}", json=_policy(**overrides))
    assert saved.status_code == 200, saved.text
    return saved


def test_horizon_rollover_custom_year_and_which_buckets_exist(client, monkeypatch):
    pin(monkeypatch, date(2026, 11, 1))
    _put(client, balance_as_of="2026-01-01", year_start="01-01")
    body = client.get("/api/pto/series").json()
    assert body["days_left_in_policy_year"] == 60
    assert body["rolled_over"] is True
    assert body["policy_year_end"] == "2026-12-31"
    assert body["horizon_end"] == "2027-12-31"
    assert body["pto"]["points"][-1]["on"] == "2027-12-31"
    assert body["year_start_bucket"] == "pto"
    assert body["sick"] is None and body["pto"] is not None
    pin(monkeypatch, date(2026, 11, 2))
    rolled = client.get("/api/pto/series").json()
    assert rolled["days_left_in_policy_year"] == 59
    assert rolled["rolled_over"] is True
    assert rolled["horizon_end"] == "2027-12-31"
    pin(monkeypatch, TODAY)
    _put(client, year_start="04-01", balance_as_of="2026-05-01")
    custom = client.get("/api/pto/series").json()
    assert custom["policy_year_end"] == "2027-03-31"
    assert custom["horizon_end"] == "2028-03-31"
    assert custom["pto"]["points"][0]["on"] == "2026-05-01"
    assert custom["pto"]["points"][-1]["on"] == "2028-03-31"
    assert all(point["on"] >= "2026-05-01" for point in custom["pto"]["points"])
    _put(client, "sick", year_start="07-01", start_balance_hours="8")
    both = client.get("/api/pto/series").json()
    assert both["year_start_bucket"] == "pto"
    assert both["sick"]["bucket"] == "sick"


def test_sick_only_and_neither_bucket(client, monkeypatch):
    pin(monkeypatch, TODAY)
    _put(client, "sick", year_start="03-01", start_balance_hours="16", balance_as_of="2026-03-01")
    sick_only = client.get("/api/pto/series").json()
    assert sick_only["pto"] is None
    assert sick_only["year_start_bucket"] == "sick"
    assert sick_only["policy_year_end"] == "2027-02-28"
    assert sick_only["horizon_end"] == "2028-02-29"
    assert sick_only["rolled_over"] is True
    from apps.server.auth import Principal, require_principal

    client.app.dependency_overrides[require_principal] = lambda: Principal(2, "other", "Other")
    bare = client.get("/api/pto/series").json()
    assert bare["pto"] is None and bare["sick"] is None
    assert bare["year_start_bucket"] is None
    assert bare["policy_year_end"] == "2026-12-31"
    assert bare["horizon_end"] == "2027-12-31"
    assert bare["rolled_over"] is True


def test_negative_start_cap_resume_and_as_of_after_the_horizon(client, monkeypatch):
    pin(monkeypatch, TODAY)
    _put(
        client,
        start_balance_hours="-8",
        accrual_hours="70",
        accrual_cadence="weekly",
        cap_hours="25",
        balance_as_of="2026-06-01",
        year_start="01-01",
    )
    client.post(
        "/api/pto/entries",
        json={"label": "Drop", "start_date": "2026-06-10", "end_date": "2026-06-10", "days": "2"},
    )
    points = client.get("/api/pto/series").json()["pto"]["points"]
    assert points[0]["on"] == "2026-06-01"
    assert "zero" in points[0]["kinds"]
    assert "as_of" in points[0]["kinds"]
    assert client.get("/api/pto/series").json()["pto"]["first_negative"]["on"] == "2026-06-01"
    assert any("cap" in point["kinds"] for point in points)
    assert any("resume" in point["kinds"] for point in points)
    assert any("charge" in point["kinds"] for point in points)
    assert any("charge_before" in point["kinds"] for point in points)
    ons = [point["on"] for point in points]
    assert ons == sorted(ons) and len(ons) == len(set(ons))
    pin(monkeypatch, date(2026, 12, 31))
    _put(
        client,
        balance_as_of="2028-01-01",
        accrual_hours="0",
        cap_hours=None,
        start_balance_hours="3",
    )
    later = client.get("/api/pto/series").json()["pto"]
    assert [point["kinds"] for point in later["points"]] == [["as_of"]]
    assert later["points"][0]["on"] == "2028-01-01"
    assert later["first_negative"] is None


def test_segments_interpolate_to_the_walk():
    rng = random.Random(20261101)
    today = TODAY
    for _index in range(300):
        as_of = today - timedelta(days=rng.randrange(0, 30))
        horizon = as_of + timedelta(days=rng.randrange(8, 48))
        span = (horizon - as_of).days
        cap = None if rng.random() < 0.45 else Fraction(rng.randrange(1, 80), 2)
        boundary = as_of + timedelta(days=rng.randrange(1, span + 1))
        bucket = Bucket(
            "pto",
            True,
            Fraction(rng.randrange(-20, 40), 2),
            as_of,
            Fraction(rng.randrange(0, 30), 2),
            rng.choice(tuple(PERIOD_DAYS)),
            cap,
            f"{boundary.month:02d}-{boundary.day:02d}",
            rng.random() < 0.5,
        )
        charges: dict[date, Fraction] = {}
        for _charge in range(rng.randrange(0, 4)):
            taken = as_of + timedelta(days=rng.randrange(1, span + 1))
            charges[taken] = charges.get(taken, Fraction(0)) + Fraction(rng.randrange(0, 8), 2)
        points = segments(bucket, charges, today, horizon)
        ons = [point["on"] for point in points]
        assert ons == sorted(set(ons))
        assert ons[0] >= as_of
        for left, right in pairwise(points):
            width = (right["on"] - left["on"]).days
            for step in range(width + 1):
                day = left["on"] + timedelta(days=step)
                walked, _before = walk_bucket(bucket, charges, day)
                line = left["balance"] + (right["balance"] - left["balance"]) * Fraction(
                    step, width
                )
                assert walked == line


# Wall-clock budget: marked perf so coverage runs skip it (coverage-gate.sh
# filters `-m "not perf"`, same as test_town_perf.py); plain runs still gate it.
@pytest.mark.perf
def test_series_p50_stays_under_the_local_guard(client, monkeypatch):
    pin(monkeypatch, date(2026, 11, 2))
    _put(
        client,
        start_balance_hours="40",
        balance_as_of="2000-01-01",
        accrual_hours="8",
        accrual_cadence="monthly",
        cap_hours="200",
        year_start="01-01",
    )
    _put(client, "sick", start_balance_hours="16", balance_as_of="2000-01-01", accrual_hours="4")
    db = sessionmaker(bind=client.app.state.database.engine)()
    try:
        db.add_all(
            [
                PtoEntry(
                    user_id=1,
                    start_date=date(2000, 1, 2) + timedelta(days=index % 9000),
                    end_date=date(2000, 1, 2) + timedelta(days=index % 9000),
                    days="0.2500",
                    label="Seeded",
                    kind="manual",
                    bucket="pto" if index % 2 == 0 else "sick",
                )
                for index in range(1000)
            ]
        )
        db.commit()
    finally:
        db.close()
    samples = []
    for _run in range(7):
        started = time.perf_counter()
        response = client.get("/api/pto/series")
        samples.append((time.perf_counter() - started) * 1000)
        assert response.status_code == 200, response.text
    samples.sort()
    p50 = samples[len(samples) // 2]
    print(f"GET /pto/series p50_ms={p50:.1f}")
    body = response.json()
    assert body["rolled_over"] is True
    assert len(body["pto"]["points"]) < 2500
    assert len(body["sick"]["points"]) < 2500
    assert p50 < 150


def test_carry_forward_keeps_the_balance_across_the_policy_year_and_off_drops_it(
    client, monkeypatch
):
    """A balance at the policy-year end is still there the next day, unless the bucket opts out."""
    pin(monkeypatch, date(2026, 12, 31))
    _put(
        client,
        start_balance_hours="40",
        accrual_hours="0",
        balance_as_of="2026-12-01",
        year_start="01-01",
        carry_forward=True,
    )
    _put(
        client,
        "sick",
        start_balance_hours="16",
        accrual_hours="0",
        balance_as_of="2026-12-01",
        year_start="01-01",
        carry_forward=False,
    )
    assert client.get("/api/pto/policies/pto").json()["carry_forward"] is True
    assert client.get("/api/pto/policies/sick").json()["carry_forward"] is False
    body = client.get("/api/pto/series").json()
    assert body["horizon_end"] == "2027-12-31"
    assert body["policy_year_end"] == "2026-12-31"
    pto = {point["on"]: point for point in body["pto"]["points"]}
    sick = {point["on"]: point for point in body["sick"]["points"]}
    assert pto["2026-12-31"]["hours"] == "40"
    assert pto["2027-01-01"]["hours"] == "40"
    assert "year" in pto["2027-01-01"]["kinds"]
    assert sick["2026-12-31"]["hours"] == "16"
    assert sick["2027-01-01"]["hours"] == "0"
    assert body["pto"]["points"][-1]["on"] == "2027-12-31"
    assert body["sick"]["points"][-1]["on"] == "2027-12-31"
    assert body["pto"]["balance_horizon_hours"] == pto["2027-12-31"]["hours"]
    assert body["sick"]["balance_horizon_hours"] == "0"


def test_custom_year_start_drops_only_when_carry_forward_is_off():
    as_of = date(2026, 3, 31)
    today = date(2026, 6, 15)
    horizon = date(2028, 3, 31)
    daily = Fraction(365) / PERIOD_DAYS["yearly"]
    assert daily == 1
    dropped = Bucket(
        "sick", True, Fraction(10), as_of, Fraction(365), "yearly", None, "04-01", False
    )
    kept = Bucket("pto", True, Fraction(10), as_of, Fraction(365), "yearly", None, "04-01", True)
    assert walk_bucket(dropped, {}, date(2026, 3, 31))[0] == Fraction(10)
    assert walk_bucket(dropped, {}, date(2026, 4, 1))[0] == Fraction(1)
    assert walk_bucket(kept, {}, date(2026, 4, 1))[0] == Fraction(11)
    for bucket, april, following in (
        (dropped, Fraction(1), Fraction(1)),
        (kept, Fraction(11), Fraction(11) + Fraction(365)),
    ):
        points = {point["on"]: point["balance"] for point in segments(bucket, {}, today, horizon)}
        assert points[date(2026, 3, 31)] == Fraction(10)
        assert points[date(2026, 4, 1)] == april
        assert points[date(2027, 4, 1)] == following
        assert points[horizon] == walk_bucket(bucket, {}, horizon)[0]
