"""Title sort is accepted, and an unknown sort is recently active."""

from sqlalchemy import event


def _add(client, title):
    response = client.post("/api/library", json={"kind": "book", "title": title, "status": "want"})
    assert response.status_code == 200, response.text
    return response.json()


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


def _request_writes(client, call):
    """One HTTP call, and every INSERT, UPDATE, or DELETE it issues."""
    engine = client.app.state.database.engine
    writes = []

    def record(_connection, _cursor, statement, _parameters, _context, _many):
        verb = statement.lstrip().split(None, 1)[0].upper()
        if verb in {"INSERT", "UPDATE", "DELETE"}:
            writes.append(statement)

    event.listen(engine, "before_cursor_execute", record)
    try:
        response = call()
    finally:
        event.remove(engine, "before_cursor_execute", record)
    return response, writes


def test_same_review_text_with_a_stale_base_is_a_noop(client):
    entry = _add(client, "Dune")
    first = client.patch(
        f"/api/entries/{entry['id']}",
        json={"review": "mine", "review_base": ""},
    )
    assert first.status_code == 200, first.text
    saved_at = first.json()["review_updated_at"]
    assert saved_at
    replay, replay_writes = _request_writes(
        client,
        lambda: client.patch(
            f"/api/entries/{entry['id']}",
            json={"review": "mine", "review_base": ""},
        ),
    )
    assert replay.status_code == 200, replay.text
    assert replay_writes == []
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
    again, again_writes = _request_writes(
        client,
        lambda: client.patch(
            f"/api/entries/{entry['id']}",
            json={"review": "   ", "review_base": saved_at},
        ),
    )
    assert again.status_code == 200, again.text
    assert again_writes == []
    assert again.json()["review"] is None
    assert again.json()["review_updated_at"] == cleared_at
