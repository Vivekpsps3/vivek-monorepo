"""Title sort is accepted, and an unknown sort is recently active."""


def _add(client, title):
    response = client.post("/api/library", json={"kind": "book", "title": title, "status": "want"})
    assert response.status_code == 200, response.text
    return response.json()


def test_title_sort_is_case_insensitive(client):
    _add(client, "zeta")
    _add(client, "Alpha")
    _add(client, "middle")
    listed = client.get("/api/library", params={"sort": "title"})
    assert listed.status_code == 200, listed.text
    assert [item["title"] for item in listed.json()["items"]] == ["Alpha", "middle", "zeta"]


def test_unknown_sort_falls_back_to_activity(client):
    first = _add(client, "First")
    second = _add(client, "Second")
    assert client.patch(f"/api/entries/{first['id']}", json={"favorite": True}).status_code == 200
    activity = [
        item["title"]
        for item in client.get("/api/library", params={"sort": "activity"}).json()["items"]
    ]
    unknown = client.get("/api/library", params={"sort": "nope"})
    assert unknown.status_code == 200, unknown.text
    assert [item["title"] for item in unknown.json()["items"]] == activity
    assert activity[0] == "First"
    assert second["title"] == "Second"


def test_title_sort_folds_accents_and_non_english_case(client):
    for title in ("Zebra", "école", "Alpha", "Éclair", "ångström"):
        _add(client, title)
    listed = client.get("/api/library", params={"sort": "title", "limit": 10})
    assert listed.status_code == 200, listed.text
    assert [item["title"] for item in listed.json()["items"]] == [
        "Alpha",
        "ångström",
        "Éclair",
        "école",
        "Zebra",
    ]


def test_title_sort_accepts_any_case(client):
    _add(client, "Alpha")
    _add(client, "zeta")
    listed = client.get("/api/library", params={"sort": "Title"})
    assert listed.status_code == 200, listed.text
    assert [item["title"] for item in listed.json()["items"]] == ["Alpha", "zeta"]


def test_progress_rejects_non_finite_and_negative_values(client):
    entry = _add(client, "Dune")
    for value in ("nan", "inf", "-inf", -3):
        rejected = client.patch(
            f"/api/entries/{entry['id']}",
            json={"progress_value": value, "progress_unit": "page"},
        )
        assert rejected.status_code == 422, rejected.text
    kept = client.get(f"/api/entries/{entry['id']}").json()
    assert kept["progress_value"] is None


def test_stale_review_base_is_a_conflict(client):
    entry = _add(client, "Dune")
    first = client.patch(f"/api/entries/{entry['id']}", json={"review": "one"})
    assert first.status_code == 200, first.text
    base = first.json()["review_updated_at"]
    second = client.patch(
        f"/api/entries/{entry['id']}",
        json={"review": "two", "review_base": base},
    )
    assert second.status_code == 200, second.text
    stale = client.patch(
        f"/api/entries/{entry['id']}",
        json={"review": "stale", "review_base": base},
    )
    assert stale.status_code == 409, stale.text
    assert stale.json()["detail"] == "This note changed in another tab."
    assert client.get(f"/api/entries/{entry['id']}").json()["review"] == "two"


def test_same_review_text_with_a_stale_base_is_a_noop(client):
    entry = _add(client, "Dune")
    first = client.patch(
        f"/api/entries/{entry['id']}",
        json={"review": "mine", "review_base": ""},
    )
    assert first.status_code == 200, first.text
    saved_at = first.json()["review_updated_at"]
    assert saved_at
    replay = client.patch(
        f"/api/entries/{entry['id']}",
        json={"review": "mine", "review_base": ""},
    )
    assert replay.status_code == 200, replay.text
    body = replay.json()
    assert body["review"] == "mine"
    assert body["review_updated_at"] == saved_at
    assert body["updated_at"] == first.json()["updated_at"]
    blank = client.patch(
        f"/api/entries/{entry['id']}",
        json={"review": "", "review_base": saved_at},
    )
    assert blank.status_code == 200, blank.text
    cleared_at = blank.json()["review_updated_at"]
    again = client.patch(
        f"/api/entries/{entry['id']}",
        json={"review": "   ", "review_base": saved_at},
    )
    assert again.status_code == 200, again.text
    assert again.json()["review"] is None
    assert again.json()["review_updated_at"] == cleared_at


def test_identical_review_does_not_skip_the_base_check_for_other_fields(client):
    entry = _add(client, "Dune")
    first = client.patch(
        f"/api/entries/{entry['id']}",
        json={"review": "mine", "status": "want"},
    )
    assert first.status_code == 200, first.text
    base = first.json()["review_updated_at"]
    stale = client.patch(
        f"/api/entries/{entry['id']}",
        json={"review": "mine", "review_base": "2000-01-01T00:00:00+00:00", "status": "paused"},
    )
    assert stale.status_code == 409, stale.text
    kept = client.get(f"/api/entries/{entry['id']}").json()
    assert kept["status"] == "want"
    assert kept["review"] == "mine"
    moved = client.patch(
        f"/api/entries/{entry['id']}",
        json={"review": "mine", "review_base": base, "status": "paused"},
    )
    assert moved.status_code == 200, moved.text
    assert moved.json()["status"] == "paused"
    assert moved.json()["review_updated_at"] == base
    assert moved.json()["updated_at"] != first.json()["updated_at"]


def test_progress_survives_a_reload(client):
    entry = _add(client, "Dune")
    saved = client.patch(
        f"/api/entries/{entry['id']}", json={"progress_value": 120, "progress_unit": "page"}
    )
    assert saved.status_code == 200, saved.text
    body = saved.json()
    assert body["progress_value"] == 120
    assert body["progress_unit"] == "page"
    assert body["progress_label"] == "p. 120"
    again = client.get(f"/api/entries/{entry['id']}").json()
    assert again["progress_value"] == 120
    assert again["progress_unit"] == "page"
    card = client.get("/api/library").json()["items"][0]
    assert card["progress_label"] == "p. 120"


def test_membership_pages_filter_count_and_materialize_only_the_requested_window(
    client, monkeypatch
):
    from apps.media.backend.services import records

    for title in ("Delta", "Alpha", "Charlie", "Bravo", "Echo"):
        _add(client, title)
    rendered: list[str] = []
    original = records.library_cards

    def cards(db, entries):
        rendered.extend(entry.catalog.title for entry in entries)
        return original(db, entries)

    monkeypatch.setattr(records, "library_cards", cards)
    page = client.get("/api/library", params={"sort": "title", "offset": 2, "limit": 2}).json()
    assert page["total"] == 5
    assert page["has_more"] is True
    assert [item["title"] for item in page["items"]] == ["Charlie", "Delta"]
    assert rendered == ["Charlie", "Delta"]
    last = client.get("/api/library", params={"sort": "title", "offset": 4, "limit": 2}).json()
    assert [item["title"] for item in last["items"]] == ["Echo"]
    assert last["has_more"] is False
    filtered = client.get("/api/library", params={"q": "l", "limit": 1}).json()
    assert filtered["total"] == 3
    assert len(filtered["items"]) == 1
    assert client.get("/api/library", params={"offset": -1}).status_code == 422
    assert client.get("/api/library", params={"limit": 101}).status_code == 422
