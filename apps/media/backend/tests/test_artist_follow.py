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


def test_artist_state_is_only_following_and_rating_stays_independent(client, tmp_path):
    omitted = client.post("/api/library", json={"kind": "artist", "title": "Default"})
    assert omitted.status_code == 200, omitted.text
    assert omitted.json()["status"] == "following"
    assert _row(tmp_path, omitted.json()["id"])[:3] == ("following", 1, "explicit")

    created = client.post(
        "/api/library",
        json={
            "kind": "artist",
            "title": "Kept",
            "status": "following",
            "rating": 8,
            "review": "Notes.",
            "favorite": True,
        },
    )
    assert created.status_code == 200, created.text
    artist = created.json()
    assert artist["music"]["albums"] == []
    assert _counts(tmp_path) == {"experiences": 0, "tracks": 0, "albums": 0}

    for status in REJECTED:
        rejected = client.post(
            "/api/library",
            json={"kind": "artist", "title": f"No {status}", "status": status},
        )
        assert rejected.status_code == 422, status
        changed = client.patch(f"/api/entries/{artist['id']}", json={"status": status})
        assert changed.status_code == 422, status

    anticipated = client.post(
        "/api/library",
        json={"kind": "artist", "title": "Soon", "status": "following", "anticipated": True},
    )
    assert anticipated.status_code == 422
    assert (
        client.patch(f"/api/entries/{artist['id']}", json={"anticipated": True}).status_code == 422
    )
    kept = client.get(f"/api/entries/{artist['id']}").json()
    assert kept["status"] == "following"
    assert kept["rating"] == 8
    assert kept["review"] == "Notes."
    assert kept["favorite"] is True
    assert {item["title"] for item in client.get("/api/library").json()["items"]} == {
        "Default",
        "Kept",
    }

    unfollowed = client.patch(f"/api/entries/{artist['id']}", json={"status": "unfollowed"}).json()
    assert unfollowed["status"] == "unfollowed"
    assert unfollowed["rating"] == 8
    assert unfollowed["review"] == "Notes."
    assert unfollowed["favorite"] is True
    rescored = client.patch(
        f"/api/entries/{artist['id']}", json={"rating": 1, "favorite": False}
    ).json()
    assert rescored["status"] == "unfollowed"
    assert rescored["rating"] == 1
    assert rescored["favorite"] is False
    assert _row(tmp_path, artist["id"])[:3] == ("unfollowed", 0, "explicit")
    assert _counts(tmp_path) == {"experiences": 0, "tracks": 0, "albums": 0}


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


def test_active_song_stays_a_song_when_the_artist_is_unfollowed(client, tmp_path):
    artist = client.post(
        "/api/library",
        json={
            "kind": "artist",
            "title": "Artist A",
            "status": "following",
            "rating": 9,
            "review": "Kept.",
            "favorite": True,
        },
    ).json()
    album = client.post(
        f"/api/entries/{artist['id']}/albums", json={"title": "A1", "year": 1999}
    ).json()
    album_id = album["music"]["albums"][0]["id"]
    song = client.post(
        f"/api/entries/{artist['id']}/albums/{album_id}/tracks", json={"title": "A2"}
    ).json()
    song_id = song["music"]["albums"][0]["tracks"][0]["id"]
    other = client.post(
        "/api/library/from-provider",
        json={
            "source": "musicbrainz",
            "source_id": "rec-other",
            "kind": "track",
            "title": "Unrelated",
            "status": "want",
        },
    ).json()

    client.patch(f"/api/entries/{artist['id']}", json={"status": "unfollowed"})
    client.patch(f"/api/entries/{song_id}", json={"status": "in_progress"})
    summary = client.get("/api/summary").json()
    assert [item["title"] for item in summary["currently"]] == ["A2"]
    assert summary["currently"][0]["kind"] == "track"
    assert summary["currently"][0]["status"] == "in_progress"
    assert summary["currently"][0]["artist"] == {
        "title": "Artist A",
        "entry_id": artist["id"],
        "status": "unfollowed",
    }
    assert summary["counts"]["in_progress"] == 1
    assert client.get(f"/api/entries/{artist['id']}").json()["status"] == "unfollowed"

    client.patch(f"/api/entries/{album_id}", json={"status": "in_progress"})
    both = client.get("/api/summary").json()["currently"]
    assert {item["title"] for item in both} == {"A1", "A2"}
    assert {item["artist"]["status"] for item in both} == {"unfollowed"}
    assert all(item["kind"] != "artist" for item in both)

    client.patch(f"/api/entries/{song_id}", json={"status": "completed"})
    after_song = client.get("/api/summary").json()["currently"]
    assert [item["title"] for item in after_song] == ["A1"]
    assert client.get(f"/api/entries/{artist['id']}").json()["rating"] == 9
    assert _row(tmp_path, artist["id"])[1] == 0

    client.patch(f"/api/entries/{other['id']}", json={"status": "in_progress"})
    with_other = client.get("/api/summary").json()["currently"]
    unrelated = next(item for item in with_other if item["title"] == "Unrelated")
    assert "artist" not in unrelated
    assert _row(tmp_path, artist["id"])[:4] == ("unfollowed", 0, "explicit", 9)

    client.patch(f"/api/entries/{other['id']}", json={"status": "paused"})
    assert [item["title"] for item in client.get("/api/summary").json()["currently"]] == ["A1"]
    assert client.get(f"/api/entries/{song_id}").json()["status"] == "completed"
    assert _counts(tmp_path)["experiences"] == 0

    client.delete(f"/api/entries/{artist['id']}")
    left = client.get("/api/summary").json()["currently"]
    assert [item["title"] for item in left] == ["A1"]
    assert left[0]["artist"]["title"] == "Artist A"
    assert left[0]["artist"]["entry_id"] is None
    assert left[0]["artist"]["status"] is None
    assert client.get(f"/api/entries/{song_id}").json()["status"] == "completed"
    assert _counts(tmp_path)["experiences"] == 0
