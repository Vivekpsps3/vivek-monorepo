"""TPTO1B bucket routes: balances, limits, dual-write, entries, ownership."""

import random
import time
from datetime import date, timedelta
from decimal import Decimal
from fractions import Fraction
from pathlib import Path

import pytest
from fastapi.encoders import jsonable_encoder
from sqlalchemy.orm import sessionmaker

from apps.server.auth import Principal, require_principal
from apps.travel.backend.models import LeavePolicy, PtoPolicy, Setting
from apps.travel.backend.services.assemble import snapshot_pto
from apps.travel.backend.services.leave_buckets import hpd_setting_key, sick_prompt_setting_key
from apps.travel.backend.services.leave_math import (
    ACCRUAL_COPY,
    CADENCE_COPY,
    CAP_COPY,
    HPD_COPY,
    START_COPY,
    YEAR_COPY,
    Bucket,
    as_of_copy,
    walk_bucket,
)
from apps.travel.backend.services.money import fmt_days, store_days
from apps.travel.backend.services.pto import (
    PERIOD_DAYS,
    Policy,
    Usage,
    _accrue,
    policy_from_row,
    walk,
)

TODAY = date(2026, 6, 15)
_CLOCKS = (
    "apps.travel.backend.routers.pto.date",
    "apps.travel.backend.routers.leave.date",
    "apps.travel.backend.services.pto.date",
    "apps.travel.backend.services.assemble.date",
)
_BALANCE_KEYS = (
    "configured",
    "balance_as_of",
    "balance_saved",
    "balance_today",
    "accrued_since",
    "used_since",
    "hours_per_day",
    "annual_cap_days",
    "today_before_balance_date",
)


def _http(value):
    """Same JSON encoding the travel response uses, so date fields stay comparable."""
    return jsonable_encoder(value)


def pin(monkeypatch, day: date = TODAY) -> None:
    class Clock(date):
        @classmethod
        def today(cls):
            return day

    for path in _CLOCKS:
        monkeypatch.setattr(path, Clock)


def _db(client):
    return sessionmaker(bind=client.app.state.database.engine)()


def _policy(**overrides):
    body = {
        "start_balance_hours": "0",
        "balance_as_of": "2026-01-01",
        "accrual_hours": "0",
        "accrual_cadence": "yearly",
        "cap_hours": None,
        "year_start": "01-01",
    }
    body.update(overrides)
    return body


def _fraction_walk(start, daily, cap, charges, as_of, on) -> Fraction:
    if on < as_of:
        return start
    balance = start
    day = as_of + timedelta(days=1)
    while day <= on:
        balance, _added = _accrue(balance, daily, cap)
        balance -= charges.get(day, Fraction(0))
        day += timedelta(days=1)
    return balance


def test_walk_bucket_matches_the_day_walk_for_300_policies():
    rng = random.Random(20261101)
    hpds = [Decimal(value) for value in ("8", "7.5", "0.5", "24", "7.25")]
    for _index in range(300):
        hpd = Fraction(rng.choice(hpds))
        unit = rng.choice(("day", "hour"))
        cadence = rng.choice(tuple(PERIOD_DAYS))
        balance = Fraction(rng.randrange(-200000, 200000), 10000)
        accrual = Fraction(rng.randrange(0, 80000), 10000)
        cap = None if rng.random() < 0.5 else Fraction(rng.randrange(1, 200000), 10000)
        as_of = date(2026, 1, 1) + timedelta(days=rng.randrange(0, 20))
        on = as_of + timedelta(days=rng.randrange(0, 100))
        day_charges: dict[date, Fraction] = {}
        hour_charges: dict[date, Fraction] = {}
        for _entry in range(rng.randrange(0, 4)):
            taken = as_of + timedelta(days=rng.randrange(0, 90))
            amount = Fraction(rng.randrange(0, 20000), 10000)
            day_charges[taken] = day_charges.get(taken, Fraction(0)) + amount
            hour_charges[taken] = hour_charges.get(taken, Fraction(0)) + amount * hpd
        per = accrual / hpd if unit == "hour" else accrual
        accrual_hours = accrual if unit == "hour" else accrual * hpd
        cap_hours = None if cap is None else cap * hpd
        days = _fraction_walk(balance, per / PERIOD_DAYS[cadence], cap, day_charges, as_of, on)
        hours, _before = walk_bucket(
            Bucket("pto", True, balance * hpd, as_of, accrual_hours, cadence, cap_hours, "01-01"),
            hour_charges,
            on,
        )
        assert hours / hpd == days


def test_legacy_balances_stay_byte_compatible(client, monkeypatch):
    pin(monkeypatch)
    saved = client.put(
        "/api/pto/policy",
        json={
            "accrual_amount": "3.25",
            "accrual_unit": "hour",
            "accrual_cadence": "biweekly",
            "hours_per_day": "7.5",
            "balance_days": "5.5",
            "balance_as_of": "2026-01-15",
        },
    )
    assert saved.status_code == 200, saved.text
    original = Policy(
        True,
        Decimal("3.25"),
        "hour",
        "biweekly",
        Decimal("7.5"),
        Decimal("5.5"),
        date(2026, 1, 15),
        None,
    )
    expected = _http(snapshot_pto(original, [], TODAY))
    assert saved.json()["policy"] == expected
    home = client.get("/api/home").json()["pto"]
    assert {key: home[key] for key in _BALANCE_KEYS} == {
        key: expected[key] for key in _BALANCE_KEYS
    }
    made = client.post(
        "/api/trips",
        json={"title": "Office", "start_date": "2026-04-06", "end_date": "2026-04-06"},
    )
    assert made.status_code == 201, made.text
    detail = client.get(f"/api/trips/{made.json()['id']}").json()["pto"]
    usage = Usage(None, date(2026, 4, 6), date(2026, 4, 6), Decimal(1), "Office", made.json()["id"])
    projected = walk(original, [usage], date(2026, 4, 6))
    assert detail["leftover_after"] == fmt_days(projected.balance)
    assert detail["counts"] is True


def test_sick_entries_do_not_change_pto_projections(client, monkeypatch):
    pin(monkeypatch)
    assert (
        client.put("/api/pto/policies/pto", json=_policy(start_balance_hours="80")).status_code
        == 200
    )
    assert (
        client.put(
            "/api/pto/policies/sick",
            json=_policy(start_balance_hours="40", accrual_hours="8", accrual_cadence="monthly"),
        ).status_code
        == 200
    )
    made = client.post(
        "/api/trips",
        json={"title": "Overlap", "start_date": "2026-04-06", "end_date": "2026-04-06"},
    )
    assert made.status_code == 201, made.text
    before = client.get("/api/pto").json()
    trip_before = client.get(f"/api/trips/{made.json()['id']}").json()["pto"]
    home_before = client.get("/api/home").json()["pto"]["balance_today"]
    sick = client.post(
        "/api/pto/entries",
        json={
            "label": "Clinic",
            "start_date": "2026-04-06",
            "end_date": "2026-04-06",
            "days": "1",
            "bucket": "sick",
        },
    )
    assert sick.status_code == 201, sick.text
    after = client.get("/api/pto").json()
    assert after["policy"]["balance_today"] == before["policy"]["balance_today"]
    assert (
        after["buckets"]["pto"]["balance_today_hours"]
        == before["buckets"]["pto"]["balance_today_hours"]
    )
    assert (
        after["buckets"]["sick"]["balance_today_hours"]
        != before["buckets"]["sick"]["balance_today_hours"]
    )
    assert client.get("/api/home").json()["pto"]["balance_today"] == home_before
    assert (
        client.get(f"/api/trips/{made.json()['id']}").json()["pto"]["leftover_after"]
        == trip_before["leftover_after"]
    )
    labels = {label for item in after["policy"]["conflicts"] for label in item["labels"]}
    assert "Clinic" in labels and "Overlap" in labels


_PASS = [
    ("start_balance_hours", "-8784"),
    ("start_balance_hours", "8784"),
    ("balance_as_of", "2000-01-01"),
    ("balance_as_of", "2027-06-16"),
    ("accrual_hours", "0"),
    ("accrual_hours", "8784"),
    ("accrual_cadence", "weekly"),
    ("cap_hours", None),
    ("cap_hours", "8784"),
    ("year_start", "02-28"),
]


@pytest.mark.parametrize(("field", "value"), _PASS)
def test_limit_boundary_is_accepted(client, monkeypatch, field, value):
    pin(monkeypatch)
    saved = client.put("/api/pto/policies/sick", json=_policy(**{field: value}))
    assert saved.status_code == 200, saved.text


_FAIL = [
    ("start_balance_hours", "-8784.000001", START_COPY),
    ("start_balance_hours", "8784.000001", START_COPY),
    ("balance_as_of", "1999-12-31", as_of_copy(TODAY)),
    ("balance_as_of", "2027-06-17", as_of_copy(TODAY)),
    ("accrual_hours", "-0.000001", ACCRUAL_COPY),
    ("accrual_hours", "8784.000001", ACCRUAL_COPY),
    ("accrual_cadence", "daily", CADENCE_COPY),
    ("cap_hours", "0", CAP_COPY),
    ("cap_hours", "8784.000001", CAP_COPY),
    ("year_start", "02-29", YEAR_COPY),
    ("year_start", "04-31", YEAR_COPY),
]


@pytest.mark.parametrize(("field", "value", "copy"), _FAIL)
def test_one_step_past_the_limit_uses_the_painter_copy(client, monkeypatch, field, value, copy):
    pin(monkeypatch)
    saved = client.put("/api/pto/policies/pto", json=_policy(**{field: value}))
    assert saved.status_code == 422, saved.text
    body = saved.json()
    assert body["code"] == "validation_error"
    assert body["message"] == "Check the highlighted fields."
    assert body["detail"] == body["message"]
    assert body["field_errors"][field] == copy


@pytest.mark.parametrize(
    ("field", "value", "copy"),
    [
        ("start_balance_hours", True, START_COPY),
        ("start_balance_hours", False, START_COPY),
        ("accrual_hours", True, ACCRUAL_COPY),
        ("accrual_hours", False, ACCRUAL_COPY),
        ("cap_hours", True, CAP_COPY),
        ("cap_hours", False, CAP_COPY),
        ("accrual_cadence", True, CADENCE_COPY),
        ("accrual_cadence", False, CADENCE_COPY),
        ("accrual_cadence", 1, CADENCE_COPY),
        ("accrual_cadence", 1.5, CADENCE_COPY),
        ("year_start", True, YEAR_COPY),
        ("year_start", False, YEAR_COPY),
        ("year_start", 101, YEAR_COPY),
        ("year_start", 1.5, YEAR_COPY),
    ],
)
def test_bool_and_non_string_fields_use_the_painter_copy(client, monkeypatch, field, value, copy):
    pin(monkeypatch)
    saved = client.put("/api/pto/policies/pto", json=_policy(**{field: value}))
    assert saved.status_code == 422, saved.text
    body = saved.json()
    assert body["code"] == "validation_error"
    assert body["message"] == "Check the highlighted fields."
    assert body["detail"] == body["message"]
    assert body["field_errors"][field] == copy


@pytest.mark.parametrize("value", [True, False])
def test_bool_hours_per_day_uses_the_painter_copy(client, monkeypatch, value):
    pin(monkeypatch)
    saved = client.put("/api/settings/pto", json={"hours_per_day": value})
    assert saved.status_code == 422, saved.text
    body = saved.json()
    assert body["code"] == "validation_error"
    assert body["message"] == "Check the highlighted fields."
    assert body["field_errors"] == {"hours_per_day": HPD_COPY}
    assert client.get("/api/settings").json()["pto"]["hours_per_day"] == "8"


def test_json_integers_still_save_as_numbers(client, monkeypatch):
    pin(monkeypatch)
    saved = client.put(
        "/api/pto/policies/pto",
        json=_policy(start_balance_hours=1, accrual_hours=0, cap_hours=2),
    )
    assert saved.status_code == 200, saved.text
    hours = client.put("/api/settings/pto", json={"hours_per_day": 8})
    assert hours.status_code == 200, hours.text
    assert hours.json()["hours_per_day"] == "8"


def test_leave_docstrings_omit_the_series_split():
    root = Path(__file__).resolve().parents[1]
    for name in ("services/leave_math.py", "routers/leave.py"):
        text = (root / name).read_text()
        assert "stacked series change" not in text
        assert "GET /pto/series" not in text


def test_hours_per_day_limits_and_combined_field_errors(client, monkeypatch):
    pin(monkeypatch)
    assert client.put("/api/settings/pto", json={"hours_per_day": "24"}).status_code == 200
    for bad in ("24.001", "7.125", "0", "-1"):
        saved = client.put("/api/settings/pto", json={"hours_per_day": bad})
        assert saved.status_code == 422, (bad, saved.text)
        assert saved.json()["field_errors"] == {"hours_per_day": HPD_COPY}
    saved = client.put(
        "/api/pto/policies/pto",
        json=_policy(
            start_balance_hours="nope",
            balance_as_of="nope",
            accrual_hours="-1",
            accrual_cadence="daily",
            cap_hours="0",
            year_start="02-29",
        ),
    )
    assert saved.status_code == 422, saved.text
    assert set(saved.json()["field_errors"]) == {
        "start_balance_hours",
        "balance_as_of",
        "accrual_hours",
        "accrual_cadence",
        "cap_hours",
        "year_start",
    }


def test_grandfather_keeps_an_out_of_range_stored_value(client, monkeypatch):
    pin(monkeypatch)
    db = _db(client)
    try:
        db.add(Setting(key=hpd_setting_key(1), value="10"))
        db.add(
            LeavePolicy(
                user_id=1,
                bucket="pto",
                configured=True,
                start_balance_hours="9000.123456",
                balance_as_of=date(2026, 1, 1),
                accrual_hours="10000",
                accrual_cadence="yearly",
                cap_hours=None,
                year_start="01-01",
            )
        )
        db.commit()
    finally:
        db.close()
    again = client.put(
        "/api/pto/policies/pto",
        json=_policy(start_balance_hours="9000.123456", accrual_hours="10000"),
    )
    assert again.status_code == 200, again.text
    changed = client.put(
        "/api/pto/policies/pto",
        json=_policy(start_balance_hours="9000.123456", accrual_hours="9000"),
    )
    assert changed.status_code == 422, changed.text
    assert changed.json()["field_errors"]["accrual_hours"] == ACCRUAL_COPY
    nudged = client.put(
        "/api/pto/policies/pto",
        json=_policy(start_balance_hours="9000.123455", accrual_hours="10000"),
    )
    assert nudged.status_code == 422, nudged.text
    assert nudged.json()["field_errors"]["start_balance_hours"] == START_COPY


def test_dual_write_matches_the_rollback_copy(client, monkeypatch):
    pin(monkeypatch)
    saved = client.put(
        "/api/pto/policies/pto",
        json=_policy(
            start_balance_hours="10",
            accrual_hours="3.25",
            accrual_cadence="biweekly",
            cap_hours="20",
        ),
    )
    assert saved.status_code == 200, saved.text
    db = _db(client)
    try:
        row = db.query(PtoPolicy).filter(PtoPolicy.user_id == 1).one()
        assert row.accrual_unit == "hour"
        assert row.accrual_amount == store_days(Decimal("3.25"))
        assert row.balance_days == store_days(Decimal("10") / Decimal("8"))
        assert row.annual_cap_days == store_days(Decimal("20") / Decimal("8"))
        assert row.hours_per_day == store_days(Decimal("8"))
        assert row.accrual_cadence == "biweekly"
        assert row.balance_as_of == date(2026, 1, 1)
        snap = _http(snapshot_pto(policy_from_row(row), [], TODAY))
    finally:
        db.close()
    assert saved.json()["policy"] == snap
    changed = client.put("/api/settings/pto", json={"hours_per_day": "10"})
    assert changed.status_code == 200, changed.text
    db = _db(client)
    try:
        row = db.query(PtoPolicy).filter(PtoPolicy.user_id == 1).one()
        leave = (
            db.query(LeavePolicy)
            .filter(LeavePolicy.user_id == 1, LeavePolicy.bucket == "pto")
            .one()
        )
        assert leave.start_balance_hours == "10"
        assert row.hours_per_day == store_days(Decimal("10"))
        assert row.balance_days == store_days(Decimal("10") / Decimal("10"))
        db.delete(leave)
        db.commit()
    finally:
        db.close()
    only_hpd = client.put("/api/settings/pto", json={"hours_per_day": "6"})
    assert only_hpd.status_code == 200, only_hpd.text
    db = _db(client)
    try:
        row = db.query(PtoPolicy).filter(PtoPolicy.user_id == 1).one()
        assert row.hours_per_day == store_days(Decimal("6"))
        assert row.accrual_amount == store_days(Decimal("3.25"))
        assert db.query(LeavePolicy).filter(LeavePolicy.bucket == "pto").count() == 0
    finally:
        db.close()


def test_settings_are_partial_and_hpd_does_not_rewrite_hours(client, monkeypatch):
    pin(monkeypatch)
    assert (
        client.put("/api/pto/policies/pto", json=_policy(start_balance_hours="80")).status_code
        == 200
    )
    empty = client.put("/api/settings/pto", json={})
    assert empty.status_code == 200, empty.text
    assert empty.json() == {"hours_per_day": "8", "sick_prompt_dismissed": False}
    prompt = client.put("/api/settings/pto", json={"sick_prompt_dismissed": True})
    assert prompt.json()["sick_prompt_dismissed"] is True
    assert prompt.json()["hours_per_day"] == "8"
    settings = client.get("/api/settings").json()["pto"]
    assert settings == {"hours_per_day": "8", "sick_prompt_dismissed": True}
    cleared = client.put("/api/settings/pto", json={"sick_prompt_dismissed": False})
    assert cleared.json()["sick_prompt_dismissed"] is False
    db = _db(client)
    try:
        assert db.get(Setting, sick_prompt_setting_key(1)) is None
        assert db.get(Setting, hpd_setting_key(1)).value == "8"
    finally:
        db.close()
    before = client.get("/api/pto").json()
    updated = client.put("/api/settings/pto", json={"hours_per_day": "5"})
    assert updated.status_code == 200, updated.text
    after = client.get("/api/pto").json()
    assert after["buckets"]["pto"]["start_balance_hours"] == "80"
    assert (
        after["buckets"]["pto"]["balance_today_days"]
        != before["buckets"]["pto"]["balance_today_days"]
    )
    assert after["hours_per_day"] == "5"


def test_entries_keep_a_bucket_and_trip_sync_stays_pto(client, monkeypatch):
    pin(monkeypatch)
    manual = client.post(
        "/api/pto/entries",
        json={
            "label": "Errand",
            "start_date": "2026-02-02",
            "end_date": "2026-02-02",
            "days": "0.5",
        },
    )
    assert manual.status_code == 201, manual.text
    entry = manual.json()["entries"][0]
    assert entry["bucket"] == "pto"
    assert entry["hours"] == "4"
    sick = client.post(
        "/api/pto/entries",
        json={
            "label": "Clinic",
            "start_date": "2026-02-03",
            "end_date": "2026-02-03",
            "days": "1",
            "bucket": "sick",
        },
    )
    assert sick.status_code == 201, sick.text
    board = client.get("/api/pto").json()
    assert board["buckets"]["sick"] is None
    assert any(row["bucket"] == "sick" and row["hours"] == "8" for row in board["entries"])
    bad = client.post(
        "/api/pto/entries",
        json={
            "label": "Nope",
            "start_date": "2026-02-04",
            "end_date": "2026-02-04",
            "days": "1",
            "bucket": "vacation",
        },
    )
    assert bad.status_code == 422, bad.text
    assert bad.json()["field_errors"]["bucket"] == "Pick PTO or Sick."
    made = client.post(
        "/api/trips",
        json={"title": "Synced", "start_date": "2026-04-07", "end_date": "2026-04-07"},
    )
    assert made.status_code == 201, made.text
    synced = [
        row
        for row in client.get("/api/pto").json()["entries"]
        if row["trip_id"] == made.json()["id"]
    ]
    assert synced and synced[0]["bucket"] == "pto"
    preview = client.get(
        "/api/pto/preview", params={"start": "2026-05-04", "end": "2026-05-04", "bucket": "sick"}
    )
    assert preview.status_code == 200, preview.text
    assert preview.json()["bucket"] == "sick"
    assert preview.json()["configured"] is False
    assert (
        client.get(
            "/api/pto/preview",
            params={"start": "2026-05-04", "end": "2026-05-04", "bucket": "nope"},
        ).status_code
        == 404
    )


def test_other_users_cannot_see_or_edit_leave(client):
    assert (
        client.put("/api/pto/policies/pto", json=_policy(start_balance_hours="80")).status_code
        == 200
    )
    created = client.post(
        "/api/pto/entries",
        json={"label": "Mine", "start_date": "2026-02-02", "end_date": "2026-02-02", "days": "1"},
    )
    entry_id = created.json()["entries"][0]["id"]
    client.app.dependency_overrides[require_principal] = lambda: Principal(2, "other", "Other")
    assert client.get("/api/pto").json()["buckets"]["pto"] is None
    assert client.get("/api/pto/policies/pto").json() == {"bucket": "pto", "configured": False}
    assert client.get("/api/settings").json()["pto"]["hours_per_day"] == "8"
    assert client.delete(f"/api/pto/entries/{entry_id}").status_code == 404
    client.app.dependency_overrides[require_principal] = lambda: Principal(1, "tester", "Tester")
    assert client.get("/api/pto/policies/pto").json()["start_balance_hours"] == "80"


def test_there_is_no_delete_policy_route(client):
    matches = [
        route.path
        for route in client.app.routes
        if "pto/policies" in getattr(route, "path", "")
        and "DELETE" in getattr(route, "methods", set())
    ]
    assert matches == []
    assert client.delete("/api/pto/policies/sick").status_code in (404, 405)


def test_unknown_bucket_is_404_and_unset_policy_is_a_short_body(client):
    assert client.get("/api/pto/policies/vacation").status_code == 404
    body = client.get("/api/pto/policies/sick").json()
    assert body == {"bucket": "sick", "configured": False}
    assert client.put("/api/pto/policies/vacation", json=_policy()).status_code == 404


def _reject(client, field, value, copy, *, settings=False):
    if settings:
        saved = client.put("/api/settings/pto", json={field: value})
    else:
        saved = client.put("/api/pto/policies/pto", json=_policy(**{field: value}))
    label = value if not isinstance(value, str) or len(value) < 40 else f"{len(value)} chars"
    assert saved.status_code == 422, (label, saved.text)
    assert saved.json()["field_errors"][field] == copy
    return saved


def test_overlong_and_non_ascii_hours_are_rejected(client, monkeypatch):
    pin(monkeypatch)
    started = time.perf_counter()
    _reject(client, "start_balance_hours", "1." + "0" * 40 + "1", START_COPY)
    _reject(client, "hours_per_day", "7.25" + "0" * 40 + "1", HPD_COPY, settings=True)
    huge = "9" * 20000
    began = time.perf_counter()
    _reject(client, "start_balance_hours", huge, START_COPY)
    assert time.perf_counter() - began < 1
    assert time.perf_counter() - started < 1
    _reject(client, "start_balance_hours", "1_000", START_COPY)
    _reject(client, "start_balance_hours", "\uff18", START_COPY)
    # Inside the 32-character cap, but past 28 significant digits. normalize() would pass it.
    _reject(client, "start_balance_hours", "1." + "0" * 27 + "1", START_COPY)
    _reject(client, "hours_per_day", "7." + "0" * 28 + "1", HPD_COPY, settings=True)


def test_six_decimal_start_is_accepted_and_seven_is_not(client, monkeypatch):
    pin(monkeypatch)
    saved = client.put("/api/pto/policies/sick", json=_policy(start_balance_hours="1.000001"))
    assert saved.status_code == 200, saved.text
    assert saved.json()["buckets"]["sick"]["start_balance_hours"] == "1.000001"
    _reject(client, "start_balance_hours", "1.0000001", START_COPY)


def test_json_floats_still_save_as_numbers(client, monkeypatch):
    pin(monkeypatch)
    saved = client.put(
        "/api/pto/policies/pto",
        json=_policy(start_balance_hours=1.5, accrual_hours=0.0, cap_hours=2.0),
    )
    assert saved.status_code == 200, saved.text
    assert saved.json()["buckets"]["pto"]["start_balance_hours"] == "1.5"
    hours = client.put("/api/settings/pto", json={"hours_per_day": 7.5})
    assert hours.status_code == 200, hours.text
    assert hours.json()["hours_per_day"] == "7.5"


def test_wrong_type_keys_field_errors_by_the_field(client, monkeypatch):
    pin(monkeypatch)
    wrong_types: tuple[list[str], dict[str, str]] = ([], {})
    for bad in wrong_types:
        saved = client.put("/api/pto/policies/pto", json=_policy(start_balance_hours=bad))
        assert saved.status_code == 422, saved.text
        assert saved.json()["field_errors"] == {"start_balance_hours": START_COPY}


def test_hours_per_day_rejects_25_and_keeps_24(client, monkeypatch):
    pin(monkeypatch)
    assert client.put("/api/settings/pto", json={"hours_per_day": "24"}).status_code == 200
    _reject(client, "hours_per_day", "25", HPD_COPY, settings=True)


def test_grandfather_keeps_an_out_of_range_stored_hours_per_day(client, monkeypatch):
    pin(monkeypatch)
    db = _db(client)
    try:
        db.add(Setting(key=hpd_setting_key(1), value="30"))
        db.commit()
    finally:
        db.close()
    again = client.put("/api/settings/pto", json={"hours_per_day": "30"})
    assert again.status_code == 200, again.text
    assert again.json()["hours_per_day"] == "30"
    changed = client.put("/api/settings/pto", json={"hours_per_day": "25"})
    assert changed.status_code == 422, changed.text
    assert changed.json()["field_errors"] == {"hours_per_day": HPD_COPY}
    assert client.get("/api/settings").json()["pto"]["hours_per_day"] == "30"


@pytest.mark.parametrize("value", ["yes", 1, "true"])
def test_sick_prompt_dismissed_rejects_lax_bools(client, value):
    saved = client.put("/api/settings/pto", json={"sick_prompt_dismissed": value})
    assert saved.status_code == 422, saved.text
    assert "sick_prompt_dismissed" in saved.json()["field_errors"]
    assert client.get("/api/settings").json()["pto"]["sick_prompt_dismissed"] is False


def test_other_users_pto_save_leaves_the_first_policy_byte_identical(client, monkeypatch):
    pin(monkeypatch)
    assert (
        client.put("/api/pto/policies/pto", json=_policy(start_balance_hours="80")).status_code
        == 200
    )
    db = _db(client)
    try:
        row = db.query(PtoPolicy).filter(PtoPolicy.user_id == 1).one()
        before = tuple(
            (column.name, getattr(row, column.name)) for column in PtoPolicy.__table__.columns
        )
    finally:
        db.close()
    client.app.dependency_overrides[require_principal] = lambda: Principal(2, "other", "Other")
    saved = client.put(
        "/api/pto/policies/pto",
        json=_policy(start_balance_hours="10", accrual_hours="1", balance_as_of="2026-02-01"),
    )
    assert saved.status_code == 200, saved.text
    client.app.dependency_overrides[require_principal] = lambda: Principal(1, "tester", "Tester")
    db = _db(client)
    try:
        row = db.query(PtoPolicy).filter(PtoPolicy.user_id == 1).one()
        after = tuple(
            (column.name, getattr(row, column.name)) for column in PtoPolicy.__table__.columns
        )
        assert after == before
        assert db.query(PtoPolicy).count() == 2
    finally:
        db.close()


def test_one_sick_weekday_reduces_a_40_hour_balance_to_32(client, monkeypatch):
    pin(monkeypatch)
    assert (
        client.put(
            "/api/pto/policies/sick",
            json=_policy(start_balance_hours="40", accrual_hours="0"),
        ).status_code
        == 200
    )
    taken = client.post(
        "/api/pto/entries",
        json={
            "label": "Clinic",
            "start_date": "2026-06-12",
            "end_date": "2026-06-12",
            "days": "1",
            "bucket": "sick",
        },
    )
    assert taken.status_code == 201, taken.text
    state = client.get("/api/pto/policies/sick").json()
    assert state["balance_today_hours"] == "32"


def test_balance_equal_to_the_cap_is_at_cap(client, monkeypatch):
    pin(monkeypatch)
    saved = client.put(
        "/api/pto/policies/sick",
        json=_policy(start_balance_hours="40", cap_hours="40", balance_as_of="2026-06-15"),
    )
    assert saved.status_code == 200, saved.text
    assert saved.json()["buckets"]["sick"]["at_cap"] is True
    below = client.put(
        "/api/pto/policies/sick",
        json=_policy(start_balance_hours="39", cap_hours="40", balance_as_of="2026-06-15"),
    )
    assert below.json()["buckets"]["sick"]["at_cap"] is False


def test_the_balance_date_itself_is_not_before_the_balance_date(client, monkeypatch):
    pin(monkeypatch)
    on_date = client.put(
        "/api/pto/policies/sick",
        json=_policy(balance_as_of="2026-06-15", start_balance_hours="10"),
    )
    assert on_date.status_code == 200, on_date.text
    assert on_date.json()["buckets"]["sick"]["today_before_balance_date"] is False
    later = client.put(
        "/api/pto/policies/sick",
        json=_policy(balance_as_of="2026-06-16", start_balance_hours="10"),
    )
    assert later.json()["buckets"]["sick"]["today_before_balance_date"] is True


def test_preview_uses_only_the_requested_bucket(client, monkeypatch):
    pin(monkeypatch)
    assert (
        client.put("/api/pto/policies/pto", json=_policy(start_balance_hours="80")).status_code
        == 200
    )
    assert (
        client.put("/api/pto/policies/sick", json=_policy(start_balance_hours="40")).status_code
        == 200
    )
    sick = client.post(
        "/api/pto/entries",
        json={
            "label": "Clinic",
            "start_date": "2026-03-02",
            "end_date": "2026-03-02",
            "days": "2",
            "bucket": "sick",
        },
    )
    assert sick.status_code == 201, sick.text
    pto = client.post(
        "/api/pto/entries",
        json={
            "label": "Errand",
            "start_date": "2026-03-03",
            "end_date": "2026-03-03",
            "days": "1",
            "bucket": "pto",
        },
    )
    assert pto.status_code == 201, pto.text
    params = {"start": "2026-06-01", "end": "2026-06-01", "days": "1"}
    pto_preview = client.get("/api/pto/preview", params={**params, "bucket": "pto"})
    sick_preview = client.get("/api/pto/preview", params={**params, "bucket": "sick"})
    assert pto_preview.status_code == 200, pto_preview.text
    assert sick_preview.status_code == 200, sick_preview.text
    assert pto_preview.json()["leftover_after"] == "8"
    assert sick_preview.json()["leftover_after"] == "2"


def _pto_policy_snapshot(client):
    saved = client.get("/api/pto").json()["policy"]
    return saved


def _seed_divergent_legacy(client, **overrides):
    values = {
        "setting_hpd": "8",
        "legacy_hpd": "8.0000",
        "legacy_balance": "5.0000",
        "legacy_accrual": "16.0000",
        "legacy_unit": "hour",
        "legacy_cadence": "yearly",
        "legacy_as_of": date(2026, 1, 1),
        "legacy_cap": None,
        "legacy_configured": True,
        "leave_start": "40",
        "leave_accrual": "16",
        "leave_cadence": "yearly",
        "leave_as_of": date(2026, 1, 1),
        "leave_cap": None,
        "leave_configured": True,
    }
    values.update(overrides)
    db = _db(client)
    try:
        db.add(Setting(key=hpd_setting_key(1), value=values["setting_hpd"]))
        db.add(
            PtoPolicy(
                user_id=1,
                configured=values["legacy_configured"],
                accrual_amount=values["legacy_accrual"],
                accrual_unit=values["legacy_unit"],
                accrual_cadence=values["legacy_cadence"],
                hours_per_day=values["legacy_hpd"],
                balance_days=values["legacy_balance"],
                balance_as_of=values["legacy_as_of"],
                annual_cap_days=values["legacy_cap"],
            )
        )
        db.add(
            LeavePolicy(
                user_id=1,
                bucket="pto",
                configured=values["leave_configured"],
                start_balance_hours=values["leave_start"],
                balance_as_of=values["leave_as_of"],
                accrual_hours=values["leave_accrual"],
                accrual_cadence=values["leave_cadence"],
                cap_hours=values["leave_cap"],
                year_start="01-01",
            )
        )
        db.commit()
    finally:
        db.close()


def test_preimage_hours_per_day_mismatch_uses_the_hour_policy(client, monkeypatch):
    pin(monkeypatch)
    _seed_divergent_legacy(client, legacy_hpd="10.0000")
    policy = _pto_policy_snapshot(client)
    assert policy["hours_per_day"] == "8.0000"
    assert policy["accrual_unit"] == "hour"


def test_preimage_as_of_mismatch_uses_the_leave_date(client, monkeypatch):
    pin(monkeypatch)
    _seed_divergent_legacy(client, leave_as_of=date(2026, 2, 1))
    policy = _pto_policy_snapshot(client)
    assert policy["balance_as_of"] == "2026-02-01"
    assert policy["accrual_unit"] == "hour"


def test_preimage_cap_mismatch_uses_the_leave_cap(client, monkeypatch):
    pin(monkeypatch)
    _seed_divergent_legacy(client, legacy_cap="10.0000", leave_cap="40")
    policy = _pto_policy_snapshot(client)
    assert policy["annual_cap_days"] == "5.0000"
    assert policy["accrual_unit"] == "hour"


def test_preimage_cadence_mismatch_uses_the_leave_cadence(client, monkeypatch):
    pin(monkeypatch)
    _seed_divergent_legacy(client, leave_cadence="monthly")
    policy = _pto_policy_snapshot(client)
    assert policy["accrual_cadence"] == "monthly"
    assert policy["accrual_unit"] == "hour"


def test_preimage_start_mismatch_does_not_keep_the_legacy_policy(client, monkeypatch):
    pin(monkeypatch)
    _seed_divergent_legacy(
        client,
        leave_start="80",
        legacy_unit="day",
        legacy_accrual="2.0000",
    )
    policy = _pto_policy_snapshot(client)
    assert policy["accrual_unit"] == "hour"
    assert policy["accrual_amount"] == "16.0000"
    assert policy["balance_saved"] == "10.0000"


def test_preimage_accrual_mismatch_uses_the_leave_hours(client, monkeypatch):
    pin(monkeypatch)
    _seed_divergent_legacy(client, leave_accrual="32")
    policy = _pto_policy_snapshot(client)
    assert policy["accrual_amount"] == "32.0000"
    assert policy["accrual_unit"] == "hour"


def test_unconfigured_legacy_row_does_not_hide_the_leave_policy(client, monkeypatch):
    pin(monkeypatch)
    _seed_divergent_legacy(client, legacy_configured=False)
    policy = _pto_policy_snapshot(client)
    assert policy["configured"] is True
    assert policy["accrual_unit"] == "hour"
    assert policy["balance_saved"] == "5.0000"


def test_unconfigured_leave_row_stays_unconfigured(client, monkeypatch):
    pin(monkeypatch)
    db = _db(client)
    try:
        db.add(
            LeavePolicy(
                user_id=1,
                bucket="pto",
                configured=False,
                start_balance_hours="80",
                balance_as_of=date(2026, 1, 1),
                accrual_hours="16",
                accrual_cadence="yearly",
                year_start="01-01",
            )
        )
        db.commit()
    finally:
        db.close()
    policy = _pto_policy_snapshot(client)
    assert policy["configured"] is False
    assert client.get("/api/pto").json()["buckets"]["pto"] is None
