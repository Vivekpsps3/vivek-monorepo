"""Invalid numeric and patch inputs fail as validation errors."""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))


def test_pto_values_keep_full_precision_and_display_rounds(client):
    saved = client.put(
        "/api/pto/policy",
        json={
            "accrual_amount": "1.6667",
            "accrual_unit": "day",
            "accrual_cadence": "monthly",
            "hours_per_day": "7.25",
            "balance_days": "10.125",
            "balance_as_of": "2026-01-01",
            "annual_cap_days": "20.005",
        },
    )
    assert saved.status_code == 200, saved.text
    policy = saved.json()["policy"]
    assert policy["accrual_amount"] == "1.6667"
    assert policy["hours_per_day"] == "7.2500"
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
