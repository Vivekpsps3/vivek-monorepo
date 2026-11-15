"""Batch 3 and 4 rules that the browser cannot see: year, search fan-out, library."""

import threading
from concurrent.futures import ThreadPoolExecutor
from concurrent.futures import TimeoutError as FuturesTimeout


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
    monkeypatch.setattr(providers, "tvmaze_search", lambda *_a, **_k: [])
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

    monkeypatch.setattr(providers, "openlibrary_search", blocked)
    stalled = client.get("/api/search", params={"q": "stall", "kind": "book"})
    assert stalled.status_code == 200
    stalled_body = stalled.json()
    assert stalled_body["providers"]["openlibrary"] == "error"
    assert stalled_body["results"] == []


def test_provider_line_does_not_contradict_the_rows(client, monkeypatch):
    monkeypatch.setenv("TMDB_API_KEY", "test")
    from apps.media.backend.services import providers

    calls = {"n": 0}

    def flappy(*_args, **_kwargs):
        calls["n"] += 1
        if calls["n"] == 1:
            raise RuntimeError("down")
        if calls["n"] == 3:
            raise RuntimeError("down again")
        return [_hit("tmdb", "m1", "movie", "Back", 2001)]

    monkeypatch.setattr(providers, "tmdb_search", flappy)
    monkeypatch.setattr(providers, "openlibrary_search", lambda *_a, **_k: [])
    monkeypatch.setattr(providers, "musicbrainz_search", lambda *_a, **_k: [])
    first = client.get("/api/search", params={"q": "flap", "kind": "movie"}).json()
    assert first["providers"]["tmdb"] == "error"
    assert first["results"] == []
    second = client.get("/api/search", params={"q": "flap-back", "kind": "movie"}).json()
    assert second["results"][0]["title"] == "Back"
    assert second["providers"]["tmdb"] == "ok"
    third = client.get("/api/search", params={"q": "flap-down", "kind": "movie"}).json()
    assert third["results"] == []
    assert third["providers"]["tmdb"] == "error"


def test_search_uses_real_threads_and_a_timeout(client, monkeypatch):
    monkeypatch.setenv("TMDB_API_KEY", "test")
    monkeypatch.setenv("RAWG_API_KEY", "test")
    from apps.media.backend.services import providers

    movie_started = threading.Event()
    game_started = threading.Event()
    release = threading.Event()

    def slow_movie(*_args, **_kwargs):
        movie_started.set()
        release.wait()
        return [_hit("tmdb", "m1", "movie", "Slow Movie", 2000)]

    def slow_game(*_args, **_kwargs):
        game_started.set()
        release.wait()
        return [_hit("rawg", "g1", "game", "Slow Game", 2001)]

    monkeypatch.setattr(providers, "tmdb_search", slow_movie)
    monkeypatch.setattr(providers, "rawg_search", slow_game)
    monkeypatch.setattr(providers, "tvmaze_search", lambda *_a, **_k: [])
    monkeypatch.setattr(providers, "openlibrary_search", lambda *_a, **_k: [])
    monkeypatch.setattr(providers, "musicbrainz_search", lambda *_a, **_k: [])
    # Both real provider workers must enter before either can finish. The waits
    # only guard test hangs; concurrency is proved by event ordering, not speed.
    with ThreadPoolExecutor(max_workers=1) as requests:
        response = requests.submit(client.get, "/api/search", params={"q": "parallel"})
        try:
            assert movie_started.wait(10), "Movie provider did not start"
            assert game_started.wait(10), "Game provider did not start concurrently"
            assert not response.done()
            release.set()
            found = response.result(timeout=10)
        finally:
            release.set()
    assert found.status_code == 200
    assert {row["title"] for row in found.json()["results"]} == {"Slow Movie", "Slow Game"}

    gate = threading.Event()
    blocked_started = threading.Event()
    blocked_finished = threading.Event()
    expired = threading.Event()
    deadlines = []
    real_as_completed = providers.as_completed

    def observe_timeout(futures, timeout):
        deadlines.append(timeout)
        try:
            yield from real_as_completed(futures, timeout=timeout)
        except FuturesTimeout:
            expired.set()
            raise

    def blocked(*_args, **_kwargs):
        blocked_started.set()
        gate.wait()
        blocked_finished.set()
        return [_hit("openlibrary", "late", "book", "Too Late", 1990)]

    monkeypatch.setattr(providers, "SEARCH_TIMEOUT", 0.3)
    monkeypatch.setattr(providers, "openlibrary_search", blocked)
    monkeypatch.setattr(providers, "as_completed", observe_timeout)
    with ThreadPoolExecutor(max_workers=1) as requests:
        response = requests.submit(client.get, "/api/search", params={"q": "hang", "kind": "book"})
        try:
            stalled = response.result(timeout=10)
            assert stalled.status_code == 200
            assert deadlines == [0.8]
            assert expired.is_set(), "The real futures iterator did not expire"
            assert blocked_started.is_set()
            assert not blocked_finished.is_set()
            assert not gate.is_set()
            body = stalled.json()
            assert body["providers"]["openlibrary"] == "error"
            assert (
                next(source for source in body["sources"] if source["id"] == "openlibrary")["state"]
                == "timeout"
            )
            assert body["results"] == []
        finally:
            gate.set()
            if blocked_started.is_set():
                assert blocked_finished.wait(10), "Blocked provider did not exit after cleanup"
