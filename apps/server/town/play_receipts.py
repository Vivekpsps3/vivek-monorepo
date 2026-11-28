"""Owner-scoped minigame runs.

A run binds a nonce, the authored seed, and one Town civil day. The day is
taken from the server clock and the caller's zone when the run opens. Finish
retries keep that day. The first completed win of each game grants 5 Stamps.
The two games share a cap of 10, so a replay stores its score and grants none.
"""

from __future__ import annotations

import re
import secrets
from datetime import datetime
from typing import Any, Literal, NoReturn

from pydantic import BaseModel, ConfigDict, ValidationError, field_validator, model_validator
from sqlalchemy import select, text
from sqlalchemy.orm import Session

from apps.server.errors import APIError
from apps.server.town.clock import resolve_tz
from apps.server.town.models import PlayReceipt, StampReceipt, StampWallet
from apps.server.town.stamps import grant_stamps
from packages.time.today import today_in_zone

_CHECK = "Check the highlighted fields."
_MISSING = "That play receipt is not available."
_REJECTED = "That play receipt does not match this run."
_INCOMPLETE = "Finish the game before it can grant Stamps."
_PUBLIC = "Minigame Stamps come from a finished play receipt."
_NONCE = re.compile(r"^[A-Za-z0-9_-]{16,64}$")
_SYMBOLS = ("Lantern", "Ferry", "Shell", "Chart", "Bell", "Glass")
_FACES = frozenset({"down", "up", "matched"})
_RESULTS = frozenset({"pending", "hit", "miss"})
MEMORY_GAME = "memory-shelves"
HARBOR_GAME = "harbor-rhythm"
MEMORY_SEED = 10
RHYTHM_SEED = 1
REWARD = 5
CAP = 10
_WINDOW = 800
_DURATION = 30_000
RHYTHM_CHART: tuple[tuple[int, int], ...] = (
    (0, 1_800),
    (1, 3_600),
    (2, 5_400),
    (3, 7_200),
    (2, 9_000),
    (0, 10_800),
    (3, 12_600),
    (1, 14_400),
    (0, 16_200),
    (2, 18_000),
    (3, 19_800),
    (1, 21_600),
    (2, 23_400),
    (0, 25_200),
    (1, 27_000),
    (3, 28_800),
)


class _Write(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)


class _Open(_Write):
    game_id: Literal["memory-shelves", "harbor-rhythm"]
    mode: Literal["timed", "untimed"] | None = None

    @model_validator(mode="after")
    def _mode_matches_game(self) -> _Open:
        if self.game_id == MEMORY_GAME and self.mode is not None:
            raise ValueError("mode")
        if self.game_id == HARBOR_GAME and self.mode is None:
            raise ValueError("mode")
        return self


class _Tile(_Write):
    index: int
    symbol: str
    face: Literal["down", "up", "matched"]

    @field_validator("index")
    @classmethod
    def _index(cls, value: int) -> int:
        if not 0 <= value <= 11:
            raise ValueError("index")
        return value

    @field_validator("symbol")
    @classmethod
    def _symbol(cls, value: str) -> str:
        if not 1 <= len(value) <= 40:
            raise ValueError("symbol")
        return value


class _MemoryFinish(_Write):
    seed: int
    moves: int
    tiles: list[_Tile]

    @field_validator("seed")
    @classmethod
    def _seed(cls, value: int) -> int:
        if value < 0 or value > 1_000_000:
            raise ValueError("seed")
        return value

    @field_validator("moves")
    @classmethod
    def _moves(cls, value: int) -> int:
        if not 0 <= value <= 1000:
            raise ValueError("moves")
        return value

    @field_validator("tiles")
    @classmethod
    def _tiles(cls, value: list[_Tile]) -> list[_Tile]:
        if len(value) != 12:
            raise ValueError("tiles")
        return value


class _Note(_Write):
    lane: int
    at: int
    result: Literal["pending", "hit", "miss"]

    @field_validator("lane")
    @classmethod
    def _lane(cls, value: int) -> int:
        if not 0 <= value <= 3:
            raise ValueError("lane")
        return value

    @field_validator("at")
    @classmethod
    def _at(cls, value: int) -> int:
        if value < 0 or value > _DURATION:
            raise ValueError("at")
        return value


class _HarborFinish(_Write):
    seed: int
    mode: Literal["timed", "untimed"]
    elapsed: int
    wrong: int
    notes: list[_Note]

    @field_validator("seed")
    @classmethod
    def _seed(cls, value: int) -> int:
        if value < 0 or value > 1_000_000:
            raise ValueError("seed")
        return value

    @field_validator("elapsed")
    @classmethod
    def _elapsed(cls, value: int) -> int:
        if value < 0 or value > _DURATION:
            raise ValueError("elapsed")
        return value

    @field_validator("wrong")
    @classmethod
    def _wrong(cls, value: int) -> int:
        if not 0 <= value <= 1000:
            raise ValueError("wrong")
        return value

    @field_validator("notes")
    @classmethod
    def _notes(cls, value: list[_Note]) -> list[_Note]:
        if len(value) != len(RHYTHM_CHART):
            raise ValueError("notes")
        return value


def memory_deal() -> list[str]:
    """Seed 10 shelf order. The same mix the browser uses for Memory Shelves."""
    faces: list[str] = []
    for symbol in _SYMBOLS:
        faces.extend((symbol, symbol))
    state = MEMORY_SEED & 0xFFFFFFFF
    order = list(range(len(faces)))
    for index in range(len(faces) - 1, 0, -1):
        state = (state * 1_664_525) & 0xFFFFFFFF
        state = (state + 1_013_904_223) & 0xFFFFFFFF
        swap = state % (index + 1)
        order[index], order[swap] = order[swap], order[index]
    return [faces[slot] for slot in order]


_DEAL = memory_deal()


def _parse[ModelT: BaseModel](kind: type[ModelT], payload: dict[str, Any]) -> ModelT:
    try:
        return kind.model_validate(payload)
    except ValidationError:
        raise APIError(422, "validation_error", _CHECK) from None


def _missing() -> NoReturn:
    raise APIError(404, "play_receipt_not_found", _MISSING)


def _rejected() -> NoReturn:
    raise APIError(422, "play_receipt_rejected", _REJECTED)


def _incomplete() -> NoReturn:
    raise APIError(422, "play_receipt_incomplete", _INCOMPLETE)


def _stamp(db: Session, user_id: int, grant_key: str) -> StampReceipt | None:
    return db.scalar(
        select(StampReceipt).where(
            StampReceipt.user_id == user_id,
            StampReceipt.grant_key == grant_key,
        )
    )


def refuse_public_minigame(db: Session, user_id: int, payload: dict[str, Any]) -> None:
    """New minigame grants come from a finished run, not the public grant route.

    A retry of a key that already exists still returns that receipt. This read
    does not create a wallet.
    """
    consumer = payload.get("consumer")
    key = payload.get("grant_key")
    minted = consumer == "minigame" or (isinstance(key, str) and key.startswith("minigame:"))
    if not minted:
        return
    if isinstance(key, str) and _stamp(db, user_id, key) is not None:
        return
    raise APIError(422, "play_receipt_required", _PUBLIC)


def _view(db: Session, row: PlayReceipt) -> dict[str, Any]:
    balance = db.scalar(select(StampWallet.balance).where(StampWallet.user_id == row.user_id))
    return {
        "nonce": row.nonce,
        "game_id": row.game_id,
        "seed": row.seed,
        "civil_day": row.civil_day.isoformat(),
        "status": row.status,
        "score": row.score,
        "rewarded": row.reward_amount == REWARD,
        "amount": row.reward_amount,
        "balance": 0 if balance is None else balance,
    }


def open_run(
    db: Session,
    user_id: int,
    payload: dict[str, Any],
    now: datetime,
    tz: str | None,
) -> dict[str, Any]:
    body = _parse(_Open, payload)
    zone = resolve_tz(tz)
    row = PlayReceipt(
        user_id=user_id,
        nonce=secrets.token_urlsafe(18),
        game_id=body.game_id,
        seed=MEMORY_SEED if body.game_id == MEMORY_GAME else RHYTHM_SEED,
        mode=body.mode,
        civil_day=today_in_zone(zone, now),
        zone=zone,
        status="open",
        score=None,
        reward_amount=0,
        created_at=now,
        completed_at=None,
    )
    db.add(row)
    db.flush()
    return _view(db, row)


def _owned(db: Session, user_id: int, nonce: str) -> PlayReceipt:
    if _NONCE.fullmatch(nonce) is None:
        _missing()
    row = db.scalar(select(PlayReceipt).where(PlayReceipt.nonce == nonce))
    if row is None or row.user_id != user_id:
        _missing()
    return row


def _accuracy(hits: int, misses: int, wrong: int) -> int:
    total = hits + misses + wrong
    if total == 0:
        return 0
    quotient, remainder = divmod(hits * 100, total)
    if remainder * 2 >= total:
        return quotient + 1
    return quotient


def _judge_memory(row: PlayReceipt, body: _MemoryFinish) -> int:
    if body.seed != row.seed or len(body.tiles) != len(_DEAL):
        _rejected()
    for index, tile in enumerate(body.tiles):
        if tile.index != index or tile.symbol != _DEAL[index] or tile.face not in _FACES:
            _rejected()
    if any(tile.face != "matched" for tile in body.tiles):
        _incomplete()
    if not 6 <= body.moves <= 1000:
        _rejected()
    return body.moves


def _chart_matches(notes: list[_Note]) -> bool:
    if len(notes) != len(RHYTHM_CHART):
        return False
    for note, authored in zip(notes, RHYTHM_CHART, strict=True):
        if note.lane != authored[0] or note.at != authored[1] or note.result not in _RESULTS:
            return False
    return True


def _judge_harbor(row: PlayReceipt, body: _HarborFinish) -> int:
    if body.seed != row.seed or body.mode != row.mode or not _chart_matches(body.notes):
        _rejected()
    if body.mode == "untimed":
        return _judge_untimed(body)
    return _judge_timed(body)


def _judge_untimed(body: _HarborFinish) -> int:
    if body.elapsed != 0:
        _rejected()
    if any(note.result == "miss" for note in body.notes):
        _rejected()
    hits = 0
    for index, note in enumerate(body.notes):
        if note.result == "hit":
            hits += 1
            continue
        if any(later.result != "pending" for later in body.notes[index:]):
            _rejected()
        _incomplete()
    return _accuracy(hits, 0, body.wrong)


def _judge_timed(body: _HarborFinish) -> int:
    elapsed = body.elapsed
    if elapsed % 100 != 0:
        _rejected()
    hits = 0
    misses = 0
    for note in body.notes:
        if note.result == "miss" and elapsed <= note.at + _WINDOW:
            _rejected()
        if note.result == "hit" and elapsed < note.at - _WINDOW:
            _rejected()
        if note.result == "pending" and elapsed > note.at + _WINDOW:
            _rejected()
        if note.result == "hit":
            hits += 1
        elif note.result == "miss":
            misses += 1
    if any(note.result == "pending" for note in body.notes) or elapsed < _DURATION:
        _incomplete()
    return _accuracy(hits, misses, body.wrong)


def _judge(row: PlayReceipt, payload: dict[str, Any]) -> int:
    if row.game_id == MEMORY_GAME:
        return _judge_memory(row, _parse(_MemoryFinish, payload))
    return _judge_harbor(row, _parse(_HarborFinish, payload))


def _lock_plays(db: Session) -> None:
    db.execute(text("UPDATE town_play_receipts SET nonce = nonce WHERE 0"))


def _minigame_total(db: Session, user_id: int, day: object) -> int:
    suffix = day.isoformat() if hasattr(day, "isoformat") else str(day)
    amounts = db.scalars(
        select(StampReceipt.amount).where(
            StampReceipt.user_id == user_id,
            StampReceipt.consumer == "minigame",
            StampReceipt.kind == "grant",
            StampReceipt.grant_key.like(f"minigame:%:{suffix}"),
        )
    )
    return sum(amounts)


def _grant_once(db: Session, row: PlayReceipt, now: datetime) -> int:
    user_id = row.user_id
    key = f"minigame:{row.game_id}:{row.civil_day.isoformat()}"
    if _stamp(db, user_id, key) is not None:
        return 0
    if _minigame_total(db, user_id, row.civil_day) + REWARD > CAP:
        return 0
    _wallet, created = grant_stamps(
        db,
        user_id,
        {"grant_key": key, "amount": REWARD, "consumer": "minigame"},
        now,
    )
    return REWARD if created else 0


def _reload(db: Session, user_id: int, row_id: int) -> PlayReceipt:
    row = db.get(PlayReceipt, row_id)
    if row is None or row.user_id != user_id:
        _missing()
    return row


def read_arcade(db: Session, user_id: int) -> dict[str, Any]:
    """Completed scores and once-only day medals. This read grants nothing."""
    rows = list(
        db.scalars(
            select(PlayReceipt)
            .where(PlayReceipt.user_id == user_id, PlayReceipt.status == "complete")
            .order_by(PlayReceipt.id)
        )
    )
    catalog = (
        (MEMORY_GAME, "Memory Shelves", "moves"),
        (HARBOR_GAME, "Harbor Rhythm", "accuracy"),
    )
    games: list[dict[str, Any]] = []
    for game_id, name, score_kind in catalog:
        owned = [row for row in rows if row.game_id == game_id and row.score is not None]
        best: PlayReceipt | None = None
        for row in owned:
            score = row.score
            if score is None:
                continue
            if best is None or best.score is None:
                best = row
                continue
            lower = game_id == MEMORY_GAME and score < best.score
            higher = game_id != MEMORY_GAME and score > best.score
            if lower or higher:
                best = row
        medals: list[dict[str, Any]] = []
        seen: set[str] = set()
        for row in owned:
            if row.reward_amount != REWARD:
                continue
            day = row.civil_day.isoformat()
            if day in seen:
                continue
            seen.add(day)
            medals.append(
                {
                    "civil_day": day,
                    "grant_key": f"minigame:{game_id}:{day}",
                    "amount": REWARD,
                    "nonce": row.nonce,
                }
            )
        games.append(
            {
                "game_id": game_id,
                "name": name,
                "score": None if best is None else best.score,
                "score_kind": score_kind,
                "source_nonce": None if best is None else best.nonce,
                "civil_day": None if best is None else best.civil_day.isoformat(),
                "medals": medals,
            }
        )
    return {"games": games}


def finish_run(
    db: Session,
    user_id: int,
    nonce: str,
    payload: dict[str, Any],
    now: datetime,
) -> tuple[dict[str, Any], bool]:
    row = _owned(db, user_id, nonce)
    score = _judge(row, payload)
    if row.status == "complete":
        return _view(db, row), False
    row_id = row.id
    _lock_plays(db)
    row = _reload(db, user_id, row_id)
    db.refresh(row)
    if row.status == "complete":
        return _view(db, row), False
    reward = _grant_once(db, row, now)
    row = _reload(db, user_id, row_id)
    if row.status == "complete":
        return _view(db, row), False
    row.status = "complete"
    row.score = score
    row.reward_amount = reward
    row.completed_at = now
    db.flush()
    return _view(db, row), True
