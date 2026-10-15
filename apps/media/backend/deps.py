"""Finance session cookie. Media does not create its own accounts."""

import os
from contextvars import ContextVar
from dataclasses import dataclass
from inspect import isawaitable, iscoroutinefunction

import httpx
from fastapi import HTTPException, Request
from starlette.concurrency import run_in_threadpool

actor: ContextVar["Principal | None"] = ContextVar("media_actor", default=None)


@dataclass(frozen=True)
class Principal:
    id: int
    username: str | None
    display_name: str


@dataclass(frozen=True)
class AuthResult:
    principal: Principal
    cookies: list[str]


def require_actor() -> Principal:
    current = actor.get()
    if current is None:
        raise HTTPException(status_code=401, detail="Sign in through the Hub.")
    return current


async def check_principal(request: Request, checker=None) -> AuthResult:
    check = checker or fetch_principal
    if iscoroutinefunction(check):
        result = await check(request)
    else:
        result = await run_in_threadpool(check, request)
        if isawaitable(result):
            result = await result
    return result


def fetch_principal(request: Request) -> AuthResult:
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
            raise HTTPException(status_code=403, detail="Sign in again so this change can be saved.")
        headers["x-csrf-token"] = csrf
    try:
        response = httpx.request("POST" if unsafe else "GET", f"{base}{path}", headers=headers, timeout=5.0)
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=503, detail="Sign-in is unavailable.") from exc
    if response.status_code == 401:
        raise HTTPException(status_code=401, detail="Sign in through the Hub.")
    if response.status_code == 403:
        raise HTTPException(status_code=403, detail="Sign in again so this change can be saved.")
    if response.status_code >= 400:
        raise HTTPException(status_code=503, detail="Sign-in is unavailable.")
    try:
        payload = response.json()
    except (TypeError, ValueError) as exc:
        raise HTTPException(status_code=503, detail="Sign-in is unavailable.") from exc
    user = payload.get("user") if isinstance(payload, dict) else None
    if not isinstance(user, dict) or type(user.get("id")) is not int or user["id"] <= 0:
        raise HTTPException(status_code=503, detail="Sign-in is unavailable.")
    username = user.get("username")
    display_name = user.get("display_name")
    if username is not None and not isinstance(username, str):
        raise HTTPException(status_code=503, detail="Sign-in is unavailable.")
    if display_name is not None and not isinstance(display_name, str):
        raise HTTPException(status_code=503, detail="Sign-in is unavailable.")
    name = display_name or username or "You"
    return AuthResult(Principal(id=user["id"], username=username, display_name=name), response.headers.get_list("set-cookie"))
