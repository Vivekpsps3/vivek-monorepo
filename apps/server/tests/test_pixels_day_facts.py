"""PIX-01: dated facts and learning annotations do not change Pixel scores."""

from datetime import date
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import text

from apps.server.pixels import facts as facts_module
from apps.server.pixels.facts import (
    CHECKIN_PROVENANCE,
    CONCEPT_PROVENANCE,
    EPISODE_PROVENANCE,
    FACT_CAP,
    TRIP_PROVENANCE,
    _as_date,
    _text,
    project_day,
)
from apps.server.tests.test_birthday_route import _call
from apps.server.tests.test_pixels_api import _episode, _open, _seeded

NOTE = "synthetic private note"
FOREIGN = "Foreign concept"
RANGE = "/api/pixels?from=2026-01-01&to=2026-01-31"
EXPECTED_DAYS = [
    {"date": "2026-01-03", "town": 2, "media": 1},
    {"date": "2026-01-04", "trip": 1},
    {"date": "2026-01-05", "town": 1, "trip": 1},
    {"date": "2026-01-06", "trip": 1},
]


def _concept(
    db, concept_id: int, user_id: int, name: str, understood: str, note: str | None = None
) -> None:
    db.execute(
        text(
            "INSERT INTO world_concepts ("
            "id, user_id, name, name_key, note, source, understood_on, archived_at, "
            "created_at, updated_at) VALUES ("
            ":id, :user, :name, :key, :note, NULL, :on, NULL, "
            "'2026-01-01 00:00:00+00:00', '2026-01-01 00:00:00+00:00')"
        ),
        {
            "id": concept_id,
            "user": user_id,
            "name": name,
            "key": name.casefold(),
            "note": note,
            "on": understood,
        },
    )


def _with_concepts(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    application, database = _seeded(tmp_path, monkeypatch)
    db = database.sessionmaker()
    _concept(db, 7, 1, "Synthetic concept", "2026-01-03", NOTE)
    _concept(db, 8, 2, FOREIGN, "2026-01-03", "foreign private note")
    db.commit()
    db.close()
    return application


def _pixels(client: TestClient, token: str = "token-a"):
    response = _call(client, "get", RANGE, token)
    assert response.status_code == 200, response.text
    return response


def _day(client: TestClient, day: str, token: str = "token-a"):
    response = _call(client, "get", f"/api/pixels/day?date={day}", token)
    assert response.status_code == 200, response.text
    cache = response.headers["cache-control"]
    assert "private" in cache and "no-store" in cache
    return response


def _week_concepts(client: TestClient) -> list[dict]:
    response = _call(client, "get", "/api/world?from=2025-12-29&to=2025-12-29", "token-a")
    assert response.status_code == 200, response.text
    weeks = response.json()["weeks"]
    week = next(item for item in weeks if item["week"] == "2025-12-29")
    return week["concepts"]


def test_day_facts_retract_without_changing_score_bytes(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    application = _with_concepts(tmp_path, monkeypatch)
    with TestClient(application) as client:
        before = _pixels(client).content
        assert _pixels(client).json()["days"] == EXPECTED_DAYS
        assert "world_concept" not in before.decode()
        jan3 = _day(client, "2026-01-03").json()
        again = _day(client, "2026-01-03").json()
        assert again == jan3
        assert jan3["date"] == "2026-01-03"
        assert jan3["counts"] == {"town": 2, "media": 1}
        assert NOTE not in str(jan3)
        assert FOREIGN not in str(jan3)
        assert "2026-" not in "".join(item["text"] for item in jan3["differences"])
        assert [item["id"] for item in jan3["differences"]] == [
            "episode-versus-finished",
            "trip-span-versus-credit",
            "concept-not-score",
            "budget-versus-streak",
        ]
        assert "does not change the Pixels score" in jan3["differences"][2]["text"]
        checkins = [fact for fact in jan3["facts"] if fact["namespace"] == "habit_checkin"]
        episodes = [fact for fact in jan3["facts"] if fact["namespace"] == "episode_progress"]
        assert len(checkins) == 2
        assert {fact["date"] for fact in checkins} == {"2026-01-03"}
        assert {fact["route"] for fact in checkins} == {"/town/"}
        assert {fact["provenance"] for fact in checkins} == {CHECKIN_PROVENANCE}
        assert episodes == [
            {
                "id": "episode_progress:100",
                "namespace": "episode_progress",
                "occurrence_id": 100,
                "kind": "episode",
                "date": "2026-01-03",
                "coverage": "complete",
                "provenance": EPISODE_PROVENANCE,
                "title": "Show",
                "route": "/media/",
            }
        ]
        assert all(fact["id"] != "episode_progress:101" for fact in jan3["facts"])
        assert jan3["annotations"] == [
            {
                "id": "world_concept:7",
                "concept_id": 7,
                "name": "Synthetic concept",
                "understood_on": "2026-01-03",
                "provenance": CONCEPT_PROVENANCE,
            }
        ]
        assert jan3["coverage"]["concepts"] == {
            "status": "ok",
            "included": 1,
            "total": 1,
            "truncated": False,
        }
        other = _day(client, "2026-01-03", "token-b").json()
        assert any(fact["id"] == "trip:2000" for fact in other["facts"])
        assert all(fact["id"] != "trip:2000" for fact in jan3["facts"])
        assert any(item["name"] == FOREIGN for item in other["annotations"])
        assert "Synthetic concept" not in str(other)
        jan4 = _day(client, "2026-01-04").json()
        assert jan4["counts"] == {"trip": 1}
        assert jan4["facts"] == [
            {
                "id": "trip:1000",
                "namespace": "trip",
                "occurrence_id": 1000,
                "kind": "trip_span",
                "date": "2026-01-04",
                "span_start": "2026-01-04",
                "span_end": "2026-01-06",
                "coverage": "complete",
                "provenance": TRIP_PROVENANCE,
                "title": "Trip",
                "route": "/travel/trips/1000",
            }
        ]
        assert "day after it ends" in TRIP_PROVENANCE
        assert jan4["annotations"] == []
        counted = {
            day["date"]: {key: value for key, value in day.items() if key != "date"}
            for day in _pixels(client).json()["days"]
        }
        assert jan3["counts"] == counted["2026-01-03"]
        assert jan4["counts"] == counted["2026-01-04"]
        world = _week_concepts(client)
        assert {"id": 7, "name": "Synthetic concept", "on": "2026-01-03"} in world
        assert all(item["name"] != FOREIGN for item in world)

        redated = _call(
            client,
            "patch",
            "/api/world/concepts/7",
            "token-a",
            "csrf-1",
            json={"understood_on": "2026-01-04"},
        )
        assert redated.status_code == 200, redated.text
        assert _pixels(client).content == before
        assert _day(client, "2026-01-03").json()["annotations"] == []
        moved = _day(client, "2026-01-04").json()["annotations"]
        assert moved[0]["id"] == "world_concept:7"
        assert moved[0]["understood_on"] == "2026-01-04"
        assert {"id": 7, "name": "Synthetic concept", "on": "2026-01-04"} in _week_concepts(client)

        archived = _call(
            client,
            "patch",
            "/api/world/concepts/7",
            "token-a",
            "csrf-1",
            json={"archived": True},
        )
        assert archived.status_code == 200, archived.text
        assert _pixels(client).content == before
        assert _day(client, "2026-01-04").json()["annotations"] == []
        assert {"id": 7, "name": "Synthetic concept", "on": "2026-01-04"} in _week_concepts(client)

        deleted = _call(client, "delete", "/api/world/concepts/7", "token-a", "csrf-1")
        assert deleted.status_code == 204
        assert _pixels(client).content == before
        assert _day(client, "2026-01-04").json()["annotations"] == []
        assert all(item["id"] != 7 for item in _week_concepts(client))


def test_rich_history_stays_bounded_and_owner_scoped(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    application, database = _seeded(tmp_path, monkeypatch)
    db = database.sessionmaker()
    for offset in range(FACT_CAP + 5):
        _episode(db, 3000 + offset, 1, "2026-01-07")
        _concept(db, 6000 + offset, 1, f"Concept {offset}", "2026-01-07")
    _episode(db, 9000, 2, "2026-01-07")
    _concept(db, 7000, 2, FOREIGN, "2026-01-07")
    db.commit()
    db.close()
    with TestClient(application) as client:
        before = _pixels(client).content
        body = _day(client, "2026-01-07").json()
        episodes = [fact for fact in body["facts"] if fact["namespace"] == "episode_progress"]
        assert len(episodes) == FACT_CAP
        assert body["coverage"]["media"] == {
            "status": "ok",
            "included": FACT_CAP,
            "total": FACT_CAP + 5,
            "truncated": True,
        }
        assert all(fact["id"] != "episode_progress:9000" for fact in body["facts"])
        assert len(body["annotations"]) == FACT_CAP
        assert body["coverage"]["concepts"]["total"] == FACT_CAP + 5
        assert body["coverage"]["concepts"]["truncated"] is True
        assert all(item["name"] != FOREIGN for item in body["annotations"])
        counted = next(day for day in _pixels(client).json()["days"] if day["date"] == "2026-01-07")
        assert counted["media"] == FACT_CAP + 5
        assert body["counts"]["media"] == FACT_CAP + 5
        archived = _call(
            client,
            "patch",
            "/api/world/concepts/6000",
            "token-a",
            "csrf-1",
            json={"archived": True},
        )
        assert archived.status_code == 200, archived.text
        assert _pixels(client).content == before


def test_one_source_failure_keeps_the_other_facts(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    application = _with_concepts(tmp_path, monkeypatch)
    real_select = facts_module._select

    def fail_concepts(db, statement, params):
        if "world_concepts" in statement:
            raise RuntimeError("concepts down")
        return real_select(db, statement, params)

    monkeypatch.setattr(facts_module, "_select", fail_concepts)
    with TestClient(application) as client:
        body = _day(client, "2026-01-03").json()
        assert body["coverage"]["concepts"]["status"] == "unavailable"
        assert body["annotations"] == []
        assert body["counts"] == {"town": 2, "media": 1}
        assert any(fact["namespace"] == "habit_checkin" for fact in body["facts"])
        assert any(fact["id"] == "episode_progress:100" for fact in body["facts"])
        assert _pixels(client).json()["days"] == EXPECTED_DAYS

    def fail_checkins(db, statement, params):
        if "SELECT c.id" in statement:
            raise RuntimeError("town facts down")
        return real_select(db, statement, params)

    monkeypatch.setattr(facts_module, "_select", fail_checkins)
    with TestClient(application) as client:
        body = _day(client, "2026-01-03").json()
        assert body["coverage"]["town"]["status"] == "unavailable"
        assert body["coverage"]["town"]["total"] == 2
        assert all(fact["namespace"] != "habit_checkin" for fact in body["facts"])
        assert any(fact["id"] == "episode_progress:100" for fact in body["facts"])
        assert body["counts"]["town"] == 2
        assert body["annotations"][0]["id"] == "world_concept:7"


def test_missing_concept_table_is_absent(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    application, database = _seeded(tmp_path, monkeypatch)
    db = database.sessionmaker()
    db.execute(text("DROP TABLE world_concepts"))
    db.commit()
    db.close()
    with TestClient(application) as client:
        body = _day(client, "2026-01-03").json()
        assert body["coverage"]["concepts"]["status"] == "absent"
        assert body["annotations"] == []
        assert body["counts"] == {"town": 2, "media": 1}
        assert _pixels(client).json()["days"] == EXPECTED_DAYS


def test_unknown_status_does_not_invent_a_score(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    _application, database = _open(tmp_path, monkeypatch)
    db = database.sessionmaker()
    payload = project_day(
        db,
        1,
        date(2026, 1, 3),
        town_status="bogus",
        media_status="absent",
        travel_status="unavailable",
        town_count=4,
        media_count=0,
        trip_count=2,
    )
    assert payload.coverage.town.status == "unavailable"
    assert payload.coverage.town.included == 0
    assert payload.coverage.media.status == "absent"
    assert payload.coverage.travel.status == "unavailable"
    assert payload.counts.town == 4
    assert payload.counts.media is None
    assert payload.counts.trip == 2
    assert payload.facts == []
    assert _as_date(date(2026, 1, 4)) == date(2026, 1, 4)
    assert _as_date("2026-01-04T00:00:00") == date(2026, 1, 4)
    assert _text(None) is None
    assert _text("") is None
    assert _text(3) is None
    assert _text("Trip") == "Trip"
    assert all("2026-" not in item.text for item in payload.differences)
    db.close()


def test_day_route_rejects_bad_dates_and_anonymous_callers(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    application, _database = _seeded(tmp_path, monkeypatch)
    with TestClient(application) as client:
        assert client.get("/api/pixels/day?date=2026-01-03").status_code == 401
        missing = _call(client, "get", "/api/pixels/day", "token-a")
        assert missing.status_code == 422
        for raw in ("2026-02-31", "01-03-2026"):
            response = _call(client, "get", f"/api/pixels/day?date={raw}", "token-a")
            assert response.status_code == 422, raw
