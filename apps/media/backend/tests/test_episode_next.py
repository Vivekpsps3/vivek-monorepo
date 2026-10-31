"""Mark the next aired episode once, and name the one that changed."""

from concurrent.futures import ThreadPoolExecutor
from threading import Barrier

import pytest
from fastapi import HTTPException
from sqlalchemy import event

from apps.media.backend.models import EpisodeProgress, UserEntry
from apps.media.backend.services import records
from apps.media.backend.services.episode_next import mark_next_checked
from apps.server.auth import Principal, require_principal

TODAY = "2026-10-26"


def _create(client, kind="tv", title="Serial"):
    response = client.post(
        "/api/library",
        json={"kind": kind, "title": title, "status": "in_progress"},
    )
    assert response.status_code == 200, response.text
    return response.json()


def _show(client, episodes, title="Serial"):
    saved = _create(client, title=title)
    for episode in episodes:
        added = client.post(f"/api/entries/{saved['id']}/episodes", json=episode)
        assert added.status_code == 200, added.text
    detail = client.get(f"/api/entries/{saved['id']}")
    assert detail.status_code == 200, detail.text
    return detail.json()


def _session(client):
    return client.app.state.database.sessionmaker()


def _entry(db, entry_id):
    entry = db.get(UserEntry, entry_id)
    assert entry is not None
    return entry


def _watched_count(db, user_id):
    rows = db.query(EpisodeProgress).filter(EpisodeProgress.user_id == user_id).all()
    return sum(1 for row in rows if row.watched)


def _aired(count):
    return [
        {
            "season_number": 1,
            "episode_number": number,
            "title": f"Episode {number}",
            "air_date": f"2026-10-0{number}",
        }
        for number in range(1, count + 1)
    ]


def _break_provider_lookups(monkeypatch):
    import inspect

    from apps.media.backend.services import providers

    def boom(*_args, **_kwargs):
        raise AssertionError("provider lookup was called")

    for name, value in vars(providers).items():
        if not inspect.isfunction(value) or value.__module__ != providers.__name__:
            continue
        if (
            "lookup" in name
            or name.endswith("_search")
            or name.endswith("_detail")
            or name in {"search", "popular_movies"}
        ):
            monkeypatch.setattr(providers, name, boom)


def test_mark_next_checked_names_the_aired_episode_and_skips_specials(client, monkeypatch):
    monkeypatch.setenv("MEDIA_TODAY", TODAY)
    saved = _show(
        client,
        [
            {
                "season_number": 0,
                "episode_number": 1,
                "title": "Special",
                "air_date": "2026-09-01",
            },
            {"season_number": 2, "episode_number": 4, "air_date": "2026-10-01"},
            {
                "season_number": 2,
                "episode_number": 5,
                "title": "After",
                "air_date": "2026-10-02",
            },
        ],
    )
    target = next(
        episode
        for episode in saved["show"]["episodes"]
        if episode["season_number"] == 2 and episode["episode_number"] == 4
    )
    db = _session(client)
    try:
        entry = _entry(db, saved["id"])
        state, marked = mark_next_checked(db, entry.user_id, entry, None)
        assert marked == {
            "episode_id": target["id"],
            "season_number": 2,
            "episode_number": 4,
            "title": None,
            "label": "S2E4",
        }
        assert state["watched_count"] == 1
        assert state["next_episode"]["season_number"] == 2
        assert state["next_episode"]["episode_number"] == 5
        special = next(episode for episode in state["episodes"] if episode["season_number"] == 0)
        assert special["watched"] is False
    finally:
        db.close()


def test_mark_next_checked_accepts_a_matching_expected_id(client, monkeypatch):
    monkeypatch.setenv("MEDIA_TODAY", TODAY)
    saved = _show(
        client,
        [
            {"season_number": 1, "episode_number": 1, "title": "Pilot", "air_date": "2026-10-01"},
            {"season_number": 1, "episode_number": 2, "title": "Second", "air_date": "2026-10-02"},
        ],
    )
    nxt = saved["show"]["next_episode"]
    db = _session(client)
    try:
        entry = _entry(db, saved["id"])
        _state, marked = mark_next_checked(db, entry.user_id, entry, nxt["id"])
        assert marked["episode_id"] == nxt["id"]
        assert marked["label"] == "S1E1"
        assert marked["title"] == "Pilot"
    finally:
        db.close()


def test_mark_next_checked_rejects_a_stale_expected_id_without_writing(client, monkeypatch):
    monkeypatch.setenv("MEDIA_TODAY", TODAY)
    saved = _show(
        client,
        [
            {"season_number": 1, "episode_number": 1, "title": "Pilot", "air_date": "2026-10-01"},
            {"season_number": 1, "episode_number": 2, "title": "Second", "air_date": "2026-10-02"},
        ],
    )
    first = saved["show"]["next_episode"]
    second = next(
        episode for episode in saved["show"]["episodes"] if episode["episode_number"] == 2
    )
    db = _session(client)
    try:
        entry = _entry(db, saved["id"])
        _state, marked = mark_next_checked(db, entry.user_id, entry, first["id"])
        updated = entry.updated_at
        with pytest.raises(HTTPException) as caught:
            mark_next_checked(db, entry.user_id, entry, marked["episode_id"])
        assert caught.value.status_code == 409
        assert (
            caught.value.detail == "That episode is no longer next. Refresh to see your progress."
        )
        assert entry.updated_at == updated
        fresh = records.episode_state(db, entry.user_id, entry.catalog)
        assert fresh["watched_count"] == 1
        assert fresh["next_episode"]["id"] == second["id"]
        assert _watched_count(db, entry.user_id) == 1
    finally:
        db.close()


def test_mark_next_checked_caught_up_is_409(client, monkeypatch):
    monkeypatch.setenv("MEDIA_TODAY", TODAY)
    saved = _show(
        client,
        [
            {"season_number": 1, "episode_number": 1, "title": "Later", "air_date": "2026-12-01"},
        ],
    )
    db = _session(client)
    try:
        entry = _entry(db, saved["id"])
        with pytest.raises(HTTPException) as caught:
            mark_next_checked(db, entry.user_id, entry, None)
        assert caught.value.status_code == 409
        assert caught.value.detail == "Add episodes, or you are already caught up."
        assert _watched_count(db, entry.user_id) == 0
    finally:
        db.close()


def test_mark_next_checked_non_tv_is_422(client):
    db = _session(client)
    try:
        for kind in ("movie", "book"):
            saved = _create(client, kind=kind, title=kind)
            entry = _entry(db, saved["id"])
            with pytest.raises(HTTPException) as caught:
                mark_next_checked(db, entry.user_id, entry, None)
            assert caught.value.status_code == 422
            assert caught.value.detail == "Episode progress is for shows."
    finally:
        db.close()


def test_mark_next_checked_missing_episode_is_not_found(client, monkeypatch):
    monkeypatch.setenv("MEDIA_TODAY", TODAY)
    saved = _show(
        client,
        [
            {"season_number": 1, "episode_number": 1, "title": "Pilot", "air_date": "2026-10-01"},
        ],
    )
    monkeypatch.setattr(
        "apps.media.backend.services.episode_next.records.episode_state",
        lambda *_args, **_kwargs: {
            "next_episode": {
                "id": 9_999_999,
                "season_number": 9,
                "episode_number": 9,
                "title": "Gone",
            }
        },
    )
    db = _session(client)
    try:
        entry = _entry(db, saved["id"])
        with pytest.raises(HTTPException) as caught:
            mark_next_checked(db, entry.user_id, entry, None)
        assert caught.value.status_code == 404
        assert caught.value.detail == "That item is not in your library."
        assert _watched_count(db, entry.user_id) == 0
    finally:
        db.close()


def test_next_without_body_marks_and_reports_marked(client, monkeypatch):
    monkeypatch.setenv("MEDIA_TODAY", TODAY)
    saved = _show(client, _aired(2))
    response = client.post(f"/api/entries/{saved['id']}/episodes/next")
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["marked"]["label"] == "S1E1"
    assert body["marked"]["season_number"] == 1
    assert body["marked"]["episode_number"] == 1
    assert body["marked"]["title"] == "Episode 1"
    nxt = body["show"]["next_episode"]
    assert nxt["season_number"] == 1
    assert nxt["episode_number"] == 2


def test_next_accepts_empty_and_null_expected(client, monkeypatch):
    monkeypatch.setenv("MEDIA_TODAY", TODAY)
    saved = _show(client, _aired(5))
    path = f"/api/entries/{saved['id']}/episodes/next"
    responses = [
        client.post(path),
        client.post(path, json={}),
        client.post(path, json={"expected_episode_id": None}),
        client.post(path, content=b"null", headers={"Content-Type": "application/json"}),
        client.post(path, content=b"", headers={"Content-Type": "application/json"}),
    ]
    assert [response.status_code for response in responses] == [200, 200, 200, 200, 200]
    assert [response.json()["marked"]["label"] for response in responses] == [
        "S1E1",
        "S1E2",
        "S1E3",
        "S1E4",
        "S1E5",
    ]


def test_next_with_matching_expected_marks(client, monkeypatch):
    monkeypatch.setenv("MEDIA_TODAY", TODAY)
    saved = _show(client, _aired(2))
    nxt = saved["show"]["next_episode"]
    response = client.post(
        f"/api/entries/{saved['id']}/episodes/next",
        json={"expected_episode_id": nxt["id"]},
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["marked"]["episode_id"] == nxt["id"]
    assert body["marked"]["label"] == "S1E1"
    assert body["show"]["watched_count"] == 1
    assert body["show"]["next_episode"]["episode_number"] == 2


def test_next_with_stale_expected_is_409_and_writes_nothing(client, monkeypatch):
    monkeypatch.setenv("MEDIA_TODAY", TODAY)
    saved = _show(client, _aired(2))
    path = f"/api/entries/{saved['id']}/episodes/next"
    first = client.post(path, json={"expected_episode_id": saved["show"]["next_episode"]["id"]})
    assert first.status_code == 200, first.text
    marked_id = first.json()["marked"]["episode_id"]
    nxt = first.json()["show"]["next_episode"]
    stale = client.post(path, json={"expected_episode_id": marked_id})
    assert stale.status_code == 409
    assert stale.json()["detail"] == "That episode is no longer next. Refresh to see your progress."
    progress = client.get(f"/api/entries/{saved['id']}").json()["show"]
    watched = [episode for episode in progress["episodes"] if episode["watched"]]
    assert [episode["id"] for episode in watched] == [marked_id]
    assert progress["watched_count"] == 1
    assert progress["next_episode"]["id"] == nxt["id"]


def test_next_rejects_non_int_expected_422(client, monkeypatch):
    monkeypatch.setenv("MEDIA_TODAY", TODAY)
    saved = _show(client, _aired(2))
    path = f"/api/entries/{saved['id']}/episodes/next"
    before = client.get(f"/api/entries/{saved['id']}").json()["show"]
    for bad in ("12", True, False):
        response = client.post(path, json={"expected_episode_id": bad})
        assert response.status_code == 422
        assert response.json()["detail"] == "Expected episode must be a number."
    after = client.get(f"/api/entries/{saved['id']}").json()["show"]
    assert after["watched_count"] == before["watched_count"] == 0
    assert after["next_episode"]["id"] == before["next_episode"]["id"]


def test_next_caught_up_is_409_existing_copy(client, monkeypatch):
    monkeypatch.setenv("MEDIA_TODAY", TODAY)
    saved = _show(
        client,
        [{"season_number": 1, "episode_number": 1, "title": "Later", "air_date": "2026-12-01"}],
    )
    response = client.post(f"/api/entries/{saved['id']}/episodes/next")
    assert response.status_code == 409
    assert response.json()["detail"] == "Add episodes, or you are already caught up."
    progress = client.get(f"/api/entries/{saved['id']}").json()["show"]
    assert progress["watched_count"] == 0
    assert progress["episodes"][0]["watched"] is False


def test_next_non_tv_is_422(client):
    for kind in ("movie", "book"):
        saved = _create(client, kind=kind, title=kind)
        response = client.post(f"/api/entries/{saved['id']}/episodes/next")
        assert response.status_code == 422
        assert response.json()["detail"] == "Episode progress is for shows."


def test_next_skips_specials_and_unaired(client, monkeypatch):
    monkeypatch.setenv("MEDIA_TODAY", TODAY)
    saved = _show(
        client,
        [
            {
                "season_number": 0,
                "episode_number": 1,
                "title": "Special",
                "air_date": "2026-09-01",
            },
            {
                "season_number": 1,
                "episode_number": 1,
                "title": "Pilot",
                "air_date": "2026-10-01",
            },
            {
                "season_number": 1,
                "episode_number": 2,
                "title": "Later",
                "air_date": "2026-12-01",
            },
        ],
    )
    path = f"/api/entries/{saved['id']}/episodes/next"
    response = client.post(path)
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["marked"]["label"] == "S1E1"
    episodes = {episode["id"]: episode for episode in body["show"]["episodes"]}
    special = next(episode for episode in episodes.values() if episode["season_number"] == 0)
    future = next(
        episode
        for episode in episodes.values()
        if episode["season_number"] == 1 and episode["episode_number"] == 2
    )
    assert special["watched"] is False
    assert future["watched"] is False
    assert body["show"]["next_episode"] is None
    caught_up = client.post(path)
    assert caught_up.status_code == 409
    assert caught_up.json()["detail"] == "Add episodes, or you are already caught up."
    progress = client.get(f"/api/entries/{saved['id']}").json()["show"]
    assert progress["watched_count"] == 1


def test_undo_by_unwatching_marked_episode_restores_state(client, monkeypatch):
    monkeypatch.setenv("MEDIA_TODAY", TODAY)
    saved = _show(client, _aired(2))
    entry = f"/api/entries/{saved['id']}"
    before = client.get(entry).json()["show"]["watched_count"]
    marked = client.post(entry + "/episodes/next")
    assert marked.status_code == 200, marked.text
    episode_id = marked.json()["marked"]["episode_id"]
    cleared = client.post(entry + f"/episodes/{episode_id}/watched", json={"watched": False})
    assert cleared.status_code == 200, cleared.text
    show = cleared.json()["show"]
    assert show["next_episode"]["id"] == episode_id
    assert show["watched_count"] == before


def test_summary_next_episodes_advances_after_mark(client, monkeypatch):
    monkeypatch.setenv("MEDIA_TODAY", TODAY)
    saved = _show(client, _aired(2))
    before = client.get("/api/summary").json()["next_episodes"]
    prior = next(item for item in before if item["entry_id"] == saved["id"])
    assert prior["season"] == 1
    assert prior["episode"] == 1
    marked = client.post(f"/api/entries/{saved['id']}/episodes/next")
    assert marked.status_code == 200, marked.text
    after = client.get("/api/summary").json()["next_episodes"]
    row = next(item for item in after if item["entry_id"] == saved["id"])
    assert row["season"] == 1
    assert row["episode"] == 2
    assert row["episode_id"] == marked.json()["show"]["next_episode"]["id"]
    assert row["state"] == "next"


def test_next_is_owner_scoped(client, monkeypatch):
    monkeypatch.setenv("MEDIA_TODAY", TODAY)
    saved = _show(client, _aired(2))
    nxt_id = saved["show"]["next_episode"]["id"]
    path = f"/api/entries/{saved['id']}/episodes/next"
    client.app.dependency_overrides[require_principal] = lambda: Principal(2, "other", "Other")
    denied = client.post(path, json={"expected_episode_id": nxt_id})
    assert denied.status_code == 404
    assert denied.json()["detail"] == "That item is not in your library."
    client.app.dependency_overrides[require_principal] = lambda: Principal(1, "tester", "Tester")
    progress = client.get(f"/api/entries/{saved['id']}").json()["show"]
    assert progress["watched_count"] == 0
    assert progress["next_episode"]["id"] == nxt_id


def test_next_makes_no_provider_calls(client, monkeypatch):
    monkeypatch.setenv("MEDIA_TODAY", TODAY)
    saved = _show(client, _aired(2))
    _break_provider_lookups(monkeypatch)
    response = client.post(f"/api/entries/{saved['id']}/episodes/next")
    assert response.status_code == 200, response.text
    assert response.json()["marked"]["label"] == "S1E1"


def test_concurrent_next_returns_success_and_conflict(client, monkeypatch):
    monkeypatch.setenv("MEDIA_TODAY", TODAY)
    saved = _show(client, _aired(2))
    expected_id = saved["show"]["next_episode"]["id"]
    barrier = Barrier(2, timeout=10)
    database = client.app.state.database
    rollbacks = []

    def wait_before_insert(db, _context, _instances):
        if any(isinstance(row, EpisodeProgress) for row in db.new):
            # Both requests must select the same missing progress row before either inserts.
            barrier.wait()

    def record_rollback(db, _transaction):
        if db.is_active:
            rollbacks.append(db)

    def mark():
        return client.post(
            f"/api/entries/{saved['id']}/episodes/next",
            json={"expected_episode_id": expected_id},
        )

    event.listen(database.sessionmaker, "before_flush", wait_before_insert)
    event.listen(database.sessionmaker, "after_soft_rollback", record_rollback)
    try:
        with ThreadPoolExecutor(max_workers=2) as pool:
            responses = list(pool.map(lambda _: mark(), range(2)))
    finally:
        event.remove(database.sessionmaker, "before_flush", wait_before_insert)
        event.remove(database.sessionmaker, "after_soft_rollback", record_rollback)
    assert sorted(response.status_code for response in responses) == [200, 409]
    conflict = next(response for response in responses if response.status_code == 409)
    assert conflict.json() == {
        "detail": "That episode is no longer next. Refresh to see your progress."
    }
    assert len(rollbacks) == 1
    with _session(client) as db:
        rows = db.query(EpisodeProgress).all()
        assert len(rows) == 1
        assert rows[0].episode_id == expected_id
        assert rows[0].watched is True
    progress = client.get(f"/api/entries/{saved['id']}").json()["show"]
    assert progress["watched_count"] == 1
    assert progress["next_episode"]["episode_number"] == 2
