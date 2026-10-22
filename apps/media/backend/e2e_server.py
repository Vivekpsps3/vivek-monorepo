"""Local Media server for Phase 0 browser tests.

Uses a temporary database and a synthetic user. It does not talk to production
or to any real account.
"""

import os
from pathlib import Path

from fastapi import FastAPI
from fastapi.responses import RedirectResponse
from fastapi.testclient import TestClient


def main() -> None:
    root = Path(os.environ.get("MEDIA_E2E_ROOT", "/tmp/media-p0-e2e"))
    root.mkdir(parents=True, exist_ok=True)
    database = root / "media.db"
    if database.exists():
        database.unlink()
    os.environ["MEDIA_DATABASE_URL"] = f"sqlite:///{database}"
    os.environ["MEDIA_MOUNT_PATH"] = "/media"
    os.environ.pop("MEDIA_TODAY", None)

    from apps.media.backend.app import create_app
    from apps.media.backend.deps import AuthResult, Principal

    media = create_app(unified=True)
    media.state.principal_checker = lambda _request: AuthResult(
        Principal(1, "synthetic", "Synthetic Reader"),
        [],
    )
    with TestClient(media) as client:
        for title, creator, year in (
            ("Dune", "Frank Herbert", 1965),
            ("Alpha", "Ann", 1999),
            ("Zebra", "Zoe", 2001),
        ):
            created = client.post("/api/library", json={
                "kind": "book",
                "title": title,
                "creator": creator,
                "year": year,
                "status": "in_progress" if title == "Dune" else "want",
                "review": "Server note" if title == "Dune" else None,
            })
            if created.status_code != 200:
                raise RuntimeError(created.text)

    parent = FastAPI()

    def hub_media_redirect():
        # Same destinations as apps.server.redirects, without a cross-app import.
        return RedirectResponse("/media/", status_code=302)

    parent.add_api_route("/hub/media", hub_media_redirect, methods=["GET"])
    parent.add_api_route("/hub/media/", hub_media_redirect, methods=["GET"])
    parent.add_api_route("/hub/media/{rest:path}", hub_media_redirect, methods=["GET"])
    parent.mount("/media", media)

    import uvicorn
    uvicorn.run(parent, host="127.0.0.1", port=int(os.environ.get("MEDIA_E2E_PORT", "8097")), log_level="warning")


if __name__ == "__main__":
    main()
