"""Town discoveries: one journal stamp per hotspot, no currency, no life rows."""

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
from apps.server.town.discoveries import read_journal, record_discovery
from apps.server.town.discovery_catalog import DISCOVERIES, discovery_check_sql
from apps.server.town.models import (
    DiscoveryJournal,
    DiscoveryStamp,
    HabitCheckin,
    QuestStep,
    StampReceipt,
    StampWallet,
    TownBase,
)

PARENT = "site_town_dialogue_v1"
HEAD = "site_town_play_receipts_v1"
WHEN = datetime(2026, 11, 2, 20, 0, tzinfo=UTC)
BELL = {"discovery_id": "ferry-bell", "expected_revision": 0}
SCOPE = {"discovery_id": "rooftop-telescope", "expected_revision": 1}
CHALK = {"discovery_id": "gym-chalkboard", "expected_revision": 2}
_FORBIDDEN = {
    "weight",
    "xp",
    "trip_id",
    "balance",
    "note",
    "habit",
    "deadline",
    "expires",
    "money",
    "workout",
    "steps",
    "goal",
    "blood",
    "stamps",
}
_IDS = (
    "tidepool-shells",
    "ferry-bell",
    "library-globe",
    "theater-light-booth",
    "music-mural",
    "gym-chalkboard",
    "clinic-garden",
    "hall-sundial",
    "courtyard-birdbath",
    "lantern-alley",
    "rooftop-telescope",
    "arcade-sign",
)


def _file_db(tmp_path: Path):
    database = open_database(f"sqlite:///{tmp_path / 'discoveries.db'}")
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
        record_discovery(db, user_id, payload, WHEN)
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


def _item(journal: dict, discovery_id: str) -> dict:
    return next(item for item in journal["discoveries"] if item["id"] == discovery_id)


def test_three_hotspots_record_once_and_do_not_touch_life_rows(tmp_path: Path) -> None:
    database = _file_db(tmp_path)
    db = _session(database)
    try:
        listed = read_journal(db, 1)
        assert listed["revision"] == 0
        assert [item["id"] for item in listed["discoveries"]] == list(_IDS)
        assert all(item["found"] is False for item in listed["discoveries"])
        assert "expire" not in _item(listed, "hall-sundial")["reaction"].casefold()
        created, first = record_discovery(db, 1, BELL, WHEN)
        assert first is True
        assert created["revision"] == 1
        assert _item(created, "ferry-bell")["found"] is True
        assert _item(created, "ferry-bell")["reaction"].startswith("You ring the model ferry bell.")
        replay, again = record_discovery(db, 1, BELL, WHEN)
        assert again is False
        assert replay["revision"] == 1
        assert _count(db, DiscoveryStamp, 1) == 1
        scope, added = record_discovery(db, 1, SCOPE, WHEN)
        assert added is True
        assert scope["revision"] == 2
        chalk, marked = record_discovery(db, 1, CHALK, WHEN)
        assert marked is True
        assert chalk["revision"] == 3
        assert _item(chalk, "gym-chalkboard")["reaction"].endswith("No workout is recorded.")
        assert _item(chalk, "rooftop-telescope")["found"] is True
        assert _count(db, DiscoveryStamp, 1) == 3
        stale_same, repeated = record_discovery(
            db, 1, {"discovery_id": "ferry-bell", "expected_revision": 0}, WHEN
        )
        assert repeated is False
        assert stale_same["revision"] == 3
        assert _count(db, DiscoveryStamp, 1) == 3
        db.commit()
        stale = _reject(db, {"discovery_id": "arcade-sign", "expected_revision": 1})
        assert stale.status_code == 409 and stale.code == "discovery_conflict"
        assert _count(db, DiscoveryStamp, 1) == 3
        assert read_journal(db, 1)["revision"] == 3
        for extra in ({"weight": 70}, {"trip_id": 4}, {"workout": "run"}, {"note": "private"}):
            rejected = _reject(db, {**BELL, **extra})
            assert rejected.status_code == 422 and rejected.code == "validation_error"
        assert (
            _reject(db, {"discovery_id": "not-a-place", "expected_revision": 3}).status_code == 422
        )
        assert _count(db, DiscoveryStamp, 1) == 3
        assert _count(db, StampWallet) == 0
        assert _count(db, StampReceipt) == 0
        assert _count(db, QuestStep) == 0
        assert _count(db, HabitCheckin) == 0
        found: set[str] = set()
        _keys(read_journal(db, 1), found)
        assert _FORBIDDEN.isdisjoint(found)
        assert read_journal(db, 2)["revision"] == 0
    finally:
        db.close()
        database.engine.dispose()


def test_http_replay_keeps_the_saved_trip_and_library_empty(tmp_path, monkeypatch) -> None:
    _quiet(monkeypatch)
    application, database = _app(tmp_path)
    TownBase.metadata.create_all(database.engine)
    _user(database, 1, "tok", "csrf-token")
    _user(database, 2, "tok2", "csrf-2")
    application.dependency_overrides[get_town_clock] = lambda: WHEN
    db = database.sessionmaker()
    _add(db, 1, "Read", 0, "forge", 7, date(2026, 11, 2), [date(2026, 11, 2)])
    db.execute(
        text(
            "INSERT INTO trips (user_id, title, start_date, end_date, status, counts_as_pto, "
            "created_at, updated_at) VALUES (1, 'Saved ferry week', '2026-12-01', '2026-12-03', "
            "'planning', 0, '2026-11-02', '2026-11-02')"
        )
    )
    db.commit()
    checkins = _count(db, HabitCheckin, 1)
    db.close()
    with TestClient(application) as client:
        missing = _call(client, "post", "/api/town/discoveries", json=BELL)
        assert missing.status_code == 401
        blocked = _call(client, "post", "/api/town/discoveries", token="tok", json=BELL)
        assert blocked.status_code == 403
        before = _call(client, "get", "/api/town", token="tok", params={"tz": "UTC"})
        assert before.status_code == 200, before.text
        xp = before.json()["town"]["xp"]
        created = _call(
            client, "post", "/api/town/discoveries", token="tok", csrf="csrf-token", json=BELL
        )
        assert created.status_code == 201, created.text
        assert created.json()["revision"] == 1
        assert _item(created.json(), "ferry-bell")["found"] is True
        replay = _call(
            client,
            "post",
            "/api/town/discoveries",
            token="tok",
            csrf="csrf-token",
            json=BELL,
        )
        assert replay.status_code == 200, replay.text
        assert replay.json()["revision"] == 1
        hidden = _call(client, "get", "/api/town/discoveries", token="tok2")
        assert hidden.status_code == 200
        assert hidden.json()["revision"] == 0
        assert _item(hidden.json(), "ferry-bell")["found"] is False
        scope = _call(
            client,
            "post",
            "/api/town/discoveries",
            token="tok",
            csrf="csrf-token",
            json=SCOPE,
        )
        assert scope.status_code == 201
        chalk = _call(
            client,
            "post",
            "/api/town/discoveries",
            token="tok",
            csrf="csrf-token",
            json=CHALK,
        )
        assert chalk.status_code == 201
        assert chalk.json()["revision"] == 3
        conflict = _call(
            client,
            "post",
            "/api/town/discoveries",
            token="tok",
            csrf="csrf-token",
            json={"discovery_id": "arcade-sign", "expected_revision": 1},
        )
        assert conflict.status_code == 409
        assert conflict.json()["code"] == "discovery_conflict"
        current = _call(client, "get", "/api/town/discoveries", token="tok")
        assert current.json()["revision"] == 3
        assert _item(current.json(), "arcade-sign")["found"] is False
        after = _call(client, "get", "/api/town", token="tok", params={"tz": "UTC"})
        assert after.json()["town"]["xp"] == xp
        removed = _call(client, "delete", "/api/town/discoveries", token="tok", csrf="csrf-token")
        assert removed.status_code == 405 or removed.status_code == 404
    seen = database.sessionmaker()
    try:
        assert seen.execute(text("SELECT title, status FROM trips")).fetchone() == (
            "Saved ferry week",
            "planning",
        )
        assert seen.execute(text("SELECT COUNT(*) FROM user_entries")).scalar_one() == 0
        assert _count(seen, HabitCheckin, 1) == checkins
        assert _count(seen, StampReceipt) == 0
        assert _count(seen, QuestStep) == 0
        assert _count(seen, DiscoveryStamp, 1) == 3
        assert _count(seen, DiscoveryStamp, 2) == 0
    finally:
        seen.close()
        database.engine.dispose()


def test_upgrade_preserves_dialogue_and_downgrade_drops_only_discoveries(tmp_path: Path) -> None:
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
            "INSERT INTO town_dialogue_journals (user_id, revision, updated_at) "
            "VALUES (1, 2, '2026-11-02T20:00:00+00:00')"
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
        assert db.execute("SELECT revision FROM town_dialogue_journals").fetchone() == (2,)
        assert db.execute("SELECT COUNT(*) FROM town_discovery_journals").fetchone() == (0,)
        table_sql = db.execute(
            "SELECT sql FROM sqlite_master WHERE name = 'town_discovery_stamps'"
        ).fetchone()
        assert table_sql is not None
        assert discovery_check_sql() in table_sql[0]
        assert len(DISCOVERIES) == 12
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
                "INSERT INTO town_discovery_stamps (user_id, discovery_id, created_at) "
                "VALUES (1, 'not-a-place', '2026-11-02T20:00:00+00:00')"
            )
    command.downgrade(config, PARENT)
    assert current_revision(database) == PARENT
    with sqlite3.connect(database) as db:
        names = {
            row[0] for row in db.execute("SELECT name FROM sqlite_master WHERE type = 'table'")
        }
        assert "town_discovery_journals" not in names
        assert "town_discovery_stamps" not in names
        assert "town_dialogue_journals" in names
        assert db.execute("SELECT note FROM kept_unsupported").fetchone() == ("keep",)


def test_delete_user_account_removes_only_that_owners_discoveries(tmp_path: Path) -> None:
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
        record_discovery(db, kept.id, BELL, WHEN)
        record_discovery(db, deleted.id, BELL, WHEN)
        db.commit()
        delete_user_account(db, deleted, actor_user_id=kept.id)
        db.commit()
        assert _count(db, DiscoveryStamp, deleted.id) == 0
        assert _count(db, DiscoveryJournal, deleted.id) == 0
        assert read_journal(db, kept.id)["revision"] == 1
        assert _item(read_journal(db, kept.id), "ferry-bell")["found"] is True
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
    record_discovery(db, 1, BELL, WHEN)
    record_discovery(db, 2, BELL, WHEN)
    db.commit()
    db.close()
    with TestClient(application) as client:
        body = client.get("/api/town/discoveries").json()
        assert body["revision"] == 1
        assert _item(body, "ferry-bell")["found"] is True
        assert sum(1 for item in body["discoveries"] if item["found"]) == 1
    database.engine.dispose()
