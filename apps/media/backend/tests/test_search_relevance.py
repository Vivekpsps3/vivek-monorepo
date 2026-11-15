"""Title regression fixtures exercise adapters, ranking, filtering and pagination."""

from pathlib import Path

import pytest

from apps.media.backend.services import providers

FIXTURES = Path(__file__).parent / "fixtures" / "search"


@pytest.mark.parametrize("query", ["The Gentlemen", " THE   GENTLEMEN ", "the-gentlemen"])
@pytest.mark.parametrize("kind", ["all", "movie", "tv"])
def test_exact_movie_and_series_survive_candidate_cutoffs(client, monkeypatch, query, kind):
    monkeypatch.setenv("TMDB_API_KEY", "fixture-key")
    movie: dict = {
        "source": "tmdb",
        "source_id": "movie:522627",
        "kind": "movie",
        "title": "The Gentlemen",
        "year": 2019,
    }
    series: dict = {
        "source": "tmdb",
        "source_id": "tv:236235",
        "kind": "tv",
        "title": "The Gentlemen",
        "year": 2024,
    }
    distractors: list[dict] = [
        {"source": "tmdb", "source_id": f"movie:{i}", "kind": "movie", "title": f"Gentlemen {i}"}
        for i in range(45)
    ]

    def tmdb(_http, _query, selected):
        return [
            item
            for item in [*distractors, movie, series]
            if selected is None or item["kind"] == selected
        ]

    monkeypatch.setattr(providers, "tmdb_search", tmdb)
    monkeypatch.setattr(providers, "tvmaze_search", lambda *_args: [])
    monkeypatch.setattr(providers, "musicbrainz_search", lambda *_args: [])
    monkeypatch.setattr(providers, "openlibrary_search", lambda *_args: [])
    monkeypatch.setattr(providers, "steam_search", lambda *_args: [])
    response = client.get("/api/search", params={"q": query, "kind": kind, "limit": 2}).json()
    assert response["results"][0]["title"] == "The Gentlemen"
    if kind == "all":
        assert [row["kind"] for row in response["results"]] == ["movie", "tv"]
    assert all(row["kind"] == kind for row in response["results"]) if kind != "all" else True
    again = client.get("/api/search", params={"q": query, "kind": kind, "limit": 2}).json()
    assert again["results"] == response["results"]
    if kind != "tv":
        assert response["has_more"] is True
        second = client.get(
            "/api/search", params={"q": query, "kind": kind, "limit": 2, "offset": 2}
        ).json()
        assert not {row["source_id"] for row in second["results"]} & {
            row["source_id"] for row in response["results"]
        }
