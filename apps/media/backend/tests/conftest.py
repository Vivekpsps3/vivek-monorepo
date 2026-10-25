import sys
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parents[4]))


class _MediaClient:
    """Domain tests keep /api/... paths. The site app serves them under /media."""

    def __init__(self, client: TestClient):
        self._client = client
        self.app = client.app

    def _url(self, url: str) -> str:
        if url == "/":
            return "/media/"
        if url == "/media" or url.startswith("/media/"):
            return url
        if url.startswith("/"):
            return "/media" + url
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


@pytest.fixture(autouse=True)
def _clear_provider_health():
    from apps.media.backend.services import providers

    providers._HEALTH.clear()
    yield
    providers._HEALTH.clear()


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.delenv("TMDB_API_KEY", raising=False)
    monkeypatch.delenv("RAWG_API_KEY", raising=False)
    monkeypatch.delenv("MEDIA_SCRAPE_MODE", raising=False)
    monkeypatch.delenv("MEDIA_TODAY", raising=False)
    url = f"sqlite:///{tmp_path / 'media.db'}"
    from apps.media.backend.models import Base as MediaBase
    from apps.server.auth import Principal
    from apps.server.database import install, open_database
    from apps.server.main import Dependencies, Settings, create_app

    database = open_database(url)
    install(database)
    MediaBase.metadata.create_all(database.engine)
    application = create_app(
        Settings(
            database_url=url,
            release="test",
            web_root=tmp_path,
            portfolio_root=tmp_path,
            openapi=False,
        ),
        Dependencies(
            database=database,
            principal=Principal(1, "tester", "Tester"),
            check_schema=False,
            check_frontend=False,
        ),
    )
    with TestClient(application) as test_client:
        yield _MediaClient(test_client)
