"""Invalid numeric and patch inputs fail as validation errors."""

import json
import sys
from datetime import date
from decimal import Decimal
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from apps.travel.backend.services.money import fmt_days, parse_days, parse_money


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


def test_pto_preview_rejects_unbounded_days_as_422(client):
    response = client.get(
        "/api/pto/preview",
        params={"start": date(2026, 11, 2), "end": date(2026, 11, 3), "days": "1e9999"},
    )
    assert response.status_code == 422
