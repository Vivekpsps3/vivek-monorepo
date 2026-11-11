"""Remove Sick unconfigures one owner's policy and keeps the ledger."""

from datetime import date

import pytest
from sqlalchemy.orm import sessionmaker

from apps.server.auth import Principal, require_principal
from apps.travel.backend.models import LeavePolicy, PtoEntry, Setting, TripPtoDay
from apps.travel.backend.services.leave_buckets import sick_prompt_setting_key

TODAY = date(2026, 11, 11)


def pin(monkeypatch, day: date = TODAY) -> None:
    class Clock(date):
        @classmethod
        def today(cls):
            return day

    monkeypatch.setattr("apps.travel.backend.routers.leave.date", Clock)


def _policy(**overrides):
    body = {
        "start_balance_hours": "80",
        "balance_as_of": "2026-01-01",
        "accrual_hours": "0",
        "accrual_cadence": "yearly",
        "cap_hours": None,
        "year_start": "01-01",
        "carry_forward": True,
    }
    body.update(overrides)
    return body


def _db(client):
    return sessionmaker(bind=client.app.state.database.engine)()


def _ledger(client, user_id: int = 1):
    db = _db(client)
    try:
        policies = [
            (
                row.bucket,
                bool(row.configured),
                row.start_balance_hours,
                row.balance_as_of.isoformat(),
                row.accrual_hours,
                row.accrual_cadence,
                row.cap_hours,
                row.year_start,
                bool(row.carry_forward),
            )
            for row in db.query(LeavePolicy)
            .filter(LeavePolicy.user_id == user_id)
            .order_by(LeavePolicy.bucket, LeavePolicy.id)
        ]
        entries = [
            (
                row.id,
                row.bucket,
                row.label,
                row.start_date.isoformat(),
                row.end_date.isoformat(),
                row.days,
                row.trip_id,
            )
            for row in db.query(PtoEntry).filter(PtoEntry.user_id == user_id).order_by(PtoEntry.id)
        ]
        allocations = [
            (row.trip_id, row.on_date.isoformat(), row.amount, row.provenance)
            for row in db.query(TripPtoDay).order_by(
                TripPtoDay.trip_id, TripPtoDay.on_date, TripPtoDay.id
            )
        ]
        prompt = db.get(Setting, sick_prompt_setting_key(user_id))
        revision = db.get(Setting, f"user:{user_id}:sick_policy_revision")
        return {
            "policies": policies,
            "entries": entries,
            "allocations": allocations,
            "prompt": None if prompt is None else prompt.value,
            "revision": None if revision is None else revision.value,
        }
    finally:
        db.close()


def _seed(client):
    assert (
        client.put("/api/pto/policies/pto", json=_policy(start_balance_hours="100")).status_code
        == 200
    )
    sick = client.put("/api/pto/policies/sick", json=_policy())
    assert sick.status_code == 200, sick.text
    past = client.post(
        "/api/pto/entries",
        json={
            "label": "Clinic",
            "start_date": "2026-02-02",
            "end_date": "2026-02-02",
            "days": "1",
            "bucket": "sick",
        },
    )
    assert past.status_code == 201, past.text
    future = client.post(
        "/api/pto/entries",
        json={
            "label": "Flu",
            "start_date": "2026-12-04",
            "end_date": "2026-12-05",
            "days": "2",
            "bucket": "sick",
        },
    )
    assert future.status_code == 201, future.text
    manual = client.post(
        "/api/pto/entries",
        json={
            "label": "Family",
            "start_date": "2026-12-01",
            "end_date": "2026-12-01",
            "days": "1",
            "bucket": "pto",
        },
    )
    assert manual.status_code == 201, manual.text
    trip = client.post(
        "/api/trips",
        json={
            "title": "Kyoto",
            "start_date": "2026-12-10",
            "end_date": "2026-12-12",
            "counts_as_pto": True,
        },
    )
    assert trip.status_code == 201, trip.text
    dismissed = client.put("/api/settings/pto", json={"sick_prompt_dismissed": True})
    assert dismissed.status_code == 200, dismissed.text
    return sick.json()["buckets"]["sick"]["revision"]


def test_remove_sick_preserves_rows_and_a_second_request_conflicts(client, monkeypatch):
    pin(monkeypatch)
    revision = _seed(client)
    before = _ledger(client)
    assert before["prompt"] == "1"
    assert before["revision"] == "1"
    assert client.delete("/api/pto/policies/sick").status_code in (404, 405)
    assert _ledger(client) == before

    removed = client.post("/api/pto/policies/sick/removal", json={"revision": revision})
    assert removed.status_code == 200, removed.text
    body = removed.json()
    assert body["buckets"]["sick"] is None
    assert body["buckets"]["pto"]["start_balance_hours"] == "100"
    assert body["pto_sick_prompt_dismissed"] is False
    labels = {(row["label"], row["bucket"], row["days"], row["trip_id"]) for row in body["entries"]}
    assert ("Clinic", "sick", "1.0000", None) in labels
    assert ("Flu", "sick", "2.0000", None) in labels
    assert ("Family", "pto", "1.0000", None) in labels
    assert any(
        row["label"] == "Kyoto" and row["bucket"] == "pto" and row["trip_id"]
        for row in body["entries"]
    )

    after = _ledger(client)
    assert after["entries"] == before["entries"]
    assert after["allocations"] == before["allocations"]
    assert after["allocations"]
    assert after["prompt"] is None
    assert after["revision"] == "2"
    sick = next(row for row in after["policies"] if row[0] == "sick")
    pto = next(row for row in after["policies"] if row[0] == "pto")
    assert sick[1] is False
    assert sick[2:] == ("0", TODAY.isoformat(), "0", "yearly", None, "01-01", True)
    assert pto == next(row for row in before["policies"] if row[0] == "pto")

    again = client.post("/api/pto/policies/sick/removal", json={"revision": revision})
    assert again.status_code == 409, again.text
    assert again.json()["code"] == "sick_policy_conflict"
    assert _ledger(client) == after

    missing = client.post("/api/pto/policies/sick/removal", json={})
    assert missing.status_code == 422
    assert _ledger(client) == after
    # PTO has no removal command. A nearby route may answer 405, and it must not write.
    refused = client.post("/api/pto/policies/pto/removal", json={"revision": revision})
    assert refused.status_code in (404, 405)
    assert _ledger(client) == after


def test_stale_removal_cannot_erase_a_reconfigured_policy(client, monkeypatch):
    pin(monkeypatch)
    revision = _seed(client)
    before = _ledger(client)
    saved = client.put("/api/pto/policies/sick", json=_policy(start_balance_hours="64"))
    assert saved.status_code == 200, saved.text
    assert saved.json()["buckets"]["sick"]["revision"] == revision + 1
    stale = client.post("/api/pto/policies/sick/removal", json={"revision": revision})
    assert stale.status_code == 409, stale.text
    current = client.get("/api/pto/policies/sick").json()
    assert current["configured"] is True
    assert current["start_balance_hours"] == "64"
    assert current["revision"] == revision + 1
    kept = _ledger(client)
    assert kept["entries"] == before["entries"]
    assert kept["allocations"] == before["allocations"]
    assert next(row for row in kept["policies"] if row[0] == "pto") == next(
        row for row in before["policies"] if row[0] == "pto"
    )


def test_other_owner_cannot_remove_sick(client, monkeypatch):
    pin(monkeypatch)
    revision = _seed(client)
    before = _ledger(client)
    client.app.dependency_overrides[require_principal] = lambda: Principal(2, "other", "Other")
    foreign = client.post("/api/pto/policies/sick/removal", json={"revision": revision})
    assert foreign.status_code == 404, foreign.text
    other = client.put("/api/pto/policies/sick", json=_policy(start_balance_hours="8"))
    assert other.status_code == 200, other.text
    conflict = client.post("/api/pto/policies/sick/removal", json={"revision": 99})
    assert conflict.status_code == 409, conflict.text
    assert client.get("/api/pto/policies/sick").json()["start_balance_hours"] == "8"
    client.app.dependency_overrides[require_principal] = lambda: Principal(1, "tester", "Tester")
    assert _ledger(client) == before
    assert client.get("/api/pto/policies/sick").json()["start_balance_hours"] == "80"


def test_reconfigure_and_dated_correction_keep_history(client, monkeypatch):
    pin(monkeypatch)
    revision = _seed(client)
    before = _ledger(client)
    removed = client.post("/api/pto/policies/sick/removal", json={"revision": revision})
    assert removed.status_code == 200, removed.text
    restored = client.put("/api/pto/policies/sick", json=_policy())
    assert restored.status_code == 200, restored.text
    assert restored.json()["buckets"]["sick"]["configured"] is True
    kept = _ledger(client)
    assert kept["entries"] == before["entries"]
    assert kept["allocations"] == before["allocations"]

    same_day = client.post("/api/pto/policies/sick/impact", json=_policy(start_balance_hours="40"))
    assert same_day.status_code == 200, same_day.text
    assert same_day.json()["entries_rewritten"] is False
    assert same_day.json()["balance_today_hours"] == "32"
    assert _ledger(client)["entries"] == before["entries"]
    assert _ledger(client)["policies"] == kept["policies"]

    moved = client.post(
        "/api/pto/policies/sick/impact",
        json=_policy(start_balance_hours="40", balance_as_of="2026-11-01"),
    )
    assert moved.status_code == 200, moved.text
    assert moved.json()["balance_today_hours"] == "40"
    assert moved.json()["entries_rewritten"] is False
    assert _ledger(client)["entries"] == before["entries"]

    corrected = client.put(
        "/api/pto/policies/sick",
        json=_policy(start_balance_hours="40", balance_as_of="2026-11-01"),
    )
    assert corrected.status_code == 200, corrected.text
    assert corrected.json()["buckets"]["sick"]["start_balance_hours"] == "40"
    assert corrected.json()["buckets"]["sick"]["balance_as_of"] == "2026-11-01"
    final = _ledger(client)
    assert final["entries"] == before["entries"]
    assert final["allocations"] == before["allocations"]
    clinic = next(row for row in final["entries"] if row[2] == "Clinic")
    assert clinic[1:] == ("sick", "Clinic", "2026-02-02", "2026-02-02", "1.0000", None)


@pytest.mark.parametrize("body", [None, {"revision": True}, {"revision": "1"}])
def test_removal_rejects_a_bad_revision_without_writing(client, monkeypatch, body):
    pin(monkeypatch)
    _seed(client)
    before = _ledger(client)
    rejected = client.post("/api/pto/policies/sick/removal", json=body)
    assert rejected.status_code == 422
    assert _ledger(client) == before
