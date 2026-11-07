"""World package: register_world mounts the world router under /api."""

from __future__ import annotations

from fastapi import FastAPI

from apps.server.world.routes import router

__all__ = ["register_world"]


def register_world(application: FastAPI) -> None:
    application.include_router(router, prefix="/api")
