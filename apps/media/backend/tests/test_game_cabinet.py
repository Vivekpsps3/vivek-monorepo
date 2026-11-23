"""Game cards use stored progress and status. One update does not copy another game."""

from apps.server.auth import Principal, require_principal


def _absent(value, key: str) -> None:
    if isinstance(value, dict):
        assert key not in value
        for item in value.values():
            _absent(item, key)
    elif isinstance(value, list):
        for item in value:
            _absent(item, key)


def _save(client, body: dict) -> dict:
    response = client.post("/api/library", json=body)
    assert response.status_code == 200, response.text
    payload = response.json()
    _absent(payload, "completed_on")
    assert "score" not in payload
    return payload


def test_game_update_changes_only_that_membership(client):
    note = "A synthetic note about the lantern."
    long_note = ("synthetic " * 40).strip()
    playing = _save(
        client,
        {
            "kind": "game",
            "title": "Lantern Kart",
            "status": "in_progress",
            "progress_value": 12,
            "progress_unit": "hour",
            "review": note,
            "rating": 7,
            "artwork_url": "https://synthetic.example/box.png",
        },
    )
    same_title = _save(
        client,
        {"kind": "game", "title": "Lantern Kart", "status": "want"},
    )
    untouched = _save(
        client,
        {
            "kind": "game",
            "title": "Untouched Quest",
            "status": "want",
            "progress_value": 3,
            "progress_unit": "hour",
        },
    )
    finished = _save(client, {"kind": "game", "title": "Quiet Arcade", "status": "completed"})
    planned = _save(client, {"kind": "game", "title": "Paper Cartridge", "status": "want"})
    waiting = _save(
        client,
        {"kind": "game", "title": "Anticipated Port", "status": "anticipating"},
    )
    paused = _save(client, {"kind": "game", "title": "Paused Relay", "status": "paused"})
    quiet = _save(
        client,
        {"kind": "game", "title": "Long Margin", "status": "completed", "review": long_note},
    )
    _save(client, {"kind": "movie", "title": "Paper Lantern", "status": "want"})

    listed = client.get("/api/library", params={"kind": "game", "sort": "title"}).json()
    _absent(listed, "completed_on")
    assert listed["total"] == 8
    by_title: dict[str, list[dict]] = {}
    for item in listed["items"]:
        by_title.setdefault(item["title"], []).append(item)
        assert item["kind"] == "game"
        assert "score" not in item
        assert "playtime" not in item
        assert "review" not in item

    lanterns = by_title["Lantern Kart"]
    assert len(lanterns) == 2
    current = next(item for item in lanterns if item["status"] == "in_progress")
    planned_copy = next(item for item in lanterns if item["status"] == "want")
    assert current["id"] == playing["id"]
    assert current["progress_value"] == 12
    assert current["progress_unit"] == "hour"
    assert current["progress_label"] == "12 h"
    assert current["note"] == note
    assert current["rating"] == 7
    assert current["artwork_url"] == "https://synthetic.example/box.png"
    assert current["unopened"] is False
    assert planned_copy["id"] == same_title["id"]
    assert planned_copy["progress_value"] is None
    assert planned_copy["progress_label"] is None
    assert planned_copy["note"] is None
    assert planned_copy["unopened"] is True
    assert by_title["Untouched Quest"][0]["progress_label"] == "3 h"
    assert by_title["Untouched Quest"][0]["unopened"] is False
    assert by_title["Quiet Arcade"][0]["progress_value"] is None
    assert by_title["Quiet Arcade"][0]["progress_label"] is None
    assert by_title["Quiet Arcade"][0]["status"] == "completed"
    assert by_title["Quiet Arcade"][0]["unopened"] is False
    assert by_title["Paper Cartridge"][0]["id"] == planned["id"]
    assert by_title["Paper Cartridge"][0]["artwork_url"] is None
    assert by_title["Paper Cartridge"][0]["unopened"] is True
    assert by_title["Anticipated Port"][0]["id"] == waiting["id"]
    assert by_title["Anticipated Port"][0]["status"] == "anticipating"
    assert by_title["Anticipated Port"][0]["unopened"] is True
    assert by_title["Paused Relay"][0]["id"] == paused["id"]
    assert by_title["Paused Relay"][0]["status"] == "paused"
    assert by_title["Paused Relay"][0]["unopened"] is False
    margin = by_title["Long Margin"][0]
    assert margin["note"] != long_note
    assert margin["note"].endswith("…")
    detail = client.get(f"/api/entries/{quiet['id']}").json()
    assert detail["review"] == long_note
    _absent(detail, "completed_on")

    moved = client.patch(
        f"/api/entries/{playing['id']}",
        json={"progress_value": 13, "progress_unit": "hour", "status": "paused"},
    )
    assert moved.status_code == 200, moved.text
    body = moved.json()
    assert body["id"] == playing["id"]
    assert body["status"] == "paused"
    assert body["progress_value"] == 13
    assert body["progress_label"] == "13 h"
    assert body["review"] == note
    _absent(body, "completed_on")
    again = client.get("/api/library", params={"kind": "game", "limit": 24}).json()
    assert again["total"] == 8
    rows = {item["id"]: item for item in again["items"]}
    assert rows[playing["id"]]["status"] == "paused"
    assert rows[playing["id"]]["progress_value"] == 13
    assert rows[untouched["id"]]["status"] == "want"
    assert rows[untouched["id"]]["progress_value"] == 3
    assert rows[same_title["id"]]["status"] == "want"
    assert rows[same_title["id"]]["progress_value"] is None
    assert rows[finished["id"]]["progress_label"] is None

    rejected = client.patch(
        f"/api/entries/{playing['id']}",
        json={"progress_value": 140, "progress_unit": "percent"},
    )
    assert rejected.status_code == 422
    kept = client.get(f"/api/entries/{playing['id']}").json()
    assert kept["progress_value"] == 13
    assert kept["progress_unit"] == "hour"
    assert kept["status"] == "paused"

    client.app.dependency_overrides[require_principal] = lambda: Principal(2, "other", "Other")
    denied = client.patch(
        f"/api/entries/{playing['id']}",
        json={"progress_value": 1, "progress_unit": "hour"},
    )
    assert denied.status_code == 404
    foreign = client.get("/api/library", params={"kind": "game", "limit": 24})
    assert foreign.status_code == 200
    assert foreign.json()["total"] == 0
    hidden = client.get(f"/api/entries/{planned['id']}")
    assert hidden.status_code == 404
    client.app.dependency_overrides[require_principal] = lambda: Principal(1, "tester", "Tester")
    owned = client.get(f"/api/entries/{playing['id']}").json()
    assert owned["progress_value"] == 13
    still_closed = client.get("/api/library", params={"kind": "game", "limit": 24}).json()
    paper = next(item for item in still_closed["items"] if item["id"] == planned["id"])
    assert paper["unopened"] is True
    assert paper["progress_value"] is None
    assert paper["status"] == "want"

    mixed = client.get("/api/library", params={"sort": "title"}).json()["items"]
    movie = next(item for item in mixed if item["title"] == "Paper Lantern")
    assert movie["kind"] == "movie"
    assert "note" not in movie
    assert "unopened" not in movie
    assert "score" not in movie
