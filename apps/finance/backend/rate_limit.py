"""Per-IP and per-account limits for passwordless login and signup.

``RATE_LIMIT_PER_MIN`` remains an optional shared cap (auth POSTs and market
research). Auth endpoints also have an always-on per-IP limit. Challenge and
verify are limited per (account, IP), and failed verifies have a separate
higher per-account cap. That cap rejects only further failures. A valid
signature is never counted or blocked. Lookup is per-IP only: its body is deterministic, so a
repeat teaches an attacker nothing, and a per-account cap there lets one IP
hold the owner's login at 429.

The client address is ``request.client.host`` after uvicorn applies
``FORWARDED_ALLOW_IPS``. This module does not read ``X-Forwarded-For``. That
allow-list must be the site-network gateway (see OPERATIONS.md); if it is
wrong, every client collapses into one bucket. IPv6 addresses share a /64.

Limits are in-process. This deployment runs one worker, so the buckets cover
the process. Each table evicts its least-recently used key at 10,000 entries
instead of refusing new keys.
"""

from __future__ import annotations

import ipaddress
import os
import threading
import time
from collections import OrderedDict
from typing import Callable

from fastapi import HTTPException
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse, Response

# key -> (count, window_start). Order is least-recently used at the front.
_buckets: OrderedDict[str, tuple[int, float]] = OrderedDict()
_auth_ip_buckets: OrderedDict[str, tuple[int, float]] = OrderedDict()
_auth_account_buckets: OrderedDict[str, tuple[int, float]] = OrderedDict()
_auth_pair_buckets: OrderedDict[str, tuple[int, float]] = OrderedDict()
_auth_failed_verify_buckets: OrderedDict[str, tuple[int, float]] = OrderedDict()

_MAX_BUCKETS = 10_000
_WINDOW_SECONDS = 60.0
# Sync routes run on the threadpool while the IP middleware runs on the event loop.
_lock = threading.Lock()

_AUTH_POSTS = {
    "/api/auth/passwordless/lookup",
    "/api/auth/passwordless/challenge",
    "/api/auth/passwordless/verify",
    "/api/auth/passwordless/enroll",
    "/api/auth/signup/passwordless",
    "/api/auth/bootstrap/passwordless",
}
_RATE_DETAIL = "Rate limit exceeded; retry later"


def clear_limits() -> None:
    with _lock:
        _buckets.clear()
        _auth_ip_buckets.clear()
        _auth_account_buckets.clear()
        _auth_pair_buckets.clear()
        _auth_failed_verify_buckets.clear()


def _positive_int(name: str, default: int) -> int:
    raw = os.getenv(name, "").strip()
    if not raw:
        return default
    try:
        value = int(raw)
    except ValueError:
        return default
    return value if value > 0 else default


def _limit_per_minute() -> int | None:
    raw = os.getenv("RATE_LIMIT_PER_MIN", "").strip()
    if not raw:
        return None
    try:
        n = int(raw)
        return n if n > 0 else None
    except ValueError:
        return None


def _client_key(request: Request) -> str:
    """Peer address uvicorn already resolved. Spoofed forwarded headers are ignored.

    IPv6 is bucketed by /64. IPv4-mapped IPv6 is stored as the IPv4 address.
    """
    host = request.client.host if request.client and request.client.host else ""
    if not host:
        return "unknown"
    try:
        ip = ipaddress.ip_address(host)
    except ValueError:
        return host
    if isinstance(ip, ipaddress.IPv6Address):
        mapped = ip.ipv4_mapped
        if mapped is not None:
            return str(mapped)
        network = ipaddress.IPv6Network((ip, 64), strict=False)
        return f"{network.network_address}/64"
    return str(ip)


def _path(request: Request) -> str:
    return request.url.path.rstrip("/")


def _is_shared_limited(request: Request) -> bool:
    path = _path(request)
    if path.startswith("/api/market/research"):
        return True
    if request.method != "POST":
        return False
    if path in _AUTH_POSTS or path.startswith("/api/auth/invitations/"):
        return True
    return False


def _is_auth_ip_limited(request: Request) -> bool:
    path = _path(request)
    if request.method == "POST" and (path in _AUTH_POSTS or path.startswith("/api/auth/invitations/")):
        return True
    if request.method == "GET" and path.startswith("/api/auth/invitations/"):
        return True
    return False


def _touch(buckets: OrderedDict[str, tuple[int, float]], key: str) -> None:
    if key in buckets:
        buckets.move_to_end(key)
        return
    while len(buckets) >= _MAX_BUCKETS:
        buckets.popitem(last=False)


def _consume(buckets: OrderedDict[str, tuple[int, float]], key: str, limit: int) -> bool:
    now = time.monotonic()
    with _lock:
        _touch(buckets, key)
        count, window_start = buckets.get(key, (0, 0.0))
        if now - window_start >= _WINDOW_SECONDS:
            count, window_start = 0, now
        count += 1
        buckets[key] = (count, window_start)
        buckets.move_to_end(key)
        return count <= limit


def _account_key(account: str) -> str:
    return (account or "").strip().lower()


def enforce_account_rate_limit(account: str) -> None:
    """Signup and bootstrap only. Login does not use this bucket."""
    normalized = _account_key(account)
    if not normalized:
        return
    limit = _positive_int("AUTH_ACCOUNT_RATE_LIMIT_PER_MIN", 20)
    if not _consume(_auth_account_buckets, normalized, limit):
        raise HTTPException(status_code=429, detail=_RATE_DETAIL)


def enforce_login_pair_limit(account: str, request: Request) -> None:
    """Challenge and verify budget for one account from one client address."""
    normalized = _account_key(account)
    if not normalized:
        return
    limit = _positive_int("AUTH_PAIR_RATE_LIMIT_PER_MIN", 20)
    key = f"{normalized}\0{_client_key(request)}"
    if not _consume(_auth_pair_buckets, key, limit):
        raise HTTPException(status_code=429, detail=_RATE_DETAIL)


def failed_verify_blocked(account: str) -> bool:
    """True when this account has already used its failed-verify budget.

    Only further failures are rejected. A valid signature is never counted and
    is never blocked by this cap. One IP cannot reach the default on its own:
    the pair cap is lower.
    """
    normalized = _account_key(account)
    if not normalized:
        return False
    limit = _positive_int("AUTH_FAILED_VERIFY_RATE_LIMIT_PER_MIN", 60)
    with _lock:
        count, window_start = _auth_failed_verify_buckets.get(normalized, (0, 0.0))
    if time.monotonic() - window_start >= _WINDOW_SECONDS:
        return False
    return count >= limit


def note_failed_verify(account: str) -> None:
    normalized = _account_key(account)
    if not normalized:
        return
    limit = _positive_int("AUTH_FAILED_VERIFY_RATE_LIMIT_PER_MIN", 60)
    _consume(_auth_failed_verify_buckets, normalized, limit)


class RateLimitMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        if _is_auth_ip_limited(request):
            limit = _positive_int("AUTH_IP_RATE_LIMIT_PER_MIN", 60)
            if not _consume(_auth_ip_buckets, _client_key(request), limit):
                return JSONResponse(status_code=429, content={"detail": _RATE_DETAIL})

        shared = _limit_per_minute()
        if shared is not None and _is_shared_limited(request):
            if not _consume(_buckets, _client_key(request), shared):
                return JSONResponse(status_code=429, content={"detail": _RATE_DETAIL})
        return await call_next(request)
