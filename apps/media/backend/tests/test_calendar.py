"""Calendar rules. These tests do not call live metadata providers."""

import json

import httpx
import pytest


def silence(monkeypatch, wiki=None, parts=None, tvmaze=None, tmdb_episodes=None):
    monkeypatch.setattr(
        "apps.media.backend.services.followups.wikidata_related",
        wiki or (lambda *_args, **_kwargs: []),
    )
    monkeypatch.setattr(
        "apps.media.backend.services.followups.tmdb_collection_parts",
        parts or (lambda *_args, **_kwargs: []),
    )
    monkeypatch.setattr(
        "apps.media.backend.services.followups.tvmaze_episodes",
        tvmaze or (lambda *_args, **_kwargs: []),
    )
    monkeypatch.setattr(
        "apps.media.backend.services.followups.tmdb_episodes",
        tmdb_episodes or (lambda *_args, **_kwargs: []),
    )


def add_movie(client, title, **extra):
    body = {"kind": "movie", "title": title}
    body.update(extra)
    response = client.post("/api/library", json=body)
    assert response.status_code == 200
    return response.json()


def titles_on(payload, day):
    for row in payload["days"]:
        if row["date"] == day:
            return [event["title"] for event in row["events"]]
    return []


def all_events(payload):
    found = []
    for row in payload["days"]:
        for event in row["events"]:
            found.append({**event, "date": row["date"]})
    for band in ("month_band", "year_band", "unknown"):
        for event in payload[band]:
            found.append({**event, "band": band})
    return found


def by_title(payload, title):
    return [event for event in all_events(payload) if event["title"] == title]


def test_calendar_lists_episodes_anticipated_movies_and_follow_ups(client, monkeypatch):
    from apps.server.auth import Principal, require_principal

    monkeypatch.setenv("MEDIA_TODAY", "2026-10-16")
    seen = []

    def wiki(_http, title, year):
        seen.append((title, year))
        if title == "Watched":
            return [
                {
                    "relation": "sequel",
                    "title": "Watched 2",
                    "year": 2026,
                    "precision": "day",
                    "released_on": "2026-10-19",
                    "source": "wikidata",
                    "source_id": None,
                },
                {
                    "relation": "spinoff",
                    "title": "Watched Stories",
                    "year": 2026,
                    "precision": "month",
                    "released_on": "2026-10-01",
                    "source": "wikidata",
                    "source_id": None,
                },
                {
                    "relation": "sequel",
                    "title": "Watched Zero",
                    "year": 2019,
                    "precision": "day",
                    "released_on": "2019-05-01",
                    "source": "wikidata",
                    "source_id": None,
                },
                {
                    "relation": "sequel",
                    "title": "Watched",
                    "year": 2021,
                    "precision": "day",
                    "released_on": "2021-01-01",
                    "source": "wikidata",
                    "source_id": None,
                },
                {
                    "relation": "sequel",
                    "title": "Seen Sequel",
                    "year": 2019,
                    "precision": "day",
                    "released_on": "2026-10-19",
                    "source": "wikidata",
                    "source_id": None,
                },
            ]
        if title == "Logging":
            return [
                {
                    "relation": "sequel",
                    "title": "Logging Returns",
                    "year": 2026,
                    "precision": "year",
                    "released_on": "2026-01-01",
                    "source": "wikidata",
                    "source_id": None,
                },
            ]
        return []

    silence(monkeypatch, wiki=wiki)

    show = add_movie(client, "Serial", kind="tv", status="in_progress")
    for episode in (
        {"season_number": 1, "episode_number": 1, "title": "Pilot", "air_date": "2026-10-02"},
        {"season_number": 1, "episode_number": 2, "title": "Next", "air_date": "2026-10-20"},
        {"season_number": 1, "episode_number": 3, "title": "November", "air_date": "2026-11-01"},
        {"season_number": 1, "episode_number": 4, "title": "September", "air_date": "2026-09-30"},
    ):
        assert client.post(f"/api/entries/{show['id']}/episodes", json=episode).status_code == 200
    pilot_id = client.get(f"/api/entries/{show['id']}").json()["show"]["episodes"][0]["id"]
    assert (
        client.post(
            f"/api/entries/{show['id']}/episodes/{pilot_id}/watched",
            json={"watched": True},
        ).status_code
        == 200
    )
    dropped = add_movie(client, "Dropped Show", kind="tv", status="dropped")
    assert (
        client.post(
            f"/api/entries/{dropped['id']}/episodes",
            json={
                "season_number": 2,
                "episode_number": 1,
                "title": "Still Listed",
                "air_date": "2026-10-21",
            },
        ).status_code
        == 200
    )
    finished = add_movie(client, "Finished Show", kind="tv", status="completed")
    assert (
        client.post(
            f"/api/entries/{finished['id']}/episodes",
            json={
                "season_number": 3,
                "episode_number": 4,
                "title": "Renewal",
                "air_date": "2026-10-22",
            },
        ).status_code
        == 200
    )

    add_movie(
        client, "Soon", status="anticipating", release_on="2026-10-18", release_precision="day"
    )
    add_movie(
        client,
        "Sometime",
        status="anticipating",
        anticipated=True,
        release_on="2026-10-20",
        release_precision="month",
        release_status="scheduled",
    )
    add_movie(
        client, "Day One", status="anticipating", release_on="2026-10-01", release_precision="day"
    )
    add_movie(
        client,
        "This Year",
        status="anticipating",
        release_on="2026-08-01",
        release_precision="year",
    )
    add_movie(
        client,
        "Next Year",
        status="anticipating",
        release_on="2027-04-01",
        release_precision="year",
    )
    add_movie(
        client,
        "Held",
        status="anticipating",
        release_on="2026-10-11",
        release_precision="day",
        release_status="postponed",
    )
    add_movie(client, "Undated", status="anticipating")
    add_movie(client, "Wishlist", status="want", year=2024)
    add_movie(client, "Halfway", status="in_progress", year=2020)
    add_movie(client, "Watched", status="completed", year=2021)
    add_movie(client, "Watched 2", status="want", year=2026)
    add_movie(client, "Seen Sequel", status="completed", year=2019)
    add_movie(client, "Logging", status="completed", year=2018)

    before = {item["title"] for item in client.get("/api/library").json()["items"]}
    payload = client.get("/api/calendar").json()
    assert payload["month"] == "2026-10"
    assert payload["today"] == "2026-10-16"
    assert payload["partial"] is False
    after = {item["title"] for item in client.get("/api/library").json()["items"]}
    assert after == before
    assert "Watched Stories" not in after
    assert "Logging Returns" not in after

    pilot = by_title(payload, "Pilot")[0]
    assert pilot["date"] == "2026-10-02"
    assert pilot["watched"] is True
    assert pilot["entry_id"] == show["id"]
    nxt = by_title(payload, "Next")[0]
    assert nxt["short"] == "S1 E2"
    assert nxt["detail"] == "Serial"
    assert nxt["watched"] is False
    assert by_title(payload, "Still Listed")[0]["date"] == "2026-10-21"
    assert by_title(payload, "Renewal")[0]["date"] == "2026-10-22"
    assert by_title(payload, "September") == []
    assert by_title(payload, "November") == []

    assert by_title(payload, "Soon")[0]["date"] == "2026-10-18"
    assert by_title(payload, "Day One")[0]["date"] == "2026-10-01"
    assert "Sometime" not in titles_on(payload, "2026-10-01")
    sometime = by_title(payload, "Sometime")
    assert len(sometime) == 1
    assert sometime[0]["band"] == "month_band"
    assert sometime[0]["on"] is None
    assert sometime[0]["precision"] == "month"
    assert sometime[0]["release_on"] == "2026-10"
    this_year = by_title(payload, "This Year")[0]
    assert this_year["band"] == "year_band"
    assert this_year["on"] is None
    assert this_year["release_on"] == "2026"
    assert by_title(payload, "Next Year") == []
    assert by_title(payload, "Held")[0]["detail"] == "Postponed"
    assert by_title(payload, "Undated")[0]["band"] == "unknown"

    sequel = by_title(payload, "Watched 2")[0]
    assert sequel["type"] == "sequel"
    assert sequel["date"] == "2026-10-19"
    assert sequel["entry_id"] is not None
    assert sequel["because"] == "Sequel of Watched"
    stories = by_title(payload, "Watched Stories")[0]
    assert stories["type"] == "spinoff"
    assert stories["band"] == "month_band"
    assert stories["on"] is None
    assert stories["release_on"] == "2026-10"
    assert stories["because"] == "Spin-off of Watched"
    assert stories["entry_id"] is None
    returns = by_title(payload, "Logging Returns")[0]
    assert returns["band"] == "year_band"
    assert returns["on"] is None
    assert returns["release_on"] == "2026"
    assert by_title(payload, "Watched Zero") == []
    assert by_title(payload, "Seen Sequel") == []
    assert by_title(payload, "Watched") == []
    looked_up = {title for title, _year in seen}
    assert "Watched" in looked_up
    assert "Logging" in looked_up
    assert "Wishlist" not in looked_up
    assert "Halfway" not in looked_up
    assert "Soon" not in looked_up

    november = client.get("/api/calendar", params={"month": "2026-11"}).json()
    assert by_title(november, "November")[0]["date"] == "2026-11-01"
    assert by_title(november, "Next") == []
    assert by_title(november, "Sometime") == []
    assert by_title(november, "Undated") == []
    assert by_title(november, "This Year")[0]["band"] == "year_band"
    later = client.get("/api/calendar", params={"month": "2027-01"}).json()
    assert by_title(later, "Next Year")[0]["band"] == "year_band"
    assert by_title(later, "Next Year")[0]["on"] is None

    client.app.dependency_overrides[require_principal] = lambda: Principal(2, "other", "Other")
    assert "Serial" not in json.dumps(
        client.get("/api/calendar", params={"month": "2026-10"}).json()
    )
    assert client.get("/api/calendar", params={"month": "2026-13"}).status_code == 422
    assert client.get("/api/calendar", params={"month": "October"}).status_code == 422


def test_linked_shows_refresh_and_a_provider_failure_keeps_saved_episodes(client, monkeypatch):
    monkeypatch.setenv("MEDIA_TODAY", "2026-10-16")
    tvmaze_calls = []
    tmdb_calls = []
    mode = {"tvmaze": "raise"}

    def tvmaze(_http, show_id):
        tvmaze_calls.append(show_id)
        if mode["tvmaze"] == "raise":
            raise RuntimeError("tvmaze down")
        return [
            {"season_number": 1, "episode_number": 1, "title": "Old", "air_date": "2026-10-02"},
            {
                "season_number": 1,
                "episode_number": 2,
                "title": "New",
                "air_date": "2026-10-28",
                "overview": "<p>A <b>pilot</b> &amp; more.</p>",
            },
            {"season_number": 1, "episode_number": 3, "title": "Later", "air_date": "2026-11-02"},
            {"season_number": 1, "episode_number": None, "title": "Skip", "air_date": "2026-10-03"},
            {
                "season_number": 1,
                "episode_number": 4,
                "title": "Undated episode",
                "air_date": "nope",
            },
        ]

    def tmdb_episodes(_http, show_id):
        tmdb_calls.append(show_id)
        return [
            {
                "season_number": 1,
                "episode_number": 8,
                "title": "From TMDB",
                "air_date": "2026-10-07",
            }
        ]

    silence(monkeypatch, tvmaze=tvmaze, tmdb_episodes=tmdb_episodes)
    maze = client.post(
        "/api/library/from-provider",
        json={
            "source": "tvmaze",
            "source_id": "42",
            "kind": "tv",
            "title": "Maze Show",
            "status": "completed",
            "episodes": [
                {"season_number": 1, "episode_number": 1, "title": "Old", "air_date": "2026-10-02"}
            ],
        },
    )
    assert maze.status_code == 200
    manual = add_movie(client, "Typed Show", kind="tv", status="in_progress")
    assert (
        client.post(
            f"/api/entries/{manual['id']}/episodes",
            json={
                "season_number": 1,
                "episode_number": 1,
                "title": "Manual Ep",
                "air_date": "2026-10-05",
            },
        ).status_code
        == 200
    )
    tmdb = client.post(
        "/api/library/from-provider",
        json={
            "source": "tmdb",
            "source_id": "tv:77",
            "kind": "tv",
            "title": "Keyed Show",
            "status": "in_progress",
            "episodes": [
                {
                    "season_number": 1,
                    "episode_number": 1,
                    "title": "Stored Ep",
                    "air_date": "2026-10-06",
                }
            ],
        },
    )
    assert tmdb.status_code == 200

    failed = client.get("/api/calendar", params={"month": "2026-10"}).json()
    assert by_title(failed, "Old")[0]["date"] == "2026-10-02"
    assert by_title(failed, "Manual Ep")
    assert by_title(failed, "Stored Ep")
    assert failed["partial"] is True
    assert tvmaze_calls == ["42"]
    assert tmdb_calls == []

    mode["tvmaze"] = "ok"
    monkeypatch.setenv("TMDB_API_KEY", "test-key")
    refreshed = client.get("/api/calendar", params={"month": "2026-10"}).json()
    assert by_title(refreshed, "New")[0]["date"] == "2026-10-28"
    assert by_title(refreshed, "From TMDB")[0]["date"] == "2026-10-07"
    assert by_title(refreshed, "Later") == []
    assert by_title(refreshed, "Skip") == []
    assert by_title(refreshed, "Undated episode") == []
    assert "test-key" not in json.dumps(refreshed)
    detail = client.get(f"/api/entries/{maze.json()['id']}").json()["show"]["episodes"]
    newer = next(episode for episode in detail if episode["title"] == "New")
    assert newer["overview"] == "A pilot & more."
    assert tmdb_calls == ["77"]

    calls_after = (len(tvmaze_calls), len(tmdb_calls))
    mode["tvmaze"] = "raise"

    def tmdb_down(_http, _show_id):
        tmdb_calls.append("again")
        raise RuntimeError("tmdb down")

    monkeypatch.setattr("apps.media.backend.services.followups.tmdb_episodes", tmdb_down)
    cached = client.get("/api/calendar", params={"month": "2026-10"}).json()
    assert by_title(cached, "New")
    assert by_title(cached, "From TMDB")
    assert by_title(cached, "Old")
    assert (len(tvmaze_calls), len(tmdb_calls)) == calls_after
    november = client.get("/api/calendar", params={"month": "2026-11"}).json()
    assert by_title(november, "Later")[0]["date"] == "2026-11-02"


def test_follow_up_queries_keep_precision_and_keys_off_the_response(client, monkeypatch):
    monkeypatch.setenv("MEDIA_TODAY", "2026-10-16")
    monkeypatch.setenv("TMDB_API_KEY", "test-key")
    hosts = []

    def handler(request: httpx.Request) -> httpx.Response:
        hosts.append(request.url.host)
        if request.url.host == "query.wikidata.org":
            assert "api_key" not in str(request.url)
            assert 'Say \\"hello\\"' in request.url.params["query"]
            return httpx.Response(
                200,
                json={
                    "results": {
                        "bindings": [
                            {
                                "rel": {"value": "sequel"},
                                "relatedLabel": {"value": "Hello Later"},
                                "date": {"value": "+2026-10-01T00:00:00Z"},
                                "precision": {"value": "10"},
                            },
                            {
                                "rel": {"value": "spinoff"},
                                "relatedLabel": {"value": "Hello Stories"},
                                "date": {"value": "+2026-10-21T00:00:00Z"},
                                "precision": {"value": "11"},
                            },
                            {
                                "rel": {"value": "series"},
                                "relatedLabel": {"value": "Hello Year"},
                                "date": {"value": "+2026-01-01T00:00:00Z"},
                                "precision": {"value": "9"},
                            },
                            {
                                "rel": {"value": "series"},
                                "relatedLabel": {"value": "Hello Prequel"},
                                "date": {"value": "+2010-05-01T00:00:00Z"},
                                "precision": {"value": "11"},
                            },
                            {
                                "rel": {"value": "spinoff"},
                                "relatedLabel": {"value": "Hello Undated"},
                            },
                            {
                                "rel": {"value": "sequel"},
                                "relatedLabel": {"value": 'Say "hello"'},
                                "date": {"value": "+2021-04-01T00:00:00Z"},
                                "precision": {"value": "11"},
                            },
                        ]
                    }
                },
            )
        if request.url.host == "api.themoviedb.org":
            assert request.url.params["api_key"] == "test-key"
            if request.url.path.endswith("/movie/11"):
                return httpx.Response(200, json={"belongs_to_collection": {"id": 5}})
            if request.url.path.endswith("/collection/5"):
                return httpx.Response(
                    200,
                    json={
                        "parts": [
                            {"id": 11, "title": 'Say "hello"', "release_date": "2021-04-01"},
                            {"id": 12, "title": "Hello Again", "release_date": "2026-11-02"},
                            {"id": 13, "title": "Hello Someday", "release_date": ""},
                        ]
                    },
                )
        raise AssertionError(str(request.url))

    real_client = httpx.Client

    class FakeClient:
        def __init__(self, *args, **kwargs):
            self._client = real_client(transport=httpx.MockTransport(handler))

        def get(self, *args, **kwargs):
            return self._client.get(*args, **kwargs)

        def close(self):
            self._client.close()

    monkeypatch.setattr("apps.media.backend.routers.journal.httpx.Client", FakeClient)
    saved = client.post(
        "/api/library/from-provider",
        json={
            "source": "tmdb",
            "source_id": "movie:11",
            "kind": "movie",
            "title": 'Say "hello"',
            "year": 2021,
            "status": "completed",
        },
    )
    assert saved.status_code == 200
    before = client.get("/api/library").json()["items"]
    october = client.get("/api/calendar", params={"month": "2026-10"})
    assert october.status_code == 200
    payload = october.json()
    assert "test-key" not in october.text
    assert "api.tvmaze.com" not in hosts
    later = by_title(payload, "Hello Later")[0]
    assert later["band"] == "month_band"
    assert later["precision"] == "month"
    assert later["on"] is None
    assert later["release_on"] == "2026-10"
    assert "Hello Later" not in titles_on(payload, "2026-10-01")
    assert by_title(payload, "Hello Stories")[0]["date"] == "2026-10-21"
    assert by_title(payload, "Hello Stories")[0]["type"] == "spinoff"
    year = by_title(payload, "Hello Year")[0]
    assert year["band"] == "year_band"
    assert year["precision"] == "year"
    assert year["on"] is None
    assert year["release_on"] == "2026"
    assert by_title(payload, "Hello Prequel") == []
    assert by_title(payload, 'Say "hello"') == []
    someday = by_title(payload, "Hello Someday")[0]
    assert someday["band"] == "unknown"
    assert someday["on"] is None
    calls = len(hosts)
    november = client.get("/api/calendar", params={"month": "2026-11"}).json()
    assert len(hosts) == calls
    assert by_title(november, "Hello Again")[0]["date"] == "2026-11-02"
    assert by_title(november, "Hello Again")[0]["type"] == "sequel"
    assert "Hello Again" not in titles_on(november, "2026-11-01")
    assert by_title(november, "Hello Later") == []
    assert by_title(november, "Hello Undated") == []
    assert by_title(november, "Hello Year")[0]["band"] == "year_band"
    january = client.get("/api/calendar", params={"month": "2026-01"}).json()
    assert "Hello Year" not in titles_on(january, "2026-01-01")
    after = client.get("/api/library").json()["items"]
    assert [item["title"] for item in after] == [item["title"] for item in before]


def test_uncached_follow_ups_finish_on_the_next_view(client, monkeypatch):
    monkeypatch.setenv("MEDIA_TODAY", "2026-10-16")
    calls = []

    def wiki(_http, title, _year):
        calls.append(title)
        return [
            {
                "relation": "sequel",
                "title": f"{title} Returns",
                "year": 2026,
                "precision": "day",
                "released_on": "2026-10-16",
                "source": "wikidata",
                "source_id": None,
            }
        ]

    silence(monkeypatch, wiki=wiki)
    for number in range(1, 10):
        add_movie(client, f"Film {number}", status="completed", year=2000 + number)
    first = client.get("/api/calendar", params={"month": "2026-10"}).json()
    assert first["partial"] is True
    assert len(calls) == 8
    assert len([event for event in all_events(first) if event["title"].endswith("Returns")]) == 8
    second = client.get("/api/calendar", params={"month": "2026-10"}).json()
    assert second["partial"] is False
    assert len(calls) == 9
    returned = {event["title"] for event in all_events(second) if event["type"] == "sequel"}
    assert returned == {f"Film {number} Returns" for number in range(1, 10)}


def test_public_follow_up_parsers_do_not_pin_a_month_to_a_day():
    from apps.media.backend.services.followups import (
        release_from_wikidata,
        tmdb_collection_parts,
        tvmaze_episodes,
    )

    assert release_from_wikidata("+2026-10-01T00:00:00Z", "10")[0] == "month"
    assert release_from_wikidata("+2026-10-21T00:00:00Z", "11") == ("day", "2026-10-21", 2026)
    assert release_from_wikidata("+2026-01-01T00:00:00Z", "9")[0] == "year"
    assert release_from_wikidata("+2026-10-00T00:00:00Z", None)[0] == "month"

    def tvmaze(request: httpx.Request) -> httpx.Response:
        assert request.url.host == "api.tvmaze.com"
        return httpx.Response(
            200,
            json=[
                {
                    "id": 1,
                    "season": 1,
                    "number": 2,
                    "name": "Next",
                    "airdate": "2026-10-20",
                    "airstamp": "2026-10-21T01:00:00Z",
                    "summary": "<p>A <b>teacher</b> &amp; a student.</p>",
                },
                {"id": 2, "season": 1, "number": None, "name": "Special", "airdate": "2026-10-01"},
            ],
        )

    with httpx.Client(transport=httpx.MockTransport(tvmaze)) as http:
        rows = tvmaze_episodes(http, "42")
    assert len(rows) == 1
    assert rows[0]["air_date"] == "2026-10-20"
    assert rows[0]["overview"].startswith("<p>")

    monkeypatch = pytest.MonkeyPatch()
    monkeypatch.setenv("TMDB_API_KEY", "test-key")

    def tmdb(request: httpx.Request) -> httpx.Response:
        assert request.url.params["api_key"] == "test-key"
        if request.url.path.endswith("/movie/11"):
            return httpx.Response(200, json={"belongs_to_collection": {"id": 9}})
        return httpx.Response(
            200,
            json={
                "parts": [
                    {"id": 11, "title": "Original", "release_date": "2021-01-01"},
                    {"id": 12, "title": "Next", "release_date": "2026-10"},
                ]
            },
        )

    try:
        with httpx.Client(transport=httpx.MockTransport(tmdb)) as http:
            parts = tmdb_collection_parts(http, "11")
    finally:
        monkeypatch.undo()
    assert [part["title"] for part in parts] == ["Next"]
    assert parts[0]["precision"] == "month"
    assert parts[0]["released_on"] == "2026-10-01"
    assert "test-key" not in json.dumps(parts)
