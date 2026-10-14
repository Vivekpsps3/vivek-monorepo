"""Travel app: trips, calendar, maps, and a secondary PTO projection."""

import hashlib
import hmac
from contextlib import asynccontextmanager
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from database import init_db
from deps import access_token
from routers import board, integrations, pto, trips

BACKEND_DIR = Path(__file__).resolve().parent
STATIC_DIR = BACKEND_DIR / "static"
REPO_ROOT = BACKEND_DIR.parents[2]


def tokens_path() -> Path:
    bundled = STATIC_DIR / "tokens.css"
    if bundled.is_file():
        return bundled
    return REPO_ROOT / "packages" / "ui" / "tokens.css"


def _digest(value: str) -> bytes:
    return hashlib.sha256(value.encode("utf-8")).digest()


def _authorized(request: Request) -> bool:
    expected = access_token()
    if not expected:
        return True
    header = request.headers.get("authorization", "")
    cookie = request.cookies.get("travel_access", "")
    supplied = ""
    if header.lower().startswith("bearer "):
        supplied = header[7:].strip()
    elif cookie:
        supplied = cookie
    if not supplied:
        return False
    return hmac.compare_digest(_digest(supplied), _digest(expected))


@asynccontextmanager
async def lifespan(_app: FastAPI):
    init_db()
    yield


def create_app() -> FastAPI:
    load_dotenv()
    application = FastAPI(title="Travel", version="0.1.0", lifespan=lifespan)

    @application.middleware("http")
    async def lan_lock(request: Request, call_next):
        if not access_token():
            return await call_next(request)
        path = request.url.path
        if path in ("/api/health", "/api/session", "/api/session/logout"):
            return await call_next(request)
        if path.startswith("/static/") or path in ("/tokens.css", "/favicon.svg"):
            return await call_next(request)
        if path.startswith("/api/") and not _authorized(request):
            return JSONResponse(status_code=401, content={"detail": "This travel app is locked."})
        return await call_next(request)

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
        return FileResponse(page, headers={"Cache-Control": "no-cache"})

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
