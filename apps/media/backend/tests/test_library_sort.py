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
