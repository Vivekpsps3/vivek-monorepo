"""Optional quests: one game action per step, no life reward, no second grant."""

from __future__ import annotations

import sqlite3
from datetime import UTC, date, datetime
from pathlib import Path
from types import SimpleNamespace

import pytest
from alembic import command
from alembic.script import ScriptDirectory
from fastapi.testclient import TestClient
from sqlalchemy import func, select, text

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
from apps.server.town.models import (
    HabitCheckin,
    QuestJournal,
    QuestStep,
    StampReceipt,
    StampWallet,
    TownBase,
)
from apps.server.town.quest_catalog import triple_check_sql
from apps.server.town.quests import read_journal, record_step

PARENT = "site_town_layouts_v1"
HEAD = "site_town_quests_v1"
WHEN = datetime(2026, 11, 2, 20, 0, tzinfo=UTC)
_CHECK = "Check the highlighted fields."
_FORBIDDEN = {"xp", "due_on", "deadline", "user_id", "weight", "trip_id", "created_at", "balance"}
ENTER = {
    "quest_id": "make-a-home",
    "step_id": "enter-home",
    "action_id": "make-a-home:enter-home",
    "expected_revision": 0,
}


def _file_db(tmp_path: Path):
    database = open_database(f"sqlite:///{tmp_path / 'quests.db'}")
    TownBase.metadata.create_all(database.engine)
    return database


def _session(database):
    return database.sessionmaker()


def _count(db, model, user_id: int | None = None) -> int:
    query = select(func.count()).select_from(model)
    if user_id is not None:
        query = query.where(model.user_id == user_id)
    return int(db.scalar(query) or 0)


def _reject(db, payload: dict, user_id: int = 1) -> APIError:
    with pytest.raises(APIError) as caught:
        record_step(db, user_id, payload, WHEN)
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


def test_repeat_back_and_reload_record_one_action(tmp_path: Path) -> None:
    database = _file_db(tmp_path)
    db = _session(database)
    try:
        created, first = record_step(db, 1, ENTER, WHEN)
        assert first is True
        assert created["revision"] == 1
        assert created["quests"][0]["completed"] == 1
        replay, again = record_step(db, 1, {**ENTER, "expected_revision": 0}, WHEN)
        assert again is False
        assert replay["revision"] == 1
        assert _count(db, QuestStep, 1) == 1
        assert _count(db, QuestJournal, 1) == 1
        second, added = record_step(
            db,
            1,
            {
                "quest_id": "across-the-harbor",
                "step_id": "meet-keeper",
                "action_id": "across-the-harbor:meet-keeper",
                "expected_revision": 1,
            },
            WHEN,
        )
        assert added is True
        assert second["revision"] == 2
        home = next(quest for quest in second["quests"] if quest["id"] == "make-a-home")
        harbor = next(quest for quest in second["quests"] if quest["id"] == "across-the-harbor")
        assert home["completed"] == 1
        assert harbor["completed"] == 1
        db.commit()
        stale = _reject(
            db,
            {
                "quest_id": "make-a-home",
                "step_id": "place-starter",
                "action_id": "make-a-home:place-starter",
                "expected_revision": 1,
            },
        )
        assert stale.status_code == 409 and stale.code == "quest_conflict"
        assert _count(db, QuestStep, 1) == 2
        assert read_journal(db, 1)["revision"] == 2
        other = _reject(
            db,
            {**ENTER, "action_id": "make-a-home:place-starter", "expected_revision": 2},
        )
        assert other.status_code == 422
        ordered = _reject(
            db,
            {
                "quest_id": "light-the-square",
                "step_id": "place-lantern",
                "action_id": "light-the-square:place-lantern",
                "expected_revision": 2,
            },
        )
        assert ordered.status_code == 409 and ordered.code == "quest_step"
        changed = record_step(
            db,
            1,
            {
                "quest_id": "find-your-shelves",
                "step_id": "meet-librarian",
                "action_id": "find-your-shelves:meet-librarian",
                "expected_revision": 2,
            },
            WHEN,
        )[0]
        db.commit()
        recorded, added_sample = record_step(
            db,
            1,
            {
                "quest_id": "find-your-shelves",
                "step_id": "inspect-saved",
                "action_id": "find-your-shelves:inspect-saved:sample",
                "expected_revision": changed["revision"],
            },
            WHEN,
        )
        assert added_sample is True
        db.commit()
        different = _reject(
            db,
            {
                "quest_id": "find-your-shelves",
                "step_id": "inspect-saved",
                "action_id": "find-your-shelves:inspect-saved",
                "expected_revision": 99,
            },
        )
        assert different.status_code == 409 and different.code == "quest_action"
        assert recorded["revision"] == changed["revision"] + 1
        final = read_journal(db, 1)
        found: set[str] = set()
        _keys(final, found)
        assert _FORBIDDEN.isdisjoint(found)
        assert "No deadline" in final["quests"][0]["detail"]
        assert _count(db, StampWallet) == 0
        assert _count(db, StampReceipt) == 0
        assert _count(db, HabitCheckin) == 0
        assert read_journal(db, 2)["revision"] == 0
    finally:
        db.close()
        database.engine.dispose()


def test_private_fields_do_not_record_a_step(tmp_path: Path) -> None:
    database = _file_db(tmp_path)
    db = _session(database)
    try:
        for extra in ({"weight": 70}, {"xp": 10}, {"deadline": "2026-12-01"}, {"trip_id": 4}):
            rejected = _reject(db, {**ENTER, **extra})
            assert rejected.status_code == 422 and rejected.code == "validation_error"
        assert _reject(db, {**ENTER, "expected_revision": -1}).status_code == 422
        assert _count(db, QuestStep) == 0
    finally:
        db.close()
        database.engine.dispose()


def test_http_replay_owner_and_life_rows_stay_put(tmp_path, monkeypatch) -> None:
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
        missing = _call(client, "post", "/api/town/quests/steps", json=ENTER)
        assert missing.status_code == 401
        blocked = _call(client, "post", "/api/town/quests/steps", token="tok", json=ENTER)
        assert blocked.status_code == 403
        before = _call(
            client, "get", "/api/town", token="tok", params={"tz": "America/Los_Angeles"}
        )
        assert before.status_code == 200, before.text
        xp = before.json()["town"]["xp"]
        assert xp > 0
        created = _call(
            client, "post", "/api/town/quests/steps", token="tok", csrf="csrf-token", json=ENTER
        )
        assert created.status_code == 201, created.text
        assert created.json()["revision"] == 1
        replay = _call(
            client,
            "post",
            "/api/town/quests/steps",
            token="tok",
            csrf="csrf-token",
            json={**ENTER, "expected_revision": 0},
        )
        assert replay.status_code == 200, replay.text
        assert replay.json()["revision"] == 1
        hidden = _call(client, "get", "/api/town/quests", token="tok2")
        assert hidden.status_code == 200
        assert hidden.json()["revision"] == 0
        assert hidden.json()["quests"][0]["completed"] == 0
        meet = {
            "quest_id": "find-your-shelves",
            "step_id": "meet-librarian",
            "action_id": "find-your-shelves:meet-librarian",
            "expected_revision": 0,
        }
        opened = _call(
            client, "post", "/api/town/quests/steps", token="tok2", csrf="csrf-2", json=meet
        )
        assert opened.status_code == 201
        sample = _call(
            client,
            "post",
            "/api/town/quests/steps",
            token="tok",
            csrf="csrf-token",
            json={
                "quest_id": "find-your-shelves",
                "step_id": "inspect-saved",
                "action_id": "find-your-shelves:inspect-saved:sample",
                "expected_revision": 1,
            },
        )
        assert sample.status_code == 409 and sample.json()["code"] == "quest_step"
        prepared = _call(
            client,
            "post",
            "/api/town/quests/steps",
            token="tok",
            csrf="csrf-token",
            json={**meet, "expected_revision": 1},
        )
        assert prepared.status_code == 201, prepared.text
        recorded = _call(
            client,
            "post",
            "/api/town/quests/steps",
            token="tok",
            csrf="csrf-token",
            json={
                "quest_id": "find-your-shelves",
                "step_id": "inspect-saved",
                "action_id": "find-your-shelves:inspect-saved:sample",
                "expected_revision": prepared.json()["revision"],
            },
        )
        assert recorded.status_code == 201, recorded.text
        shelf = next(
            quest for quest in recorded.json()["quests"] if quest["id"] == "find-your-shelves"
        )
        assert shelf["completed"] == 2
        assert shelf["steps"][1]["recorded_action"].endswith(":sample")
        after = _call(client, "get", "/api/town", token="tok", params={"tz": "America/Los_Angeles"})
        assert after.json()["town"]["xp"] == xp
        stamps = _call(client, "get", "/api/town/stamps", token="tok")
        assert stamps.json()["balance"] == 0
        assert stamps.json()["receipts"] == []
        owner = _call(client, "get", "/api/town/quests", token="tok")
        assert owner.json()["revision"] == recorded.json()["revision"]
        assert _call(client, "get", "/api/town/quests", token="tok2").json()["revision"] == 1
    seen = database.sessionmaker()
    try:
        assert _count(seen, QuestStep, 1) == 3
        assert _count(seen, QuestStep, 2) == 1
        assert _count(seen, HabitCheckin, 1) == 1
        assert _count(seen, StampReceipt) == 0
        assert seen.scalar(text("SELECT COUNT(*) FROM user_entries")) == 0
        assert seen.scalar(text("SELECT COUNT(*) FROM trips")) == 0
        assert seen.scalar(text("SELECT COUNT(*) FROM world_concepts")) == 0
    finally:
        seen.close()
        database.engine.dispose()


def test_upgrade_preserves_other_domains_and_checks_the_action_triple(tmp_path: Path) -> None:
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
        db.execute(
            "INSERT INTO habits (user_id, name, slot, building_style, per_week, created_on, "
            "created_at, name_key) VALUES (1, 'Read', 0, 'forge', 7, '2026-03-01', "
            "'2026-03-01T00:00:00+00:00', 'read')"
        )
        db.execute(
            "INSERT INTO trips (user_id, title, start_date, end_date, status, counts_as_pto, "
            "created_at, updated_at) VALUES (1, 'Lisbon', '2026-04-06', '2026-04-10', "
            "'planning', 1, '2026-04-01', '2026-04-01')"
        )
        db.execute(
            "INSERT INTO world_concepts (user_id, name, name_key, understood_on, created_at, "
            "updated_at) VALUES (1, 'Harbor', 'harbor', '2026-04-01', '2026-04-01', '2026-04-01')"
        )
        db.execute("INSERT INTO town_stamp_wallets (user_id, balance) VALUES (1, 4)")
        db.commit()
    command.upgrade(config, HEAD)
    assert current_revision(database) == HEAD
    assert head_revision() == HEAD
    assert ScriptDirectory.from_config(config).get_heads() == [HEAD]
    diff = model_diff(database)
    assert [item[0] for item in diff] == ["remove_table"]
    assert diff[0][1].name == "kept_unsupported"
    with sqlite3.connect(database) as db:
        assert db.execute("SELECT title FROM trips").fetchone() == ("Lisbon",)
        assert db.execute("SELECT name FROM world_concepts").fetchone() == ("Harbor",)
        assert db.execute("SELECT balance FROM town_stamp_wallets").fetchone() == (4,)
        assert db.execute("SELECT note FROM kept_unsupported").fetchone() == ("keep",)
        assert db.execute("SELECT COUNT(*) FROM town_quest_journals").fetchone() == (0,)
        table_sql = db.execute(
            "SELECT sql FROM sqlite_master WHERE name = 'town_quest_steps'"
        ).fetchone()
        assert table_sql is not None
        assert triple_check_sql() in table_sql[0]
        compatible = {
            row[0]
            for row in db.execute(
                "SELECT compatible_head FROM site_revision_compatibility WHERE revision = ?",
                (HEAD,),
            )
        }
        assert PARENT in compatible
        db.execute("PRAGMA foreign_keys=ON")
        db.execute(
            "INSERT INTO town_quest_journals (user_id, revision, updated_at) "
            "VALUES (1, 1, '2026-11-02T20:00:00+00:00')"
        )
        db.execute(
            "INSERT INTO town_quest_steps (user_id, quest_id, step_id, action_id, created_at) "
            "VALUES (1, 'make-a-home', 'enter-home', 'make-a-home:enter-home', "
            "'2026-11-02T20:00:00+00:00')"
        )
        with pytest.raises(sqlite3.IntegrityError):
            db.execute(
                "INSERT INTO town_quest_steps (user_id, quest_id, step_id, action_id, created_at) "
                "VALUES (1, 'make-a-home', 'place-starter', 'not-a-game-action', "
                "'2026-11-02T20:00:00+00:00')"
            )
    command.downgrade(config, PARENT)
    assert current_revision(database) == PARENT
    with sqlite3.connect(database) as db:
        names = {
            row[0] for row in db.execute("SELECT name FROM sqlite_master WHERE type = 'table'")
        }
        assert "town_quest_journals" not in names
        assert "town_quest_steps" not in names
        assert "town_room_layouts" in names
        assert "town_stamp_wallets" in names
        assert db.execute("SELECT title FROM trips").fetchone() == ("Lisbon",)
        assert db.execute("SELECT note FROM kept_unsupported").fetchone() == ("keep",)


def test_delete_user_account_removes_only_that_owners_quests(tmp_path: Path) -> None:
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
        record_step(db, kept.id, ENTER, WHEN)
        record_step(db, deleted.id, ENTER, WHEN)
        db.commit()
        delete_user_account(db, deleted, actor_user_id=kept.id)
        db.commit()
        assert _count(db, QuestStep, deleted.id) == 0
        assert _count(db, QuestJournal, deleted.id) == 0
        assert read_journal(db, kept.id)["revision"] == 1
    finally:
        db.close()
        opened.engine.dispose()


def test_pinned_read_uses_the_signed_in_owner(tmp_path, monkeypatch) -> None:
    _quiet(monkeypatch)
    folder = tmp_path / "http"
    folder.mkdir()
    application, database = _open(folder, Principal(1, "ada", "Ada"))
    application.dependency_overrides[get_current_user] = lambda: SimpleNamespace(id=1)
    db = database.sessionmaker()
    record_step(db, 1, ENTER, WHEN)
    record_step(db, 2, ENTER, WHEN)
    db.commit()
    db.close()
    with TestClient(application) as client:
        body = client.get("/api/town/quests").json()
        assert body["revision"] == 1
        assert body["quests"][0]["completed"] == 1
        assert len(body["quests"]) == 6
        assert all(quest["total"] == 3 for quest in body["quests"])
    database.engine.dispose()
