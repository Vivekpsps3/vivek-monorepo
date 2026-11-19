"""An outbound draft keeps an unknown return and does not charge PTO."""

from concurrent.futures import ThreadPoolExecutor
from threading import Barrier

from apps.server.auth import Principal, require_principal


def _leg(**extra):
    body = {
        "role": "outbound",
        "mode": "flight",
        "number": "UA837",
        "depart_place": "SFO",
        "arrive_place": "NRT",
        "depart_at": "2026-06-01T09:00:00",
        "arrive_at": "2026-06-02T14:30:00",
    }
    body.update(extra)
    return body


def _draft(**extra):
    body = {
        "title": "Outbound only",
        "start_date": "2026-06-01",
        "end_date": None,
        "legs": [_leg()],
        "proposals": [
            {"field": "end_date", "value": "2026-06-09", "source": "inferred"},
            {"field": "destination_city", "value": "Tokyo", "source": "inferred"},
            {"field": "lodging_name", "value": "Harbor Hotel", "source": "inferred"},
            {"field": "counts_as_pto", "value": "true", "source": "inferred"},
        ],
        "client_request_id": "draft-outbound-1",
    }
    body.update(extra)
    return body


def _pto_labels(client):
    payload = client.get("/api/pto")
    assert payload.status_code == 200, payload.text
    return [entry["label"] for entry in payload.json()["entries"]]


def _home_titles(client):
    home = client.get("/api/home")
    assert home.status_code == 200, home.text
    payload = home.json()
    return [
        trip["title"] for group in ("in_progress", "upcoming", "past") for trip in payload[group]
    ]


def test_outbound_draft_keeps_unknown_return_and_skips_pto(client):
    saved = client.post("/api/trip-drafts", json=_draft())
    assert saved.status_code == 201, saved.text
    body = saved.json()
    assert body["lifecycle"] == "draft"
    assert body["start_date"] == "2026-06-01"
    assert body["end_date"] is None
    assert body["destination_label"] is None
    assert body["revision"] == 1
    assert body["legs"][0]["arrive_place"] == "NRT"
    assert body["legs"][0]["arrive_at"] == "2026-06-02T14:30"
    assert {item["field"]: item["value"] for item in body["proposals"]}["end_date"] == "2026-06-09"
    assert all(item["source"] == "inferred" for item in body["proposals"])
    assert _pto_labels(client) == []
    assert _home_titles(client) == []

    again = client.post(
        "/api/trip-drafts",
        json=_draft(title="Changed mind", end_date="2026-06-03", destination_label="Osaka"),
    )
    assert again.status_code == 201, again.text
    assert again.json()["id"] == body["id"]
    assert again.json()["title"] == "Outbound only"
    assert again.json()["end_date"] is None
    assert again.json()["destination_label"] is None
    assert _pto_labels(client) == []


def test_a_typed_return_is_stored_and_still_does_not_charge_pto(client):
    saved = client.post(
        "/api/trip-drafts",
        json=_draft(end_date="2026-06-04", client_request_id="draft-return-known", proposals=[]),
    )
    assert saved.status_code == 201, saved.text
    assert saved.json()["end_date"] == "2026-06-04"
    assert _pto_labels(client) == []
    complete = client.post(
        "/api/trips",
        json={"title": "Complete", "start_date": "2026-06-03", "end_date": "2026-06-04"},
    )
    assert complete.status_code == 201, complete.text
    entries = client.get("/api/pto").json()["entries"]
    assert [entry["label"] for entry in entries] == ["Complete"]
    assert [entry["trip_id"] for entry in entries] == [complete.json()["id"]]
    kept = client.get(f"/api/trip-drafts/{saved.json()['id']}")
    assert kept.status_code == 200, kept.text
    assert kept.json()["end_date"] == "2026-06-04"
    assert _home_titles(client) == ["Complete"]


def test_inferred_and_trip_facts_are_rejected(client):
    before = client.get("/api/trip-drafts").json()["drafts"]
    for extra in (
        {"counts_as_pto": True},
        {"stays": [{"city": "Tokyo", "arrive_on": "2026-06-01", "leave_on": "2026-06-02"}]},
        {"pto_dates": [{"on_date": "2026-06-01", "amount": "1"}]},
    ):
        rejected = client.post("/api/trip-drafts", json=_draft(**extra))
        assert rejected.status_code == 422, extra
    missing = client.post(
        "/api/trip-drafts",
        json=_draft(legs=[_leg(role="inbound")], client_request_id="draft-no-outbound"),
    )
    assert missing.status_code == 422, missing.text
    confirmed = client.post(
        "/api/trip-drafts",
        json=_draft(
            client_request_id="draft-bad-source",
            proposals=[{"field": "end_date", "value": "2026-06-09", "source": "confirmed"}],
        ),
    )
    assert confirmed.status_code == 422, confirmed.text
    assert client.get("/api/trip-drafts").json()["drafts"] == before


def test_a_stale_or_other_owner_write_does_not_change_the_draft(client):
    saved = client.post("/api/trip-drafts", json=_draft())
    assert saved.status_code == 201, saved.text
    draft_id = saved.json()["id"]
    renamed = client.patch(
        f"/api/trip-drafts/{draft_id}",
        json=_draft(title="Renamed", client_request_id=None, revision=1),
    )
    assert renamed.status_code == 200, renamed.text
    assert renamed.json()["title"] == "Renamed"
    assert renamed.json()["revision"] == 2
    assert renamed.json()["end_date"] is None
    stale = client.patch(
        f"/api/trip-drafts/{draft_id}",
        json=_draft(title="Late write", end_date="2026-06-08", client_request_id=None, revision=1),
    )
    assert stale.status_code == 409, stale.text
    current = client.get(f"/api/trip-drafts/{draft_id}")
    assert current.json()["title"] == "Renamed"
    assert current.json()["end_date"] is None
    assert current.json()["revision"] == 2

    client.app.dependency_overrides[require_principal] = lambda: Principal(2, "other", "Other")
    assert client.get(f"/api/trip-drafts/{draft_id}").status_code == 404
    assert client.get("/api/trip-drafts").json()["drafts"] == []
    stolen = client.patch(
        f"/api/trip-drafts/{draft_id}",
        json=_draft(title="Other owner", client_request_id=None, revision=2),
    )
    assert stolen.status_code == 404, stolen.text
    client.app.dependency_overrides[require_principal] = lambda: Principal(1, "tester", "Tester")
    assert client.get(f"/api/trip-drafts/{draft_id}").json()["title"] == "Renamed"
    assert _pto_labels(client) == []


def test_overlapping_creates_insert_one_draft(client):
    barrier = Barrier(2)

    def save():
        barrier.wait(timeout=5)
        response = client.post("/api/trip-drafts", json=_draft())
        assert response.status_code == 201, response.text
        return response.json()["id"]

    with ThreadPoolExecutor(max_workers=2) as executor:
        ids = list(executor.map(lambda _: save(), range(2)))
    assert ids[0] == ids[1]
    assert len(client.get("/api/trip-drafts").json()["drafts"]) == 1
