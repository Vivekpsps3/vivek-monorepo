"""Finished movie/tv/book/game rows remember completed_on without a new response key."""

from sqlalchemy import text


def _completed_on(client, entry_id):
    database = client.app.state.database
    with database.sessionmaker() as session:
        return session.execute(
            text("SELECT completed_on FROM user_entries WHERE id = :id"),
            {"id": entry_id},
        ).scalar()


def test_completion_day_follows_status_and_stays_off_the_response(client, monkeypatch):
    monkeypatch.setenv("MEDIA_TODAY", "2026-10-01")
    created = client.post(
        "/api/library",
        json={"kind": "movie", "title": "Local Film", "status": "completed"},
    )
    assert created.status_code == 200, created.text
    assert "completed_on" not in created.text
    entry_id = created.json()["id"]
    assert str(_completed_on(client, entry_id))[:10] == "2026-10-01"

    monkeypatch.setenv("MEDIA_TODAY", "2026-10-20")
    rated = client.patch(f"/api/entries/{entry_id}", json={"rating": 8})
    assert rated.status_code == 200, rated.text
    assert "completed_on" not in rated.text
    assert str(_completed_on(client, entry_id))[:10] == "2026-10-01"

    paused = client.patch(f"/api/entries/{entry_id}", json={"status": "paused"})
    assert paused.status_code == 200, paused.text
    assert _completed_on(client, entry_id) is None

    again = client.patch(f"/api/entries/{entry_id}", json={"status": "completed"})
    assert again.status_code == 200, again.text
    assert str(_completed_on(client, entry_id))[:10] == "2026-10-20"

    album = client.post(
        "/api/library", json={"kind": "album", "title": "Record", "status": "completed"}
    )
    assert album.status_code == 200, album.text
    assert _completed_on(client, album.json()["id"]) is None
    book = client.post("/api/library", json={"kind": "book", "title": "Wanted", "status": "want"})
    assert _completed_on(client, book.json()["id"]) is None
