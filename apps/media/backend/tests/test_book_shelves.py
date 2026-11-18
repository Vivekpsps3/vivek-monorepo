"""Book shelves use stored progress, notes, and canonical author or series ids."""

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
    _absent(response.json(), "completed_on")
    return response.json()


def test_book_cards_group_only_real_identities_and_keep_unknown_progress(client):
    note = "A synthetic margin about the glass house."
    long_note = ("synthetic " * 40).strip()
    current = _save(
        client,
        {
            "kind": "book",
            "title": "Glass House",
            "creator": "Ada Writer",
            "status": "in_progress",
            "progress_value": 40,
            "progress_unit": "page",
            "review": note,
            "artwork_url": "https://covers.openlibrary.org/b/id/1-M.jpg",
            "extra": {"authors": [{"id": "openlibrary:OL10A", "name": "Ada Writer"}]},
        },
    )
    _save(
        client,
        {
            "kind": "book",
            "title": "Second Glass",
            "creator": "Ada Writer",
            "status": "in_progress",
            "extra": {"authors": [{"id": "openlibrary:OL10A", "name": "Ada Writer"}]},
        },
    )
    _save(
        client,
        {
            "kind": "book",
            "title": "Other Glass House",
            "creator": "Ada Writer",
            "status": "in_progress",
            "extra": {"authors": [{"id": "Ada Writer", "name": "Ada Writer"}]},
        },
    )
    _save(
        client,
        {
            "kind": "book",
            "title": "Glass House",
            "creator": "Ada Writer",
            "status": "want",
        },
    )
    _save(client, {"kind": "book", "title": "Missing Cover Tale", "status": "want"})
    _save(
        client,
        {
            "kind": "book",
            "title": "Harbor Cycle One",
            "creator": "Nia Binder",
            "status": "completed",
            "extra": {
                "authors": [{"id": "openlibrary:OL20A", "name": "Nia Binder"}],
                "series": [{"id": "openlibrary:OL55S", "name": "Harbor Cycle"}],
            },
        },
    )
    _save(
        client,
        {
            "kind": "book",
            "title": "Harbor Cycle Two",
            "creator": "Nia Binder",
            "status": "completed",
            "progress_value": 12,
            "progress_unit": "percent",
            "extra": {
                "authors": [{"id": "openlibrary:OL20A", "name": "Nia Binder"}],
                "series": [{"id": "openlibrary:OL55S", "name": "Harbor Cycle"}],
            },
        },
    )
    _save(
        client,
        {
            "kind": "book",
            "title": "Harbor Cycle Three",
            "creator": "Nia Binder",
            "status": "completed",
            "extra": {
                "authors": [{"id": "openlibrary:OL20A", "name": "Nia Binder"}],
                "series": "Harbor Cycle",
            },
        },
    )
    quiet = _save(
        client,
        {
            "kind": "book",
            "title": "Quiet Index",
            "status": "completed",
            "review": long_note,
        },
    )
    _save(client, {"kind": "movie", "title": "Paper Lantern", "status": "want"})

    listed = client.get("/api/library", params={"kind": "book", "sort": "title"}).json()
    _absent(listed, "completed_on")
    by_title: dict[str, list[dict]] = {}
    for item in listed["items"]:
        by_title.setdefault(item["title"], []).append(item)
        assert item["kind"] == "book"
        assert "review" not in item

    assert len(by_title["Glass House"]) == 2
    linked = next(item for item in by_title["Glass House"] if item["status"] == "in_progress")
    unlinked = next(item for item in by_title["Glass House"] if item["status"] == "want")
    assert linked["author"] == {"id": "openlibrary:OL10A", "name": "Ada Writer"}
    assert linked["progress_value"] == 40
    assert linked["progress_label"] == "p. 40"
    assert linked["note"] == note
    assert unlinked["author"] is None
    assert unlinked["creator"] == "Ada Writer"
    assert unlinked["progress_value"] is None
    assert unlinked["progress_label"] is None
    assert by_title["Second Glass"][0]["author"]["id"] == "openlibrary:OL10A"
    assert by_title["Other Glass House"][0]["author"] is None
    assert by_title["Other Glass House"][0]["creator"] == "Ada Writer"
    missing = by_title["Missing Cover Tale"][0]
    assert missing["artwork_url"] is None
    assert missing["author"] is None
    assert missing["creator"] is None
    assert missing["series"] is None
    cycle = by_title["Harbor Cycle One"][0]
    assert cycle["series"] == {"id": "openlibrary:OL55S", "name": "Harbor Cycle"}
    assert by_title["Harbor Cycle Two"][0]["series"]["id"] == "openlibrary:OL55S"
    assert by_title["Harbor Cycle Two"][0]["progress_label"] == "12%"
    assert by_title["Harbor Cycle Three"][0]["series"] is None
    quiet_card = by_title["Quiet Index"][0]
    assert quiet_card["progress_value"] is None
    assert quiet_card["progress_label"] is None
    assert quiet_card["status"] == "completed"
    assert quiet_card["note"] != long_note
    assert quiet_card["note"].endswith("…")
    assert len(quiet_card["note"]) <= 161

    detail = client.get(f"/api/entries/{quiet['id']}").json()
    assert detail["review"] == long_note
    assert "completed_on" not in detail
    _absent(detail, "completed_on")

    finished = client.patch(f"/api/entries/{current['id']}", json={"status": "completed"})
    assert finished.status_code == 200, finished.text
    assert finished.json()["status"] == "completed"
    assert finished.json()["progress_value"] == 40
    assert finished.json()["progress_label"] == "p. 40"
    assert finished.json()["review"] == note
    _absent(finished.json(), "completed_on")

    rejected = client.patch(
        f"/api/entries/{current['id']}",
        json={"progress_value": 140, "progress_unit": "percent"},
    )
    assert rejected.status_code == 422
    again = client.get(f"/api/entries/{current['id']}").json()
    assert again["progress_value"] == 40
    assert again["progress_unit"] == "page"

    client.app.dependency_overrides[require_principal] = lambda: Principal(2, "other", "Other")
    denied = client.patch(
        f"/api/entries/{current['id']}", json={"progress_value": 1, "progress_unit": "page"}
    )
    assert denied.status_code == 404
    client.app.dependency_overrides[require_principal] = lambda: Principal(1, "tester", "Tester")
    owned = client.get(f"/api/entries/{current['id']}").json()
    assert owned["progress_value"] == 40

    mixed = client.get("/api/library", params={"sort": "title"}).json()["items"]
    movie = next(item for item in mixed if item["title"] == "Paper Lantern")
    assert "author" not in movie
    assert "series" not in movie
    assert "note" not in movie
    assert movie["kind"] == "movie"


def test_openlibrary_save_keeps_a_canonical_author_and_drops_a_name_series(client, monkeypatch):
    from apps.media.backend.services import providers

    def detail(source, kind, source_id):
        return {
            "source": source,
            "source_id": source_id,
            "kind": kind,
            "title": "Imported Glass",
            "creator": "Ada Writer",
            "year": 2001,
            "overview": "Synthetic.",
            "artwork_url": "https://covers.openlibrary.org/b/id/1-M.jpg",
            "genres": [],
            "external_ratings": [],
            "extra": {
                "record": "work",
                "authors": [{"id": "openlibrary:OL10A", "name": "Ada Writer"}],
                "series": [{"id": "Harbor Cycle", "name": "Harbor Cycle"}],
            },
            "releases": [],
            "episodes": [],
            "provenance": {"provider": "openlibrary", "coverage": "official"},
        }

    monkeypatch.setattr(providers, "lookup_detail", detail)
    saved = client.post(
        "/api/library/from-provider",
        json={
            "source": "openlibrary",
            "source_id": "OL9W",
            "kind": "book",
            "title": "Client title",
            "creator": "Nobody",
            "status": "want",
        },
    )
    assert saved.status_code == 200, saved.text
    listed = client.get("/api/library", params={"kind": "book", "sort": "title"}).json()["items"]
    imported = next(item for item in listed if item["title"] == "Imported Glass")
    assert imported["author"] == {"id": "openlibrary:OL10A", "name": "Ada Writer"}
    assert imported["series"] is None
    assert imported["progress_value"] is None
    assert imported["creator"] == "Ada Writer"
