"""FastAPI dependencies.

Travel trusts the finance session cookie. Finance remains the only place that
creates and revokes that token.
"""

import os
from inspect import isawaitable, iscoroutinefunction
from contextvars import ContextVar
from dataclasses import dataclass

import httpx
from fastapi import HTTPException, Request
from starlette.concurrency import run_in_threadpool

from services.flights import lookup_flights
from services.places import nominatim_search

actor: ContextVar["Principal | None"] = ContextVar("travel_actor", default=None)


@dataclass(frozen=True)
class Principal:
    id: int
    username: str | None
    display_name: str


@dataclass(frozen=True)
class AuthResult:
    principal: Principal
    cookies: list[str]


def get_geocoder():
    return nominatim_search


def get_flight_lookup():
    return lookup_flights


def require_actor() -> Principal:
    current = actor.get()
    if current is None:
        raise HTTPException(status_code=401, detail="Sign in through Finance.")
    return current


def settings_key(name: str) -> str:
    return f"user:{require_actor().id}:{name}"


def flightaware_key(db) -> tuple[str | None, str | None]:
    """Env wins over a key saved from the settings page."""
    from models import Setting

    env = os.getenv("FLIGHTAWARE_API_KEY", "").strip()
    if env:
        return env, "environment"
    row = db.get(Setting, settings_key("flightaware_api_key"))
    if row is not None and row.value.strip():
        return row.value.strip(), "database"
    return None, None


async def check_principal(request: Request, checker=None) -> AuthResult:
    """Resolve Finance auth without blocking Travel's async middleware."""
    check = checker or fetch_principal
    if iscoroutinefunction(check):
        result = await check(request)
    else:
        result = await run_in_threadpool(check, request)
        if isawaitable(result):
            result = await result
    return result


def fetch_principal(request: Request) -> AuthResult:
    """Ask Finance whether this browser's session cookie is still valid."""
    base = os.getenv("FINANCE_API_URL", "http://127.0.0.1:8000").rstrip("/")
    unsafe = request.method not in ("GET", "HEAD", "OPTIONS")
    path = "/api/auth/session" if unsafe else "/api/auth/me"
    headers = {}
    cookie = request.headers.get("cookie")
    if cookie:
        headers["cookie"] = cookie
    if unsafe:
        csrf = request.headers.get("x-csrf-token")
        if not csrf:
            raise HTTPException(status_code=403, detail="Sign in through Finance again so this change can be saved.")
        headers["x-csrf-token"] = csrf
    try:
        response = httpx.request("POST" if unsafe else "GET", f"{base}{path}", headers=headers, timeout=5.0)
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=503, detail="Finance sign-in is unavailable.") from exc
    if response.status_code == 401:
        raise HTTPException(status_code=401, detail="Sign in through Finance.")
    if response.status_code == 403:
        raise HTTPException(status_code=403, detail="Sign in through Finance again so this change can be saved.")
    if response.status_code >= 400:
        raise HTTPException(status_code=503, detail="Finance sign-in is unavailable.")
    try:
        payload = response.json()
    except (TypeError, ValueError) as exc:
        raise HTTPException(status_code=503, detail="Finance sign-in is unavailable.") from exc
    if not isinstance(payload, dict):
        raise HTTPException(status_code=503, detail="Finance sign-in is unavailable.")
    user = payload.get("user")
    if not isinstance(user, dict):
        raise HTTPException(status_code=503, detail="Finance sign-in is unavailable.")

    user_id = user.get("id")
    username = user.get("username")
    display_name = user.get("display_name")
    if type(user_id) is not int or user_id <= 0:
        raise HTTPException(status_code=503, detail="Finance sign-in is unavailable.")
    if username is not None and not isinstance(username, str):
        raise HTTPException(status_code=503, detail="Finance sign-in is unavailable.")
    if display_name is not None and not isinstance(display_name, str):
        raise HTTPException(status_code=503, detail="Finance sign-in is unavailable.")

    name = display_name or username or "You"
    principal = Principal(id=user_id, username=username, display_name=name)
    return AuthResult(principal, response.headers.get_list("set-cookie"))
