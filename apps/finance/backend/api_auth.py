"""Optional API key gate when API_KEY or FINANCE_API_KEY is set (non-localhost deploys)."""

import os
import secrets

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse


def configured_api_key() -> str | None:
    raw = os.getenv("API_KEY") or os.getenv("FINANCE_API_KEY")
    if not raw or not raw.strip():
        return None
    return raw.strip()


def _provided_key(request: Request) -> str | None:
    header = request.headers.get("X-API-Key")
    if header and header.strip():
        return header.strip()
    auth = request.headers.get("Authorization")
    if auth and auth.lower().startswith("bearer "):
        return auth[7:].strip()
    return None


def _is_health_probe(request: Request) -> bool:
    return request.method == "GET" and request.url.path == "/api/health"


class ApiKeyMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        expected = configured_api_key()
        if not expected:
            return await call_next(request)
        if _is_health_probe(request) or request.method == "OPTIONS":
            return await call_next(request)
        if not request.url.path.startswith("/api"):
            return await call_next(request)
        provided = _provided_key(request)
        if not provided or not secrets.compare_digest(provided, expected):
            return JSONResponse(status_code=401, content={"detail": "Invalid or missing API key"})
        return await call_next(request)
