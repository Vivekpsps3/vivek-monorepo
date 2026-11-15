"""Serve the single built Angular app, its public prerenders, and known aliases."""

from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any

from fastapi import FastAPI, Request
from fastapi.responses import FileResponse, JSONResponse, RedirectResponse

from apps.server.security_headers import SHELL_HEADER

ROUTES = json.loads((Path(__file__).resolve().parents[1] / "web/routes.json").read_text())


def document_kind(routes: dict[str, Any], normalized: str) -> str:
    """Classify a slash-stripped path as alias, public, private, or missing.

    Alias wins over a document pattern. This is the document handler's
    decision; it does not change CSP or auth classification.
    """
    if normalized in routes["aliases"]:
        return "alias"
    if normalized in routes["public"]:
        return "public"
    if any(re.fullmatch(pattern, normalized) for pattern in routes["private"]):
        return "private"
    return "missing"


def register_frontend(application: FastAPI, web_root: Path) -> None:
    web_root = web_root.resolve()

    @application.api_route("/{path:path}", methods=["GET", "HEAD"], include_in_schema=False)
    def page(path: str, request: Request):
        normalized = path.strip("/")
        kind = document_kind(ROUTES, normalized)
        if kind == "alias":
            alias = ROUTES["aliases"][normalized]
            query = f"?{request.url.query}" if request.url.query else ""
            return RedirectResponse(f"/{alias}{query}", status_code=308)
        file = (web_root / path).resolve()
        if not file.is_relative_to(web_root):
            return JSONResponse(status_code=404, content={"detail": "Not found"})
        if file.is_file() and file.suffix != ".html":
            immutable = bool(re.search(r"-[A-Za-z0-9_-]{8}\.(?:js|css)$", file.name))
            return FileResponse(
                file,
                headers={
                    "Cache-Control": "public, max-age=31536000, immutable"
                    if immutable
                    else "no-cache",
                },
            )
        if kind == "public":
            document = web_root / normalized / "index.html"
        elif kind == "private":
            document = web_root / "index.csr.html"
        else:
            return JSONResponse(
                status_code=404,
                content={"detail": "Not found"},
                headers={"Cache-Control": "no-store"},
            )
        if not document.is_file():
            return JSONResponse(
                status_code=503,
                content={"detail": "The workspace is updating. Try again shortly."},
                headers={"Cache-Control": "no-store"},
            )
        return FileResponse(document, headers={"Cache-Control": "no-store", SHELL_HEADER: "1"})
