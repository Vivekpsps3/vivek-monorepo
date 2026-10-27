"""Finance routers. The site factory registers them; this module does not build an app."""

from fastapi import FastAPI

from apps.finance.backend.logging_config import setup_logging, uvicorn_log_config
from apps.finance.backend.routers import health, market, vault

setup_logging()


def register_finance(application: FastAPI) -> None:
    application.include_router(health.router, prefix="/api")
    application.include_router(vault.router, prefix="/api")
    application.include_router(market.router, prefix="/api")


__all__ = ["register_finance", "uvicorn_log_config"]
