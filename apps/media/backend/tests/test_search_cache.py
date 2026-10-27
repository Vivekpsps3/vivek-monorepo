from concurrent.futures import ThreadPoolExecutor
from threading import Event

import httpx

from apps.media.backend.models import CatalogItem, Episode, ProviderCache, UserEntry
from apps.media.backend.services import providers
from apps.media.backend.services.search_cache import SearchCache
from apps.server.auth import Principal, require_principal


def test_cache_bounds_entries_bytes_and_expiry():
    clock = [0.0]
    cache = SearchCache(max_entries=2, max_bytes=100)
    cache.clock = lambda: clock[0]
    calls = []

    def load(key):
        calls.append(key)
        return [{"title": key}]

    cache.run("a", lambda: load("a"))
    cache.run("b", lambda: load("b"))
    cache.run("a", lambda: load("a"))
    cache.run("c", lambda: load("c"))
    cache.run("b", lambda: load("b"))
    assert calls == ["a", "b", "c", "b"]
    clock[0] = 301
    cache.run("b", lambda: load("b"))
    assert calls[-2:] == ["b", "b"]

    def oversized():
        return [{"title": "x" * 200}]

    assert cache.run("large", oversized).cached is False
    assert cache.run("large", oversized).cached is False


def test_empty_and_failed_searches_have_different_short_ttls():
    clock = [0.0]
    cache = SearchCache()
    cache.clock = lambda: clock[0]

    def fail():
        raise httpx.ReadTimeout("offline")

    assert cache.run("empty", lambda: []).state == "ok"
    assert cache.run("failed", fail).state == "timeout"
    clock[0] = 6
    assert cache.run("empty", lambda: [{"title": "unexpected"}]).rows == []
    assert cache.run("failed", lambda: [{"title": "recovered"}]).rows == [{"title": "recovered"}]
    clock[0] = 31
    assert cache.run("empty", lambda: [{"title": "new"}]).rows == [{"title": "new"}]


def test_shared_loads_return_independent_rows_and_do_not_survive_clear():
    cache = SearchCache()
    entered, release = Event(), Event()
    calls = []

    def load():
        calls.append(1)
        entered.set()
        assert release.wait(2)
        return [{"title": "Public"}]

    with ThreadPoolExecutor(max_workers=2) as pool:
        first = pool.submit(cache.run, "same", load)
        assert entered.wait(2)
        second = pool.submit(cache.run, "same", load)
        release.set()
        a, b = first.result(), second.result()
    assert calls == [1]
    a.rows[0]["already_saved"] = True
    assert "already_saved" not in b.rows[0]
    cache.clear()
    assert (
        cache.run("same", lambda: [{"title": "After restart"}]).rows[0]["title"] == "After restart"
    )


def test_retry_rechecks_only_failures():
    cache = SearchCache()

    def fail():
        raise RuntimeError("unavailable")

    cache.run("failed", fail)
    cache.run("good", lambda: [{"title": "Saved response"}])
    cache.retry_failure("failed")
    cache.retry_failure("good")
    assert cache.run("failed", lambda: [{"title": "Recovered"}]).rows[0]["title"] == "Recovered"
    assert cache.run("good", lambda: []).rows[0]["title"] == "Saved response"


def test_search_writes_no_catalog_membership_episode_or_query_cache_rows(client, monkeypatch):
    monkeypatch.setattr(
        providers,
        "musicbrainz_search",
        lambda *_args: [
            {
                "source": "musicbrainz",
                "source_id": "f4fdbb4c-e4b7-47a0-b83b-d91bbfcfa387",
                "kind": "artist",
                "title": "Ariana Grande",
                "artwork_url": None,
            }
        ],
    )

    def forbidden(*_args, **_kwargs):
        raise AssertionError("Search attempted portrait enrichment")

    monkeypatch.setattr(providers, "cached_artist_portraits", forbidden)
    with client.app.state.database.sessionmaker() as db:
        before = [
            db.query(model).count() for model in (CatalogItem, UserEntry, Episode, ProviderCache)
        ]
    response = client.get("/api/search", params={"q": "ariana", "kind": "artist"})
    assert response.status_code == 200
    assert response.json()["results"][0]["artwork_url"] is None
    with client.app.state.database.sessionmaker() as db:
        assert [
            db.query(model).count() for model in (CatalogItem, UserEntry, Episode, ProviderCache)
        ] == before


def test_saved_flags_are_attached_per_user_after_public_cache_lookup(client, monkeypatch):
    calls = []

    def search(*_args):
        calls.append(1)
        return [
            {"source": "openlibrary", "source_id": "OL42W", "kind": "book", "title": "Public title"}
        ]

    monkeypatch.setattr(providers, "openlibrary_search", search)
    first = client.get("/api/search", params={"q": "public", "kind": "book"}).json()["results"][0]
    saved = client.post("/api/library/from-provider", json=first)
    assert saved.status_code == 200, saved.text
    assert (
        client.get("/api/search", params={"q": "public", "kind": "book"}).json()["results"][0][
            "already_saved"
        ]
        is True
    )
    client.app.dependency_overrides[require_principal] = lambda: Principal(2, "other", "Other")
    other = client.get("/api/search", params={"q": "public", "kind": "book"}).json()["results"][0]
    assert other["already_saved"] is False
    assert "saved_id" not in other
    assert calls == [1]


def test_saved_details_and_reviews_survive_transient_cache_loss_and_provider_outage(
    client, monkeypatch
):
    saved = client.post(
        "/api/library/from-provider",
        json={
            "source": "musicbrainz",
            "source_id": "f4fdbb4c-e4b7-47a0-b83b-d91bbfcfa387",
            "kind": "artist",
            "title": "Saved artist",
            "review": "Keep this review",
        },
    ).json()
    providers.SEARCH_CACHE.clear()

    def forbidden(*_args, **_kwargs):
        raise AssertionError("A saved read made an outbound call")

    monkeypatch.setattr(httpx, "Client", forbidden)
    detail = client.get(f"/api/entries/{saved['id']}")
    assert detail.status_code == 200
    assert detail.json()["review"] == "Keep this review"
    assert client.get("/api/library").json()["items"][0]["title"] == "Saved artist"


def test_partial_music_source_keeps_successful_rows_and_retries_only_failures(client, monkeypatch):
    from apps.media.backend.services.search_cache import PartialSearchError

    monkeypatch.setattr(providers, "tmdb_public_search", lambda *_args: [])
    monkeypatch.setattr(providers, "tvmaze_search", lambda *_args: [])
    monkeypatch.setattr(providers, "openlibrary_search", lambda *_args: [])
    monkeypatch.setattr(providers, "steam_search", lambda *_args: [])
    calls = []

    def music(*_args):
        calls.append(1)
        rows = [
            {
                "kind": "artist",
                "source": "musicbrainz",
                "source_id": "saved-artist",
                "title": "Gentlemen",
            }
        ]
        if len(calls) == 1:
            raise PartialSearchError(rows, ("album", "track"))
        return rows

    monkeypatch.setattr(providers, "musicbrainz_search", music)
    first = client.get("/api/search", params={"q": "Gentlemen"}).json()
    source = next(source for source in first["sources"] if source["id"] == "musicbrainz")
    assert source["state"] == "partial"
    assert source["failed_kinds"] == ["album", "track"]
    assert source["retryable"] is True
    assert first["partial"] is True
    assert [row["title"] for row in first["results"]] == ["Gentlemen"]
    cached = client.get("/api/search", params={"q": "Gentlemen"}).json()
    assert next(source for source in cached["sources"] if source["id"] == "musicbrainz")["cached"]
    recovered = client.get("/api/search", params={"q": "Gentlemen", "retry": True}).json()
    assert recovered["partial"] is False
    assert len(calls) == 2
