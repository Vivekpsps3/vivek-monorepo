import logging
import os
from contextlib import asynccontextmanager

from dotenv import load_dotenv

if not os.getenv("SITE_DATABASE_URL"):
    load_dotenv()

from apps.finance.backend.local_dev import load_dev_env_file

if not os.getenv("SITE_DATABASE_URL"):
    load_dev_env_file()

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from apps.finance.backend.api_auth import ApiKeyMiddleware
from apps.finance.backend.logging_config import (
    get_logger,
    redact_database_url,
    setup_logging,
    uvicorn_log_config,
)
from apps.finance.backend.rate_limit import RateLimitMiddleware
from apps.finance.backend.request_logging import RequestLoggingMiddleware
from apps.finance.backend.routers import account, auth_routes, health, market, vault

setup_logging()
logger = get_logger()

CORS_ORIGINS = [
    o.strip()
    for o in os.getenv("CORS_ORIGINS", "http://localhost:4200,http://127.0.0.1:4200").split(",")
    if o.strip()
]


@asynccontextmanager
async def lifespan(app: FastAPI):
    from apps.finance.backend.database import SQLALCHEMY_DATABASE_URL, init_database

    init_database()
    logger.info(
        "startup version=2.0.0 database=%s cors_origins=%s price_cache_ttl_s=%s eod_cache_hours=%s",
        redact_database_url(SQLALCHEMY_DATABASE_URL),
        CORS_ORIGINS,
        int(os.getenv("PRICE_CACHE_TTL", "120")),
        int(os.getenv("EOD_CACHE_HOURS", "24")),
    )
    yield
    logger.info("shutdown complete")


def create_app() -> FastAPI:
    disable_openapi = os.getenv("DISABLE_OPENAPI", "").lower() in ("1", "true", "yes")
    application = FastAPI(
        title="Finance Tracker API",
        version="2.0.0",
        lifespan=lifespan,
        docs_url=None if disable_openapi else "/docs",
        redoc_url=None if disable_openapi else "/redoc",
        openapi_url=None if disable_openapi else "/openapi.json",
    )

    application.add_middleware(
        CORSMiddleware,
        allow_origins=CORS_ORIGINS,
        allow_credentials=True,
        allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
        allow_headers=["Content-Type", "Authorization", "X-API-Key", "X-CSRF-Token"],
    )
    application.add_middleware(RateLimitMiddleware)
    application.add_middleware(ApiKeyMiddleware)
    application.add_middleware(RequestLoggingMiddleware)

    @application.exception_handler(HTTPException)
    async def log_http_exception(request: Request, exc: HTTPException):
        detail = exc.detail if isinstance(exc.detail, str) else str(exc.detail)
        logger.log(
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
        logger.exception(
            "unhandled_error method=%s path=%s exc_type=%s",
            request.method,
            request.url.path,
            type(exc).__name__,
        )
        return JSONResponse(
            status_code=500, content={"error": "Internal server error", "code": 500}
        )

    api_prefix = "/api"
    application.include_router(health.router, prefix=api_prefix)
    application.include_router(auth_routes.router, prefix=api_prefix)
    application.include_router(account.router, prefix=api_prefix)
    application.include_router(vault.router, prefix=api_prefix)
    application.include_router(market.router, prefix=api_prefix)

    return application


app = create_app()

__all__ = ["app", "create_app", "uvicorn_log_config"]
