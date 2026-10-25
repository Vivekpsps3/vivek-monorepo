"""Production ASGI entrypoint. Startup checks the schema revision and does not migrate."""

from __future__ import annotations

import json
import logging
import os
import re
import time
import uuid
from contextlib import asynccontextmanager
from dataclasses import dataclass
from pathlib import Path
from typing import cast

from fastapi import FastAPI, HTTPException, Request
from fastapi.exception_handlers import request_validation_exception_handler
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse, RedirectResponse
from prometheus_client import CONTENT_TYPE_LATEST, Counter, Histogram, generate_latest
from sqlalchemy import text
from sqlalchemy.engine import Engine
from starlette.responses import Response

from apps.finance.backend.api_auth import ApiKeyMiddleware
from apps.finance.backend.rate_limit import RateLimitMiddleware
from apps.server.auth import Principal, require_principal
from apps.server.database import Database, database_url, install, open_database
from apps.server.redirects import register_hub_media_redirects
from apps.server.schema import assert_ready
from apps.server.security_headers import SHELL_HEADER, SecurityHeadersMiddleware, csp_report

logger = logging.getLogger("site")
# Module-level so a second create_app does not re-register the same series.
REQUESTS = Counter("site_requests_total", "HTTP requests", ["method", "status"])
LATENCY = Histogram("site_request_duration_seconds", "Request latency", ["method"])

engine = cast(Engine, None)
RELEASE = os.environ.get("SITE_RELEASE", "development")
WEB_ROOT = Path(os.environ.get("SITE_WEB_ROOT", "/app/web/finance")).resolve()
PORTFOLIO_ROOT = Path(os.environ.get("SITE_PORTFOLIO_ROOT", "/app/web/portfolio")).resolve()


@dataclass(frozen=True)
class Settings:
    database_url: str
    release: str
    web_root: Path
    portfolio_root: Path
    openapi: bool = False

    @staticmethod
    def from_environ() -> Settings:
        return Settings(
            database_url=database_url(),
            release=os.environ.get("SITE_RELEASE", "development"),
            web_root=Path(os.environ.get("SITE_WEB_ROOT", "/app/web/finance")).resolve(),
            portfolio_root=Path(
                os.environ.get("SITE_PORTFOLIO_ROOT", "/app/web/portfolio")
            ).resolve(),
        )


@dataclass(frozen=True)
class Dependencies:
    """Optional test seams. Production uses the defaults and Settings.from_environ."""

    database: Database | None = None
    principal: Principal | None = None
    check_schema: bool = True
    check_frontend: bool = True


def _static_headers(file: Path, root: Path, immutable: bool) -> dict[str, str]:
    if file.suffix == ".html":
        headers = {"Cache-Control": "no-store"}
        if file.resolve() == (root / "index.html").resolve():
            headers[SHELL_HEADER] = "1"
        return headers
    if immutable:
        return {"Cache-Control": "public, max-age=31536000, immutable"}
    return {"Cache-Control": "no-cache"}


def _shell_headers() -> dict[str, str]:
    return {"Cache-Control": "no-store", SHELL_HEADER: "1"}


def create_app(settings: Settings, dependencies: Dependencies | None = None) -> FastAPI:
    """One factory. Callers pass the engine and any pinned principal. Import builds nothing."""
    from apps.finance.backend.app import register_finance
    from apps.finance.backend.database import publish
    from apps.finance.backend.logging_config import get_logger, setup_logging
    from apps.media.backend.app import register_media
    from apps.travel.backend.app import register_travel, validation_response

    setup_logging()
    finance_logger = get_logger()
    dependencies = dependencies or Dependencies()
    database = dependencies.database or open_database(settings.database_url)
    install(database)
    publish(database)

    global engine, RELEASE, WEB_ROOT, PORTFOLIO_ROOT
    engine = database.engine
    RELEASE = settings.release
    web_root = settings.web_root
    portfolio_root = settings.portfolio_root
    WEB_ROOT = web_root
    PORTFOLIO_ROOT = portfolio_root
    release = settings.release

    @asynccontextmanager
    async def lifespan(_app: FastAPI):
        # Migrations stay offline. A test app skips the file and WAL checks and
        # must not dispose the engine: later tests still share it.
        if dependencies.check_schema or dependencies.check_frontend:
            if dependencies.check_schema:
                with database.engine.connect() as connection:
                    assert_ready(connection)
                    journal = connection.exec_driver_sql("PRAGMA journal_mode").scalar_one()
                    if str(journal).lower() != "wal":
                        raise RuntimeError(
                            "Site database must use WAL; run python -m apps.server.migrations"
                        )
            if dependencies.check_frontend and not all(
                (root / "index.html").is_file() for root in (web_root, portfolio_root)
            ):
                raise RuntimeError("Site frontend is missing")
        yield
        if dependencies.check_schema:
            database.engine.dispose()

    application = FastAPI(
        title="Personal site",
        lifespan=lifespan,
        docs_url=None if not settings.openapi else "/docs",
        redoc_url=None if not settings.openapi else "/redoc",
        openapi_url=None if not settings.openapi else "/openapi.json",
    )

    @application.exception_handler(HTTPException)
    async def log_http_exception(request: Request, exc: HTTPException):
        detail = exc.detail if isinstance(exc.detail, str) else str(exc.detail)
        finance_logger.log(
            logging.ERROR if exc.status_code >= 500 else logging.WARNING,
            "http_error method=%s path=%s status=%s detail=%s",
            request.method,
            request.url.path,
            exc.status_code,
            detail,
        )
        return JSONResponse(status_code=exc.status_code, content={"detail": exc.detail})

    @application.exception_handler(Exception)
    async def unhandled_exception_handler(request: Request, exc: Exception):
        finance_logger.exception(
            "unhandled_error method=%s path=%s exc_type=%s",
            request.method,
            request.url.path,
            type(exc).__name__,
        )
        return JSONResponse(
            status_code=500, content={"error": "Internal server error", "code": 500}
        )

    @application.exception_handler(RequestValidationError)
    async def validation_error(request: Request, exc: RequestValidationError):
        path = request.url.path
        if path.startswith("/travel"):
            return validation_response(exc)
        if path.startswith("/media"):
            return JSONResponse(
                status_code=422, content={"detail": "Check the form and try again."}
            )
        return await request_validation_exception_handler(request, exc)

    @application.middleware("http")
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
                status_code=500,
                content={"detail": "Internal server error", "request_id": request_id},
            )
        REQUESTS.labels(method, str(response.status_code)).inc()
        LATENCY.labels(method).observe(time.monotonic() - started)
        response.headers["X-Request-ID"] = request_id
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

    @application.get("/metrics")
    def metrics():
        return Response(generate_latest(), headers={"Content-Type": CONTENT_TYPE_LATEST})

    @application.get("/health/live")
    def live():
        return {"status": "ok", "release": release}

    @application.get("/health/ready")
    def ready():
        try:
            with database.engine.connect() as connection:
                assert_ready(connection)
                for table in ("users", "encrypted_records", "trips", "user_entries"):
                    connection.execute(text(f"SELECT id FROM {table} LIMIT 1"))
        except Exception:
            return JSONResponse(
                status_code=503, content={"status": "unavailable", "release": release}
            )
        return {"status": "ok", "release": release}

    register_finance(application)
    register_travel(application)
    register_media(application)

    @application.api_route(
        "/api/{path:path}",
        methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "HEAD"],
        include_in_schema=False,
    )
    def unknown_api(path: str):
        # Retired finance paths stay 404. A later GET catch-all would otherwise
        # answer POST with 405.
        return JSONResponse(
            status_code=404,
            content={"detail": "Not found"},
            headers={"Cache-Control": "no-store"},
        )

    @application.get("/")
    def home():
        return FileResponse(portfolio_root / "index.html", headers=_shell_headers())

    @application.get("/api")
    def api_slash():
        return RedirectResponse("/api/", status_code=308)

    @application.get("/finance")
    def finance_slash():
        return RedirectResponse("/finance/", status_code=308)

    @application.api_route(
        "/finance/api/{path:path}",
        methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "HEAD"],
    )
    async def legacy_api(path: str, request: Request):
        return RedirectResponse(
            "/api/" + path + ("?" + request.url.query if request.url.query else ""),
            status_code=308,
        )

    @application.get("/finance/login")
    @application.get("/finance/auth/login")
    @application.get("/finance/signup")
    @application.get("/finance/auth/signup")
    @application.get("/finance/enroll")
    def legacy_login(request: Request):
        destination = (
            "/auth/signup" if request.url.path.endswith(("signup", "enroll")) else "/auth/login"
        )
        return RedirectResponse(
            destination + ("?" + request.url.query if request.url.query else ""), status_code=302
        )

    def shell():
        return FileResponse(web_root / "index.html", headers=_shell_headers())

    @application.get("/finance/{path:path}")
    def finance_page(path: str):
        file = (web_root / path).resolve()
        if not file.is_relative_to(web_root):
            return JSONResponse(status_code=404, content={"detail": "Not found"})
        if path and file.is_file():
            immutable = bool(re.search(r"-[A-Za-z0-9_-]{8}\.(js|css)$", file.name))
            return FileResponse(file, headers=_static_headers(file, web_root, immutable))
        if path and (Path(path).suffix or path.startswith("assets/")):
            return JSONResponse(
                status_code=404,
                content={"detail": "Not found"},
                headers={"Cache-Control": "no-store"},
            )
        return shell()

    register_hub_media_redirects(application)

    @application.get("/hub")
    @application.get("/hub/")
    @application.get("/hub/admin")
    @application.get("/auth/login")
    @application.get("/auth/signup")
    def shared_shell():
        return shell()

    @application.get("/auth")
    @application.get("/auth/")
    def login():
        return RedirectResponse("/auth/login", status_code=302)

    @application.get("/auth/enroll")
    def enroll(request: Request):
        return RedirectResponse(
            "/auth/signup" + ("?" + request.url.query if request.url.query else ""),
            status_code=302,
        )

    @application.post("/csp-report")
    async def csp_report_route(request: Request):
        return await csp_report(request)

    @application.get("/{path:path}")
    def portfolio_page(path: str):
        file = (portfolio_root / path).resolve()
        if not file.is_relative_to(portfolio_root):
            return JSONResponse(status_code=404, content={"detail": "Not found"})
        if file.is_file():
            immutable = bool(re.search(r"-[A-Za-z0-9_-]{8}\.(js|css)$", file.name))
            return FileResponse(file, headers=_static_headers(file, portfolio_root, immutable))
        if path in {"home", "work", "about", "secrets"}:
            return FileResponse(portfolio_root / "index.html", headers=_shell_headers())
        return JSONResponse(
            status_code=404, content={"detail": "Not found"}, headers={"Cache-Control": "no-store"}
        )

    origins = [
        item.strip()
        for item in os.getenv("CORS_ORIGINS", "http://localhost:4200,http://127.0.0.1:4200").split(
            ","
        )
        if item.strip()
    ]
    # Last added is outermost. Outer to inner: security, API key, rate limit, CORS, observe.
    application.add_middleware(
        CORSMiddleware,
        allow_origins=origins,
        allow_credentials=True,
        allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
        allow_headers=["Content-Type", "Authorization", "X-API-Key", "X-CSRF-Token"],
    )
    application.add_middleware(RateLimitMiddleware)
    application.add_middleware(ApiKeyMiddleware)
    application.add_middleware(SecurityHeadersMiddleware)

    if dependencies.principal is not None:
        pinned = dependencies.principal
        application.dependency_overrides[require_principal] = lambda: pinned
    return application


def _bootstrap() -> FastAPI | None:
    if not os.environ.get("SITE_DATABASE_URL"):
        return None
    os.environ["LOCAL_DEV_AUTH"] = "0"
    return create_app(Settings.from_environ())


app = cast(FastAPI, _bootstrap())
