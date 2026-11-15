"""HUB-02: the exact fourteen-day window, stored wall times and owner isolation."""

from datetime import UTC, date, datetime

import pytest
from sqlalchemy import event

from apps.server.auth import Principal, require_principal
from apps.travel.backend.models import Reminder, Transport, Trip


@pytest.fixture
def upcoming(client, monkeypatch):
    monkeypatch.setattr(
        "apps.travel.backend.routers.board.today_in_zone", lambda zone: date(2026, 12, 25)
    )
    with client.app.state.database.sessionmaker.begin() as db:
        trip = Trip(
            user_id=1, title="Kyoto", start_date=date(2026, 12, 25), end_date=date(2027, 1, 7)
        )
        past = Trip(
            user_id=1, title="Finished", start_date=date(2026, 12, 1), end_date=date(2026, 12, 24)
        )
        foreign = Trip(
            user_id=2,
            title="Private trip",
            start_date=date(2026, 12, 25),
            end_date=date(2027, 1, 1),
        )
        db.add_all([trip, past, foreign])
        db.flush()
        db.add_all(
            [
                Transport(
                    trip_id=trip.id,
                    mode="flight",
                    role="outbound",
                    carrier="Example",
                    number="12",
                    depart_place="SFO",
                    arrive_place="KIX",
                    depart_at=datetime(2026, 12, 26, 9, 30),
                    depart_tz="America/Los_Angeles",
                ),
                Reminder(
                    trip_id=trip.id,
                    title="Overdue",
                    due_at=datetime(2026, 12, 24, 8),
                    kind="packing",
                    notes="Keep this note",
                ),
                Reminder(trip_id=trip.id, title="Midnight", due_at=datetime(2026, 12, 25)),
                Reminder(trip_id=trip.id, title="Last day", due_at=datetime(2027, 1, 7, 9)),
                Reminder(trip_id=trip.id, title="Outside", due_at=datetime(2027, 1, 8)),
                Reminder(trip_id=trip.id, title="Done", due_at=datetime(2026, 12, 25), done=True),
                Reminder(trip_id=trip.id, title="Undated"),
                Reminder(trip_id=past.id, title="Old trip reminder", due_at=datetime(2026, 12, 24)),
                Reminder(
                    trip_id=foreign.id, title="Private reminder", due_at=datetime(2026, 12, 24)
                ),
            ]
        )
        return trip.id, foreign.id


def test_up_next_window_shapes_sort_and_replacement_payload(client, upcoming):
    response = client.get("/api/summary", params={"tz": "America/Los_Angeles"})
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["today"] == "2026-12-25"
    assert [row["title"] for row in body["up_next"]] == [
        "Overdue",
        "Kyoto starts",
        "Midnight",
        "Example 12 · SFO → KIX",
        "Kyoto ends",
        "Last day",
    ]
    overdue, _, midnight, transport, _, last = body["up_next"]
    assert overdue["overdue"] is True
    assert overdue["time"] == "08:00"
    assert midnight["time"] is None
    assert transport["time"] == "09:30"
    assert transport["tz"] == "America/Los_Angeles"
    assert transport["reminder"] is None
    assert last["date"] == "2027-01-07"
    assert overdue["href"] == f"/travel/trips/{upcoming[0]}"
    reminder = overdue["reminder"]
    assert reminder == {
        "id": overdue["id"],
        "title": "Overdue",
        "due_at": "2026-12-24T08:00",
        "done": False,
        "kind": "packing",
        "notes": "Keep this note",
    }
    for done in (True, False):
        payload = {key: value for key, value in reminder.items() if key != "id"}
        payload["done"] = done
        saved = client.patch(f"/api/reminders/{reminder['id']}", json=payload)
        assert saved.status_code == 200, saved.text
        updated = next(row for row in saved.json()["reminders"] if row["id"] == reminder["id"])
        assert updated == {**reminder, "done": done}
        rows = client.get("/api/summary?tz=UTC").json()["up_next"]
        assert any(row["title"] == "Overdue" for row in rows) is not done


def test_up_next_cross_owner_reads_and_writes(client, upcoming):
    first = client.get("/api/summary?tz=UTC").json()
    reminder = first["up_next"][0]["reminder"]
    client.app.dependency_overrides[require_principal] = lambda: Principal(2, "other", "Other")
    second = client.get("/api/summary?tz=UTC").json()
    assert second["next_trip"]["id"] == upcoming[1]
    assert {row["trip_id"] for row in second["up_next"]} == {upcoming[1]}
    assert "Kyoto" not in str(second)
    assert (
        client.patch(
            f"/api/reminders/{reminder['id']}",
            json={
                "title": reminder["title"],
                "due_at": reminder["due_at"],
                "done": True,
                "kind": reminder["kind"],
                "notes": reminder["notes"],
            },
        ).status_code
        == 404
    )


@pytest.mark.parametrize("tz", ["Not/AZone", "America", "../etc/passwd", "/etc/passwd"])
def test_summary_invalid_timezone_is_422(client, tz):
    assert client.get("/api/summary", params={"tz": tz}).status_code == 422


def test_one_day_trip_and_fifty_row_bound_use_fixed_queries(client, monkeypatch):
    monkeypatch.setattr(
        "apps.travel.backend.routers.board.today_in_zone", lambda zone: date(2026, 12, 25)
    )
    with client.app.state.database.sessionmaker.begin() as db:
        for index in range(60):
            db.add(
                Trip(
                    user_id=1,
                    title=f"Day {index:02}",
                    start_date=date(2026, 12, 25),
                    end_date=date(2026, 12, 25),
                )
            )
    statements = []
    engine = client.app.state.database.engine

    def record(_conn, _cursor, statement, _parameters, _context, _many):
        if statement.lstrip().upper().startswith("SELECT"):
            statements.append(statement)

    event.listen(engine, "before_cursor_execute", record)
    try:
        body = client.get("/api/summary?tz=UTC").json()
    finally:
        event.remove(engine, "before_cursor_execute", record)
    assert len(body["up_next"]) == 50
    assert {row["kind"] for row in body["up_next"]} == {"trip_start"}
    assert [row["title"] for row in body["up_next"]][:2] == ["Day 00 starts", "Day 01 starts"]
    assert (
        len(statements) == 4
    )  # Trip + selectinloaded stays, transports, reminders; no PTO/budget reads.


def test_summary_timezone_moves_both_today_and_window_at_utc_midnight(client, monkeypatch):
    from packages.time.today import today_in_zone

    moment = datetime(2026, 12, 25, 6, 30, tzinfo=UTC)
    monkeypatch.setattr(
        "apps.travel.backend.routers.board.today_in_zone", lambda zone: today_in_zone(zone, moment)
    )
    with client.app.state.database.sessionmaker.begin() as db:
        db.add(
            Trip(
                user_id=1, title="Boundary", start_date=date(2027, 1, 7), end_date=date(2027, 1, 7)
            )
        )
    pacific = client.get("/api/summary?tz=America/Los_Angeles").json()
    utc = client.get("/api/summary?tz=UTC").json()
    assert pacific["today"] == "2026-12-24"
    assert utc["today"] == "2026-12-25"
    assert pacific["up_next"] == []
    assert [row["title"] for row in utc["up_next"]] == ["Boundary starts"]
    assert pacific["next_trip"]["days_until"] == 14
    assert utc["next_trip"]["days_until"] == 13
