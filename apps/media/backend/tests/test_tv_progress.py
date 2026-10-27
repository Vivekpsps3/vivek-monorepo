"""Episode truth, bulk completion, and explicit metadata refresh."""

import pytest

from apps.media.backend.services import providers
from apps.server.auth import Principal, require_principal


def show(client):
    response = client.post(
        "/api/library",
        json={
            "kind": "tv",
            "title": "A show",
            "status": "in_progress",
            "review": "Keep the review",
            "rating": 0,
            "episodes": [
                {"season_number": 0, "episode_number": 1, "air_date": "2026-10-01"},
                {"season_number": 1, "episode_number": 1, "air_date": "2026-10-01"},
                {"season_number": 1, "episode_number": 2, "air_date": "2026-10-26"},
                {"season_number": 2, "episode_number": 1, "air_date": "2026-10-27"},
                {"season_number": 2, "episode_number": 2},
            ],
        },
    )
    assert response.status_code == 200, response.text
    saved = response.json()
    for episode in [
        {"season_number": 0, "episode_number": 1, "air_date": "2026-10-01"},
        {"season_number": 1, "episode_number": 1, "air_date": "2026-10-01"},
        {"season_number": 1, "episode_number": 2, "air_date": "2026-10-26"},
        {"season_number": 2, "episode_number": 1, "air_date": "2026-10-27"},
        {"season_number": 2, "episode_number": 2},
    ]:
        assert client.post(f"/api/entries/{saved['id']}/episodes", json=episode).status_code == 200
    return client.get(f"/api/entries/{saved['id']}").json()


def test_catch_up_is_idempotent_preserves_prior_marks_and_safe_undo(client, monkeypatch):
    monkeypatch.setenv("MEDIA_TODAY", "2026-10-26")
    saved = show(client)
    path = f"/api/entries/{saved['id']}"
    episodes = saved["show"]["episodes"]
    first, second = [e for e in episodes if e["season_number"] == 1]
    client.post(
        path + f"/episodes/{first['id']}/watched",
        json={"watched": True, "watched_on": "2026-10-03"},
    )
    client.post(path + "/seasons", json={"season_number": 1, "rating": 8})
    result = client.post(path + "/caught-up", json={}).json()
    assert result["operation"]["changed_ids"] == [second["id"]]
    assert result["operation"]["cutoff"] == "2026-10-26"
    assert result["review"] == "Keep the review" and result["rating"] == 0
    assert result["show"]["caught_up"] is False  # Unknown air dates stay incomplete.
    assert result["show"]["metadata_incomplete"] is True
    first_after = next(e for e in result["show"]["episodes"] if e["id"] == first["id"])
    assert first_after["watched_on"] == "2026-10-03"
    assert client.post(path + "/caught-up", json={}).json()["operation"]["changed_ids"] == []
    token = result["operation"]["operation_token"]
    undone = client.post(path + f"/caught-up/{token}/undo").json()
    assert undone["undo"]["undone_ids"] == [second["id"]]
    assert next(s for s in undone["show"]["seasons"] if s["season_number"] == 1)["rating"] == 8
    assert client.post(path + f"/caught-up/{token}/undo").json()["undo"]["already_undone"] is True


def test_undo_preserves_later_edits_and_is_scoped_to_owner(client, monkeypatch):
    monkeypatch.setenv("MEDIA_TODAY", "2026-10-26")
    saved = show(client)
    path = f"/api/entries/{saved['id']}"
    done = client.post(path + "/caught-up", json={}).json()
    token = done["operation"]["operation_token"]
    changed = done["operation"]["changed_ids"]
    client.post(
        path + f"/episodes/{changed[0]}/watched", json={"watched": True, "watched_on": "2026-10-20"}
    )
    client.app.dependency_overrides[require_principal] = lambda: Principal(2, "other", "Other")
    assert client.post(path + f"/caught-up/{token}/undo").status_code == 404
    client.app.dependency_overrides[require_principal] = lambda: Principal(1, "tester", "Tester")
    undo = client.post(path + f"/caught-up/{token}/undo").json()
    assert undo["undo"]["conflict_ids"] == [changed[0]]
    assert undo["undo"]["undone_ids"] == [changed[1]]
    assert (
        next(e for e in undo["show"]["episodes"] if e["id"] == changed[0])["watched_on"]
        == "2026-10-20"
    )


def test_specials_scope_and_invalid_flags(client, monkeypatch):
    monkeypatch.setenv("MEDIA_TODAY", "2026-10-26")
    saved = show(client)
    path = f"/api/entries/{saved['id']}"
    assert client.post(path + "/caught-up", json={"include_specials": "false"}).status_code == 422
    done = client.post(
        path + "/caught-up", json={"include_specials": True, "season_number": 0}
    ).json()
    assert len(done["operation"]["changed_ids"]) == 1
    assert next(e for e in done["show"]["episodes"] if e["season_number"] == 0)["watched"] is True
    assert all(not e["watched"] for e in done["show"]["episodes"] if e["season_number"] != 0)


def test_no_metadata_is_not_caught_up_and_unknown_dates_allow_individual_override(
    client, monkeypatch
):
    monkeypatch.setenv("MEDIA_TODAY", "2026-10-26")
    saved = client.post("/api/library", json={"kind": "tv", "title": "No episodes"}).json()
    result = client.post(f"/api/entries/{saved['id']}/caught-up", json={}).json()
    assert result["show"]["caught_up"] is False
    assert result["operation"]["eligible_count"] == 0
    saved = show(client)
    unknown = next(e for e in saved["show"]["episodes"] if e["air_date"] is None)
    assert unknown["released"] is False
    assert (
        client.post(
            f"/api/entries/{saved['id']}/episodes/{unknown['id']}/watched", json={"watched": True}
        ).status_code
        == 200
    )


def test_link_refresh_resurface_and_outage_preserve_personal_state(client, monkeypatch):
    monkeypatch.setenv("MEDIA_TODAY", "2026-10-26")
    saved = client.post(
        "/api/library",
        json={"kind": "tv", "title": "Manual show", "status": "completed", "review": "Keep it"},
    ).json()
    path = f"/api/entries/{saved['id']}"
    detail: dict = {
        "source": "tvmaze",
        "source_id": "42",
        "kind": "tv",
        "title": "The show",
        "extra": {"lifecycle": "Running", "episode_completeness": "complete"},
        "episodes": [
            {"source_id": "ep1", "season_number": 1, "episode_number": 1, "air_date": "2026-10-26"},
            {"source_id": "ep2", "season_number": 2, "episode_number": 1, "air_date": "2026-11-01"},
        ],
    }
    monkeypatch.setattr(providers, "lookup_detail", lambda *_args: detail)
    linked = client.post(
        path + "/link-metadata", json={"source": "tvmaze", "source_id": "42"}
    ).json()
    assert linked["id"] == saved["id"] and linked["review"] == "Keep it"
    assert linked["lifecycle"]["state"] == "ongoing"
    assert client.get("/api/summary").json()["next_episodes"][0]["entry_id"] == saved["id"]
    done = client.post(path + "/caught-up", json={}).json()
    assert done["show"]["caught_up"] is True
    assert done["status"] == "completed"
    assert client.get("/api/summary").json()["next_episodes"] == []
    client.patch(path, json={"status": "paused"})
    providers.SEARCH_CACHE.clear()
    detail["episodes"][1]["air_date"] = "2026-10-26"
    detail["episodes"][0]["episode_number"] = 2  # Stable upstream identity preserves the mark.
    refreshed = client.post(path + "/refresh").json()
    assert (
        next(e for e in refreshed["show"]["episodes"] if e["season_number"] == 1)["watched"] is True
    )
    assert client.get("/api/summary").json()["next_episodes"] == []
    client.patch(path, json={"status": "completed"})
    assert client.get("/api/summary").json()["next_episodes"][0]["season"] == 2
    providers.SEARCH_CACHE.clear()
    monkeypatch.setattr(providers, "lookup_detail", lambda *_args: None)
    assert client.post(path + "/refresh").status_code == 502
    assert client.get(path).json()["review"] == "Keep it"
    assert client.get(path).json()["lifecycle"]["state"] == "ongoing"


@pytest.mark.parametrize(
    ("raw", "state"),
    [
        ("Running", "ongoing"),
        ("Returning Series", "ongoing"),
        ("Ended", "ended"),
        ("Canceled", "canceled"),
        ("Not known", "unknown"),
    ],
)
def test_lifecycle_normalization(raw, state):
    from apps.media.backend.services.metadata import normalize_lifecycle

    assert normalize_lifecycle(raw) == state
