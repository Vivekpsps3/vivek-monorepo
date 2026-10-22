"""Entry redirects into the Media journal."""

from fastapi import FastAPI
from fastapi.responses import RedirectResponse


def hub_media_redirect():
    return RedirectResponse("/media/", status_code=302)


def register_hub_media_redirects(app: FastAPI) -> None:
    app.add_api_route("/hub/media", hub_media_redirect, methods=["GET"])
    app.add_api_route("/hub/media/", hub_media_redirect, methods=["GET"])
    app.add_api_route("/hub/media/{rest:path}", hub_media_redirect, methods=["GET"])
