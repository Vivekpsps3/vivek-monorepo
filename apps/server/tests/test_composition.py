"""One factory, one database, one principal."""

import os
import subprocess
import sys
from datetime import timedelta
from pathlib import Path

import pytest
from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.testclient import TestClient
from sqlalchemy import text

from apps.server.database import database_url, get_db, open_database

ROOT = Path(__file__).resolve().parents[3]


def test_import_does_not_create_a_database_file(tmp_path):
    env = os.environ.copy()
    for name in (
        "DATABASE_URL",
        "TRAVEL_DATABASE_URL",
        "MEDIA_DATABASE_URL",
        "SITE_DATABASE_URL",
    ):
        env.pop(name, None)
    env["PYTHONPATH"] = str(ROOT)
    code = """
import os, pathlib, sys
os.chdir(sys.argv[1])
import apps.finance.backend.database as finance
import apps.travel.backend.database as travel
import apps.media.backend.database as media
import apps.server.database as server_db
import apps.server.main as site
assert finance.engine is None
assert not hasattr(travel, "init_db")
assert not hasattr(travel, "bind_database")
assert not hasattr(media, "init_db")
assert not hasattr(media, "bind_database")
assert not hasattr(site, "app")
assert pathlib.Path(sys.argv[1]).iterdir() or True
files = [path.name for path in pathlib.Path(sys.argv[1]).iterdir()]
assert files == [], files
"""
    subprocess.check_call([sys.executable, "-c", code, str(tmp_path)], cwd=ROOT, env=env)


def test_domain_factories_are_gone():
    import apps.finance.backend.app as finance_app
    import apps.media.backend.app as media_app
    import apps.server.main as site
    import apps.travel.backend.app as travel_app
    import apps.travel.backend.deps as travel_deps

    assert callable(site.create_app)
    assert not hasattr(finance_app, "create_app")
    assert not hasattr(travel_app, "create_app")
    assert not hasattr(media_app, "create_app")
    assert not hasattr(travel_deps, "Principal")
    assert not hasattr(travel_deps, "fetch_principal")
    with pytest.raises(ModuleNotFoundError):
        __import__("apps.media.backend.deps")


def test_database_url_rejects_relative_and_missing_files(tmp_path, monkeypatch):
    monkeypatch.setenv("SITE_DATABASE_URL", "sqlite:///./finance.db")
    with pytest.raises(RuntimeError, match="absolute"):
        database_url()
    missing = tmp_path / "missing.db"
    monkeypatch.setenv("SITE_DATABASE_URL", f"sqlite:///{missing}")
    with pytest.raises(RuntimeError, match="missing"):
        database_url()
    with pytest.raises(RuntimeError, match="absolute"):
        open_database("sqlite:///./travel.db")


def test_get_db_commits_and_rolls_back():
    database = open_database("sqlite:///:memory:")
    application = FastAPI()
    application.state.database = database
    request = Request({"type": "http", "app": application})
    session = database.sessionmaker()
    session.execute(text("CREATE TABLE notes (id INTEGER PRIMARY KEY, body TEXT)"))
    session.commit()
    session.close()

    saved = get_db(request)
    db = next(saved)
    db.execute(text("INSERT INTO notes (body) VALUES ('ok')"))
    with pytest.raises(StopIteration):
        next(saved)
    check = database.sessionmaker()
    assert check.execute(text("SELECT body FROM notes")).scalar_one() == "ok"
    check.close()

    failed = get_db(request)
    db = next(failed)
    db.execute(text("INSERT INTO notes (body) VALUES ('no')"))
    with pytest.raises(RuntimeError, match="boom"):
        failed.throw(RuntimeError("boom"))
    check = database.sessionmaker()
    assert check.execute(text("SELECT count(*) FROM notes")).scalar_one() == 1
    check.close()


def _app(tmp_path, *, principal=None, openapi=False):
    from apps.finance.backend.database import publish
    from apps.finance.backend.models import Base as FinanceBase
    from apps.media.backend.models import Base as MediaBase
    from apps.server.main import Dependencies, Settings, create_app
    from apps.travel.backend.models import Base as TravelBase

    url = f"sqlite:///{tmp_path / 'site.db'}"
    database = open_database(url)
    publish(database)
    FinanceBase.metadata.create_all(database.engine)
    TravelBase.metadata.create_all(database.engine)
    MediaBase.metadata.create_all(database.engine)
    application = create_app(
        Settings(
            database_url=url,
            release="test",
            web_root=tmp_path / "finance",
            openapi=openapi,
        ),
        Dependencies(
            database=database,
            principal=principal,
            check_schema=False,
            check_frontend=False,
        ),
    )
    return application, database


def _user(database, user_id, token, csrf, *, expired=False, revoked=False, active=True):
    from apps.server.identity.models import User, UserRole, UserSession
    from apps.server.identity.session import _hash_secret, utc_now_naive

    now = utc_now_naive()
    db = database.sessionmaker()
    db.add(
        User(
            id=user_id,
            email=f"user{user_id}@example.com",
            display_name=f"User {user_id}",
            username=f"user{user_id}",
            role=UserRole.user,
            is_active=active,
        )
    )
    db.flush()
    db.add(
        UserSession(
            user_id=user_id,
            token_hash=_hash_secret(token),
            csrf_token_hash=_hash_secret(csrf),
            expires_at=now - timedelta(hours=1) if expired else now + timedelta(hours=2),
            revoked_at=now if revoked else None,
        )
    )
    db.commit()
    db.close()


def test_factories_keep_database_sessions_scoped_to_their_own_app(tmp_path):
    from apps.server.auth import Principal

    first_dir = tmp_path / "first"
    second_dir = tmp_path / "second"
    first_dir.mkdir()
    second_dir.mkdir()
    first, _ = _app(first_dir, principal=Principal(1, "first", "First"))
    second, _ = _app(second_dir, principal=Principal(1, "second", "Second"))
    with TestClient(first) as first_client, TestClient(second) as second_client:
        created = first_client.post(
            "/travel/api/trips",
            json={
                "title": "Only first",
                "start_date": "2026-11-02",
                "end_date": "2026-11-06",
                "stays": [],
                "transports": [],
            },
        )
        assert created.status_code == 201, created.text
        assert first_client.get("/travel/api/trips/1").json()["title"] == "Only first"
        assert second_client.get("/travel/api/trips/1").status_code == 404


def _paths(application):
    found = []
    for route in application.routes:
        path = getattr(route, "path", None)
        if path:
            found.append(path)
        included = getattr(route, "original_router", None)
        if included is None:
            continue
        prefix = route.include_context.prefix
        found.extend(prefix + item.path for item in included.routes)
    return found


def test_middleware_is_registered_once_and_routes_are_explicit(tmp_path):
    application, _database = _app(tmp_path)
    names = [middleware.cls.__name__ for middleware in application.user_middleware]
    assert names == [
        "SecurityHeadersMiddleware",
        "ApiKeyMiddleware",
        "RateLimitMiddleware",
        "CORSMiddleware",
        "BaseHTTPMiddleware",
    ]
    assert "RequestLoggingMiddleware" not in names
    assert HTTPException in application.exception_handlers
    assert RequestValidationError in application.exception_handlers
    assert Exception in application.exception_handlers
    paths = _paths(application)
    assert paths.count("/api/health") == 1
    assert "/travel/api/home" in paths
    assert "/media/api/library" in paths
    assert "/api/home" not in paths


def test_health_auth_gate_and_validation(tmp_path, monkeypatch):
    from apps.server.rate_limit import clear_limits

    application, _database = _app(tmp_path)
    monkeypatch.setenv("API_KEY", "secret")
    monkeypatch.setenv("AUTH_IP_RATE_LIMIT_PER_MIN", "1")
    clear_limits()
    with TestClient(application) as client:
        assert client.get("/health/live").json() == {"status": "ok", "release": "test"}
        assert client.get("/health/ready").status_code == 503
        assert client.get("/api/health").status_code == 200
        assert client.get("/travel/api/health").json()["app"] == "travel"
        assert client.get("/media/api/health").json()["app"] == "media"
        travel = client.get("/travel/api/home")
        assert travel.status_code == 401
        assert travel.json()["detail"] == "Login required"
        assert "no-store" in travel.headers["cache-control"]
        blocked = client.get("/api/auth/me")
        assert blocked.status_code == 401
        assert blocked.json()["detail"] == "Invalid or missing API key"
        signed_out = client.get("/api/auth/me", headers={"X-API-Key": "secret"})
        assert signed_out.json()["detail"] == "Login required"
        first = client.post(
            "/api/auth/passwordless/lookup",
            headers={"X-API-Key": "secret"},
            json={"username": "nobody"},
        )
        second = client.post(
            "/api/auth/passwordless/lookup",
            headers={"X-API-Key": "secret"},
            json={"username": "nobody"},
        )
        assert second.status_code == 429
        assert first.status_code != 429
        invalid = client.post(
            "/travel/api/trips",
            headers={"X-API-Key": "secret"},
            json={
                "title": "",
                "start_date": "2026-01-01",
                "end_date": "2026-01-02",
                "stays": [],
                "transports": [],
            },
        )
        # No session: the principal check answers before the form error.
        assert invalid.status_code == 401
        finance = client.post(
            "/api/auth/login/migrate",
            headers={"X-API-Key": "secret"},
            json={},
        )
        assert finance.status_code == 422
        assert isinstance(finance.json()["detail"], list)
    clear_limits()
    monkeypatch.delenv("API_KEY", raising=False)


def _call(client, method, url, token=None, csrf=None, **kwargs):
    # The jar keeps every Set-Cookie, so a later user would still send the first.
    client.cookies.clear()
    headers = dict(kwargs.pop("headers", {}))
    if token:
        cookie = f"finance_session={token}"
        if csrf:
            cookie += f"; finance_csrf={csrf}"
        headers["Cookie"] = cookie
    response = getattr(client, method)(url, headers=headers, **kwargs)
    client.cookies.clear()
    return response


def test_session_csrf_rotation_and_two_users(tmp_path):
    application, database = _app(tmp_path)
    _user(database, 1, "token1", "csrf1")
    _user(database, 2, "token2", "csrf2")
    _user(database, 3, "token3", "csrf3", expired=True)
    _user(database, 4, "token4", "csrf4", revoked=True)
    trip = {
        "title": "Mine",
        "start_date": "2026-11-02",
        "end_date": "2026-11-06",
        "stays": [],
        "transports": [],
    }
    with TestClient(application) as client:
        home = _call(client, "get", "/travel/api/home", "token1", "csrf1")
        assert home.status_code == 200, home.text
        assert "no-store" in home.headers["cache-control"]
        forwarded = home.headers.get_list("set-cookie")
        assert any(item.startswith("finance_session=") for item in forwarded)
        assert any(item.startswith("finance_csrf=") for item in forwarded)
        denied = _call(client, "post", "/travel/api/trips", "token1", "csrf1", json=trip)
        assert denied.status_code == 403
        assert denied.json()["detail"] == "Invalid CSRF token"
        invalid = _call(
            client,
            "post",
            "/travel/api/trips",
            "token1",
            "csrf1",
            headers={"X-CSRF-Token": "csrf1"},
            json={**trip, "title": "", "start_date": "2026-01-01", "end_date": "2026-01-02"},
        )
        assert invalid.status_code == 422
        assert "Give the trip a name." in invalid.text
        created = _call(
            client,
            "post",
            "/travel/api/trips",
            "token1",
            "csrf1",
            headers={"X-CSRF-Token": "csrf1"},
            json=trip,
        )
        assert created.status_code == 201, created.text
        trip_id = created.json()["id"]
        assert _call(
            client, "get", f"/travel/api/trips/{trip_id}", "token2", "csrf2"
        ).status_code == (404)
        assert _call(client, "get", "/travel/api/home", "token2", "csrf2").json()["upcoming"] == []
        media = _call(client, "get", "/media/api/entries/nope", "token1", "csrf1")
        assert media.status_code == 422
        assert media.json()["detail"] == "Check the form and try again."
        expired = _call(client, "get", "/travel/api/home", "token3", "csrf3")
        assert expired.status_code == 401
        assert expired.json()["detail"] == "Session expired"
        revoked = _call(client, "get", "/travel/api/home", "token4", "csrf4")
        assert revoked.status_code == 401
        assert revoked.json()["detail"] == "Session expired"
        missing = _call(client, "get", "/travel/api/home")
        assert missing.status_code == 401
        assert missing.json()["detail"] == "Login required"


def test_startup_checks_schema_frontend_and_static_files(tmp_path):
    from apps.server.main import Dependencies, Settings, create_app
    from apps.server.migrate import migrate

    database = tmp_path / "site.db"
    migrate(database)
    web = tmp_path / "finance"
    web.mkdir()
    (web / "index.csr.html").write_text(
        '<app-root>finance</app-root><script src="/main.js"></script>', encoding="utf-8"
    )
    (web / "index.html").write_text("<h1>Public home</h1>", encoding="utf-8")
    for route in ("home", "work", "about", "secrets"):
        (web / route).mkdir()
        (web / route / "index.html").write_text(f"<h1>{route}</h1>", encoding="utf-8")
    (web / "app-abcdefgh.js").write_text("console.log(1)", encoding="utf-8")
    url = f"sqlite:///{database}"
    application = create_app(
        Settings(
            database_url=url,
            release="rel",
            web_root=web,
            openapi=False,
        ),
        Dependencies(check_schema=True, check_frontend=True),
    )
    with TestClient(application) as client:
        assert client.get("/health/live").json()["release"] == "rel"
        ready = client.get("/health/ready")
        assert ready.status_code == 200, ready.text
        assert client.get("/metrics").status_code == 200
        page = client.get("/finance/")
        assert page.status_code == 200
        assert "finance" in page.text
        asset = client.get("/app-abcdefgh.js")
        assert "immutable" in asset.headers["cache-control"]
        missing = client.get("/finance/assets/missing.js")
        assert missing.status_code == 404
        assert client.get("/").status_code == 200
        assert client.get("/home").status_code == 200
        assert client.get("/nope").status_code == 404
        blog = client.get("/blog", follow_redirects=False)
        assert blog.status_code == 308 and blog.headers["location"] == "/home"
        assert client.get("/finance", follow_redirects=False).status_code == 308
        assert client.get("/api", follow_redirects=False).status_code == 308
        moved = client.get("/finance/api/health", follow_redirects=False)
        assert moved.status_code == 308
        assert moved.headers["location"] == "/api/health"
        assert client.get("/auth", follow_redirects=False).status_code == 308
        assert client.get("/auth/enroll", follow_redirects=False).headers["location"] == (
            "/auth/signup"
        )
        assert client.get("/finance/login", follow_redirects=False).headers["location"] == (
            "/auth/login"
        )
        assert client.get("/hub/media", follow_redirects=False).status_code == 308
        screen = client.get("/media/library", follow_redirects=False)
        assert screen.status_code == 200
        assert "<app-root" in screen.text
        settings = client.get("/settings", follow_redirects=False)
        assert settings.status_code == 200
        assert "<app-root" in settings.text
        assert client.get("/settings/account").status_code == 200
        assert client.get("/settings/profile").status_code == 404
        assert client.get("/account").status_code == 200
        assert client.get("/travel/trips/42").status_code == 200
        assert client.get("/media/api/missing").status_code == 404
        assert client.get("/travel/no-such-page").status_code == 404
        assert client.get("/finance/no-such-page").status_code == 404
        assert "Public home" in client.get("/").text


def test_missing_frontend_refuses_startup(tmp_path):
    from apps.server.main import Dependencies, Settings, create_app
    from apps.server.migrate import migrate

    database = tmp_path / "site.db"
    migrate(database)
    web = tmp_path / "finance"
    web.mkdir()
    application = create_app(
        Settings(
            database_url=f"sqlite:///{database}",
            release="rel",
            web_root=web,
        ),
        Dependencies(check_schema=True, check_frontend=True),
    )
    with pytest.raises(RuntimeError, match="frontend"), TestClient(application):
        pass


def test_unknown_login_decoys_use_the_app_database_and_survive_restart(tmp_path, monkeypatch):
    from apps.server.identity.auth_decoy import reset_decoy_state

    monkeypatch.delenv("AUTH_DECOY_SECRET", raising=False)
    reset_decoy_state()
    directories = [tmp_path / "first", tmp_path / "second"]
    for directory in directories:
        directory.mkdir()
    apps = [_app(directory)[0] for directory in directories]
    with TestClient(apps[0]) as first, TestClient(apps[1]) as second:
        body = {"username": "ghost.user"}
        one = first.post("/api/auth/passwordless/lookup", json=body)
        two = second.post("/api/auth/passwordless/lookup", json=body)
        assert one.status_code == two.status_code == 200
        assert one.json() != two.json()
        assert all((directory / "auth-decoy-secret").is_file() for directory in directories)
        reset_decoy_state()
        assert first.post("/api/auth/passwordless/lookup", json=body).json() == one.json()
        assert second.post("/api/auth/passwordless/lookup", json=body).json() == two.json()
    reset_decoy_state()


def test_mutation_is_committed_before_the_success_response_starts(tmp_path):
    from apps.server.auth import Principal

    application, database = _app(tmp_path, principal=Principal(1, "tester", "Tester"))
    committed_at_response = []

    async def observed(scope, receive, send):
        async def inspect_response(message):
            if message["type"] == "http.response.start" and message["status"] == 201:
                with database.engine.connect() as connection:
                    committed_at_response.append(
                        connection.execute(text("SELECT count(*) FROM trips")).scalar_one()
                    )
            await send(message)

        await application(scope, receive, inspect_response)

    with TestClient(observed) as client:
        response = client.post(
            "/travel/api/trips",
            json={
                "title": "Immediately readable",
                "start_date": "2026-12-01",
                "end_date": "2026-12-02",
            },
        )
        assert response.status_code == 201, response.text
    assert committed_at_response == [1]


def test_commit_failure_returns_error_instead_of_success(tmp_path):
    from sqlalchemy import event

    from apps.server.auth import Principal

    application, database = _app(tmp_path, principal=Principal(1, "tester", "Tester"))

    def reject_commit(_session):
        raise RuntimeError("synthetic commit failure")

    event.listen(database.sessionmaker, "before_commit", reject_commit)
    with TestClient(application, raise_server_exceptions=False) as client:
        response = client.post(
            "/travel/api/trips",
            json={
                "title": "Must not succeed",
                "start_date": "2026-12-01",
                "end_date": "2026-12-02",
            },
        )
        assert response.status_code == 500
    with database.engine.connect() as connection:
        assert connection.execute(text("SELECT count(*) FROM trips")).scalar_one() == 0


def test_create_app_warms_each_included_route_matcher(tmp_path):
    application, database = _app(tmp_path)
    try:
        included = [
            route for route in application.router.routes if hasattr(route, "original_router")
        ]
        assert {"/api", "/travel/api", "/media/api"} <= {
            route.include_context.prefix for route in included
        }
        for route in included:
            assert callable(getattr(route, "effective_candidates", None)), route
            # Check before calling the hook: create_app must have populated the cache already.
            assert route._effective_candidates, route
            assert route.effective_candidates() is route._effective_candidates
    finally:
        database.engine.dispose()


def test_client_disconnect_during_body_read_is_not_a_500(tmp_path, caplog):
    import asyncio
    from typing import Any

    from apps.server.main import REQUESTS

    application, _database = _app(tmp_path)
    caplog.set_level("DEBUG")
    before = REQUESTS.labels("POST", "500")._value.get()
    sent: list[dict] = []
    calls = {"n": 0}

    async def receive():
        calls["n"] += 1
        request = {"type": "http.request", "body": b"", "more_body": True}
        return request if calls["n"] == 1 else {"type": "http.disconnect"}

    scope: Any = {"type": "http", "method": "POST", "path": "/csp-report", "scheme": "http"}
    scope.update(asgi={"version": "3.0"}, http_version="1.1", query_string=b"")
    scope["raw_path"] = b"/csp-report"
    scope["headers"] = [(b"content-type", b"application/csp-report")]
    scope["client"], scope["server"] = ("127.0.0.1", 1234), ("testserver", 80)

    async def send(message):
        sent.append(message)

    async def run():
        async with application.router.lifespan_context(application):
            await application(scope, receive, send)

    asyncio.run(run())
    assert "client_disconnect" in caplog.text and "Traceback" not in caplog.text
    assert all(not record.exc_info for record in caplog.records)
    assert REQUESTS.labels("POST", "500")._value.get() == before
    assert next(item["status"] for item in sent if item["type"] == "http.response.start") == 499
