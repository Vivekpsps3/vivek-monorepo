"""Trip memories are a read of saved trips. There is no memory table."""

from datetime import UTC, date, datetime, timedelta

from sqlalchemy import inspect

from apps.travel.backend.models import Stay, Trip


def _memories(client, tz="UTC"):
    response = client.get("/api/memories", params={"tz": tz})
    assert response.status_code == 200, response.text
    return response.json()


def _by_title(payload, title):
    matches = [item for item in payload["memories"] if item["title"] == title]
    assert len(matches) == 1, payload
    return matches[0]


def _create(client, **body):
    payload = {"counts_as_pto": False, **body}
    response = client.post("/api/trips", json=payload)
    assert response.status_code == 201, response.text
    return response.json()


def _session(client):
    return client.app.state.database.sessionmaker()


def _stamp(client, trip_id, instant):
    db = _session(client)
    try:
        row = db.get(Trip, trip_id)
        assert row is not None
        row.created_at = instant
        row.updated_at = instant
        db.commit()
    finally:
        db.close()


def test_timezone_credit_follows_the_logged_civil_day(client):
    created = _create(
        client,
        title="Boundary",
        start_date="2026-10-26",
        end_date="2026-10-28",
        status="booked",
    )
    _stamp(client, created["id"], datetime(2026, 10, 29, 6, 30, tzinfo=UTC))
    utc = _by_title(_memories(client, "UTC"), "Boundary")
    la = _by_title(_memories(client, "America/Los_Angeles"), "Boundary")
    assert utc["credit_date"] is None
    assert utc["credit_eligible"] is False
    assert (
        "Logged on October 29, 2026, after this trip ended on October 28, 2026."
        in utc["credit_text"]
    )
    assert "Town does not credit it." in utc["credit_text"]
    assert utc["logged_on"] == "2026-10-29"
    assert la["logged_on"] == "2026-10-28"
    assert la["credit_eligible"] is True
    assert la["credit_date"] == "2026-10-29"
    assert "Town credits this booked trip once on October 29, 2026" in la["credit_text"]
    assert "separate from the span October 26, 2026 through October 28, 2026" in la["credit_text"]


def test_a_naive_log_time_is_utc(client):
    created = _create(
        client,
        title="Naive log",
        start_date="2026-10-26",
        end_date="2026-10-28",
        status="done",
    )
    _stamp(client, created["id"], datetime(2026, 10, 29, 6, 30))
    utc = _by_title(_memories(client, "UTC"), "Naive log")
    la = _by_title(_memories(client, "America/Los_Angeles"), "Naive log")
    assert utc["logged_on"] == "2026-10-29"
    assert utc["credit_date"] is None
    assert la["logged_on"] == "2026-10-28"
    assert la["credit_date"] == "2026-10-29"
    assert "completed trip" in la["credit_text"]


def test_planned_booked_and_completed_stay_distinct(client):
    _create(
        client,
        title="Planned harbor",
        start_date="2090-04-01",
        end_date="2090-04-05",
        status="planning",
        origin_label="Harbor",
        stays=[{"city": "Lisbon", "arrive_on": "2090-04-01", "leave_on": "2090-04-05"}],
    )
    _create(
        client,
        title="Booked fjord",
        start_date="2090-06-01",
        end_date="2090-06-03",
        status="booked",
        stays=[{"city": "Bergen", "arrive_on": "2090-06-01", "leave_on": "2090-06-03"}],
    )
    _create(
        client,
        title="Completed coast",
        start_date="2090-08-01",
        end_date="2090-08-01",
        status="done",
        stays=[{"city": "Portland", "arrive_on": "2090-08-01", "leave_on": "2090-08-01"}],
    )
    payload = _memories(client)
    planned = _by_title(payload, "Planned harbor")
    booked = _by_title(payload, "Booked fjord")
    done = _by_title(payload, "Completed coast")
    assert planned["mark"] == "planned"
    assert planned["mark_label"] == "Planned"
    assert planned["credit_date"] is None
    assert planned["credit_text"].startswith(
        "This trip is planned. Town does not credit a planned trip."
    )
    assert planned["destinations"] == ["Lisbon"]
    assert "Harbor" not in planned["world_text"]
    assert booked["mark"] == "booked"
    assert booked["credit_date"] == "2090-06-04"
    assert "Town credits this booked trip once on June 4, 2090" in booked["credit_text"]
    assert done["mark"] == "completed"
    assert done["credit_date"] == "2090-08-02"
    assert done["span_text"] == "August 1, 2090"
    assert "1 day" in done["pixels_text"]
    assert "The place is the saved destination Portland." in done["world_text"]
    assert payload["source"] == "trips"
    assert payload["cap"] == 50
    assert [item["id"] for item in payload["differences"]] == [
        "trip-span-versus-credit",
        "planned-versus-completed",
        "world-versus-saved-place",
    ]


def test_late_overlapping_trips_keep_both_spans_and_explain_credit(client):
    north = _create(
        client,
        title="Late north",
        start_date="2020-03-01",
        end_date="2020-03-10",
        status="booked",
        stays=[
            {"city": "Oslo", "arrive_on": "2020-03-01", "leave_on": "2020-03-04"},
            {"city": "Oslo", "arrive_on": "2020-03-05", "leave_on": "2020-03-07"},
            {"city": "Tromso", "arrive_on": "2020-03-08", "leave_on": "2020-03-10"},
        ],
    )
    south = _create(
        client,
        title="Late south",
        start_date="2020-03-08",
        end_date="2020-03-15",
        status="done",
    )
    _create(
        client,
        title="Oslo",
        start_date="2020-01-01",
        end_date="2020-01-02",
        status="done",
        origin_label="Oslo",
    )
    payload = _memories(client)
    north_memory = _by_title(payload, "Late north")
    south_memory = _by_title(payload, "Late south")
    titled = _by_title(payload, "Oslo")
    assert north_memory["id"] == f"trip:{north['id']}"
    assert north_memory["route"] == f"/travel/trips/{north['id']}"
    assert north_memory["span_text"] == "March 1, 2020 through March 10, 2020"
    assert north_memory["span_days"] == 10
    assert north_memory["credit_date"] is None
    assert "after this trip ended on March 10, 2020" in north_memory["credit_text"]
    assert "Town does not credit it." in north_memory["credit_text"]
    assert north_memory["destinations"] == ["Oslo", "Tromso"]
    assert "The place is the saved destination Oslo and Tromso." in north_memory["world_text"]
    assert "10 days" in north_memory["pixels_text"]
    assert "Shared days with Late south stay on each trip." in north_memory["pixels_text"]
    assert north_memory["overlaps"] == [
        {
            "trip_id": south["id"],
            "title": "Late south",
            "span_text": "March 8, 2020 through March 15, 2020",
        }
    ]
    assert (
        north_memory["overlap_text"]
        == "Overlaps Late south (March 8, 2020 through March 15, 2020). Both spans stay."
    )
    assert south_memory["credit_date"] is None
    assert "after this trip ended on March 15, 2020" in south_memory["credit_text"]
    assert (
        south_memory["world_text"] == "No saved destination. This memory does not invent a place."
    )
    assert south_memory["destinations"] == []
    assert "Late north (March 1, 2020 through March 10, 2020)" in south_memory["overlap_text"]
    assert titled["destinations"] == []
    assert titled["world_text"] == "No saved destination. This memory does not invent a place."
    assert "Oslo" not in titled["world_text"]
    assert payload["total"] == 3
    assert payload["truncated"] is False


def test_three_places_and_a_blank_city_stay_honest(client):
    created = _create(
        client,
        title="Three ports",
        start_date="2090-05-01",
        end_date="2090-05-06",
        status="booked",
        stays=[
            {"city": "Lisbon", "arrive_on": "2090-05-01", "leave_on": "2090-05-02"},
            {"city": "Bergen", "arrive_on": "2090-05-03", "leave_on": "2090-05-04"},
        ],
    )
    db = _session(client)
    try:
        db.add(
            Stay(
                trip_id=created["id"],
                sort_order=2,
                city="   ",
                arrive_on=date(2090, 5, 5),
                leave_on=date(2090, 5, 6),
            )
        )
        db.add(
            Stay(
                trip_id=created["id"],
                sort_order=3,
                city="Portland",
                arrive_on=date(2090, 5, 5),
                leave_on=date(2090, 5, 6),
            )
        )
        db.commit()
    finally:
        db.close()
    memory = _by_title(_memories(client), "Three ports")
    assert memory["destinations"] == ["Lisbon", "Bergen", "Portland"]
    assert (
        "The place is the saved destination Lisbon, Bergen, and Portland." in memory["world_text"]
    )


def test_cancel_redate_and_delete_reread_the_saved_trips(client):
    north = _create(
        client,
        title="Late north",
        start_date="2020-03-01",
        end_date="2020-03-10",
        status="booked",
        stays=[{"city": "Oslo", "arrive_on": "2020-03-01", "leave_on": "2020-03-10"}],
    )
    south = _create(
        client,
        title="Late south",
        start_date="2020-03-08",
        end_date="2020-03-15",
        status="done",
    )
    harbor = _create(
        client,
        title="Planned harbor",
        start_date="2090-04-01",
        end_date="2090-04-05",
        status="planning",
        stays=[{"city": "Lisbon", "arrive_on": "2090-04-01", "leave_on": "2090-04-05"}],
    )
    coast = _create(
        client,
        title="Completed coast",
        start_date="2090-08-01",
        end_date="2090-08-06",
        status="done",
        stays=[{"city": "Portland", "arrive_on": "2090-08-01", "leave_on": "2090-08-06"}],
    )
    before = _memories(client)
    assert len(before["memories"]) == 4
    redated = client.patch(
        f"/api/trips/{south['id']}",
        json={"start_date": "2090-09-01", "end_date": "2090-09-04"},
    )
    assert redated.status_code == 200, redated.text
    moved = _memories(client)
    south_memory = _by_title(moved, "Late south")
    north_memory = _by_title(moved, "Late north")
    assert south_memory["id"] == f"trip:{south['id']}"
    assert south_memory["span_text"] == "September 1, 2090 through September 4, 2090"
    assert south_memory["credit_date"] == "2090-09-05"
    assert "September 5, 2090" in south_memory["credit_text"]
    assert south_memory["overlap_text"] == "No saved trip overlaps this span."
    assert "Late south" not in north_memory["overlap_text"]
    assert north_memory["overlap_text"] == "No saved trip overlaps this span."
    assert len(moved["memories"]) == 4
    canceled = client.patch(f"/api/trips/{coast['id']}", json={"status": "planning"})
    assert canceled.status_code == 200, canceled.text
    planned = _by_title(_memories(client), "Completed coast")
    assert planned["status"] == "planning"
    assert planned["mark_label"] == "Planned"
    assert planned["credit_date"] is None
    assert planned["credit_text"].startswith("This trip is planned.")
    assert planned["span_text"] == "August 1, 2090 through August 6, 2090"
    removed = client.delete(f"/api/trips/{harbor['id']}")
    assert removed.status_code == 204, removed.text
    remaining = _memories(client)
    assert [
        item["title"] for item in remaining["memories"] if item["title"] == "Planned harbor"
    ] == []
    assert remaining["total"] == 3
    assert f"trip:{north['id']}" in {item["id"] for item in remaining["memories"]}
    db = _session(client)
    try:
        row = db.get(Trip, north["id"])
        assert row is not None
        seen = row.updated_at
        db.commit()
    finally:
        db.close()
    _memories(client)
    db = _session(client)
    try:
        row = db.get(Trip, north["id"])
        assert row is not None
        assert row.updated_at == seen
    finally:
        db.close()


def test_the_cap_drops_the_oldest_return_and_its_overlap(client):
    db = _session(client)
    try:
        base = date(2000, 1, 1)
        logged = datetime(2000, 1, 1, tzinfo=UTC)
        for index in range(51):
            if index == 0:
                start, end = base, base + timedelta(days=2)
                title = "Oldest overlap"
            elif index == 1:
                start, end = base + timedelta(days=1), base + timedelta(days=4)
                title = "Kept neighbor"
            else:
                start = base + timedelta(days=10 + index * 3)
                end = start
                title = f"Kept {index}"
            db.add(
                Trip(
                    user_id=1,
                    title=title,
                    start_date=start,
                    end_date=end,
                    status="booked",
                    counts_as_pto=False,
                    created_at=logged,
                    updated_at=logged,
                )
            )
        db.commit()
    finally:
        db.close()
    payload = _memories(client)
    titles = [item["title"] for item in payload["memories"]]
    assert payload["total"] == 51
    assert payload["included"] == 50
    assert payload["truncated"] is True
    assert payload["notice"] == (
        "Showing 50 of 51 trips, newest return dates first. Older trips stay on their records."
    )
    assert "Oldest overlap" not in titles
    assert "Kept neighbor" in titles
    neighbor = _by_title(payload, "Kept neighbor")
    assert neighbor["overlap_text"] == "No saved trip overlaps this span."
    assert neighbor["credit_eligible"] is True


def test_another_owner_is_hidden(client):
    _create(
        client,
        title="Mine",
        start_date="2090-01-01",
        end_date="2090-01-02",
        status="planning",
    )
    db = _session(client)
    try:
        logged = datetime(2020, 1, 1, tzinfo=UTC)
        db.add(
            Trip(
                user_id=2,
                title="Theirs",
                start_date=date(2090, 1, 1),
                end_date=date(2090, 1, 3),
                status="done",
                counts_as_pto=False,
                created_at=logged,
                updated_at=logged,
            )
        )
        db.commit()
    finally:
        db.close()
    payload = _memories(client)
    assert [item["title"] for item in payload["memories"]] == ["Mine"]
    assert payload["total"] == 1


def test_invalid_timezone_is_rejected(client):
    missing = client.get("/api/memories")
    assert missing.status_code == 422
    blank = client.get("/api/memories", params={"tz": " "})
    assert blank.status_code == 422
    assert blank.json()["detail"] == "Use a valid IANA timezone."
    unknown = client.get("/api/memories", params={"tz": "Not/AZone"})
    assert unknown.status_code == 422
    assert unknown.json()["detail"] == "Use a valid IANA timezone."


def test_a_reversed_span_and_unknown_status_do_not_invent_credit(client):
    db = _session(client)
    try:
        logged = datetime(2026, 1, 1, tzinfo=UTC)
        db.add(
            Trip(
                user_id=1,
                title="Reversed",
                start_date=date(2090, 2, 4),
                end_date=date(2090, 2, 1),
                status="booked",
                counts_as_pto=False,
                created_at=logged,
                updated_at=logged,
            )
        )
        db.add(
            Trip(
                user_id=1,
                title="Paused",
                start_date=date(2090, 3, 1),
                end_date=date(2090, 3, 2),
                status="paused",
                counts_as_pto=False,
                created_at=logged,
                updated_at=logged,
            )
        )
        db.commit()
    finally:
        db.close()
    payload = _memories(client)
    reversed_trip = _by_title(payload, "Reversed")
    paused = _by_title(payload, "Paused")
    assert reversed_trip["span_days"] == 0
    assert reversed_trip["credit_date"] is None
    assert paused["credit_date"] is None
    assert "Town credits a booked or completed trip, not this status." in paused["credit_text"]
    assert paused["mark_label"] == "paused"


def test_projection_has_no_memory_table(client):
    _create(
        client,
        title="Mine",
        start_date="2090-01-01",
        end_date="2090-01-02",
        status="planning",
    )
    _memories(client)
    names = set(inspect(client.app.state.database.engine).get_table_names())
    assert "trips" in names
    assert "stays" in names
    assert "memories" not in names
    assert "trip_memories" not in names
