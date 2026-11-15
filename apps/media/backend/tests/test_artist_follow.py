"""Artists are followed. Songs and albums are what gets listened to."""

import sqlite3

LEGACY_STATUSES = ("want", "anticipating", "in_progress", "completed", "paused", "dropped")
REJECTED = (*LEGACY_STATUSES, "listening", "listened")


def _plant(tmp_path, entry_id, status, followed, provenance, anticipated=0):
    db = sqlite3.connect(tmp_path / "media.db")
    db.execute(
        "UPDATE user_entries SET status = ?, followed = ?, follow_provenance = ?, "
        "anticipated = ? WHERE id = ?",
        (status, followed, provenance, anticipated, entry_id),
    )
    db.commit()
    db.close()


def _row(tmp_path, entry_id):
    db = sqlite3.connect(tmp_path / "media.db")
    row = db.execute(
        "SELECT status, followed, follow_provenance, rating, review, favorite "
        "FROM user_entries WHERE id = ?",
        (entry_id,),
    ).fetchone()
    db.close()
    return row


def _counts(tmp_path):
    db = sqlite3.connect(tmp_path / "media.db")
    counts = {
        "experiences": db.execute("SELECT count(*) FROM experiences").fetchone()[0],
        "tracks": db.execute("SELECT count(*) FROM catalog_items WHERE kind = 'track'").fetchone()[
            0
        ],
        "albums": db.execute("SELECT count(*) FROM catalog_items WHERE kind = 'album'").fetchone()[
            0
        ],
    }
    db.close()
    return counts


def test_legacy_artist_states_do_not_become_listens(client, tmp_path, monkeypatch):
    monkeypatch.setenv("MEDIA_TODAY", "2026-10-15")
    ids = {}
    for status in LEGACY_STATUSES:
        created = client.post(
            "/api/library",
            json={
                "kind": "artist",
                "title": f"Legacy {status}",
                "status": "following",
                "rating": 4,
                "review": status,
                "release_on": "2026-10-20",
                "release_precision": "day",
            },
        )
        assert created.status_code == 200, created.text
        followed = 0 if status == "dropped" else 1
        _plant(
            tmp_path,
            created.json()["id"],
            status,
            followed,
            f"legacy:{status}",
            anticipated=1 if status == "anticipating" else 0,
        )
        ids[status] = created.json()["id"]
    missing = client.post(
        "/api/library", json={"kind": "artist", "title": "Unset", "status": "following"}
    ).json()
    _plant(tmp_path, missing["id"], "in_progress", None, None)
    movie = client.post(
        "/api/library",
        json={
            "kind": "movie",
            "title": "Real Listen",
            "status": "in_progress",
        },
    ).json()
    coming = client.post(
        "/api/library",
        json={
            "kind": "movie",
            "title": "Real Soon",
            "status": "anticipating",
            "anticipated": True,
            "release_on": "2026-10-20",
            "release_precision": "day",
        },
    ).json()
    before = _counts(tmp_path)

    summary = client.get("/api/summary").json()
    assert [item["title"] for item in summary["currently"]] == ["Real Listen"]
    assert movie["id"] == summary["currently"][0]["id"]
    assert "artist" not in summary["currently"][0]
    assert [item["title"] for item in summary["upcoming"]] == [coming["title"]]
    assert summary["counts"]["in_progress"] == 1
    assert summary["counts"]["anticipated"] == 1
    for status, entry_id in ids.items():
        body = client.get(f"/api/entries/{entry_id}").json()
        assert body["status"] == ("unfollowed" if status == "dropped" else "following")
        assert body["rating"] == 4
        assert body["review"] == status
    assert client.get(f"/api/entries/{missing['id']}").json()["status"] == "following"
    assert _counts(tmp_path) == before

    calendar = client.get("/api/calendar", params={"month": "2026-10"}).text
    assert coming["title"] in calendar
    for status in LEGACY_STATUSES:
        assert f"Legacy {status}" not in calendar

    followed = client.get("/api/library", params={"kind": "artist", "status": "following"}).json()
    assert {item["title"] for item in followed["items"]} == {
        "Legacy want",
        "Legacy anticipating",
        "Legacy in_progress",
        "Legacy completed",
        "Legacy paused",
        "Unset",
    }
    unfollowed = client.get(
        "/api/library", params={"kind": "artist", "status": "unfollowed"}
    ).json()
    assert [item["title"] for item in unfollowed["items"]] == ["Legacy dropped"]
    listening = client.get("/api/library", params={"status": "in_progress"}).json()["items"]
    assert [item["title"] for item in listening] == ["Real Listen"]
    assert [item["kind"] for item in listening] == ["movie"]
    assert (
        client.get("/api/library", params={"kind": "artist", "status": "in_progress"}).json()[
            "items"
        ]
        == []
    )
    assert (
        client.get("/api/library", params={"kind": "movie", "status": "following"}).json()["items"]
        == []
    )
    assert client.get("/api/library", params={"status": "nope"}).status_code == 422

    changed = client.patch(f"/api/entries/{ids['in_progress']}", json={"status": "unfollowed"})
    assert changed.status_code == 200, changed.text
    assert changed.json()["status"] == "unfollowed"
    assert changed.json()["rating"] == 4
    assert _row(tmp_path, ids["in_progress"])[:3] == ("unfollowed", 0, "legacy:in_progress")
    assert _counts(tmp_path) == before
