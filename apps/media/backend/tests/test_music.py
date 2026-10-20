"""Artist, album, and song scores stay on their own rows."""

import sqlite3


def _scores(payload):
    artist = payload["rating"]
    albums = []
    for album in payload["music"]["albums"]:
        albums.append((album["title"], album["rating"], [(track["title"], track["rating"]) for track in album["tracks"]]))
    return artist, albums


def test_scores_do_not_cascade(client, tmp_path):
    created = client.post("/api/library", json={
        "kind": "artist",
        "title": "Snail Mail",
        "status": "want",
        "rating": 8,
        "review": "The artist.",
        "summary": "One line.",
    })
    assert created.status_code == 200
    artist = created.json()
    assert artist["music"]["albums"] == []
    opinion = (artist["rating"], artist["review"], artist["summary"])

    with_album = client.post(f"/api/entries/{artist['id']}/albums", json={"title": "Lush", "year": 2018})
    assert with_album.status_code == 200
    assert (with_album.json()["rating"], with_album.json()["review"], with_album.json()["summary"]) == opinion
    album = with_album.json()["music"]["albums"][0]
    assert album["rating"] is None

    with_songs = client.post(f"/api/entries/{artist['id']}/albums/{album['id']}/tracks", json={"title": "Pristine"})
    assert with_songs.status_code == 200
    song = with_songs.json()["music"]["albums"][0]["tracks"][0]
    assert song["rating"] is None
    client.post(f"/api/entries/{artist['id']}/albums/{album['id']}/tracks", json={"title": "Heat Wave"})

    rated_album = client.post(
        f"/api/entries/{artist['id']}/albums/{album['id']}/rating",
        json={"rating": 6},
    ).json()
    assert _scores(rated_album)[0] == 8
    assert rated_album["review"] == "The artist."
    assert rated_album["music"]["albums"][0]["rating"] == 6
    assert [track["rating"] for track in rated_album["music"]["albums"][0]["tracks"]] == [None, None]

    song_id = rated_album["music"]["albums"][0]["tracks"][0]["id"]
    rated_song = client.post(
        f"/api/entries/{artist['id']}/tracks/{song_id}/rating",
        json={"rating": 3},
    ).json()
    assert _scores(rated_song) == (8, [("Lush", 6, [("Pristine", 3), ("Heat Wave", None)])])

    changed_artist = client.patch(f"/api/entries/{artist['id']}", json={"rating": 9}).json()
    assert _scores(changed_artist) == (9, [("Lush", 6, [("Pristine", 3), ("Heat Wave", None)])])

    changed_song = client.post(
        f"/api/entries/{artist['id']}/tracks/{song_id}/rating",
        json={"rating": 1},
    ).json()
    assert _scores(changed_song) == (9, [("Lush", 6, [("Pristine", 1), ("Heat Wave", None)])])

    changed_album = client.post(
        f"/api/entries/{artist['id']}/albums/{album['id']}/rating",
        json={"rating": 4},
    ).json()
    assert _scores(changed_album) == (9, [("Lush", 4, [("Pristine", 1), ("Heat Wave", None)])])

    zero = client.post(
        f"/api/entries/{artist['id']}/tracks/{song_id}/rating",
        json={"rating": 0},
    ).json()
    assert _scores(zero) == (9, [("Lush", 4, [("Pristine", 0), ("Heat Wave", None)])])

    rejected = client.post(
        f"/api/entries/{artist['id']}/albums/{album['id']}/rating",
        json={"rating": 7.2},
    )
    assert rejected.status_code == 422
    kept = client.get(f"/api/entries/{artist['id']}").json()
    assert _scores(kept) == (9, [("Lush", 4, [("Pristine", 0), ("Heat Wave", None)])])

    cleared_album = client.post(
        f"/api/entries/{artist['id']}/albums/{album['id']}/rating",
        json={"rating": None},
    ).json()
    assert _scores(cleared_album) == (9, [("Lush", None, [("Pristine", 0), ("Heat Wave", None)])])

    stored = sqlite3.connect(tmp_path / "media.db")
    assert stored.execute("select rating from user_entries").fetchone() == (9,)
    assert stored.execute("select rating from album_ratings").fetchall() == []
    assert stored.execute("select rating from track_ratings").fetchone() == (0,)


def test_follow_loads_albums_and_songs_without_scores(client, monkeypatch):
    def fake(_http, artist_id):
        assert artist_id == "artist-1"
        return {
            "partial": False,
            "albums": [{
                "source_id": "rg-1",
                "title": "Valentine",
                "year": 2021,
                "artwork_url": "https://coverartarchive.org/release-group/rg-1/front-250",
                "tracks": [
                    {"source_id": "rec-1", "title": "Valentine", "position": 1},
                    {"source_id": "rec-2", "title": "Ben Franklin", "position": 2},
                ],
            }],
        }

    monkeypatch.setattr("services.providers.musicbrainz_artist_catalog", fake)
    followed = client.post("/api/library/from-provider", json={
        "source": "musicbrainz",
        "source_id": "artist-1",
        "kind": "artist",
        "title": "Snail Mail",
        "rating": 7,
    })
    assert followed.status_code == 200
    body = followed.json()
    assert body["already_saved"] is False
    assert _scores(body) == (7, [("Valentine", None, [("Valentine", None), ("Ben Franklin", None)])])

    again = client.get(f"/api/entries/{body['id']}").json()
    assert _scores(again) == _scores(body)


def test_missing_songs_resume_on_the_next_view(client, monkeypatch):
    monkeypatch.setattr("services.records.time.sleep", lambda _seconds: None)
    lookups = []

    def catalog(_http, artist_id, group_offset=0, release_offset=0):
        assert artist_id == "artist-1"
        assert group_offset == 0 and release_offset == 0
        return {
            "partial": False,
            "albums": [
                {
                    "source_id": f"rg-{number}",
                    "title": f"Album {number}",
                    "year": 2000 + number,
                    "artwork_url": f"https://coverartarchive.org/release-group/rg-{number}/front-250",
                    "tracks": [],
                }
                for number in range(1, 11)
            ],
        }

    def tracks(_http, group_id):
        lookups.append(group_id)
        return [{"source_id": f"{group_id}-song", "title": "Only Song", "position": 1}]

    monkeypatch.setattr("services.providers.musicbrainz_artist_catalog", catalog)
    monkeypatch.setattr("services.providers.release_group_tracks", tracks)
    followed = client.post("/api/library/from-provider", json={
        "source": "musicbrainz",
        "source_id": "artist-1",
        "kind": "artist",
        "title": "Snail Mail",
    })
    assert followed.status_code == 200, followed.text
    first = followed.json()["music"]
    assert first["partial"] is True
    assert [album["title"] for album in first["albums"] if album["tracks"]] == [f"Album {number}" for number in range(1, 9)]
    assert len(lookups) == 8

    again = client.get(f"/api/entries/{followed.json()['id']}").json()["music"]
    assert again["partial"] is False
    assert [album["title"] for album in again["albums"] if album["tracks"]] == [f"Album {number}" for number in range(1, 11)]
    assert lookups == [f"rg-{number}" for number in range(1, 11)]


def test_disc_two_keeps_its_place_in_the_song_order():
    from services.providers import _tracks_from_release

    tracks = _tracks_from_release({
        "media": [
            {"tracks": [
                {"title": "One", "position": 1, "recording": {"id": "a"}},
                {"title": "Two", "position": 2, "recording": {"id": "b"}},
            ]},
            {"tracks": [
                {"title": "Three", "position": 1, "recording": {"id": "c"}},
            ]},
        ]
    })
    assert [(row["title"], row["position"]) for row in tracks] == [("One", 1), ("Two", 2), ("Three", 3)]
