import sys
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parents[4]))


class _TravelClient:
    """Domain tests keep /api/... paths. The site app serves them under /travel."""

    def __init__(self, client: TestClient):
        self._client = client
        self.app = client.app

    def _url(self, url: str) -> str:
        if url == "/":
            return "/travel/"
        if url == "/travel" or url.startswith("/travel/"):
            return url
        if url.startswith("/"):
            return "/travel" + url
        return url

    def get(self, url, **kwargs):
        return self._client.get(self._url(url), **kwargs)

    def post(self, url, **kwargs):
        return self._client.post(self._url(url), **kwargs)

    def put(self, url, **kwargs):
        return self._client.put(self._url(url), **kwargs)

    def patch(self, url, **kwargs):
        return self._client.patch(self._url(url), **kwargs)

    def delete(self, url, **kwargs):
        return self._client.delete(self._url(url), **kwargs)

    def head(self, url, **kwargs):
        return self._client.head(self._url(url), **kwargs)


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.delenv("FLIGHTAWARE_API_KEY", raising=False)
    monkeypatch.delenv("TRAVEL_ACCESS_TOKEN", raising=False)
    (tmp_path / "index.csr.html").write_text(
        '<app-root></app-root><script type="module" src="/main.js"></script>'
    )
    (tmp_path / "index.html").write_text("<h1>Public</h1>")
    url = f"sqlite:///{tmp_path / 'travel.db'}"
    from apps.server.auth import Principal
    from apps.server.database import open_database
    from apps.server.main import Dependencies, Settings, create_app
    from apps.travel.backend.deps import get_geocoder
    from apps.travel.backend.models import Base as TravelBase

    database = open_database(url)
    TravelBase.metadata.create_all(database.engine)
    application = create_app(
        Settings(
            database_url=url,
            release="test",
            web_root=tmp_path,
            openapi=False,
        ),
        Dependencies(
            database=database,
            principal=Principal(1, "tester", "Tester"),
            check_schema=False,
            check_frontend=False,
        ),
    )
    application.dependency_overrides[get_geocoder] = lambda: (lambda _query: [])
    with TestClient(application) as test_client:
        yield _TravelClient(test_client)
