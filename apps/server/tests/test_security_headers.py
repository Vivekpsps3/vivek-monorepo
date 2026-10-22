"""Per-route enforced CSP, companion headers, and the violation report sink."""
import json
import re

import pytest
from fastapi import FastAPI, Request
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.testclient import TestClient
from starlette.responses import Response

from apps.server.security_headers import (
    SecurityHeadersMiddleware,
    classify,
    content_security_policy,
    csp_report,
    directives,
    inject_nonce,
    validate_response_headers,
)


FINANCE_PAGE = "<!doctype html><head><script>var finance = 1;</script></head><body><app-root></app-root></body>"
PLAIN_PAGE = "<!doctype html><script>var ready = 1;</script><link rel=\"stylesheet\" href=\"/app.css\"><link rel=\"modulepreload\" href=\"/chunk.js\">"


def _app() -> FastAPI:
    application = FastAPI()
    application.add_middleware(SecurityHeadersMiddleware)

    @application.get("/")
    def portfolio():
        return HTMLResponse("<!doctype html><script>var site = 1;</script><app-root></app-root>")

    @application.get("/finance/")
    def finance():
        return HTMLResponse(FINANCE_PAGE, headers={"Cache-Control": "no-store"})

    @application.get("/finance/main.js")
    def finance_script():
        return Response("console.log(1)\n", media_type="text/javascript", headers={"Cache-Control": "public, max-age=31536000, immutable"})

    @application.get("/travel/")
    def travel():
        return HTMLResponse(PLAIN_PAGE, headers={"Cache-Control": "no-cache"})

    media = FastAPI()

    @media.get("/")
    def media_index():
        return HTMLResponse("<!doctype html><script>var media = 1;</script>", headers={"Cache-Control": "no-cache"})

    application.mount("/media", media)

    @application.get("/api/health")
    def health():
        return {"status": "ok"}

    @application.get("/travel/api/health")
    def travel_health():
        return JSONResponse({"status": "ok"})

    @application.post("/csp-report")
    async def report(request: Request):
        return await csp_report(request)

    return application


@pytest.fixture(name="client")
def client_fixture():
    with TestClient(_app()) as test_client:
        yield test_client


def test_path_classification():
    cases = {
        "/": "portfolio",
        "/secrets": "portfolio",
        "/hub": "finance",
        "/hub/admin": "finance",
        "/auth/login": "finance",
        "/finance/": "finance",
        "/finance/main-abc.js": "finance",
        "/finance/api/vault": "api",
        "/travel/": "travel",
        "/travel/static/app.js": "travel",
        "/travel/api/health": "api",
        "/media/": "media",
        "/media/api/library": "api",
        "/api/health": "api",
        "/health/ready": "api",
        "/metrics": "api",
        "/csp-report": "api",
        "/unknown": "portfolio",
    }
    for path, kind in cases.items():
        assert classify(path) == kind, path


def test_api_policy_is_locked_down_and_does_not_embed_the_nonce():
    policy = content_security_policy("api", "secret-nonce")
    assert "secret-nonce" not in policy
    assert "nonce-" not in policy
    assert "unsafe-inline" not in policy
    assert "unsafe-eval" not in policy
    parsed = directives(policy)
    assert parsed["default-src"] == "'none'"
    assert parsed["connect-src"] == "'none'"
    assert parsed["frame-ancestors"] == "'none'"
    assert parsed["object-src"] == "'none'"
    assert parsed["base-uri"] == "'none'"
    assert parsed["form-action"] == "'none'"
    assert parsed["report-uri"] == "/csp-report"


def test_finance_policy_is_stricter_than_travel_and_media():
    finance = directives(content_security_policy("finance", "n"))
    travel = directives(content_security_policy("travel", "n"))
    media = directives(content_security_policy("media", "n"))
    portfolio = directives(content_security_policy("portfolio", "n"))
    assert finance["img-src"] == "'self' data:"
    assert "tile.openstreetmap.org" in travel["img-src"]
    assert "image.tmdb.org" not in travel["img-src"]
    assert "image.tmdb.org" in media["img-src"]
    assert "tile.openstreetmap.org" not in media["img-src"]
    assert "require-trusted-types-for" in finance
    assert "require-trusted-types-for" not in portfolio
    assert "require-trusted-types-for" not in travel
    assert "require-trusted-types-for" not in media
    for parsed in (finance, travel, media, portfolio):
        assert "unsafe-inline" not in parsed["script-src"]
        assert "unsafe-eval" not in parsed["script-src"]
        assert parsed["script-src-attr"] == "'none'"
        assert parsed["connect-src"] == "'self'"
        assert parsed["object-src"] == "'none'"
        assert parsed["base-uri"] == "'self'"
        assert parsed["form-action"] == "'self'"


def test_inject_nonce_covers_scripts_styles_modulepreload_and_angular_root():
    html = (
        "<!doctype html><style>a{}</style>"
        "<link rel=\"stylesheet\" href=\"/app.css\">"
        "<link rel=\"modulepreload\" href=\"/chunk.js\">"
        "<script src=\"/main.js\"></script><script>var a=1;</script>"
        "<app-root></app-root>"
    )
    rewritten = inject_nonce(html, "abc_123")
    assert rewritten.count('nonce="abc_123"') == 4
    assert 'ngCspNonce="abc_123"' in rewritten
    assert '<link rel="stylesheet" href="/app.css">' in rewritten
    assert inject_nonce(rewritten, "abc_123").count('nonce="abc_123"') == 4


@pytest.mark.parametrize(
    "path",
    ["/", "/finance/", "/finance/main.js", "/travel/", "/media/", "/api/health", "/travel/api/health"],
)
def test_headers_for_each_route(client, path):
    response = client.get(path)
    assert response.status_code == 200, path
    validate_response_headers(response.headers, path, response.content)
    if path == "/finance/main.js":
        assert response.text == "console.log(1)\n"
        assert "immutable" in response.headers["cache-control"]


def test_html_nonces_are_unique_and_documents_are_not_stored(client):
    first = client.get("/finance/")
    second = client.get("/finance/")
    assert first.text != second.text
    assert "nonce-" in first.headers["content-security-policy"]
    assert first.headers["content-security-policy"] != second.headers["content-security-policy"]
    assert first.headers["cache-control"] == "no-store"
    travel = client.get("/travel/")
    assert travel.headers["cache-control"] == "no-store"
    assert '<link rel="stylesheet" href="/app.css">' in travel.text
    assert re.search(r'<link nonce="[^"]+" rel="modulepreload"', travel.text)


def test_csp_report_accepts_legacy_and_reporting_api_bodies_without_echoing_samples(client, caplog):
    legacy = {
        "csp-report": {
            "document-uri": "https://testserver/travel/?token=secret",
            "violated-directive": "script-src 'nonce-abc'",
            "blocked-uri": "inline",
            "script-sample": "vault-passphrase-hunter2",
        }
    }
    with caplog.at_level("INFO", logger="site.csp"):
        legacy_response = client.post("/csp-report", content=json.dumps(legacy), headers={"content-type": "application/csp-report"})
        modern = [{
            "type": "csp-violation",
            "body": {
                "documentURL": "https://testserver/finance/",
                "effectiveDirective": "img-src",
                "blockedURL": "https://image.tmdb.org/t/p/w342/x.jpg?user=secret",
                "sample": "should-not-be-logged",
            },
        }]
        modern_response = client.post("/csp-report", content=json.dumps(modern), headers={"content-type": "application/reports+json"})
    assert legacy_response.status_code == 204
    assert modern_response.status_code == 204
    assert legacy_response.content == b""
    assert "vault-passphrase-hunter2" not in caplog.text
    assert "should-not-be-logged" not in caplog.text
    assert "token=secret" not in caplog.text
    assert "user=secret" not in caplog.text
    assert "directive=script-src" in caplog.text
    assert "directive=img-src" in caplog.text
    assert "app=travel" in caplog.text
    assert "app=finance" in caplog.text
    validate_response_headers(legacy_response.headers, "/csp-report")
    oversized = client.post("/csp-report", content=b"x" * 16385, headers={"content-type": "application/csp-report"})
    assert oversized.status_code == 413
