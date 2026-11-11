"""Production server composition with a disposable database and deterministic fixtures.

Only browser tests invoke this file. The production image does not copy tests/.
"""

from __future__ import annotations

import argparse
import base64
import os
import socket
import tempfile
import time
from datetime import UTC, date, datetime, timedelta
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
from apps.server.town.clock import get_town_clock
from apps.server.town.engine import name_key
from apps.server.town.models import Habit, HabitCheckin, TownBase
from apps.server.world.models import WorldBase
from apps.travel.backend.deps import get_geocoder
from apps.travel.backend.models import Base as TravelBase

ROOT = Path(__file__).resolve().parents[2]
# 12:00 Pacific on 2026-10-29. The same instant is 11:00 after the November fallback.
TOWN_CLOCK = datetime(2026, 10, 29, 19, 0, tzinfo=UTC)
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

    clock_box = {"now": TOWN_CLOCK}

    def seed_pixels(empty: bool) -> None:
        from apps.travel.backend.models import Trip

        now = datetime.now(UTC)
        with database.sessionmaker.begin() as db:
            owner = db.get(User, 1)
            other = db.get(User, 2)
            if owner is not None:
                owner.birthday = None if empty else date(1990, 5, 4)
                owner.pixels_show_age = False
            if other is not None:
                other.birthday = date(1980, 1, 1)
                other.pixels_show_age = True
            if empty:
                return
            habit = Habit(
                user_id=1,
                name="Read synthetic",
                slot=0,
                building_style="forge",
                per_week=7,
                created_on=date(2026, 1, 1),
                created_at=now,
                name_key=name_key("Read synthetic"),
            )
            other_habit = Habit(
                user_id=2,
                name="Other habit",
                slot=0,
                building_style="garden",
                per_week=7,
                created_on=date(2026, 1, 1),
                created_at=now,
                name_key=name_key("Other habit"),
            )
            db.add_all([habit, other_habit])
            db.flush()
            for day in (date(2026, 1, 10), date(2026, 8, 15)):
                db.add(HabitCheckin(habit_id=habit.id, user_id=1, day=day, created_at=now))
            db.add(
                HabitCheckin(
                    habit_id=other_habit.id, user_id=2, day=date(2026, 8, 15), created_at=now
                )
            )
            db.add_all(
                [
                    Trip(
                        user_id=1,
                        title="Portland",
                        start_date=date(2026, 8, 14),
                        end_date=date(2026, 8, 17),
                        status="booked",
                        counts_as_pto=False,
                    ),
                    Trip(
                        user_id=2,
                        title="Other trip",
                        start_date=date(2026, 8, 14),
                        end_date=date(2026, 8, 17),
                        status="booked",
                        counts_as_pto=False,
                    ),
                ]
            )

    def seed_town(empty: bool) -> None:
        """Owner habits plus a second person whose name must stay out of the signed-in DOM."""
        now = clock_box["now"]
        with database.sessionmaker.begin() as db:
            other = Habit(
                user_id=2,
                name="Other's habit",
                slot=0,
                building_style="garden",
                per_week=7,
                created_on=date(2026, 10, 1),
                created_at=now,
                name_key=name_key("Other's habit"),
            )
            db.add(other)
            db.flush()
            db.add(
                HabitCheckin(
                    habit_id=other.id,
                    user_id=2,
                    day=date(2026, 10, 28),
                    created_at=now,
                )
            )
            if empty:
                return
            # Yesterday is already checked, so history offers no second mark.
            # Twenty-five kept days reach town Lv 3 and leave the next lot empty.
            read_on = date(2026, 10, 4)
            read = Habit(
                user_id=1,
                name="Read 20 pages",
                slot=0,
                building_style="forge",
                per_week=7,
                created_on=read_on,
                created_at=now,
                name_key=name_key("Read 20 pages"),
            )
            walk = Habit(
                user_id=1,
                name="Walk 30 minutes",
                slot=1,
                building_style="garden",
                per_week=3,
                created_on=date(2026, 10, 26),
                created_at=now,
                name_key=name_key("Walk 30 minutes"),
            )
            db.add_all([read, walk])
            db.flush()
            day = read_on
            while day <= date(2026, 10, 28):
                db.add(HabitCheckin(habit_id=read.id, user_id=1, day=day, created_at=now))
                day += timedelta(days=1)
            for walked in (date(2026, 10, 26), date(2026, 10, 27)):
                db.add(HabitCheckin(habit_id=walk.id, user_id=1, day=walked, created_at=now))

    fixtures = APIRouter()

    @fixtures.post("/e2e/reset")
    def reset(request: Request):
        with database.engine.begin() as connection:
            for metadata in (
                TravelBase.metadata,
                MediaBase.metadata,
                TownBase.metadata,
                WorldBase.metadata,
            ):
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
        if suite == "town":
            clock_box["now"] = TOWN_CLOCK
        seed = request.query_params.get("seed") or ""
        if seed in {"pixels", "pixels-empty"}:
            seed_pixels(empty=seed == "pixels-empty")
        elif seed in {"town", "town-empty"}:
            seed_town(empty=seed == "town-empty")
        elif suite == "media":
            seed_media()
        return {"ok": True, "seed": seed or suite}

    @fixtures.post("/e2e/town/clock")
    async def set_town_clock(request: Request):
        payload = await request.json()
        raw = payload.get("iso") if isinstance(payload, dict) else None
        moment = datetime.fromisoformat(raw) if isinstance(raw, str) else TOWN_CLOCK
        clock_box["now"] = moment if moment.tzinfo is not None else moment.replace(tzinfo=UTC)
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
    if suite == "town":
        application.dependency_overrides[get_town_clock] = lambda: clock_box["now"]

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
    parser.add_argument("--suite", choices=("finance", "travel", "media", "town"), required=True)
    parser.add_argument("--port", type=int, required=True)
    args = parser.parse_args()
    os.environ.update(AUTH_SIGNUP_MODE="open", SESSION_COOKIE_SECURE="0", LOCAL_DEV_AUTH="0")
    if args.suite == "town":
        os.environ["TZ"] = "America/Los_Angeles"
        time.tzset()
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
        # Bind in the owning process. Port 0 lets concurrent workers and local
        # runs ask the OS for a free port without a reserve/release race.
        # Challenge issue and verify accept only CORS_ORIGINS. That port is not
        # one of the documented defaults, so the browser origin has to be configured
        # before the app reads it. A developer shell must not replace this value.
        with socket.socket() as listener:
            listener.bind(("127.0.0.1", args.port))
            origin = f"http://127.0.0.1:{listener.getsockname()[1]}"
            os.environ["CORS_ORIGINS"] = origin
            print(f"E2E_SERVER_URL={origin}", flush=True)
            application = fixture_app(Path(directory), args.suite)
            server = uvicorn.Server(uvicorn.Config(application, log_level="warning"))
            server.run(sockets=[listener])


if __name__ == "__main__":
    main()
