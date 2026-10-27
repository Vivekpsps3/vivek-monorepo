"""LOCAL_DEV_AUTH is off unless a test turns it on."""

import os

os.environ["DATABASE_URL"] = "sqlite:///:memory:"
os.environ["LOCAL_DEV_AUTH"] = "0"
os.environ.pop("FINANCE_DEV_ENV_FILE", None)

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import delete

from apps.finance.backend.database import SessionLocal
from apps.finance.backend.main import Base, app, engine, market_data
from apps.finance.backend.tests.conftest import TEST_PASSWORD, seed_user
from apps.server.identity.models import UserSession


@pytest.fixture(autouse=True)
def reset_db():
    Base.metadata.create_all(bind=engine)
    market_data.clear_memory_cache()
    with engine.begin() as conn:
        for table in reversed(Base.metadata.sorted_tables):
            conn.execute(delete(table))


def _local_client() -> TestClient:
    return TestClient(app, base_url="http://127.0.0.1")


def test_flag_off_still_requires_login_on_localhost(monkeypatch):
    monkeypatch.setenv("LOCAL_DEV_AUTH", "0")
    monkeypatch.delenv("FINANCE_DEV_ENV_FILE", raising=False)
    response = _local_client().get("/api/auth/me")
    assert response.status_code == 401
    assert "local-dev" not in response.text


def test_flag_on_public_host_still_requires_login(monkeypatch):
    monkeypatch.setenv("LOCAL_DEV_AUTH", "1")
    monkeypatch.delenv("FINANCE_DEV_ENV_FILE", raising=False)
    response = TestClient(app, base_url="http://finance.example").get("/api/auth/me")
    assert response.status_code == 401


def test_flag_on_localhost_opens_a_deterministic_dev_session(monkeypatch):
    monkeypatch.setenv("LOCAL_DEV_AUTH", "1")
    monkeypatch.delenv("FINANCE_DEV_ENV_FILE", raising=False)
    client = _local_client()
    response = client.get("/api/auth/me")
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["local_dev"] is True
    assert body["user"]["username"] == "local-dev"
    assert body["user"]["email"] == "local-dev@localhost"
    assert body["user"]["display_name"] == "Local Dev"
    assert body["user"]["role"] == "admin"
    again = client.get("/api/auth/me")
    assert again.status_code == 200
    assert again.json()["user"]["id"] == body["user"]["id"]


def test_dev_env_file_allows_a_non_local_host(tmp_path, monkeypatch):
    dev_file = tmp_path / ".env.development"
    dev_file.write_text("LOCAL_DEV_AUTH=1\n", encoding="utf-8")
    monkeypatch.setattr("apps.finance.backend.local_dev.dev_env_file", lambda: dev_file)
    monkeypatch.setenv("LOCAL_DEV_AUTH", "1")
    monkeypatch.setenv("FINANCE_DEV_ENV_FILE", str(dev_file.resolve()))
    response = TestClient(app, base_url="http://devbox.internal").get("/api/auth/me")
    assert response.status_code == 200, response.text
    assert response.json()["local_dev"] is True


def test_dev_env_file_without_the_flag_does_not_activate(tmp_path, monkeypatch):
    dev_file = tmp_path / ".env.development"
    dev_file.write_text("LOG_LEVEL=debug\n", encoding="utf-8")
    monkeypatch.setattr("apps.finance.backend.local_dev.dev_env_file", lambda: dev_file)
    monkeypatch.setenv("LOCAL_DEV_AUTH", "1")
    monkeypatch.setenv("FINANCE_DEV_ENV_FILE", str(dev_file.resolve()))
    response = TestClient(app, base_url="http://devbox.internal").get("/api/auth/me")
    assert response.status_code == 401


def _sign_in(client: TestClient, email: str) -> None:
    user = seed_user(email=email)
    response = client.post(
        "/api/auth/login/migrate", json={"email": email, "password": TEST_PASSWORD}
    )
    assert response.status_code == 200, response.text
    db = SessionLocal()
    try:
        db.query(UserSession).filter(UserSession.user_id == user.id).update(
            {UserSession.migration_only: False}, synchronize_session=False
        )
        db.commit()
    finally:
        db.close()
    client.headers["X-CSRF-Token"] = response.json()["csrf_token"]


def test_local_dev_does_not_replace_a_real_session(monkeypatch):
    monkeypatch.setenv("LOCAL_DEV_AUTH", "1")
    monkeypatch.delenv("FINANCE_DEV_ENV_FILE", raising=False)
    client = _local_client()
    _sign_in(client, "real-person@example.com")
    response = client.get("/api/auth/me")
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["user"]["email"] == "real-person@example.com"
    assert body["local_dev"] is False


def test_vault_passphrase_is_generated_for_the_dev_user_only(tmp_path, monkeypatch):
    monkeypatch.setenv("LOCAL_DEV_AUTH", "1")
    monkeypatch.delenv("FINANCE_DEV_ENV_FILE", raising=False)
    monkeypatch.setattr(
        "apps.finance.backend.local_dev.passphrase_file", lambda: tmp_path / "vault-passphrase"
    )
    client = _local_client()
    first = client.get("/api/auth/local-dev/vault")
    assert first.status_code == 200, first.text
    passphrase = first.json()["passphrase"]
    assert len(passphrase) >= 12
    assert passphrase not in {"password", "passphrase", "local-dev", "secret"}
    assert client.get("/api/auth/local-dev/vault").json()["passphrase"] == passphrase

    denied = _local_client()
    _sign_in(denied, "real-person@example.com")
    assert denied.get("/api/auth/local-dev/vault").status_code == 404


def test_vault_passphrase_route_is_absent_without_the_flag(monkeypatch):
    monkeypatch.setenv("LOCAL_DEV_AUTH", "0")
    monkeypatch.delenv("FINANCE_DEV_ENV_FILE", raising=False)
    response = _local_client().get("/api/auth/local-dev/vault")
    assert response.status_code == 401
