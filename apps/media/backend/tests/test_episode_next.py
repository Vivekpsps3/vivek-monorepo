"""Mark the next aired episode once, and name the one that changed."""

import pytest
from fastapi import HTTPException

from apps.media.backend.models import EpisodeProgress, UserEntry
from apps.media.backend.services import records
from apps.media.backend.services.episode_next import mark_next_checked

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
