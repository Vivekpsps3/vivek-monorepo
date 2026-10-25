"""Media routes and shell. The site factory is the only app."""

from pathlib import Path

from fastapi import Depends, FastAPI, Request
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy import text
from sqlalchemy.orm import Session

from apps.media.backend.routers import journal
from apps.server.database import get_db

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


def register_media(application: FastAPI) -> None:
    @application.get("/media/api/health")
    def health(db: Session = Depends(get_db)):
        try:
            db.execute(text("SELECT id FROM user_entries LIMIT 1"))
        except Exception:
            db.rollback()
            return JSONResponse(status_code=503, content={"status": "unavailable", "app": "media"})
        return {"status": "ok", "app": "media"}

    application.include_router(journal.router, prefix="/media/api")

    if STATIC_DIR.is_dir():
        application.mount("/media/static", StaticFiles(directory=STATIC_DIR), name="media-static")
    if SHARED_BROWSER_DIR.is_dir():
        application.mount(
            "/media/shared-browser",
            StaticFiles(directory=SHARED_BROWSER_DIR),
            name="media-shared-browser",
        )

    @application.get("/media/tokens.css")
    def tokens():
        return stylesheet_response("tokens.css", "Theme tokens are missing.")

    @application.get("/media/controls.css")
    def controls():
        return stylesheet_response("controls.css", "Shared controls are missing.")

    @application.get("/media/favicon.svg")
    def favicon():
        icon = STATIC_DIR / "favicon.svg"
        if not icon.is_file():
            return JSONResponse(status_code=404, content={"detail": "Missing icon."})
        return FileResponse(icon, media_type="image/svg+xml")

    def index(_request: Request):
        page = STATIC_DIR / "index.html"
        if not page.is_file():
            return JSONResponse(status_code=404, content={"detail": "Media UI is not built."})
        html = page.read_text(encoding="utf-8").replace("__MEDIA_ROOT__", "/media")
        return HTMLResponse(html, headers={"Cache-Control": "no-cache", "x-csp-shell": "1"})

    application.add_api_route("/media", index, methods=["GET", "HEAD"], include_in_schema=False)
    application.add_api_route("/media/", index, methods=["GET", "HEAD"], include_in_schema=False)

    def screen_redirect(screen: str, request: Request):
        name = screen.strip().strip("/").lower()
        if not name or "." in name or "/" in name:
            return JSONResponse(
                status_code=404,
                content={"detail": "Not found"},
                headers={"Cache-Control": "no-store"},
            )
        query = f"?{request.url.query}" if request.url.query else ""
        return RedirectResponse(f"/media/#/{name}{query}", status_code=302)

    # One segment under /media. Registered after mounts and files so /media/static is a mount.
    application.add_api_route(
        "/media/{screen}", screen_redirect, methods=["GET", "HEAD"], include_in_schema=False
    )
    application.add_api_route(
        "/media/{screen}/", screen_redirect, methods=["GET", "HEAD"], include_in_schema=False
    )
