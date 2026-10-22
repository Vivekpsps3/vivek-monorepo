"""Production ASGI entrypoint. Explicit migration precedes startup."""

import json
import logging
import os
import re
import time
import uuid
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.responses import FileResponse, JSONResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy import text
from prometheus_client import Counter, Histogram, generate_latest, CONTENT_TYPE_LATEST
from starlette.responses import Response

from apps.server.database import configure_engine, database_url

# Set the Finance engine's URL before importing domain modules. No .env loading in production.
os.environ["DATABASE_URL"] = database_url()
os.environ["TRAVEL_MOUNT_PATH"] = "/travel"
os.environ["MEDIA_MOUNT_PATH"] = "/media"
os.environ["LOCAL_DEV_AUTH"] = "0"

from apps.finance.backend.app import create_app as finance_app
from apps.finance.backend.database import engine
from apps.travel.backend import app as travel, database as travel_db, deps as travel_deps
from apps.media.backend import app as media, database as media_db, deps as media_deps
from apps.server.auth import principal_checker
from apps.server.schema import assert_ready

configure_engine(engine)
travel_db.bind_database(engine)
media_db.bind_database(engine)
RELEASE = os.environ.get("SITE_RELEASE", "development")
WEB_ROOT = Path(os.environ.get("SITE_WEB_ROOT", "/app/web/finance")).resolve()
PORTFOLIO_ROOT = Path(os.environ.get("SITE_PORTFOLIO_ROOT", "/app/web/portfolio")).resolve()
logger = logging.getLogger("site")
REQUESTS = Counter("site_requests_total", "HTTP requests", ["method", "status"])
LATENCY = Histogram("site_request_duration_seconds", "Request latency", ["method"])


@asynccontextmanager
async def lifespan(_app):
    with engine.connect() as connection:
        assert_ready(connection)
        if connection.exec_driver_sql("PRAGMA journal_mode").scalar_one().lower() != "wal":
            raise RuntimeError("Site database must use WAL; run the migration command")
    if not all((root / "index.html").is_file() for root in (WEB_ROOT, PORTFOLIO_ROOT)):
        raise RuntimeError("Site frontend is missing")
    yield
    engine.dispose()


app = FastAPI(
    title="Personal site", lifespan=lifespan, docs_url=None, redoc_url=None, openapi_url=None
)


@app.middleware("http")
async def observe(request: Request, call_next):
    supplied_id = request.headers.get("x-request-id", "")
    request_id = supplied_id if re.fullmatch(r"[0-9a-f]{32}", supplied_id) else uuid.uuid4().hex
    method = (
        request.method
        if request.method in {"GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "HEAD"}
        else "OTHER"
    )
    started = time.monotonic()
    try:
        response = await call_next(request)
    except Exception:
        logger.exception("request_failed request_id=%s", request_id)
        response = JSONResponse(
            status_code=500, content={"detail": "Internal server error", "request_id": request_id}
        )
    REQUESTS.labels(method, str(response.status_code)).inc()
    LATENCY.labels(method).observe(time.monotonic() - started)
    response.headers["X-Request-ID"] = request_id
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["Referrer-Policy"] = "same-origin"
    response.headers["X-Frame-Options"] = "SAMEORIGIN"
    if "/api/" in request.url.path or request.url.path.endswith("/api"):
        response.headers["Cache-Control"] = "no-store, private"
    logger.info(
        json.dumps(
            {
                "event": "request",
                "request_id": request_id,
                "method": request.method,
                "status": response.status_code,
                "duration_ms": round((time.monotonic() - started) * 1000, 2),
            }
        )
    )
    return response


@app.get("/metrics")
def metrics():
    return Response(generate_latest(), headers={"Content-Type": CONTENT_TYPE_LATEST})


@app.get("/health/live")
def live():
    return {"status": "ok", "release": RELEASE}


@app.get("/health/ready")
def ready():
    try:
        with engine.connect() as connection:
            assert_ready(connection)
            for table in ("users", "encrypted_records", "trips", "user_entries"):
                connection.execute(text(f"SELECT id FROM {table} LIMIT 1"))
    except Exception:
        return JSONResponse(status_code=503, content={"status": "unavailable", "release": RELEASE})
    return {"status": "ok", "release": RELEASE}


travel_app = travel.create_app(unified=True)
travel_app.state.principal_checker = principal_checker(
    travel_deps.AuthResult, travel_deps.Principal
)
media_app = media.create_app(unified=True)
media_app.state.principal_checker = principal_checker(media_deps.AuthResult, media_deps.Principal)
app.mount("/travel", travel_app)
app.mount("/media", media_app)

# Include Finance routes and middleware without its legacy startup migration.
finance = finance_app()
for route in finance.routes:
    app.router.routes.append(route)
for middleware in reversed(finance.user_middleware):
    if middleware.cls.__name__ != "RequestLoggingMiddleware":
        app.add_middleware(middleware.cls, *middleware.args, **middleware.kwargs)
for exception, handler in finance.exception_handlers.items():
    app.add_exception_handler(exception, handler)


@app.get("/")
def home():
    return FileResponse(PORTFOLIO_ROOT / "index.html", headers={"Cache-Control": "no-store"})


@app.get("/api")
def api_slash():
    return RedirectResponse("/api/", status_code=308)


@app.get("/finance")
def finance_slash():
    return RedirectResponse("/finance/", status_code=308)


@app.api_route(
    "/finance/api/{path:path}", methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "HEAD"]
)
async def legacy_api(path: str, request: Request):
    return RedirectResponse(
        "/api/" + path + ("?" + request.url.query if request.url.query else ""), status_code=308
    )


@app.get("/finance/login")
@app.get("/finance/auth/login")
@app.get("/finance/signup")
@app.get("/finance/auth/signup")
@app.get("/finance/enroll")
def legacy_login(request: Request):
    destination = (
        "/auth/signup" if request.url.path.endswith(("signup", "enroll")) else "/auth/login"
    )
    return RedirectResponse(
        destination + ("?" + request.url.query if request.url.query else ""), status_code=302
    )


@app.get("/finance/{path:path}")
def finance_page(path: str):
    file = (WEB_ROOT / path).resolve()
    if not file.is_relative_to(WEB_ROOT):
        return JSONResponse(status_code=404, content={"detail": "Not found"})
    if path and file.is_file():
        immutable = bool(re.search(r"-[A-Za-z0-9_-]{8}\.(js|css)$", file.name))
        return FileResponse(
            file,
            headers={
                "Cache-Control": "no-store"
                if file.suffix == ".html"
                else "public, max-age=31536000, immutable"
                if immutable
                else "no-cache"
            },
        )
    if path and (Path(path).suffix or path.startswith("assets/")):
        return JSONResponse(
            status_code=404, content={"detail": "Not found"}, headers={"Cache-Control": "no-store"}
        )
    return shell()


def shell():
    return FileResponse(WEB_ROOT / "index.html", headers={"Cache-Control": "no-store"})


@app.get("/hub")
@app.get("/hub/")
@app.get("/hub/admin")
@app.get("/auth/login")
@app.get("/auth/signup")
def shared_shell():
    return shell()


@app.get("/auth")
@app.get("/auth/")
def login():
    return RedirectResponse("/auth/login", status_code=302)


@app.get("/auth/enroll")
def enroll(request: Request):
    return RedirectResponse(
        "/auth/signup" + ("?" + request.url.query if request.url.query else ""), status_code=302
    )


@app.get("/{path:path}")
def portfolio_page(path: str):
    file = (PORTFOLIO_ROOT / path).resolve()
    if not file.is_relative_to(PORTFOLIO_ROOT):
        return JSONResponse(status_code=404, content={"detail": "Not found"})
    if file.is_file():
        immutable = bool(re.search(r"-[A-Za-z0-9_-]{8}\.(js|css)$", file.name))
        return FileResponse(
            file,
            headers={
                "Cache-Control": "no-store"
                if file.suffix == ".html"
                else "public, max-age=31536000, immutable"
                if immutable
                else "no-cache"
            },
        )
    if path in {"home", "work", "about", "secrets"}:
        return FileResponse(PORTFOLIO_ROOT / "index.html", headers={"Cache-Control": "no-store"})
    return JSONResponse(
        status_code=404, content={"detail": "Not found"}, headers={"Cache-Control": "no-store"}
    )
