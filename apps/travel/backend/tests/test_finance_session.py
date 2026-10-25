"""Travel shell and signed-out behavior on the site app."""

from apps.server.auth import require_principal


def test_mount_path_prefixes_browser_urls(client):
    page = client.get("/")
    assert page.status_code == 200
    assert 'window.TRAVEL_ROOT = "/travel"' in page.text
    assert 'href="/travel/static/app.css"' in page.text
    assert page.headers["cache-control"] == "no-store"
    assert 'type="module"' in page.text


def test_shared_browser_runtime_is_served(client):
    response = client.get("/shared-browser/dom.mjs")
    assert response.status_code == 200
    assert "export function escapeHtml" in response.text


def test_finance_session_is_required(client):
    client.app.dependency_overrides.pop(require_principal, None)
    assert client.get("/api/health").status_code == 200
    denied = client.get("/api/home")
    assert denied.status_code == 401
    assert denied.json()["detail"] == "Login required"
