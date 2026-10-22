"""Batch 3 and 4 rules that the browser cannot see: year, search fan-out, library."""

import threading

from fastapi.testclient import TestClient


def test_served_media_html_has_no_cloudflare_beacon(client: TestClient):
    page = client.get("/")
    assert page.status_code == 200
    lowered = page.text.lower()
    assert "cloudflareinsights" not in lowered
    assert "beacon.min.js" not in lowered


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


class _FakeClock:
    """Per-thread clock. sleep() advances that thread only, with no wall wait."""

    def __init__(self):
        self._spent: dict[int, float] = {}
        self._lock = threading.Lock()

    def now(self) -> float:
        with self._lock:
            return self._spent.get(threading.get_ident(), 0.0)

    def sleep(self, seconds: float) -> None:
        with self._lock:
            thread_id = threading.get_ident()
            self._spent[thread_id] = self._spent.get(thread_id, 0.0) + float(seconds)


def _hit(source, source_id, kind, title, year):
    return {
        "source": source,
        "source_id": source_id,
        "kind": kind,
        "title": title,
        "creator": None,
        "year": year,
        "overview": None,
        "artwork_url": None,
        "genres": [],
        "external_ratings": [],
        "extra": {},
        "releases": [],
        "episodes": [],
    }


def test_search_fans_out_and_a_slow_provider_does_not_hold_the_request(client, monkeypatch):
    monkeypatch.setenv("TMDB_API_KEY", "test")
    monkeypatch.setenv("RAWG_API_KEY", "test")
    from apps.media.backend.services import providers

    clock = _FakeClock()
    monkeypatch.setattr(providers, "_now", clock.now)

    def slow_movie(*_args, **_kwargs):
        clock.sleep(0.4)
        return [_hit("tmdb", "m1", "movie", "Slow Movie", 2000)]

    def slow_game(*_args, **_kwargs):
        clock.sleep(0.4)
        return [_hit("rawg", "g1", "game", "Slow Game", 2001)]

    monkeypatch.setattr(providers, "tmdb_search", slow_movie)
    monkeypatch.setattr(providers, "rawg_search", slow_game)
    monkeypatch.setattr(providers, "openlibrary_search", lambda *_a, **_k: [])
    monkeypatch.setattr(providers, "musicbrainz_search", lambda *_a, **_k: [])
    found = client.get("/api/search", params={"q": "slow"})
    assert found.status_code == 200
    body = found.json()
    titles = {row["title"] for row in body["results"]}
    assert titles == {"Slow Movie", "Slow Game"}
    assert body["providers"]["tmdb"] == "ok"
    assert body["providers"]["rawg"] == "ok"
    assert body["providers"]["openlibrary"] == "ok"

    def blocked(*_args, **_kwargs):
        clock.sleep(6)
        return [_hit("openlibrary", "late", "book", "Too Late", 1990)]

    providers._HEALTH.clear()
    providers._HEALTH_TEST = ""
    monkeypatch.setattr(providers, "openlibrary_search", blocked)
    stalled = client.get("/api/search", params={"q": "stall", "kind": "book"})
    assert stalled.status_code == 200
    stalled_body = stalled.json()
    assert stalled_body["providers"]["openlibrary"] == "error"
    assert stalled_body["results"] == []


def test_provider_status_sticks_for_a_minute():
    from apps.media.backend.services import providers

    providers._HEALTH.clear()
    providers._HEALTH_TEST = ""
    assert providers.sticky_status("openlibrary", "error") == "error"
    assert providers.sticky_status("openlibrary", "ok") == "error"
