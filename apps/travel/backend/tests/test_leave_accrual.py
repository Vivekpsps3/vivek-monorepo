"""Scheduled accrual posts on an explicit anchor. Daily proration stays the default."""

from datetime import date, timedelta
from fractions import Fraction

from apps.travel.backend.models import LeavePolicy, PtoEntry
from apps.travel.backend.services.leave_buckets import store_hours
from apps.travel.backend.services.leave_math import (
    ANCHOR_COPY,
    Bucket,
    fmt_hours,
    posting_dates,
    quantize_hours,
    segments,
    walk_bucket,
)
from apps.travel.backend.services.pto import PERIOD_DAYS
from apps.travel.backend.tests.test_pto_buckets import _policy, pin
from apps.travel.backend.tests.test_sick_policy_removal import _db

TODAY = date(2026, 11, 11)


def _bucket(
    *,
    start: Fraction = Fraction(40),
    as_of: date = date(2026, 1, 1),
    amount: Fraction = Fraction(8),
    cadence: str = "monthly",
    cap: Fraction | None = None,
    year_start: str = "01-01",
    carry: bool = True,
    mode: str = "daily",
    anchor: date | None = None,
) -> Bucket:
    return Bucket(
        "pto",
        True,
        start,
        as_of,
        amount,
        cadence,
        cap,
        year_start,
        carry,
        mode,
        anchor,
    )


def _scheduled(
    anchor: date,
    *,
    start: Fraction = Fraction(40),
    as_of: date = date(2026, 1, 1),
    amount: Fraction = Fraction(8),
    cadence: str = "monthly",
    cap: Fraction | None = None,
    year_start: str = "01-01",
    carry: bool = True,
) -> Bucket:
    return _bucket(
        start=start,
        as_of=as_of,
        amount=amount,
        cadence=cadence,
        cap=cap,
        year_start=year_start,
        carry=carry,
        mode="scheduled",
        anchor=anchor,
    )


def _dates(bucket: Bucket, after: date, through: date) -> list[date]:
    found = posting_dates(bucket, after, through)
    assert found == sorted(set(found))
    assert all(after < day <= through for day in found)
    return found


def test_daily_default_keeps_the_prorated_fraction_and_posts_nothing():
    as_of = date(2026, 1, 1)
    on = date(2026, 2, 1)
    bucket = _bucket(as_of=as_of)
    assert bucket.accrual_mode == "daily"
    assert bucket.accrual_anchor is None
    assert posting_dates(bucket, as_of, date(2027, 1, 1)) == []
    assert walk_bucket(bucket, {}, on)[0] == Fraction(40) + Fraction(8) * 31 * 12 / Fraction(365)
    assert walk_bucket(bucket, {}, as_of)[0] == Fraction(40)


def test_documented_anchors_for_every_cadence():
    """These lists are the schedule. Each date occurs once."""
    assert _dates(_scheduled(date(2024, 1, 31)), date(2024, 1, 1), date(2025, 3, 31)) == [
        date(2024, 1, 31),
        date(2024, 2, 29),
        date(2024, 3, 31),
        date(2024, 4, 30),
        date(2024, 5, 31),
        date(2024, 6, 30),
        date(2024, 7, 31),
        date(2024, 8, 31),
        date(2024, 9, 30),
        date(2024, 10, 31),
        date(2024, 11, 30),
        date(2024, 12, 31),
        date(2025, 1, 31),
        date(2025, 2, 28),
        date(2025, 3, 31),
    ]
    assert _dates(_scheduled(date(2024, 1, 30)), date(2024, 1, 1), date(2025, 3, 30)) == [
        date(2024, 1, 30),
        date(2024, 2, 29),
        date(2024, 3, 30),
        date(2024, 4, 30),
        date(2024, 5, 30),
        date(2024, 6, 30),
        date(2024, 7, 30),
        date(2024, 8, 30),
        date(2024, 9, 30),
        date(2024, 10, 30),
        date(2024, 11, 30),
        date(2024, 12, 30),
        date(2025, 1, 30),
        date(2025, 2, 28),
        date(2025, 3, 30),
    ]
    assert _dates(
        _scheduled(date(2024, 2, 29), cadence="yearly"),
        date(2024, 1, 1),
        date(2028, 3, 1),
    ) == [
        date(2024, 2, 29),
        date(2025, 2, 28),
        date(2026, 2, 28),
        date(2027, 2, 28),
        date(2028, 2, 29),
    ]
    assert _dates(
        _scheduled(date(2024, 2, 27), cadence="weekly"),
        date(2024, 2, 1),
        date(2024, 3, 12),
    ) == [date(2024, 2, 27), date(2024, 3, 5), date(2024, 3, 12)]
    assert _dates(
        _scheduled(date(2024, 12, 30), cadence="weekly"),
        date(2024, 12, 1),
        date(2025, 1, 6),
    ) == [date(2024, 12, 30), date(2025, 1, 6)]
    assert _dates(
        _scheduled(date(2024, 2, 26), cadence="biweekly"),
        date(2024, 2, 1),
        date(2024, 3, 11),
    ) == [date(2024, 2, 26), date(2024, 3, 11)]
    assert _dates(
        _scheduled(date(2024, 1, 31), cadence="semimonthly"),
        date(2024, 1, 1),
        date(2025, 2, 28),
    )[:6] == [
        date(2024, 1, 31),
        date(2024, 2, 15),
        date(2024, 2, 29),
        date(2024, 3, 15),
        date(2024, 3, 31),
        date(2024, 4, 15),
    ]
    assert date(2025, 2, 15) in _dates(
        _scheduled(date(2024, 1, 31), cadence="semimonthly"),
        date(2025, 2, 1),
        date(2025, 2, 28),
    )
    assert date(2025, 2, 28) in _dates(
        _scheduled(date(2024, 1, 31), cadence="semimonthly"),
        date(2025, 2, 1),
        date(2025, 2, 28),
    )
    assert _dates(
        _scheduled(date(2024, 1, 1), cadence="semimonthly"),
        date(2023, 12, 31),
        date(2024, 2, 16),
    ) == [date(2024, 1, 1), date(2024, 1, 16), date(2024, 2, 1), date(2024, 2, 16)]
    assert _dates(
        _scheduled(date(2024, 1, 20), cadence="semimonthly"),
        date(2024, 1, 1),
        date(2024, 3, 20),
    ) == [
        date(2024, 1, 20),
        date(2024, 2, 5),
        date(2024, 2, 20),
        date(2024, 3, 5),
        date(2024, 3, 20),
    ]
    assert _dates(
        _scheduled(date(2024, 2, 15), cadence="semimonthly"),
        date(2024, 2, 1),
        date(2024, 3, 31),
    ) == [date(2024, 2, 15), date(2024, 2, 29), date(2024, 3, 15), date(2024, 3, 31)]


def test_posts_once_on_day_year_and_leap_boundaries_without_backfill():
    start = Fraction(40)
    amount = Fraction(8)
    anchor = date(2024, 1, 31)
    as_of = date(2024, 6, 1)
    bucket = _scheduled(anchor, start=start, as_of=as_of, amount=amount)
    assert _dates(bucket, as_of, date(2024, 8, 31)) == [
        date(2024, 6, 30),
        date(2024, 7, 31),
        date(2024, 8, 31),
    ]
    assert walk_bucket(bucket, {}, date(2024, 6, 15))[0] == start
    assert walk_bucket(bucket, {}, date(2024, 6, 30))[0] == start + amount
    assert walk_bucket(bucket, {}, date(2024, 7, 31))[0] == start + amount * 2
    # The anchor itself is not applied when it is on the balance date.
    same_day = _scheduled(date(2024, 6, 1), start=start, as_of=as_of, amount=amount)
    assert walk_bucket(same_day, {}, as_of)[0] == start
    assert walk_bucket(same_day, {}, date(2024, 6, 2))[0] == start
    assert walk_bucket(same_day, {}, date(2024, 7, 1))[0] == start + amount

    yearly = _scheduled(
        date(2025, 12, 31),
        cadence="yearly",
        as_of=date(2025, 12, 30),
        start=start,
        amount=amount,
    )
    assert walk_bucket(yearly, {}, date(2025, 12, 30))[0] == start
    assert walk_bucket(yearly, {}, date(2025, 12, 31))[0] == start + amount
    assert walk_bucket(yearly, {}, date(2026, 12, 30))[0] == start + amount
    assert walk_bucket(yearly, {}, date(2026, 12, 31))[0] == start + amount * 2

    leap = _scheduled(
        date(2024, 2, 29),
        cadence="yearly",
        as_of=date(2024, 2, 28),
        start=start,
        amount=amount,
    )
    assert walk_bucket(leap, {}, date(2024, 2, 28))[0] == start
    assert walk_bucket(leap, {}, date(2024, 2, 29))[0] == start + amount
    assert walk_bucket(leap, {}, date(2025, 2, 27))[0] == start + amount
    assert walk_bucket(leap, {}, date(2025, 2, 28))[0] == start + amount * 2
    assert walk_bucket(leap, {}, date(2028, 2, 29))[0] == start + amount * 5


def test_same_day_order_is_drop_then_post_then_charge_with_cap_and_zero():
    """A positive year-start drops before the post. A cap applies before the charge."""
    dropped = _scheduled(
        date(2026, 1, 1),
        as_of=date(2025, 12, 31),
        start=Fraction(20),
        amount=Fraction(8),
        carry=False,
    )
    assert walk_bucket(dropped, {}, date(2026, 1, 1))[0] == Fraction(8)

    capped = _scheduled(
        date(2026, 1, 8),
        as_of=date(2026, 1, 7),
        start=Fraction(-4),
        amount=Fraction(10),
        cap=Fraction(5),
        cadence="weekly",
    )
    charge = {date(2026, 1, 8): Fraction(3)}
    assert walk_bucket(capped, charge, date(2026, 1, 8))[0] == Fraction(2)

    zero = _scheduled(
        date(2026, 1, 15),
        as_of=date(2026, 1, 1),
        start=Fraction(0),
        amount=Fraction(8),
    )
    assert walk_bucket(zero, {}, date(2026, 1, 14))[0] == Fraction(0)
    assert walk_bucket(zero, {}, date(2026, 1, 15))[0] == Fraction(8)
    assert walk_bucket(zero, {}, date(2026, 2, 14))[0] == Fraction(8)

    paused = _scheduled(
        date(2026, 1, 8),
        as_of=date(2026, 1, 7),
        start=Fraction(0),
        amount=Fraction(6),
        cap=Fraction(10),
        cadence="weekly",
    )
    assert walk_bucket(paused, {}, date(2026, 1, 8))[0] == Fraction(6)
    assert walk_bucket(paused, {}, date(2026, 1, 15))[0] == Fraction(10)
    assert walk_bucket(paused, {}, date(2026, 1, 22))[0] == Fraction(10)
    dropped_under = {date(2026, 1, 15): Fraction(3)}
    assert walk_bucket(paused, dropped_under, date(2026, 1, 15))[0] == Fraction(7)
    assert walk_bucket(paused, dropped_under, date(2026, 1, 22))[0] == Fraction(10)

    negative = _scheduled(
        date(2026, 3, 1),
        as_of=date(2026, 2, 1),
        start=Fraction(-20),
        amount=Fraction(8),
    )
    assert walk_bucket(negative, {}, date(2026, 2, 28))[0] == Fraction(-20)
    assert walk_bucket(negative, {}, date(2026, 3, 1))[0] == Fraction(-12)
    none = _scheduled(
        date(2026, 3, 1),
        as_of=date(2026, 2, 1),
        start=Fraction(12),
        amount=Fraction(0),
    )
    assert walk_bucket(none, {date(2026, 3, 1): Fraction(5)}, date(2026, 4, 1))[0] == Fraction(7)


def test_scheduled_segments_match_the_walk_on_every_day():
    cases = (
        _scheduled(date(2024, 1, 31), as_of=date(2024, 1, 15), cap=Fraction(50)),
        _scheduled(
            date(2024, 2, 29),
            cadence="yearly",
            as_of=date(2024, 2, 28),
            carry=False,
            year_start="03-01",
        ),
        _scheduled(
            date(2024, 1, 15),
            cadence="semimonthly",
            as_of=date(2023, 12, 31),
            start=Fraction(-6),
            cap=Fraction(12),
        ),
        _scheduled(date(2024, 12, 30), cadence="weekly", as_of=date(2024, 12, 1)),
    )
    for bucket in cases:
        horizon = bucket.balance_as_of + timedelta(days=400)
        charges = {bucket.balance_as_of + timedelta(days=40): Fraction(5)}
        points = segments(bucket, charges, date(2026, 6, 1), horizon)
        ons = [point["on"] for point in points]
        assert ons == sorted(set(ons))
        posts = posting_dates(bucket, bucket.balance_as_of, horizon)
        assert posts == sorted(set(posts))
        assert [point["on"] for point in points if "post" in point["kinds"]] == posts
        cursor = points[0]
        index = 0
        day = bucket.balance_as_of
        while day <= horizon:
            while index + 1 < len(points) and points[index + 1]["on"] <= day:
                index += 1
                cursor = points[index]
            assert cursor["balance"] == walk_bucket(bucket, charges, day)[0]
            day += timedelta(days=1)


def _row(client, bucket="pto") -> LeavePolicy:
    db = _db(client)
    try:
        return (
            db.query(LeavePolicy)
            .filter(LeavePolicy.user_id == 1, LeavePolicy.bucket == bucket)
            .one()
        )
    finally:
        db.close()


def test_api_series_matches_the_walk_and_legacy_policies_stay_daily(client, monkeypatch):
    pin(monkeypatch, TODAY)
    saved = client.put(
        "/api/pto/policies/pto",
        json=_policy(start_balance_hours="40", accrual_hours="8", accrual_cadence="monthly"),
    )
    assert saved.status_code == 200, saved.text
    body = client.get("/api/pto/policies/pto").json()
    assert body["accrual_mode"] == "daily"
    assert body["accrual_anchor"] is None
    assert body["accrual_version"] == 0
    as_of = date(2026, 1, 1)
    daily = _bucket(as_of=as_of, amount=Fraction(8))
    assert body["balance_today_hours"] == fmt_hours(walk_bucket(daily, {}, TODAY)[0])
    series = client.get("/api/pto/series").json()["pto"]["points"]
    for point in series:
        walked, _before = walk_bucket(daily, {}, date.fromisoformat(point["on"]))
        assert point["hours"] == store_hours(quantize_hours(walked))
        assert "post" not in point["kinds"]

    for cadence in PERIOD_DAYS:
        other = client.put(
            "/api/pto/policies/sick",
            json=_policy(accrual_hours="3", accrual_cadence=cadence, start_balance_hours="0"),
        )
        assert other.status_code == 200, other.text
        sick = client.get("/api/pto/policies/sick").json()
        assert sick["accrual_mode"] == "daily"
        assert sick["accrual_anchor"] is None
        assert sick["accrual_version"] == 0


def test_mode_change_previews_confirms_and_does_not_backfill(client, monkeypatch):
    pin(monkeypatch, TODAY)
    assert (
        client.put(
            "/api/pto/policies/pto",
            json=_policy(start_balance_hours="40", accrual_hours="8", accrual_cadence="monthly"),
        ).status_code
        == 200
    )
    entry = client.post(
        "/api/pto/entries",
        json={
            "label": "Clinic",
            "start_date": "2026-04-02",
            "end_date": "2026-04-02",
            "days": "1",
            "bucket": "pto",
        },
    )
    assert entry.status_code == 201, entry.text
    before = client.get("/api/pto/policies/pto").json()
    assert before["accrual_version"] == 0
    proposed = _policy(
        start_balance_hours="40",
        accrual_hours="8",
        accrual_cadence="monthly",
        accrual_mode="scheduled",
        accrual_anchor="2026-01-31",
        accrual_version=0,
    )
    missing = dict(proposed)
    missing.pop("accrual_anchor")
    rejected = client.put("/api/pto/policies/pto", json=missing)
    assert rejected.status_code == 422
    assert rejected.json()["field_errors"]["accrual_anchor"] == ANCHOR_COPY
    assert client.get("/api/pto/policies/pto").json()["accrual_mode"] == "daily"

    impact = client.post("/api/pto/policies/pto/impact", json=proposed)
    assert impact.status_code == 200, impact.text
    preview = impact.json()
    assert preview["entries_rewritten"] is False
    assert preview["balance_today_hours"] != before["balance_today_hours"]
    # Cancel is not calling PUT. A stale confirm must not write either.
    stale = dict(proposed)
    stale["accrual_version"] = 4
    conflict = client.put("/api/pto/policies/pto", json=stale)
    assert conflict.status_code == 409, conflict.text
    assert conflict.json()["message"] == "Accrual schedule changed. Nothing was saved."
    untouched = client.get("/api/pto/policies/pto").json()
    assert untouched["accrual_mode"] == "daily"
    assert untouched["accrual_anchor"] is None
    assert untouched["accrual_version"] == 0
    assert untouched["start_balance_hours"] == "40"
    assert untouched["balance_today_hours"] == before["balance_today_hours"]

    confirmed = client.put("/api/pto/policies/pto", json=proposed)
    assert confirmed.status_code == 200, confirmed.text
    saved = client.get("/api/pto/policies/pto").json()
    assert saved["accrual_mode"] == "scheduled"
    assert saved["accrual_anchor"] == "2026-01-31"
    assert saved["accrual_version"] == 1
    assert saved["start_balance_hours"] == "40"
    assert saved["balance_as_of"] == "2026-01-01"
    assert saved["balance_today_hours"] == preview["balance_today_hours"]
    rows = client.get("/api/pto").json()["entries"]
    assert [(row["label"], row["start_date"], row["bucket"]) for row in rows] == [
        ("Clinic", "2026-04-02", "pto")
    ]
    db = _db(client)
    try:
        assert db.query(PtoEntry).count() == 1
    finally:
        db.close()

    moved = dict(proposed)
    moved["accrual_anchor"] = "2026-02-15"
    again = client.put("/api/pto/policies/pto", json=moved)
    assert again.status_code == 409, again.text
    held = client.get("/api/pto/policies/pto").json()
    assert held["accrual_version"] == 1
    assert held["accrual_anchor"] == "2026-01-31"

    series = client.get("/api/pto/series").json()["pto"]["points"]
    hpd = Fraction(8)
    charges = {date(2026, 4, 2): hpd}
    scheduled = _scheduled(
        date(2026, 1, 31),
        as_of=date(2026, 1, 1),
        start=Fraction(40),
        amount=Fraction(8),
    )
    assert (
        walk_bucket(scheduled, charges, TODAY)[0]
        != walk_bucket(_bucket(as_of=date(2026, 1, 1), amount=Fraction(8)), charges, TODAY)[0]
    )
    for point in series:
        walked, _before = walk_bucket(scheduled, charges, date.fromisoformat(point["on"]))
        assert point["hours"] == store_hours(quantize_hours(walked))

    daily_again = _policy(
        start_balance_hours="40",
        accrual_hours="8",
        accrual_cadence="monthly",
        accrual_mode="daily",
        accrual_version=1,
    )
    restored = client.put("/api/pto/policies/pto", json=daily_again)
    assert restored.status_code == 200, restored.text
    back = client.get("/api/pto/policies/pto").json()
    assert back["accrual_mode"] == "daily"
    assert back["accrual_anchor"] is None
    assert back["accrual_version"] == 2
    assert back["start_balance_hours"] == "40"
    assert back["balance_today_hours"] == fmt_hours(
        walk_bucket(_bucket(as_of=date(2026, 1, 1), amount=Fraction(8)), charges, TODAY)[0]
    )
