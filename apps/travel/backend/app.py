"""Travel app: trips, calendar, maps, and a secondary PTO projection."""

import os
from contextlib import asynccontextmanager
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from database import init_db
from deps import actor
import deps
from routers import board, integrations, pto, trips

BACKEND_DIR = Path(__file__).resolve().parent
STATIC_DIR = BACKEND_DIR / "static"
REPO_ROOT = BACKEND_DIR.parents[2]


def tokens_path() -> Path:
    bundled = STATIC_DIR / "tokens.css"
    if bundled.is_file():
        return bundled
    return REPO_ROOT / "packages" / "ui" / "tokens.css"


def mount_path() -> str:
    return os.getenv("TRAVEL_MOUNT_PATH", "").rstrip("/")


def _open_path(path: str) -> bool:
    if path in ("/api/health", "/tokens.css", "/favicon.svg"):
        return True
    return path.startswith("/static/")


@asynccontextmanager
async def lifespan(_app: FastAPI):
    init_db()
    yield


def create_app() -> FastAPI:
    load_dotenv()
    application = FastAPI(title="Travel", version="0.1.0", lifespan=lifespan)
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
                result = checker(request) if checker is not None else deps.fetch_principal(request)
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
        messages = []
        for err in exc.errors():
            msg = err.get("msg", "Check this field.")
            prefix = "Value error, "
            if isinstance(msg, str) and msg.startswith(prefix):
                msg = msg[len(prefix) :]
            loc = [str(item) for item in err.get("loc", []) if item not in ("body", "query")]
            messages.append(f"{' / '.join(loc)}: {msg}" if loc else str(msg))
        text = " ".join(messages) or "Check the form and try again."
        return JSONResponse(status_code=422, content={"detail": text})

    @application.get("/api/health")
    def health():
        return {"status": "ok", "app": "travel"}

    application.include_router(board.router, prefix="/api")
    application.include_router(trips.router, prefix="/api")
    application.include_router(pto.router, prefix="/api")
    application.include_router(integrations.router, prefix="/api")

    if STATIC_DIR.is_dir():
        application.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")

    @application.get("/")
    def index():
        page = STATIC_DIR / "index.html"
        if not page.is_file():
            return JSONResponse(status_code=404, content={"detail": "Travel UI is not built."})
        html = page.read_text(encoding="utf-8").replace("__TRAVEL_ROOT__", mount_path())
        return HTMLResponse(html, headers={"Cache-Control": "no-cache"})

    @application.get("/tokens.css")
    def tokens():
        path = tokens_path()
        if not path.is_file():
            return JSONResponse(status_code=404, content={"detail": "Design tokens are missing."})
        return FileResponse(path, media_type="text/css", headers={"Cache-Control": "no-cache"})

    @application.get("/favicon.svg")
    def favicon():
        icon = STATIC_DIR / "favicon.svg"
        if not icon.is_file():
            return JSONResponse(status_code=404, content={"detail": "No icon."})
        return FileResponse(icon, media_type="image/svg+xml")

    return application
