"""Artist, album, and song scores stay on their own rows."""

import sqlite3


def _scores(payload):
    artist = payload["rating"]
    albums = []
    for album in payload["music"]["albums"]:
        albums.append(
            (
                album["title"],
                album["rating"],
                [(track["title"], track["rating"]) for track in album["tracks"]],
            )
        )
    return artist, albums


def _forbid_catalog(monkeypatch):
    def forbidden(*_args, **_kwargs):
        raise AssertionError("metadata availability tried to load a discography")

    monkeypatch.setattr(
        "apps.media.backend.services.providers.musicbrainz_artist_catalog", forbidden
    )


def test_discography_save_keeps_one_song_without_its_album(client, monkeypatch, tmp_path):
    seen = []

    def catalog(
        _http, artist_id, group_offset=0, release_offset=0, max_pages=1, release_type=None, db=None
    ):
        seen.append(release_type)
        assert db is not None
        return {"partial": False, "group_offset": 0, "release_offset": 0, "albums": []}

    monkeypatch.setattr("apps.media.backend.services.providers.musicbrainz_artist_catalog", catalog)
    artist = client.post(
        "/api/library/from-provider",
        json={
            "source": "musicbrainz",
            "source_id": "artist-a",
            "kind": "artist",
            "title": "Artist A",
            "status": "following",
        },
    ).json()
    default = client.get(f"/api/entries/{artist['id']}/discography")
    assert default.status_code == 200, default.text
    assert default.json()["release"] == "studio"
    assert seen == [None]
    live = client.get(f"/api/entries/{artist['id']}/discography", params={"release": "live"})
    assert live.status_code == 200, live.text
    assert live.json()["release"] == "live"
    assert seen == [None, "live"]
    assert (
        client.get(
            f"/api/entries/{artist['id']}/discography", params={"release": "nope"}
        ).status_code
        == 422
    )

    album = client.post(
        f"/api/entries/{artist['id']}/discography",
        json={"kind": "album", "source_id": "rg-a1", "title": "A1", "year": 1999},
    )
    assert album.status_code == 200, album.text
    album_id = album.json()["id"]
    assert album.json()["already_saved"] is False
    song = client.post(
        f"/api/entries/{artist['id']}/discography",
        json={
            "kind": "track",
            "source_id": "rec-a2",
            "title": "A2",
            "album_source_id": "rg-a1",
            "album_title": "A1",
            "position": 1,
        },
    )
    assert song.status_code == 200, song.text
    loose = client.post(
        f"/api/entries/{artist['id']}/discography",
        json={
            "kind": "track",
            "source_id": "rec-b1",
            "title": "B1",
            "album_source_id": "rg-b",
            "album_title": "B",
            "position": 1,
        },
    )
    assert loose.status_code == 200, loose.text
    again = client.post(
        f"/api/entries/{artist['id']}/discography",
        json={"kind": "album", "source_id": "rg-a1", "title": "A1", "year": 1999},
    )
    assert again.status_code == 200, again.text
    assert again.json()["already_saved"] is True
    assert again.json()["id"] == album_id

    library = client.get("/api/library").json()["items"]
    assert {item["title"] for item in library} == {"Artist A", "A1", "A2", "B1"}
    card = next(item for item in library if item["id"] == artist["id"])
    assert card["saved_count"] == 3
    music = client.get(f"/api/entries/{artist['id']}").json()["music"]
    assert [row["title"] for row in music["albums"]] == ["A1"]
    assert [row["title"] for row in music["albums"][0]["tracks"]] == ["A2"]
    assert [row["title"] for row in music["songs"]] == ["B1"]
    stored = sqlite3.connect(tmp_path / "media.db")
    catalog_titles = {row[0] for row in stored.execute("select title from catalog_items")}
    entry_titles = {
        row[0]
        for row in stored.execute(
            "select catalog_items.title from user_entries "
            "join catalog_items on catalog_items.id = user_entries.catalog_id"
        )
    }
    stored.close()
    assert "B" in catalog_titles
    assert "B" not in entry_titles

    other = client.post(
        "/api/library", json={"kind": "artist", "title": "Artist A", "status": "following"}
    ).json()
    assert other["id"] != artist["id"]
    other_music = client.get(f"/api/entries/{other['id']}").json()["music"]
    assert other_music["albums"] == []
    assert other_music["songs"] == []

    taken = client.post(
        "/api/library/from-provider",
        json={
            "source": "musicbrainz",
            "source_id": "rec-taken",
            "kind": "track",
            "title": "Taken",
            "status": "want",
        },
    ).json()
    stored = sqlite3.connect(tmp_path / "media.db")
    before_entries = stored.execute("select count(*) from user_entries").fetchone()[0]
    before_catalogs = stored.execute("select count(*) from catalog_items").fetchone()[0]
    stored.close()
    rejected = client.post(
        f"/api/entries/{artist['id']}/discography",
        json={
            "kind": "track",
            "source_id": "rec-fresh",
            "title": "Fresh",
            "album_source_id": "rec-taken",
            "album_title": "Taken",
        },
    )
    assert rejected.status_code == 422
    assert taken["id"]
    stored = sqlite3.connect(tmp_path / "media.db")
    assert stored.execute("select count(*) from user_entries").fetchone()[0] == before_entries
    assert stored.execute("select count(*) from catalog_items").fetchone()[0] == before_catalogs
    stored.close()


ARI = "f4fdbb4c-e4b7-47a0-b83b-d91bbfcfa387"
PETAL_GROUP = "2b8f453f-ffd6-4860-8742-7cff1c2feae3"
PETAL_RELEASE = "0ea273f2-a76b-4ff5-8cd9-f54ba2f290fe"
DECOY_ARTIST = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
PETAL_SONG = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"


def _petal_detail(source_id):
    return {
        "source": "musicbrainz",
        "source_id": PETAL_RELEASE if source_id == PETAL_RELEASE else PETAL_GROUP,
        "kind": "album",
        "title": "petal",
        "creator": "Not Used For Linking",
        "year": 2026,
        "overview": None,
        "artwork_url": f"https://coverartarchive.org/release-group/{PETAL_GROUP}/front-250",
        "genres": [],
        "external_ratings": [],
        "extra": {
            "release_group_id": PETAL_GROUP,
            "artist_id": ARI,
            "release_id": PETAL_RELEASE,
            "primary_type": "Album",
        },
        "releases": [{"released_on": "2026-07-31", "precision": "day", "status": "released"}],
        "episodes": [],
        "provenance": {
            "provider": "musicbrainz",
            "coverage": "official",
            "fetched_at": "2026-11-08T00:00:00+00:00",
        },
    }


def _lookup_petal(_source, kind, source_id):
    if kind == "album" and source_id in {PETAL_RELEASE, PETAL_GROUP}:
        return _petal_detail(source_id)
    return None


def _save_named_artist(client, source_id):
    saved = client.post(
        "/api/library/from-provider",
        json={
            "source": "musicbrainz",
            "source_id": source_id,
            "kind": "artist",
            "title": "Ariana Grande",
            "status": "following",
        },
    )
    assert saved.status_code == 200, saved.text
    return saved.json()
