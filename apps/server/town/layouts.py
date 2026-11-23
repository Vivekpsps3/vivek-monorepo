"""Owner-scoped cosmetic layouts.

One row per home room or the exterior anchor set. A write replaces that row
only when expected_revision matches. The stored JSON keeps catalog ids, cells
or anchors, a quarter turn, and a palette. Notes and measurements are not
fields in that JSON. Shop and unknown catalog ids need an active Stamp unlock.
Starter pieces do not.
"""

from __future__ import annotations

import json
import re
from collections.abc import Iterable
from dataclasses import dataclass
from datetime import datetime
from typing import Any, Literal, cast

from pydantic import BaseModel, ConfigDict, ValidationError, field_validator
from sqlalchemy import select, text
from sqlalchemy.engine import CursorResult
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from apps.server.errors import APIError
from apps.server.town.models import RoomLayout, StampEntitlement

_CHECK = "Check the highlighted fields."
_ROOM = "That room is not in this home."
_LOCKED = "That item is not unlocked."
ROOM_BYTES = 16 * 1024
OWNER_BYTES = 128 * 1024
ITEM_CAP = 64
WALL_CAP = 16
EXTERIOR_CAP = 12
FLOOR_CELLS = 12
# The doorway is the south opening on every home floor. Column 5, row 10, 2 by 2.
_DOOR = frozenset({(5, 10), (6, 10), (5, 11), (6, 11)})
_IDENT = re.compile(r"^[a-z0-9][a-z0-9:_-]{0,63}$")
_SLOT = re.compile(r"^[a-z0-9][a-z0-9-]{0,31}$")
ROOMS = frozenset({"living", "study", "bedroom", "courtyard", "exterior"})
EXTERIOR_ANCHORS = frozenset(
    f"{kind}-{index}" for kind in ("garden", "path", "civic") for index in range(4)
)
# Slot id to the floor column where that wall attachment starts.
WALL_SLOTS: dict[str, dict[str, int]] = {
    "living": {"living-north": 6, "living-west": 1},
    "study": {"study-north": 4, "study-east": 10},
    "bedroom": {"bedroom-north": 8, "bedroom-west": 1},
    "courtyard": {"courtyard-north": 4, "courtyard-east": 10},
}
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


@dataclass(frozen=True)
class _Spec:
    anchor: Literal["floor", "wall"]
    columns: int
    rows: int
    price: int
    stackable: bool
    surface: bool


def _spec(
    anchor: Literal["floor", "wall"],
    columns: int,
    rows: int,
    price: int,
    stackable: bool = False,
    surface: bool = False,
) -> _Spec:
    return _Spec(anchor, columns, rows, price, stackable, surface)


# Same ids, footprints, and prices as the web cosmetic catalog.
CATALOG: dict[str, _Spec] = {
    "oak-seat": _spec("floor", 1, 1, 0),
    "low-table": _spec("floor", 2, 1, 0, surface=True),
    "woven-rug": _spec("floor", 2, 2, 0),
    "bookshelf": _spec("floor", 1, 2, 0),
    "desk": _spec("floor", 2, 1, 0, surface=True),
    "desk-lamp": _spec("floor", 1, 1, 0, stackable=True),
    "fern": _spec("floor", 1, 1, 0),
    "floor-lantern": _spec("floor", 1, 1, 0),
    "plain-frame": _spec("wall", 1, 1, 0),
    "record-stand": _spec("floor", 1, 1, 0),
    "bed": _spec("floor", 2, 3, 0),
    "planter": _spec("floor", 1, 1, 0),
    "shell-stool": _spec("floor", 1, 1, 5),
    "brass-sconce": _spec("wall", 1, 1, 5),
    "paper-screen": _spec("floor", 1, 2, 5),
    "coral-cushion": _spec("floor", 1, 1, 5, stackable=True),
    "tile-fountain": _spec("floor", 2, 2, 10),
    "reading-chair": _spec("floor", 1, 1, 10),
    "globe": _spec("floor", 1, 1, 10),
    "hanging-ivy": _spec("wall", 1, 2, 10),
    "glass-cabinet": _spec("floor", 1, 2, 20),
    "skylight-panel": _spec("wall", 2, 1, 20),
    "model-ferry": _spec("floor", 2, 1, 20),
    "moon-clock": _spec("wall", 1, 1, 20),
}


class _Write(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)


class _Item(_Write):
    instance_id: str
    catalog_id: str
    anchor: str
    column: int | None
    row: int | None
    slot: str | None
    orientation: Literal[0, 1, 2, 3]
    palette: Literal[0, 1, 2, 3]

    @field_validator("instance_id", "catalog_id")
    @classmethod
    def _ident(cls, value: str) -> str:
        if _IDENT.fullmatch(value) is None:
            raise ValueError("id")
        return value

    @field_validator("anchor")
    @classmethod
    def _anchor(cls, value: str) -> str:
        if value in {"floor", "wall"} or value in EXTERIOR_ANCHORS:
            return value
        raise ValueError("anchor")

    @field_validator("column", "row")
    @classmethod
    def _cell(cls, value: int | None) -> int | None:
        if value is not None and not 0 <= value < FLOOR_CELLS:
            raise ValueError("cell")
        return value

    @field_validator("slot")
    @classmethod
    def _slot(cls, value: str | None) -> str | None:
        if value is not None and _SLOT.fullmatch(value) is None:
            raise ValueError("slot")
        return value


class _Body(_Write):
    expected_revision: int
    items: list[_Item]

    @field_validator("expected_revision")
    @classmethod
    def _revision(cls, value: int) -> int:
        if value < 0:
            raise ValueError("revision")
        return value

    @field_validator("items")
    @classmethod
    def _count(cls, value: list[_Item]) -> list[_Item]:
        if len(value) > ITEM_CAP:
            raise ValueError("items")
        return value


def _invalid() -> APIError:
    return APIError(422, "validation_error", _CHECK)


def _conflict(revision: int) -> APIError:
    return APIError(409, "layout_conflict", f"This room was saved at revision {revision}.")


def parse_body(raw: bytes) -> dict[str, Any]:
    """Reject an oversized or non-object body before a layout row is touched."""
    if len(raw) > ROOM_BYTES:
        raise _invalid()
    try:
        payload = json.loads(raw or b"null")
    except (ValueError, RecursionError):
        payload = None
    if type(payload) is not dict:
        raise _invalid()
    return payload


def _parse(payload: dict[str, Any]) -> _Body:
    try:
        return _Body.model_validate(payload)
    except ValidationError:
        raise _invalid() from None


def _span(spec: _Spec, orientation: int) -> tuple[int, int]:
    if orientation in {1, 3}:
        return spec.rows, spec.columns
    return spec.columns, spec.rows


def _cells(column: int, row: int, columns: int, rows: int) -> set[tuple[int, int]]:
    return {(column + x, row + y) for y in range(rows) for x in range(columns)}


def _placed(item: _Item) -> dict[str, Any]:
    return {
        "instance_id": item.instance_id,
        "catalog_id": item.catalog_id,
        "anchor": item.anchor,
        "column": item.column,
        "row": item.row,
        "slot": item.slot,
        "orientation": item.orientation,
        "palette": item.palette,
    }


def _validate(room_id: str, items: list[_Item]) -> list[dict[str, Any]]:
    if room_id == "exterior" and len(items) > EXTERIOR_CAP:
        raise _invalid()
    wall_count = sum(1 for item in items if item.anchor == "wall")
    if wall_count > WALL_CAP:
        raise _invalid()
    seen_ids: set[str] = set()
    seen_slots: set[str] = set()
    seen_anchors: set[str] = set()
    floors: list[tuple[_Item, _Spec, set[tuple[int, int]]]] = []
    for item in items:
        if item.instance_id in seen_ids:
            raise _invalid()
        seen_ids.add(item.instance_id)
        known = CATALOG.get(item.catalog_id)
        spec = (
            known
            if known is not None
            else _spec("wall" if item.anchor == "wall" else "floor", 1, 1, 1)
        )
        if room_id == "exterior":
            if (
                item.anchor not in EXTERIOR_ANCHORS
                or item.column is not None
                or item.row is not None
                or item.slot is not None
            ):
                raise _invalid()
            if item.anchor in seen_anchors:
                raise _invalid()
            seen_anchors.add(item.anchor)
            continue
        if item.anchor == "floor":
            if known is not None and known.anchor != "floor":
                raise _invalid()
            if item.slot is not None or item.column is None or item.row is None:
                raise _invalid()
            width, height = _span(spec, item.orientation)
            if item.column + width > FLOOR_CELLS or item.row + height > FLOOR_CELLS:
                raise _invalid()
            floors.append((item, spec, _cells(item.column, item.row, width, height)))
        elif item.anchor == "wall":
            if known is not None and known.anchor != "wall":
                raise _invalid()
            if item.column is not None or item.row is not None or item.slot is None:
                raise _invalid()
            column = WALL_SLOTS[room_id].get(item.slot)
            if column is None or item.slot in seen_slots:
                raise _invalid()
            seen_slots.add(item.slot)
            width, _height = _span(spec, item.orientation)
            if column + width > FLOOR_CELLS:
                raise _invalid()
        else:
            raise _invalid()
    _floors(floors)
    return [_placed(item) for item in items]


def _floors(floors: list[tuple[_Item, _Spec, set[tuple[int, int]]]]) -> None:
    bases: dict[tuple[int, int], str] = {}
    base_surface: dict[str, bool] = {}
    stacks: dict[tuple[int, int], str] = {}
    for item, spec, cells in floors:
        if cells & _DOOR:
            raise _invalid()
        stacking = spec.stackable and not spec.surface
        if stacking:
            for cell in cells:
                if cell in stacks:
                    raise _invalid()
                stacks[cell] = item.instance_id
        else:
            base_surface[item.instance_id] = spec.surface
            for cell in cells:
                if cell in bases:
                    raise _invalid()
                bases[cell] = item.instance_id
    holders: dict[str, set[str]] = {}
    for cell, instance_id in stacks.items():
        base = bases.get(cell)
        if base is None or not base_surface.get(base, False):
            raise _invalid()
        holders.setdefault(instance_id, set()).add(base)
    if any(len(surfaces) != 1 for surfaces in holders.values()):
        raise _invalid()


def _entitle(db: Session, user_id: int, items: Iterable[dict[str, Any]]) -> None:
    needed = {
        str(item["catalog_id"])
        for item in items
        if (spec := CATALOG.get(str(item["catalog_id"]))) is None or spec.price > 0
    }
    if not needed:
        return
    rows = db.scalars(
        select(StampEntitlement).where(
            StampEntitlement.user_id == user_id,
            StampEntitlement.catalog_id.in_(needed),
        )
    ).all()
    active = {row.catalog_id for row in rows if row.refund_receipt_id is None}
    if not needed <= active:
        raise APIError(409, "layout_entitlement", _LOCKED)


def _budget(db: Session, user_id: int, room_id: str, size: int) -> None:
    rows = db.execute(
        select(RoomLayout.room_id, RoomLayout.payload).where(RoomLayout.user_id == user_id)
    ).all()
    total = size + sum(len(payload) for existing, payload in rows if existing != room_id)
    if total > OWNER_BYTES:
        raise _invalid()


def _public_items(payload: str) -> list[dict[str, Any]]:
    """Public fields only. A private key stays in the row and leaves this list."""
    try:
        raw = json.loads(payload)
    except (ValueError, RecursionError):
        return []
    if type(raw) is not list:
        return []
    items: list[dict[str, Any]] = []
    for entry in raw:
        if type(entry) is not dict:
            continue
        try:
            item = _Item.model_validate({key: entry.get(key) for key in _PUBLIC})
        except ValidationError:
            continue
        items.append(_placed(item))
    return items


def _view(room_id: str, revision: int, payload: str) -> dict[str, Any]:
    return {"room_id": room_id, "revision": revision, "items": _public_items(payload)}


def _revision(db: Session, user_id: int, room_id: str) -> int | None:
    found = db.scalar(
        select(RoomLayout.revision).where(
            RoomLayout.user_id == user_id,
            RoomLayout.room_id == room_id,
        )
    )
    return None if found is None else int(found)


def read_layout(db: Session, user_id: int, room_id: str) -> dict[str, Any]:
    if room_id not in ROOMS:
        raise APIError(404, "layout_not_found", _ROOM)
    row = db.scalar(
        select(RoomLayout).where(RoomLayout.user_id == user_id, RoomLayout.room_id == room_id)
    )
    if row is None:
        return {"room_id": room_id, "revision": 0, "items": []}
    return _view(room_id, row.revision, row.payload)


def save_layout(
    db: Session,
    user_id: int,
    room_id: str,
    payload: dict[str, Any],
    now: datetime,
) -> tuple[dict[str, Any], bool]:
    if room_id not in ROOMS:
        raise APIError(404, "layout_not_found", _ROOM)
    parsed = _parse(payload)
    items = _validate(room_id, parsed.items)
    canonical = json.dumps(items, separators=(",", ":"))
    if len(canonical.encode()) > ROOM_BYTES:
        raise _invalid()
    # A zero-row update takes SQLite's reserved lock before the reads. Two
    # deferred reads that later write can deadlock on the shared lock.
    db.execute(text("UPDATE town_room_layouts SET revision = revision WHERE 0"))
    _entitle(db, user_id, items)
    _budget(db, user_id, room_id, len(canonical))
    return _compare_and_write(db, user_id, room_id, parsed.expected_revision, canonical, now)


def _compare_and_write(
    db: Session,
    user_id: int,
    room_id: str,
    expected: int,
    canonical: str,
    now: datetime,
) -> tuple[dict[str, Any], bool]:
    # The WHERE revision clause is the compare-and-swap. A second writer waits
    # on SQLite's lock and then sees the new revision instead of overwriting it.
    result = cast(
        CursorResult[Any],
        db.execute(
            text(
                "UPDATE town_room_layouts SET revision = revision + 1, payload = :payload, "
                "updated_at = :updated_at WHERE user_id = :user_id AND room_id = :room_id "
                "AND revision = :expected"
            ),
            {
                "payload": canonical,
                "updated_at": now,
                "user_id": user_id,
                "room_id": room_id,
                "expected": expected,
            },
        ),
    )
    if result.rowcount == 1:
        return _view(room_id, expected + 1, canonical), False
    current = _revision(db, user_id, room_id)
    if current is not None:
        raise _conflict(current)
    if expected != 0:
        raise _conflict(0)
    db.add(
        RoomLayout(
            user_id=user_id,
            room_id=room_id,
            revision=1,
            payload=canonical,
            updated_at=now,
        )
    )
    try:
        db.flush()
    except IntegrityError:
        db.rollback()
        raced = _revision(db, user_id, room_id)
        raise _conflict(0 if raced is None else raced) from None
    return _view(room_id, 1, canonical), True
