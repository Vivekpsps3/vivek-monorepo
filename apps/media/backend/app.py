"""Private media journal. Personal rows require the finance session."""

import os
from contextlib import asynccontextmanager
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

import deps
from database import init_db
from deps import actor
from routers import journal

BACKEND_DIR = Path(__file__).resolve().parent
STATIC_DIR = BACKEND_DIR / "static"
REPO_ROOT = BACKEND_DIR.parents[2] if len(BACKEND_DIR.parents) > 2 else BACKEND_DIR


def shared_stylesheet(name: str) -> Path:
    bundled = STATIC_DIR / name
    if bundled.is_file():
        return bundled
    return REPO_ROOT / "packages" / "ui" / name


def stylesheet_response(name: str, missing: str):
    path = shared_stylesheet(name)
    if not path.is_file():
        return JSONResponse(status_code=404, content={"detail": missing})
    return FileResponse(path, media_type="text/css", headers={"Cache-Control": "no-cache"})


def mount_path() -> str:
    return os.getenv("MEDIA_MOUNT_PATH", "").rstrip("/")


def _open_path(path: str) -> bool:
    return path in ("/api/health", "/tokens.css", "/controls.css", "/favicon.svg") or path.startswith("/static/")


@asynccontextmanager
async def lifespan(_app: FastAPI):
    init_db()
    yield


def create_app() -> FastAPI:
    load_dotenv()
    application = FastAPI(title="Media", version="0.1.0", lifespan=lifespan)
    application.state.principal_checker = None

    @application.middleware("http")
    async def finance_session(request: Request, call_next):
        if not request.url.path.startswith("/api/"):
            return await call_next(request)
        result = None
        token = None
        if not _open_path(request.url.path):
            checker = request.app.state.principal_checker
            try:
                result = await deps.check_principal(request, checker)
            except HTTPException as exc:
                return JSONResponse(
                    status_code=exc.status_code,
                    content={"detail": exc.detail},
                    headers={"Cache-Control": "no-store, private"},
                )
            token = actor.set(result.principal)
        try:
            response = await call_next(request)
        finally:
            if token is not None:
                actor.reset(token)
        if result is not None:
            for cookie in result.cookies:
                response.headers.append("set-cookie", cookie)
        response.headers["cache-control"] = "no-store, private"
        return response

    @application.exception_handler(RequestValidationError)
    async def validation_error(_request: Request, exc: RequestValidationError):
        return JSONResponse(status_code=422, content={"detail": "Check the form and try again."})

    @application.get("/api/health")
    def health():
        return {"status": "ok", "app": "media"}

    application.include_router(journal.router, prefix="/api")

    if STATIC_DIR.is_dir():
        application.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")

    @application.get("/tokens.css")
    def tokens():
        return stylesheet_response("tokens.css", "Theme tokens are missing.")

    @application.get("/controls.css")
    def controls():
        return stylesheet_response("controls.css", "Shared controls are missing.")

    @application.get("/favicon.svg")
    def favicon():
        icon = STATIC_DIR / "favicon.svg"
        if not icon.is_file():
            return JSONResponse(status_code=404, content={"detail": "Missing icon."})
        return FileResponse(icon, media_type="image/svg+xml")

    @application.get("/")
    def index():
        page = STATIC_DIR / "index.html"
        if not page.is_file():
            return JSONResponse(status_code=404, content={"detail": "Media UI is not built."})
        html = page.read_text(encoding="utf-8").replace("__MEDIA_ROOT__", mount_path())
        return HTMLResponse(html, headers={"Cache-Control": "no-cache"})

    return application
