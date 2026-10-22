"""Batch 3 and 4 rules that the browser cannot see: year, search fan-out, library."""

import time

from fastapi.testclient import TestClient


def test_album_year_must_be_between_1000_and_3000(client: TestClient):
    artist = client.post("/api/library", json={"kind": "artist", "title": "Band", "status": "want"})
    assert artist.status_code == 200
    entry_id = artist.json()["id"]
    rejected = client.post(
        f"/api/entries/{entry_id}/albums",
        json={"title": "Demo", "year": "99"},
    )
    assert rejected.status_code == 422
    assert rejected.json()["detail"] == "Year must be a number from 1000 to 3000."
    kept = client.post(
        f"/api/entries/{entry_id}/albums",
        json={"title": "Demo", "year": 1999},
    )
    assert kept.status_code == 200


def test_library_continue_rides_the_one_library_response(client: TestClient):
    created = client.post("/api/library", json={"kind": "book", "title": "Dune", "status": "want"})
    assert created.status_code == 200
    payload = client.get("/api/library").json()
    assert "items" in payload
    assert "continue" in payload
    assert payload["items"][0]["title"] == "Dune"
    assert "progress_value" in payload["items"][0]


def test_search_marks_the_saved_entry_id(client, monkeypatch):
    def once(*_args, **_kwargs):
        return [
            {
                "source": "openlibrary",
                "source_id": "ol-dune",
                "kind": "book",
                "title": "Dune",
                "creator": "Frank Herbert",
                "year": 1965,
                "overview": None,
                "artwork_url": None,
                "genres": [],
                "external_ratings": [],
                "extra": {},
                "releases": [],
                "episodes": [],
            }
        ]

    monkeypatch.setattr("apps.media.backend.services.providers.openlibrary_search", once)
    found = client.get("/api/search", params={"q": "dune", "kind": "book"}).json()
    assert found["results"][0]["already_saved"] is False
    saved = client.post(
        "/api/library/from-provider", json={**found["results"][0], "status": "want"}
    ).json()
    again = client.get("/api/search", params={"q": "dune", "kind": "book"}).json()
    assert again["results"][0]["already_saved"] is True
    assert again["results"][0]["saved_id"] == saved["id"]


def test_search_fans_out_and_a_slow_provider_does_not_hold_the_request(client, monkeypatch):
    monkeypatch.setenv("TMDB_API_KEY", "test")
    monkeypatch.setenv("RAWG_API_KEY", "test")

    def slow_movie(*_args, **_kwargs):
        time.sleep(0.4)
        return [
            {
                "source": "tmdb",
                "source_id": "m1",
                "kind": "movie",
                "title": "Slow Movie",
                "creator": None,
                "year": 2000,
                "overview": None,
                "artwork_url": None,
                "genres": [],
                "external_ratings": [],
                "extra": {},
                "releases": [],
                "episodes": [],
            }
        ]

    def slow_game(*_args, **_kwargs):
        time.sleep(0.4)
        return [
            {
                "source": "rawg",
                "source_id": "g1",
                "kind": "game",
                "title": "Slow Game",
                "creator": None,
                "year": 2001,
                "overview": None,
                "artwork_url": None,
                "genres": [],
                "external_ratings": [],
                "extra": {},
                "releases": [],
                "episodes": [],
            }
        ]

    monkeypatch.setattr("apps.media.backend.services.providers.tmdb_search", slow_movie)
    monkeypatch.setattr("apps.media.backend.services.providers.rawg_search", slow_game)
    monkeypatch.setattr(
        "apps.media.backend.services.providers.openlibrary_search", lambda *_a, **_k: []
    )
    monkeypatch.setattr(
        "apps.media.backend.services.providers.musicbrainz_search", lambda *_a, **_k: []
    )
    started = time.monotonic()
    found = client.get("/api/search", params={"q": "slow"})
    elapsed = time.monotonic() - started
    assert found.status_code == 200
    titles = {row["title"] for row in found.json()["results"]}
    assert titles == {"Slow Movie", "Slow Game"}
    assert elapsed < 0.75

    def blocked(*_args, **_kwargs):
        time.sleep(6)
        return []

    from apps.media.backend.services import providers

    providers._HEALTH.clear()
    providers._HEALTH_TEST = ""
    monkeypatch.setattr("apps.media.backend.services.providers.openlibrary_search", blocked)
    started = time.monotonic()
    stalled = client.get("/api/search", params={"q": "stall", "kind": "book"})
    assert stalled.status_code == 200
    assert stalled.json()["providers"]["openlibrary"] == "error"
    assert time.monotonic() - started < 5


def test_provider_status_sticks_for_a_minute():
    from apps.media.backend.services import providers

    providers._HEALTH.clear()
    providers._HEALTH_TEST = ""
    assert providers.sticky_status("openlibrary", "error") == "error"
    assert providers.sticky_status("openlibrary", "ok") == "error"
