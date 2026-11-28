"""Minigame play receipts: one Town-day reward, then score without another grant."""

from __future__ import annotations

import sqlite3
from datetime import UTC, datetime
from pathlib import Path
from types import SimpleNamespace

import pytest
from alembic import command
from fastapi.testclient import TestClient
from sqlalchemy import func, select

from apps.server.auth import Principal
from apps.server.database import open_database
from apps.server.identity.admin import delete_user_account
from apps.server.identity.models import User, UserRole
from apps.server.identity.session import get_current_user
from apps.server.migrations import current_revision, make_config, model_diff, sqlite_url
from apps.server.tests.test_town_api_read import _open
from apps.server.tests.test_town_api_write import _quiet
from apps.server.town.clock import get_town_clock
from apps.server.town.models import HabitCheckin, PlayReceipt, StampReceipt, StampWallet
from apps.server.town.play_receipts import RHYTHM_CHART, memory_deal, open_run
from apps.server.town.quest_catalog import chapter_grant_key
from apps.server.town.resident_catalog import meeting_grant_key
from apps.server.town.stamps import grant_stamps

WHEN = datetime(2026, 11, 28, 12, 0, tzinfo=UTC)
LA_NIGHT = datetime(2026, 11, 28, 7, 30, tzinfo=UTC)
TOKYO = datetime(2026, 11, 28, 15, 30, tzinfo=UTC)
_CHECK = "Check the highlighted fields."
_MISSING = "That play receipt is not available."
_REJECTED = "That play receipt does not match this run."
_INCOMPLETE = "Finish the game before it can grant Stamps."
_PUBLIC = "Minigame Stamps come from a finished play receipt."
DEAL = [
    "Bell",
    "Ferry",
    "Lantern",
    "Lantern",
    "Glass",
    "Chart",
    "Ferry",
    "Glass",
    "Chart",
    "Shell",
    "Shell",
    "Bell",
]


def _memory(moves: int = 6, face: str = "matched", symbol: str | None = None) -> dict:
    tiles = []
    for index, name in enumerate(memory_deal()):
        tiles.append(
            {"index": index, "symbol": symbol if index == 0 and symbol else name, "face": face}
        )
    return {"seed": 10, "moves": moves, "tiles": tiles}


def _harbor(mode: str = "untimed", elapsed: int = 0, result: str = "hit", wrong: int = 0) -> dict:
    return {
        "seed": 1,
        "mode": mode,
        "elapsed": elapsed,
        "wrong": wrong,
        "notes": [{"lane": lane, "at": at, "result": result} for lane, at in RHYTHM_CHART],
    }


@pytest.fixture
def api(tmp_path, monkeypatch):
    _quiet(monkeypatch)
    folder = tmp_path / "http"
    folder.mkdir()
    application, database = _open(folder, Principal(1, "ada", "Ada"), WHEN)
    application.dependency_overrides[get_current_user] = lambda: SimpleNamespace(id=1)
    with TestClient(application) as client:
        yield client, database, application
    database.engine.dispose()


def _open_run(client, game: str, mode: str | None = None, tz: str = "UTC"):
    body: dict = {"game_id": game}
    if mode is not None:
        body["mode"] = mode
    return client.post("/api/town/minigames/runs", params={"tz": tz}, json=body)


def _finish(client, nonce: str, body: dict, tz: str = "UTC"):
    return client.post(f"/api/town/minigames/runs/{nonce}/finish", params={"tz": tz}, json=body)


def _err(response, status: int, code: str, message: str) -> None:
    body = response.json()
    assert response.status_code == status, response.text
    assert body["code"] == code
    assert body["message"] == message
    assert body["field_errors"] is None


def _balance(database, user_id: int = 1) -> int:
    db = database.sessionmaker()
    try:
        balance = db.scalar(select(StampWallet.balance).where(StampWallet.user_id == user_id))
        return 0 if balance is None else int(balance)
    finally:
        db.close()


def _receipts(database, user_id: int = 1) -> list[tuple[str, int, int | None]]:
    db = database.sessionmaker()
    try:
        rows = db.scalars(
            select(PlayReceipt).where(PlayReceipt.user_id == user_id).order_by(PlayReceipt.id)
        )
        return [(row.status, row.reward_amount, row.score) for row in rows]
    finally:
        db.close()


def test_memory_deal_matches_the_browser_seed() -> None:
    assert memory_deal() == DEAL


def test_open_grants_nothing_and_finish_is_once_per_town_day(api) -> None:
    client, database, application = api
    application.dependency_overrides[get_town_clock] = lambda: LA_NIGHT
    opened = _open_run(client, "memory-shelves", tz="America/Los_Angeles")
    assert opened.status_code == 201, opened.text
    body = opened.json()
    assert body["civil_day"] == "2026-11-27"
    assert body["seed"] == 10
    assert body["status"] == "open"
    assert body["score"] is None
    assert body["amount"] == 0
    assert body["rewarded"] is False
    assert body["balance"] == 0
    assert "user_id" not in body
    assert _balance(database) == 0
    nonce = body["nonce"]

    application.dependency_overrides[get_town_clock] = lambda: TOKYO
    won = _finish(client, nonce, _memory(), tz="Asia/Tokyo")
    assert won.status_code == 201, won.text
    done = won.json()
    assert done["civil_day"] == "2026-11-27"
    assert done["score"] == 6
    assert done["amount"] == 5
    assert done["rewarded"] is True
    assert done["balance"] == 5
    assert done["status"] == "complete"

    again = _finish(client, nonce, _memory(moves=8), tz="UTC")
    assert again.status_code == 200, again.text
    assert again.json()["score"] == 6
    assert again.json()["amount"] == 5
    assert again.json()["balance"] == 5
    assert _receipts(database) == [("complete", 5, 6)]

    edited = _finish(client, nonce, _memory(moves=5))
    _err(edited, 422, "play_receipt_rejected", _REJECTED)
    assert _receipts(database) == [("complete", 5, 6)]

    application.dependency_overrides[get_town_clock] = lambda: LA_NIGHT
    replay = _open_run(client, "memory-shelves", tz="America/Los_Angeles")
    assert replay.status_code == 201
    second = _finish(client, replay.json()["nonce"], _memory(moves=8))
    assert second.status_code == 201, second.text
    assert second.json()["amount"] == 0
    assert second.json()["rewarded"] is False
    assert second.json()["score"] == 8
    assert second.json()["balance"] == 5
    assert second.json()["civil_day"] == "2026-11-27"
    assert _receipts(database) == [("complete", 5, 6), ("complete", 0, 8)]

    application.dependency_overrides[get_town_clock] = lambda: TOKYO
    nxt = _open_run(client, "memory-shelves", tz="Asia/Tokyo")
    assert nxt.json()["civil_day"] == "2026-11-29"
    later = _finish(client, nxt.json()["nonce"], _memory(), tz="America/Los_Angeles")
    assert later.status_code == 201, later.text
    assert later.json()["civil_day"] == "2026-11-29"
    assert later.json()["amount"] == 5
    assert later.json()["balance"] == 10


def test_edited_foreign_and_incomplete_leave_the_reward_available(api) -> None:
    client, database, application = api
    opened = _open_run(client, "memory-shelves")
    nonce = opened.json()["nonce"]
    edited = _finish(client, nonce, _memory(symbol="Ferry"))
    _err(edited, 422, "play_receipt_rejected", _REJECTED)
    assert _balance(database) == 0
    assert _receipts(database) == [("open", 0, None)]

    partial = _finish(client, nonce, _memory(face="down", moves=0))
    _err(partial, 422, "play_receipt_incomplete", _INCOMPLETE)
    assert _balance(database) == 0

    extra = _finish(client, nonce, {**_memory(), "weight": 70})
    _err(extra, 422, "validation_error", _CHECK)
    foreign = _finish(client, "not-a-real-nonce-value", _memory())
    _err(foreign, 404, "play_receipt_not_found", _MISSING)
    short = _finish(client, "short", _memory())
    _err(short, 404, "play_receipt_not_found", _MISSING)
    assert _balance(database) == 0
    assert _wallet_count(database) == 0

    application.dependency_overrides[get_current_user] = lambda: SimpleNamespace(id=2)
    other = _finish(client, nonce, _memory())
    _err(other, 404, "play_receipt_not_found", _MISSING)
    assert _balance(database, 2) == 0
    application.dependency_overrides[get_current_user] = lambda: SimpleNamespace(id=1)
    won = _finish(client, nonce, _memory())
    assert won.status_code == 201, won.text
    assert won.json()["balance"] == 5
    assert won.json()["amount"] == 5


def test_harbor_shares_the_daily_cap_and_a_full_day_blocks_another_grant(api) -> None:
    client, database, _application = api
    memory = _open_run(client, "memory-shelves")
    harbor = _open_run(client, "harbor-rhythm", mode="untimed")
    timed = _open_run(client, "harbor-rhythm", mode="timed")
    assert _finish(client, memory.json()["nonce"], _memory()).json()["balance"] == 5
    perfect = _finish(client, harbor.json()["nonce"], _harbor())
    assert perfect.status_code == 201, perfect.text
    assert perfect.json()["score"] == 100
    assert perfect.json()["amount"] == 5
    assert perfect.json()["balance"] == 10
    missed = _finish(
        client, timed.json()["nonce"], _harbor(mode="timed", elapsed=30_000, result="miss")
    )
    assert missed.status_code == 201, missed.text
    assert missed.json()["score"] == 0
    assert missed.json()["amount"] == 0
    assert missed.json()["rewarded"] is False
    assert missed.json()["balance"] == 10
    assert _balance(database) == 10


def test_chapter_and_welcome_grants_do_not_count_toward_the_cap(api) -> None:
    client, database, _application = api
    db = database.sessionmaker()
    try:
        grant_stamps(
            db,
            1,
            {"grant_key": chapter_grant_key("chapter-1"), "amount": 10, "consumer": "quest"},
            WHEN,
        )
        grant_stamps(
            db,
            1,
            {"grant_key": meeting_grant_key("ada"), "amount": 2, "consumer": "quest"},
            WHEN,
        )
        db.commit()
        assert db.scalar(select(func.count()).select_from(HabitCheckin)) == 0
    finally:
        db.close()
    opened = _open_run(client, "memory-shelves")
    won = _finish(client, opened.json()["nonce"], _memory())
    assert won.status_code == 201, won.text
    assert won.json()["amount"] == 5
    assert won.json()["balance"] == 17
    db = database.sessionmaker()
    try:
        keys = set(db.scalars(select(StampReceipt.grant_key).where(StampReceipt.user_id == 1)))
        assert chapter_grant_key("chapter-1") in keys
        assert meeting_grant_key("ada") in keys
        assert "minigame:memory-shelves:2026-11-28" in keys
        assert db.scalar(select(func.count()).select_from(HabitCheckin)) == 0
    finally:
        db.close()


def test_public_minigame_grant_requires_a_finished_receipt(api) -> None:
    client, database, _application = api
    forged = client.post(
        "/api/town/stamps/grants",
        json={
            "grant_key": "minigame:memory-shelves:2026-11-28",
            "amount": 5,
            "consumer": "minigame",
        },
    )
    _err(forged, 422, "play_receipt_required", _PUBLIC)
    assert _balance(database) == 0
    assert _wallet_count(database) == 0
    opened = _open_run(client, "memory-shelves")
    assert _finish(client, opened.json()["nonce"], _memory()).status_code == 201
    retry = client.post(
        "/api/town/stamps/grants",
        json={
            "grant_key": "minigame:memory-shelves:2026-11-28",
            "amount": 20,
            "consumer": "minigame",
        },
    )
    assert retry.status_code == 200, retry.text
    assert retry.json()["balance"] == 5


def test_cap_backstop_and_illegal_harbor_bodies(api) -> None:
    client, database, _application = api
    db = database.sessionmaker()
    try:
        grant_stamps(
            db,
            1,
            {"grant_key": "minigame:other:2026-11-28", "amount": 10, "consumer": "minigame"},
            WHEN,
        )
        db.commit()
    finally:
        db.close()
    opened = _open_run(client, "memory-shelves")
    won = _finish(client, opened.json()["nonce"], _memory())
    assert won.status_code == 201, won.text
    assert won.json()["amount"] == 0
    assert won.json()["balance"] == 10
    harbor = _open_run(client, "harbor-rhythm", mode="untimed")
    nonce = harbor.json()["nonce"]
    early = _finish(client, nonce, _harbor(elapsed=0, result="pending"))
    _err(early, 422, "play_receipt_incomplete", _INCOMPLETE)
    missed = _finish(client, nonce, _harbor(result="miss"))
    _err(missed, 422, "play_receipt_rejected", _REJECTED)
    wrong_mode = _finish(client, nonce, _harbor(mode="timed", elapsed=30_000, result="miss"))
    _err(wrong_mode, 422, "play_receipt_rejected", _REJECTED)
    assert _balance(database) == 10
    done = _finish(client, nonce, _harbor(wrong=2))
    assert done.status_code == 201, done.text
    assert done.json()["amount"] == 0
    assert done.json()["rewarded"] is False
    assert done.json()["score"] == 89


def _wallet_count(database, user_id: int | None = None) -> int:
    db = database.sessionmaker()
    try:
        query = select(func.count()).select_from(StampWallet)
        if user_id is not None:
            query = query.where(StampWallet.user_id == user_id)
        return int(db.scalar(query) or 0)
    finally:
        db.close()


def test_upgrade_keeps_discoveries_and_downgrade_drops_only_play_receipts(tmp_path: Path) -> None:
    database = tmp_path / "site.db"
    config = make_config(sqlite_url(database))
    command.upgrade(config, "site_town_discoveries_v1")
    with sqlite3.connect(database) as db:
        db.execute(
            "INSERT INTO users (email, display_name, role, is_active, must_change_password, "
            "created_at, updated_at) VALUES ('kept@example.invalid', 'Kept', 'user', 1, 0, "
            "'2026-01-01', '2026-01-01')"
        )
        db.execute(
            "INSERT INTO town_discovery_journals (user_id, revision, updated_at) "
            "VALUES (1, 3, '2026-11-28T12:00:00+00:00')"
        )
        db.commit()
    command.upgrade(config, "head")
    assert current_revision(database) == "site_town_play_receipts_v1"
    assert model_diff(database) == []
    with sqlite3.connect(database) as db:
        assert db.execute("SELECT revision FROM town_discovery_journals").fetchone() == (3,)
        table_sql = db.execute(
            "SELECT sql FROM sqlite_master WHERE name = 'town_play_receipts'"
        ).fetchone()
        assert table_sql is not None
        assert "memory-shelves" in table_sql[0]
        assert "reward_amount IN (0, 5)" in table_sql[0]
        folded = table_sql[0].casefold()
        assert "weight" not in folded
        assert "health" not in folded
        assert "finance" not in folded
        db.execute("PRAGMA foreign_keys=ON")
        with pytest.raises(sqlite3.IntegrityError):
            db.execute(
                "INSERT INTO town_play_receipts (user_id, nonce, game_id, seed, mode, civil_day, "
                "zone, status, score, reward_amount, created_at, completed_at) VALUES "
                "(99, 'abcdefghijklmnop', 'memory-shelves', 10, NULL, '2026-11-28', 'UTC', "
                "'open', NULL, 0, '2026-11-28T12:00:00+00:00', NULL)"
            )
    command.downgrade(config, "site_town_discoveries_v1")
    assert current_revision(database) == "site_town_discoveries_v1"
    with sqlite3.connect(database) as db:
        names = {
            row[0] for row in db.execute("SELECT name FROM sqlite_master WHERE type = 'table'")
        }
        assert "town_play_receipts" not in names
        assert db.execute("SELECT revision FROM town_discovery_journals").fetchone() == (3,)
        assert db.execute(
            "SELECT COUNT(*) FROM site_revision_compatibility WHERE revision = ?",
            ("site_town_play_receipts_v1",),
        ).fetchone() == (0,)


def test_delete_user_account_removes_only_that_owners_runs(tmp_path: Path) -> None:
    database = tmp_path / "site.db"
    command.upgrade(make_config(sqlite_url(database)), "head")
    opened = open_database(f"sqlite:///{database}")
    db = opened.sessionmaker()
    try:
        kept = User(
            email="kept@example.invalid",
            display_name="Kept",
            role=UserRole.user,
            username="kept",
            is_active=True,
            must_change_password=False,
        )
        deleted = User(
            email="deleted@example.invalid",
            display_name="Deleted",
            role=UserRole.user,
            username="deleted",
            is_active=True,
            must_change_password=False,
        )
        db.add_all([kept, deleted])
        db.flush()
        open_run(db, kept.id, {"game_id": "memory-shelves"}, WHEN, "UTC")
        open_run(db, deleted.id, {"game_id": "memory-shelves"}, WHEN, "UTC")
        db.commit()
        delete_user_account(db, deleted, actor_user_id=kept.id)
        db.commit()
        assert (
            db.scalar(
                select(func.count())
                .select_from(PlayReceipt)
                .where(PlayReceipt.user_id == deleted.id)
            )
            == 0
        )
        assert (
            db.scalar(
                select(func.count()).select_from(PlayReceipt).where(PlayReceipt.user_id == kept.id)
            )
            == 1
        )
        assert db.scalar(select(func.count()).select_from(HabitCheckin)) == 0
    finally:
        db.close()
        opened.engine.dispose()
