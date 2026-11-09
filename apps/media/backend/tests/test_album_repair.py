"""READ1, REPAIR1, and PAGE1: saved reads stay on SQLite; repair is explicit."""

import json
from datetime import UTC, datetime

import pytest
from fastapi import HTTPException
from sqlalchemy import event

from apps.media.backend.models import CatalogItem, MusicLink, UserEntry
from apps.media.backend.services import providers, records

STAMP = datetime(2024, 5, 1, tzinfo=UTC)
ARTIST = "00000001-1111-4111-8111-000000000001"
DECOY = "00000002-1111-4111-8111-000000000002"


def _mbid(number: int) -> str:
    return f"{number:08x}-1111-4111-8111-{number:012x}"


def _pending(artist_id=None, group_id=None, blocked=False):
    extra = {"metadata_pending": True}
    if artist_id:
        extra["artist_id"] = artist_id
    if group_id:
        extra["release_group_id"] = group_id
    if blocked:
        extra["identity_blocked"] = True
    return extra


def _detail(source_id, group_id, artist_id, title):
    return {
        "source": "musicbrainz",
        "source_id": source_id,
        "kind": "album",
        "title": title,
        "creator": "Canonical Artist",
        "year": 1999,
        "overview": None,
        "artwork_url": None,
        "genres": [],
        "external_ratings": [],
        "extra": {
            "release_group_id": group_id,
            "release_id": source_id,
            "artist_id": artist_id,
            "primary_type": "Album",
        },
        "releases": [],
        "episodes": [],
        "provenance": {
            "provider": "musicbrainz",
            "coverage": "official",
            "fetched_at": "2026-11-08T00:00:00+00:00",
        },
    }


def _album(db, *, title, source_id, extra, kind="album", source="musicbrainz"):
    row = CatalogItem(
        kind=kind,
        title=title,
        creator="Saved Artist",
        source=source,
        source_id=source_id,
        genres="[]",
        external_ratings="[]",
        extra=json.dumps(extra),
    )
    db.add(row)
    db.flush()
    return row


def _entry(db, catalog, user_id, **fields):
    row = UserEntry(
        user_id=user_id,
        catalog_id=catalog.id,
        status=fields.get("status", "want"),
        rating=fields.get("rating"),
        review=fields.get("review"),
        summary=fields.get("summary"),
        favorite=fields.get("favorite", False),
        tags=fields.get("tags"),
        portrait_url=fields.get("portrait_url"),
        review_spoiler=False,
        anticipated=False,
        review_updated_at=STAMP,
    )
    db.add(row)
    db.flush()
    return row


def _personal(db):
    db.expire_all()
    rows = db.query(UserEntry).order_by(UserEntry.id).all()
    return [
        (
            row.id,
            row.user_id,
            row.catalog_id,
            row.rating,
            row.review,
            row.summary,
            row.favorite,
            row.tags,
            row.status,
            row.portrait_url,
        )
        for row in rows
    ]


def _saved(client):
    with client.app.state.database.sessionmaker() as db:
        catalogs = [
            (row.id, row.kind, row.title, row.source, row.source_id, row.extra)
            for row in db.query(CatalogItem).order_by(CatalogItem.id)
        ]
        people = _personal(db)
        links = [
            (row.parent_catalog_id, row.child_catalog_id, row.relation)
            for row in db.query(MusicLink).order_by(MusicLink.id)
        ]
    return catalogs, people, links


def _notes(db, user_id, catalog_id):
    db.expire_all()
    row = (
        db.query(UserEntry)
        .filter(UserEntry.user_id == user_id, UserEntry.catalog_id == catalog_id)
        .one_or_none()
    )
    if row is None:
        return None
    return (
        row.rating,
        row.review,
        row.summary,
        row.favorite,
        row.portrait_url,
        row.tags,
        row.status,
    )


def _forbid_providers(monkeypatch):
    def explode(*_args, **_kwargs):
        raise AssertionError("saved read called a provider or repair")

    monkeypatch.setattr(providers, "lookup_detail", explode)
    monkeypatch.setattr(records, "repair_musicbrainz_albums", explode)


def test_read1_saved_reads_do_not_call_providers_or_repair(client, monkeypatch):
    """READ1: filtered, paged library/summary/detail reads do not repair or call providers."""
    with client.app.state.database.sessionmaker() as db:
        album = _album(
            db,
            title="Unreleased Pressing",
            source_id=_mbid(21),
            extra=_pending(),
        )
        _entry(
            db,
            album,
            1,
            rating=7,
            review="private pressing note",
            summary="short",
            tags='["vault"]',
            portrait_url="https://example.test/one.jpg",
        )
        book = _album(
            db, title="Paper Book", source_id=None, extra={}, kind="book", source="manual"
        )
        _entry(db, book, 1, rating=5, review="book note", favorite=True)
        artist = _album(
            db,
            title="Quiet Artist",
            source_id=ARTIST,
            extra={},
            kind="artist",
        )
        _entry(db, artist, 1, status="following")
        album_id = album.id
        entry_id = db.query(UserEntry).filter(UserEntry.catalog_id == album.id).one().id
        book_id = db.query(UserEntry).filter(UserEntry.catalog_id == book.id).one().id
        artist_entry = db.query(UserEntry).filter(UserEntry.catalog_id == artist.id).one().id
        db.commit()
    before = _saved(client)
    _forbid_providers(monkeypatch)
    requests = [
        (
            "/api/library",
            {"kind": "album", "q": "Unreleased", "sort": "title", "offset": 0, "limit": 1},
        ),
        ("/api/library", {"kind": "album", "sort": "rating", "offset": 0, "limit": 1}),
        ("/api/library", {"sort": "added", "offset": 1, "limit": 1}),
        ("/api/library", [("tags", "no-such-tag"), ("limit", "1"), ("sort", "title")]),
        ("/api/library", {"favorite": True, "limit": 1}),
        ("/api/summary", None),
        (f"/api/entries/{entry_id}", None),
        (f"/api/entries/{book_id}", None),
        (f"/api/entries/{artist_entry}", None),
    ]
    for _repeat in range(2):
        for path, params in requests:
            response = client.get(path, params=params)
            assert response.status_code == 200, response.text
    page = client.get(
        "/api/library",
        params={"kind": "album", "q": "Unreleased", "limit": 1, "sort": "title"},
    ).json()
    assert page["total"] == 1
    assert page["items"][0]["title"] == "Unreleased Pressing"
    assert page["items"][0]["rating"] == 7
    detail = client.get(f"/api/entries/{entry_id}").json()
    assert detail["catalog"]["id"] == album_id
    assert detail["catalog"]["source_id"] == _mbid(21)
    assert detail["catalog"]["extra"]["metadata_pending"] is True
    assert "release_group_id" not in detail["catalog"]["extra"]
    assert detail["review"] == "private pressing note"
    assert detail["title"] == "Unreleased Pressing"
    summary = client.get("/api/summary").json()
    assert any(
        item["review_excerpt"] == "private pressing note" for item in summary["recent_reviews"]
    )
    assert _saved(client) == before


def test_repair1_bounded_repair_preserves_each_owner(client, monkeypatch):
    """REPAIR1: explicit repair is bounded, idempotent, and owner-scoped."""
    with client.app.state.database.sessionmaker() as db:
        artist = _album(db, title="Owner One Artist", source_id=ARTIST, extra={}, kind="artist")
        _entry(db, artist, 1, status="following")
        decoy = _album(db, title="Decoy Artist", source_id=DECOY, extra={}, kind="artist")
        _entry(db, decoy, 2, status="following")

        pressing = _mbid(30)
        group = _mbid(31)
        shared = _album(db, title="Shared Pressing", source_id=pressing, extra=_pending())
        _entry(
            db,
            shared,
            1,
            rating=9,
            review="owner-one-note",
            summary="owner-one-sum",
            tags='["one"]',
            portrait_url="https://example.test/one.jpg",
        )
        _entry(
            db,
            shared,
            2,
            rating=2,
            review="owner-two-note",
            summary="owner-two-sum",
            tags='["two"]',
            portrait_url="https://example.test/two.jpg",
        )
        shared_entry = (
            db.query(UserEntry)
            .filter(UserEntry.user_id == 1, UserEntry.catalog_id == shared.id)
            .one()
            .id
        )
        db.commit()
        before = _personal(db)

        def fail_lookup(*_args, **_kwargs):
            fresh = (
                db.query(CatalogItem).populate_existing().filter(CatalogItem.id == shared.id).one()
            )
            assert fresh.source_id == pressing
            raise RuntimeError("provider down")

        monkeypatch.setattr(providers, "lookup_detail", fail_lookup)
        with pytest.raises(RuntimeError, match="provider down"):
            records.repair_musicbrainz_albums(db, 1, [shared.id], batch_limit=8)
        db.rollback()
        assert _personal(db) == before
        assert db.get(CatalogItem, shared.id).source_id == pressing
        assert json.loads(db.get(CatalogItem, shared.id).extra)["metadata_pending"] is True

        seen = {"source": None}

        def succeed_lookup(source, kind, source_id):
            seen["source"] = source_id
            fresh = (
                db.query(CatalogItem).populate_existing().filter(CatalogItem.id == shared.id).one()
            )
            assert fresh.source_id == pressing
            return _detail(source_id, group, ARTIST, "Shared Pressing")

        monkeypatch.setattr(providers, "lookup_detail", succeed_lookup)
        refreshed = client.post(f"/api/entries/{shared_entry}/refresh")
        assert refreshed.status_code == 200, refreshed.text
        assert seen["source"] == pressing
        body = refreshed.json()
        assert body["catalog"]["source_id"] == group
        assert body["review"] == "owner-one-note"
        assert body["rating"] == 9
        assert body["catalog"]["extra"]["release_id"] == pressing
        db.expire_all()
        assert _personal(db) == before
        assert _notes(db, 2, shared.id)[1] == "owner-two-note"
        again = records.repair_musicbrainz_albums(db, 1, [shared.id], batch_limit=8)
        assert again["lookups"] == 0
        assert again["stopped"] == "done"
        db.commit()
        assert _personal(db) == before
        parents = {
            parent.source_id
            for parent, _child in db.query(CatalogItem, MusicLink)
            .join(MusicLink, MusicLink.parent_catalog_id == CatalogItem.id)
            .filter(MusicLink.child_catalog_id == shared.id)
        }
        assert parents == {ARTIST}

        kept_group = _mbid(40)
        kept = _album(
            db,
            title="Kept Group",
            source_id=kept_group,
            extra={
                "metadata_pending": False,
                "release_group_id": kept_group,
                "artist_id": ARTIST,
            },
        )
        _entry(
            db,
            kept,
            2,
            rating=4,
            review="owner-two-group",
            summary="two-summary",
            portrait_url="https://example.test/two-group.jpg",
            tags='["group"]',
        )
        other_pressing = _mbid(41)
        duplicate = _album(db, title="Other Pressing", source_id=other_pressing, extra=_pending())
        moved = _entry(
            db,
            duplicate,
            1,
            rating=8,
            review="owner-one-pressing",
            summary="one-pressing",
            favorite=True,
            portrait_url="https://example.test/one-pressing.jpg",
            tags='["pressing"]',
        )
        _entry(
            db,
            duplicate,
            2,
            rating=1,
            review="owner-two-pressing",
            summary="two-pressing",
            favorite=False,
            portrait_url="https://example.test/two-pressing.jpg",
            tags='["pressing-two"]',
        )
        db.commit()
        merged = records.repair_musicbrainz_albums(
            db,
            1,
            [duplicate.id],
            batch_limit=1,
            details={duplicate.id: _detail(other_pressing, kept_group, ARTIST, "Kept Group")},
        )
        assert merged["lookups"] == 0
        assert merged["repaired"] == 1
        db.commit()
        assert db.get(CatalogItem, duplicate.id) is None
        assert _notes(db, 2, kept.id) == (
            4,
            "owner-two-group",
            "two-summary",
            False,
            "https://example.test/two-group.jpg",
            '["group"]',
            "want",
        )
        assert _notes(db, 2, duplicate.id) is None
        moved_notes = _notes(db, 1, kept.id)
        assert moved_notes[:4] == (8, "owner-one-pressing", "one-pressing", True)
        assert moved.id
        assert _notes(db, 1, kept.id)[1] != "owner-two-group"

        batch = []
        for index in range(9):
            source_id = _mbid(500 + index)
            row = _album(db, title=f"Batch {index:02d}", source_id=source_id, extra=_pending())
            _entry(db, row, 1, rating=index, review=f"batch-note-{index}", summary=f"sum-{index}")
            if index in {0, 8}:
                _entry(
                    db,
                    row,
                    2,
                    rating=20 + index,
                    review=f"other-{index}",
                    summary=f"other-sum-{index}",
                )
            batch.append((row, source_id, _mbid(600 + index)))
        exclusive = _album(db, title="Private Album", source_id=_mbid(77), extra=_pending())
        _entry(db, exclusive, 2, rating=3, review="only-owner-two", summary="private")
        db.commit()
        details = {
            row.id: _detail(source_id, group_id, ARTIST, f"Canonical {index:02d}")
            for index, (row, source_id, group_id) in enumerate(batch)
        }
        capped = records.repair_musicbrainz_albums(
            db,
            1,
            [row.id for row, _source, _group in batch] + [exclusive.id, True, batch[0][0].id],
            batch_limit=100,
            details=details,
        )
        assert capped["examined"] == 8
        assert capped["processed"] == 8
        assert capped["remaining"] == 1
        assert capped["stopped"] == "batch"
        assert capped["lookups"] == 0
        db.commit()
        last = batch[8][0]
        assert db.get(CatalogItem, last.id).source_id == batch[8][1]
        assert db.get(CatalogItem, last.id).title == "Batch 08"
        assert _notes(db, 2, last.id)[1] == "other-8"
        assert _notes(db, 1, last.id)[1] == "batch-note-8"
        assert _notes(db, 2, batch[0][0].id)[1] == "other-0"
        assert db.get(CatalogItem, batch[0][0].id).source_id == batch[0][2]
        assert db.get(CatalogItem, exclusive.id).source_id == _mbid(77)
        assert _notes(db, 2, exclusive.id)[1] == "only-owner-two"

        timed = []
        for index in range(3):
            source_id = _mbid(700 + index)
            row = _album(db, title=f"Timed {index}", source_id=source_id, extra=_pending())
            _entry(db, row, 1, review=f"timed-{index}", rating=index)
            _entry(db, row, 2, review=f"timed-other-{index}", rating=10 + index)
            timed.append((row, source_id, _mbid(800 + index)))
        db.commit()
        ticks = iter([0.0, 0.0, 50.0])

        def lookup(_source, _kind, source_id):
            match = next(item for item in timed if item[1] == source_id)
            return _detail(source_id, match[2], ARTIST, match[0].title)

        monkeypatch.setattr(providers, "lookup_detail", lookup)
        stopped = records.repair_musicbrainz_albums(
            db,
            1,
            [row.id for row, _source, _group in timed],
            batch_limit=8,
            deadline_seconds=2,
            clock=lambda: next(ticks),
        )
        assert stopped["processed"] == 1
        assert stopped["lookups"] == 1
        assert stopped["remaining"] == 2
        assert stopped["stopped"] == "deadline"
        db.commit()
        assert db.get(CatalogItem, timed[0][0].id).source_id == timed[0][2]
        assert db.get(CatalogItem, timed[1][0].id).source_id == timed[1][1]
        assert db.get(CatalogItem, timed[2][0].id).source_id == timed[2][1]
        assert _notes(db, 2, timed[1][0].id)[1] == "timed-other-1"
        assert _notes(db, 1, timed[0][0].id)[1] == "timed-0"
        retried = records.repair_musicbrainz_albums(
            db, 1, [row.id for row, _source, _group in timed], batch_limit=8
        )
        assert retried["lookups"] == 2
        assert retried["repaired"] == 2
        db.commit()
        assert db.get(CatalogItem, timed[2][0].id).source_id == timed[2][2]
        assert _notes(db, 2, timed[2][0].id)[1] == "timed-other-2"
        third = records.repair_musicbrainz_albums(
            db, 1, [row.id for row, _source, _group in timed], batch_limit=8
        )
        assert third["lookups"] == 0

        negative_rows = []
        for index in range(2):
            source_id = _mbid(900 + index)
            row = _album(db, title=f"Deadline {index}", source_id=source_id, extra=_pending())
            _entry(db, row, 1, review=f"deadline-{index}")
            negative_rows.append((row, source_id, _mbid(910 + index)))
        db.commit()
        monkeypatch.setattr(
            providers,
            "lookup_detail",
            lambda _source, _kind, source_id: _detail(
                source_id,
                next(
                    group_id
                    for row, pressing_id, group_id in negative_rows
                    if pressing_id == source_id
                ),
                ARTIST,
                "Deadline",
            ),
        )
        one = records.repair_musicbrainz_albums(
            db,
            1,
            [row.id for row, _source, _group in negative_rows],
            batch_limit=0,
            deadline_seconds=30,
            details={
                negative_rows[0][0].id: _detail(
                    negative_rows[0][1], negative_rows[0][2], ARTIST, "Deadline"
                )
            },
        )
        assert one["examined"] == 1
        assert one["processed"] == 1
        assert one["stopped"] == "batch"
        assert db.get(CatalogItem, negative_rows[1][0].id).title == "Deadline 1"
        db.rollback()
        negative_ticks = iter([0.0, 0.0, 5.0])
        bounded = records.repair_musicbrainz_albums(
            db,
            1,
            [row.id for row, _source, _group in negative_rows],
            batch_limit=8,
            deadline_seconds=-4,
            clock=lambda: next(negative_ticks),
        )
        assert bounded["processed"] == 1
        assert bounded["lookups"] == 1
        assert bounded["stopped"] == "deadline"
        assert db.get(CatalogItem, negative_rows[1][0].id).source_id == negative_rows[1][1]

        honest_id = _mbid(70)
        honest = _album(db, title="Still Saved", source_id=honest_id, extra=_pending())
        honest_entry = _entry(db, honest, 1, review="honest-note", rating=6, summary="honest-sum")
        blank_id = _mbid(71)
        blank = _album(db, title="Blank Detail", source_id=blank_id, extra=_pending())
        _entry(db, blank, 2, review="blank-note", rating=1)
        db.commit()

        def unresolved_lookup(_source, _kind, source_id):
            if source_id == honest_id:
                return {
                    "source": "musicbrainz",
                    "kind": "album",
                    "source_id": source_id,
                    "title": "Should Not Replace",
                    "extra": {},
                }
            return None

        monkeypatch.setattr(providers, "lookup_detail", unresolved_lookup)
        unresolved = records.repair_musicbrainz_albums(
            db, 1, [honest.id, blank.id, exclusive.id], batch_limit=8
        )
        assert unresolved["lookups"] == 1
        assert unresolved["unresolved"] == [honest.id]
        db.rollback()
        assert db.get(CatalogItem, honest.id).title == "Still Saved"
        assert db.get(CatalogItem, honest.id).source_id == honest_id
        assert json.loads(db.get(CatalogItem, honest.id).extra)["metadata_pending"] is True
        assert "release_group_id" not in json.loads(db.get(CatalogItem, honest.id).extra)
        assert _notes(db, 1, honest.id)[1] == "honest-note"
        assert db.get(CatalogItem, blank.id).title == "Blank Detail"
        assert _notes(db, 2, blank.id)[1] == "blank-note"

        survivor = records.finish_album_refresh(
            db,
            honest_entry,
            {
                "source": "musicbrainz",
                "kind": "album",
                "source_id": honest_id,
                "title": "From Provider",
                "extra": {},
            },
        )
        assert survivor.id == honest_entry.id
        assert survivor.review == "honest-note"
        assert survivor.catalog.source_id == honest_id
        pending = survivor.catalog.extra
        assert isinstance(pending, str)
        loaded = json.loads(pending)
        assert loaded["metadata_pending"] is True
        assert "release_group_id" not in loaded

        stored_id = _mbid(72)
        stored_group = _mbid(73)
        stored = _album(
            db,
            title="Already Grouped",
            source_id=stored_id,
            extra=_pending(artist_id=ARTIST, group_id=stored_group),
        )
        _entry(db, stored, 1, review="stored-note")

        def stored_lookup(*_args, **_kwargs):
            raise AssertionError("stored identity must not call a provider")

        monkeypatch.setattr(providers, "lookup_detail", stored_lookup)
        stored_result = records.repair_musicbrainz_albums(db, 1, [stored.id], batch_limit=4)
        assert stored_result["lookups"] == 0
        assert stored_result["repaired"] == 1
        assert db.get(CatalogItem, stored.id).source_id == stored_group
        assert _notes(db, 1, stored.id)[1] == "stored-note"

        blocked_id = _mbid(74)
        blocked = _album(
            db,
            title="Blocked Pressing",
            source_id=blocked_id,
            extra=_pending(artist_id=ARTIST, blocked=True),
        )
        _entry(db, blocked, 1, review="blocked-note", rating=5)
        blocked_result = records.repair_musicbrainz_albums(db, 1, [blocked.id], batch_limit=4)
        assert blocked_result["lookups"] == 0
        assert blocked_result["repaired"] == 0
        assert db.get(CatalogItem, blocked.id).source_id == blocked_id
        assert _notes(db, 1, blocked.id) == (
            5,
            "blocked-note",
            None,
            False,
            None,
            None,
            "want",
        )

        skipped = _album(db, title="Skip Me", source_id=_mbid(75), extra=_pending())
        skipped_entry = _entry(db, skipped, 1, review="skip-note")
        candidate = records._repair_candidate(skipped)
        skipped.source_id = _mbid(76)
        assert records._commit_album_repair(db, 1, candidate, None) == "skipped"
        assert skipped.source_id == _mbid(76)
        assert skipped_entry.review == "skip-note"

        empty = records.repair_musicbrainz_albums(db, 1, [])
        assert empty == {
            "examined": 0,
            "processed": 0,
            "lookups": 0,
            "repaired": 0,
            "unresolved": [],
            "remaining": 0,
            "stopped": "done",
        }
        junk = records.repair_musicbrainz_albums(
            db, 1, [True, False, "nope", blocked.id, blocked.id]
        )
        assert junk["examined"] == 1
        assert junk["lookups"] == 0
        limit_ticks = iter([0.0, 10.0])
        limited = records.repair_musicbrainz_albums(
            db,
            1,
            [skipped.id, blocked.id],
            batch_limit=0,
            deadline_seconds=True,
            clock=lambda: next(limit_ticks),
        )
        assert limited["examined"] == 1
        assert limited["processed"] == 0
        assert limited["stopped"] == "deadline"

        missing = _entry(
            db,
            _album(db, title="Gone", source_id=_mbid(78), extra=_pending()),
            1,
            review="gone",
        )
        db.delete(missing)
        db.flush()
        with pytest.raises(HTTPException) as caught:
            records.finish_album_refresh(db, missing, {"extra": []})
        assert caught.value.status_code == 404


def test_page1_album_page_does_not_repair_full_history(client, monkeypatch):
    """PAGE1: a small page does not scan album history for repair, and pending stays pending."""
    ids = {}
    with client.app.state.database.sessionmaker() as db:
        for index in range(40):
            source_id = _mbid(1000 + index)
            row = _album(
                db,
                title=f"Album {index:02d}",
                source_id=source_id,
                extra=_pending(),
            )
            entry = _entry(db, row, 1, review=f"note-{index:02d}", rating=index % 10)
            ids[entry.id] = (source_id, row.title, entry.review)
        db.commit()
    before = _saved(client)
    _forbid_providers(monkeypatch)

    def measure(**params):
        engine = client.app.state.database.engine
        statements = []

        def record(_connection, _cursor, statement, _parameters, _context, _many):
            if statement.lstrip().upper().startswith("SELECT"):
                statements.append(statement)

        event.listen(engine, "before_cursor_execute", record)
        try:
            response = client.get("/api/library", params=params)
        finally:
            event.remove(engine, "before_cursor_execute", record)
        assert response.status_code == 200, response.text
        return response.json(), statements

    page, statements = measure(kind="album", sort="title", offset=0, limit=2)
    assert page["total"] == 40
    assert page["limit"] == 2
    assert page["has_more"] is True
    assert [item["title"] for item in page["items"]] == ["Album 00", "Album 01"]
    assert len(statements) == 3, statements
    assert any("LIMIT" in statement.upper() for statement in statements)
    later, later_statements = measure(kind="album", sort="title", offset=38, limit=2)
    assert [item["title"] for item in later["items"]] == ["Album 38", "Album 39"]
    assert later["has_more"] is False
    assert len(later_statements) == len(statements)
    filtered, _filtered_statements = measure(kind="album", q="Album 07", sort="title", limit=2)
    assert [item["title"] for item in filtered["items"]] == ["Album 07"]
    for item in page["items"]:
        detail = client.get(f"/api/entries/{item['id']}").json()
        source_id, title, review = ids[item["id"]]
        assert detail["title"] == title
        assert detail["review"] == review
        assert detail["catalog"]["source_id"] == source_id
        assert detail["catalog"]["extra"]["metadata_pending"] is True
        assert "release_group_id" not in detail["catalog"]["extra"]
    assert client.get("/api/summary").status_code == 200
    assert _saved(client) == before
    repeated = client.get(
        "/api/library",
        params={"kind": "album", "sort": "title", "limit": 2, "offset": 0},
    ).json()
    assert repeated["items"][0]["title"] == "Album 00"
    assert _saved(client) == before
