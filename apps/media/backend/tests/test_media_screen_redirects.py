"""Real screen routes use the suite shell; unknown routes stay true 404s."""

import pytest


@pytest.mark.parametrize(
    "path", ["/", "/library", "/search?q=dune", "/calendar/", "/add", "/item/12"]
)
def test_media_screens_load_the_root_shell(client, path):
    response = client.get(path, follow_redirects=False)
    assert response.status_code == 200
    assert "<app-root ngCspNonce=" in response.text
    assert client.head(path, follow_redirects=False).status_code == 200


def test_missing_screen_and_asset_are_not_fake_success(client):
    assert client.get("/not-a-screen", follow_redirects=False).status_code == 404
    assert client.get("/missing.js", follow_redirects=False).status_code == 404
