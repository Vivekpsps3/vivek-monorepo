"""Local Media server for Phase 0 browser tests.

Uses a temporary database and a synthetic user. It does not talk to production
or to any real account. This module stays out of the production image.
"""

import base64
import os
from pathlib import Path

from fastapi import FastAPI
from fastapi.responses import Response
from fastapi.testclient import TestClient

# 80x80 synthetic cover. The screenshot matrix uses it as album art.
COVER = base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAFAAAABQCAYAAACOEfKtAAABg0lEQVR42u3duw0CQRRDURdChIgphBqISOmHirYYugCJAAnx3UUa2+85mBjt0dxwDKb97rLknKfT7LM9Hmaf1Wa96Iz6Joz6oZGAIy8FlG/fSMCllwLJ979vQvI1AKyarzSgQ76zAZMvAbByvrKALvnOAky+BMDq+UoCOuX7M2DyJQB2yFcO0C3fnwCTLwGwS75SgI75fgVMvgTATvnKALrm+xEw+RIAu+UrAeic71vA5EsA7JgvHdA935eAyZcA2DVfKmCFfJ8Aky8BsHO+NMAq+T4AJl8CYPd8KYCV8r0DJl8CYPIlAFbL9waYfAmAyZcAWDFfeUCHZ2hIvgaAVfOVBnR5RYrkKw5YOV9ZQKdH4Ei+woDV85UEdNtwQPIVBeyQrxyg4wQLkq8gYJd8pQBdF5SQfMUAO+UrA+g8gIbkKwTYLV8JQPf9QiRfEcCO+dIBK8yPIvkKAHbNlwpYZT0YyZcM2DlfGmCl8W8kXyJg93wpgNW2+5F8SYDJlwBY8a83rlopED1+D5lxAAAAAElFTkSuQmCC"
)


def main() -> None:
    root = Path(os.environ.get("MEDIA_E2E_ROOT", "/tmp/media-p0-e2e"))
    root.mkdir(parents=True, exist_ok=True)
    database = root / "media.db"
    if database.exists():
        database.unlink()
    os.environ["MEDIA_DATABASE_URL"] = f"sqlite:///{database}"
    os.environ.pop("MEDIA_TODAY", None)

    from apps.media.backend.app import create_app
    from apps.media.backend.deps import AuthResult, Principal
    from apps.server.redirects import register_hub_media_redirects

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
            created = client.post(
                "/api/library",
                json={
                    "kind": "book",
                    "title": title,
                    "creator": creator,
                    "year": year,
                    "status": "in_progress" if title == "Dune" else "want",
                    "review": "Server note" if title == "Dune" else None,
                },
            )
            if created.status_code != 200:
                raise RuntimeError(created.text)

    parent = FastAPI()
    register_hub_media_redirects(parent)

    @parent.get("/synthetic-cover.png")
    def synthetic_cover():
        return Response(COVER, media_type="image/png")

    parent.mount("/media", media)

    import uvicorn

    uvicorn.run(
        parent,
        host="127.0.0.1",
        port=int(os.environ.get("MEDIA_E2E_PORT", "8097")),
        log_level="warning",
    )


if __name__ == "__main__":
    main()
