"""A done reminder records done_at, and undo clears it, without a new response key."""

from sqlalchemy import text


def _done_at(client, reminder_id):
    database = client.app.state.database
    with database.sessionmaker() as session:
        return session.execute(
            text("SELECT done_at FROM reminders WHERE id = :id"),
            {"id": reminder_id},
        ).scalar()


def test_reminder_done_at_follows_the_toggle(client):
    created = client.post(
        "/api/trips",
        json={
            "title": "Kyoto",
            "start_date": "2026-10-01",
            "end_date": "2026-10-03",
            "status": "planning",
            "counts_as_pto": False,
        },
    )
    assert created.status_code == 201, created.text
    reminder = client.post(
        f"/api/trips/{created.json()['id']}/reminders",
        json={"title": "Pack", "done": True},
    )
    assert reminder.status_code == 201, reminder.text
    assert "done_at" not in reminder.text
    packed = next(item for item in reminder.json()["reminders"] if item["title"] == "Pack")
    assert set(packed) == {"id", "title", "due_at", "done", "kind", "notes"}
    first = _done_at(client, packed["id"])
    assert first is not None

    edited = client.patch(
        f"/api/reminders/{packed['id']}",
        json={"title": "Pack charger", "done": True},
    )
    assert edited.status_code == 200, edited.text
    assert "done_at" not in edited.text
    assert _done_at(client, packed["id"]) == first

    cleared = client.patch(
        f"/api/reminders/{packed['id']}",
        json={"title": "Pack charger", "done": False},
    )
    assert cleared.status_code == 200, cleared.text
    assert _done_at(client, packed["id"]) is None

    redone = client.patch(
        f"/api/reminders/{packed['id']}",
        json={"title": "Pack charger", "done": True},
    )
    assert redone.status_code == 200, redone.text
    assert _done_at(client, packed["id"]) is not None
