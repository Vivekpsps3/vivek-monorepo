"""Entry redirects into the Media journal."""

from fastapi import FastAPI, Request
from fastapi.responses import RedirectResponse

JOURNAL_SCREENS = {"library", "search", "calendar", "new"}


def hub_media_location(rest: str = "", query: str = "") -> str:
    """Known screens keep their hash route and query. Anything else opens the journal."""
    name = rest.strip().strip("/").lower()
    if name in JOURNAL_SCREENS:
        extra = f"?{query}" if query else ""
        return f"/media/#/{name}{extra}"
    return "/media/"


def register_hub_media_redirects(app: FastAPI) -> None:
    def redirect(request: Request, rest: str = ""):
        return RedirectResponse(hub_media_location(rest, request.url.query), status_code=302)

    for path in ("/hub/media", "/hub/media/", "/hub/media/{rest:path}"):
        app.add_api_route(path, redirect, methods=["GET", "HEAD"])
