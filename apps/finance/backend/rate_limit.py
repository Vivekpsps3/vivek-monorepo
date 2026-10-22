"""Optional per-IP rate limit for heavy POST endpoints (SEC-012)."""

from __future__ import annotations

import os
import time
from collections import defaultdict
from typing import Callable, DefaultDict, Tuple

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse, Response

# (count, window_start)
_buckets: DefaultDict[str, Tuple[int, float]] = defaultdict(lambda: (0, 0.0))



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


def _is_limited(request: Request) -> bool:
    path = request.url.path.rstrip("/")
    if path.startswith("/api/market/research"):
        return True
    if request.method != "POST":
        return False
    if path in {
        "/api/auth/passwordless/lookup",
        "/api/auth/passwordless/challenge",
        "/api/auth/passwordless/verify",
    }:
        return True
    return False


class RateLimitMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        limit = _limit_per_minute()
        if limit is None or not _is_limited(request):
            return await call_next(request)

        key = _client_key(request)
        now = time.monotonic()
        if len(_buckets) >= 10000:
            stale = [ip for ip, (_, start) in _buckets.items() if now - start >= 60]
            for ip in stale:
                _buckets.pop(ip, None)
            if key not in _buckets and len(_buckets) >= 10000:
                return JSONResponse(status_code=429, content={"detail": "Service busy; retry later"})
        count, window_start = _buckets[key]
        if now - window_start >= 60.0:
            count, window_start = 0, now
        count += 1
        _buckets[key] = (count, window_start)
        if count > limit:
            return JSONResponse(
                status_code=429,
                content={"detail": "Rate limit exceeded; retry later"},
            )
        return await call_next(request)
