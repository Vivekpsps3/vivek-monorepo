"""Invalid numeric and patch inputs fail as validation errors."""

import json
import sys
from datetime import date
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from services.money import parse_days, parse_money


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
