"""Per-route enforced CSP, companion headers, and the violation report sink."""

import json
import re

import pytest
from fastapi import FastAPI, Request
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.testclient import TestClient
from starlette.responses import Response

import apps.server.security_headers as security_headers
from apps.server.security_headers import (
    SHELL_HEADER,
    SecurityHeadersMiddleware,
    allow_report_log,
    classify,
    content_security_policy,
    csp_report,
    directives,
    inject_nonce,
    report_log_key,
    reset_report_logs,
    validate_response_headers,
)


FINANCE_PAGE = "<!doctype html><head><script>var finance = 1;</script></head><body><app-root></app-root></body>"
PLAIN_PAGE = '<!doctype html><script>var ready = 1;</script><link rel="stylesheet" href="/app.css"><link rel="modulepreload" href="/chunk.js">'


def _app() -> FastAPI:
    application = FastAPI()
    application.add_middleware(SecurityHeadersMiddleware)

    @application.get("/")
    def portfolio():
        return HTMLResponse(
            "<!doctype html><script>var site = 1;</script><app-root></app-root>",
            headers={SHELL_HEADER: "1"},
        )

    @application.get("/finance/")
    def finance():
        return HTMLResponse(FINANCE_PAGE, headers={"Cache-Control": "no-store", SHELL_HEADER: "1"})

    @application.get("/reflected")
    def reflected(request: Request):
        snippet = request.query_params.get("q", "hi")
        return HTMLResponse(f"<!doctype html><p>{snippet}</p><script>var reflected = 1;</script>")

    @application.get("/finance/main.js")
    def finance_script():
        return Response(
            "console.log(1)\n",
            media_type="text/javascript",
            headers={"Cache-Control": "public, max-age=31536000, immutable"},
        )

    @application.get("/travel/")
    def travel():
        return HTMLResponse(PLAIN_PAGE, headers={"Cache-Control": "no-cache", SHELL_HEADER: "1"})

    media = FastAPI()

    @media.get("/")
    def media_index():
        return HTMLResponse(
            "<!doctype html><script>var media = 1;</script>",
            headers={"Cache-Control": "no-cache", SHELL_HEADER: "1"},
        )

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
    assert "https://archive.org" in media["img-src"].split()
    assert "https://*.archive.org" in media["img-src"].split()
    assert "archive.org" not in finance["img-src"]
    assert "archive.org" not in travel["img-src"]
    assert "tile.openstreetmap.org" not in media["img-src"]
    assert finance["frame-ancestors"] == "'none'"
    assert finance["trusted-types"] == ""
    assert "angular#unsafe-bypass" not in content_security_policy("finance", "n")
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
        '<link rel="stylesheet" href="/app.css">'
        '<link rel="modulepreload" href="/chunk.js">'
        '<script src="/main.js"></script><script>var a=1;</script>'
        "<app-root></app-root>"
    )
    rewritten = inject_nonce(html, "abc_123")
    assert rewritten.count('nonce="abc_123"') == 4
    assert 'ngCspNonce="abc_123"' in rewritten
    assert '<link rel="stylesheet" href="/app.css">' in rewritten
    assert inject_nonce(rewritten, "abc_123").count('nonce="abc_123"') == 4


@pytest.mark.parametrize(
    "path",
    [
        "/",
        "/finance/",
        "/finance/main.js",
        "/travel/",
        "/media/",
        "/api/health",
        "/travel/api/health",
    ],
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
    assert "x-csp-shell" not in {name.lower() for name in first.headers}


def test_reflected_html_does_not_receive_a_nonce(client):
    response = client.get("/reflected", params={"q": "<script>alert(1)</script>"})
    assert response.status_code == 200
    validate_response_headers(response.headers, "/reflected", response.content)
    assert 'nonce="' not in response.text
    assert "<script>var reflected = 1;</script>" in response.text
    assert "x-csp-shell" not in {name.lower() for name in response.headers}


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
        legacy_response = client.post(
            "/csp-report",
            content=json.dumps(legacy),
            headers={"content-type": "application/csp-report"},
        )
        modern = [
            {
                "type": "csp-violation",
                "body": {
                    "documentURL": "https://testserver/finance/",
                    "effectiveDirective": "img-src",
                    "blockedURL": "https://image.tmdb.org/t/p/w342/x.jpg?user=secret",
                    "sample": "should-not-be-logged",
                },
            }
        ]
        modern_response = client.post(
            "/csp-report",
            content=json.dumps(modern),
            headers={"content-type": "application/reports+json"},
        )
    assert legacy_response.status_code == 204
    assert modern_response.status_code == 204
    assert legacy_response.content == b""
    assert "vault-passphrase-hunter2" not in caplog.text
    assert "should-not-be-logged" not in caplog.text
    assert "token=secret" not in caplog.text
    assert "user=secret" not in caplog.text
    events = [
        json.loads(record.message) for record in caplog.records if record.message.startswith("{")
    ]
    assert {(event["app"], event["directive"]) for event in events} >= {
        ("travel", "script-src"),
        ("finance", "img-src"),
    }
    assert all(" " not in event["directive"] for event in events)
    validate_response_headers(legacy_response.headers, "/csp-report")
    oversized = client.post(
        "/csp-report", content=b"x" * 16385, headers={"content-type": "application/csp-report"}
    )
    assert oversized.status_code == 413


def test_csp_report_log_is_json_and_stops_a_chunked_body_at_the_cap(client, caplog):
    forged = "https://evil.example/a app=finance document=https://attacker.example"
    payload = {
        "csp-report": {
            "document-uri": "https://testserver/travel/",
            "violated-directive": "img-src",
            "blocked-uri": forged,
            "script-sample": "vault-passphrase-hunter2",
        }
    }
    with caplog.at_level("INFO", logger="site.csp"):
        response = client.post(
            "/csp-report",
            content=json.dumps(payload),
            headers={"content-type": "application/csp-report"},
        )
    assert response.status_code == 204
    event = json.loads(caplog.records[-1].message)
    assert event["event"] == "csp_report"
    assert event["app"] == "travel"
    assert event["directive"] == "img-src"
    assert event["blocked"] == forged
    assert "script-sample" not in event
    assert "vault-passphrase-hunter2" not in caplog.text

    def chunks():
        yield b"y" * 10000
        yield b"z" * 8000

    streamed = client.post(
        "/csp-report", content=chunks(), headers={"content-type": "application/csp-report"}
    )
    assert streamed.status_code == 413


def test_report_body_stops_at_the_cap_while_streaming():
    import asyncio

    from apps.server.security_headers import _read_report_body

    class Chunked:
        headers: dict[str, str] = {}

        async def stream(self):
            yield b"a" * 10000
            yield b"b" * 8000

    class Small:
        headers: dict[str, str] = {}

        async def stream(self):
            yield b'{"ok":true}'

    assert asyncio.run(_read_report_body(Chunked())) is None
    assert asyncio.run(_read_report_body(Small())) == b'{"ok":true}'


def test_report_log_budget_is_per_address():
    reset_report_logs()
    try:
        assert all(allow_report_log("203.0.113.5") for _ in range(30))
        assert allow_report_log("203.0.113.5") is False
        assert allow_report_log("203.0.113.9") is True
    finally:
        reset_report_logs()


def test_report_log_keys_ipv6_by_prefix_and_keeps_ipv4():
    assert report_log_key("2001:db8:1:2::1") == report_log_key("2001:0db8:0001:0002::abcd")
    assert report_log_key("2001:db8:1:2::1") != report_log_key("2001:db8:1:3::1")
    assert report_log_key("203.0.113.5") == "203.0.113.5"
    assert report_log_key("203.0.113.5") != report_log_key("203.0.113.6")
    assert report_log_key("::ffff:203.0.113.5") == "203.0.113.5"
    assert report_log_key("::ffff:203.0.113.5") != report_log_key("::ffff:198.51.100.5")
    assert report_log_key("::ffff:203.0.113.5") != "::/64"
    reset_report_logs()
    try:
        assert all(allow_report_log("2001:db8:1:2::1") for _ in range(30))
        assert allow_report_log("2001:db8:1:2::abcd") is False
        assert allow_report_log("2001:db8:1:3::1") is True
    finally:
        reset_report_logs()


def test_report_log_global_ceiling_bounds_address_rotation():
    reset_report_logs()
    try:
        allowed = sum(allow_report_log(f"203.0.113.{i}") for i in range(400))
        assert allowed == security_headers._LOG_GLOBAL_LIMIT
        first = report_log_key("203.0.113.0")
        assert security_headers._log_windows[first][1] == 1
        assert allow_report_log("203.0.113.0") is False
        assert security_headers._log_windows[first][1] == 1
        assert allow_report_log("198.51.100.9") is False
    finally:
        reset_report_logs()


def test_full_report_log_table_refuses_new_keys_without_clearing():
    reset_report_logs()
    original_global = security_headers._LOG_GLOBAL_LIMIT
    security_headers._LOG_GLOBAL_LIMIT = 10_000
    try:
        keys = [f"198.51.{i // 256}.{i % 256}" for i in range(security_headers._LOG_MAX_IPS + 1)]
        assert [allow_report_log(key) for key in keys[:-1]] == [
            True
        ] * security_headers._LOG_MAX_IPS
        assert allow_report_log(keys[-1]) is False
        assert len(security_headers._log_windows) == security_headers._LOG_MAX_IPS
        assert allow_report_log(keys[0]) is True
        assert security_headers._log_windows[report_log_key(keys[0])][1] == 2
        assert allow_report_log(keys[-1]) is False
        now = __import__("time").monotonic()
        for key in list(security_headers._log_windows):
            security_headers._log_windows[key] = (now - security_headers._LOG_WINDOW_SECONDS - 1, 1)
        assert allow_report_log("203.0.113.50") is True
        assert report_log_key("203.0.113.50") in security_headers._log_windows
        assert len(security_headers._log_windows) == 1
    finally:
        security_headers._LOG_GLOBAL_LIMIT = original_global
        reset_report_logs()


def test_csp_report_logs_at_most_five_entries_per_request(client, caplog):
    reset_report_logs()
    payload = [
        {
            "type": "csp-violation",
            "body": {
                "documentURL": "https://testserver/media/",
                "effectiveDirective": "img-src",
                "blockedURL": f"https://evil.example/{index}",
            },
        }
        for index in range(8)
    ]
    try:
        with caplog.at_level("INFO", logger="site.csp"):
            response = client.post(
                "/csp-report",
                content=json.dumps(payload),
                headers={"content-type": "application/reports+json"},
            )
        assert response.status_code == 204
        events = [
            json.loads(record.message)
            for record in caplog.records
            if record.message.startswith("{")
        ]
        assert len(events) == 5
        assert [event["blocked"] for event in events] == [
            f"https://evil.example/{index}" for index in range(5)
        ]
    finally:
        reset_report_logs()
