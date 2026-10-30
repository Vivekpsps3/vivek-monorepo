"""Release integration checks against a disposable database, never production state.

Run inside the built image: python -m apps.server.checks
"""

import hashlib
import os
import tempfile
from pathlib import Path


def assert_media_e2e_is_not_shipped() -> None:
    """The production image must not contain the synthetic auth-bypass server."""
    root = Path("/app")
    if not (root / "apps/server/checks.py").is_file():
        return
    present = [
        path
        for path in (
            root / "apps/media/backend/e2e_server.py",
            root / "apps/media/e2e",
        )
        if path.exists()
    ]
    present.extend(root.joinpath("apps/media").glob("**/e2e_server.py"))
    assert not present, [str(path) for path in present]


def main():
    assert_media_e2e_is_not_shipped()
    with tempfile.TemporaryDirectory(prefix="site-checks-") as temporary:
        root = Path(temporary)
        from apps.server.migrate import migrate

        migrate(root / "site.db")
        os.environ["SITE_DATABASE_URL"] = f"sqlite:///{root}/site.db"
        os.environ["SESSION_COOKIE_SECURE"] = "1"
        os.environ["SESSION_COOKIE_SAMESITE"] = "lax"
        from datetime import timedelta

        from fastapi.testclient import TestClient
        from sqlalchemy import text

        from apps.server.database import open_database
        from apps.server.identity.models import User, UserRole, UserSession
        from apps.server.identity.session import utc_now_naive
        from apps.server.main import Dependencies, Settings, create_app

        settings = Settings.from_environ()
        database = open_database(settings.database_url)
        app = create_app(settings, Dependencies(database=database))
        engine = database.engine
        SessionLocal = database.sessionmaker

        for index, role in ((1, UserRole.admin), (2, UserRole.user)):
            with SessionLocal() as db:
                db.add(
                    User(
                        id=index,
                        email=f"test{index}@example.invalid",
                        display_name=f"Test {index}",
                        role=role,
                        username=f"test{index}",
                        auth_public_key_b64="test-public-key",
                    )
                )
                db.flush()
                db.add(
                    UserSession(
                        user_id=index,
                        token_hash=hashlib.sha256(f"token{index}".encode()).hexdigest(),
                        csrf_token_hash=hashlib.sha256(f"csrf{index}".encode()).hexdigest(),
                        expires_at=utc_now_naive() + timedelta(hours=1),
                    )
                )
                db.commit()
        # Any attempted internal HTTP authentication would fail this test.
        import httpx

        def no_auth_http(*args, **kwargs):
            raise AssertionError("Authentication must be in process")

        httpx.request = no_auth_http
        with TestClient(app, base_url="https://testserver") as client:
            for url in ("/media/library", "/media/search?q=dune", "/media/calendar", "/media/add"):
                assert client.get(url, follow_redirects=False).status_code == 200
            alias = client.get("/media/new", follow_redirects=False)
            assert alias.status_code == 308 and alias.headers["location"] == "/media/add"
            from apps.server.security_headers import validate_response_headers

            for url in (
                "/",
                "/home",
                "/work",
                "/about",
                "/secrets",
                "/hub",
                "/hub/admin",
                "/account",
                "/settings",
                "/settings/account",
                "/auth/login",
                "/auth/signup",
                "/finance/",
                "/travel/",
                "/media/",
                "/health/ready",
                "/api/health",
                "/travel/api/health",
                "/media/api/health",
            ):
                response = client.get(url)
                assert response.status_code == 200, (url, response.status_code, response.text[:150])
                validate_response_headers(response.headers, url, response.content)
            bundle = next(settings.web_root.glob("main-*.js"))
            asset = client.get("/" + bundle.name)
            assert "immutable" in asset.headers.get("cache-control", "")
            validate_response_headers(asset.headers, "/" + bundle.name, asset.content)
            index = client.get("/finance/")
            assert index.headers.get("cache-control") == "no-store"
            validate_response_headers(index.headers, "/finance/", index.content)
            report = client.post(
                "/csp-report",
                content=b'{"csp-report":{"document-uri":"https://testserver/finance/","violated-directive":"script-src","blocked-uri":"inline","script-sample":"not-stored"}}',
                headers={"content-type": "application/csp-report"},
            )
            assert report.status_code == 204, report.status_code
            assert report.content == b""
            assert client.get("/auth/login").headers.get("cache-control") == "no-store"
            assert client.get("/api/health").headers.get("cache-control") == "no-store, private"
            for url in (
                "/unknown",
                "/api/no-such-route",
                "/finance/no-such.js",
                "/travel/api/no-such-route",
            ):
                assert client.get(url).status_code in (401, 404), url
            for url in ("/api/auth/me", "/travel/api/home", "/media/api/library"):
                assert client.get(url).status_code == 401, url
            client.cookies.set("finance_session", "token2")
            for url in ("/api/auth/me", "/travel/api/home", "/media/api/library"):
                assert client.get(url).status_code == 200, url
            trip = {
                "title": "Integration trip",
                "start_date": "2026-12-01",
                "end_date": "2026-12-03",
            }
            item = {"kind": "movie", "title": "Integration film", "status": "want"}
            for url, body in (("/travel/api/trips", trip), ("/media/api/library", item)):
                assert client.post(url, json=body).status_code == 403, url
            client.headers["X-CSRF-Token"] = "csrf2"
            created = client.post("/travel/api/trips", json=trip)
            assert created.status_code == 201, created.text
            trip_id = created.json()["id"]
            created = client.post("/media/api/library", json=item)
            assert created.status_code == 200, created.text
            item_id = created.json()["id"]
            # All domain writes land in the same engine/file.
            with engine.connect() as connection:
                assert connection.execute(text("SELECT count(*) FROM trips")).scalar_one() == 1
                assert (
                    connection.execute(text("SELECT count(*) FROM user_entries")).scalar_one() == 1
                )
                assert connection.exec_driver_sql("PRAGMA foreign_keys").scalar_one() == 1
            client.cookies.clear()
            client.cookies.set("finance_session", "token1")
            client.headers["X-CSRF-Token"] = "csrf1"
            assert client.get(f"/travel/api/trips/{trip_id}").status_code == 404
            assert client.get(f"/media/api/entries/{item_id}").status_code == 404
            response = client.delete("/api/admin/users/2")
            assert response.status_code == 200, response.text
            with engine.connect() as connection:
                for table in (
                    "trips",
                    "user_entries",
                    "user_sessions",
                    "habit_checkins",
                    "habit_cadences",
                    "habits",
                ):
                    assert (
                        connection.execute(
                            text(f"SELECT count(*) FROM {table} WHERE user_id=2")
                        ).scalar_one()
                        == 0
                    )
                assert not connection.exec_driver_sql("PRAGMA foreign_key_check").fetchall()
            client.cookies.clear()
            client.cookies.set("finance_session", "token2")
            assert client.get("/media/api/library").status_code == 401
            metrics = client.get("/metrics")
            assert b"site_requests_total" in metrics.content
        print(
            "Unified checks passed: portfolio, assets, all apps, shared auth, CSRF, isolation, deletion, schema, metrics and CSP"
        )


if __name__ == "__main__":
    main()
