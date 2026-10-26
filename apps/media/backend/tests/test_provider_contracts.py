"""Each media kind has one search source and one detail fetch, with pace and provenance."""

import json

import httpx
import pytest

from apps.media.backend.services import providers
from apps.media.backend.services.providers import (
    itunes_detail,
    musicbrainz_album_detail,
    musicbrainz_artist_detail,
    musicbrainz_track_detail,
    openlibrary_detail,
    parse_tmdb_public_detail,
    rawg_detail,
    steam_detail,
    tmdb_movie_detail,
    tmdb_tv_detail,
    tvmaze_detail,
)
from apps.media.backend.services.providers import (
    lookup_detail as live_lookup,
)


def _http(handler):
    return httpx.Client(transport=httpx.MockTransport(handler))


def test_musicbrainz_calls_share_one_pace(monkeypatch):
    clock = {"t": 50.0}
    waits = []

    def now():
        return clock["t"]

    def sleep(seconds):
        waits.append(seconds)
        clock["t"] += seconds

    monkeypatch.setattr(providers, "_monotonic", now)
    monkeypatch.setattr(providers, "_sleep", sleep)
    providers.MB_PACE.gap = 1.0
    providers.MB_PACE._next = 0.0
    providers.MB_PACE.wait()
    providers.MB_PACE.wait()
    providers.MB_PACE.defer("2")
    providers.MB_PACE.wait()
    assert waits == [1.0, 2.0]


def test_musicbrainz_429_is_not_retried():
    calls = {"n": 0}

    def handler(_request: httpx.Request) -> httpx.Response:
        calls["n"] += 1
        return httpx.Response(429, headers={"Retry-After": "2"})

    with _http(handler) as http, pytest.raises(httpx.HTTPStatusError):
        providers.mb_get(http, "https://musicbrainz.org/ws/2/artist/x")
    assert calls["n"] == 1


def test_music_search_is_not_retried(client, monkeypatch):
    calls = {"n": 0}

    def boom(*_args, **_kwargs):
        calls["n"] += 1
        raise RuntimeError("down")

    monkeypatch.setattr(providers, "musicbrainz_search", boom)
    found = client.get("/api/search", params={"q": "song", "kind": "track"})
    assert found.status_code == 200
    body = found.json()
    assert calls["n"] == 1
    assert body["providers"] == {"musicbrainz": "error"}
    assert body["results"] == []


def test_tmdb_movie_detail_prefers_the_official_api(monkeypatch):
    monkeypatch.setenv("TMDB_API_KEY", "secret")

    def handler(request: httpx.Request) -> httpx.Response:
        assert request.url.host == "api.themoviedb.org"
        assert request.url.path == "/3/movie/27205"
        assert request.url.params["api_key"] == "secret"
        return httpx.Response(
            200,
            json={
                "id": 27205,
                "title": "Inception",
                "overview": "A dream.",
                "release_date": "2010-07-16",
                "poster_path": "/poster.jpg",
                "vote_average": 8.4,
                "vote_count": 10,
                "genres": [{"name": "Science Fiction"}],
            },
        )

    with _http(handler) as http:
        row = tmdb_movie_detail(http, "movie:27205")
    assert row["title"] == "Inception"
    assert row["source_id"] == "movie:27205"
    assert row["provenance"]["coverage"] == "official"
    assert row["genres"] == ["Science Fiction"]
    assert row["releases"][0]["released_on"] == "2010-07-16"
    assert row["external_ratings"][0]["scale"] == "0–10"
    assert "secret" not in json.dumps(row)
    with _http(lambda _request: pytest.fail("bad id must not fetch")) as http:
        assert tmdb_movie_detail(http, "movie:nope") is None


def test_tmdb_movie_detail_without_a_key_reads_the_public_page(monkeypatch):
    monkeypatch.delenv("TMDB_API_KEY", raising=False)
    page = """
    <html>
      <meta property="og:title" content="Inception (2010) | The Movie Database">
      <meta property="og:description" content="A dream.">
      <meta property="og:image" content="https://media.themoviedb.org/t/p/w500/poster.jpg">
    </html>
    """
    parsed = parse_tmdb_public_detail(page, "27205")
    assert parsed["title"] == "Inception"
    assert parsed["year"] == 2010
    assert parsed["releases"][0]["precision"] == "year"
    assert parsed["artwork_url"] == "https://image.tmdb.org/t/p/w342/poster.jpg"
    assert parsed["external_ratings"] == []
    assert parsed["provenance"]["coverage"] == "extraction"
    assert parse_tmdb_public_detail("<html></html>", "27205") is None

    def handler(request: httpx.Request) -> httpx.Response:
        assert request.url.host == "www.themoviedb.org"
        assert request.url.path == "/movie/27205"
        assert request.headers["accept"] == "text/html"
        return httpx.Response(200, text=page)

    with _http(handler) as http:
        row = tmdb_movie_detail(http, "movie:27205")
    assert row["title"] == "Inception"
    assert row["source_id"] == "movie:27205"
    assert row["provenance"]["coverage"] == "extraction"


def test_tmdb_series_detail_needs_a_key_and_keeps_lifecycle(monkeypatch):
    monkeypatch.delenv("TMDB_API_KEY", raising=False)
    with _http(lambda _request: pytest.fail("series detail needs a key")) as http:
        assert tmdb_tv_detail(http, "tv:1396") is None
    monkeypatch.setenv("TMDB_API_KEY", "secret")

    def handler(request: httpx.Request) -> httpx.Response:
        assert request.url.path == "/3/tv/1396"
        return httpx.Response(
            200,
            json={
                "id": 1396,
                "name": "Breaking Bad",
                "overview": "A teacher.",
                "first_air_date": "2008-01-20",
                "poster_path": "/bb.jpg",
                "status": "Ended",
                "in_production": False,
                "number_of_episodes": 62,
                "networks": [{"name": "AMC"}],
                "genres": [{"name": "Drama"}],
            },
        )

    with _http(handler) as http:
        row = tmdb_tv_detail(http, "tv:1396")
    assert row["creator"] == "AMC"
    assert row["extra"]["lifecycle"] == "Ended"
    assert row["extra"]["episode_count"] == 62
    assert row["extra"]["in_production"] is False
    assert row["provenance"]["coverage"] == "official"
    assert row["releases"][0]["precision"] == "day"


def test_tvmaze_detail_includes_lifecycle_and_episodes(monkeypatch):
    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path.endswith("/episodes"):
            return httpx.Response(
                200,
                json=[
                    {
                        "id": 1,
                        "season": 1,
                        "number": 1,
                        "name": "Pilot",
                        "airdate": "2008-01-20",
                        "summary": "<p>A teacher.</p>",
                    },
                    {"id": 2, "season": 1, "number": None, "name": "Skip"},
                ],
            )
        assert request.url.path == "/shows/169"
        return httpx.Response(
            200,
            json={
                "id": 169,
                "name": "Breaking Bad",
                "premiered": "2008-01-20",
                "status": "Ended",
                "summary": "<p>A teacher.</p>",
                "genres": ["Drama"],
                "network": {"name": "AMC"},
                "image": {
                    "medium": "https://static.tvmaze.com/uploads/images/medium_portrait/0/1.jpg"
                },
            },
        )

    with _http(handler) as http:
        row = tvmaze_detail(http, "169")
    assert row["extra"]["lifecycle"] == "Ended"
    assert row["episodes"][0]["title"] == "Pilot"
    assert row["episodes"][0]["overview"] == "A teacher."
    assert len(row["episodes"]) == 1
    assert row["provenance"]["provider"] == "tvmaze"

    def broken(request: httpx.Request) -> httpx.Response:
        if request.url.path.endswith("/episodes"):
            raise RuntimeError("episodes down")
        return httpx.Response(200, json={"id": 169, "name": "Breaking Bad", "status": "Running"})

    monkeypatch.setattr(
        "apps.media.backend.services.followups.tvmaze_episodes",
        lambda *_args, **_kwargs: (_ for _ in ()).throw(RuntimeError("down")),
    )
    with _http(broken) as http:
        partial = tvmaze_detail(http, "169")
    assert partial["title"] == "Breaking Bad"
    assert partial["episodes"] == []
    with _http(lambda _request: pytest.fail("bad id")) as http:
        assert tvmaze_detail(http, "show") is None


def test_openlibrary_detail_does_not_invent_a_day():
    pages = {
        "/works/OL1W.json": {
            "title": "Dune",
            "description": {"value": "Desert planet."},
            "first_publish_date": "1965",
            "covers": [99],
            "authors": [{"name": "Frank Herbert"}],
        },
        "/works/OL2W.json": {"title": "Later", "first_publish_date": "June 1965"},
        "/books/OL3M.json": {"title": "Edition", "publish_date": "1965-08-01"},
    }

    def handler(request: httpx.Request) -> httpx.Response:
        body = pages.get(request.url.path)
        if body is None:
            return httpx.Response(404)
        return httpx.Response(200, json=body)

    with _http(handler) as http:
        work = openlibrary_detail(http, "OL1W")
        vague = openlibrary_detail(http, "OL2W")
        edition = openlibrary_detail(http, "OL3M")
        missing = openlibrary_detail(http, "not-a-key")
    assert work["extra"]["record"] == "work"
    assert work["year"] == 1965
    assert work["releases"][0]["precision"] == "year"
    assert work["creator"] == "Frank Herbert"
    assert work["artwork_url"].endswith("/99-M.jpg")
    assert vague["releases"] == []
    assert vague["year"] is None
    assert edition["extra"]["record"] == "edition"
    assert edition["releases"][0] == {
        "released_on": "1965-08-01",
        "precision": "day",
        "status": "released",
    }
    assert missing is None


def test_game_detail_names_platforms_and_skips_metacritic(monkeypatch):
    monkeypatch.setenv("RAWG_API_KEY", "secret")

    def rawg(request: httpx.Request) -> httpx.Response:
        assert request.url.params["key"] == "secret"
        return httpx.Response(
            200,
            json={
                "id": 1,
                "name": "Hades",
                "released": "2020-09-17",
                "description_raw": "Escape.",
                "background_image": "https://media.rawg.io/hades.jpg",
                "rating": 4.5,
                "ratings_count": 20,
                "genres": [{"name": "Action"}],
                "platforms": [{"platform": {"name": "PC"}}],
            },
        )

    with _http(rawg) as http:
        row = rawg_detail(http, "1")
    assert row["extra"]["platforms"] == ["PC"]
    assert row["external_ratings"][0]["scale"] == "0–5"
    assert row["provenance"]["coverage"] == "official"
    assert row["releases"][0]["precision"] == "day"
    monkeypatch.delenv("RAWG_API_KEY", raising=False)
    with _http(lambda _request: pytest.fail("rawg needs a key")) as http:
        assert rawg_detail(http, "1") is None

    def steam(request: httpx.Request) -> httpx.Response:
        assert request.url.params["appids"] == "1145360"
        return httpx.Response(
            200,
            json={
                "1145360": {
                    "success": True,
                    "data": {
                        "name": "Hades",
                        "short_description": "Escape.",
                        "header_image": "https://shared.akamai.steamstatic.com/hades.jpg",
                        "release_date": {"coming_soon": False, "date": "17 Sep, 2020"},
                        "platforms": {"windows": True, "mac": False, "linux": False},
                        "metacritic": {"score": 93},
                    },
                }
            },
        )

    with _http(steam) as http:
        game = steam_detail(http, "1145360")
    assert game["external_ratings"] == []
    assert game["extra"]["platforms"] == ["Windows"]
    assert game["releases"][0]["released_on"] == "2020-09-17"
    assert game["provenance"]["coverage"] == "keyless"
    assert "93" not in json.dumps(game["external_ratings"])


def test_itunes_detail_looks_up_the_track_id():
    def handler(request: httpx.Request) -> httpx.Response:
        assert request.url.params["id"] == "413416"
        return httpx.Response(
            200,
            json={
                "resultCount": 1,
                "results": [
                    {
                        "trackId": 413416,
                        "trackName": "Inception",
                        "artistName": "Christopher Nolan",
                        "releaseDate": "2010-07-16T07:00:00Z",
                        "primaryGenreName": "Action",
                        "longDescription": "A dream.",
                    }
                ],
            },
        )

    with _http(handler) as http:
        row = itunes_detail(http, "413416")
    assert row["title"] == "Inception"
    assert row["creator"] == "Christopher Nolan"
    assert row["provenance"]["provider"] == "itunes"
    assert row["releases"][0]["precision"] == "day"


def test_musicbrainz_detail_keeps_release_and_recording_ids():
    def handler(request: httpx.Request) -> httpx.Response:
        if "/release/" in request.url.path:
            return httpx.Response(
                200,
                json={
                    "id": "0ea273f2-a76b-4ff5-8cd9-f54ba2f290fe",
                    "title": "petal",
                    "date": "2026-07-31",
                    "artist-credit": [{"name": "Ariana Grande"}],
                    "release-group": {
                        "id": "2b8f453f-ffd6-4860-8742-7cff1c2feae3",
                        "primary-type": "Single",
                    },
                },
            )
        if "/recording/" in request.url.path:
            return httpx.Response(
                200,
                json={
                    "id": "11111111-1111-1111-1111-111111111111",
                    "title": "kiss me",
                    "first-release-date": "2026",
                    "artist-credit": [{"name": "Ariana Grande"}],
                },
            )
        return httpx.Response(
            200,
            json={
                "id": "f4fdbb4c-e4b7-47a0-b83b-d91bbfcfa387",
                "name": "Ariana Grande",
                "type": "Person",
                "disambiguation": "singer",
                "life-span": {"begin": "1993-06-26"},
            },
        )

    with _http(handler) as http:
        artist = musicbrainz_artist_detail(http, "f4fdbb4c-e4b7-47a0-b83b-d91bbfcfa387")
        album = musicbrainz_album_detail(http, "0ea273f2-a76b-4ff5-8cd9-f54ba2f290fe")
        track = musicbrainz_track_detail(http, "11111111-1111-1111-1111-111111111111")
        skipped = musicbrainz_album_detail(http, "not-an-mbid")
    assert artist["releases"] == []
    assert artist["year"] == 1993
    assert artist["overview"] == "singer"
    assert album["extra"]["release_group_id"] == "2b8f453f-ffd6-4860-8742-7cff1c2feae3"
    assert album["artwork_url"].startswith("https://coverartarchive.org/release-group/")
    assert album["releases"][0]["precision"] == "day"
    assert track["kind"] == "track"
    assert track["releases"][0]["precision"] == "year"
    assert skipped is None


def test_lookup_dispatches_one_detail_path_per_kind(monkeypatch):
    seen = []

    def grab(name):
        def inner(_http, source_id):
            seen.append((name, source_id))
            return {"source": name, "source_id": source_id}

        return inner

    monkeypatch.setattr(providers, "tmdb_movie_detail", grab("tmdb-movie"))
    monkeypatch.setattr(providers, "tmdb_tv_detail", grab("tmdb-tv"))
    monkeypatch.setattr(providers, "tvmaze_detail", grab("tvmaze"))
    monkeypatch.setattr(providers, "itunes_detail", grab("itunes"))
    monkeypatch.setattr(providers, "openlibrary_detail", grab("openlibrary"))
    monkeypatch.setattr(providers, "rawg_detail", grab("rawg"))
    monkeypatch.setattr(providers, "steam_detail", grab("steam"))
    monkeypatch.setattr(providers, "musicbrainz_artist_detail", grab("artist"))
    monkeypatch.setattr(providers, "musicbrainz_album_detail", grab("album"))
    monkeypatch.setattr(providers, "musicbrainz_track_detail", grab("track"))
    pairs = [
        ("tmdb", "movie", "movie:1", "tmdb-movie"),
        ("tmdb", "tv", "tv:1", "tmdb-tv"),
        ("tvmaze", "tv", "1", "tvmaze"),
        ("itunes", "movie", "9", "itunes"),
        ("openlibrary", "book", "OL1W", "openlibrary"),
        ("rawg", "game", "3", "rawg"),
        ("steam", "game", "4", "steam"),
        ("musicbrainz", "artist", "a", "artist"),
        ("musicbrainz", "album", "b", "album"),
        ("musicbrainz", "track", "c", "track"),
    ]
    for source, kind, source_id, name in pairs:
        row = live_lookup(source, kind, source_id)
        assert row["source"] == name
    assert [item[0] for item in seen] == [item[3] for item in pairs]
    assert live_lookup("steam", "book", "4") is None

    def boom(_http, _source_id):
        raise RuntimeError("down")

    monkeypatch.setattr(providers, "openlibrary_detail", boom)
    assert live_lookup("openlibrary", "book", "OL1W") is None


def _official_book(source, kind, source_id):
    return {
        "source": source,
        "source_id": source_id,
        "kind": kind,
        "title": "Dune",
        "creator": "Frank Herbert",
        "year": 1965,
        "overview": "Desert.",
        "artwork_url": "https://covers.openlibrary.org/b/id/1-M.jpg",
        "genres": ["Fiction"],
        "external_ratings": [
            {"provider": "openlibrary", "label": "Open Library", "value": 4.2, "scale": "0–5"}
        ],
        "extra": {"record": "work"},
        "releases": [{"released_on": "1965-01-01", "precision": "year", "status": "released"}],
        "episodes": [],
        "provenance": {
            "provider": "openlibrary",
            "coverage": "official",
            "fetched_at": "2026-10-26T00:00:00+00:00",
        },
    }


def test_add_uses_detail_and_keeps_the_personal_note(client, monkeypatch):
    monkeypatch.setattr(providers, "lookup_detail", _official_book)
    saved = client.post(
        "/api/library/from-provider",
        json={
            "source": "openlibrary",
            "source_id": "OL1W",
            "kind": "book",
            "title": "Client Lie",
            "creator": "Nobody",
            "year": 1999,
            "overview": "Fake.",
            "artwork_url": "https://evil.example/cover.jpg",
            "external_ratings": [
                {"provider": "openlibrary", "label": "Open Library", "value": 1, "scale": "0–5"}
            ],
            "review": "Mine.",
            "rating": 9,
            "status": "want",
        },
    )
    assert saved.status_code == 200, saved.text
    body = saved.json()
    assert body["catalog"]["title"] == "Dune"
    assert body["catalog"]["creator"] == "Frank Herbert"
    assert body["catalog"]["overview"] == "Desert."
    assert body["catalog"]["year"] == 1965
    assert body["catalog"]["artwork_url"].endswith("/1-M.jpg")
    assert body["catalog"]["extra"]["metadata_pending"] is False
    assert body["catalog"]["extra"]["record"] == "work"
    assert body["catalog"]["extra"]["provenance"]["coverage"] == "official"
    assert body["releases"][0]["precision"] == "year"
    assert body["review"] == "Mine."
    assert body["rating"] == 9
    again = client.post(
        "/api/library/from-provider",
        json={
            "source": "openlibrary",
            "source_id": "OL1W",
            "kind": "book",
            "title": "Replacement",
            "review": "Nope.",
            "rating": 1,
        },
    ).json()
    assert again["already_saved"] is True
    assert again["catalog"]["title"] == "Dune"
    assert again["review"] == "Mine."
    assert again["rating"] == 9


def test_a_mismatched_detail_does_not_become_canonical(client, monkeypatch):
    monkeypatch.setattr(
        providers,
        "lookup_detail",
        lambda *_args, **_kwargs: {
            "source": "openlibrary",
            "source_id": "OTHER",
            "kind": "book",
            "title": "Wrong",
        },
    )
    saved = client.post(
        "/api/library/from-provider",
        json={
            "source": "openlibrary",
            "source_id": "OL9W",
            "kind": "book",
            "title": "Kept",
            "overview": "Should not stick.",
            "episodes": [{"season_number": 1, "episode_number": 1, "title": "Nope"}],
        },
    )
    assert saved.status_code == 200, saved.text
    body = saved.json()
    assert body["catalog"]["title"] == "Kept"
    assert body["catalog"]["overview"] is None
    assert body["catalog"]["extra"]["metadata_pending"] is True
    rejected = client.post(
        "/api/library/from-provider",
        json={"source": "steam", "source_id": "10", "kind": "book", "title": "No"},
    )
    assert rejected.status_code == 422


def test_later_detail_fills_blanks_without_erasing_a_written_overview(client, monkeypatch):
    state = {"detail": None}

    def lookup(*_args, **_kwargs):
        return state["detail"]

    monkeypatch.setattr(providers, "lookup_detail", lookup)
    saved = client.post(
        "/api/library/from-provider",
        json={
            "source": "openlibrary",
            "source_id": "OL8W",
            "kind": "book",
            "title": "Kept",
            "review": "Mine.",
        },
    ).json()
    assert saved["catalog"]["extra"]["metadata_pending"] is True
    patched = client.patch(
        f"/api/entries/{saved['id']}", json={"overview": "My description"}
    ).json()
    assert patched["catalog"]["overview"] == "My description"
    state["detail"] = _official_book("openlibrary", "book", "OL8W")
    state["detail"]["overview"] = "Adapter text."
    state["detail"]["title"] = "Dune"
    again = client.post(
        "/api/library/from-provider",
        json={
            "source": "openlibrary",
            "source_id": "OL8W",
            "kind": "book",
            "title": "Kept",
            "review": "Nope.",
        },
    ).json()
    assert again["catalog"]["overview"] == "My description"
    assert again["catalog"]["creator"] == "Frank Herbert"
    assert again["catalog"]["title"] == "Dune"
    assert again["catalog"]["extra"]["metadata_pending"] is False
    assert again["review"] == "Mine."


def test_tv_add_stores_detail_episodes_only(client, monkeypatch):
    monkeypatch.setattr(
        providers,
        "lookup_detail",
        lambda source, kind, source_id: {
            "source": source,
            "source_id": source_id,
            "kind": kind,
            "title": "Show",
            "creator": "AMC",
            "year": 2008,
            "overview": None,
            "artwork_url": None,
            "genres": [],
            "external_ratings": [],
            "extra": {"lifecycle": "Ended"},
            "releases": [],
            "episodes": [
                {
                    "season_number": 1,
                    "episode_number": 1,
                    "title": "Pilot",
                    "air_date": "2008-01-20",
                },
                {"season_number": "nope", "episode_number": "nope"},
            ],
            "provenance": {
                "provider": "tvmaze",
                "coverage": "official",
                "fetched_at": "2026-10-26T00:00:00+00:00",
            },
        },
    )
    saved = client.post(
        "/api/library/from-provider",
        json={
            "source": "tvmaze",
            "source_id": "169",
            "kind": "tv",
            "title": "Browser Show",
            "episodes": [
                {"season_number": 9, "episode_number": 9, "title": "Fake"},
            ],
        },
    )
    assert saved.status_code == 200, saved.text
    show = saved.json()["show"]
    assert [row["title"] for row in show["episodes"]] == ["Pilot"]
    assert saved.json()["catalog"]["title"] == "Show"
    assert saved.json()["catalog"]["extra"]["lifecycle"] == "Ended"
