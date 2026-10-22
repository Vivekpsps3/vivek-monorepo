from fastapi import FastAPI
from fastapi.testclient import TestClient

from apps.server.redirects import register_hub_media_redirects


def test_hub_media_redirects_to_the_journal():
    app = FastAPI()
    register_hub_media_redirects(app)
    with TestClient(app) as client:
        for path in ("/hub/media", "/hub/media/", "/hub/media/library"):
            response = client.get(path, follow_redirects=False)
            assert response.status_code == 302, path
            assert response.headers["location"] == "/media/"
