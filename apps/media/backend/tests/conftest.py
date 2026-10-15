import sys
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setenv("MEDIA_DATABASE_URL", f"sqlite:///{tmp_path}/media.db")
    monkeypatch.delenv("TMDB_API_KEY", raising=False)
    monkeypatch.delenv("RAWG_API_KEY", raising=False)
    monkeypatch.delenv("MEDIA_SCRAPE_MODE", raising=False)
    monkeypatch.delenv("MEDIA_TODAY", raising=False)
    from app import create_app
    from deps import AuthResult, Principal

    application = create_app()
    application.state.principal_checker = lambda _request: AuthResult(Principal(1, "tester", "Tester"), [])
    with TestClient(application) as test_client:
        yield test_client
