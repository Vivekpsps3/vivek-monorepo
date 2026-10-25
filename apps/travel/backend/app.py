"""Travel routes and shell. The site factory is the only app."""

from pathlib import Path

from fastapi import Depends, FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy import text
from sqlalchemy.orm import Session

from apps.server.database import get_db
from apps.travel.backend.routers import board, integrations, pto, trips

BACKEND_DIR = Path(__file__).resolve().parent
STATIC_DIR = BACKEND_DIR / "static"
REPO_ROOT = BACKEND_DIR.parents[2] if len(BACKEND_DIR.parents) > 2 else BACKEND_DIR
SHARED_BROWSER_DIR = REPO_ROOT / "packages" / "browser" / "runtime"
if not SHARED_BROWSER_DIR.is_dir():
    SHARED_BROWSER_DIR = BACKEND_DIR / "shared-browser"


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


def validation_response(exc: RequestValidationError) -> JSONResponse:
    messages = []
    for err in exc.errors():
        msg = err.get("msg", "Check this field.")
        prefix = "Value error, "
        if isinstance(msg, str) and msg.startswith(prefix):
            msg = msg[len(prefix) :]
        loc = [str(item) for item in err.get("loc", []) if item not in ("body", "query")]
        messages.append(f"{' / '.join(loc)}: {msg}" if loc else str(msg))
    detail = " ".join(messages) or "Check the form and try again."
    return JSONResponse(status_code=422, content={"detail": detail})


def register_travel(application: FastAPI) -> None:
    @application.get("/travel/api/health")
    def health(db: Session = Depends(get_db)):
        try:
            db.execute(text("SELECT id FROM trips LIMIT 1"))
        except Exception:
            db.rollback()
            return JSONResponse(status_code=503, content={"status": "unavailable", "app": "travel"})
        return {"status": "ok", "app": "travel"}

    application.include_router(board.router, prefix="/travel/api")
    application.include_router(trips.router, prefix="/travel/api")
    application.include_router(pto.router, prefix="/travel/api")
    application.include_router(integrations.router, prefix="/travel/api")

    if STATIC_DIR.is_dir():
        application.mount("/travel/static", StaticFiles(directory=STATIC_DIR), name="travel-static")
    if SHARED_BROWSER_DIR.is_dir():
        application.mount(
            "/travel/shared-browser",
            StaticFiles(directory=SHARED_BROWSER_DIR),
            name="travel-shared-browser",
        )

    def index(_request: Request):
        page = STATIC_DIR / "index.html"
        if not page.is_file():
            return JSONResponse(status_code=404, content={"detail": "Travel UI is not built."})
        html = page.read_text(encoding="utf-8").replace("__TRAVEL_ROOT__", "/travel")
        return HTMLResponse(html, headers={"Cache-Control": "no-cache", "x-csp-shell": "1"})

    application.add_api_route("/travel", index, methods=["GET", "HEAD"], include_in_schema=False)
    application.add_api_route("/travel/", index, methods=["GET", "HEAD"], include_in_schema=False)

    @application.get("/travel/tokens.css")
    def tokens():
        return stylesheet_response("tokens.css", "Design tokens are missing.")

    @application.get("/travel/controls.css")
    def controls():
        return stylesheet_response("controls.css", "Shared controls are missing.")

    @application.get("/travel/favicon.svg")
    def favicon():
        icon = STATIC_DIR / "favicon.svg"
        if not icon.is_file():
            return JSONResponse(status_code=404, content={"detail": "No icon."})
        return FileResponse(icon, media_type="image/svg+xml")
