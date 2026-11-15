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


def _raw_post(client, path, raw):
    if raw is None:
        return client.post(path)
    return client.post(path, content=raw, headers={"Content-Type": "application/json"})


_RAW_BODIES = (None, b'"12"', b"true", b"987654")


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
    remarked = client.post(entry + "/episodes/next")
    assert remarked.status_code == 200, remarked.text
    assert remarked.json()["marked"]["episode_id"] == episode_id
    assert remarked.json()["show"]["watched_count"] == before + 1


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


@pytest.mark.parametrize("existing_unwatched", [False, True])
def test_next_conflicts_when_winner_commits_between_check_and_write(
    client, monkeypatch, existing_unwatched
):
    from apps.media.backend.services import episode_next

    monkeypatch.setenv("MEDIA_TODAY", TODAY)
    saved = _show(client, _aired(2))
    expected_id = saved["show"]["next_episode"]["id"]
    path = f"/api/entries/{saved['id']}/episodes/next"
    if existing_unwatched:
        cleared = client.post(
            f"/api/entries/{saved['id']}/episodes/{expected_id}/watched", json={"watched": False}
        )
        assert cleared.status_code == 200
    original_today = episode_next.today
    winners = []

    def commit_winner_before_write():
        # A has checked next. B commits in its own request/session before A writes.
        monkeypatch.setattr(episode_next, "today", original_today)
        winners.append(client.post(path, json={"expected_episode_id": expected_id}))
        return original_today()

    monkeypatch.setattr(episode_next, "today", commit_winner_before_write)
    loser = client.post(path, json={"expected_episode_id": expected_id})
    assert [response.status_code for response in winners] == [200]
    assert winners[0].json()["marked"]["episode_id"] == expected_id
    assert loser.status_code == 409, loser.text
    assert loser.json() == {
        "detail": "That episode is no longer next. Refresh to see your progress."
    }
    with _session(client) as db:
        rows = db.query(EpisodeProgress).all()
        assert len(rows) == 1
        assert rows[0].episode_id == expected_id
        assert rows[0].watched is True
    show = client.get(f"/api/entries/{saved['id']}").json()["show"]
    assert show["watched_count"] == 1
    assert show["next_episode"]["episode_number"] == 2


@pytest.mark.parametrize("kind", ["tv", "movie"])
@pytest.mark.parametrize("expected", ["12", True, 987654, None])
def test_foreign_next_matches_unknown_before_validation(client, monkeypatch, kind, expected):
    saved = _create(client, kind=kind)
    client.app.dependency_overrides[require_principal] = lambda: Principal(2, "other", "Other")

    def must_not_mark(*_args, **_kwargs):
        raise AssertionError("mark_next_checked must not run for foreign or unknown entries")

    monkeypatch.setattr("apps.media.backend.services.episode_next.mark_next_checked", must_not_mark)
    kwargs = {} if expected is None else {"json": {"expected_episode_id": expected}}
    unknown = client.post("/api/entries/999999999/episodes/next", **kwargs)
    foreign = client.post(f"/api/entries/{saved['id']}/episodes/next", **kwargs)
    assert unknown.status_code == 404
    assert unknown.json() == {"detail": "That item is not in your library."}
    assert foreign.status_code == unknown.status_code
    assert foreign.content == unknown.content
    with _session(client) as db:
        assert db.query(EpisodeProgress).count() == 0


def test_malformed_json_foreign_next_matches_unknown(client):
    saved = _create(client)
    client.app.dependency_overrides[require_principal] = lambda: Principal(2, "other", "Other")
    foreign = _raw_post(client, f"/api/entries/{saved['id']}/episodes/next", b"{")
    unknown = _raw_post(client, "/api/entries/999999999/episodes/next", b"{")
    assert foreign.status_code == unknown.status_code == 422
    assert foreign.json() == unknown.json()
    for header in ("content-type", "content-length"):
        assert foreign.headers[header] == unknown.headers[header]


def test_next_conditional_update_clears_operation_token(client, monkeypatch):
    monkeypatch.setenv("MEDIA_TODAY", TODAY)
    saved = _show(client, _aired(2))
    episode_id = saved["show"]["next_episode"]["id"]
    token = "11111111-1111-1111-1111-111111111111"
    with _session(client) as db:
        entry = _entry(db, saved["id"])
        db.add(
            EpisodeProgress(
                user_id=entry.user_id,
                episode_id=episode_id,
                watched=False,
                operation_token=token,
            )
        )
        db.commit()
        seeded = db.query(EpisodeProgress).one()
        assert seeded.watched is False
        assert seeded.operation_token == token
        seeded_id = seeded.id
    marked = client.post(f"/api/entries/{saved['id']}/episodes/next")
    assert marked.status_code == 200, marked.text
    with _session(client) as db:
        row = db.query(EpisodeProgress).one()
        assert row.id == seeded_id
        assert row.watched is True
        assert row.operation_token is None


def test_integrity_error_conflict_has_no_context(client, monkeypatch):
    monkeypatch.setenv("MEDIA_TODAY", TODAY)
    saved = _show(client, _aired(2))
    db = _session(client)

    def plant_duplicate(session, _flush_context, _instances):
        # A second pending row trips uq_episode_progress during the insert flush.
        pending = [row for row in session.new if isinstance(row, EpisodeProgress)]
        if len(pending) != 1:
            return
        row = pending[0]
        session.add(EpisodeProgress(user_id=row.user_id, episode_id=row.episode_id, watched=True))

    event.listen(db, "before_flush", plant_duplicate)
    calls: list[bool] = []
    rollback = db.rollback

    def spy(*_a, **_k):
        calls.append(True)
        rollback()

    monkeypatch.setattr(db, "rollback", spy)
    try:
        entry = _entry(db, saved["id"])
        with pytest.raises(HTTPException) as caught:
            mark_next_checked(db, entry.user_id, entry, None)
        error = caught.value
        assert error.status_code == 409
        assert error.detail == "That episode is no longer next. Refresh to see your progress."
        assert error.__context__ is None
        assert error.__cause__ is None
        assert calls
    finally:
        event.remove(db, "before_flush", plant_duplicate)
        db.close()
    with _session(client) as fresh:
        assert fresh.query(EpisodeProgress).count() == 0
