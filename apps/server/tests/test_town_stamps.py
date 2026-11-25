"""Stamp wallet: zero start, idempotent grants, atomic spend and refund."""

from __future__ import annotations

import asyncio
import sqlite3
import threading
from datetime import UTC, datetime
from pathlib import Path
from types import SimpleNamespace

import pytest
from alembic import command
from fastapi.testclient import TestClient
from httpx import ASGITransport, AsyncClient
from sqlalchemy import event, func, select
from sqlalchemy.exc import IntegrityError

from apps.server.auth import Principal, require_principal
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
from apps.server.tests.test_town_api_read import _open
from apps.server.tests.test_town_api_write import _quiet
from apps.server.town.models import StampEntitlement, StampReceipt, StampWallet, TownBase
from apps.server.town.stamps import grant_stamps, purchase_stamps, read_wallet, refund_stamps

PARENT = "site_trip_draft_v1"
HEAD = "site_town_layouts_v1"
WHEN = datetime(2026, 10, 29, 19, 0, tzinfo=UTC)
GRANT = {"grant_key": "quest:chapter-1", "amount": 10, "consumer": "quest"}
_CHECK = "Check the highlighted fields."


def _file_db(tmp_path: Path):
    database = open_database(f"sqlite:///{tmp_path / 'stamps.db'}")
    TownBase.metadata.create_all(database.engine)
    return database


def _session(database):
    return database.sessionmaker()


def test_wallet_starts_at_zero_and_names_consumers(tmp_path: Path) -> None:
    database = _file_db(tmp_path)
    db = _session(database)
    try:
        wallet = read_wallet(db, 1)
        assert wallet["balance"] == 0
        assert wallet["receipts"] == []
        assert wallet["entitlements"] == []
        assert [item["id"] for item in wallet["consumers"]] == ["market", "quest", "minigame"]
        assert set(wallet) == {"balance", "consumers", "receipts", "entitlements"}
    finally:
        db.close()
        database.engine.dispose()


def test_private_fields_do_not_create_a_receipt(tmp_path: Path) -> None:
    database = _file_db(tmp_path)
    db = _session(database)
    try:
        for extra in ({"weight": 70}, {"steps": 100}, {"trip_id": 4}, {"balance_cents": 10}):
            with pytest.raises(APIError) as caught:
                grant_stamps(db, 1, {**GRANT, **extra}, WHEN)
            assert caught.value.status_code == 422
            assert caught.value.code == "validation_error"
            db.rollback()
        with pytest.raises(APIError):
            grant_stamps(db, 1, {**GRANT, "amount": True}, WHEN)
        db.rollback()
        assert db.scalar(select(func.count()).select_from(StampReceipt)) == 0
        assert db.scalar(select(func.count()).select_from(StampWallet)) == 0
    finally:
        db.close()
        database.engine.dispose()


def test_repeat_grant_returns_one_receipt(tmp_path: Path) -> None:
    database = _file_db(tmp_path)
    db = _session(database)
    try:
        first, created = grant_stamps(db, 1, GRANT, WHEN)
        assert created is True
        db.commit()
        second, again = grant_stamps(db, 1, {**GRANT, "amount": 5, "consumer": "minigame"}, WHEN)
        assert again is False
        db.commit()
        assert first["receipts"][0]["id"] == second["receipts"][0]["id"]
        assert second["balance"] == 10
        assert second["receipts"][0]["amount"] == 10
        assert second["receipts"][0]["consumer"] == "quest"
        assert len(second["receipts"]) == 1
        assert "user_id" not in second["receipts"][0]
    finally:
        db.close()
        database.engine.dispose()


def _race(database, calls: list) -> tuple[list, list[str]]:
    barrier = threading.Barrier(len(calls))
    results: list = []
    errors: list[str] = []

    def run(call) -> None:
        db = _session(database)
        try:
            barrier.wait(5)
            try:
                wallet, created = call(db)
                db.commit()
                results.append(
                    (created, wallet["balance"], [row["id"] for row in wallet["receipts"]])
                )
            except APIError as exc:
                db.rollback()
                errors.append(exc.code)
        finally:
            db.close()

    threads = [threading.Thread(target=run, args=(call,)) for call in calls]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join(10)
        assert not thread.is_alive()
    return results, errors


def test_racing_grants_produce_one_receipt(tmp_path: Path) -> None:
    database = _file_db(tmp_path)
    try:
        results, errors = _race(
            database,
            [
                lambda db: grant_stamps(db, 1, GRANT, WHEN),
                lambda db: grant_stamps(db, 1, GRANT, WHEN),
            ],
        )
        assert errors == []
        assert sorted(created for created, _, _ in results) == [False, True]
        assert {balance for _, balance, _ in results} == {10}
        assert results[0][2] == results[1][2]
        db = _session(database)
        wallet = read_wallet(db, 1)
        db.close()
        assert wallet["balance"] == 10
        assert len(wallet["receipts"]) == 1
    finally:
        database.engine.dispose()


def test_racing_purchases_cannot_go_negative(tmp_path: Path) -> None:
    database = _file_db(tmp_path)
    db = _session(database)
    try:
        grant_stamps(db, 1, GRANT, WHEN)
        db.commit()
        buy_a = {
            "grant_key": "market:buy:tile-fountain",
            "catalog_id": "tile-fountain",
            "amount": 10,
        }
        buy_b = {"grant_key": "market:buy:globe", "catalog_id": "globe", "amount": 10}
        results, errors = _race(
            database,
            [
                lambda db: purchase_stamps(db, 1, buy_a, WHEN),
                lambda db: purchase_stamps(db, 1, buy_b, WHEN),
            ],
        )
        assert errors == ["insufficient_stamps"]
        assert len(results) == 1
        assert results[0][0] is True
        assert results[0][1] == 0
        later = _session(database)
        wallet = read_wallet(later, 1)
        later.close()
        assert wallet["balance"] == 0
        assert len(wallet["receipts"]) == 2
        assert wallet["balance"] >= 0
    finally:
        db.close()
        database.engine.dispose()


def test_refund_is_idempotent_and_a_second_key_does_not_credit_twice(tmp_path: Path) -> None:
    database = _file_db(tmp_path)
    db = _session(database)
    try:
        grant_stamps(db, 1, GRANT, WHEN)
        purchase_stamps(
            db,
            1,
            {"grant_key": "market:buy:tile-fountain", "catalog_id": "tile-fountain", "amount": 10},
            WHEN,
        )
        db.commit()
        spend_id = read_wallet(db, 1)["entitlements"][0]["spend_receipt_id"]
        key = f"market:refund:tile-fountain:{spend_id}"
        body = {"grant_key": key, "catalog_id": "tile-fountain"}
        other = {"grant_key": "market:refund:tile-fountain:other", "catalog_id": "tile-fountain"}
        results, errors = _race(
            database,
            [
                lambda db: refund_stamps(db, 1, body, WHEN),
                lambda db: refund_stamps(db, 1, body, WHEN),
            ],
        )
        assert errors == []
        assert sorted(created for created, _, _ in results) == [False, True]
        later = _session(database)
        wallet = read_wallet(later, 1)
        assert wallet["balance"] == 10
        assert sum(1 for row in wallet["receipts"] if row["kind"] == "refund") == 1
        with pytest.raises(APIError) as caught:
            refund_stamps(later, 1, other, WHEN)
        assert caught.value.status_code == 404
        later.rollback()
        assert read_wallet(later, 1)["balance"] == 10
        later.close()
    finally:
        db.close()
        database.engine.dispose()


def test_a_waiting_purchase_allows_the_prior_purchase_to_commit(tmp_path, monkeypatch) -> None:
    _quiet(monkeypatch)
    application, database = _open(tmp_path, Principal(1, "ada", "Ada"))
    application.dependency_overrides[get_current_user] = lambda: SimpleNamespace(id=1)
    winner = {"grant_key": "market:buy:globe", "catalog_id": "globe"}
    loser = {"grant_key": "market:buy:tile-fountain", "catalog_id": "tile-fountain"}

    async def compete(holder):
        loop = asyncio.get_running_loop()
        attempted_lock = asyncio.Event()

        @event.listens_for(database.engine, "before_cursor_execute")
        def notice_lock_attempt(_conn, _cursor, statement, _params, _context, _many):
            if statement.startswith("INSERT INTO town_stamp_wallets"):
                loop.call_soon_threadsafe(attempted_lock.set)

        transport = ASGITransport(app=application, raise_app_exceptions=False)
        async with AsyncClient(transport=transport, base_url="http://testserver") as client:
            async with asyncio.TaskGroup() as group:
                request = group.create_task(client.post("/api/town/stamps/purchases", json=loser))
                await asyncio.wait_for(attempted_lock.wait(), timeout=10)
                holder.commit()
            return request.result()

    try:
        with database.sessionmaker() as holder:
            grant_stamps(holder, 1, GRANT, WHEN)
            holder.commit()
            _, created = purchase_stamps(holder, 1, winner, WHEN)
            assert created
            response = asyncio.run(compete(holder))
            assert response.status_code == 409
            assert response.json()["code"] == "insufficient_stamps"
            wallet = read_wallet(holder, 1)
            assert wallet["balance"] == 0
            assert [item["catalog_id"] for item in wallet["entitlements"]] == ["globe"]
    finally:
        database.engine.dispose()


def test_repurchase_after_refund_uses_the_same_entitlement(tmp_path: Path) -> None:
    database = _file_db(tmp_path)
    db = _session(database)
    try:
        grant_stamps(db, 1, GRANT, WHEN)
        grant_stamps(
            db, 1, {"grant_key": "quest:chapter-2", "amount": 10, "consumer": "quest"}, WHEN
        )
        purchase_stamps(
            db,
            1,
            {"grant_key": "market:buy:globe", "catalog_id": "globe", "amount": 10},
            WHEN,
        )
        db.commit()
        spend_id = read_wallet(db, 1)["entitlements"][0]["spend_receipt_id"]
        refund_stamps(
            db, 1, {"grant_key": f"market:refund:globe:{spend_id}", "catalog_id": "globe"}, WHEN
        )
        db.commit()
        again, created = purchase_stamps(
            db,
            1,
            {"grant_key": "market:buy:globe:again", "catalog_id": "globe", "amount": 10},
            WHEN,
        )
        assert created is True
        db.commit()
        assert again["balance"] == 10
        assert len(again["entitlements"]) == 1
        assert again["entitlements"][0]["active"] is True
        assert db.scalar(select(func.count()).select_from(StampEntitlement)) == 1
    finally:
        db.close()
        database.engine.dispose()


def test_other_owner_cannot_read_or_refund(tmp_path: Path) -> None:
    database = _file_db(tmp_path)
    db = _session(database)
    try:
        grant_stamps(db, 1, {**GRANT, "amount": 20}, WHEN)
        purchase_stamps(
            db,
            1,
            {"grant_key": "market:buy:moon-clock", "catalog_id": "moon-clock", "amount": 20},
            WHEN,
        )
        db.commit()
        other = read_wallet(db, 2)
        assert other["balance"] == 0
        assert other["receipts"] == []
        assert other["entitlements"] == []
        with pytest.raises(APIError) as caught:
            refund_stamps(
                db, 2, {"grant_key": "market:refund:moon-clock:1", "catalog_id": "moon-clock"}, WHEN
            )
        assert caught.value.status_code == 404
        db.rollback()
        assert read_wallet(db, 1)["balance"] == 0
        assert len(read_wallet(db, 1)["receipts"]) == 2
    finally:
        db.close()
        database.engine.dispose()


def test_grant_receipt_cannot_be_refunded(tmp_path: Path) -> None:
    database = _file_db(tmp_path)
    db = _session(database)
    try:
        grant_stamps(db, 1, GRANT, WHEN)
        db.flush()
        receipt = db.scalar(select(StampReceipt))
        assert receipt is not None
        db.add(
            StampEntitlement(
                user_id=1,
                catalog_id="shell-stool",
                spend_receipt_id=receipt.id,
                refund_receipt_id=None,
            )
        )
        db.commit()
        before = read_wallet(db, 1)["balance"]
        with pytest.raises(APIError) as caught:
            refund_stamps(
                db,
                1,
                {"grant_key": "market:refund:shell-stool:1", "catalog_id": "shell-stool"},
                WHEN,
            )
        assert caught.value.status_code == 404
        db.rollback()
        assert read_wallet(db, 1)["balance"] == before
    finally:
        db.close()
        database.engine.dispose()


def test_integrity_error_returns_the_committed_receipt(tmp_path: Path) -> None:
    database = _file_db(tmp_path)
    seeded = _session(database)
    try:
        grant_stamps(seeded, 1, GRANT, WHEN)
        seeded.commit()
        db = _session(database)
        calls = {"n": 0}
        real_scalar = db.scalar

        def scalar(statement):
            calls["n"] += 1
            if calls["n"] == 1:
                return None
            return real_scalar(statement)

        def boom(*_args, **_kwargs):
            raise IntegrityError("INSERT", {}, Exception("unique"))

        db.scalar = scalar
        db.flush = boom
        wallet, created = grant_stamps(db, 1, GRANT, WHEN)
        assert created is False
        assert wallet["balance"] == 10
        assert len(wallet["receipts"]) == 1
    finally:
        seeded.close()
        database.engine.dispose()


def test_integrity_error_without_a_winner_leaves_zero(tmp_path: Path) -> None:
    database = _file_db(tmp_path)
    db = _session(database)
    try:
        calls = {"n": 0}
        real_scalar = db.scalar

        def scalar(statement):
            calls["n"] += 1
            if calls["n"] == 1:
                return None
            return real_scalar(statement)

        def boom(*_args, **_kwargs):
            raise IntegrityError("INSERT", {}, Exception("check"))

        db.scalar = scalar
        db.flush = boom
        with pytest.raises(APIError) as caught:
            grant_stamps(db, 1, GRANT, WHEN)
        assert caught.value.code == "stamp_conflict"
        fresh = _session(database)
        assert read_wallet(fresh, 1)["balance"] == 0
        assert read_wallet(fresh, 1)["receipts"] == []
        fresh.close()
    finally:
        db.close()
        database.engine.dispose()


@pytest.fixture
def api(tmp_path, monkeypatch):
    _quiet(monkeypatch)
    folder = tmp_path / "http"
    folder.mkdir()
    application, database = _open(folder, Principal(1, "ada", "Ada"))
    application.dependency_overrides[get_current_user] = lambda: SimpleNamespace(id=1)
    with TestClient(application) as client:
        yield client, database, application
    database.engine.dispose()


def test_http_retry_is_one_receipt_and_hides_the_owner(api) -> None:
    client, database, application = api
    first = client.post("/api/town/stamps/grants", json=GRANT)
    assert first.status_code == 201, first.text
    body = first.json()
    assert body["balance"] == 10
    assert set(body) == {"balance", "consumers", "receipts", "entitlements"}
    assert "user_id" not in body["receipts"][0]
    second = client.post(
        "/api/town/stamps/grants",
        json={"grant_key": "quest:chapter-1", "amount": 20, "consumer": "minigame"},
    )
    assert second.status_code == 200
    assert second.json()["receipts"][0]["id"] == body["receipts"][0]["id"]
    assert second.json()["balance"] == 10
    bought = client.post(
        "/api/town/stamps/purchases",
        json={"grant_key": "market:buy:tile-fountain", "catalog_id": "tile-fountain", "amount": 10},
    )
    assert bought.status_code == 201, bought.text
    assert bought.json()["balance"] == 0
    spend_id = bought.json()["entitlements"][0]["spend_receipt_id"]
    refunded = client.post(
        "/api/town/stamps/refunds",
        json={
            "grant_key": f"market:refund:tile-fountain:{spend_id}",
            "catalog_id": "tile-fountain",
        },
    )
    assert refunded.status_code == 201, refunded.text
    assert refunded.json()["balance"] == 10
    assert refunded.json()["entitlements"][0]["active"] is False
    again = client.post(
        "/api/town/stamps/refunds",
        json={
            "grant_key": f"market:refund:tile-fountain:{spend_id}",
            "catalog_id": "tile-fountain",
        },
    )
    assert again.status_code == 200
    assert again.json()["balance"] == 10
    rejected = client.post(
        "/api/town/stamps/grants", json={**GRANT, "weight": 80, "grant_key": "quest:b"}
    )
    assert rejected.status_code == 422
    assert rejected.json()["field_errors"] is None
    application.dependency_overrides[require_principal] = lambda: Principal(2, "bea", "Bea")
    application.dependency_overrides[get_current_user] = lambda: SimpleNamespace(id=2)
    hidden = client.get("/api/town/stamps")
    assert hidden.status_code == 200
    assert hidden.json()["receipts"] == []
    assert hidden.json()["balance"] == 0
    denied = client.post(
        "/api/town/stamps/refunds",
        json={"grant_key": "market:refund:tile-fountain:1", "catalog_id": "tile-fountain"},
    )
    assert denied.status_code == 404
    db = database.sessionmaker()
    assert (
        db.scalar(select(func.count()).select_from(StampReceipt).where(StampReceipt.user_id == 2))
        == 0
    )
    db.close()


def test_http_purchase_refuses_an_active_unlock_and_an_empty_wallet(api) -> None:
    client, database, _application = api
    poor = client.post(
        "/api/town/stamps/purchases",
        json={"grant_key": "market:buy:globe", "catalog_id": "globe", "amount": 10},
    )
    assert poor.status_code == 409
    assert poor.json()["code"] == "insufficient_stamps"
    client.post("/api/town/stamps/grants", json=GRANT)
    client.post(
        "/api/town/stamps/purchases",
        json={"grant_key": "market:buy:globe", "catalog_id": "globe", "amount": 10},
    )
    duplicate = client.post(
        "/api/town/stamps/purchases",
        json={"grant_key": "market:buy:globe-2", "catalog_id": "globe", "amount": 10},
    )
    assert duplicate.status_code == 409
    assert duplicate.json()["code"] == "already_unlocked"
    db = database.sessionmaker()
    assert read_wallet(db, 1)["balance"] == 0
    db.close()


def test_market_prices_are_server_owned_and_an_old_refund_cannot_revoke_a_new_unlock(api) -> None:
    client, _database, _application = api
    purchase = {"grant_key": "market:buy:globe", "catalog_id": "globe"}
    client.post("/api/town/stamps/grants", json={**GRANT, "amount": 20})
    bad_price = client.post("/api/town/stamps/purchases", json={**purchase, "amount": 1})
    assert bad_price.status_code == 422
    assert bad_price.json()["code"] == "stamp_price_changed"
    for catalog_id in ("oak-seat", "future-cabinet"):
        unavailable = client.post(
            "/api/town/stamps/purchases", json={**purchase, "catalog_id": catalog_id}
        )
        assert unavailable.status_code == 422
        assert unavailable.json()["code"] == "item_not_for_sale"
    assert client.get("/api/town/stamps").json()["balance"] == 20

    first = client.post("/api/town/stamps/purchases", json=purchase)
    assert first.status_code == 201
    assert first.json()["balance"] == 10
    spend_id = first.json()["entitlements"][0]["spend_receipt_id"]
    refund = {
        "grant_key": f"market:refund:globe:{spend_id}",
        "catalog_id": "globe",
        "spend_receipt_id": spend_id,
    }
    assert client.post("/api/town/stamps/refunds", json=refund).status_code == 201
    assert (
        client.post(
            "/api/town/stamps/purchases", json={**purchase, "grant_key": "market:buy:second"}
        ).status_code
        == 201
    )
    retry = client.post("/api/town/stamps/refunds", json=refund)
    assert retry.status_code == 200
    assert retry.json()["entitlements"][0]["active"]
    stale = client.post(
        "/api/town/stamps/refunds", json={**refund, "grant_key": "market:refund:stale"}
    )
    assert stale.status_code == 409
    assert stale.json()["code"] == "unlock_changed"
    assert client.get("/api/town/stamps").json()["balance"] == 10


def test_upgrade_keeps_unsupported_rows_and_downgrade_drops_only_stamps(tmp_path: Path) -> None:
    database = tmp_path / "site.db"
    config = make_config(sqlite_url(database))
    command.upgrade(config, PARENT)
    with sqlite3.connect(database) as db:
        db.execute("CREATE TABLE kept_unsupported (id INTEGER PRIMARY KEY, note TEXT NOT NULL)")
        db.execute("INSERT INTO kept_unsupported (note) VALUES ('keep')")
        db.execute(
            "INSERT INTO users (email, display_name, role, is_active, must_change_password, "
            "created_at, updated_at) VALUES ('synthetic@example.invalid', 'Synthetic', 'user', "
            "1, 0, '2026-01-01', '2026-01-01')"
        )
        db.execute(
            "INSERT INTO habits (user_id, name, slot, building_style, per_week, created_on, "
            "created_at, name_key) VALUES (1, 'Read', 0, 'forge', 7, '2026-03-01', "
            "'2026-03-01T00:00:00+00:00', 'read')"
        )
        db.commit()
    command.upgrade(config, HEAD)
    assert current_revision(database) == HEAD
    assert head_revision() == HEAD
    diff = model_diff(database)
    assert [item[0] for item in diff] == ["remove_table"]
    assert diff[0][1].name == "kept_unsupported"
    with sqlite3.connect(database) as db:
        assert db.execute("SELECT name, name_key FROM habits").fetchone() == ("Read", "read")
        assert db.execute("SELECT note FROM kept_unsupported").fetchone() == ("keep",)
        for table in ("town_stamp_wallets", "town_stamp_receipts", "town_stamp_entitlements"):
            assert db.execute(f"SELECT COUNT(*) FROM {table}").fetchone() == (0,)
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
            db.execute("INSERT INTO town_stamp_wallets (user_id, balance) VALUES (1, -1)")
    command.downgrade(config, PARENT)
    assert current_revision(database) == PARENT
    with sqlite3.connect(database) as db:
        names = {
            row[0] for row in db.execute("SELECT name FROM sqlite_master WHERE type = 'table'")
        }
        assert "town_stamp_wallets" not in names
        assert "town_stamp_receipts" not in names
        assert "town_stamp_entitlements" not in names
        assert "town_room_layouts" not in names
        assert db.execute("SELECT note FROM kept_unsupported").fetchone() == ("keep",)
        assert db.execute("SELECT name FROM habits").fetchone() == ("Read",)
        assert db.execute(
            "SELECT COUNT(*) FROM site_revision_compatibility WHERE revision = ?",
            (HEAD,),
        ).fetchone() == (0,)


def test_delete_user_account_removes_only_that_owners_stamps(tmp_path: Path) -> None:
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
        grant_stamps(
            db, kept.id, {"grant_key": "minigame:day-1", "amount": 5, "consumer": "minigame"}, WHEN
        )
        grant_stamps(db, deleted.id, GRANT, WHEN)
        purchase_stamps(
            db,
            deleted.id,
            {"grant_key": "market:buy:shell-stool", "catalog_id": "shell-stool", "amount": 5},
            WHEN,
        )
        db.commit()
        delete_user_account(db, deleted, actor_user_id=kept.id)
        db.commit()
        for model in (StampWallet, StampReceipt, StampEntitlement):
            assert (
                db.scalar(
                    select(func.count()).select_from(model).where(model.user_id == deleted.id)
                )
                == 0
            )
        assert read_wallet(db, kept.id)["balance"] == 5
        assert len(read_wallet(db, kept.id)["receipts"]) == 1
    finally:
        db.close()
        opened.engine.dispose()
