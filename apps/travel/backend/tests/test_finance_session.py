"""Finance session checks. These tests do not call a live finance server."""

import asyncio
import httpx
import pytest
from fastapi import HTTPException
from starlette.requests import Request


def _request(method: str, headers: list[tuple[bytes, bytes]] | None = None) -> Request:
    return Request(
        {
            "type": "http",
            "method": method,
            "path": "/api/trips",
            "headers": headers or [],
            "query_string": b"",
            "scheme": "http",
            "server": ("test", 80),
            "client": ("127.0.0.1", 9),
        }
    )


def test_writes_require_the_finance_csrf_token():
    from apps.travel.backend.deps import fetch_principal

    request = _request("POST", [(b"cookie", b"finance_session=abc")])
    with pytest.raises(HTTPException) as exc:
        fetch_principal(request)
    assert exc.value.status_code == 403


def test_reads_accept_the_finance_user(monkeypatch):
    from apps.travel.backend.deps import fetch_principal

    def fake_request(method, url, headers, timeout):
        assert method == "GET"
        assert url == "http://127.0.0.1:8000/api/auth/me"
        assert headers["cookie"] == "finance_session=abc"
        assert timeout == 5.0
        return httpx.Response(
            200,
            json={"user": {"id": 7, "username": "vivek", "display_name": "Vivek"}},
            headers=[(b"set-cookie", b"finance_session=slid; Path=/; HttpOnly")],
        )

    monkeypatch.setattr(httpx, "request", fake_request)
    result = fetch_principal(_request("GET", [(b"cookie", b"finance_session=abc")]))
    assert result.principal.id == 7
    assert result.principal.display_name == "Vivek"
    assert result.cookies == ["finance_session=slid; Path=/; HttpOnly"]


def test_writes_post_the_session_probe(monkeypatch):
    from apps.travel.backend.deps import fetch_principal

    def fake_request(method, url, headers, timeout):
        assert method == "POST"
        assert url == "http://127.0.0.1:8000/api/auth/session"
        assert headers["x-csrf-token"] == "csrf-token"
        return httpx.Response(
            200, json={"user": {"id": 7, "username": "vivek", "display_name": None}}
        )

    monkeypatch.setattr(httpx, "request", fake_request)
    result = fetch_principal(
        _request("POST", [(b"cookie", b"finance_session=abc"), (b"x-csrf-token", b"csrf-token")])
    )
    assert result.principal.display_name == "vivek"
    assert result.cookies == []


def test_finance_rejection_and_outage_map_to_travel_errors(monkeypatch):
    from apps.travel.backend.deps import fetch_principal

    def reject(method, url, headers, timeout):
        return httpx.Response(401, json={"detail": "Login required"})

    monkeypatch.setattr(httpx, "request", reject)
    with pytest.raises(HTTPException) as denied:
        fetch_principal(_request("GET", [(b"cookie", b"finance_session=stale")]))
    assert denied.value.status_code == 401

    def down(method, url, headers, timeout):
        raise httpx.ConnectError("finance is down")

    monkeypatch.setattr(httpx, "request", down)
    with pytest.raises(HTTPException) as outage:
        fetch_principal(_request("GET"))
    assert outage.value.status_code == 503


@pytest.mark.parametrize(
    "payload",
    [
        None,
        [],
        {"user": None},
        {"user": []},
        {"user": {}},
        {"user": {"id": "7"}},
        {"user": {"id": 7.5}},
        {"user": {"id": True}},
        {"user": {"id": 0}},
        {"user": {"id": -1}},
        {"user": {"id": 7, "username": []}},
        {"user": {"id": 7, "display_name": {}}},
    ],
)
def test_malformed_finance_principal_responses_become_503(monkeypatch, payload):
    from apps.travel.backend.deps import fetch_principal

    monkeypatch.setattr(
        httpx, "request", lambda *_args, **_kwargs: httpx.Response(200, json=payload)
    )
    with pytest.raises(HTTPException) as unavailable:
        fetch_principal(_request("GET"))
    assert unavailable.value.status_code == 503


def test_non_json_finance_principal_response_becomes_503(monkeypatch):
    from apps.travel.backend.deps import fetch_principal

    monkeypatch.setattr(
        httpx, "request", lambda *_args, **_kwargs: httpx.Response(200, content=b"not json")
    )
    with pytest.raises(HTTPException) as unavailable:
        fetch_principal(_request("GET"))
    assert unavailable.value.status_code == 503


def test_principal_checker_offloads_sync_work_and_accepts_async_checkers():
    import threading

    from apps.travel.backend.deps import AuthResult, Principal, check_principal

    async def exercise():
        event_loop_thread = threading.get_ident()

        def sync_checker(_request):
            assert threading.get_ident() != event_loop_thread
            return AuthResult(Principal(7, "vivek", "Vivek"), [])

        sync_result = await check_principal(_request("GET"), sync_checker)
        assert sync_result.principal.id == 7

        async def async_checker(_request):
            return AuthResult(Principal(8, "other", "Other"), [])

        async_result = await check_principal(_request("GET"), async_checker)
        assert async_result.principal.id == 8

    asyncio.run(exercise())


def test_mount_path_prefixes_browser_urls(client, monkeypatch):
    monkeypatch.setenv("TRAVEL_MOUNT_PATH", "/travel")
    page = client.get("/")
    assert page.status_code == 200
    assert 'window.TRAVEL_ROOT = "/travel"' in page.text
    assert 'href="/travel/static/app.css"' in page.text
    assert page.headers["cache-control"] == "no-cache"


def test_direct_server_keeps_root_urls(client, monkeypatch):
    monkeypatch.delenv("TRAVEL_MOUNT_PATH", raising=False)
    page = client.get("/")
    assert 'window.TRAVEL_ROOT = ""' in page.text
    assert "__TRAVEL_ROOT__" not in page.text
    assert 'type="module"' in page.text


def test_shared_browser_runtime_is_served_for_direct_and_mounted_imports(client):
    response = client.get("/shared-browser/dom.mjs")
    assert response.status_code == 200
    assert "export function escapeHtml" in response.text


def test_sliding_finance_cookies_reach_the_browser(client):
    from apps.travel.backend.deps import AuthResult, Principal

    client.app.state.principal_checker = lambda _request: AuthResult(
        Principal(1, "tester", "Tester"),
        ["finance_session=slid; Path=/; HttpOnly", "finance_csrf=csrf; Path=/"],
    )
    response = client.get("/api/home")
    assert response.status_code == 200
    forwarded = response.headers.get_list("set-cookie")
    assert any(item.startswith("finance_session=slid") for item in forwarded)
    assert any(item.startswith("finance_csrf=csrf") for item in forwarded)
    assert "no-store" in response.headers["cache-control"]
