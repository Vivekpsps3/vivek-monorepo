"""Episode truth, bulk completion, and explicit metadata refresh."""

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
