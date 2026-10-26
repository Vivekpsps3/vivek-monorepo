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


def test_scores_do_not_cascade(client, tmp_path):
    created = client.post(
        "/api/library",
        json={
            "kind": "artist",
            "title": "Snail Mail",
            "status": "want",
            "rating": 8,
            "review": "The artist.",
            "summary": "One line.",
        },
    )
    assert created.status_code == 200
    artist = created.json()
    assert artist["music"]["albums"] == []
    opinion = (artist["rating"], artist["review"], artist["summary"])

    with_album = client.post(
        f"/api/entries/{artist['id']}/albums", json={"title": "Lush", "year": 2018}
    )
    assert with_album.status_code == 200
    assert (
        with_album.json()["rating"],
        with_album.json()["review"],
        with_album.json()["summary"],
    ) == opinion
    album = with_album.json()["music"]["albums"][0]
    assert album["rating"] is None

    with_songs = client.post(
        f"/api/entries/{artist['id']}/albums/{album['id']}/tracks", json={"title": "Pristine"}
    )
    assert with_songs.status_code == 200
    song = with_songs.json()["music"]["albums"][0]["tracks"][0]
    assert song["rating"] is None
    client.post(
        f"/api/entries/{artist['id']}/albums/{album['id']}/tracks", json={"title": "Heat Wave"}
    )

    rated_album = client.post(
        f"/api/entries/{artist['id']}/albums/{album['id']}/rating",
        json={"rating": 6},
    ).json()
    assert _scores(rated_album)[0] == 8
    assert rated_album["review"] == "The artist."
    assert rated_album["music"]["albums"][0]["rating"] == 6
    assert [track["rating"] for track in rated_album["music"]["albums"][0]["tracks"]] == [
        None,
        None,
    ]

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
    ratings = stored.execute(
        "select catalog_items.kind, user_entries.rating from user_entries "
        "join catalog_items on catalog_items.id = user_entries.catalog_id "
        "order by user_entries.id"
    ).fetchall()
    assert ratings == [("artist", 9), ("album", None), ("track", 0), ("track", None)]
    assert stored.execute("select rating from album_ratings").fetchall() == []
    assert stored.execute("select rating from track_ratings").fetchall() == []
    assert stored.execute("select count(*) from music_albums").fetchone() == (0,)
    assert stored.execute("select count(*) from music_tracks").fetchone() == (0,)


def _forbid_catalog(monkeypatch):
    def forbidden(*_args, **_kwargs):
        raise AssertionError("metadata availability tried to load a discography")

    monkeypatch.setattr(
        "apps.media.backend.services.providers.musicbrainz_artist_catalog", forbidden
    )


def test_follow_does_not_insert_albums_or_songs(client, monkeypatch, tmp_path):
    _forbid_catalog(monkeypatch)
    followed = client.post(
        "/api/library/from-provider",
        json={
            "source": "musicbrainz",
            "source_id": "artist-1",
            "kind": "artist",
            "title": "Snail Mail",
            "rating": 7,
        },
    )
    assert followed.status_code == 200, followed.text
    body = followed.json()
    assert body["already_saved"] is False
    assert body["music"]["albums"] == []
    assert body["music"]["partial"] is False
    library = client.get("/api/library").json()
    assert [item["title"] for item in library["items"]] == ["Snail Mail"]
    assert library["items"][0]["saved_count"] == 0
    assert "music" not in library["items"][0]
    again = client.get(f"/api/entries/{body['id']}")
    assert again.status_code == 200
    assert again.json()["music"]["albums"] == []
    stored = sqlite3.connect(tmp_path / "media.db")
    assert stored.execute("select kind from catalog_items").fetchall() == [("artist",)]
    assert stored.execute("select count(*) from user_entries").fetchone() == (1,)
    assert stored.execute("select followed, follow_provenance from user_entries").fetchone() == (
        1,
        "explicit",
    )
    assert stored.execute("select count(*) from music_albums").fetchone() == (0,)
    assert stored.execute("select count(*) from music_tracks").fetchone() == (0,)
    assert stored.execute("select count(*) from music_links").fetchone() == (0,)


def test_manual_album_artwork_url_must_be_http(client):
    created = client.post(
        "/api/library", json={"kind": "artist", "title": "Synthetic Band", "status": "want"}
    )
    assert created.status_code == 200, created.text
    artist_id = created.json()["id"]
    rejected = client.post(
        f"/api/entries/{artist_id}/albums",
        json={"title": "Nope", "artwork_url": "javascript:alert(1)"},
    )
    assert rejected.status_code == 422, rejected.text
    accepted = client.post(
        f"/api/entries/{artist_id}/albums",
        json={"title": "Yes", "artwork_url": "https://example.invalid/cover.png"},
    )
    assert accepted.status_code == 200, accepted.text
    album = accepted.json()["music"]["albums"][0]
    assert album["artwork_url"] == "https://example.invalid/cover.png"


def test_album_search_uses_the_release_group_cover():
    class Response:
        def __init__(self, payload):
            self._payload = payload

        def raise_for_status(self):
            return None

        def json(self):
            return self._payload

    class Client:
        def get(self, url, params=None):
            assert url.endswith("/release")
            return Response(
                {
                    "releases": [
                        {
                            "id": "0ea273f2-a76b-4ff5-8cd9-f54ba2f290fe",
                            "title": "petal",
                            "date": "2026-07-31",
                            "artist-credit": [{"name": "Ariana Grande"}],
                            "release-group": {
                                "id": "2b8f453f-ffd6-4860-8742-7cff1c2feae3",
                                "title": "petal",
                            },
                        }
                    ]
                }
            )

    from typing import cast

    import httpx

    from apps.media.backend.services.providers import musicbrainz_search

    rows = musicbrainz_search(cast(httpx.Client, Client()), "petal ariana grande", "album")
    assert rows[0]["title"] == "petal"
    assert rows[0]["extra"]["release_group_id"] == "2b8f453f-ffd6-4860-8742-7cff1c2feae3"
    assert (
        rows[0]["artwork_url"]
        == "https://coverartarchive.org/release-group/2b8f453f-ffd6-4860-8742-7cff1c2feae3/front-250"
    )


def test_saving_an_album_does_not_insert_its_songs(client, monkeypatch, tmp_path):
    _forbid_catalog(monkeypatch)
    created = client.post(
        "/api/library/from-provider",
        json={
            "source": "musicbrainz",
            "source_id": "0ea273f2-a76b-4ff5-8cd9-f54ba2f290fe",
            "kind": "album",
            "title": "petal",
            "creator": "Ariana Grande",
            "year": 2026,
            "artwork_url": "https://coverartarchive.org/release/0ea273f2-a76b-4ff5-8cd9-f54ba2f290fe/front-250",
            "extra": {"release_group_id": "2b8f453f-ffd6-4860-8742-7cff1c2feae3"},
            "status": "want",
        },
    )
    assert created.status_code == 200, created.text
    body = created.json()
    assert body["rating"] is None
    assert (
        body["artwork_url"]
        == "https://coverartarchive.org/release/0ea273f2-a76b-4ff5-8cd9-f54ba2f290fe/front-250"
    )
    assert body["music"]["albums"][0]["tracks"] == []
    added = client.post(
        f"/api/entries/{body['id']}/albums/{body['id']}/tracks",
        json={"title": "kiss me"},
    )
    assert added.status_code == 200, added.text
    song = added.json()["music"]["albums"][0]["tracks"][0]
    assert song["title"] == "kiss me"
    rated = client.post(
        f"/api/entries/{body['id']}/tracks/{song['id']}/rating",
        json={"rating": 8},
    ).json()
    assert rated["rating"] is None
    assert rated["music"]["albums"][0]["tracks"][0]["rating"] == 8
    again = client.get(f"/api/entries/{body['id']}").json()
    assert [track["title"] for track in again["music"]["albums"][0]["tracks"]] == ["kiss me"]
    stored = sqlite3.connect(tmp_path / "media.db")
    assert stored.execute("select count(*) from music_tracks").fetchone() == (0,)
    assert stored.execute(
        "select catalog_items.kind from user_entries "
        "join catalog_items on catalog_items.id = user_entries.catalog_id "
        "order by user_entries.id"
    ).fetchall() == [("album",), ("track",)]


def test_disc_two_keeps_its_place_in_the_song_order():
    from apps.media.backend.services.providers import _tracks_from_release

    tracks = _tracks_from_release(
        {
            "media": [
                {
                    "tracks": [
                        {"title": "One", "position": 1, "recording": {"id": "a"}},
                        {"title": "Two", "position": 2, "recording": {"id": "b"}},
                    ]
                },
                {
                    "tracks": [
                        {"title": "Three", "position": 1, "recording": {"id": "c"}},
                    ]
                },
            ]
        }
    )
    assert [(row["title"], row["position"]) for row in tracks] == [
        ("One", 1),
        ("Two", 2),
        ("Three", 3),
    ]


def test_metadata_rows_are_not_library_membership(client, tmp_path):
    artist = client.post(
        "/api/library",
        json={"kind": "artist", "title": "Artist A", "status": "want", "rating": 5},
    ).json()
    album = client.post(
        f"/api/entries/{artist['id']}/albums", json={"title": "A1", "year": 1999}
    ).json()
    album_id = album["music"]["albums"][0]["id"]
    song = client.post(
        f"/api/entries/{artist['id']}/albums/{album_id}/tracks", json={"title": "A2"}
    ).json()
    song_id = song["music"]["albums"][0]["tracks"][0]["id"]
    client.post(f"/api/entries/{artist['id']}/albums/{album_id}/rating", json={"rating": 6})
    client.post(f"/api/entries/{artist['id']}/tracks/{song_id}/rating", json={"rating": 4})

    stored = sqlite3.connect(tmp_path / "media.db")
    catalog_id = artist["catalog"]["id"]
    stored.execute(
        "INSERT INTO music_albums (catalog_id, title, year, source_id, position) "
        "VALUES (?, 'Fetched', 2001, 'rg-fetched', 0)",
        (catalog_id,),
    )
    legacy_album = stored.execute("select last_insert_rowid()").fetchone()[0]
    stored.execute(
        "INSERT INTO music_tracks (album_id, title, position, source_id) "
        "VALUES (?, 'B1', 1, 'rec-fetched')",
        (legacy_album,),
    )
    stored.execute(
        "INSERT INTO catalog_items (kind, title, source, source_id, created_at, updated_at) "
        "VALUES ('album', 'Linked Only', 'musicbrainz', 'rg-linked', '2020-01-01', '2020-01-01')"
    )
    linked = stored.execute("select last_insert_rowid()").fetchone()[0]
    stored.execute(
        "INSERT INTO music_links (parent_catalog_id, child_catalog_id, relation, namespace, "
        "position, provenance) VALUES (?, ?, 'artist-release-group', "
        "'musicbrainz:release-group', 0, 'provider-release-group')",
        (catalog_id, linked),
    )
    stored.commit()

    detail = client.get(f"/api/entries/{artist['id']}").json()
    assert [row["title"] for row in detail["music"]["albums"]] == ["A1"]
    assert [row["title"] for row in detail["music"]["albums"][0]["tracks"]] == ["A2"]
    library = client.get("/api/library").json()["items"]
    assert sorted(item["title"] for item in library) == ["A1", "A2", "Artist A"]
    artist_card = next(item for item in library if item["kind"] == "artist")
    assert artist_card["saved_count"] == 2
    assert "music" not in artist_card
    assert client.get("/api/library", params={"kind": "album"}).json()["items"][0]["title"] == "A1"
    assert client.get("/api/library", params={"kind": "track"}).json()["items"][0]["title"] == "A2"
    assert stored.execute("select count(*) from user_entries").fetchone() == (3,)

    other = client.post(
        "/api/library", json={"kind": "artist", "title": "Artist A", "status": "want"}
    ).json()
    other_album = client.post(
        f"/api/entries/{other['id']}/albums", json={"title": "A1", "year": 2004}
    ).json()
    assert other_album["music"]["albums"][0]["id"] != album_id
    assert [
        row["title"] for row in client.get(f"/api/entries/{artist['id']}").json()["music"]["albums"]
    ] == ["A1"]
    assert client.get(f"/api/entries/{other['id']}").json()["music"]["albums"][0]["year"] == 2004


def test_removing_a_parent_keeps_saved_children(client):
    artist = client.post(
        "/api/library",
        json={"kind": "artist", "title": "A", "status": "want", "rating": 9, "review": "Kept."},
    ).json()
    with_album = client.post(
        f"/api/entries/{artist['id']}/albums", json={"title": "A1", "year": 2000}
    ).json()
    album_id = with_album["music"]["albums"][0]["id"]
    with_song = client.post(
        f"/api/entries/{artist['id']}/albums/{album_id}/tracks", json={"title": "A2"}
    ).json()
    song_id = with_song["music"]["albums"][0]["tracks"][0]["id"]
    client.post(f"/api/entries/{artist['id']}/albums/{album_id}/rating", json={"rating": 6})
    client.post(f"/api/entries/{artist['id']}/tracks/{song_id}/rating", json={"rating": 4})

    removed_album = client.delete(f"/api/entries/{album_id}")
    assert removed_album.status_code == 200
    left = client.get("/api/library").json()["items"]
    assert sorted(item["title"] for item in left) == ["A", "A2"]
    artist_body = client.get(f"/api/entries/{artist['id']}").json()
    assert artist_body["rating"] == 9
    assert artist_body["review"] == "Kept."
    assert artist_body["music"]["albums"] == []
    assert client.get(f"/api/entries/{song_id}").json()["rating"] == 4

    assert client.delete(f"/api/entries/{artist['id']}").status_code == 200
    assert [item["title"] for item in client.get("/api/library").json()["items"]] == ["A2"]
    assert client.get(f"/api/entries/{song_id}").json()["rating"] == 4

    missed = client.post(f"/api/entries/{artist['id']}/albums/999/rating", json={"rating": 5})
    assert missed.status_code == 404
    assert [item["title"] for item in client.get("/api/library").json()["items"]] == ["A2"]


def test_two_users_keep_independent_music_membership(client):
    from apps.server.auth import Principal, require_principal

    body = {
        "source": "musicbrainz",
        "source_id": "rg-shared",
        "kind": "album",
        "title": "Shared",
        "creator": "Ada",
        "rating": 8,
        "review": "Mine.",
        "status": "completed",
    }
    first = client.post("/api/library/from-provider", json=body).json()
    client.app.dependency_overrides[require_principal] = lambda: Principal(2, "other", "Other")
    assert client.get(f"/api/entries/{first['id']}").status_code == 404
    second = client.post(
        "/api/library/from-provider",
        json={**body, "rating": 2, "review": "Theirs.", "status": "paused"},
    ).json()
    assert second["already_saved"] is False
    assert second["id"] != first["id"]
    assert second["rating"] == 2
    assert second["review"] == "Theirs."
    assert second["status"] == "paused"
    assert [item["id"] for item in client.get("/api/library").json()["items"]] == [second["id"]]
    client.app.dependency_overrides[require_principal] = lambda: Principal(1, "tester", "Tester")
    again = client.get(f"/api/entries/{first['id']}").json()
    assert again["rating"] == 8
    assert again["review"] == "Mine."
    assert again["status"] == "completed"


def test_discography_browse_does_not_insert_membership(client, monkeypatch, tmp_path):
    seen = []

    def catalog(_http, artist_id, group_offset=0, release_offset=0, max_pages=1):
        seen.append((artist_id, group_offset, release_offset, max_pages))
        return {
            "partial": True,
            "group_offset": group_offset + 100,
            "release_offset": release_offset,
            "albums": [
                "skip",
                {
                    "source_id": "rg-b",
                    "title": "B",
                    "year": 2010,
                    "artwork_url": "https://coverartarchive.org/release-group/rg-b/front-250",
                    "tracks": [
                        {"source_id": "rec-b1", "title": "B1", "position": 1},
                        "nope",
                    ],
                },
                {
                    "title": 12,
                    "year": "nope",
                    "artwork_url": None,
                    "tracks": [{"title": 5, "position": "x"}],
                },
            ],
        }

    monkeypatch.setattr("apps.media.backend.services.providers.musicbrainz_artist_catalog", catalog)
    artist = client.post(
        "/api/library/from-provider",
        json={
            "source": "musicbrainz",
            "source_id": "artist-a",
            "kind": "artist",
            "title": "Artist A",
            "status": "want",
        },
    ).json()
    assert artist["music"]["albums"] == []
    page = client.get(
        f"/api/entries/{artist['id']}/discography",
        params={"group_offset": 100, "release_offset": 25},
    )
    assert page.status_code == 200, page.text
    assert seen == [("artist-a", 100, 25, 1)]
    body = page.json()
    assert body["partial"] is True
    assert body["group_offset"] == 200
    assert body["albums"] == [
        {
            "source_id": "rg-b",
            "title": "B",
            "year": 2010,
            "artwork_url": "https://coverartarchive.org/release-group/rg-b/front-250",
            "saved": False,
            "tracks": [
                {"source_id": "rec-b1", "title": "B1", "position": 1, "saved": False},
            ],
        },
        {
            "source_id": None,
            "title": "Untitled",
            "year": None,
            "artwork_url": None,
            "saved": False,
            "tracks": [
                {"source_id": None, "title": "Untitled", "position": None, "saved": False},
            ],
        },
    ]
    assert client.get(f"/api/entries/{artist['id']}").json()["music"]["albums"] == []
    assert [item["title"] for item in client.get("/api/library").json()["items"]] == ["Artist A"]
    stored = sqlite3.connect(tmp_path / "media.db")
    assert stored.execute("select count(*) from user_entries").fetchone() == (1,)
    assert stored.execute("select count(*) from music_albums").fetchone() == (0,)
    assert stored.execute("select count(*) from catalog_items").fetchone() == (1,)
    stored.close()

    saved = client.post(
        "/api/library/from-provider",
        json={
            "source": "musicbrainz",
            "source_id": "rg-b",
            "kind": "album",
            "title": "B",
            "creator": "Artist A",
            "status": "want",
        },
    ).json()
    marked = client.get(f"/api/entries/{artist['id']}/discography").json()
    assert marked["albums"][0]["saved"] is True
    assert marked["albums"][0]["saved_id"] == saved["id"]
    stored = sqlite3.connect(tmp_path / "media.db")
    assert stored.execute("select count(*) from music_albums").fetchone() == (0,)
    assert stored.execute("select count(*) from user_entries").fetchone() == (2,)
    stored.close()

    book = client.post("/api/library", json={"kind": "book", "title": "Dune", "status": "want"})
    assert client.get(f"/api/entries/{book.json()['id']}/discography").status_code == 422
    assert (
        client.get(
            f"/api/entries/{artist['id']}/discography", params={"group_offset": -1}
        ).status_code
        == 422
    )

    def down(*_args, **_kwargs):
        raise RuntimeError("provider down")

    monkeypatch.setattr("apps.media.backend.services.providers.musicbrainz_artist_catalog", down)
    failed = client.get(f"/api/entries/{artist['id']}/discography")
    assert failed.status_code == 503
    stored = sqlite3.connect(tmp_path / "media.db")
    assert stored.execute("select count(*) from user_entries").fetchone() == (3,)
    stored.close()

    def empty(*_args, **_kwargs):
        return None

    monkeypatch.setattr("apps.media.backend.services.providers.musicbrainz_artist_catalog", empty)
    assert client.get(f"/api/entries/{artist['id']}/discography").status_code == 503


def test_a_score_does_not_create_membership(client, tmp_path):
    created = client.post(
        "/api/library", json={"kind": "artist", "title": "Left", "status": "dropped"}
    )
    assert created.status_code == 200, created.text
    artist_id = created.json()["id"]
    stored = sqlite3.connect(tmp_path / "media.db")
    assert stored.execute("select followed, follow_provenance from user_entries").fetchone() == (
        0,
        "explicit",
    )
    stored.close()
    assert client.get("/api/library").json()["items"][0]["saved_count"] == 0
    book = client.post(
        "/api/library", json={"kind": "book", "title": "Dune", "status": "want"}
    ).json()
    assert client.post(f"/api/entries/{book['id']}/albums", json={"title": "No"}).status_code == 422
    assert (
        client.post(
            f"/api/entries/{artist_id}/albums/{artist_id}/rating", json={"rating": 1}
        ).status_code
        == 404
    )
    added = client.post(
        f"/api/entries/{artist_id}/albums", json={"title": "Kept", "year": 2001}
    ).json()
    album_id = added["music"]["albums"][0]["id"]
    assert (
        client.post(f"/api/entries/{artist_id}/albums/{album_id}/rating", json={}).status_code
        == 422
    )
    assert added["music"]["albums"][0]["rating"] is None
    second = client.post(f"/api/entries/{artist_id}/albums", json={"title": "Also"}).json()
    assert [row["title"] for row in second["music"]["albums"]] == ["Kept", "Also"]
    song = client.post(
        f"/api/entries/{artist_id}/albums/{album_id}/tracks", json={"title": "Only"}
    ).json()
    song_id = song["music"]["albums"][0]["tracks"][0]["id"]
    assert (
        client.post(f"/api/entries/{artist_id}/tracks/{song_id}/rating", json={}).status_code == 422
    )
    assert (
        client.post(
            f"/api/entries/{album_id}/albums/{album_id}/rating", json={"rating": 3}
        ).status_code
        == 422
    )
    other = client.post(
        "/api/library", json={"kind": "artist", "title": "Other", "status": "want"}
    ).json()
    assert (
        client.post(
            f"/api/entries/{other['id']}/tracks/{song_id}/rating", json={"rating": 9}
        ).status_code
        == 404
    )
    assert client.get(f"/api/entries/{song_id}").json()["rating"] is None
    titles = sorted(item["title"] for item in client.get("/api/library").json()["items"])
    assert titles == ["Also", "Dune", "Kept", "Left", "Only", "Other"]


def test_studio_browse_names_the_releases_it_leaves_out():
    from apps.media.backend.services.providers import musicbrainz_artist_catalog

    groups = [
        {
            "id": "rg-studio",
            "title": "Studio",
            "primary-type": "Album",
            "first-release-date": "1999",
        },
        {
            "id": "rg-live",
            "title": "Live",
            "primary-type": "Album",
            "secondary-types": ["Live"],
            "first-release-date": "2001",
        },
        {
            "id": "rg-single",
            "title": "Single",
            "primary-type": "Single",
            "first-release-date": "2002",
        },
        {
            "id": "rg-comp",
            "title": "Comp",
            "primary-type": "Album",
            "secondary-types": ["Compilation"],
            "first-release-date": "1990",
        },
        {"id": "rg-bare", "title": "Bare"},
    ]

    class Response:
        def __init__(self, body):
            self.body = body

        def raise_for_status(self):
            return None

        def json(self):
            return self.body

    class Http:
        def __init__(self):
            self.calls = []

        def get(self, url, params=None):
            self.calls.append((url, dict(params or {})))
            if url.endswith("/release-group"):
                return Response({"release-groups": groups, "release-group-count": len(groups)})
            return Response({"releases": [], "release-count": 0})

    studio_http = Http()
    studio = musicbrainz_artist_catalog(studio_http, "artist-a")
    assert [row["title"] for row in studio["albums"]] == ["Studio", "Bare"]
    assert studio_http.calls[0][1]["type"] == "album"
    live_http = Http()
    live = musicbrainz_artist_catalog(live_http, "artist-a", release_type="live")
    assert [row["title"] for row in live["albums"]] == ["Live", "Bare"]
    assert live_http.calls[0][1]["type"] == "live"
    single = musicbrainz_artist_catalog(Http(), "artist-a", release_type="single")
    assert [row["title"] for row in single["albums"]] == ["Single", "Bare"]


def test_discography_save_keeps_one_song_without_its_album(client, monkeypatch, tmp_path):
    seen = []

    def catalog(_http, artist_id, group_offset=0, release_offset=0, max_pages=1, release_type=None):
        seen.append(release_type)
        return {"partial": False, "group_offset": 0, "release_offset": 0, "albums": []}

    monkeypatch.setattr("apps.media.backend.services.providers.musicbrainz_artist_catalog", catalog)
    artist = client.post(
        "/api/library/from-provider",
        json={
            "source": "musicbrainz",
            "source_id": "artist-a",
            "kind": "artist",
            "title": "Artist A",
            "status": "want",
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
        "/api/library", json={"kind": "artist", "title": "Artist A", "status": "want"}
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
