"""Saved albums and songs share one canonical artist, without a follow or a discography."""

import pytest
from fastapi import HTTPException
from sqlalchemy.orm import aliased

from apps.media.backend.models import CatalogItem, MusicLink, UserEntry
from apps.media.backend.services import providers, records, summary
from apps.media.backend.services.providers import (
    VARIOUS_ARTISTS_MBID,
    artist_credits,
    primary_artist_id,
)

NORTH = "11111111-1111-4111-8111-111111111111"
SOUTH = "22222222-2222-4222-8222-222222222222"
GUEST = "33333333-3333-4333-8333-333333333333"
OTHER = "44444444-4444-4444-8444-444444444444"
GROUP = "55555555-5555-4555-8555-555555555555"
PRESSING = "66666666-6666-4666-8666-666666666666"
SONG = "77777777-7777-4777-8777-777777777777"
COMP_GROUP = "88888888-8888-4888-8888-888888888888"
COMP_SONG = "99999999-9999-4999-8999-999999999999"
COLLAB_GROUP = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaab"
FEATURE_GROUP = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbc"
UNKNOWN_GROUP = "cccccccc-cccc-4ccc-8ccc-cccccccccccd"
SIMILAR_A = "dddddddd-dddd-4ddd-8ddd-ddddddddddde"
SIMILAR_B = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeef"
SIMILAR_GROUP_A = "12121212-1212-4121-8121-121212121212"
SIMILAR_GROUP_B = "13131313-1313-4131-8131-131313131313"


def test_credit_roles_do_not_collapse_on_a_shared_name():
    various = artist_credits(
        [
            {
                "name": "Various Artists",
                "artist": {"id": VARIOUS_ARTISTS_MBID, "name": "Various Artists"},
            }
        ]
    )
    assert various[0]["role"] == "various"
    assert various[0]["source_id"] == VARIOUS_ARTISTS_MBID
    named = artist_credits(
        [{"name": "Various Artists", "artist": {"id": OTHER, "name": "Various Artists"}}]
    )
    assert named[0]["role"] == "primary"
    assert named[0]["source_id"] == OTHER
    raw_featured = [
        {"name": "North Voice", "artist": {"id": NORTH}, "joinphrase": " feat. "},
        {"name": "Guest Voice", "artist": {"id": GUEST}},
    ]
    featured = artist_credits(raw_featured)
    assert [row["role"] for row in featured] == ["primary", "featured"]
    assert primary_artist_id(raw_featured) == NORTH
    collab = artist_credits(
        [
            {"name": "North Voice", "artist": {"id": NORTH}, "joinphrase": " & "},
            {"name": "South Voice", "artist": {"id": SOUTH}},
        ]
    )
    assert [row["role"] for row in collab] == ["primary", "collaboration"]
    unknown = artist_credits([{"name": "Someone Unlisted"}])
    assert unknown[0]["source_id"] is None
    assert primary_artist_id([{"name": "Someone Unlisted"}]) is None


def _stamp():
    return {
        "provider": "musicbrainz",
        "coverage": "official",
        "fetched_at": "2026-11-18T00:00:00+00:00",
    }


def _album_detail(source_id, group_id, raw_credit, title, primary_type="Album"):
    parsed = artist_credits(raw_credit)
    extra: dict[str, object] = {"release_group_id": group_id, "primary_type": primary_type}
    if source_id.casefold() != group_id.casefold():
        extra["release_id"] = source_id
    if parsed:
        extra["artist_credits"] = parsed
    artist_id = primary_artist_id(raw_credit)
    if artist_id:
        extra["artist_id"] = artist_id
    return {
        "source": "musicbrainz",
        "source_id": source_id,
        "kind": "album",
        "title": title,
        "creator": "Display Name Is Not Identity",
        "year": 2001,
        "overview": None,
        "artwork_url": None,
        "genres": [],
        "external_ratings": [],
        "extra": extra,
        "releases": [{"released_on": "2001-01-01", "precision": "day", "status": "released"}],
        "episodes": [],
        "provenance": _stamp(),
    }


def _track_detail(source_id, raw_credit, title):
    parsed = artist_credits(raw_credit)
    extra: dict[str, object] = {}
    if parsed:
        extra["artist_credits"] = parsed
    artist_id = primary_artist_id(raw_credit)
    if artist_id:
        extra["artist_id"] = artist_id
    return {
        "source": "musicbrainz",
        "source_id": source_id,
        "kind": "track",
        "title": title,
        "creator": "Display Name Is Not Identity",
        "year": None,
        "overview": None,
        "artwork_url": None,
        "genres": [],
        "external_ratings": [],
        "extra": extra,
        "releases": [],
        "episodes": [],
        "provenance": _stamp(),
    }


def _artist_detail(source_id, title):
    return {
        "source": "musicbrainz",
        "source_id": source_id,
        "kind": "artist",
        "title": title,
        "creator": None,
        "year": None,
        "overview": None,
        "artwork_url": None,
        "genres": [],
        "external_ratings": [],
        "extra": {},
        "releases": [],
        "episodes": [],
        "provenance": _stamp(),
    }


def _install(monkeypatch, albums, tracks=None):
    tracks = tracks or {}
    calls = []

    def lookup(_source, kind, source_id):
        calls.append((kind, source_id.casefold()))
        key = source_id.casefold()
        if kind == "album":
            return albums.get(key)
        if kind == "track":
            return tracks.get(key)
        if kind == "artist":
            return _artist_detail(key, "North Voice")
        raise AssertionError(kind)

    def forbidden(*_args, **_kwargs):
        raise AssertionError("grouping imported a discography")

    monkeypatch.setattr(providers, "lookup_detail", lookup)
    monkeypatch.setattr(providers, "musicbrainz_artist_catalog", forbidden)
    return calls


def _save_album(client, source_id, title, identity=None):
    body = {
        "source": "musicbrainz",
        "source_id": source_id,
        "kind": "album",
        "title": title,
        "status": "want",
    }
    if identity is not None:
        body["artist_identity"] = identity
    response = client.post("/api/library/from-provider", json=body)
    assert response.status_code == 200, response.text
    return response.json()


def _save_track(client, source_id, title):
    response = client.post(
        "/api/library/from-provider",
        json={
            "source": "musicbrainz",
            "source_id": source_id,
            "kind": "track",
            "title": title,
            "status": "want",
        },
    )
    assert response.status_code == 200, response.text
    return response.json()


def _links(client):
    parent = aliased(CatalogItem)
    child = aliased(CatalogItem)
    with client.app.state.database.sessionmaker() as db:
        rows = (
            db.query(parent, MusicLink, child)
            .join(MusicLink, MusicLink.parent_catalog_id == parent.id)
            .join(child, child.id == MusicLink.child_catalog_id)
            .all()
        )
    return [
        (left.source_id, left.title, link.relation, right.kind, right.title)
        for left, link, right in rows
    ]


def _artists(client):
    with client.app.state.database.sessionmaker() as db:
        rows = db.query(CatalogItem).filter(CatalogItem.kind == "artist").all()
    return [(row.source, row.source_id, row.title) for row in rows]


def _entries(client):
    with client.app.state.database.sessionmaker() as db:
        rows = (
            db.query(UserEntry, CatalogItem)
            .join(CatalogItem, CatalogItem.id == UserEntry.catalog_id)
            .all()
        )
    return [
        (
            entry.user_id,
            catalog.kind,
            catalog.title,
            catalog.source_id,
            entry.followed,
            entry.review,
        )
        for entry, catalog in rows
    ]


def _library(client, **params):
    response = client.get("/api/library", params=params)
    assert response.status_code == 200, response.text
    return response.json()["items"]


def _artist_catalog(client, source_id):
    with client.app.state.database.sessionmaker() as db:
        return (
            db.query(CatalogItem)
            .filter(CatalogItem.kind == "artist", CatalogItem.source_id == source_id)
            .one()
            .id
        )


def _north_credit(source_id=NORTH, name="North Voice", joinphrase=""):
    return {"name": name, "artist": {"id": source_id, "name": name}, "joinphrase": joinphrase}


def test_one_linked_album_has_one_membership_in_each_collection(client, monkeypatch):
    albums = {
        PRESSING: _album_detail(PRESSING, GROUP, [_north_credit(NORTH.upper())], "North Pressing"),
        GROUP: _album_detail(GROUP, GROUP, [_north_credit()], "North Pressing"),
    }
    tracks = {SONG: _track_detail(SONG, [_north_credit()], "North Single")}
    calls = _install(monkeypatch, albums, tracks)
    first = _save_album(
        client,
        PRESSING,
        "North Pressing",
        identity={"source": "manual", "source_id": "person-decoy", "name": "Decoy Voice"},
    )
    again = _save_album(client, PRESSING, "North Pressing")
    grouped = _save_album(client, GROUP, "North Pressing")
    song = _save_track(client, SONG, "North Single")
    assert again["id"] == first["id"]
    assert again["already_saved"] is True
    assert grouped["id"] == first["id"]
    assert {kind for kind, _source in calls} <= {"album", "track"}
    assert _artists(client) == [("musicbrainz", NORTH, "North Voice")]
    parents = {source_id for source_id, _title, _relation, kind, _name in _links(client)}
    assert parents == {NORTH}
    album_items = _library(client, kind="album")
    track_items = _library(client, kind="track")
    artist_items = _library(client, kind="artist")
    assert [item["title"] for item in album_items] == ["North Pressing"]
    assert [item["title"] for item in track_items] == ["North Single"]
    assert artist_items == []
    assert album_items[0]["id"] == first["id"]
    assert track_items[0]["id"] == song["id"]
    group = album_items[0]["artist_groups"]
    assert len(group) == 1
    assert group[0]["followed"] is False
    assert group[0]["entry_id"] is None
    assert group[0]["saved_count"] == 2
    assert track_items[0]["artist_groups"] == group
    opened = client.get(f"/api/music-groups/{group[0]['catalog_id']}")
    assert opened.status_code == 200, opened.text
    body = opened.json()
    assert body["followed"] is False
    assert [child["title"] for child in body["saved_children"]] == [
        "North Pressing",
        "North Single",
    ]
    assert len({child["id"] for child in body["saved_children"]}) == 2
    assert "person-decoy" not in {source_id for _source, source_id, _title in _artists(client)}
    book = _library(client, kind="book")
    assert book == []
    assert all("artist_groups" not in item for item in _library(client, kind="movie"))


def test_saving_before_follow_groups_the_album_and_skips_the_discography(client, monkeypatch):
    albums = {GROUP: _album_detail(GROUP, GROUP, [_north_credit()], "North Pressing")}
    calls = _install(monkeypatch, albums)
    saved = _save_album(client, GROUP, "North Pressing")
    assert calls == [("album", GROUP)]
    catalog_id = _artist_catalog(client, NORTH)
    group = client.get(f"/api/music-groups/{catalog_id}")
    assert group.status_code == 200, group.text
    assert group.json()["followed"] is False
    assert group.json()["entry_id"] is None
    assert [child["title"] for child in group.json()["saved_children"]] == ["North Pressing"]
    assert _library(client, kind="artist") == []
    followed = client.post(
        "/api/library/from-provider",
        json={
            "source": "musicbrainz",
            "source_id": NORTH.upper(),
            "kind": "artist",
            "title": "North Voice",
            "status": "following",
        },
    )
    assert followed.status_code == 200, followed.text
    assert calls == [("album", GROUP), ("artist", NORTH)]
    assert _artists(client) == [("musicbrainz", NORTH, "North Voice")]
    artists = _library(client, kind="artist")
    assert [item["title"] for item in artists] == ["North Voice"]
    assert artists[0]["status"] == "following"
    assert artists[0]["saved_count"] == 1
    albums_after = _library(client, kind="album")
    assert [item["title"] for item in albums_after] == ["North Pressing"]
    detail = client.get(f"/api/entries/{followed.json()['id']}")
    assert detail.status_code == 200, detail.text
    music = detail.json()["music"]
    assert [row["title"] for row in music["albums"]] == ["North Pressing"]
    assert music["songs"] == []
    assert [child["id"] for child in music["saved_children"]] == [saved["id"]]
    opened = client.get(f"/api/music-groups/{catalog_id}").json()
    assert opened["followed"] is True
    assert opened["entry_id"] == followed.json()["id"]
    assert [child["title"] for child in opened["saved_children"]] == ["North Pressing"]


def test_compilation_collaboration_feature_and_unknown_stay_distinct(client, monkeypatch):
    various_credit = [
        {
            "name": "Various Artists",
            "artist": {"id": VARIOUS_ARTISTS_MBID, "name": "Various Artists"},
        }
    ]
    named_various = [
        {"name": "Various Artists", "artist": {"id": OTHER, "name": "Various Artists"}}
    ]
    collab = [_north_credit(), _north_credit(SOUTH, "South Voice")]
    featured = [_north_credit(joinphrase=" feat. "), _north_credit(GUEST, "Guest Voice")]
    albums = {
        COMP_GROUP: _album_detail(
            COMP_GROUP, COMP_GROUP, various_credit, "Shared Title", primary_type="Compilation"
        ),
        UNKNOWN_GROUP: _album_detail(UNKNOWN_GROUP, UNKNOWN_GROUP, named_various, "Shared Title"),
        COLLAB_GROUP: _album_detail(COLLAB_GROUP, COLLAB_GROUP, collab, "Both Names"),
        FEATURE_GROUP: _album_detail(FEATURE_GROUP, FEATURE_GROUP, featured, "Guest Passing"),
        SIMILAR_GROUP_A: _album_detail(
            SIMILAR_GROUP_A,
            SIMILAR_GROUP_A,
            [_north_credit(SIMILAR_A, "North Voice")],
            "First Passing",
        ),
        SIMILAR_GROUP_B: _album_detail(
            SIMILAR_GROUP_B,
            SIMILAR_GROUP_B,
            [_north_credit(SIMILAR_B, "North Voice Ensemble")],
            "Second Passing",
        ),
        GROUP: _album_detail(GROUP, GROUP, [{"name": "Someone Unlisted"}], "Untitled Credit"),
    }
    tracks = {COMP_SONG: _track_detail(COMP_SONG, [_north_credit()], "Compilation Single")}
    _install(monkeypatch, albums, tracks)
    _save_album(client, COMP_GROUP, "Shared Title")
    _save_album(client, UNKNOWN_GROUP, "Shared Title")
    _save_album(client, COLLAB_GROUP, "Both Names")
    _save_album(client, FEATURE_GROUP, "Guest Passing")
    _save_album(client, SIMILAR_GROUP_A, "First Passing")
    _save_album(client, SIMILAR_GROUP_B, "Second Passing")
    _save_album(client, GROUP, "Untitled Credit")
    _save_track(client, COMP_SONG, "Compilation Single")
    links = _links(client)
    album_parents = {
        source_id
        for source_id, _title, relation, kind, title in links
        if kind == "album"
        and title == "Shared Title"
        and relation in {"artist-album", "artist-release-group"}
    }
    assert VARIOUS_ARTISTS_MBID in album_parents
    assert NORTH not in {
        source_id
        for source_id, _title, relation, kind, title in links
        if kind == "album" and title == "Shared Title"
    }
    various_id = _artist_catalog(client, VARIOUS_ARTISTS_MBID)
    other_id = _artist_catalog(client, OTHER)
    various_group = client.get(f"/api/music-groups/{various_id}").json()
    other_group = client.get(f"/api/music-groups/{other_id}").json()
    assert [child["title"] for child in various_group["saved_children"]] == ["Shared Title"]
    assert [child["title"] for child in other_group["saved_children"]] == ["Shared Title"]
    assert various_group["saved_children"][0]["id"] != other_group["saved_children"][0]["id"]
    north_group = client.get(f"/api/music-groups/{_artist_catalog(client, NORTH)}").json()
    south_group = client.get(f"/api/music-groups/{_artist_catalog(client, SOUTH)}").json()
    assert [child["title"] for child in north_group["saved_children"]] == [
        "Both Names",
        "Guest Passing",
        "Compilation Single",
    ]
    assert [album["title"] for album in north_group["albums"]] == ["Both Names", "Guest Passing"]
    assert north_group["albums"][0]["songs"] == []
    assert [song["title"] for song in north_group["songs"]] == ["Compilation Single"]
    assert all(album["title"] != "Shared Title" for album in north_group["albums"])
    assert [album["title"] for album in various_group["albums"]] == ["Shared Title"]
    assert various_group["albums"][0]["songs"] == []
    assert various_group["songs"] == []
    assert [child["title"] for child in south_group["saved_children"]] == ["Both Names"]
    assert [album["title"] for album in south_group["albums"]] == ["Both Names"]
    assert south_group["albums"][0]["id"] == north_group["albums"][0]["id"]
    assert GUEST not in {source_id for _source, source_id, _title in _artists(client)}
    assert (
        client.get(f"/api/music-groups/{_artist_catalog(client, SIMILAR_A)}").json()[
            "saved_children"
        ][0]["title"]
        == "First Passing"
    )
    assert (
        client.get(f"/api/music-groups/{_artist_catalog(client, SIMILAR_B)}").json()[
            "saved_children"
        ][0]["title"]
        == "Second Passing"
    )
    untitled = next(
        item for item in _library(client, kind="album") if item["title"] == "Untitled Credit"
    )
    assert "artist_groups" not in untitled
    assert all(row[2] != "Someone Unlisted" for row in _artists(client))
    with client.app.state.database.sessionmaker() as db:
        song = (
            db.query(UserEntry)
            .join(CatalogItem, CatalogItem.id == UserEntry.catalog_id)
            .filter(CatalogItem.source_id == COMP_SONG)
            .one()
        )
        linked = summary.linked_artist(db, song)
    assert linked is not None
    assert linked["title"] == "North Voice"
    assert linked["entry_id"] is None


def test_manual_identity_groups_without_merging_titles(client):
    first = client.post(
        "/api/library",
        json={
            "kind": "album",
            "title": "Hand Pressing",
            "creator": "Hand Person",
            "artist_identity": {
                "source": "manual",
                "source_id": "person-hand",
                "name": "Hand Person",
            },
        },
    )
    assert first.status_code == 200, first.text
    second = client.post(
        "/api/library",
        json={
            "kind": "track",
            "title": "Hand Single",
            "artist_identity": {
                "source": "manual",
                "source_id": "person-hand",
                "name": "Hand Person",
            },
        },
    )
    assert second.status_code == 200, second.text
    other = client.post(
        "/api/library",
        json={
            "kind": "album",
            "title": "Hand Pressing",
            "artist_identity": {
                "source": "manual",
                "source_id": "person-other",
                "name": "Hand Person",
            },
        },
    )
    assert other.status_code == 200, other.text
    rejected = client.post(
        "/api/library",
        json={
            "kind": "album",
            "title": "Hand Pressing",
            "artist_identity": {
                "source": "manual",
                "source_id": "Hand Pressing",
                "name": "Hand Person",
            },
        },
    )
    assert rejected.status_code == 422
    assert rejected.json()["detail"] == "An artist id cannot be the title."
    book = client.post(
        "/api/library",
        json={
            "kind": "book",
            "title": "Hand Guide",
            "artist_identity": {
                "source": "manual",
                "source_id": "person-hand",
                "name": "Hand Person",
            },
        },
    )
    assert book.status_code == 422
    sneaky = client.post(
        "/api/library",
        json={
            "kind": "album",
            "title": "Sneaky Pressing",
            "extra": {
                "artist_credits": [
                    {
                        "source": "manual",
                        "source_id": "person-sneak",
                        "name": "Sneak Voice",
                        "role": "primary",
                    }
                ],
                "artist_id": "person-sneak",
            },
        },
    )
    assert sneaky.status_code == 200, sneaky.text
    owned = client.post("/api/library", json={"kind": "artist", "title": "Notebook Person"})
    assert owned.status_code == 200, owned.text
    linked = client.post(
        "/api/library",
        json={
            "kind": "album",
            "title": "Notebook Pressing",
            "artist_catalog_id": owned.json()["catalog"]["id"],
        },
    )
    assert linked.status_code == 200, linked.text
    hand_id = _artist_catalog(client, "person-hand")
    other_id = _artist_catalog(client, "person-other")
    assert hand_id != other_id
    hand = client.get(f"/api/music-groups/{hand_id}").json()
    assert hand["followed"] is False
    assert [child["title"] for child in hand["saved_children"]] == ["Hand Pressing", "Hand Single"]
    assert [
        child["title"]
        for child in client.get(f"/api/music-groups/{other_id}").json()["saved_children"]
    ] == ["Hand Pressing"]
    assert "person-sneak" not in {source_id for _source, source_id, _title in _artists(client)}
    sneaky_card = next(
        item for item in _library(client, kind="album") if item["title"] == "Sneaky Pressing"
    )
    assert "artist_groups" not in sneaky_card
    followed = client.post(
        "/api/library",
        json={
            "kind": "artist",
            "title": "Hand Person",
            "status": "following",
            "artist_identity": {
                "source": "manual",
                "source_id": "person-hand",
                "name": "Hand Person",
            },
        },
    )
    assert followed.status_code == 200, followed.text
    assert followed.json()["catalog"]["id"] == hand_id
    assert [
        item["title"] for item in _library(client, kind="artist") if item["title"] == "Hand Person"
    ] == ["Hand Person"]
    assert client.get(f"/api/music-groups/{hand_id}").json()["saved_count"] == 2
    with client.app.state.database.sessionmaker() as db:
        with pytest.raises(HTTPException) as caught:
            records.create_manual(
                db,
                2,
                {
                    "kind": "album",
                    "title": "Foreign Pressing",
                    "artist_catalog_id": owned.json()["catalog"]["id"],
                },
            )
        assert caught.value.status_code == 422
        db.rollback()
        foreign = records.create_manual(
            db,
            2,
            {
                "kind": "album",
                "title": "Foreign Hand",
                "artist_identity": {
                    "source": "manual",
                    "source_id": "person-hand",
                    "name": "Hand Person",
                },
            },
        )
        db.commit()
        foreign_group = records.saved_artist_group(db, 2, hand_id)
    assert foreign.catalog_id
    assert [child["title"] for child in foreign_group["saved_children"]] == ["Foreign Hand"]
    owner_group = client.get(f"/api/music-groups/{hand_id}").json()
    assert [child["title"] for child in owner_group["saved_children"]] == [
        "Hand Pressing",
        "Hand Single",
    ]
    with client.app.state.database.sessionmaker() as db:
        with pytest.raises(HTTPException) as missing:
            records.saved_artist_group(db, 2, owned.json()["catalog"]["id"])
        assert missing.value.status_code == 404


def test_failed_grouping_does_not_change_owner_rows(client, monkeypatch):
    kept = client.post(
        "/api/library",
        json={"kind": "book", "title": "Kept Guide", "review": "owner-one-note", "rating": 5},
    )
    assert kept.status_code == 200, kept.text
    with client.app.state.database.sessionmaker() as db:
        other = CatalogItem(
            kind="book",
            title="Other Guide",
            source="manual",
            genres="[]",
            external_ratings="[]",
            extra="{}",
        )
        db.add(other)
        db.flush()
        db.add(
            UserEntry(
                user_id=2,
                catalog_id=other.id,
                status="want",
                review="owner-two-note",
                rating=2,
            )
        )
        db.commit()
        other_id = other.id

    def snapshot():
        with client.app.state.database.sessionmaker() as db:
            rows = db.query(UserEntry).all()
            return {
                "entries": [(row.user_id, row.catalog_id, row.review, row.rating) for row in rows],
                "catalogs": db.query(CatalogItem).count(),
                "links": db.query(MusicLink).count(),
            }

    before = snapshot()

    original_link = records._link_canonical_artists

    def explode(*_args, **_kwargs):
        raise RuntimeError("link failed")

    monkeypatch.setattr(records, "_link_canonical_artists", explode)
    failed = client.post(
        "/api/library",
        json={
            "kind": "album",
            "title": "Lost Pressing",
            "artist_identity": {
                "source": "manual",
                "source_id": "person-lost",
                "name": "Lost Voice",
            },
        },
    )
    assert failed.status_code == 500, failed.text
    assert snapshot() == before
    monkeypatch.setattr(records, "_link_canonical_artists", original_link)

    def down(*_args, **_kwargs):
        raise RuntimeError("provider down")

    monkeypatch.setattr(providers, "lookup_detail", down)
    missed = client.post(
        "/api/library/from-provider",
        json={
            "source": "musicbrainz",
            "source_id": GROUP,
            "kind": "album",
            "title": "Lost Pressing",
        },
    )
    assert missed.status_code == 500, missed.text
    assert snapshot() == before
    assert client.get(f"/api/entries/{kept.json()['id']}").json()["review"] == "owner-one-note"
    with client.app.state.database.sessionmaker() as db:
        assert db.get(
            UserEntry, db.query(UserEntry).filter(UserEntry.user_id == 2).one().id
        ).review == ("owner-two-note")
        assert db.get(CatalogItem, other_id).title == "Other Guide"

    albums = {GROUP: _album_detail(GROUP, GROUP, [_north_credit()], "North Pressing")}
    _install(monkeypatch, albums)
    saved = _save_album(client, GROUP, "North Pressing")
    catalog_id = _artist_catalog(client, NORTH)

    def refuse(*_args, **_kwargs):
        raise AssertionError("a group read wrote library state")

    monkeypatch.setattr(records, "_ensure_link", refuse)
    monkeypatch.setattr(records, "_ensure_artist_catalog", refuse)
    monkeypatch.setattr(providers, "lookup_detail", refuse)
    monkeypatch.setattr(records, "repair_musicbrainz_albums", refuse)
    page = client.get("/api/library", params={"kind": "album"})
    opened = client.get(f"/api/music-groups/{catalog_id}")
    missing = client.get("/api/music-groups/999999")
    assert page.status_code == 200, page.text
    assert opened.status_code == 200, opened.text
    assert missing.status_code == 404
    assert snapshot()["catalogs"] == before["catalogs"] + 2
    assert [item["title"] for item in page.json()["items"]] == ["North Pressing"]
    assert opened.json()["saved_children"][0]["id"] == saved["id"]
    with client.app.state.database.sessionmaker() as db:
        with pytest.raises(HTTPException) as hidden:
            records.saved_artist_group(db, 2, catalog_id)
        assert hidden.value.status_code == 404


def _groups(client, **params):
    response = client.get("/api/music-groups", params=params)
    assert response.status_code == 200, response.text
    return response.json()


def test_default_collection_nests_one_album_without_following(client, monkeypatch):
    """One saved album is one artist group, not a second copy of the album."""
    artist = client.post(
        "/api/library",
        json={"kind": "artist", "title": "Quiet Voice", "status": "following"},
    )
    assert artist.status_code == 200, artist.text
    album = client.post(
        "/api/library",
        json={
            "kind": "album",
            "title": "Only Pressing",
            "artist_identity": {
                "source": "manual",
                "source_id": "person-only",
                "name": "Only Voice",
            },
        },
    )
    assert album.status_code == 200, album.text
    rated = client.patch(f"/api/entries/{album.json()['id']}", json={"rating": 8})
    assert rated.status_code == 200, rated.text
    loose = client.post(
        "/api/library",
        json={
            "kind": "track",
            "title": "Loose Single",
            "artist_identity": {
                "source": "manual",
                "source_id": "person-only",
                "name": "Only Voice",
            },
            "rating": 3,
        },
    )
    assert loose.status_code == 200, loose.text
    stranger = client.post(
        "/api/library",
        json={
            "kind": "album",
            "title": "Other Pressing",
            "artist_identity": {
                "source": "manual",
                "source_id": "person-only-other",
                "name": "Only Voice",
            },
        },
    )
    assert stranger.status_code == 200, stranger.text
    nested = client.post(
        f"/api/entries/{artist.json()['id']}/albums",
        json={"title": "Quiet Pressing", "year": 2004},
    )
    assert nested.status_code == 200, nested.text
    quiet_album = next(
        row for row in nested.json()["music"]["saved_children"] if row["kind"] == "album"
    )
    song = client.post(
        f"/api/entries/{artist.json()['id']}/albums/{quiet_album['id']}/tracks",
        json={"title": "Quiet Single"},
    )
    assert song.status_code == 200, song.text
    song_id = next(
        row["id"]
        for row in song.json()["music"]["saved_children"]
        if row["title"] == "Quiet Single"
    )
    scored = client.patch(f"/api/entries/{quiet_album['id']}", json={"rating": 7})
    assert scored.status_code == 200, scored.text
    song_score = client.patch(f"/api/entries/{song_id}", json={"rating": 2})
    assert song_score.status_code == 200, song_score.text
    catalog = client.post(
        "/api/library",
        json={
            "kind": "artist",
            "title": "Quiet Catalog",
            "status": "following",
            "artist_identity": {
                "source": "musicbrainz",
                "source_id": "abababab-abab-4bab-8bab-abababababab",
                "name": "Quiet Catalog",
            },
        },
    )
    assert catalog.status_code == 200, catalog.text
    catalog_score = client.patch(f"/api/entries/{catalog.json()['id']}", json={"rating": 1})
    assert catalog_score.status_code == 200, catalog_score.text
    favorite = client.patch(f"/api/entries/{loose.json()['id']}", json={"favorite": True})
    assert favorite.status_code == 200, favorite.text

    def refuse(*_args, **_kwargs):
        raise AssertionError("a collection read called a provider")

    monkeypatch.setattr(providers, "lookup_detail", refuse)
    monkeypatch.setattr(providers, "musicbrainz_artist_catalog", refuse)
    with client.app.state.database.sessionmaker() as db:
        before = db.query(MusicLink).count()
    page = _groups(client, sort="title")
    with client.app.state.database.sessionmaker() as db:
        assert db.query(MusicLink).count() == before
    titles = [item["title"] for item in page["items"]]
    assert titles.count("Only Voice") == 2
    assert titles.count("Quiet Voice") == 1
    assert titles.count("Quiet Catalog") == 1
    quiet = next(item for item in page["items"] if item["title"] == "Quiet Voice")
    only_groups = [item for item in page["items"] if item["title"] == "Only Voice"]
    assert len(only_groups) == 2
    assert {item["catalog_id"] for item in only_groups} == {
        item["catalog_id"] for item in only_groups
    }
    assert len({item["catalog_id"] for item in only_groups}) == 2
    pressing = next(
        item
        for item in only_groups
        if any(album["title"] == "Only Pressing" for album in item["albums"])
    )
    other = next(item for item in only_groups if item is not pressing)
    assert pressing["followed"] is False
    assert pressing["entry_id"] is None
    assert pressing["rating"] is None
    assert pressing["artwork_url"] is None
    assert [album["title"] for album in pressing["albums"]] == ["Only Pressing"]
    assert pressing["albums"][0]["id"] == album.json()["id"]
    assert pressing["albums"][0]["rating"] == 8
    assert pressing["albums"][0]["songs"] == []
    assert [song["title"] for song in pressing["songs"]] == ["Loose Single"]
    assert pressing["songs"][0]["rating"] == 3
    assert pressing["songs"][0]["id"] != pressing["albums"][0]["id"]
    assert [album["title"] for album in other["albums"]] == ["Other Pressing"]
    assert other["albums"][0]["id"] != pressing["albums"][0]["id"]
    assert quiet["followed"] is True
    assert quiet["entry_id"] == artist.json()["id"]
    assert quiet["rating"] is None
    assert [album["title"] for album in quiet["albums"]] == ["Quiet Pressing"]
    assert quiet["albums"][0]["rating"] == 7
    assert [track["title"] for track in quiet["albums"][0]["songs"]] == ["Quiet Single"]
    assert quiet["albums"][0]["songs"][0]["rating"] == 2
    assert quiet["songs"] == []
    assert client.get(f"/api/entries/{artist.json()['id']}").json()["rating"] is None
    followed = _groups(client, status="following", sort="title")
    assert [item["title"] for item in followed["items"]] == ["Quiet Catalog", "Quiet Voice"]
    empty = next(item for item in followed["items"] if item["title"] == "Quiet Catalog")
    assert empty["source"] == "musicbrainz"
    assert empty["entry_id"] == catalog.json()["id"]
    assert empty["rating"] == 1
    assert empty["saved_count"] == 0
    assert empty["albums"] == []
    assert empty["songs"] == []
    listening = _groups(client, status="completed")
    assert listening["items"] == []
    assert listening["total"] == 0
    unfollowed = _groups(client, status="unfollowed", sort="title")
    assert [item["title"] for item in unfollowed["items"]] == ["Only Voice", "Only Voice"]
    named = _groups(client, q="loose single")
    assert [item["catalog_id"] for item in named["items"]] == [pressing["catalog_id"]]
    favorites = _groups(client, favorite=True)
    assert [item["catalog_id"] for item in favorites["items"]] == [pressing["catalog_id"]]
    ranked = _groups(client, sort="rating")
    assert ranked["items"][0]["title"] == "Quiet Catalog"
    assert ranked["items"][0]["rating"] == 1
    assert all(item["rating"] is None for item in ranked["items"][1:])
    assert pressing["albums"][0]["rating"] == 8
    with client.app.state.database.sessionmaker() as db:
        hidden, hidden_total = records.list_saved_artist_groups(
            db, 2, None, None, "title", 0, 24, False, None
        )
    assert hidden == []
    assert hidden_total == 0


def test_unfollow_and_delete_keep_the_independently_saved_album(client):
    """An album saved first keeps its rating when the artist is followed, unfollowed, or removed."""
    identity = {
        "source": "manual",
        "source_id": "person-lantern-voice",
        "name": "Lantern Voice",
    }
    cover = "https://example.com/lantern-cover.png"
    album = client.post(
        "/api/library",
        json={
            "kind": "album",
            "title": "Lantern Pressing",
            "artwork_url": cover,
            "rating": 6,
            "artist_identity": identity,
        },
    )
    assert album.status_code == 200, album.text
    album_id = album.json()["id"]
    assert album.json()["rating"] == 6

    def wall():
        items = _groups(client, sort="title")["items"]
        assert [item["title"] for item in items] == ["Lantern Voice"]
        return items[0]

    group = wall()
    assert group["followed"] is False
    assert group["entry_id"] is None
    assert group["rating"] is None
    assert group["artwork_url"] is None
    assert [row["title"] for row in group["albums"]] == ["Lantern Pressing"]
    assert group["albums"][0]["id"] == album_id
    assert group["albums"][0]["rating"] == 6
    assert group["albums"][0]["artwork_url"] == cover

    followed = client.post(
        "/api/library",
        json={
            "kind": "artist",
            "title": "Lantern Voice",
            "status": "following",
            "artist_identity": identity,
        },
    )
    assert followed.status_code == 200, followed.text
    artist_id = followed.json()["id"]
    assert followed.json()["rating"] is None
    group = wall()
    assert group["followed"] is True
    assert group["entry_id"] == artist_id
    assert group["rating"] is None
    assert group["artwork_url"] is None
    assert group["albums"][0]["rating"] == 6

    unfollowed = client.patch(f"/api/entries/{artist_id}", json={"status": "unfollowed"})
    assert unfollowed.status_code == 200, unfollowed.text
    assert unfollowed.json()["status"] == "unfollowed"
    assert unfollowed.json()["rating"] is None
    group = wall()
    assert group["followed"] is False
    assert group["entry_id"] == artist_id
    assert group["rating"] is None
    assert group["albums"][0]["rating"] == 6
    assert client.get(f"/api/entries/{album_id}").json()["rating"] == 6

    removed = client.delete(f"/api/entries/{artist_id}")
    assert removed.status_code == 200, removed.text
    assert client.get(f"/api/entries/{artist_id}").status_code == 404
    kept = client.get(f"/api/entries/{album_id}")
    assert kept.status_code == 200, kept.text
    assert kept.json()["rating"] == 6
    assert kept.json()["artwork_url"] == cover
    group = wall()
    assert group["entry_id"] is None
    assert group["followed"] is False
    assert group["rating"] is None
    assert group["artwork_url"] is None
    assert group["albums"][0]["id"] == album_id
    assert group["albums"][0]["rating"] == 6
