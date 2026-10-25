"""Provider IO stays outside a write transaction, and provider auth is not HTTP 401."""

from pathlib import Path

from fastapi.testclient import TestClient
from sqlalchemy import text

from apps.server.database import install, open_database, release_for_provider_io
from apps.server.errors import APIError


def test_api_error_never_uses_suite_unauthorized():
    rejected = APIError(401, "provider_auth", "FlightAware rejected the API key.")
    assert rejected.status_code == 502
    assert rejected.code == "provider_auth"
    blank = APIError(401, "", "upstream")
    assert blank.status_code == 502
    assert blank.code == "provider_auth"


def test_provider_io_commits_before_another_connection_writes(tmp_path):
    database = open_database(f"sqlite:///{tmp_path / 'boundary.db'}")
    install(database)
    db = database.sessionmaker()
    db.execute(text("CREATE TABLE notes (id INTEGER PRIMARY KEY, body TEXT)"))
    db.commit()
    db.execute(text("INSERT INTO notes (body) VALUES ('saved')"))
    db.flush()

    release_for_provider_io(db)

    other = database.sessionmaker()
    other.execute(text("INSERT INTO notes (body) VALUES ('during')"))
    other.commit()
    other.close()
    db.rollback()
    db.close()

    check = database.sessionmaker()
    rows = check.execute(text("SELECT body FROM notes ORDER BY id")).scalars().all()
    check.close()
    assert rows == ["saved", "during"]


def _app(tmp_path: Path):
    from apps.server.auth import Principal
    from apps.server.main import Dependencies, Settings, create_app

    url = f"sqlite:///{tmp_path / 'site.db'}"
    database = open_database(url)
    install(database)
    application = create_app(
        Settings(
            database_url=url,
            release="test",
            web_root=tmp_path / "finance",
            portfolio_root=tmp_path / "portfolio",
            openapi=False,
        ),
        Dependencies(
            database=database,
            principal=Principal(1, "tester", "Tester"),
            check_schema=False,
            check_frontend=False,
        ),
    )
    return application


def test_flight_provider_errors_are_typed_and_keep_the_prefix(tmp_path, monkeypatch):
    from apps.travel.backend.deps import get_flight_lookup
    from apps.travel.backend.services.flights import FlightAwareError

    monkeypatch.setenv("FLIGHTAWARE_API_KEY", "secret")
    monkeypatch.delenv("API_KEY", raising=False)
    application = _app(tmp_path)
    assert APIError in application.exception_handlers

    def reject(_ident, _depart_on, _key):
        raise FlightAwareError(502, "FlightAware rejected the API key.", code="provider_auth")

    def limited(_ident, _depart_on, _key):
        raise FlightAwareError(
            429,
            "FlightAware rate limit reached. Try again shortly.",
            code="provider_throttled",
            retry_after=12,
        )

    request_id = "a" * 32
    with TestClient(application) as client:
        application.dependency_overrides[get_flight_lookup] = lambda: reject
        rejected = client.post(
            "/travel/api/flights/lookup",
            json={"ident": "UA837", "depart_on": "2026-11-02"},
            headers={"X-Request-ID": request_id},
        )
        assert rejected.status_code == 502
        body = rejected.json()
        assert body == {
            "code": "provider_auth",
            "message": "FlightAware rejected the API key.",
            "detail": "FlightAware rejected the API key.",
            "field_errors": None,
            "retry_after": None,
            "request_id": request_id,
        }
        assert rejected.headers["x-request-id"] == request_id

        application.dependency_overrides[get_flight_lookup] = lambda: limited
        throttled = client.post(
            "/travel/api/flights/lookup",
            json={"ident": "UA837", "depart_on": "2026-11-02"},
            headers={"X-Request-ID": request_id},
        )
        assert throttled.status_code == 429
        assert throttled.headers["retry-after"] == "12"
        assert throttled.json()["code"] == "provider_throttled"
        assert throttled.json()["retry_after"] == 12

        invalid = client.post(
            "/travel/api/flights/lookup",
            json={"ident": "!!!", "depart_on": "2026-11-02"},
            headers={"X-Request-ID": request_id},
        )
        assert invalid.status_code == 422
        assert invalid.json()["code"] == "invalid"
        assert invalid.json()["field_errors"] == {"ident": "Enter a flight number such as UA 837."}
