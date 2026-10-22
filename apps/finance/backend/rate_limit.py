"""Per-IP and per-account limits for passwordless login and signup.

``RATE_LIMIT_PER_MIN`` remains an optional shared cap (auth POSTs and market
research). Auth endpoints also have their own always-on IP limit, plus a
per-account limit applied after the username is parsed. Limits are in-process;
this deployment runs one worker, so the buckets cover the process.
"""

from __future__ import annotations

import os
import time
from collections import defaultdict
from typing import Callable, DefaultDict, Tuple

from fastapi import HTTPException
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse, Response

# (count, window_start)
_buckets: DefaultDict[str, Tuple[int, float]] = defaultdict(lambda: (0, 0.0))
_auth_ip_buckets: DefaultDict[str, Tuple[int, float]] = defaultdict(lambda: (0, 0.0))
_auth_account_buckets: DefaultDict[str, Tuple[int, float]] = defaultdict(lambda: (0, 0.0))

_AUTH_POSTS = {
    "/api/auth/passwordless/lookup",
    "/api/auth/passwordless/challenge",
    "/api/auth/passwordless/verify",
    "/api/auth/passwordless/enroll",
    "/api/auth/signup/passwordless",
    "/api/auth/bootstrap/passwordless",
}
_AUTH_PUTS = {
    "/api/auth/passwordless/wraps",
    "/api/vault/wraps",
}
_RATE_DETAIL = "Rate limit exceeded; retry later"


def clear_limits() -> None:
    _buckets.clear()
    _auth_ip_buckets.clear()
    _auth_account_buckets.clear()


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
    if request.client:
        return request.client.host or "unknown"
    return "unknown"


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
    if request.method == "PUT" and path in _AUTH_PUTS:
        return True
    if request.method == "GET" and path.startswith("/api/auth/invitations/"):
        return True
    return False


def _consume(buckets: DefaultDict[str, Tuple[int, float]], key: str, limit: int) -> bool:
    now = time.monotonic()
    if len(buckets) >= 10000:
        stale = [item for item, (_, start) in buckets.items() if now - start >= 60]
        for item in stale:
            buckets.pop(item, None)
        if key not in buckets and len(buckets) >= 10000:
            return False
    count, window_start = buckets[key]
    if now - window_start >= 60.0:
        count, window_start = 0, now
    count += 1
    buckets[key] = (count, window_start)
    return count <= limit


def enforce_account_rate_limit(account: str) -> None:
    """Count one attempt against the normalized username, whether or not it exists."""
    normalized = (account or "").strip().lower()
    if not normalized:
        return
    limit = _positive_int("AUTH_ACCOUNT_RATE_LIMIT_PER_MIN", 20)
    if not _consume(_auth_account_buckets, normalized, limit):
        raise HTTPException(status_code=429, detail=_RATE_DETAIL)


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
