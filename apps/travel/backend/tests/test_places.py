import json
from datetime import UTC, datetime, timedelta

import httpx
import pytest

from apps.server.errors import APIError
from apps.travel.backend.deps import get_geocoder
from apps.travel.backend.models import PlaceCache
from apps.travel.backend.services import places


def test_provider_requests_are_identified_and_at_least_one_second_apart(monkeypatch):
    clock = [10.0]
    calls = []
    monkeypatch.setattr(places, "_next_request", 0.0)
    monkeypatch.setattr(places.time, "monotonic", lambda: clock[0])
    monkeypatch.setattr(
        places.time, "sleep", lambda seconds: clock.__setitem__(0, clock[0] + seconds)
    )

    def get(url, **kwargs):
        calls.append((clock[0], url, kwargs))
        return httpx.Response(
            200,
            json=[{"display_name": "Zero", "lat": "0", "lon": "0"}],
            request=httpx.Request("GET", url),
        )

    monkeypatch.setattr(places.httpx, "get", get)
    assert places.nominatim_search("Zero")[0]["lat"] == 0
    places.nominatim_search("Other")
    assert calls[1][0] - calls[0][0] >= 1
    assert "vivekpanchagnula.com" in calls[0][2]["headers"]["User-Agent"]
    assert calls[0][2]["timeout"] == 3.0


@pytest.mark.parametrize(
    "status,code",
    [
        (401, "provider_auth"),
        (403, "provider_auth"),
        (429, "throttled"),
        (503, "provider_unavailable"),
    ],
)
def test_provider_failures_remain_distinct_from_no_match(monkeypatch, status, code):
    monkeypatch.setattr(places, "_next_request", 0.0)
    monkeypatch.setattr(
        places.httpx,
        "get",
        lambda url, **kwargs: httpx.Response(status, request=httpx.Request("GET", url)),
    )
    with pytest.raises(APIError) as error:
        places.nominatim_search("Lisbon")
    assert error.value.code == code
    assert error.value.status_code != 401


def test_timeout_is_visible(monkeypatch):
    monkeypatch.setattr(places, "_next_request", 0.0)

    def timeout(*args, **kwargs):
        raise httpx.ReadTimeout("provider timed out")

    monkeypatch.setattr(places.httpx, "get", timeout)
    with pytest.raises(APIError, match="timed out"):
        places.nominatim_search("Lisbon")


def test_failed_search_does_not_cache_a_false_no_match(client):
    def fail(_query):
        raise RuntimeError("provider failed")

    client.app.dependency_overrides[get_geocoder] = lambda: fail
    failed = client.get("/api/places/search", params={"q": "Lisbon"})
    assert failed.status_code == 502
    assert failed.json()["code"] == "provider_unavailable"
    assert failed.json()["request_id"]
    with client.app.state.database.sessionmaker() as db:
        assert db.query(PlaceCache).count() == 0


def test_success_and_empty_results_expire_and_zero_coordinates_are_kept(client):
    calls = []

    def fetch(query):
        calls.append(query)
        return [{"label": "Zero", "lat": 0, "lng": 0}]

    client.app.dependency_overrides[get_geocoder] = lambda: fetch
    now = datetime.now(UTC)
    with client.app.state.database.sessionmaker.begin() as db:
        db.add_all(
            [
                PlaceCache(query="empty", payload="[]", fetched_at=now - timedelta(minutes=6)),
                PlaceCache(
                    query="old",
                    payload=json.dumps([{"label": "Old", "lat": 1, "lng": 1}]),
                    fetched_at=now - timedelta(days=8),
                ),
            ]
        )
    for query in ("Empty", "Old", "empty"):
        response = client.get("/api/places/search", params={"q": query})
        assert response.json()["results"] == [{"label": "Zero", "lat": 0, "lng": 0}]
    assert calls == ["Empty", "Old"]


def test_invalid_provider_coordinates_cannot_be_saved_in_the_cache(client):
    client.app.dependency_overrides[get_geocoder] = lambda: lambda query: [
        {"label": "NaN", "lat": float("nan"), "lng": 0},
        {"label": "Outside", "lat": 91, "lng": 0},
        {"label": "Zero", "lat": 0, "lng": 0},
    ]
    assert client.get("/api/places/search", params={"q": "Zero"}).json()["results"] == [
        {"label": "Zero", "lat": 0, "lng": 0}
    ]
