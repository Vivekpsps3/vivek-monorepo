import sys
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parents[4]))


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setenv("TRAVEL_DATABASE_URL", f"sqlite:///{tmp_path}/travel.db")
    monkeypatch.delenv("FLIGHTAWARE_API_KEY", raising=False)
    monkeypatch.delenv("TRAVEL_ACCESS_TOKEN", raising=False)
    from apps.travel.backend.app import create_app
    from apps.travel.backend.deps import AuthResult, Principal, get_geocoder

    application = create_app()
    application.state.principal_checker = lambda _request: AuthResult(
        Principal(1, "tester", "Tester"), []
    )
    application.dependency_overrides[get_geocoder] = lambda: (lambda _query: [])
    with TestClient(application) as test_client:
        yield test_client
