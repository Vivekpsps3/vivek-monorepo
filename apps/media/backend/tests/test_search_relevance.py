"""Title regression fixtures exercise adapters, ranking, filtering and pagination."""

import json
from pathlib import Path

import httpx
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


def test_public_tvmaze_fixture_keeps_the_series_identity_and_lifecycle():
    payload = json.loads((FIXTURES / "tvmaze-gentlemen.json").read_text())
    with httpx.Client(
        transport=httpx.MockTransport(lambda _request: httpx.Response(200, json=payload))
    ) as http:
        rows = providers.tvmaze_search(http, "The Gentlemen")
    actual = next(row for row in rows if row["title"] == "The Gentlemen" and row["year"] == 2024)
    assert actual["kind"] == "tv"
    assert actual["source"] == "tvmaze"
    assert actual["extra"]["lifecycle"]


def test_tmdb_adapter_keeps_exact_hit_after_eight_candidates(monkeypatch):
    monkeypatch.setenv("TMDB_API_KEY", "fixture-key")
    payload = {
        "results": [{"id": i, "title": f"Other {i}"} for i in range(12)]
        + [{"id": 522627, "title": "The Gentlemen", "release_date": "2019-12-03"}]
    }
    with httpx.Client(
        transport=httpx.MockTransport(lambda _request: httpx.Response(200, json=payload))
    ) as http:
        rows = providers.tmdb_search(http, "The Gentlemen", "movie")
    assert any(row["source_id"] == "movie:522627" for row in rows)


def test_partial_failure_preserves_movie_and_retries_only_failed_source(client, monkeypatch):
    monkeypatch.setenv("TMDB_API_KEY", "fixture-key")
    counts = {"movie": 0, "tv": 0}

    def tmdb(*_args):
        counts["movie"] += 1
        return [
            {"source": "tmdb", "source_id": "movie:42", "kind": "movie", "title": "The Gentlemen"}
        ]

    def tv(*_args):
        counts["tv"] += 1
        if counts["tv"] == 1:
            raise httpx.ReadTimeout("fixture outage")
        return [{"source": "tvmaze", "source_id": "84", "kind": "tv", "title": "The Gentlemen"}]

    monkeypatch.setattr(providers, "tmdb_search", tmdb)
    monkeypatch.setattr(providers, "tvmaze_search", tv)
    monkeypatch.setattr(providers, "musicbrainz_search", lambda *_args: [])
    monkeypatch.setattr(providers, "openlibrary_search", lambda *_args: [])
    monkeypatch.setattr(providers, "steam_search", lambda *_args: [])
    partial = client.get("/api/search", params={"q": "The Gentlemen"}).json()
    assert partial["partial"] is True
    assert partial["results"][0]["kind"] == "movie"
    assert (
        next(source for source in partial["sources"] if source["id"] == "tvmaze")["state"]
        == "timeout"
    )
    recovered = client.get("/api/search", params={"q": "The Gentlemen", "retry": True}).json()
    assert recovered["partial"] is False
    assert {row["kind"] for row in recovered["results"]} == {"movie", "tv"}
    assert counts == {"movie": 1, "tv": 2}
