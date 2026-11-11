"""MED-08: one catalog identity lookup and one personal command path.

Shared catalog rows stay global. Notes, ratings, progress and Undo stay with
the owner. Ordinary saved reads do not repair or call a provider.
"""

import sqlite3

from sqlalchemy import event

from apps.media.backend.models import CatalogItem, UserEntry
from apps.media.backend.services import providers, records
from apps.server.auth import Principal, require_principal


def _owner(client, user_id, username):
    client.app.dependency_overrides[require_principal] = lambda: Principal(
        user_id, username, username
    )


def _counts(client):
    url = client.app.state.database.url.removeprefix("sqlite:///")
    stored = sqlite3.connect(url)
    try:
        catalogs = stored.execute("select count(*) from catalog_items").fetchone()[0]
        entries = stored.execute("select count(*) from user_entries").fetchone()[0]
    finally:
        stored.close()
    return catalogs, entries


def _catalog_id(client, source_id):
    with client.app.state.database.sessionmaker() as db:
        row = (
            db.query(CatalogItem)
            .filter(CatalogItem.source == "musicbrainz", CatalogItem.source_id == source_id)
            .one()
        )
        return row.id


def _save_artist(client):
    saved = client.post(
        "/api/library/from-provider",
        json={
            "source": "musicbrainz",
            "source_id": "artist-shared",
            "kind": "artist",
            "title": "Shared Artist",
            "status": "following",
            "review": "Following note",
            "rating": 9,
        },
    )
    assert saved.status_code == 200, saved.text
    return saved.json()


def _contains(value, needle):
    if value == needle:
        return True
    if isinstance(value, (list, tuple)):
        return any(_contains(item, needle) for item in value)
    if isinstance(value, dict):
        return any(_contains(item, needle) for item in value.values())
    return False


def _selects(engine, call):
    seen = []

    def record(_connection, _cursor, statement, parameters, _context, _many):
        seen.append((statement, parameters))

    event.listen(engine, "before_cursor_execute", record)
    try:
        response = call()
    finally:
        event.remove(engine, "before_cursor_execute", record)
    return response, seen


def test_record1_two_owners_share_one_catalog_and_keep_personal_commands(client):
    """Add, edit, no-op, complete and delete stay on the owner's entry."""
    artist = _save_artist(client)
    album = client.post(
        f"/api/entries/{artist['id']}/discography",
        json={"kind": "album", "source_id": "rg-shared", "title": "Shared Album", "year": 2001},
    )
    assert album.status_code == 200, album.text
    assert album.json()["already_saved"] is False
    assert album.json()["kind"] == "album"
    album_id = album.json()["id"]
    edited = client.patch(
        f"/api/entries/{album_id}",
        json={
            "rating": 8,
            "review": "Owner one album",
            "status": "in_progress",
            "progress_value": 3,
            "progress_unit": "episode",
        },
    )
    assert edited.status_code == 200, edited.text
    assert edited.json()["progress_label"] == "Episode 3"
    song = client.post(
        f"/api/entries/{artist['id']}/discography",
        json={
            "kind": "track",
            "source_id": "rec-shared",
            "title": "Shared Song",
            "album_source_id": "rg-shared",
            "album_title": "Shared Album",
            "position": 1,
        },
    )
    assert song.status_code == 200, song.text
    assert song.json()["kind"] == "track"
    song_id = song.json()["id"]
    rated_song = client.patch(f"/api/entries/{song_id}", json={"rating": 5, "status": "completed"})
    assert rated_song.status_code == 200, rated_song.text
    catalog_id = _catalog_id(client, "rg-shared")
    music = client.get(f"/api/entries/{artist['id']}").json()["music"]
    assert music["albums"][0]["id"] == album_id
    assert music["albums"][0]["tracks"] == [
        {"id": song_id, "title": "Shared Song", "position": 1, "rating": 5}
    ]
    assert music["albums"][0]["title"] == "Shared Album"
    assert set(music["albums"][0]) == {"id", "title", "year", "artwork_url", "rating", "tracks"}

    _owner(client, 2, "other")
    assert client.get(f"/api/entries/{album_id}").status_code == 404
    second_artist = _save_artist(client)
    assert second_artist["id"] != artist["id"]
    assert second_artist["review"] == "Following note"
    second = client.post(
        "/api/library/from-provider",
        json={
            "source": "musicbrainz",
            "source_id": "rg-shared",
            "kind": "album",
            "title": "Shared Album",
            "status": "paused",
            "rating": 2,
            "review": "Owner two album",
        },
    )
    assert second.status_code == 200, second.text
    assert second.json()["already_saved"] is False
    assert second.json()["id"] != album_id
    assert second.json()["catalog"]["id"] == catalog_id
    assert second.json()["rating"] == 2
    assert second.json()["review"] == "Owner two album"
    assert second.json()["progress_value"] is None
    other_song = client.post(
        f"/api/entries/{second_artist['id']}/discography",
        json={
            "kind": "track",
            "source_id": "rec-other",
            "title": "Other Song",
            "album_source_id": "rg-shared",
            "album_title": "A different title must not replace the catalog",
            "position": 2,
        },
    )
    assert other_song.status_code == 200, other_song.text
    assert _catalog_id(client, "rg-shared") == catalog_id
    with client.app.state.database.sessionmaker() as db:
        stored = db.get(CatalogItem, catalog_id)
        assert stored.title == "Shared Album"
        assert db.query(CatalogItem).filter(CatalogItem.source_id == "rg-shared").count() == 1

    _owner(client, 1, "tester")
    current = client.get(f"/api/entries/{album_id}").json()
    assert current["review"] == "Owner one album"
    assert current["rating"] == 8
    assert current["status"] == "in_progress"
    replay = client.patch(
        f"/api/entries/{album_id}",
        json={"review": "Owner one album", "review_base": ""},
    )
    assert replay.status_code == 200, replay.text
    assert replay.json()["review_updated_at"] == current["review_updated_at"]
    assert replay.json()["updated_at"] == current["updated_at"]
    stale = client.patch(
        f"/api/entries/{album_id}",
        json={"review": "replaced", "review_base": "2000-01-01T00:00:00+00:00"},
    )
    assert stale.status_code == 409, stale.text
    assert client.get(f"/api/entries/{album_id}").json()["review"] == "Owner one album"
    for unit, value, label in (
        ("page", 12, "p. 12"),
        ("percent", 40, "40%"),
        ("episode", 4, "Episode 4"),
        ("hour", 1.5, "1.5 h"),
    ):
        moved = client.patch(
            f"/api/entries/{album_id}",
            json={"progress_value": value, "progress_unit": unit},
        )
        assert moved.status_code == 200, moved.text
        assert moved.json()["progress_unit"] == unit
        assert moved.json()["progress_label"] == label
    held = moved.json()
    same_progress = client.patch(
        f"/api/entries/{album_id}",
        json={"progress_value": 1.5, "progress_unit": "hour"},
    )
    assert same_progress.status_code == 200, same_progress.text
    assert same_progress.json()["updated_at"] == held["updated_at"]
    completed = client.patch(f"/api/entries/{album_id}", json={"status": "completed"})
    assert completed.status_code == 200, completed.text
    cleared = client.patch(f"/api/entries/{album_id}", json={"rating": None})
    assert cleared.status_code == 200, cleared.text
    assert cleared.json()["rating"] is None
    assert cleared.json()["status"] == "completed"
    song_cleared = client.patch(f"/api/entries/{song_id}", json={"rating": None})
    assert song_cleared.status_code == 200, song_cleared.text
    assert song_cleared.json()["rating"] is None

    _owner(client, 2, "other")
    theirs = client.get(f"/api/entries/{second.json()['id']}").json()
    assert theirs["rating"] == 2
    assert theirs["review"] == "Owner two album"
    assert theirs["status"] == "paused"
    assert theirs["catalog"]["id"] == catalog_id
    assert theirs["catalog"]["title"] == "Shared Album"
    removed = client.delete(f"/api/entries/{second.json()['id']}")
    assert removed.status_code == 200, removed.text
    assert client.get(f"/api/entries/{second.json()['id']}").status_code == 404
    _owner(client, 1, "tester")
    kept = client.get(f"/api/entries/{album_id}").json()
    assert kept["review"] == "Owner one album"
    assert kept["status"] == "completed"
    assert kept["catalog"]["id"] == catalog_id
    assert client.get(f"/api/entries/{song_id}").json()["title"] == "Shared Song"
    with client.app.state.database.sessionmaker() as db:
        assert db.get(CatalogItem, catalog_id) is not None
        assert (
            db.query(UserEntry)
            .filter(UserEntry.catalog_id == catalog_id, UserEntry.user_id == 2)
            .count()
            == 0
        )
        assert (
            db.query(UserEntry)
            .filter(UserEntry.catalog_id == catalog_id, UserEntry.user_id == 1)
            .count()
            == 1
        )


def test_record1_episode_season_album_and_track_undo(client, monkeypatch):
    """Episode Undo, season clear, and album/track rating clear stay personal."""
    monkeypatch.setenv("MEDIA_TODAY", "2026-11-10")
    show = client.post(
        "/api/library",
        json={
            "kind": "tv",
            "title": "Undo Show",
            "status": "in_progress",
            "review": "Show note",
            "rating": 7,
        },
    )
    assert show.status_code == 200, show.text
    show_id = show.json()["id"]
    added = client.post(
        f"/api/entries/{show_id}/episodes",
        json={
            "season_number": 1,
            "episode_number": 1,
            "title": "Pilot",
            "air_date": "2026-10-01",
        },
    )
    assert added.status_code == 200, added.text
    episode_id = added.json()["show"]["episodes"][0]["id"]
    path = f"/api/entries/{show_id}"
    caught = client.post(path + "/caught-up", json={})
    assert caught.status_code == 200, caught.text
    token = caught.json()["operation"]["operation_token"]
    assert caught.json()["operation"]["changed_ids"] == [episode_id]
    assert caught.json()["review"] == "Show note"
    again = client.post(path + "/caught-up", json={})
    assert again.json()["operation"]["changed_ids"] == []
    _owner(client, 2, "other")
    assert client.post(path + f"/caught-up/{token}/undo").status_code == 404
    _owner(client, 1, "tester")
    undone = client.post(path + f"/caught-up/{token}/undo")
    assert undone.status_code == 200, undone.text
    assert undone.json()["undo"]["undone_ids"] == [episode_id]
    assert undone.json()["undo"]["already_undone"] is False
    episode = next(row for row in undone.json()["show"]["episodes"] if row["id"] == episode_id)
    assert episode["watched"] is False
    assert client.post(path + f"/caught-up/{token}/undo").json()["undo"]["already_undone"] is True

    watched = client.post(
        path + "/seasons",
        json={"season_number": 1, "watched": True, "rating": 4},
    )
    assert watched.status_code == 200, watched.text
    assert watched.json()["rating"] == 7
    assert watched.json()["review"] == "Show note"
    season = next(row for row in watched.json()["show"]["seasons"] if row["season_number"] == 1)
    assert season["watched"] is True
    assert season["rating"] == 4
    cleared = client.post(
        path + "/seasons",
        json={"season_number": 1, "watched": False, "rating": None},
    )
    assert cleared.status_code == 200, cleared.text
    assert cleared.json()["review"] == "Show note"
    season = next(row for row in cleared.json()["show"]["seasons"] if row["season_number"] == 1)
    assert season["watched"] is False
    assert season["rating"] is None

    artist = client.post(
        "/api/library",
        json={
            "kind": "artist",
            "title": "Undo Artist",
            "status": "following",
            "rating": 9,
            "review": "Artist note",
        },
    ).json()
    with_album = client.post(
        f"/api/entries/{artist['id']}/albums",
        json={"title": "Undo Album", "year": 1991},
    )
    assert with_album.status_code == 200, with_album.text
    album_id = with_album.json()["music"]["albums"][0]["id"]
    rated_album = client.post(
        f"/api/entries/{artist['id']}/albums/{album_id}/rating",
        json={"rating": 6},
    )
    assert rated_album.status_code == 200, rated_album.text
    assert rated_album.json()["rating"] == 9
    assert rated_album.json()["review"] == "Artist note"
    assert rated_album.json()["music"]["albums"][0]["rating"] == 6
    album_cleared = client.patch(f"/api/entries/{album_id}", json={"rating": None})
    assert album_cleared.json()["rating"] is None
    assert client.get(f"/api/entries/{artist['id']}").json()["rating"] == 9
    with_track = client.post(
        f"/api/entries/{artist['id']}/albums/{album_id}/tracks",
        json={"title": "Undo Song"},
    )
    assert with_track.status_code == 200, with_track.text
    track_id = with_track.json()["music"]["albums"][0]["tracks"][0]["id"]
    rated_track = client.post(
        f"/api/entries/{artist['id']}/tracks/{track_id}/rating",
        json={"rating": 4},
    )
    assert rated_track.json()["music"]["albums"][0]["tracks"][0]["rating"] == 4
    assert rated_track.json()["rating"] == 9
    track_cleared = client.patch(f"/api/entries/{track_id}", json={"rating": None})
    assert track_cleared.json()["rating"] is None
    parent = client.get(f"/api/entries/{artist['id']}").json()
    assert parent["rating"] == 9
    assert parent["review"] == "Artist note"
    assert parent["music"]["albums"][0]["rating"] is None
    assert parent["music"]["albums"][0]["tracks"][0]["rating"] is None


def test_record2_rollback_conflict_owner_and_bounded_reads(client, monkeypatch):
    """A rejected write leaves no row. Saved pages stay database-only."""
    artist = _save_artist(client)
    taken = client.post(
        "/api/library/from-provider",
        json={
            "source": "musicbrainz",
            "source_id": "rec-taken",
            "kind": "track",
            "title": "Taken",
            "status": "want",
        },
    )
    assert taken.status_code == 200, taken.text
    before = _counts(client)
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
    assert rejected.status_code == 422, rejected.text
    assert rejected.json()["detail"] == "That provider id is already a different type."
    assert _counts(client) == before
    assert client.get(f"/api/entries/{taken.json()['id']}").json()["kind"] == "track"

    book = client.post("/api/library", json={"kind": "book", "title": "Rollback Book"})
    assert book.status_code == 200, book.text
    first = client.patch(f"/api/entries/{book.json()['id']}", json={"review": "one"})
    base = first.json()["review_updated_at"]
    second = client.patch(
        f"/api/entries/{book.json()['id']}",
        json={"review": "two", "review_base": base},
    )
    assert second.status_code == 200, second.text
    stale = client.patch(
        f"/api/entries/{book.json()['id']}",
        json={"review": "three", "review_base": base},
    )
    assert stale.status_code == 409, stale.text
    assert client.get(f"/api/entries/{book.json()['id']}").json()["review"] == "two"

    def reject_commit(_session):
        raise RuntimeError("synthetic commit failure")

    event.listen(client.app.state.database.sessionmaker, "before_commit", reject_commit)
    try:
        failed = client.post("/api/library", json={"kind": "book", "title": "Must not stick"})
    finally:
        event.remove(client.app.state.database.sessionmaker, "before_commit", reject_commit)
    assert failed.status_code == 500, failed.text
    titles = [item["title"] for item in client.get("/api/library").json()["items"]]
    assert "Must not stick" not in titles
    retried = client.post("/api/library", json={"kind": "book", "title": "Must not stick"})
    assert retried.status_code == 200, retried.text
    titles = [item["title"] for item in client.get("/api/library").json()["items"]]
    assert titles.count("Must not stick") == 1

    for index in range(3):
        added = client.post("/api/library", json={"kind": "book", "title": f"Page {index}"})
        assert added.status_code == 200, added.text

    def forbidden(*_args, **_kwargs):
        raise AssertionError("a saved read called a provider or repair")

    monkeypatch.setattr(providers, "lookup_detail", forbidden)
    monkeypatch.setattr(records, "repair_musicbrainz_albums", forbidden)
    monkeypatch.setattr(records, "finish_album_refresh", forbidden)
    monkeypatch.setattr(records, "_apply_authoritative", forbidden)

    def page(offset):
        response, statements = _selects(
            client.app.state.database.engine,
            lambda: client.get(
                "/api/library",
                params={"kind": "book", "sort": "title", "limit": 1, "offset": offset},
            ),
        )
        assert response.status_code == 200, response.text
        writes = [
            statement
            for statement, _parameters in statements
            if not statement.lstrip().upper().startswith("SELECT")
        ]
        assert writes == []
        assert len(statements) <= 7
        return response.json()

    first_page = page(0)
    assert first_page["limit"] == 1
    assert len(first_page["items"]) == 1
    assert first_page["has_more"] is True
    assert first_page["total"] >= 4
    last = page(first_page["total"] - 1)
    assert last["has_more"] is False
    assert len(last["items"]) == 1
    detail, detail_sql = _selects(
        client.app.state.database.engine,
        lambda: client.get(f"/api/entries/{first_page['items'][0]['id']}"),
    )
    assert detail.status_code == 200, detail.text
    assert all(
        statement.lstrip().upper().startswith("SELECT") for statement, _parameters in detail_sql
    )
    summary = client.get("/api/summary")
    assert summary.status_code == 200, summary.text

    _owner(client, 2, "other")
    foreign = client.get("/api/library", params={"kind": "book", "limit": 1})
    assert foreign.status_code == 200, foreign.text
    assert foreign.json()["total"] == 0
    assert client.get(f"/api/entries/{book.json()['id']}").status_code == 404
    _owner(client, 1, "tester")
    assert client.get(f"/api/entries/{book.json()['id']}").json()["review"] == "two"


def test_record3_public_album_uses_one_identity_lookup(client):
    """A saved song names an album through _catalog_by_source, once."""
    artist = _save_artist(client)
    album = client.post(
        f"/api/entries/{artist['id']}/discography",
        json={"kind": "album", "source_id": "rg-card", "title": "Card Album", "year": 2004},
    )
    assert album.status_code == 200, album.text
    album_id = album.json()["id"]
    response, statements = _selects(
        client.app.state.database.engine,
        lambda: client.post(
            f"/api/entries/{artist['id']}/discography",
            json={
                "kind": "track",
                "source_id": "rec-card",
                "title": "Card Song",
                "album_source_id": "rg-card",
                "album_title": "Card Album",
                "position": 1,
            },
        ),
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["already_saved"] is False
    assert set(body) == {
        "id",
        "kind",
        "title",
        "creator",
        "year",
        "artwork_url",
        "status",
        "rating",
        "favorite",
        "anticipated",
        "progress_value",
        "progress_unit",
        "progress_label",
        "updated_at",
        "review_updated_at",
        "already_saved",
    }
    assert body["kind"] == "track"
    assert body["title"] == "Card Song"
    identity_selects = [
        statement
        for statement, parameters in statements
        if statement.lstrip().upper().startswith("SELECT")
        and "catalog_items" in statement
        and _contains(parameters, "rg-card")
    ]
    assert len(identity_selects) == 1
    detail = client.get(f"/api/entries/{album_id}").json()
    assert detail["catalog"]["source"] == "musicbrainz"
    assert detail["catalog"]["source_id"] == "rg-card"
    assert detail["catalog"]["kind"] == "album"
    assert "source_id" not in body
    assert detail["music"]["albums"][0]["tracks"][0]["title"] == "Card Song"
    again = client.post(
        f"/api/entries/{artist['id']}/discography",
        json={"kind": "track", "source_id": "rec-card", "title": "Card Song"},
    )
    assert again.status_code == 200, again.text
    assert again.json()["already_saved"] is True
    assert again.json()["id"] == body["id"]

    loose = client.post(
        f"/api/entries/{artist['id']}/discography",
        json={
            "kind": "track",
            "source_id": "rec-loose",
            "title": "Loose Song",
            "album_source_id": "rg-public",
            "album_title": "Public Only",
            "position": 1,
        },
    )
    assert loose.status_code == 200, loose.text
    library = client.get("/api/library").json()["items"]
    assert "Public Only" not in {item["title"] for item in library}
    with client.app.state.database.sessionmaker() as db:
        public = (
            db.query(CatalogItem)
            .filter(CatalogItem.source == "musicbrainz", CatalogItem.source_id == "rg-public")
            .one()
        )
        assert public.kind == "album"
        assert public.title == "Public Only"
        assert db.query(UserEntry).filter(UserEntry.catalog_id == public.id).count() == 0
        assert db.query(CatalogItem).filter(CatalogItem.source_id == "rg-card").count() == 1
