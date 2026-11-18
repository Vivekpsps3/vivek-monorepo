"""Capture identity, pending metadata, and coverage. Synthetic sources only."""

import json

from apps.media.backend.services import providers


def _book(source_id: str, title: str) -> dict:
    return {
        "source": "openlibrary",
        "source_id": source_id,
        "kind": "book",
        "title": title,
    }


def test_coverage_is_configuration_and_does_not_call_a_provider(client, monkeypatch):
    def boom(*_args, **_kwargs):
        raise AssertionError("provider called")

    monkeypatch.setattr(providers, "lookup_detail", boom)
    monkeypatch.setattr(providers, "search", boom)
    games = client.get("/api/capture/coverage", params={"kind": "game"})
    assert games.status_code == 200, games.text
    body = games.json()
    assert body["kind"] == "game"
    states = {row["id"]: row for row in body["sources"]}
    assert states["rawg"]["state"] == "unconfigured"
    assert "hosted game account" in states["rawg"]["reason"]
    assert states["steam"]["state"] == "configured"
    assert states["steam"]["coverage"] == "keyless"
    assert "tmdb" not in states
    dumped = json.dumps(body)
    assert "api_key" not in dumped.lower()
    assert "token" not in dumped.lower()

    books = client.get("/api/capture/coverage", params={"kind": "book"}).json()
    assert [row["id"] for row in books["sources"]] == ["openlibrary"]
    assert books["sources"][0]["state"] == "configured"
    series = client.get("/api/capture/coverage", params={"kind": "tv"}).json()
    series_states = {row["id"]: row["state"] for row in series["sources"]}
    assert series_states["tmdb"] == "unconfigured"
    assert series_states["tvmaze"] == "configured"
    rejected = client.get("/api/capture/coverage", params={"kind": "podcast"})
    assert rejected.status_code == 422


def test_same_provider_id_is_one_membership_and_the_title_is_not(client, monkeypatch):
    def lookup(source, kind, source_id):
        if source_id == "OL-SLOW":
            return None
        return {
            "source": source,
            "source_id": source_id,
            "kind": kind,
            "title": "Canonical Harbor",
            "creator": "Synthetic",
            "year": 2001,
            "overview": "A synthetic overview.",
            "artwork_url": None,
            "genres": [],
            "external_ratings": [],
            "extra": {},
            "releases": [],
            "episodes": [],
            "provenance": {
                "provider": source,
                "coverage": "official",
                "fetched_at": "2026-01-01T00:00:00+00:00",
            },
        }

    monkeypatch.setattr(providers, "lookup_detail", lookup)
    first = client.post("/api/library/from-provider", json=_book("OL-HARBOR-1", "Paper Harbor"))
    assert first.status_code == 200, first.text
    saved = first.json()
    assert saved["already_saved"] is False
    assert saved["kind"] == "book"
    assert saved["catalog"]["title"] == "Canonical Harbor"
    again = client.post(
        "/api/library/from-provider",
        json=_book("OL-HARBOR-1", "Paper Harbor reprint"),
    ).json()
    assert again["already_saved"] is True
    assert again["id"] == saved["id"]
    other = client.post(
        "/api/library/from-provider",
        json=_book("OL-HARBOR-2", "Paper Harbor"),
    ).json()
    assert other["already_saved"] is False
    assert other["id"] != saved["id"]
    manual = client.post(
        "/api/library",
        json={"kind": "book", "title": "Paper Harbor", "status": "want"},
    ).json()
    assert manual["id"] not in {saved["id"], other["id"]}
    assert manual["catalog"]["source"] == "manual"
    listed = client.get("/api/library", params={"kind": "book", "limit": 24}).json()
    assert listed["total"] == 3
    assert {item["id"] for item in listed["items"]} == {saved["id"], other["id"], manual["id"]}
    movies = client.get("/api/library", params={"kind": "movie"}).json()
    assert movies["total"] == 0


def test_pending_metadata_stays_editable_and_get_does_not_repair(client, monkeypatch):
    calls = {"n": 0}

    def lookup(*_args, **_kwargs):
        calls["n"] += 1
        # The adapter turns a timeout into no detail. The saved title stays pending.
        return None

    monkeypatch.setattr(providers, "lookup_detail", lookup)
    saved = client.post(
        "/api/library/from-provider",
        json=_book("OL-SLOW", "Waiting Harbor"),
    )
    assert saved.status_code == 200, saved.text
    body = saved.json()
    assert body["catalog"]["extra"]["metadata_pending"] is True
    assert body["catalog"]["title"] == "Waiting Harbor"
    assert calls["n"] == 1
    edited = client.patch(f"/api/entries/{body['id']}", json={"review": "Still editable."})
    assert edited.status_code == 200, edited.text
    assert edited.json()["review"] == "Still editable."
    assert edited.json()["catalog"]["extra"]["metadata_pending"] is True
    before = calls["n"]
    assert client.get(f"/api/entries/{body['id']}").status_code == 200
    assert client.get("/api/library", params={"kind": "book"}).status_code == 200
    assert client.get("/api/summary").status_code == 200
    assert calls["n"] == before

    for _attempt in range(3):
        refreshed = client.post(f"/api/entries/{body['id']}/refresh")
        assert refreshed.status_code == 502, refreshed.text
        assert "unchanged" in refreshed.json()["message"]
    assert calls["n"] == before + 3
    blocked = client.post(f"/api/entries/{body['id']}/refresh")
    assert blocked.status_code == 409, blocked.text
    assert blocked.json()["code"] == "retry_limit"
    assert calls["n"] == before + 3
    kept = client.get(f"/api/entries/{body['id']}").json()
    assert kept["review"] == "Still editable."
    assert kept["catalog"]["extra"]["metadata_pending"] is True
    assert kept["catalog"]["extra"]["metadata_retries"] == 3
    assert calls["n"] == before + 3


def test_manual_save_works_while_every_provider_lookup_fails(client, monkeypatch):
    def boom(*_args, **_kwargs):
        raise RuntimeError("providers down")

    monkeypatch.setattr(providers, "lookup_detail", boom)
    monkeypatch.setattr(providers, "search", boom)
    saved = client.post(
        "/api/library",
        json={"kind": "game", "title": "Lantern Kart", "creator": "Synthetic", "status": "want"},
    )
    assert saved.status_code == 200, saved.text
    assert saved.json()["kind"] == "game"
    assert saved.json()["catalog"]["source"] == "manual"
    listed = client.get("/api/library", params={"kind": "game"}).json()
    assert [item["title"] for item in listed["items"]] == ["Lantern Kart"]
