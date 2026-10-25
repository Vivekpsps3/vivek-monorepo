from pathlib import Path

from fastapi.testclient import TestClient

from apps.server.database import current
from apps.server.main import Dependencies, Settings, create_app


def _app(*, openapi: bool):
    database = current()
    return create_app(
        Settings(
            database_url=database.url,
            release="test",
            web_root=Path("/app/web/finance"),
            portfolio_root=Path("/app/web/portfolio"),
            openapi=openapi,
        ),
        Dependencies(database=database, check_schema=False, check_frontend=False),
    )


def test_openapi_disabled_when_env_set(monkeypatch):
    monkeypatch.setenv("DISABLE_OPENAPI", "1")
    client = TestClient(_app(openapi=False))
    assert client.get("/openapi.json").status_code == 404
    assert client.get("/docs").status_code == 404


def test_openapi_excludes_retired_plaintext_finance_paths(monkeypatch):
    monkeypatch.delenv("DISABLE_OPENAPI", raising=False)
    client = TestClient(_app(openapi=True))

    res = client.get("/openapi.json")

    assert res.status_code == 200
    paths = res.json()["paths"]
    assert "/api/vault/status" in paths
    assert "/api/auth/login/migrate" in paths
    assert "/api/transactions/" not in paths
    assert "/api/assets/" not in paths
    assert "/api/imports/{bank_slug}/preview" not in paths
    assert "/api/planning/v1/runs" not in paths
