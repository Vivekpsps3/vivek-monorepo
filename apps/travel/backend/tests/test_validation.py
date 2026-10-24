"""Invalid numeric and patch inputs fail as validation errors."""

import json
import sys
from datetime import date
from decimal import Decimal
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from apps.travel.backend.services.money import fmt_days, parse_days, parse_money, store_days


@pytest.mark.parametrize("value", ["NaN", "Infinity", "-Infinity", "1e9999", "oops"])
def test_parse_money_rejects_invalid_numbers_with_value_error(value):
    with pytest.raises(ValueError):
        parse_money(value)


@pytest.mark.parametrize("value", ["NaN", "Infinity", "-Infinity", "1e9999", "oops"])
def test_parse_days_rejects_invalid_numbers_with_value_error(value):
    with pytest.raises(ValueError):
        parse_days(value)


def test_api_rejects_huge_cost_and_nonfinite_coordinates_as_422(client):
    huge_cost = client.post(
        "/api/trips",
        json={
            "title": "Large fare",
            "start_date": "2026-11-02",
            "end_date": "2026-11-03",
            "transports": [{"role": "outbound", "mode": "flight", "cost": "1e9999"}],
        },
    )
    assert huge_cost.status_code == 422

    nonfinite_coordinate = client.post(
        "/api/trips",
        content=json.dumps(
            {
                "title": "Invalid map point",
                "start_date": "2026-11-02",
                "end_date": "2026-11-03",
                "stays": [
                    {
                        "city": "Tokyo",
                        "arrive_on": "2026-11-02",
                        "leave_on": "2026-11-03",
                        "lat": float("nan"),
                    }
                ],
            },
            allow_nan=True,
        ),
        headers={"content-type": "application/json"},
    )
    assert nonfinite_coordinate.status_code == 422


def test_fmt_days_trims_to_two_places():
    assert fmt_days(Decimal("12.5000")) == "12.5"
    assert fmt_days(Decimal("5")) == "5"
    assert fmt_days(Decimal("0.2500")) == "0.25"
    assert fmt_days(Decimal("-1.4600")) == "-1.46"
    assert fmt_days(Decimal("1.239")) == "1.24"
    assert fmt_days(Decimal("-0.001")) == "0"
    assert fmt_days(Decimal("-0.004")) == "0"
    assert fmt_days(Decimal("-0.125")) == "-0.13"
    assert fmt_days(Decimal("1.005")) == "1.01"
    assert fmt_days(Decimal("1.005"), places=3) == "1.005"
    assert fmt_days(Decimal("1.2345"), places=1) == "1.2"


def test_blank_trip_name_is_a_validation_error_not_a_server_error(client):
    created = client.post(
        "/api/trips",
        json={"title": "Named", "start_date": "2026-11-02", "end_date": "2026-11-03"},
    )
    assert created.status_code == 201, created.text
    trip_id = created.json()["id"]
    blank = client.patch(f"/api/trips/{trip_id}", json={"title": ""})
    missing = client.patch(f"/api/trips/{trip_id}", json={"title": None})
    assert blank.status_code == 422, blank.text
    assert missing.status_code == 422, missing.text
    assert "Give the trip a name." in blank.text
    assert "Internal Server Error" not in blank.text


def test_trip_patch_uses_create_limits_for_optional_fields(client):
    created = client.post(
        "/api/trips",
        json={"title": "Short trip", "start_date": "2026-11-02", "end_date": "2026-11-03"},
    )
    assert created.status_code == 201, created.text
    trip_id = created.json()["id"]

    invalid_patches = [
        {"origin_label": "x" * 201},
        {"notes": "x" * 8001},
        {"pto_days": "-1"},
        {"pto_days": "367"},
    ]
    for patch in invalid_patches:
        response = client.patch(f"/api/trips/{trip_id}", json=patch)
        assert response.status_code == 422, (patch.keys(), response.text)

    cleared = client.patch(f"/api/trips/{trip_id}", json={"origin_label": "   "})
    assert cleared.status_code == 200, cleared.text
    assert cleared.json()["origin_label"] is None


def test_fmt_days_reads_the_decimals_setting(monkeypatch):
    monkeypatch.setattr("apps.travel.backend.services.money.pto_day_decimals", lambda: 3)
    assert fmt_days(Decimal("1.2345")) == "1.235"
    assert store_days(Decimal("1.6667")) == "1.6667"


def test_pto_values_keep_full_precision_and_display_rounds(client):
    saved = client.put(
        "/api/pto/policy",
        json={
            "accrual_amount": "1.6667",
            "accrual_unit": "day",
            "accrual_cadence": "monthly",
            "hours_per_day": "7.333",
            "balance_days": "10.125",
            "balance_as_of": "2026-01-01",
            "annual_cap_days": "20.005",
        },
    )
    assert saved.status_code == 200, saved.text
    policy = saved.json()["policy"]
    assert policy["accrual_amount"] == "1.6667"
    assert policy["hours_per_day"] == "7.3330"
    assert policy["balance_saved"] == "10.1250"
    assert policy["annual_cap_days"] == "20.0050"
    entry = client.post(
        "/api/pto/entries",
        json={
            "label": "Half morning",
            "start_date": "2026-11-02",
            "end_date": "2026-11-02",
            "days": "0.125",
        },
    )
    assert entry.status_code == 201, entry.text
    assert entry.json()["entries"][0]["days"] == "0.1250"
    created = client.post(
        "/api/trips",
        json={
            "title": "Precision",
            "start_date": "2026-11-02",
            "end_date": "2026-11-03",
            "pto_days": "1.6667",
        },
    )
    assert created.status_code == 201, created.text
    assert created.json()["pto_days"] == "1.6667"
    board = client.get("/api/pto")
    assert board.status_code == 200, board.text
    synced = [row for row in board.json()["entries"] if row["trip_id"] == created.json()["id"]]
    assert [row["days"] for row in synced] == ["1.6667"]


def test_blank_titles_match_on_create_and_patch(client):
    created = client.post(
        "/api/trips",
        json={"title": "Named", "start_date": "2026-11-02", "end_date": "2026-11-03"},
    )
    assert created.status_code == 201, created.text
    trip_id = created.json()["id"]
    for title in [None, "", "   ", "\u200b", "\u200b\u200c", "\ufeff"]:
        made = client.post(
            "/api/trips",
            json={"title": title, "start_date": "2026-11-02", "end_date": "2026-11-03"},
        )
        patched = client.patch(f"/api/trips/{trip_id}", json={"title": title})
        assert made.status_code == 422, (title, made.text)
        assert patched.status_code == 422, (title, patched.text)
        assert made.json()["detail"] == patched.json()["detail"]
        assert made.json()["detail"] == "title: Give the trip a name."


def test_pto_preview_rejects_unbounded_days_as_422(client):
    response = client.get(
        "/api/pto/preview",
        params={"start": date(2026, 11, 2), "end": date(2026, 11, 3), "days": "1e9999"},
    )
    assert response.status_code == 422
