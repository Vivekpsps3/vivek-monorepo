"""Game-only Stamp wallet.

Receipts are owned and unique on (user_id, grant_key). A repeated key returns
the stored receipt and does not move the balance again. Grants accept the
quest and minigame consumers. Purchases and refunds are the market consumer.
Market purchases use fixed catalog prices. Refunds return the full recorded
price when no saved layout uses the unlock. No life metric is stored.
"""

from __future__ import annotations

import re
from collections.abc import Callable
from datetime import UTC, datetime
from typing import Any, Literal, cast

from pydantic import BaseModel, ConfigDict, Field, ValidationError, field_validator
from sqlalchemy import select, text
from sqlalchemy.engine import CursorResult
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from apps.server.errors import APIError
from apps.server.town.layouts import CATALOG, require_unused_unlock
from apps.server.town.models import StampEntitlement, StampReceipt, StampWallet

_CHECK = "Check the highlighted fields."
_KEY = re.compile(r"^[a-z0-9][a-z0-9:_-]{0,79}$")
_CATALOG = re.compile(r"^[a-z0-9][a-z0-9:_-]{0,63}$")
_CONSUMER = Literal["market", "quest", "minigame"]
_KIND = Literal["grant", "spend", "refund"]

CONSUMERS: tuple[dict[str, str], ...] = (
    {
        "id": "market",
        "name": "Workshop market",
        "detail": "Spend and refund cosmetic unlocks.",
    },
    {
        "id": "quest",
        "name": "Chapter quests",
        "detail": "Grant each chapter reward once.",
    },
    {
        "id": "minigame",
        "name": "Minigames",
        "detail": "Grant a capped reward from a validated play receipt.",
    },
)


class _Write(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)


class StampGrantCreate(_Write):
    grant_key: str
    amount: int
    consumer: Literal["quest", "minigame"]

    @field_validator("grant_key")
    @classmethod
    def _key(cls, value: str) -> str:
        if _KEY.fullmatch(value) is None:
            raise ValueError("grant_key")
        return value

    @field_validator("amount")
    @classmethod
    def _amount(cls, value: int) -> int:
        if not 1 <= value <= 20:
            raise ValueError("amount")
        return value


class StampPurchaseCreate(_Write):
    grant_key: str
    catalog_id: str
    amount: int | None = Field(default=None, ge=1, le=20)

    @field_validator("grant_key")
    @classmethod
    def _key(cls, value: str) -> str:
        if _KEY.fullmatch(value) is None:
            raise ValueError("grant_key")
        return value

    @field_validator("catalog_id")
    @classmethod
    def _catalog(cls, value: str) -> str:
        if _CATALOG.fullmatch(value) is None:
            raise ValueError("catalog_id")
        return value


class StampRefundCreate(_Write):
    grant_key: str
    catalog_id: str
    spend_receipt_id: int | None = Field(default=None, gt=0)

    @field_validator("grant_key")
    @classmethod
    def _key(cls, value: str) -> str:
        if _KEY.fullmatch(value) is None:
            raise ValueError("grant_key")
        return value

    @field_validator("catalog_id")
    @classmethod
    def _catalog(cls, value: str) -> str:
        if _CATALOG.fullmatch(value) is None:
            raise ValueError("catalog_id")
        return value


def _parse[ModelT: BaseModel](kind: type[ModelT], payload: dict[str, Any]) -> ModelT:
    try:
        return kind.model_validate(payload)
    except ValidationError:
        raise APIError(422, "validation_error", _CHECK) from None


def _lock(db: Session, user_id: int) -> None:
    # The first statement takes SQLite's reserved lock before the balance read.
    db.execute(
        text(
            "INSERT INTO town_stamp_wallets (user_id, balance) VALUES (:user_id, 0) "
            "ON CONFLICT(user_id) DO UPDATE SET balance = balance"
        ),
        {"user_id": user_id},
    )


def _move(db: Session, user_id: int, delta: int) -> bool:
    result = cast(
        CursorResult[Any],
        db.execute(
            text(
                "UPDATE town_stamp_wallets SET balance = balance + :delta "
                "WHERE user_id = :user_id AND balance + :delta >= 0"
            ),
            {"user_id": user_id, "delta": delta},
        ),
    )
    return result.rowcount == 1


def _receipt(db: Session, user_id: int, grant_key: str) -> StampReceipt | None:
    return db.scalar(
        select(StampReceipt).where(
            StampReceipt.user_id == user_id,
            StampReceipt.grant_key == grant_key,
        )
    )


def _entitlement(db: Session, user_id: int, catalog_id: str) -> StampEntitlement | None:
    return db.scalar(
        select(StampEntitlement).where(
            StampEntitlement.user_id == user_id,
            StampEntitlement.catalog_id == catalog_id,
        )
    )


def _iso(value: datetime) -> str:
    if value.tzinfo is None:
        value = value.replace(tzinfo=UTC)
    return value.isoformat()


def read_wallet(db: Session, user_id: int) -> dict[str, Any]:
    """The caller's wallet. Absence of a row is a zero balance."""
    balance = db.scalar(select(StampWallet.balance).where(StampWallet.user_id == user_id))
    receipts = list(
        db.scalars(
            select(StampReceipt).where(StampReceipt.user_id == user_id).order_by(StampReceipt.id)
        )
    )
    entitlements = list(
        db.scalars(
            select(StampEntitlement)
            .where(StampEntitlement.user_id == user_id)
            .order_by(StampEntitlement.catalog_id)
        )
    )
    by_id = {row.id: row for row in receipts}
    items: list[dict[str, Any]] = []
    for row in entitlements:
        spend = by_id.get(row.spend_receipt_id)
        if spend is None:
            spend = db.get(StampReceipt, row.spend_receipt_id)
        items.append(
            {
                "catalog_id": row.catalog_id,
                "active": row.refund_receipt_id is None,
                "amount": 0 if spend is None else spend.amount,
                "spend_receipt_id": row.spend_receipt_id,
            }
        )
    return {
        "balance": 0 if balance is None else balance,
        "consumers": [dict(item) for item in CONSUMERS],
        "receipts": [
            {
                "id": row.id,
                "grant_key": row.grant_key,
                "consumer": row.consumer,
                "kind": row.kind,
                "amount": row.amount,
                "catalog_id": row.catalog_id,
                "created_at": _iso(row.created_at),
            }
            for row in receipts
        ],
        "entitlements": items,
    }


def _add_receipt(
    db: Session,
    user_id: int,
    grant_key: str,
    consumer: _CONSUMER,
    kind: _KIND,
    amount: int,
    catalog_id: str | None,
    now: datetime,
) -> StampReceipt:
    receipt = StampReceipt(
        user_id=user_id,
        grant_key=grant_key,
        consumer=consumer,
        kind=kind,
        amount=amount,
        catalog_id=catalog_id,
        created_at=now,
    )
    db.add(receipt)
    db.flush()
    return receipt


def _saved(db: Session, user_id: int, grant_key: str) -> tuple[dict[str, Any], bool]:
    try:
        db.flush()
    except IntegrityError:
        db.rollback()
        if _receipt(db, user_id, grant_key) is None:
            raise APIError(
                409, "stamp_conflict", "That Stamp receipt was already recorded."
            ) from None
        return read_wallet(db, user_id), False
    return read_wallet(db, user_id), True


def _write(
    db: Session, user_id: int, grant_key: str, write: Callable[[], None]
) -> tuple[dict[str, Any], bool]:
    try:
        write()
    except IntegrityError:
        db.rollback()
        if _receipt(db, user_id, grant_key) is None:
            raise APIError(
                409, "stamp_conflict", "That Stamp receipt was already recorded."
            ) from None
        return read_wallet(db, user_id), False
    return _saved(db, user_id, grant_key)


def grant_stamps(
    db: Session, user_id: int, payload: dict[str, Any], now: datetime
) -> tuple[dict[str, Any], bool]:
    body = _parse(StampGrantCreate, payload)
    _lock(db, user_id)
    if _receipt(db, user_id, body.grant_key) is not None:
        return read_wallet(db, user_id), False
    if not _move(db, user_id, body.amount):
        raise APIError(409, "stamp_conflict", "That Stamp receipt was already recorded.")

    def write() -> None:
        _add_receipt(db, user_id, body.grant_key, body.consumer, "grant", body.amount, None, now)

    return _write(db, user_id, body.grant_key, write)


def purchase_stamps(
    db: Session, user_id: int, payload: dict[str, Any], now: datetime
) -> tuple[dict[str, Any], bool]:
    body = _parse(StampPurchaseCreate, payload)
    _lock(db, user_id)
    previous = _receipt(db, user_id, body.grant_key)
    if previous is not None:
        if previous.kind != "spend" or previous.catalog_id != body.catalog_id:
            raise APIError(409, "stamp_conflict", "That Stamp receipt was already recorded.")
        return read_wallet(db, user_id), False
    spec = CATALOG.get(body.catalog_id)
    if spec is None or spec.price == 0:
        raise APIError(422, "item_not_for_sale", "That item is not sold at the workshop.")
    price = spec.price
    if body.amount is not None and body.amount != price:
        raise APIError(422, "stamp_price_changed", "Check the current workshop price.")
    held = _entitlement(db, user_id, body.catalog_id)
    if held is not None and held.refund_receipt_id is None:
        raise APIError(409, "already_unlocked", "That unlock is already in the wallet.")
    if not _move(db, user_id, -price):
        raise APIError(
            409,
            "insufficient_stamps",
            "That unlock costs more Stamps than the wallet holds.",
        )

    def write() -> None:
        receipt = _add_receipt(
            db, user_id, body.grant_key, "market", "spend", price, body.catalog_id, now
        )
        if held is None:
            db.add(
                StampEntitlement(
                    user_id=user_id,
                    catalog_id=body.catalog_id,
                    spend_receipt_id=receipt.id,
                    refund_receipt_id=None,
                )
            )
        else:
            held.spend_receipt_id = receipt.id
            held.refund_receipt_id = None

    return _write(db, user_id, body.grant_key, write)


def refund_stamps(
    db: Session, user_id: int, payload: dict[str, Any], now: datetime
) -> tuple[dict[str, Any], bool]:
    body = _parse(StampRefundCreate, payload)
    _lock(db, user_id)
    previous = _receipt(db, user_id, body.grant_key)
    if previous is not None:
        if previous.kind != "refund" or previous.catalog_id != body.catalog_id:
            raise APIError(409, "stamp_conflict", "That Stamp receipt was already recorded.")
        return read_wallet(db, user_id), False
    held = _entitlement(db, user_id, body.catalog_id)
    if held is None or held.refund_receipt_id is not None:
        raise APIError(404, "entitlement_not_found", "Refund applies to an unlock you still hold.")
    expected = body.spend_receipt_id
    if expected is None:
        prefix = f"market:refund:{body.catalog_id}:"
        old_spend_id = body.grant_key.removeprefix(prefix)
        if body.grant_key.startswith(prefix) and old_spend_id.isdecimal():
            expected = int(old_spend_id)
    if expected is not None and held.spend_receipt_id != expected:
        raise APIError(409, "unlock_changed", "The unlock changed. Review it before refunding.")
    spend = db.get(StampReceipt, held.spend_receipt_id)
    if spend is None or spend.user_id != user_id or spend.kind != "spend":
        raise APIError(404, "entitlement_not_found", "Refund applies to an unlock you still hold.")
    require_unused_unlock(db, user_id, body.catalog_id)
    if not _move(db, user_id, spend.amount):
        raise APIError(409, "stamp_conflict", "That Stamp receipt was already recorded.")

    def write() -> None:
        receipt = _add_receipt(
            db,
            user_id,
            body.grant_key,
            "market",
            "refund",
            spend.amount,
            body.catalog_id,
            now,
        )
        held.refund_receipt_id = receipt.id

    return _write(db, user_id, body.grant_key, write)
