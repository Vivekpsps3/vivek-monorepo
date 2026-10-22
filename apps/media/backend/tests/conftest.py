import sys
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parents[4]))


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setenv("MEDIA_DATABASE_URL", f"sqlite:///{tmp_path}/media.db")
    monkeypatch.delenv("TMDB_API_KEY", raising=False)
    monkeypatch.delenv("RAWG_API_KEY", raising=False)
    monkeypatch.delenv("MEDIA_SCRAPE_MODE", raising=False)
    monkeypatch.delenv("MEDIA_TODAY", raising=False)
    from apps.media.backend.app import create_app
    from apps.media.backend.deps import AuthResult, Principal

    application = create_app()
    # load_dotenv() inside create_app can refill these from a developer .env.
    monkeypatch.delenv("TMDB_API_KEY", raising=False)
    monkeypatch.delenv("RAWG_API_KEY", raising=False)
    monkeypatch.delenv("MEDIA_SCRAPE_MODE", raising=False)
    monkeypatch.delenv("MEDIA_TODAY", raising=False)
    application.state.principal_checker = lambda _request: AuthResult(
        Principal(1, "tester", "Tester"), []
    )
    with TestClient(application) as test_client:
        yield test_client
