"""Resident dialogue: one rank per conversation, one welcome grant, no decay."""

from __future__ import annotations

import sqlite3
from datetime import UTC, date, datetime
from pathlib import Path
from types import SimpleNamespace

import pytest
from alembic import command
from alembic.script import ScriptDirectory
from fastapi.testclient import TestClient
from sqlalchemy import func, select

from apps.server.auth import Principal
from apps.server.database import open_database
from apps.server.errors import APIError
from apps.server.identity.admin import delete_user_account
from apps.server.identity.models import User, UserRole
from apps.server.identity.session import get_current_user
from apps.server.migrations import (
    current_revision,
    head_revision,
    make_config,
    model_diff,
    sqlite_url,
)
from apps.server.tests.test_composition import _app, _user
from apps.server.tests.test_town_api_read import _add, _open
from apps.server.tests.test_town_api_write import _call, _quiet
from apps.server.town.clock import get_town_clock
from apps.server.town.dialogue import complete_conversation, read_directory
from apps.server.town.models import (
    DialogueCompletion,
    DialogueJournal,
    HabitCheckin,
    StampReceipt,
    TownBase,
)
from apps.server.town.resident_catalog import (
    conversation_check_sql,
    meeting_grant_key,
    resident_check_sql,
)
from apps.server.town.stamps import read_wallet

PARENT = "site_town_quests_v1"
HEAD = "site_town_discoveries_v1"
WHEN = datetime(2026, 11, 2, 20, 0, tzinfo=UTC)
AWAY = 0
_FORBIDDEN = {
    "weight",
    "xp",
    "trip_id",
    "balance",
    "note",
    "habit",
    "deadline",
    "money",
    "steps",
    "goal",
    "blood",
}
WELCOME = {"resident_id": "mara", "conversation_id": "welcome", "expected_revision": 0}


def _file_db(tmp_path: Path):
    database = open_database(f"sqlite:///{tmp_path / 'dialogue.db'}")
    TownBase.metadata.create_all(database.engine)
    return database


def _session(database):
    return database.sessionmaker()


def _count(db, model, user_id: int | None = None) -> int:
    query = select(func.count()).select_from(model)
    if user_id is not None:
        query = query.where(model.user_id == user_id)
    return int(db.scalar(query) or 0)


def _reject(db, payload: dict, user_id: int = 1, hour: int = AWAY) -> APIError:
    with pytest.raises(APIError) as caught:
        complete_conversation(db, user_id, payload, WHEN, hour)
    db.rollback()
    return caught.value


def _keys(value: object, found: set[str]) -> None:
    if isinstance(value, dict):
        found.update(str(key) for key in value)
        for item in value.values():
            _keys(item, found)
    elif isinstance(value, list):
        for item in value:
            _keys(item, found)


def _resident(directory: dict, resident_id: str) -> dict:
    return next(item for item in directory["residents"] if item["id"] == resident_id)


def test_welcome_once_rank_does_not_decay_and_directory_lists_the_away_resident(
    tmp_path: Path,
) -> None:
    database = _file_db(tmp_path)
    db = _session(database)
    try:
        listed = read_directory(db, 1, AWAY)
        assert listed["revision"] == 0
        assert len(listed["residents"]) == 6
        assert [item["id"] for item in listed["residents"]] == [
            "mara",
            "ada",
            "imani",
            "jun",
            "wren",
            "sol",
        ]
        assert all(len(item["conversations"]) == 5 for item in listed["residents"])
        away = _resident(listed, "mara")
        assert away["present"] is False
        assert away["rank"] == 0
        assert away["purpose"] == "Mara keeps the Reading Hall and explains the shelves."
        created, first = complete_conversation(db, 1, WELCOME, WHEN, AWAY)
        assert first is True
        assert created["revision"] == 1
        assert _resident(created, "mara")["rank"] == 1
        assert _resident(created, "mara")["present"] is False
        assert read_wallet(db, 1)["balance"] == 2
        assert _count(db, StampReceipt, 1) == 1
        receipt = db.scalar(select(StampReceipt).where(StampReceipt.user_id == 1))
        assert receipt is not None
        assert receipt.grant_key == meeting_grant_key("mara")
        assert receipt.amount == 2
        assert receipt.kind == "grant"
        replay, again = complete_conversation(
            db, 1, {**WELCOME, "expected_revision": 0}, WHEN, AWAY
        )
        assert again is False
        assert replay["revision"] == 1
        assert _resident(replay, "mara")["rank"] == 1
        assert read_wallet(db, 1)["balance"] == 2
        assert _count(db, DialogueCompletion, 1) == 1
        second, added = complete_conversation(
            db,
            1,
            {
                "resident_id": "mara",
                "conversation_id": "how-it-works",
                "expected_revision": 1,
            },
            WHEN,
            AWAY,
        )
        assert added is True
        assert second["revision"] == 2
        assert _resident(second, "mara")["rank"] == 2
        assert read_wallet(db, 1)["balance"] == 2
        db.commit()
        stale = _reject(
            db,
            {
                "resident_id": "mara",
                "conversation_id": "preference",
                "expected_revision": 1,
            },
        )
        assert stale.status_code == 409 and stale.code == "dialogue_conflict"
        assert _count(db, DialogueCompletion, 1) == 2
        assert _resident(read_directory(db, 1, AWAY), "mara")["rank"] == 2
        for extra in ({"weight": 70}, {"note": "private"}, {"trip_id": 4}, {"balance": 9}):
            rejected = _reject(db, {**WELCOME, **extra})
            assert rejected.status_code == 422 and rejected.code == "validation_error"
        assert _count(db, DialogueCompletion, 1) == 2
        preference = complete_conversation(
            db,
            2,
            {"resident_id": "ada", "conversation_id": "preference", "expected_revision": 0},
            WHEN,
            AWAY,
        )[0]
        assert _resident(preference, "ada")["rank"] == 1
        assert read_wallet(db, 2)["balance"] == 0
        welcomed, welcome_added = complete_conversation(
            db,
            2,
            {"resident_id": "ada", "conversation_id": "welcome", "expected_revision": 1},
            WHEN,
            AWAY,
        )
        assert welcome_added is True
        assert _resident(welcomed, "ada")["rank"] == 2
        assert read_wallet(db, 2)["balance"] == 2
        for conversation_id in ("activity", "reflection"):
            current = read_directory(db, 1, AWAY)["revision"]
            complete_conversation(
                db,
                1,
                {
                    "resident_id": "mara",
                    "conversation_id": conversation_id,
                    "expected_revision": current,
                },
                WHEN,
                AWAY,
            )
        current = read_directory(db, 1, AWAY)["revision"]
        ranked, ranked_added = complete_conversation(
            db,
            1,
            {
                "resident_id": "mara",
                "conversation_id": "preference",
                "expected_revision": current,
            },
            WHEN,
            AWAY,
        )
        assert ranked_added is True
        assert _resident(ranked, "mara")["rank"] == 5
        assert read_wallet(db, 1)["balance"] == 2
        db.commit()
        unknown = _reject(db, {**WELCOME, "conversation_id": "secret", "expected_revision": 5})
        assert unknown.status_code == 422
        assert _count(db, DialogueCompletion, 1) == 5
        found: set[str] = set()
        _keys(ranked, found)
        assert _FORBIDDEN.isdisjoint(found)
        assert {column.name for column in DialogueCompletion.__table__.columns} == {
            "id",
            "user_id",
            "resident_id",
            "conversation_id",
            "created_at",
        }
        assert read_directory(db, 3, AWAY)["revision"] == 0
        assert _count(db, HabitCheckin) == 0
    finally:
        db.close()
        database.engine.dispose()


def test_http_offscreen_replay_owner_and_life_rows_stay_put(tmp_path, monkeypatch) -> None:
    _quiet(monkeypatch)
    application, database = _app(tmp_path)
    TownBase.metadata.create_all(database.engine)
    _user(database, 1, "tok", "csrf-token")
    _user(database, 2, "tok2", "csrf-2")
    application.dependency_overrides[get_town_clock] = lambda: WHEN
    db = database.sessionmaker()
    _add(db, 1, "Read", 0, "forge", 7, date(2026, 11, 2), [date(2026, 11, 2)])
    db.commit()
    db.close()
    with TestClient(application) as client:
        missing = _call(client, "post", "/api/town/residents/conversations", json=WELCOME)
        assert missing.status_code == 401
        blocked = _call(
            client, "post", "/api/town/residents/conversations", token="tok", json=WELCOME
        )
        assert blocked.status_code == 403
        before = _call(client, "get", "/api/town", token="tok", params={"tz": "UTC"})
        assert before.status_code == 200, before.text
        xp = before.json()["town"]["xp"]
        listed = _call(client, "get", "/api/town/residents", token="tok", params={"tz": "UTC"})
        assert listed.status_code == 200, listed.text
        body = listed.json()
        assert body["hour"] == 20
        assert len(body["residents"]) == 6
        sol = _resident(body, "sol")
        assert sol["present"] is False
        assert sol["rank"] == 0
        created = _call(
            client,
            "post",
            "/api/town/residents/conversations",
            token="tok",
            csrf="csrf-token",
            params={"tz": "UTC"},
            json={"resident_id": "sol", "conversation_id": "welcome", "expected_revision": 0},
        )
        assert created.status_code == 201, created.text
        assert _resident(created.json(), "sol")["rank"] == 1
        assert _resident(created.json(), "sol")["present"] is False
        replay = _call(
            client,
            "post",
            "/api/town/residents/conversations",
            token="tok",
            csrf="csrf-token",
            params={"tz": "UTC"},
            json={"resident_id": "sol", "conversation_id": "welcome", "expected_revision": 0},
        )
        assert replay.status_code == 200, replay.text
        assert replay.json()["revision"] == 1
        assert _resident(replay.json(), "sol")["rank"] == 1
        wallet = _call(client, "get", "/api/town/stamps", token="tok")
        assert wallet.json()["balance"] == 2
        hidden = _call(client, "get", "/api/town/residents", token="tok2", params={"tz": "UTC"})
        assert hidden.json()["revision"] == 0
        assert _resident(hidden.json(), "sol")["rank"] == 0
        after = _call(client, "get", "/api/town", token="tok", params={"tz": "UTC"})
        assert after.json()["town"]["xp"] == xp
        removed = _call(
            client, "delete", "/api/town/residents/conversations", token="tok", csrf="csrf-token"
        )
        assert removed.status_code == 404
        private = _call(
            client,
            "post",
            "/api/town/residents/conversations",
            token="tok",
            csrf="csrf-token",
            json={**WELCOME, "weight": 70},
        )
        assert private.status_code == 422
        seen = database.sessionmaker()
        assert _count(seen, HabitCheckin, 1) == 1
        assert _count(seen, DialogueCompletion, 2) == 0
        seen.close()
    database.engine.dispose()


def test_upgrade_preserves_quests_and_downgrade_drops_only_dialogue(tmp_path: Path) -> None:
    database = tmp_path / "site.db"
    config = make_config(sqlite_url(database))
    command.upgrade(config, PARENT)
    with sqlite3.connect(database) as db:
        db.execute("CREATE TABLE kept_unsupported (id INTEGER PRIMARY KEY, note TEXT NOT NULL)")
        db.execute("INSERT INTO kept_unsupported (note) VALUES ('keep')")
        db.execute(
            "INSERT INTO users (email, display_name, role, is_active, must_change_password, "
            "created_at, updated_at) VALUES ('kept@example.invalid', 'Kept', 'user', 1, 0, "
            "'2026-01-01', '2026-01-01')"
        )
        db.execute("INSERT INTO town_stamp_wallets (user_id, balance) VALUES (1, 4)")
        db.execute(
            "INSERT INTO town_quest_journals (user_id, revision, updated_at) "
            "VALUES (1, 1, '2026-11-02T20:00:00+00:00')"
        )
        db.commit()
    command.upgrade(config, HEAD)
    assert current_revision(database) == HEAD
    assert head_revision() == HEAD
    assert ScriptDirectory.from_config(config).get_heads() == [HEAD]
    diff = model_diff(database)
    assert [item[0] for item in diff] == ["remove_table"]
    assert diff[0][1].name == "kept_unsupported"
    with sqlite3.connect(database) as db:
        assert db.execute("SELECT balance FROM town_stamp_wallets").fetchone() == (4,)
        assert db.execute("SELECT revision FROM town_quest_journals").fetchone() == (1,)
        assert db.execute("SELECT COUNT(*) FROM town_dialogue_journals").fetchone() == (0,)
        table_sql = db.execute(
            "SELECT sql FROM sqlite_master WHERE name = 'town_dialogue_completions'"
        ).fetchone()
        assert table_sql is not None
        assert resident_check_sql() in table_sql[0]
        assert conversation_check_sql() in table_sql[0]
        compatible = {
            row[0]
            for row in db.execute(
                "SELECT compatible_head FROM site_revision_compatibility WHERE revision = ?",
                (HEAD,),
            )
        }
        assert PARENT in compatible
        db.execute("PRAGMA foreign_keys=ON")
        with pytest.raises(sqlite3.IntegrityError):
            db.execute(
                "INSERT INTO town_dialogue_completions "
                "(user_id, resident_id, conversation_id, created_at) "
                "VALUES (1, 'nobody', 'welcome', '2026-11-02T20:00:00+00:00')"
            )
    command.downgrade(config, PARENT)
    assert current_revision(database) == PARENT
    with sqlite3.connect(database) as db:
        names = {
            row[0] for row in db.execute("SELECT name FROM sqlite_master WHERE type = 'table'")
        }
        assert "town_dialogue_journals" not in names
        assert "town_dialogue_completions" not in names
        assert "town_quest_journals" in names
        assert db.execute("SELECT balance FROM town_stamp_wallets").fetchone() == (4,)
        assert db.execute("SELECT note FROM kept_unsupported").fetchone() == ("keep",)


def test_delete_user_account_removes_only_that_owners_dialogue(tmp_path: Path) -> None:
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
        complete_conversation(db, kept.id, WELCOME, WHEN, AWAY)
        complete_conversation(db, deleted.id, WELCOME, WHEN, AWAY)
        db.commit()
        delete_user_account(db, deleted, actor_user_id=kept.id)
        db.commit()
        assert _count(db, DialogueCompletion, deleted.id) == 0
        assert _count(db, DialogueJournal, deleted.id) == 0
        assert _count(db, StampReceipt, deleted.id) == 0
        assert read_directory(db, kept.id, AWAY)["revision"] == 1
        assert read_wallet(db, kept.id)["balance"] == 2
    finally:
        db.close()
        opened.engine.dispose()


def test_pinned_read_uses_the_signed_in_owner(tmp_path, monkeypatch) -> None:
    _quiet(monkeypatch)
    folder = tmp_path / "http"
    folder.mkdir()
    application, database = _open(folder, Principal(1, "ada", "Ada"))
    application.dependency_overrides[get_current_user] = lambda: SimpleNamespace(id=1)
    application.dependency_overrides[get_town_clock] = lambda: WHEN
    db = database.sessionmaker()
    complete_conversation(db, 1, WELCOME, WHEN, AWAY)
    complete_conversation(db, 2, WELCOME, WHEN, AWAY)
    db.commit()
    db.close()
    with TestClient(application) as client:
        body = client.get("/api/town/residents", params={"tz": "UTC"}).json()
        assert body["revision"] == 1
        assert _resident(body, "mara")["rank"] == 1
        assert len(body["residents"]) == 6
    database.engine.dispose()
