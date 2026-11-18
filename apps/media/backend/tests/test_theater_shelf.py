"""Movie viewing dates stay recorded facts. Series continuation stays episode truth."""

from sqlalchemy import text

from apps.server.auth import Principal, require_principal


def _completed_on(client, entry_id):
    database = client.app.state.database
    with database.sessionmaker() as session:
        return session.execute(
            text("SELECT completed_on FROM user_entries WHERE id = :id"),
            {"id": entry_id},
        ).scalar()


def _experience_dates(client, entry_id):
    database = client.app.state.database
    with database.sessionmaker() as session:
        return session.execute(
            text("SELECT kind, finished_on FROM experiences WHERE entry_id = :id ORDER BY id"),
            {"id": entry_id},
        ).all()


def _library_item(client, kind, title):
    page = client.get("/api/library", params={"kind": kind, "sort": "title"}).json()
    return next(item for item in page["items"] if item["title"] == title)


def test_watched_and_planned_films_do_not_invent_a_viewing_date(client, monkeypatch):
    monkeypatch.setenv("MEDIA_TODAY", "2026-10-01")
    watched = client.post(
        "/api/library",
        json={"kind": "movie", "title": "Paper Lantern", "status": "completed"},
    )
    assert watched.status_code == 200, watched.text
    assert "completed_on" not in watched.text
    assert watched.json()["viewed_on"] is None
    watched_id = watched.json()["id"]
    assert str(_completed_on(client, watched_id))[:10] == "2026-10-01"
    assert _experience_dates(client, watched_id) == []
    assert _library_item(client, "movie", "Paper Lantern")["viewed_on"] is None

    recorded = client.patch(f"/api/entries/{watched_id}", json={"viewed_on": "2024-03-02"})
    assert recorded.status_code == 200, recorded.text
    assert recorded.json()["viewed_on"] == "2024-03-02"
    assert recorded.json()["status"] == "completed"
    assert "completed_on" not in recorded.text
    assert str(_completed_on(client, watched_id))[:10] == "2026-10-01"
    assert _library_item(client, "movie", "Paper Lantern")["viewed_on"] == "2024-03-02"

    same = client.patch(f"/api/entries/{watched_id}", json={"viewed_on": "2024-03-02"})
    assert same.status_code == 200, same.text
    assert len(_experience_dates(client, watched_id)) == 1

    cleared = client.patch(f"/api/entries/{watched_id}", json={"viewed_on": None})
    assert cleared.status_code == 200, cleared.text
    assert cleared.json()["viewed_on"] is None
    assert _library_item(client, "movie", "Paper Lantern")["viewed_on"] is None
    assert _experience_dates(client, watched_id)[0][1] is None

    planned = client.post(
        "/api/library", json={"kind": "movie", "title": "Unscreened", "status": "want"}
    )
    assert planned.status_code == 200, planned.text
    planned_id = planned.json()["id"]
    assert planned.json()["viewed_on"] is None
    assert _completed_on(client, planned_id) is None
    dated = client.patch(f"/api/entries/{planned_id}", json={"viewed_on": "2024-01-15"})
    assert dated.json()["status"] == "want"
    assert dated.json()["viewed_on"] == "2024-01-15"
    assert _completed_on(client, planned_id) is None
    card = _library_item(client, "movie", "Unscreened")
    assert card["status"] == "want"
    assert card["viewed_on"] == "2024-01-15"

    rejected = client.patch(f"/api/entries/{watched_id}", json={"viewed_on": "tomorrow"})
    assert rejected.status_code == 422
    assert client.get(f"/api/entries/{watched_id}").json()["viewed_on"] is None

    promoted = client.post(
        "/api/library",
        json={"kind": "movie", "title": "Undated Screening", "status": "want"},
    )
    assert promoted.status_code == 200, promoted.text
    promoted_id = promoted.json()["id"]
    finished = client.patch(f"/api/entries/{promoted_id}", json={"status": "completed"})
    assert finished.status_code == 200, finished.text
    assert finished.json()["viewed_on"] is None
    assert "completed_on" not in finished.text
    assert str(_completed_on(client, promoted_id))[:10] == "2026-10-01"
    assert _experience_dates(client, promoted_id) == []

    book = client.post(
        "/api/library",
        json={"kind": "book", "title": "Margin Notes", "status": "want"},
    )
    book_id = book.json()["id"]
    denied = client.patch(
        f"/api/entries/{book_id}",
        json={"viewed_on": "2024-03-02", "status": "completed"},
    )
    assert denied.status_code == 422
    saved_book = client.get(f"/api/entries/{book_id}").json()
    assert saved_book["status"] == "want"
    assert "viewed_on" not in saved_book

    client.app.dependency_overrides[require_principal] = lambda: Principal(2, "other", "Other")
    foreign = client.patch(f"/api/entries/{planned_id}", json={"viewed_on": "2020-01-01"})
    assert foreign.status_code == 404
    client.app.dependency_overrides[require_principal] = lambda: Principal(1, "tester", "Tester")
    assert client.get(f"/api/entries/{planned_id}").json()["viewed_on"] == "2024-01-15"


def _show(client, title, lifecycle, episodes):
    created = client.post(
        "/api/library",
        json={
            "kind": "tv",
            "title": title,
            "status": "in_progress",
            "extra": {"lifecycle": lifecycle},
        },
    )
    assert created.status_code == 200, created.text
    entry_id = created.json()["id"]
    for episode in episodes:
        saved = client.post(f"/api/entries/{entry_id}/episodes", json=episode)
        assert saved.status_code == 200, saved.text
    return entry_id


def test_caught_up_ongoing_show_regains_the_next_episode(client, monkeypatch):
    monkeypatch.setenv("MEDIA_TODAY", "2026-11-01")
    entry_id = _show(
        client,
        "Lantern Hour",
        "ongoing",
        [{"season_number": 1, "episode_number": 1, "title": "Pilot", "air_date": "2026-10-01"}],
    )
    assert client.get(f"/api/entries/{entry_id}").json()["lifecycle"]["state"] == "ongoing"
    assert client.post(f"/api/entries/{entry_id}/episodes/next").status_code == 200
    caught = _library_item(client, "tv", "Lantern Hour")
    assert caught["caught_up"] is True
    assert caught["lifecycle"]["state"] == "ongoing"
    assert caught["continuation"] is None
    assert caught["watched_count"] == 1

    waiting = client.post(
        f"/api/entries/{entry_id}/episodes",
        json={"season_number": 1, "episode_number": 2, "title": "Later", "air_date": "2099-01-01"},
    )
    assert waiting.status_code == 200, waiting.text
    upcoming = _library_item(client, "tv", "Lantern Hour")
    assert upcoming["caught_up"] is True
    assert upcoming["continuation"]["state"] == "upcoming"
    assert upcoming["continuation"]["episode"] == 2
    assert upcoming["lifecycle"]["state"] == "ongoing"

    aired = client.post(
        f"/api/entries/{entry_id}/episodes",
        json={"season_number": 1, "episode_number": 3, "title": "Return", "air_date": "2026-11-01"},
    )
    assert aired.status_code == 200, aired.text
    again = _library_item(client, "tv", "Lantern Hour")
    assert again["caught_up"] is False
    assert again["continuation"]["state"] == "next"
    assert again["continuation"]["season"] == 1
    assert again["continuation"]["episode"] == 3
    assert again["lifecycle"]["state"] == "ongoing"
    assert again["lifecycle"]["raw_value"] == "ongoing"

    failed = client.post(
        f"/api/entries/{entry_id}/episodes/next",
        json={"expected_episode_id": upcoming["continuation"]["episode_id"]},
    )
    assert failed.status_code == 409
    held = _library_item(client, "tv", "Lantern Hour")
    assert held["continuation"]["episode"] == 3
    assert held["watched_count"] == 1


def test_empty_ended_and_planned_series_keep_lifecycle_off_the_episode(client, monkeypatch):
    monkeypatch.setenv("MEDIA_TODAY", "2026-11-01")
    empty_id = _show(client, "Quiet Reel", "ended", [])
    empty = _library_item(client, "tv", "Quiet Reel")
    assert empty["episode_count"] == 0
    assert empty["caught_up"] is False
    assert empty["continuation"] is None
    assert empty["lifecycle"]["state"] == "ended"
    assert client.get(f"/api/entries/{empty_id}").json()["lifecycle"]["state"] == "ended"

    ended_id = _show(
        client,
        "Last Reel",
        "Ended",
        [{"season_number": 1, "episode_number": 1, "title": "Finale", "air_date": "2026-10-01"}],
    )
    assert client.post(f"/api/entries/{ended_id}/episodes/next").status_code == 200
    ended = _library_item(client, "tv", "Last Reel")
    assert ended["caught_up"] is True
    assert ended["lifecycle"]["state"] == "ended"
    assert ended["continuation"] is None

    planned_id = _show(client, "Blueprint", "planned", [])
    planned = client.get(f"/api/entries/{planned_id}").json()["lifecycle"]
    assert planned["state"] == "ongoing"
    assert planned["raw_value"] == "planned"
    film = client.post(
        "/api/library",
        json={"kind": "movie", "title": "Not a show", "extra": {"lifecycle": "ended"}},
    )
    assert film.status_code == 200, film.text
    assert film.json()["lifecycle"] is None
