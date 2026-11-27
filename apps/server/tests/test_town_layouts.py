"""Room layouts: caps, Stamp entitlements, revision checks, and private fields."""

from __future__ import annotations

import json
import re
import sqlite3
import threading
from datetime import UTC, date, datetime, timedelta
from pathlib import Path
from types import SimpleNamespace

import pytest
from alembic import command
from alembic.script import ScriptDirectory
from fastapi.testclient import TestClient
from sqlalchemy import func, select, text
from sqlalchemy.exc import IntegrityError

from apps.server.auth import Principal
from apps.server.database import open_database
from apps.server.errors import APIError
from apps.server.identity.admin import delete_user_account
from apps.server.identity.models import User
from apps.server.identity.session import get_current_user
from apps.server.main import Dependencies, Settings, create_app
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
from apps.server.town import layouts
from apps.server.town.clock import get_town_clock
from apps.server.town.layouts import read_layout, save_layout
from apps.server.town.models import (
    HabitCheckin,
    RoomLayout,
    StampEntitlement,
    StampReceipt,
    StampWallet,
    TownBase,
)
from apps.server.town.stamps import grant_stamps, purchase_stamps, read_wallet, refund_stamps

PARENT = "site_town_stamps_v1"
HEAD = "site_town_quests_v1"
WHEN = datetime(2026, 11, 2, 16, 0, tzinfo=UTC)
_CHECK = "Check the highlighted fields."
_LOCKED = "That item is not unlocked."
_PUBLIC = (
    "instance_id",
    "catalog_id",
    "anchor",
    "column",
    "row",
    "slot",
    "orientation",
    "palette",
)
CATALOG_FILE = Path(__file__).resolve().parents[3] / "apps/web/src/app/town/cosmetic-catalog.ts"


def _piece(
    instance: str,
    catalog: str,
    *,
    anchor: str = "floor",
    column: int | None = 0,
    row: int | None = 0,
    slot: str | None = None,
    orientation: int = 0,
    palette: int = 0,
    **extra: object,
) -> dict:
    item: dict[str, object] = {
        "instance_id": instance,
        "catalog_id": catalog,
        "anchor": anchor,
        "column": column,
        "row": row,
        "slot": slot,
        "orientation": orientation,
        "palette": palette,
    }
    item.update(extra)
    return item


def _body(items: list[dict], expected: int = 0) -> dict:
    return {"expected_revision": expected, "items": items}


LIVING = [
    _piece("living-rug", "woven-rug", column=1, row=2),
    _piece("living-table", "low-table", column=4, row=4),
    _piece("living-seat", "oak-seat", column=4, row=6),
    _piece("living-lantern", "floor-lantern", column=9, row=7),
    _piece(
        "living-frame", "plain-frame", anchor="wall", column=None, row=None, slot="living-north"
    ),
]
STUDY = [
    _piece("study-desk", "desk", column=2, row=5),
    _piece("study-lamp", "desk-lamp", column=3, row=5),
    _piece("study-shelf", "bookshelf", column=8, row=2),
]


def _file_db(tmp_path: Path):
    database = open_database(f"sqlite:///{tmp_path / 'layouts.db'}")
    TownBase.metadata.create_all(database.engine)
    return database


def _session(database):
    return database.sessionmaker()


def _save(db, room: str, items: list[dict], expected: int = 0, user: int = 1):
    return save_layout(db, user, room, _body(items, expected), WHEN)


def _count(db, user: int | None = None) -> int:
    query = select(func.count()).select_from(RoomLayout)
    if user is not None:
        query = query.where(RoomLayout.user_id == user)
    return int(db.scalar(query) or 0)


def _payload(db, user: int, room: str) -> str | None:
    return db.scalar(
        select(RoomLayout.payload).where(RoomLayout.user_id == user, RoomLayout.room_id == room)
    )


def _legacy_purchase(db, catalog_id: str) -> StampEntitlement:
    """Seed the receipt and entitlement written before fixed catalog prices."""
    grant_stamps(db, 1, {"grant_key": "quest:layout", "amount": 20, "consumer": "quest"}, WHEN)
    wallet = db.get(StampWallet, 1)
    assert wallet is not None
    wallet.balance -= 5
    receipt = StampReceipt(
        user_id=1,
        grant_key=f"market:buy:{catalog_id}",
        consumer="market",
        kind="spend",
        amount=5,
        catalog_id=catalog_id,
        created_at=WHEN,
    )
    db.add(receipt)
    db.flush()
    entitlement = StampEntitlement(user_id=1, catalog_id=catalog_id, spend_receipt_id=receipt.id)
    db.add(entitlement)
    db.flush()
    return entitlement


def _reject(db, room: str, items: list[dict], expected: int = 0, user: int = 1) -> APIError:
    with pytest.raises(APIError) as caught:
        _save(db, room, items, expected, user)
    db.rollback()
    return caught.value


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


def test_catalog_matches_the_web_cosmetic_list() -> None:
    source = CATALOG_FILE.read_text()
    found: dict[str, tuple] = {}
    starter = re.compile(
        r"starter\('([^']+)', '[^']*', (\d+), (\d+), \d+, '(floor|wall)'"
        r"(?:, (true|false))?(?:, (true|false))?\)"
    )
    shop = re.compile(
        r"shop\('([^']+)', '[^']*', (\d+), (\d+), (\d+), \d+, '(floor|wall)'"
        r"(?:, (true|false))?(?:, (true|false))?\)"
    )
    for match in starter.finditer(source):
        found[match.group(1)] = (
            match.group(4),
            int(match.group(2)),
            int(match.group(3)),
            0,
            match.group(5) == "true",
            match.group(6) == "true",
        )
    for match in shop.finditer(source):
        found[match.group(1)] = (
            match.group(5),
            int(match.group(3)),
            int(match.group(4)),
            int(match.group(2)),
            match.group(6) == "true",
            match.group(7) == "true",
        )
    assert set(found) == set(layouts.CATALOG)
    for catalog_id, spec in layouts.CATALOG.items():
        assert found[catalog_id] == (
            spec.anchor,
            spec.columns,
            spec.rows,
            spec.price,
            spec.stackable,
            spec.surface,
        )
    for name in (
        "stepping-stone",
        "small-planter",
        "wooden-lantern",
        "wind-vane",
        "shell-marker",
        "path-lamp",
        "bench",
        "bird-bath",
        "civic-pennant",
    ):
        assert name not in layouts.CATALOG


def test_missing_room_is_empty_and_a_read_does_not_write(tmp_path: Path) -> None:
    database = _file_db(tmp_path)
    db = _session(database)
    try:
        assert read_layout(db, 1, "living") == {"room_id": "living", "revision": 0, "items": []}
        with pytest.raises(APIError) as caught:
            read_layout(db, 1, "attic")
        assert caught.value.status_code == 404
        assert caught.value.code == "layout_not_found"
        db.commit()
        assert _count(db) == 0
    finally:
        db.close()
        database.engine.dispose()


def test_table_checks_reject_a_zero_revision_and_a_bad_room(tmp_path: Path) -> None:
    database = _file_db(tmp_path)
    db = _session(database)
    try:
        db.add(RoomLayout(user_id=1, room_id="living", revision=0, payload="[]", updated_at=WHEN))
        with pytest.raises(IntegrityError):
            db.flush()
        db.rollback()
        db.add(RoomLayout(user_id=1, room_id="attic", revision=1, payload="[]", updated_at=WHEN))
        with pytest.raises(IntegrityError):
            db.flush()
        db.rollback()
        assert _count(db) == 0
    finally:
        db.close()
        database.engine.dispose()


def test_first_save_and_conflict_keep_one_public_row(tmp_path: Path) -> None:
    database = _file_db(tmp_path)
    db = _session(database)
    try:
        view, created = _save(db, "living", LIVING)
        assert created is True
        db.commit()
        assert view["revision"] == 1
        assert [item["catalog_id"] for item in view["items"]] == [
            "woven-rug",
            "low-table",
            "oak-seat",
            "floor-lantern",
            "plain-frame",
        ]
        assert all(set(item) == set(_PUBLIC) for item in view["items"])
        assert "note" not in json.dumps(view)
        conflict = _reject(db, "living", LIVING, 0)
        assert conflict.status_code == 409
        assert conflict.code == "layout_conflict"
        assert conflict.message == "This room was saved at revision 1."
        assert conflict.field_errors is None
        assert _payload(db, 1, "living") == json.dumps(view["items"], separators=(",", ":"))
        again, updated = _save(db, "living", LIVING, 1)
        db.commit()
        assert updated is False
        assert again["revision"] == 2
        assert _count(db) == 1
    finally:
        db.close()
        database.engine.dispose()


def test_study_stack_is_legal_and_private_keys_are_rejected(tmp_path: Path) -> None:
    database = _file_db(tmp_path)
    db = _session(database)
    try:
        view, created = _save(db, "study", STUDY)
        assert created is True
        db.commit()
        assert view["items"][1]["catalog_id"] == "desk-lamp"
        kept = _payload(db, 1, "study")
        rejected = _reject(db, "study", [{**STUDY[0], "note": "bp 120"}], 1)
        assert rejected.status_code == 422
        assert rejected.message == _CHECK
        assert _payload(db, 1, "study") == kept
    finally:
        db.close()
        database.engine.dispose()


def test_geometry_caps_and_doorway_write_nothing(tmp_path: Path) -> None:
    database = _file_db(tmp_path)
    db = _session(database)
    try:
        walls = [
            _piece(
                f"w{index}",
                "plain-frame",
                anchor="wall",
                column=None,
                row=None,
                slot="living-north",
            )
            for index in range(17)
        ]
        outside = [
            _piece(f"e{index}", "oak-seat", anchor="garden-0", column=None, row=None)
            for index in range(13)
        ]
        samples = [
            ("living", [_piece("a", "oak-seat", column=5, row=10)]),
            ("living", [_piece("a", "oak-seat"), _piece("a", "fern", column=1)]),
            ("living", [_piece("a", "oak-seat"), _piece("b", "fern")]),
            ("living", [_piece("lamp", "desk-lamp")]),
            ("living", [_piece("wide", "bookshelf", column=11, orientation=1)]),
            ("living", [_piece("frame", "plain-frame", column=1, row=1)]),
            (
                "living",
                [
                    _piece(
                        "seat",
                        "oak-seat",
                        anchor="wall",
                        column=None,
                        row=None,
                        slot="living-north",
                    )
                ],
            ),
            ("living", walls),
            ("exterior", outside),
            ("living", [_piece("out", "oak-seat", column=None, row=None, anchor="garden-0")]),
            ("living", [_piece("bad id", "oak-seat")]),
            ("living", [_piece("seat", "oak-seat", column=12)]),
        ]
        for room, items in samples:
            error = _reject(db, room, items)
            assert error.status_code == 422
            assert error.message == _CHECK
            assert error.field_errors is None
        assert _count(db) == 0
        outside = [
            _piece(f"{kind}-{index}", "oak-seat", anchor=f"{kind}-{index}", column=None, row=None)
            for kind in ("garden", "path", "civic")
            for index in range(4)
        ]
        view, created = _save(db, "exterior", outside)
        db.commit()
        assert created is True
        assert len(view["items"]) == 12
    finally:
        db.close()
        database.engine.dispose()


def test_wall_cap_and_wall_width_are_enforced(tmp_path: Path, monkeypatch) -> None:
    database = _file_db(tmp_path)
    db = _session(database)
    try:
        monkeypatch.setattr(layouts, "WALL_CAP", 1)
        error = _reject(
            db,
            "living",
            [
                _piece(
                    "a", "plain-frame", anchor="wall", column=None, row=None, slot="living-north"
                ),
                _piece(
                    "b", "plain-frame", anchor="wall", column=None, row=None, slot="living-west"
                ),
            ],
        )
        assert error.status_code == 422
        monkeypatch.setattr(layouts, "WALL_CAP", 16)
        monkeypatch.setitem(layouts.CATALOG, "plain-frame", layouts._spec("wall", 8, 1, 0))
        wide = _reject(
            db,
            "living",
            [_piece("a", "plain-frame", anchor="wall", column=None, row=None, slot="living-north")],
        )
        assert wide.status_code == 422
        assert _count(db) == 0
    finally:
        db.close()
        database.engine.dispose()


def test_stack_must_cover_one_surface(tmp_path: Path, monkeypatch) -> None:
    database = _file_db(tmp_path)
    db = _session(database)
    try:
        monkeypatch.setitem(
            layouts.CATALOG, "wide-cushion", layouts._spec("floor", 2, 1, 0, stackable=True)
        )
        error = _reject(
            db,
            "living",
            [
                _piece("table", "low-table", column=0, row=0),
                _piece("desk", "desk", column=2, row=0),
                _piece("pad", "wide-cushion", column=1, row=0),
            ],
        )
        assert error.status_code == 422
        assert _count(db) == 0
    finally:
        db.close()
        database.engine.dispose()


def test_priced_and_unknown_items_need_an_active_unlock(tmp_path: Path) -> None:
    database = _file_db(tmp_path)
    db = _session(database)
    try:
        locked = _reject(db, "living", [_piece("stool", "shell-stool", column=1)])
        assert locked.status_code == 409
        assert locked.code == "layout_entitlement"
        assert locked.message == _LOCKED
        assert "shell-stool" not in locked.message
        unknown = _reject(
            db,
            "exterior",
            [_piece("stone", "stepping-stone", anchor="garden-0", column=None, row=None)],
        )
        assert unknown.status_code == 409
        assert unknown.code == "layout_entitlement"
        assert _count(db) == 0
        entitlement = _legacy_purchase(db, "future-stool")
        db.commit()
        view, created = _save(
            db,
            "exterior",
            [_piece("future", "future-stool", anchor="garden-1", column=None, row=None)],
        )
        db.commit()
        assert created is True
        assert view["items"][0]["catalog_id"] == "future-stool"
        with pytest.raises(APIError, match="Remove every copy") as caught:
            refund_stamps(
                db,
                1,
                {"grant_key": "market:refund:future-stool:2", "catalog_id": "future-stool"},
                WHEN,
            )
        assert caught.value.code == "unlock_in_use"
        db.rollback()
        assert read_wallet(db, 1)["balance"] == 15
        # A pre-workshop refund could leave an unavailable item in an active layout.
        refund = StampReceipt(
            user_id=1,
            grant_key="market:refund:future-stool:2",
            consumer="market",
            kind="refund",
            amount=5,
            catalog_id="future-stool",
            created_at=WHEN,
        )
        db.add(refund)
        db.flush()
        entitlement.refund_receipt_id = refund.id
        db.commit()
        kept = _payload(db, 1, "exterior")
        blocked = _reject(
            db,
            "exterior",
            [_piece("future", "future-stool", anchor="garden-1", column=None, row=None)],
            1,
        )
        assert blocked.status_code == 409
        assert read_layout(db, 1, "exterior")["items"][0]["catalog_id"] == "future-stool"
        assert _payload(db, 1, "exterior") == kept
    finally:
        db.close()
        database.engine.dispose()


def test_owner_budget_rejects_without_replacing_other_rooms(tmp_path: Path, monkeypatch) -> None:
    database = _file_db(tmp_path)
    db = _session(database)
    try:
        for room in ("study", "bedroom", "courtyard", "exterior"):
            db.add(
                RoomLayout(
                    user_id=1,
                    room_id=room,
                    revision=1,
                    payload="[]" + " " * (layouts.ROOM_BYTES - 2),
                    updated_at=WHEN,
                )
            )
        db.commit()
        view, created = _save(db, "living", LIVING)
        db.commit()
        assert created is True
        assert view["revision"] == 1
        monkeypatch.setattr(layouts, "OWNER_BYTES", 100)
        before = _payload(db, 1, "living")
        error = _reject(db, "living", LIVING, 1)
        assert error.status_code == 422
        assert _payload(db, 1, "living") == before
        assert _count(db) == 5
    finally:
        db.close()
        database.engine.dispose()


def test_canonical_size_is_capped(tmp_path: Path, monkeypatch) -> None:
    database = _file_db(tmp_path)
    db = _session(database)
    try:
        monkeypatch.setattr(layouts, "ROOM_BYTES", 4)
        error = _reject(db, "living", [_piece("seat", "oak-seat")])
        assert error.status_code == 422
        assert _count(db) == 0
    finally:
        db.close()
        database.engine.dispose()


def test_stored_private_and_unknown_fields_stay_out_of_the_read(tmp_path: Path) -> None:
    database = _file_db(tmp_path)
    db = _session(database)
    try:
        _save(db, "living", [_piece("seat", "oak-seat", column=1, palette=2)])
        db.commit()
        row = db.scalar(select(RoomLayout).where(RoomLayout.room_id == "living"))
        assert row is not None
        stored = json.loads(row.payload)
        stored[0]["note"] = "bp 120 trip Lisbon"
        stored.append({"catalog_id": "not-an-item", "note": "weight 70"})
        row.payload = json.dumps(stored)
        raw = row.payload
        stamp = row.updated_at
        db.commit()
        view = read_layout(db, 1, "living")
        db.commit()
        assert view["revision"] == 1
        assert view["items"] == [
            {
                "instance_id": "seat",
                "catalog_id": "oak-seat",
                "anchor": "floor",
                "column": 1,
                "row": 0,
                "slot": None,
                "orientation": 0,
                "palette": 2,
            }
        ]
        assert view["recovery_required"] is True
        assert "bp 120" not in json.dumps(view)
        assert "weight 70" not in json.dumps(view)
        assert _reject(db, "living", LIVING, 1).code == "layout_recovery"
        fresh = db.scalar(select(RoomLayout).where(RoomLayout.room_id == "living"))
        assert fresh is not None
        assert fresh.payload == raw
        assert fresh.updated_at == stamp
        fresh.payload = '{"note":"secret measurement"}'
        db.commit()
        broken = read_layout(db, 1, "living")
        db.commit()
        assert broken["items"] == []
        grant_stamps(db, 1, {"grant_key": "quest:layout", "amount": 10, "consumer": "quest"}, WHEN)
        purchase_stamps(db, 1, {"grant_key": "market:buy:stool", "catalog_id": "shell-stool"}, WHEN)
        db.commit()
        with pytest.raises(APIError) as caught:
            refund_stamps(
                db, 1, {"grant_key": "market:refund:2", "catalog_id": "shell-stool"}, WHEN
            )
        assert caught.value.code == "layout_recovery"
        db.rollback()
        assert read_wallet(db, 1)["balance"] == 5
        assert broken["revision"] == 1
        assert broken["recovery_required"] is True
        assert _reject(db, "living", [], 1).code == "layout_recovery"
        assert db.scalar(select(RoomLayout.payload)) == '{"note":"secret measurement"}'
    finally:
        db.close()
        database.engine.dispose()


def test_unknown_placement_is_kept_through_valid_writes(tmp_path: Path) -> None:
    database = _file_db(tmp_path)
    db = _session(database)
    try:
        _legacy_purchase(db, "future-chair")
        future = _piece("future", "future-chair", column=11, row=0, palette=2)
        _save(db, "study", [*STUDY, future])
        db.commit()

        error = _reject(db, "study", STUDY, 1)
        assert error.code == "layout_recovery"
        error = _reject(db, "study", [*STUDY, {**future, "palette": 1}], 1)
        assert error.code == "layout_recovery"
        assert read_layout(db, 1, "study")["items"][-1] == future

        edited = [{**STUDY[0], "palette": 1}, *STUDY[1:], future]
        result, created = _save(db, "study", edited, 1)
        db.commit()
        assert not created
        assert result["revision"] == 2
        assert result["items"] == edited
        assert "recovery_required" not in result
    finally:
        db.close()
        database.engine.dispose()


def test_refund_and_placement_race_leave_either_a_placed_unlock_or_returned_stamps(
    tmp_path: Path,
) -> None:
    database = _file_db(tmp_path)
    with _session(database) as db:
        grant_stamps(db, 1, {"grant_key": "quest:layout", "amount": 10, "consumer": "quest"}, WHEN)
        purchased, _ = purchase_stamps(
            db, 1, {"grant_key": "market:buy:stool", "catalog_id": "shell-stool"}, WHEN
        )
        db.commit()
    spend_id = purchased["entitlements"][0]["spend_receipt_id"]
    try:
        saved, errors = _race(
            database,
            [
                lambda db: _save(
                    db,
                    "study",
                    [_piece("stool-a", "shell-stool"), _piece("stool-b", "shell-stool", column=1)],
                ),
                lambda db: refund_stamps(
                    db,
                    1,
                    {
                        "grant_key": f"market:refund:shell-stool:{spend_id}",
                        "catalog_id": "shell-stool",
                        "spend_receipt_id": spend_id,
                    },
                    WHEN,
                ),
            ],
        )
        assert len(saved) == 1
        with _session(database) as db:
            layout = read_layout(db, 1, "study")
            wallet = read_wallet(db, 1)
            if layout["items"]:
                assert errors[0][0] == "unlock_in_use"
                assert len(layout["items"]) == 2
                assert wallet["balance"] == 5
                assert wallet["entitlements"][0]["active"]
            else:
                assert errors[0][0] == "layout_entitlement"
                assert wallet["balance"] == 10
                assert not wallet["entitlements"][0]["active"]
    finally:
        database.engine.dispose()


def test_racing_creates_and_updates_keep_one_row(tmp_path: Path) -> None:
    database = _file_db(tmp_path)
    try:
        created, errors = _race(
            database,
            [
                lambda db: _save(db, "living", [_piece("a", "oak-seat", palette=1)]),
                lambda db: _save(db, "living", [_piece("a", "oak-seat", palette=2)]),
            ],
        )
        assert len(created) == 1
        assert created[0][1] is True
        assert created[0][0]["revision"] == 1
        assert len(errors) == 1
        assert errors[0][0] == "layout_conflict"
        assert "revision 1" in errors[0][1]
        db = _session(database)
        assert _count(db) == 1
        db.close()
        updated, lost = _race(
            database,
            [
                lambda db: _save(db, "living", [_piece("a", "fern", column=2, palette=1)], 1),
                lambda db: _save(db, "living", [_piece("a", "fern", column=3, palette=3)], 1),
            ],
        )
        assert len(updated) == 1
        assert updated[0][0]["revision"] == 2
        assert len(lost) == 1
        assert "revision 2" in lost[0][1]
        db = _session(database)
        stored = json.loads(_payload(db, 1, "living") or "[]")
        assert stored[0]["palette"] == updated[0][0]["items"][0]["palette"]
        assert _count(db) == 1
        db.close()
    finally:
        database.engine.dispose()


def _race(database, calls: list) -> tuple[list, list]:
    barrier = threading.Barrier(len(calls))
    results: list = []
    errors: list = []

    def run(call) -> None:
        db = _session(database)
        try:
            barrier.wait(5)
            try:
                result = call(db)
                db.commit()
                results.append(result)
            except APIError as exc:
                db.rollback()
                errors.append((exc.code, exc.message))
        finally:
            db.close()

    threads = [threading.Thread(target=run, args=(call,)) for call in calls]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join(10)
        assert not thread.is_alive()
    return results, errors


def test_http_save_hides_private_fields_and_blocks_a_foreign_owner(api) -> None:
    client, database, application = api
    missing = client.get("/api/town/layouts/living")
    assert missing.status_code == 200
    assert missing.json() == {"room_id": "living", "revision": 0, "items": []}
    unknown = client.put("/api/town/layouts/attic", json={"note": "bp 120", "expected_revision": 0})
    assert unknown.status_code == 404
    assert unknown.json()["code"] == "layout_not_found"
    assert "bp 120" not in unknown.text
    oversized = client.put(
        "/api/town/layouts/living",
        content=b'{"expected_revision":0,"items":[]}' + b" " * 20000,
        headers={"content-type": "application/json"},
    )
    assert oversized.status_code == 422
    assert oversized.json()["field_errors"] is None
    created = client.put("/api/town/layouts/living", json=_body(LIVING))
    assert created.status_code == 201, created.text
    assert created.json()["revision"] == 1
    assert "label" not in created.text
    stale = client.put("/api/town/layouts/living", json=_body(LIVING, 0))
    assert stale.status_code == 409
    assert stale.json()["message"] == "This room was saved at revision 1."
    assert stale.json()["field_errors"] is None
    private = client.put(
        "/api/town/layouts/living",
        json={**_body(LIVING, 1), "note": "trip Lisbon"},
    )
    assert private.status_code == 422
    assert "Lisbon" not in private.text
    typed = client.put(
        "/api/town/layouts/living",
        json={"expected_revision": True, "items": []},
    )
    assert typed.status_code == 422
    db = database.sessionmaker()
    stored = _payload(db, 1, "living")
    assert stored is not None
    assert "note" not in stored
    assert _count(db) == 1
    row = db.scalar(select(RoomLayout).where(RoomLayout.room_id == "living"))
    assert row is not None
    row.payload = json.dumps([*LIVING, {"note": "synthetic private marker"}])
    db.commit()
    protected = client.get("/api/town/layouts/living")
    assert protected.json()["recovery_required"] is True
    assert protected.json()["items"][0]["slot"] is None
    assert "synthetic private marker" not in protected.text
    refused = client.put("/api/town/layouts/living", json=_body(LIVING, 1))
    assert refused.status_code == 409
    assert refused.json()["code"] == "layout_recovery"
    assert json.loads(_payload(db, 1, "living") or "[]")[-1] == {"note": "synthetic private marker"}
    db.close()
    application.dependency_overrides[get_current_user] = lambda: SimpleNamespace(id=2)
    from apps.server.auth import require_principal

    application.dependency_overrides[require_principal] = lambda: Principal(2, "bea", "Bea")
    hidden = client.get("/api/town/layouts/living")
    assert hidden.status_code == 200
    assert hidden.json()["items"] == []
    foreign = client.put(
        "/api/town/layouts/living", json=_body([_piece("other", "fern", column=2)])
    )
    assert foreign.status_code == 201
    db = database.sessionmaker()
    assert json.loads(_payload(db, 1, "living") or "[]")[0]["catalog_id"] == "woven-rug"
    assert json.loads(_payload(db, 2, "living") or "[]")[0]["catalog_id"] == "fern"
    db.close()


def test_csrf_and_anonymous_layout_writes(tmp_path, monkeypatch) -> None:
    _quiet(monkeypatch)
    application, database = _app(tmp_path)
    TownBase.metadata.create_all(database.engine)
    _user(database, 1, "tok", "csrf-token")
    application.dependency_overrides[get_town_clock] = lambda: WHEN
    with TestClient(application) as client:
        missing = _call(client, "put", "/api/town/layouts/living", json=_body(LIVING))
        assert missing.status_code == 401
        blocked = _call(client, "put", "/api/town/layouts/living", token="tok", json=_body(LIVING))
        assert blocked.status_code == 403
        db = database.sessionmaker()
        assert _count(db) == 0
        db.close()
        created = _call(
            client,
            "put",
            "/api/town/layouts/living",
            token="tok",
            csrf="csrf-token",
            json=_body(LIVING),
        )
        assert created.status_code == 201, created.text
        assert created.json()["revision"] == 1
    database.engine.dispose()


def test_upgrade_preserves_other_domains_and_unknown_layout_rows(tmp_path, monkeypatch) -> None:
    database = tmp_path / "site.db"
    config = make_config(sqlite_url(database))
    command.upgrade(config, PARENT)
    with sqlite3.connect(database) as db:
        db.execute("CREATE TABLE kept_unsupported (id INTEGER PRIMARY KEY, note TEXT NOT NULL)")
        db.execute("INSERT INTO kept_unsupported (note) VALUES ('keep')")
        for email in ("kept@example.invalid", "other@example.invalid"):
            db.execute(
                "INSERT INTO users (email, display_name, role, is_active, must_change_password, "
                "created_at, updated_at) VALUES (?, ?, 'user', 1, 0, '2026-01-01', '2026-01-01')",
                (email, email),
            )
        db.execute(
            "INSERT INTO habits (user_id, name, slot, building_style, per_week, created_on, "
            "created_at, name_key) VALUES (1, 'Read', 0, 'forge', 7, '2026-03-01', "
            "'2026-03-01T00:00:00+00:00', 'read')"
        )
        db.execute(
            "INSERT INTO habits (user_id, name, slot, building_style, per_week, created_on, "
            "created_at, name_key) VALUES (2, 'Other', 0, 'garden', 1, '2026-03-01', "
            "'2026-03-01T00:00:00+00:00', 'other')"
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
        db.execute("INSERT INTO town_stamp_wallets (user_id, balance) VALUES (1, 4), (2, 9)")
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
        assert db.execute("SELECT name FROM habits WHERE user_id = 1").fetchone() == ("Read",)
        assert db.execute(
            "SELECT balance FROM town_stamp_wallets WHERE user_id = 1"
        ).fetchone() == (4,)
        assert db.execute("SELECT note FROM kept_unsupported").fetchone() == ("keep",)
        assert db.execute("SELECT COUNT(*) FROM town_room_layouts").fetchone() == (0,)
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
                "INSERT INTO town_room_layouts (user_id, room_id, revision, payload, updated_at) "
                "VALUES (1, 'living', 0, '[]', '2026-11-02')"
            )
    command.downgrade(config, PARENT)
    assert current_revision(database) == PARENT
    with sqlite3.connect(database) as db:
        names = {
            row[0] for row in db.execute("SELECT name FROM sqlite_master WHERE type = 'table'")
        }
        assert "town_room_layouts" not in names
        assert "town_quest_journals" not in names
        assert "town_quest_steps" not in names
        assert db.execute("SELECT title FROM trips").fetchone() == ("Lisbon",)
        assert db.execute("SELECT name FROM habits WHERE user_id = 2").fetchone() == ("Other",)
        assert db.execute(
            "SELECT balance FROM town_stamp_wallets WHERE user_id = 2"
        ).fetchone() == (9,)
        assert db.execute("SELECT note FROM kept_unsupported").fetchone() == ("keep",)
    command.upgrade(config, HEAD)
    note = "bp 120 trip Lisbon"
    payload = json.dumps(
        [
            {
                "instance_id": "future",
                "catalog_id": "future-stool",
                "anchor": "floor",
                "column": 1,
                "row": 1,
                "slot": None,
                "orientation": 0,
                "palette": 1,
                "note": note,
            }
        ]
    )
    with sqlite3.connect(database) as db:
        db.execute(
            "INSERT INTO town_room_layouts (user_id, room_id, revision, payload, updated_at) "
            "VALUES (1, 'living', 3, ?, '2026-11-02T00:00:00+00:00')",
            (payload,),
        )
        db.execute(
            "INSERT INTO town_room_layouts (user_id, room_id, revision, payload, updated_at) "
            "VALUES (2, 'study', 1, '[]', '2026-11-02T00:00:00+00:00')"
        )
        db.commit()
    _quiet(monkeypatch)
    opened = open_database(f"sqlite:///{database}")
    application = create_app(
        Settings(
            database_url=f"sqlite:///{database}",
            release="test",
            web_root=tmp_path / "web",
            openapi=False,
        ),
        Dependencies(
            database=opened,
            principal=Principal(1, "ada", "Ada"),
            check_schema=False,
            check_frontend=False,
        ),
    )
    application.dependency_overrides[get_current_user] = lambda: SimpleNamespace(id=1)
    application.dependency_overrides[get_town_clock] = lambda: WHEN
    with TestClient(application) as client:
        seen = client.get("/api/town/layouts/living")
        assert seen.status_code == 200, seen.text
        body = seen.json()
        assert body["revision"] == 3
        assert body["items"][0]["catalog_id"] == "future-stool"
        assert "note" not in body["items"][0]
        assert note not in seen.text
        stale = client.put("/api/town/layouts/living", json=_body(LIVING, 0))
        assert stale.status_code == 409
        malformed = client.put(
            "/api/town/layouts/living",
            json={**_body(LIVING, 3), "weight": 70},
        )
        assert malformed.status_code == 422
        huge = client.put(
            "/api/town/layouts/living",
            content=b'{"expected_revision":3,"items":[]}' + b" " * 20000,
            headers={"content-type": "application/json"},
        )
        assert huge.status_code == 422
    with sqlite3.connect(database) as db:
        assert db.execute("SELECT payload FROM town_room_layouts WHERE user_id = 1").fetchone() == (
            payload,
        )
        assert db.execute(
            "SELECT revision FROM town_room_layouts WHERE user_id = 1"
        ).fetchone() == (3,)
    session = opened.sessionmaker()
    try:
        deleted = session.get(User, 2)
        kept = session.get(User, 1)
        assert deleted is not None and kept is not None
        delete_user_account(session, deleted, actor_user_id=kept.id)
        session.commit()
        assert _count(session, 2) == 0
        assert session.scalar(select(RoomLayout.payload).where(RoomLayout.user_id == 1)) == payload
        assert session.execute(text("SELECT name FROM habits WHERE user_id = 1")).scalar_one() == (
            "Read"
        )
        assert (
            session.execute(text("SELECT COUNT(*) FROM habits WHERE user_id = 2")).scalar_one() == 0
        )
        assert session.execute(text("SELECT title FROM trips")).scalar_one() == "Lisbon"
        assert session.execute(text("SELECT name FROM world_concepts")).scalar_one() == "Harbor"
        assert (
            session.execute(
                text("SELECT balance FROM town_stamp_wallets WHERE user_id = 1")
            ).scalar_one()
            == 4
        )
        assert (
            session.execute(
                text("SELECT COUNT(*) FROM town_stamp_wallets WHERE user_id = 2")
            ).scalar_one()
            == 0
        )
    finally:
        session.close()
        opened.engine.dispose()


@pytest.mark.parametrize(
    ("milestone", "option", "threshold"),
    [
        ("habit-level-2", "small-planter", 50),
        ("town-level-3", "wind-vane", 250),
        ("town-level-5", "bench", 900),
    ],
)
def test_milestone_choice_uses_existing_public_levels(api, milestone, option, threshold):
    client, database, _ = api
    first = date(2023, 1, 1)
    last = first + timedelta(days=2 * (threshold // 10 - 1))
    with database.sessionmaker.begin() as db:
        habit = _add(
            db,
            1,
            "Milestone habit",
            0,
            "garden",
            7,
            first,
            [first + timedelta(days=2 * index) for index in range(threshold // 10 - 1)],
        )
        habit_id = habit.id
    path = "/api/town/layouts/courtyard"
    choice = _piece(milestone, option)
    before = client.put(path, json=_body([choice]))
    assert before.status_code == 409 and before.json()["code"] == "layout_entitlement"
    with database.sessionmaker.begin() as db:
        db.add(HabitCheckin(user_id=1, habit_id=habit_id, day=last, created_at=WHEN))
    at = client.put(path, json=_body([choice]))
    assert at.status_code == 201 and at.json()["items"] == [choice]
    assert client.put("/api/town/layouts/study", json=_body([choice])).status_code == 422
    assert client.put(path, json=_body([choice, choice], 1)).status_code == 422
    unearned = client.put(path, json=_body([{**choice, "instance_id": "extra-choice"}], 1))
    assert unearned.status_code == 409 and unearned.json()["code"] == "layout_entitlement"
    with database.sessionmaker.begin() as db:
        db.add(
            HabitCheckin(
                user_id=1, habit_id=habit_id, day=last + timedelta(days=2), created_at=WHEN
            )
        )
    after = {**choice, "palette": 1}
    assert client.put(path, json=_body([after], 1)).json()["items"] == [after]
    with database.sessionmaker.begin() as db:
        db.query(HabitCheckin).filter(
            HabitCheckin.habit_id == habit_id, HabitCheckin.day >= last
        ).delete()
    decor = _piece("extra-seat", "oak-seat", column=1)
    assert client.put(path, json=_body([after, decor], 2)).json()["items"] == [after, decor]
    changed = client.put(path, json=_body([choice, decor], 3))
    assert changed.status_code == 409 and changed.json()["code"] == "layout_entitlement"
    assert client.get(path).json()["items"] == [after, decor]


def test_maximum_town_level_retains_milestone_options(api):
    client, database, _ = api
    first = date(2023, 1, 1)
    with database.sessionmaker.begin() as db:
        _add(
            db,
            1,
            "Veteran habit",
            0,
            "garden",
            7,
            first,
            [first + timedelta(days=2 * index) for index in range(500)],
        )
    assert client.get("/api/town").json()["town"]["level"] == 10
    choices = [
        _piece("town-level-3", "path-lamp"),
        _piece("town-level-5", "civic-pennant", column=1),
    ]
    assert client.put("/api/town/layouts/courtyard", json=_body(choices)).json()["items"] == choices
