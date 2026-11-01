#!/usr/bin/env python3
"""Fill a running site with synthetic Finance, Travel, and Media rows.

Every row is created through the HTTP handlers, so foreign keys and side
tables match what the app writes. The data is invented. Do not point this at
a database that already has people in it.

``make db-seed-dev`` creates ``.local/data/site.db`` with this branch's
migrations and starts the app. The adoption rehearsal starts current main
instead and passes ``--base-url``.
"""

from __future__ import annotations

import argparse
import base64
import json
import os
import signal
import sqlite3
import subprocess
import sys
import tempfile
import time
from datetime import date, timedelta
from pathlib import Path

import httpx
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import ec

REPO = Path(__file__).resolve().parents[1]
MIN_PBKDF2_ITERATIONS = 600_000
COLLECTIONS = (
    "transactions",
    "bank_accounts",
    "assets",
    "liabilities",
    "holdings",
    "subscriptions",
)
CITIES = (
    ("Harbor City", "West", "Fictoria", 34.05, -118.24),
    ("North Station", "East", "Fictoria", 40.75, -73.99),
    ("Glass Bay", "South", "Fictoria", 25.77, -80.19),
    ("Cedar Bend", "North", "Fictoria", 47.61, -122.33),
    ("Red Mesa", "Central", "Fictoria", 35.08, -106.65),
)
MEDIA = (
    ("movie", "Lantern Tide"),
    ("movie", "Paper Orbit"),
    ("tv", "Station Eleven Minus Ten"),
    ("book", "The Quiet Ledger"),
    ("book", "Maps of Unused Rooms"),
    ("track", "Blue Platform"),
    ("album", "Second Pressing"),
    ("artist", "The Copper Quartet"),
    ("game", "Ferry Run"),
)


def b64(n: int) -> str:
    return base64.b64encode(b"s" * n).decode("ascii")


def material(username: str) -> dict:
    private_key = ec.generate_private_key(ec.SECP256R1())
    public_key_b64 = base64.b64encode(
        private_key.public_key().public_bytes(
            serialization.Encoding.DER,
            serialization.PublicFormat.SubjectPublicKeyInfo,
        )
    ).decode()
    return {
        "username": username,
        "display_name": username.replace(".", " ").title(),
        "public_key_b64": public_key_b64,
        "vault": {
            "kdf_salt_b64": b64(16),
            "kdf_iterations": MIN_PBKDF2_ITERATIONS,
            "wrapped_dek_b64": b64(48),
            "recovery_wrapped_dek_b64": "",
        },
        "auth": {
            "kdf_salt_b64": b64(16),
            "kdf_iterations": MIN_PBKDF2_ITERATIONS,
            "wrapped_private_key_b64": b64(48),
            "recovery_wrapped_private_key_b64": "",
        },
    }


def require(response: httpx.Response, what: str) -> dict | list:
    if response.status_code >= 400:
        raise SystemExit(f"{what} failed: {response.status_code} {response.text[:400]}")
    if not response.content:
        return {}
    return response.json()


def open_session(base_url: str, username: str, *, first: bool) -> tuple[httpx.Client, str]:
    client = httpx.Client(base_url=base_url, timeout=60.0)
    path = "/api/auth/bootstrap/passwordless" if first else "/api/auth/signup/passwordless"
    body = material(username)
    if not first:
        body["invite_code"] = ""
    payload = require(client.post(path, json=body), path)
    token = payload["csrf_token"]
    client.headers["X-CSRF-Token"] = token
    return client, token


def seed_records(client: httpx.Client, user_index: int, count: int) -> int:
    indexes = 0
    batch: list[dict] = []
    for number in range(count):
        record = {
            "collection": COLLECTIONS[number % len(COLLECTIONS)],
            "client_id": f"seed-u{user_index}-{number:06d}",
            "ciphertext_b64": b64(24),
            "schema_version": 2,
            "key_version": 1,
        }
        if number % 4 == 0:
            record["indexes"] = [
                {
                    "index_name": "seed",
                    "index_value_b64": base64.b64encode(
                        f"seed-{user_index}-{number}".encode()
                    ).decode("ascii"),
                }
            ]
            indexes += 1
        batch.append(record)
        if len(batch) == 50:
            require(
                client.post("/api/vault/records/upsert", json={"records": batch}), "record upsert"
            )
            batch = []
    if batch:
        require(client.post("/api/vault/records/upsert", json={"records": batch}), "record upsert")
    return indexes


def seed_trips(client: httpx.Client, user_index: int, count: int) -> None:
    origin = date(2024, 3, 1)
    for number in range(count):
        start = origin + timedelta(days=number * 9 + user_index)
        end = start + timedelta(days=3)
        city = CITIES[number % len(CITIES)]
        other = CITIES[(number + 1) % len(CITIES)]
        created = require(
            client.post(
                "/travel/api/trips",
                json={
                    "title": f"Synthetic trip {user_index}-{number}",
                    "start_date": start.isoformat(),
                    "end_date": end.isoformat(),
                    "status": "booked" if number % 2 == 0 else "planning",
                    "origin_label": "Home",
                    "counts_as_pto": False,
                    "stays": [
                        {
                            "city": city[0],
                            "region": city[1],
                            "country": city[2],
                            "arrive_on": start.isoformat(),
                            "leave_on": (start + timedelta(days=1)).isoformat(),
                            "lat": city[3],
                            "lng": city[4],
                            "lodging_name": "Synthetic Inn",
                        },
                        {
                            "city": other[0],
                            "region": other[1],
                            "country": other[2],
                            "arrive_on": (start + timedelta(days=2)).isoformat(),
                            "leave_on": end.isoformat(),
                            "lat": other[3],
                            "lng": other[4],
                        },
                    ],
                    "transports": [
                        {
                            "role": "outbound",
                            "mode": "flight",
                            "carrier": "Synthetic Air",
                            "number": f"SA{100 + number}",
                            "depart_place": "Home",
                            "arrive_place": city[0],
                            "depart_at": f"{start.isoformat()}T09:00:00",
                            "arrive_at": f"{start.isoformat()}T12:00:00",
                            "cost": "120.00",
                            "currency": "USD",
                        }
                    ],
                },
            ),
            "create trip",
        )
        trip_id = created["id"]
        stay_id = created["stays"][0]["id"]
        require(
            client.post(
                f"/travel/api/trips/{trip_id}/plans",
                json={
                    "on_date": start.isoformat(),
                    "title": "Walk the invented waterfront",
                    "kind": "activity",
                    "place_name": city[0],
                    "lat": city[3],
                    "lng": city[4],
                    "cost": "0.00",
                    "stay_id": stay_id,
                },
            ),
            "create plan",
        )
        require(
            client.post(
                f"/travel/api/trips/{trip_id}/notes",
                json={"body": "Synthetic note. No real itinerary.", "on_date": start.isoformat()},
            ),
            "create note",
        )
        require(
            client.post(
                f"/travel/api/trips/{trip_id}/reminders",
                json={
                    "title": "Check the synthetic booking",
                    "kind": "general",
                    "due_at": f"{start.isoformat()}T08:00:00",
                },
            ),
            "create reminder",
        )
        require(
            client.post(
                f"/travel/api/trips/{trip_id}/budget-lines",
                json={
                    "category": "lodging",
                    "label": "Synthetic inn",
                    "amount": "80.00",
                    "currency": "USD",
                },
            ),
            "create budget line",
        )
        require(
            client.post(
                f"/travel/api/trips/{trip_id}/parking",
                json={
                    "necessary": "yes",
                    "booked": True,
                    "arrangement": "self_park",
                    "place_name": "Synthetic garage",
                    "lat": city[3],
                    "lng": city[4],
                    "cost": "15.00",
                },
            ),
            "create parking",
        )


def seed_media(client: httpx.Client, user_index: int, count: int) -> None:
    for number in range(count):
        kind, title = MEDIA[number % len(MEDIA)]
        body = {
            "kind": kind,
            "title": f"{title} {user_index}-{number}",
            "creator": "Synthetic Studio",
            "year": 2018 + (number % 6),
            "status": "completed" if number % 3 == 0 else "want",
            "rating": 7 if number % 3 == 0 else None,
            "releases": [{"released_on": "2019-06-01", "precision": "day", "status": "released"}],
        }
        # Omission selects the supported artist default on historical and current APIs.
        if kind == "artist":
            body.pop("status")
        created = require(client.post("/media/api/library", json=body), "create media")
        entry_id = created["id"]
        finished = date(2024, 6, 1) + timedelta(days=number)
        if kind == "tv":
            for episode in range(1, 4):
                detail = require(
                    client.post(
                        f"/media/api/entries/{entry_id}/episodes",
                        json={
                            "season_number": 1,
                            "episode_number": episode,
                            "title": f"Synthetic episode {episode}",
                            "air_date": "2019-06-01",
                        },
                    ),
                    "create episode",
                )
            episode_id = detail["show"]["episodes"][0]["id"]
            require(
                client.post(
                    f"/media/api/entries/{entry_id}/episodes/{episode_id}/watched",
                    json={"watched": True, "watched_on": finished.isoformat()},
                ),
                "mark episode",
            )
            require(
                client.post(
                    f"/media/api/entries/{entry_id}/seasons",
                    json={"season_number": 1, "watched": True, "rating": 7},
                ),
                "save season",
            )
        if kind == "artist":
            detail = require(
                client.post(
                    f"/media/api/entries/{entry_id}/albums",
                    json={"title": f"Synthetic album {user_index}", "year": 2019},
                ),
                "create album",
            )
            album = detail["music"]["albums"][-1]
            for track_number in (1, 2):
                detail = require(
                    client.post(
                        f"/media/api/entries/{entry_id}/albums/{album['id']}/tracks",
                        json={"title": f"Synthetic song {track_number}"},
                    ),
                    "create track",
                )
            album = detail["music"]["albums"][-1]
            require(
                client.post(
                    f"/media/api/entries/{entry_id}/albums/{album['id']}/rating",
                    json={"rating": 8},
                ),
                "rate album",
            )
            track_id = album["tracks"][-1]["id"]
            require(
                client.post(
                    f"/media/api/entries/{entry_id}/tracks/{track_id}/rating",
                    json={"rating": 9},
                ),
                "rate track",
            )


def cookie_header(client: httpx.Client) -> str:
    return "; ".join(f"{name}={value}" for name, value in client.cookies.items())


def seed_legacy_pto(client: httpx.Client, user_index: int) -> None:
    """Legacy PTO policy so a later rehearsal exercises the hours backfill."""
    if user_index % 2 == 0:
        body: dict = {
            "accrual_amount": "15",
            "accrual_unit": "day",
            "accrual_cadence": "yearly",
            "hours_per_day": "8",
            "balance_days": "10",
            "balance_as_of": "2026-01-01",
            "annual_cap_days": "20",
        }
    else:
        body = {
            "accrual_amount": "3.25",
            "accrual_unit": "hour",
            "accrual_cadence": "biweekly",
            "hours_per_day": "7.5",
            "balance_days": "5.5",
            "balance_as_of": "2026-01-15",
        }
    require(client.put("/travel/api/pto/policy", json=body), "pto policy")


def seed(base_url: str, args: argparse.Namespace) -> None:
    totals = {"users": 0, "record_indexes": 0}
    admin_cookie = ""
    admin_csrf = ""
    for index in range(args.users):
        username = f"seed.user.{index}"
        client, csrf = open_session(base_url, username, first=index == 0)
        if index == 0:
            admin_cookie = cookie_header(client)
            admin_csrf = csrf
        totals["record_indexes"] += seed_records(client, index, args.records_per_user)
        seed_trips(client, index, args.trips_per_user)
        seed_legacy_pto(client, index)
        seed_media(client, index, args.entries_per_user)
        totals["users"] += 1
        print(f"seeded {username}", flush=True)
        client.close()
    if args.session_file:
        Path(args.session_file).write_text(
            json.dumps(
                {
                    "username": "seed.user.0",
                    "cookie": admin_cookie,
                    "csrf_token": admin_csrf,
                }
            )
        )
    print(
        json.dumps(
            {
                "event": "dev_seed_complete",
                **totals,
                "records_per_user": args.records_per_user,
                "trips_per_user": args.trips_per_user,
                "entries_per_user": args.entries_per_user,
            }
        ),
        flush=True,
    )


def database_path(url: str) -> Path:
    if not url.startswith("sqlite:///"):
        raise SystemExit("SITE_DATABASE_URL must be a sqlite:/// URL")
    return Path(url.removeprefix("sqlite:///"))


def users_present(path: Path) -> bool:
    if not path.is_file() or path.stat().st_size == 0:
        return False
    with sqlite3.connect(path) as db:
        try:
            count = db.execute("SELECT COUNT(*) FROM users").fetchone()[0]
        except sqlite3.OperationalError:
            return False
    return count > 0


def _server_failure(log_file, message: str) -> str:
    log_file.flush()
    log_file.seek(0)
    lines = log_file.read().splitlines()
    tail = "\n".join(lines[-40:])
    if tail:
        return f"{message}\n{tail}"
    return message


def _stop_process_group(process: subprocess.Popen) -> None:
    if process.poll() is not None:
        return
    try:
        os.killpg(process.pid, signal.SIGTERM)
    except ProcessLookupError:
        return
    try:
        process.wait(timeout=10)
    except subprocess.TimeoutExpired:
        try:
            os.killpg(process.pid, signal.SIGKILL)
        except ProcessLookupError:
            return
        process.wait(timeout=5)


def ensure_dev(args: argparse.Namespace) -> None:
    url = os.environ.get("SITE_DATABASE_URL", f"sqlite:///{REPO / '.local' / 'data' / 'site.db'}")
    path = database_path(url)
    path.parent.mkdir(parents=True, exist_ok=True)
    env = os.environ.copy()
    env["PYTHONPATH"] = str(REPO)
    env["SITE_DATABASE_URL"] = url
    subprocess.run([sys.executable, "-m", "apps.server.migrations"], cwd=REPO, env=env, check=True)
    if users_present(path):
        raise SystemExit(
            f"{path} already has users. Remove it before running make db-seed-dev again."
        )
    web = REPO / "dist" / "web" / "browser"
    if not (web / "index.csr.html").is_file():
        raise SystemExit("Run make build-frontends before seeding the development database.")
    env.update(
        {
            "SITE_WEB_ROOT": str(web),
            "SESSION_COOKIE_SECURE": "0",
            "AUTH_SIGNUP_MODE": "open",
            "AUTH_IP_RATE_LIMIT_PER_MIN": "100000",
            "RATE_LIMIT_PER_MIN": "100000",
        }
    )
    port = args.port
    env["PYTHONUNBUFFERED"] = "1"
    log_file = tempfile.NamedTemporaryFile(
        "w+", prefix="seed-dev-server-", suffix=".log", delete=False
    )
    process = subprocess.Popen(
        [
            sys.executable,
            "-m",
            "uvicorn",
            "apps.server.main:production_app",
            "--factory",
            "--host",
            "127.0.0.1",
            "--port",
            str(port),
        ],
        cwd=REPO,
        env=env,
        stdout=log_file,
        stderr=subprocess.STDOUT,
        start_new_session=True,
    )
    base_url = f"http://127.0.0.1:{port}"
    try:
        deadline = time.monotonic() + 30
        while time.monotonic() < deadline:
            if process.poll() is not None:
                raise SystemExit(
                    _server_failure(log_file, "dev server exited before it accepted connections")
                )
            try:
                response = httpx.get(f"{base_url}/api/auth/bootstrap-status", timeout=2.0)
            except httpx.HTTPError:
                time.sleep(0.2)
                continue
            if response.status_code == 200:
                break
            time.sleep(0.2)
        else:
            raise SystemExit(_server_failure(log_file, "dev server did not become ready"))
        seed(base_url, args)
    finally:
        _stop_process_group(process)
        log_name = log_file.name
        log_file.close()
        Path(log_name).unlink(missing_ok=True)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base-url", default="http://127.0.0.1:8091")
    parser.add_argument(
        "--ensure-dev",
        action="store_true",
        help="Migrate .local/data/site.db, start the app, seed, and stop",
    )
    parser.add_argument("--port", type=int, default=8091)
    parser.add_argument("--users", type=int, default=6)
    parser.add_argument("--records-per-user", type=int, default=200)
    parser.add_argument("--trips-per-user", type=int, default=10)
    parser.add_argument("--entries-per-user", type=int, default=18)
    parser.add_argument("--session-file", default="")
    args = parser.parse_args()
    if args.users < 1:
        parser.error("--users must be at least 1")
    if args.ensure_dev:
        ensure_dev(args)
        return
    seed(args.base_url.rstrip("/"), args)


if __name__ == "__main__":
    main()
