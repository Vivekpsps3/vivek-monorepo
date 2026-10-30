"""Production server composition with a disposable database and deterministic fixtures.

Only browser tests invoke this file. The production image does not copy tests/.
"""

from __future__ import annotations

import argparse
import base64
import os
import tempfile
from datetime import timedelta
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import Response

from apps.media.backend.models import Base as MediaBase
from apps.server.auth import Principal
from apps.server.database import get_db, open_database
from apps.server.identity.models import User, UserSession
from apps.server.identity.session import _hash_secret, get_current_user, utc_now_naive
from apps.server.main import Dependencies, Settings, create_app
from apps.server.migrations import adopt_or_upgrade
from apps.server.town.models import TownBase
from apps.travel.backend.deps import get_geocoder
from apps.travel.backend.models import Base as TravelBase

ROOT = Path(__file__).resolve().parents[2]
COVER = base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a9i8AAAAASUVORK5CYII="
)


def fixture_app(directory: Path, suite: str):
    url = f"sqlite:///{directory / 'site.db'}"
    adopt_or_upgrade(url)
    database = open_database(url)
    if suite != "finance":
        with database.sessionmaker.begin() as db:
            db.add_all(
                [
                    User(
                        id=1,
                        email="synthetic@example.test",
                        username="synthetic",
                        display_name="Synthetic User",
                    ),
                    User(
                        id=2,
                        email="other@example.test",
                        username="other",
                        display_name="Other User",
                    ),
                ]
            )

    def seed_media():
        from apps.media.backend.services.records import create_manual

        with database.sessionmaker.begin() as db:
            for title, creator, year in (
                ("Dune", "Frank Herbert", 1965),
                ("Alpha", "Ann", 1999),
                ("Zebra", "Zoe", 2001),
            ):
                create_manual(
                    db,
                    1,
                    {
                        "kind": "book",
                        "title": title,
                        "creator": creator,
                        "year": year,
                        "status": "in_progress" if title == "Dune" else "want",
                        "review": "Server note" if title == "Dune" else None,
                    },
                )

    fixtures = APIRouter()

    @fixtures.post("/e2e/reset")
    def reset():
        with database.engine.begin() as connection:
            for metadata in (TravelBase.metadata, MediaBase.metadata, TownBase.metadata):
                for table in reversed(metadata.sorted_tables):
                    connection.execute(table.delete())
        if suite != "finance":
            with database.sessionmaker.begin() as db:
                db.query(UserSession).filter(
                    UserSession.token_hash == _hash_secret("synthetic-session")
                ).update(
                    {
                        "revoked_at": None,
                        "expires_at": utc_now_naive() + timedelta(days=1),
                    }
                )
        if suite == "media":
            seed_media()
        return {"ok": True}

    @fixtures.get("/synthetic-cover.png")
    def synthetic_cover():
        return Response(COVER, media_type="image/png")

    @fixtures.post("/api/e2e/legacy-email-username")
    async def legacy_username(
        request: Request, db=Depends(get_db, scope="function"), user=Depends(get_current_user)
    ):
        payload = await request.json()
        if not isinstance(payload, dict) or payload.get("username") != "legacy.user@example.com":
            raise HTTPException(status_code=400, detail="unsupported legacy username")
        db.query(User).filter(User.id == user.id).update(
            {"username": payload["username"]}, synchronize_session=False
        )
        return {"username": payload["username"]}

    application = create_app(
        Settings(
            database_url=url,
            release="e2e",
            web_root=ROOT / "dist/web/browser",
        ),
        Dependencies(
            database=database,
            principal=None if suite == "finance" else Principal(1, "synthetic", "Synthetic User"),
            check_frontend=False,
            test_router=fixtures,
        ),
    )
    application.dependency_overrides[get_geocoder] = lambda: (
        lambda _query: [{"label": "Kyoto", "lat": 35.0116, "lng": 135.7681}]
    )

    if suite != "finance":
        with database.sessionmaker.begin() as db:
            db.add(
                UserSession(
                    user_id=1,
                    token_hash=_hash_secret("synthetic-session"),
                    csrf_token_hash=_hash_secret("synthetic-csrf"),
                    expires_at=utc_now_naive() + timedelta(days=1),
                )
            )

        @application.middleware("http")
        async def fixture_session(request, call_next):
            response = await call_next(request)
            if "text/html" in response.headers.get("content-type", ""):
                response.set_cookie(
                    "finance_session", "synthetic-session", httponly=True, samesite="lax"
                )
                response.set_cookie("finance_csrf", "synthetic-csrf", samesite="lax")
            return response

    if suite == "media":
        from apps.media.backend.services import portraits, providers

        providers.lookup_detail = lambda *_args: None
        portraits._fetch = lambda params: [
            {
                "source_id": "42",
                "title": "File:Synthetic portrait.jpg",
                "thumbnail": "https://upload.wikimedia.org/wikipedia/commons/synthetic.jpg",
                "source_url": "https://commons.wikimedia.org/wiki/File:Synthetic_portrait.jpg",
                "creator": "Synthetic photographer",
                "license": "CC BY-SA 4.0",
            }
        ]
        seed_media()
    return application


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--suite", choices=("finance", "travel", "media"), required=True)
    parser.add_argument("--port", type=int, required=True)
    args = parser.parse_args()
    os.environ.update(AUTH_SIGNUP_MODE="open", SESSION_COOKIE_SECURE="0", LOCAL_DEV_AUTH="0")
    for name in (
        "API_KEY",
        "FINANCE_API_KEY",
        "FLIGHTAWARE_API_KEY",
        "TMDB_API_KEY",
        "RAWG_API_KEY",
    ):
        os.environ.pop(name, None)
    import uvicorn

    with tempfile.TemporaryDirectory(prefix="suite-browser-") as directory:
        application = fixture_app(Path(directory), args.suite)
        uvicorn.run(application, host="127.0.0.1", port=args.port, log_level="warning")


if __name__ == "__main__":
    main()
