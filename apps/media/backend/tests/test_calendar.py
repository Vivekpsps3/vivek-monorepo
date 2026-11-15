"""Calendar rules. These tests do not call live metadata providers."""

import json


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
        },
    )
    assert maze.status_code == 200
    assert (
        client.post(
            f"/api/entries/{maze.json()['id']}/episodes",
            json={
                "season_number": 1,
                "episode_number": 1,
                "title": "Old",
                "air_date": "2026-10-02",
            },
        ).status_code
        == 200
    )
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
        },
    )
    assert tmdb.status_code == 200
    assert (
        client.post(
            f"/api/entries/{tmdb.json()['id']}/episodes",
            json={
                "season_number": 1,
                "episode_number": 1,
                "title": "Stored Ep",
                "air_date": "2026-10-06",
            },
        ).status_code
        == 200
    )

    failed = client.post("/api/calendar/refresh", params={"month": "2026-10"}).json()
    assert by_title(failed, "Old")[0]["date"] == "2026-10-02"
    assert by_title(failed, "Manual Ep")
    assert by_title(failed, "Stored Ep")
    assert failed["partial"] is True
    assert tvmaze_calls == ["42"]
    assert tmdb_calls == []

    mode["tvmaze"] = "ok"
    monkeypatch.setenv("TMDB_API_KEY", "test-key")
    refreshed = client.post("/api/calendar/refresh", params={"month": "2026-10"}).json()
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
    cached = client.post("/api/calendar/refresh", params={"month": "2026-10"}).json()
    assert by_title(cached, "New")
    assert by_title(cached, "From TMDB")
    assert by_title(cached, "Old")
    assert (len(tvmaze_calls), len(tmdb_calls)) == calls_after
    november = client.post("/api/calendar/refresh", params={"month": "2026-11"}).json()
    assert by_title(november, "Later")[0]["date"] == "2026-11-02"
