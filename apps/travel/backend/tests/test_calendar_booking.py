"""A flight calendar preview parses the leg and writes nothing."""

import pytest

from apps.server.auth import Principal, require_principal
from apps.travel.backend.services.calendar_booking import (
    AMBIGUOUS_ARRIVAL,
    AMBIGUOUS_DEPARTURE,
    LONG_IDENTITY,
    MALFORMED,
    MAX_CALENDAR_BYTES,
    MISSING_ARRIVAL,
    MISSING_DEPARTURE,
    MISSING_IDENTITY,
    MULTIPLE,
    OVERSIZED,
    REPEATING,
    UNSUPPORTED,
)

UID = "synthetic-ua837-20261102"


def _ics(
    *,
    uid: str = UID,
    start: str = "DTSTART;TZID=America/Los_Angeles:20261102T100000",
    end: str = "DTEND;TZID=Asia/Tokyo:20261104T073000",
    summary: str = "SUMMARY:UA837 SFO-NRT",
    extra: str = "",
    version: str = "VERSION:2.0",
) -> str:
    lines = [
        "BEGIN:VCALENDAR",
        version,
        "PRODID:-//Synthetic//TUX-05//EN",
        extra,
        "BEGIN:VEVENT",
        f"UID:{uid}",
        start,
        end,
        summary,
        "END:VEVENT",
        "END:VCALENDAR",
        "",
    ]
    return "\r\n".join(line for line in lines if line != "")


def _counts(client) -> dict[str, int]:
    drafts = client.get("/api/trip-drafts").json()["drafts"]
    home = client.get("/api/home").json()
    trips = [trip for key in ("in_progress", "upcoming", "past") for trip in home[key]]
    return {
        "drafts": len(drafts),
        "legs": sum(len(row["legs"]) for row in drafts),
        "trips": len(trips),
        "pto": len(client.get("/api/pto").json()["entries"]),
    }


def _preview(client, text: str):
    response = client.post("/api/calendar-bookings/preview", json={"text": text})
    assert response.status_code == 200, response.text
    return response.json()


def test_preview_reads_zone_and_identity_and_writes_nothing(client):
    before = _counts(client)
    body = _preview(client, _ics())
    assert body["ok"] is True
    assert body["code"] == "preview"
    assert body["existing"] is None
    assert body["booking"] == {
        "uid": UID,
        "number": "UA837",
        "origin": "SFO",
        "destination": "NRT",
        "depart_at": "2026-11-02T10:00:00",
        "arrive_at": "2026-11-04T07:30:00",
        "depart_tz": "America/Los_Angeles",
        "arrive_tz": "Asia/Tokyo",
        "depart_label": "2026-11-02 10:00 America/Los_Angeles",
        "arrive_label": "2026-11-04 07:30 Asia/Tokyo",
    }
    assert _counts(client) == before


def test_folded_quoted_and_zero_padded_flight_keeps_the_same_leg(client):
    text = "\n".join(
        [
            "BEGIN:VCALENDAR",
            "BEGIN:VTIMEZONE",
            "TZID:America/Los_Angeles",
            "BEGIN:STANDARD",
            "DTSTART:19701101T020000",
            "TZOFFSETFROM:-0700",
            "TZOFFSETTO:-0800",
            "END:STANDARD",
            "END:VTIMEZONE",
            "BEGIN:VEVENT",
            "UID:synthetic-ua837-20261102",
            'DTSTART;TZID="America/Los_Angeles":20261102T100000',
            "DTEND:20261103T223000Z",
            "SUMMARY:Flight UA 0837 SFO-",
            " NRT",
            "BEGIN:VALARM",
            "ACTION:DISPLAY",
            "DESCRIPTION:Synthetic alarm",
            "END:VALARM",
            "END:VEVENT",
            "END:VCALENDAR",
        ]
    )
    body = _preview(client, text)
    assert body["ok"] is True
    assert body["booking"]["number"] == "UA837"
    assert body["booking"]["destination"] == "NRT"
    assert body["booking"]["depart_tz"] == "America/Los_Angeles"
    assert body["booking"]["arrive_tz"] == "UTC"
    assert body["booking"]["arrive_label"] == "2026-11-03 22:30 UTC"
    assert _counts(client)["drafts"] == 0


def test_the_same_booking_on_a_draft_is_offered_and_not_copied(client):
    saved = client.post(
        "/api/trip-drafts",
        json={
            "title": "Flight UA837",
            "start_date": "2026-11-02",
            "end_date": None,
            "legs": [
                {
                    "role": "outbound",
                    "mode": "flight",
                    "number": "UA837",
                    "depart_place": "SFO",
                    "arrive_place": "NRT",
                    "depart_at": "2026-11-02T10:00:00",
                    "arrive_at": "2026-11-04T07:30:00",
                    "depart_tz": "America/Los_Angeles",
                    "arrive_tz": "Asia/Tokyo",
                    "confirmation": UID,
                }
            ],
            "client_request_id": "calendar-draft-1",
        },
    )
    assert saved.status_code == 201, saved.text
    before = _counts(client)
    body = _preview(client, _ics())
    assert body["existing"] == {
        "kind": "draft",
        "id": saved.json()["id"],
        "title": "Flight UA837",
        "leg_id": saved.json()["legs"][0]["id"],
    }
    assert _counts(client) == before


def test_a_saved_trip_leg_wins_over_a_draft_with_the_same_identity(client):
    draft = client.post(
        "/api/trip-drafts",
        json={
            "title": "Flight UA837",
            "start_date": "2026-11-02",
            "legs": [
                {
                    "role": "outbound",
                    "mode": "flight",
                    "number": "UA837",
                    "confirmation": UID,
                }
            ],
            "client_request_id": "calendar-draft-2",
        },
    )
    assert draft.status_code == 201, draft.text
    trip = client.post(
        "/api/trips",
        json={
            "title": "Lisbon week",
            "start_date": "2026-04-06",
            "end_date": "2026-04-10",
            "stays": [{"city": "Lisbon", "arrive_on": "2026-04-06", "leave_on": "2026-04-10"}],
        },
    )
    assert trip.status_code == 201, trip.text
    trip_id = trip.json()["id"]
    before_pto = client.get("/api/pto").json()
    added = client.post(
        f"/api/trips/{trip_id}/transports",
        json={
            "role": "outbound",
            "mode": "flight",
            "number": "UA837",
            "depart_place": "SFO",
            "arrive_place": "NRT",
            "confirmation": UID,
        },
    )
    assert added.status_code == 201, added.text
    before_legs = len(client.get(f"/api/trips/{trip_id}").json()["transports"])
    body = _preview(client, _ics())
    assert body["existing"]["kind"] == "trip"
    assert body["existing"]["id"] == trip_id
    assert body["existing"]["title"] == "Lisbon week"
    assert len(client.get(f"/api/trips/{trip_id}").json()["transports"]) == before_legs
    assert client.get("/api/pto").json() == before_pto
    detail = client.get(f"/api/trips/{trip_id}").json()
    assert detail["end_date"] == "2026-04-10"
    assert detail["start_date"] == "2026-04-06"


def test_another_owner_and_a_drive_do_not_count_as_the_flight(client):
    drive = client.post(
        "/api/trips",
        json={
            "title": "Drive week",
            "start_date": "2026-05-04",
            "end_date": "2026-05-08",
            "stays": [{"city": "Lisbon", "arrive_on": "2026-05-04", "leave_on": "2026-05-08"}],
            "transports": [
                {
                    "role": "outbound",
                    "mode": "drive",
                    "depart_place": "SFO",
                    "arrive_place": "NRT",
                    "confirmation": UID,
                }
            ],
        },
    )
    assert drive.status_code == 201, drive.text
    assert _preview(client, _ics())["existing"] is None
    client.app.dependency_overrides[require_principal] = lambda: Principal(2, "other", "Other")
    hidden = _preview(client, _ics())
    assert hidden["ok"] is True
    assert hidden["existing"] is None
    assert client.get("/api/trip-drafts").json()["drafts"] == []
    client.app.dependency_overrides[require_principal] = lambda: Principal(1, "tester", "Tester")
    assert client.get(f"/api/trips/{drive.json()['id']}").json()["title"] == "Drive week"


@pytest.mark.parametrize(
    ("text", "code", "reason"),
    [
        ("hello", "malformed", MALFORMED),
        ("BEGIN:VCALENDAR\nBEGIN:VEVENT\nUID:x\n", "malformed", MALFORMED),
        ("x" * (MAX_CALENDAR_BYTES + 1), "oversized", OVERSIZED),
        (_ics(start="DTSTART:20261102T100000"), "ambiguous_timezone", AMBIGUOUS_DEPARTURE),
        (_ics(start="DTSTART;TZID=PST:20261102T100000"), "ambiguous_timezone", AMBIGUOUS_DEPARTURE),
        (
            _ics(start="DTSTART;TZID=America/Not_A_Real_Zone:20261102T100000"),
            "ambiguous_timezone",
            AMBIGUOUS_DEPARTURE,
        ),
        (
            _ics(start="DTSTART;TZID=America/Los_Angeles;TZID=Asia/Tokyo:20261102T100000"),
            "ambiguous_timezone",
            AMBIGUOUS_DEPARTURE,
        ),
        (
            _ics(end="DTEND:20261104T073000"),
            "ambiguous_timezone",
            AMBIGUOUS_ARRIVAL,
        ),
        (_ics(summary="SUMMARY:Hotel near the airport"), "unsupported", UNSUPPORTED),
        (_ics(start="DTSTART;VALUE=DATE:20261102"), "unsupported", UNSUPPORTED),
        (
            _ics() + "BEGIN:VCALENDAR\nBEGIN:VEVENT\nEND:VEVENT\nEND:VCALENDAR\n",
            "malformed",
            MALFORMED,
        ),
        (_ics(extra="BEGIN:VTODO\nSUMMARY:Task\nEND:VTODO"), "unsupported", UNSUPPORTED),
        (
            _ics(
                extra=(
                    "BEGIN:VEVENT\nUID:synthetic-other\nSUMMARY:UA100 SFO-LAX\n"
                    "DTSTART;TZID=UTC:20261102T120000\nDTEND;TZID=UTC:20261102T130000\n"
                    "END:VEVENT"
                )
            ),
            "unsupported",
            MULTIPLE,
        ),
    ],
)
def test_rejected_input_stays_a_preview_and_writes_nothing(client, text, code, reason):
    before = _counts(client)
    body = _preview(client, text)
    assert body["ok"] is False
    assert body["code"] == code
    assert body["reason"] == reason
    assert body["booking"] is None
    assert body["existing"] is None
    assert _counts(client) == before


def test_repeat_missing_clock_and_long_identity_name_the_reason(client):
    repeating = "\n".join(
        [
            "BEGIN:VCALENDAR",
            "BEGIN:VEVENT",
            f"UID:{UID}",
            "DTSTART;TZID=America/Los_Angeles:20261102T100000",
            "DTEND;TZID=Asia/Tokyo:20261104T073000",
            "SUMMARY:UA837 SFO-NRT",
            "RRULE:FREQ=WEEKLY",
            "END:VEVENT",
            "END:VCALENDAR",
        ]
    )
    assert _preview(client, repeating)["reason"] == REPEATING
    assert _preview(client, _ics(start=""))["reason"] == MISSING_DEPARTURE
    no_end = "\n".join(
        [
            "BEGIN:VCALENDAR",
            "BEGIN:VEVENT",
            f"UID:{UID}",
            "DTSTART;TZID=America/Los_Angeles:20261102T100000",
            "SUMMARY:UA837 SFO-NRT",
            "END:VEVENT",
            "END:VCALENDAR",
        ]
    )
    assert _preview(client, no_end)["reason"] == MISSING_ARRIVAL
    assert _preview(client, _ics(uid=""))["reason"] == MISSING_IDENTITY
    assert _preview(client, _ics(uid="synthetic-" + ("a" * 40)))["reason"] == LONG_IDENTITY
    assert _preview(client, _ics(start="DTSTART;TZID=UTC:20260231T100000"))["reason"] == MALFORMED
    assert _counts(client) == {"drafts": 0, "legs": 0, "trips": 0, "pto": 0}
