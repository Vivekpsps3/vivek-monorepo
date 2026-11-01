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

from fastapi import APIRouter, FastAPI, HTTPException, Request
from fastapi.exception_handlers import request_validation_exception_handler
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, RedirectResponse
from prometheus_client import CONTENT_TYPE_LATEST, Counter, Histogram, generate_latest
from sqlalchemy import text
from starlette.requests import ClientDisconnect
from starlette.responses import Response

from apps.server.api_key import ApiKeyMiddleware
from apps.server.auth import Principal, require_principal
from apps.server.database import Database, database_url, open_database
from apps.server.errors import APIError
from apps.server.frontend import register_frontend
from apps.server.rate_limit import RateLimitMiddleware
from apps.server.schema import assert_ready
from apps.server.security_headers import SecurityHeadersMiddleware, csp_report
from apps.server.town import router as town_router

logger = logging.getLogger("site")
# Module-level so a second create_app does not re-register the same series.
REQUESTS = Counter("site_requests_total", "HTTP requests", ["method", "status"])
LATENCY = Histogram("site_request_duration_seconds", "Request latency", ["method"])


@dataclass(frozen=True)
class Settings:
    database_url: str
    release: str
    web_root: Path
    openapi: bool = False

    @staticmethod
    def from_environ() -> Settings:
        return Settings(
            database_url=database_url(),
            release=os.environ.get("SITE_RELEASE", "development"),
            web_root=Path(os.environ.get("SITE_WEB_ROOT", "/app/web")).resolve(),
        )


@dataclass(frozen=True)
class Dependencies:
    """Optional test seams. Production uses the defaults and Settings.from_environ."""

    database: Database | None = None
    principal: Principal | None = None
    check_schema: bool = True
    check_frontend: bool = True
    test_router: APIRouter | None = None


def _prepare_included_matchers(application: FastAPI) -> None:
    # FastAPI 0.159 analyzes included-route dependants on the first request
    # that walks each router, then caches them. The media search timing test
    # measures that first request; under coverage the analysis plus the
    # parallel provider calls exceeds its limit. Later routes do not invalidate
    # a matcher's cache unless that router's own routes change.
    for route in application.router.routes:
        prepare = getattr(route, "effective_candidates", None)
        if callable(prepare):
            prepare()


def create_app(settings: Settings, dependencies: Dependencies | None = None) -> FastAPI:
    """One factory. Callers pass the engine and any pinned principal. Import builds nothing."""
    from apps.finance.backend.app import register_finance
    from apps.finance.backend.logging_config import get_logger, setup_logging
    from apps.media.backend.app import register_media
    from apps.travel.backend.app import register_travel, validation_response

    setup_logging()
    finance_logger = get_logger()
    dependencies = dependencies or Dependencies()
    database = dependencies.database or open_database(settings.database_url)

    web_root = settings.web_root
    release = settings.release

    @asynccontextmanager
    async def lifespan(_app: FastAPI):
        try:
            # Migrations stay offline; injected engines belong to their caller.
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
                    (web_root / page).is_file()
                    for page in (
                        "index.html",
                        "index.csr.html",
                        "home/index.html",
                        "work/index.html",
                        "about/index.html",
                        "secrets/index.html",
                    )
                ):
                    raise RuntimeError("Site frontend is missing")
            yield
        finally:
            if dependencies.database is None:
                database.engine.dispose()

    application = FastAPI(
        title="Personal site",
        lifespan=lifespan,
        docs_url=None if not settings.openapi else "/docs",
        redoc_url=None if not settings.openapi else "/redoc",
        openapi_url=None if not settings.openapi else "/openapi.json",
    )
    application.state.database = database

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

    @application.exception_handler(APIError)
    async def api_error_handler(request: Request, exc: APIError):
        finance_logger.log(
            logging.ERROR if exc.status_code >= 500 else logging.WARNING,
            "api_error method=%s path=%s status=%s code=%s",
            request.method,
            request.url.path,
            exc.status_code,
            exc.code,
        )
        headers = {}
        if exc.retry_after is not None:
            headers["Retry-After"] = str(exc.retry_after)
        return JSONResponse(
            status_code=exc.status_code,
            content={
                "code": exc.code,
                "message": exc.message,
                "detail": exc.message,
                "field_errors": exc.field_errors,
                "retry_after": exc.retry_after,
                "request_id": getattr(request.state, "request_id", None),
            },
            headers=headers,
        )

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
        request.state.request_id = request_id
        method = (
            request.method
            if request.method in {"GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "HEAD"}
            else "OTHER"
        )
        started = time.monotonic()
        try:
            response = await call_next(request)
        except ClientDisconnect:
            logger.info("client_disconnect request_id=%s", request_id)
            response = Response(status_code=499)
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

    from apps.server.identity import account, birthday
    from apps.server.identity import routes as identity_routes

    application.include_router(identity_routes.router, prefix="/api")
    application.include_router(account.router, prefix="/api")
    application.include_router(birthday.router, prefix="/api")
    register_finance(application)
    register_travel(application)
    register_media(application)
    application.include_router(town_router.router, prefix="/api")
    if dependencies.test_router is not None:
        application.include_router(dependencies.test_router)

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

    @application.post("/csp-report")
    async def csp_report_route(request: Request):
        return await csp_report(request)

    register_frontend(application, web_root)

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
    _prepare_included_matchers(application)
    return application


def production_app() -> FastAPI:
    """Uvicorn factory. Importing this module never opens a database."""
    os.environ["LOCAL_DEV_AUTH"] = "0"
    return create_app(Settings.from_environ())
