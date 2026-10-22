import os

os.environ["DATABASE_URL"] = "sqlite:///:memory:"

from fastapi.testclient import TestClient

from apps.finance.backend.app import create_app


def test_openapi_disabled_when_env_set(monkeypatch):
    monkeypatch.setenv("DISABLE_OPENAPI", "1")
    app = create_app()
    client = TestClient(app)
    assert client.get("/openapi.json").status_code == 404
    assert client.get("/docs").status_code == 404


def test_openapi_excludes_retired_plaintext_finance_paths(monkeypatch):
    monkeypatch.delenv("DISABLE_OPENAPI", raising=False)
    app = create_app()
    client = TestClient(app)

    res = client.get("/openapi.json")

    assert res.status_code == 200
    paths = res.json()["paths"]
    assert "/api/vault/status" in paths
    assert "/api/auth/login/migrate" in paths
    assert "/api/transactions/" not in paths
    assert "/api/assets/" not in paths
    assert "/api/imports/{bank_slug}/preview" not in paths
    assert "/api/planning/v1/runs" not in paths
