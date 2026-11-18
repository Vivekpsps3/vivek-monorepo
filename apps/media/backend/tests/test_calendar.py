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


def test_saved_reads_share_one_calendar_and_a_month_is_not_a_day(client, monkeypatch):
    monkeypatch.setenv("MEDIA_TODAY", "2026-11-18")
    monkeypatch.delenv("TMDB_API_KEY", raising=False)
    wiki: list[str] = []
    tmdb: list[str] = []

    def wiki_related(*_args, **_kwargs):
        wiki.append("wiki")
        return []

    def tmdb_parts(*_args, **_kwargs):
        tmdb.append("tmdb")
        return []

    silence(monkeypatch, wiki=wiki_related, parts=tmdb_parts)
    add_movie(
        client,
        "Paper Month",
        status="anticipating",
        anticipated=True,
        release_on="2026-11-20",
        release_precision="month",
        release_status="scheduled",
    )
    add_movie(
        client,
        "Year Lantern",
        status="anticipating",
        anticipated=True,
        release_on="2026-05-02",
        release_precision="year",
    )
    add_movie(client, "Undated Reel", status="anticipating", anticipated=True)
    add_movie(
        client,
        "Night Screening",
        status="anticipating",
        anticipated=True,
        release_on="2026-11-28",
        release_precision="day",
    )
    add_movie(client, "Seen Reel", status="completed")
    saved = client.post(
        "/api/library/from-provider",
        json={
            "source": "tmdb",
            "source_id": "movie:88",
            "kind": "movie",
            "title": "Keyed Film",
            "status": "want",
        },
    )
    assert saved.status_code == 200, saved.text

    first = client.get("/api/calendar", params={"month": "2026-11"}).json()
    second = client.get("/api/calendar", params={"month": "2026-11"}).json()
    assert wiki == []
    assert tmdb == []
    assert first["partial"] is False
    assert second == first
    paper = by_title(first, "Paper Month")[0]
    assert paper["band"] == "month_band"
    assert paper["release_on"] == "2026-11"
    assert paper["on"] is None
    assert "2026-11-01" not in json.dumps(first)
    year = by_title(first, "Year Lantern")[0]
    assert year["band"] == "year_band"
    assert year["release_on"] == "2026"
    assert year["on"] is None
    unknown = by_title(first, "Undated Reel")[0]
    assert unknown["band"] == "unknown"
    assert unknown["release_on"] is None
    assert by_title(first, "Night Screening")[0]["date"] == "2026-11-28"
    assert first["unconfigured"] == ["tmdb"]

    refreshed = client.post("/api/calendar/refresh", params={"month": "2026-11"}).json()
    assert wiki == ["wiki"]
    assert tmdb == []
    assert refreshed["partial"] is False
    assert by_title(refreshed, "Paper Month")[0]["release_on"] == "2026-11"
    assert "2026-11-01" not in json.dumps(refreshed)
    follow = client.get("/api/calendar", params={"month": "2026-11"}).json()
    assert wiki == ["wiki"]
    assert tmdb == []
    assert follow["unconfigured"] == ["tmdb"]
    assert by_title(follow, "Paper Month")[0]["release_on"] == "2026-11"


def _lifecycle(client, entry_id: int, state: str) -> None:
    from sqlalchemy import text

    from apps.media.backend.models import SeriesLifecycle

    database = client.app.state.database
    with database.sessionmaker() as session:
        catalog_id = session.execute(
            text("SELECT catalog_id FROM user_entries WHERE id = :id"),
            {"id": entry_id},
        ).scalar()
        session.add(
            SeriesLifecycle(catalog_id=catalog_id, lifecycle=state, completeness="complete")
        )
        session.commit()


def _episode(client, entry_id: int, season: int, episode: int, title: str, air_date: str) -> None:
    response = client.post(
        f"/api/entries/{entry_id}/episodes",
        json={
            "season_number": season,
            "episode_number": episode,
            "title": title,
            "air_date": air_date,
        },
    )
    assert response.status_code == 200, response.text


def test_now_reuses_the_series_continuation(client, monkeypatch):
    monkeypatch.setenv("MEDIA_TODAY", "2026-11-18")
    ongoing = add_movie(client, "Harbor Signal", kind="tv", status="completed")
    _episode(client, ongoing["id"], 1, 1, "Pilot", "2020-01-01")
    _episode(client, ongoing["id"], 2, 1, "Later", "2099-01-01")
    marked = client.post(f"/api/entries/{ongoing['id']}/episodes/next", json={})
    assert marked.status_code == 200, marked.text
    _lifecycle(client, ongoing["id"], "ongoing")

    ended = add_movie(client, "Last Reel", kind="tv", status="completed")
    _episode(client, ended["id"], 1, 1, "Finale", "2020-02-01")
    _episode(client, ended["id"], 3, 1, "Someday", "2099-06-01")
    caught = client.post(f"/api/entries/{ended['id']}/episodes/next", json={})
    assert caught.status_code == 200, caught.text
    _lifecycle(client, ended["id"], "ended")

    watching = add_movie(client, "Glass Hour", kind="tv", status="in_progress")
    _episode(client, watching["id"], 1, 1, "Open", "2020-03-01")

    summary = client.get("/api/summary").json()
    titles = [row["show_title"] for row in summary["next_episodes"]]
    assert "Harbor Signal" in titles
    assert "Last Reel" not in titles
    harbor = next(row for row in summary["next_episodes"] if row["show_title"] == "Harbor Signal")
    assert harbor["state"] == "upcoming"
    assert harbor["season"] == 2
    assert harbor["episode"] == 1
    assert harbor["air_date"] == "2099-01-01"
    card = next(item for item in summary["currently"] if item["title"] == "Glass Hour")
    assert card["continuation"]["state"] == "next"
    assert card["continuation"]["episode"] == 1
    assert card["caught_up"] is False
