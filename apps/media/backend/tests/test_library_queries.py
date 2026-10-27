"""Library cards use page-scoped aggregates, independently of library size."""

import json
import time
from datetime import UTC, date, datetime, timedelta

from sqlalchemy import event

from apps.media.backend.models import (
    CatalogItem,
    Episode,
    EpisodeProgress,
    MusicLink,
    SeriesLifecycle,
    UserEntry,
)


def _catalog(db, kind, title):
    row = CatalogItem(kind=kind, title=title, source="manual")
    db.add(row)
    db.flush()
    return row


def _save(db, catalog, user_id=1):
    entry = UserEntry(user_id=user_id, catalog_id=catalog.id, status="want")
    db.add(entry)
    db.flush()
    return entry


def _link(db, parent, child, relation):
    db.add(
        MusicLink(
            parent_catalog_id=parent.id,
            child_catalog_id=child.id,
            relation=relation,
            namespace="manual",
            provenance="explicit-save",
        )
    )


def _seed_mixed(client, monkeypatch):
    monkeypatch.setenv("MEDIA_TODAY", "2026-10-27")
    with client.app.state.database.sessionmaker() as db:
        for index in range(12):
            artist = _catalog(db, "artist", f"A Artist {index:02}")
            _save(db, artist)
            album = _catalog(db, "album", f"Z Album {index:02}")
            _link(db, artist, album, "artist-album")
            # Duplicate public relationship types must not double count a save.
            _link(db, artist, album, "artist-release-group")
            if index % 3:
                _save(db, album)
            track = _catalog(db, "track", f"Z Song {index:02}")
            track.extra = json.dumps({"album": album.title})
            _link(db, album, track, "album-recording")
            _link(db, album, track, "release-group-recording")
            if index % 2:
                _save(db, track)
            _save(db, album, 2)
            _save(db, track, 2)
            show = _catalog(db, "tv", f"B Series {index:02}")
            _save(db, show)
            if index % 6 != 0:
                regular = Episode(
                    catalog_id=show.id,
                    season_number=1 if index % 6 != 5 else 0,
                    episode_number=1,
                    air_date=None
                    if index % 6 == 2
                    else date(2027, 1, 1)
                    if index % 6 == 3
                    else date(2026, 10, 1),
                )
                db.add(regular)
                db.flush()
                db.add(EpisodeProgress(user_id=2, episode_id=regular.id, watched=True))
                if index % 6 in (1, 2):
                    db.add(EpisodeProgress(user_id=1, episode_id=regular.id, watched=True))
                db.add(
                    Episode(catalog_id=show.id, season_number=0, episode_number=2, air_date=None)
                )
            if index % 3:
                db.add(
                    SeriesLifecycle(
                        catalog_id=show.id,
                        lifecycle="ongoing" if index % 2 else "ended",
                        fetched_at=datetime.now(UTC) - timedelta(hours=48 if index % 3 == 2 else 1),
                        completeness="complete",
                    )
                )
        for index in range(120):
            _save(db, _catalog(db, "book", f"Z Book {index:03}"))
        db.commit()


def _measure(client, **params):
    engine = client.app.state.database.engine
    statements = []

    def record(_connection, _cursor, statement, _parameters, _context, _many):
        if statement.lstrip().upper().startswith("SELECT"):
            statements.append(statement)

    event.listen(engine, "before_cursor_execute", record)
    started = time.perf_counter()
    try:
        response = client.get("/api/library", params=params)
    finally:
        elapsed = time.perf_counter() - started
        event.remove(engine, "before_cursor_execute", record)
    assert response.status_code == 200, response.text
    metrics = {
        "selects": len(statements),
        "bytes": len(response.content),
        "elapsed_ms": round(elapsed * 1000, 2),
    }
    print(json.dumps({"params": params, **metrics}, sort_keys=True))
    return response.json(), metrics


def test_mixed_page_has_bounded_queries_and_matches_detail_truth(client, monkeypatch):
    _seed_mixed(client, monkeypatch)
    page, metrics = _measure(client, sort="title", limit=24)
    assert len(page["items"]) == 24
    assert metrics["selects"] <= 5, metrics
    assert "continue" not in page  # Continuation belongs to /summary and Now.
    for card in page["items"]:
        detail = client.get(f"/api/entries/{card['id']}").json()
        if card["kind"] == "tv":
            assert card["caught_up"] == detail["show"]["caught_up"]
            assert card["metadata_incomplete"] == detail["show"]["metadata_incomplete"]
            assert card["lifecycle"] == detail["lifecycle"]
        else:
            assert card["saved_count"] == len(detail["music"]["saved_children"])


def test_book_page_does_not_read_off_page_shows_or_music(client, monkeypatch):
    _seed_mixed(client, monkeypatch)
    from apps.media.backend.services import providers, records, summary

    def forbidden(*_args, **_kwargs):
        raise AssertionError("library performed an off-page/detail/provider read")

    monkeypatch.setattr(records, "episode_state", forbidden)
    monkeypatch.setattr(summary, "next_episodes", forbidden)
    monkeypatch.setattr(providers, "lookup_detail", forbidden)
    page, metrics = _measure(client, kind="book", sort="title", limit=24)
    assert metrics["selects"] == 2, metrics
    assert page["total"] == 120
    assert len(page["items"]) == 24
    assert page["has_more"] is True
    empty, empty_metrics = _measure(client, kind="book", offset=120, limit=24)
    assert empty["items"] == []
    assert empty_metrics["selects"] == 2


def test_artist_counts_include_saved_songs_on_unsaved_albums_once_per_artist(client):
    with client.app.state.database.sessionmaker() as db:
        artist = _catalog(db, "artist", "Artist")
        entry = _save(db, artist)
        albums = [_catalog(db, "album", title) for title in ("First", "Second")]
        song = _catalog(db, "track", "One song on two releases")
        _save(db, song)
        for album in albums:
            _link(db, artist, album, "artist-release-group")
            _link(db, album, song, "release-group-recording")
        _save(db, albums[0], 2)
        db.commit()
        entry_id = entry.id
    card = client.get("/api/library", params={"kind": "artist"}).json()["items"][0]
    assert card["id"] == entry_id
    assert card["saved_count"] == 1
    assert client.get("/api/library", params={"kind": "album"}).json()["total"] == 0
    assert client.get("/api/summary").status_code == 200
