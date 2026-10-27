"""A repeated create with the same attempt id returns the trip already stored."""

from concurrent.futures import ThreadPoolExecutor
from threading import Barrier

from fastapi.testclient import TestClient

from apps.server.auth import Principal
from apps.server.database import open_database
from apps.server.main import Dependencies, Settings, create_app


def _body(title="Kyoto", attempt="attempt-kyoto-1"):
    body = {
        "title": title,
        "start_date": "2026-11-01",
        "end_date": "2026-11-02",
        "stays": [{"city": "Kyoto", "arrive_on": "2026-11-01", "leave_on": "2026-11-02"}],
    }
    if attempt is not None:
        body["client_request_id"] = attempt
    return body


def _titles(client):
    home = client.get("/api/home")
    assert home.status_code == 200, home.text
    payload = home.json()
    return [
        trip["title"] for group in ("in_progress", "upcoming", "past") for trip in payload[group]
    ]


def test_the_same_attempt_returns_the_original_trip(client):
    first = client.post("/api/trips", json=_body())
    second = client.post("/api/trips", json=_body(title="Changed mind"))
    assert first.status_code == 201, first.text
    assert second.status_code == 201, second.text
    assert second.json()["id"] == first.json()["id"]
    assert second.json()["title"] == "Kyoto"
    assert _titles(client) == ["Kyoto"]


def test_a_new_attempt_and_a_missing_attempt_each_create_a_trip(client):
    first = client.post("/api/trips", json=_body(attempt="attempt-kyoto-a"))
    second = client.post("/api/trips", json=_body(title="Osaka", attempt="attempt-osaka-b"))
    third = client.post("/api/trips", json=_body(title="Nara", attempt=None))
    fourth = client.post("/api/trips", json=_body(title="Nara again", attempt=None))
    assert [first.status_code, second.status_code, third.status_code, fourth.status_code] == [
        201,
        201,
        201,
        201,
    ]
    assert (
        len({first.json()["id"], second.json()["id"], third.json()["id"], fourth.json()["id"]}) == 4
    )
    assert _titles(client).count("Kyoto") == 1


def test_a_deleted_attempt_can_be_saved_again(client):
    created = client.post("/api/trips", json=_body(attempt="attempt-once"))
    assert created.status_code == 201, created.text
    assert client.delete(f"/api/trips/{created.json()['id']}").status_code == 204
    again = client.post("/api/trips", json=_body(title="Kyoto return", attempt="attempt-once"))
    assert again.status_code == 201, again.text
    assert again.json()["title"] == "Kyoto return"
    assert _titles(client) == ["Kyoto return"]


def test_a_short_attempt_id_is_rejected_before_a_trip_exists(client):
    rejected = client.post("/api/trips", json=_body(attempt="short"))
    assert rejected.status_code == 422, rejected.text
    assert _titles(client) == []


def test_a_retry_after_reopening_the_database_returns_the_saved_trip(client, tmp_path):
    first = client.post("/api/trips", json=_body())
    database = open_database(client.app.state.database.url)
    restarted = create_app(
        Settings(database.url, "restarted", tmp_path),
        Dependencies(
            database=database,
            principal=Principal(1, "tester", "Tester"),
            check_schema=False,
            check_frontend=False,
        ),
    )
    with TestClient(restarted) as second:
        retry = second.post("/travel/api/trips", json=_body())
        assert retry.status_code == 201, retry.text
        assert retry.json()["id"] == first.json()["id"]
    database.engine.dispose()


def test_overlapping_creates_insert_one_trip(client):
    barrier = Barrier(2)

    def save():
        barrier.wait(timeout=5)
        response = client.post("/api/trips", json=_body())
        assert response.status_code == 201, response.text
        return response.json()["id"]

    with ThreadPoolExecutor(max_workers=2) as executor:
        ids = list(executor.map(lambda _: save(), range(2)))
    assert ids[0] == ids[1]
    assert _titles(client) == ["Kyoto"]


def test_attempt_keys_are_scoped_to_the_user(client):
    from apps.server.auth import require_principal

    first = client.post("/api/trips", json=_body())
    client.app.dependency_overrides[require_principal] = lambda: Principal(2, "other", "Other")
    second = client.post("/api/trips", json=_body(title="Other Kyoto"))
    assert second.status_code == 201, second.text
    assert first.json()["id"] != second.json()["id"]
    assert _titles(client) == ["Other Kyoto"]


def test_failed_create_does_not_reserve_the_attempt(client):
    body = _body()
    body["stays"][0]["leave_on"] = "2026-12-01"
    assert client.post("/api/trips", json=body).status_code == 422
    retry = client.post("/api/trips", json=_body())
    assert retry.status_code == 201, retry.text
    assert _titles(client) == ["Kyoto"]
