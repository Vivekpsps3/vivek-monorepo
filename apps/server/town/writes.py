"""Owner-scoped habit and check-in writes. Responses come from the read models."""

from __future__ import annotations

import json
from datetime import UTC, date, datetime, timedelta
from typing import Any

from fastapi import Request
from pydantic import BaseModel, ValidationError
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from apps.server.errors import APIError
from apps.server.town.constants import CHECKIN_WINDOW, HABIT_TOTAL_MAX, SLOT_DEFAULT_STYLE
from apps.server.town.engine import (
    BUILDING_STYLE_ERROR,
    NAME_LENGTH_ERROR,
    PER_WEEK_ERROR,
    SLOT_ERROR,
    cadence_kind,
    field_validation_error,
    name_key,
    name_validation_error,
    plan_cadence_change,
    require_building_style,
    require_slot,
    validate_name,
)
from apps.server.town.models import Habit, HabitCadence, HabitCheckin
from apps.server.town.schemas import CheckinCreate, HabitCreate, HabitPatch
from apps.server.town.service import read_habits, read_town

_CHECK = "Check the highlighted fields."
_MISSING = "That habit doesn't exist."
_ARCHIVED = "That habit is archived."
_OCCUPIED = "That lot already has a building."
_TAKEN = "You already have a habit with that name."
_LIMIT = "You've reached 200 habits, including archived ones."
_WINDOW = "You can only check in for today or yesterday."
_BEFORE = "That day is before this habit started."
_UNDO = "Only today's check-in can be undone."
_TYPE_COPY = {
    "name": NAME_LENGTH_ERROR,
    "slot": SLOT_ERROR,
    "per_week": PER_WEEK_ERROR,
    "building_style": BUILDING_STYLE_ERROR,
}


def _invalid(exc: ValidationError) -> APIError:
    """Type errors on known fields keep a sentence. Anything else has null field_errors."""
    fields: dict[str, str] = {}
    for item in exc.errors():
        kind = str(item.get("type") or "")
        loc = item.get("loc") or ()
        key = loc[0] if loc and isinstance(loc[0], str) else ""
        sentence = _TYPE_COPY.get(key)
        if sentence is None or "type" not in kind:
            return APIError(422, "validation_error", _CHECK)
        fields[key] = sentence
    return APIError(422, "validation_error", _CHECK, field_errors=fields or None)


def _model[ModelT: BaseModel](kind: type[ModelT], payload: dict[str, Any]) -> ModelT:
    try:
        return kind.model_validate(payload)
    except ValidationError as exc:
        raise _invalid(exc) from None


async def json_object(request: Request) -> dict[str, Any]:
    try:
        payload = json.loads(await request.body() or b"null")
    except json.JSONDecodeError:
        payload = None
    if type(payload) is not dict:
        raise APIError(422, "validation_error", _CHECK)
    return payload


def _owned(db: Session, user_id: int, habit_id: int) -> Habit:
    habit = db.scalar(select(Habit).where(Habit.id == habit_id, Habit.user_id == user_id))
    if habit is None:
        raise APIError(404, "habit_not_found", _MISSING)
    return habit


def _active(habit: Habit) -> None:
    if habit.archived_at is not None:
        raise APIError(409, "habit_archived", _ARCHIVED)


def _view(db: Session, user_id: int, today: date, tz: str, habit_id: int) -> dict[str, Any]:
    for item in read_habits(db, user_id, today, tz, include_archived=True)["items"]:
        if item["id"] == habit_id:
            return item
    raise APIError(404, "habit_not_found", _MISSING)


def _levels(db: Session, user_id: int, today: date, tz: str) -> dict[str, Any]:
    town = read_town(db, user_id, today, tz)["town"]
    return {
        "xp": town["xp"],
        "level": town["level"],
        "level_xp_start": town["level_xp_start"],
        "next_level_xp": town["next_level_xp"],
    }


def existing_checkin(db: Session, user_id: int, habit_id: int, day: date) -> HabitCheckin | None:
    return db.scalar(
        select(HabitCheckin).where(
            HabitCheckin.habit_id == habit_id,
            HabitCheckin.user_id == user_id,
            HabitCheckin.day == day,
        )
    )


def _lot(db: Session, user_id: int, today: date, tz: str, slot: int) -> dict[str, Any]:
    for lot in read_town(db, user_id, today, tz)["lots"]:
        if lot["slot"] == slot:
            return lot
    raise field_validation_error("slot", SLOT_ERROR)


def _name_taken(db: Session, user_id: int, key: str, habit_id: int | None) -> bool:
    query = select(Habit.id).where(
        Habit.user_id == user_id,
        Habit.archived_at.is_(None),
        Habit.name_key == key,
    )
    if habit_id is not None:
        query = query.where(Habit.id != habit_id)
    return db.scalar(query) is not None


def _clean_name(raw: str) -> tuple[str, str]:
    result = validate_name(raw)
    if not result.ok:
        raise name_validation_error(result)
    return result.name, name_key(result.name)


def _per_week(value: object) -> int:
    if type(value) is not int:
        raise field_validation_error("per_week", PER_WEEK_ERROR)
    cadence_kind(value)
    return value


def _constraint(exc: IntegrityError) -> str:
    # orig names the failed index. The statement text names every inserted column.
    text = str(getattr(exc, "orig", "") or "").lower()
    if "habit_checkins" in text or "uq_checkin" in text:
        return "checkin"
    if "name_key" in text or "uq_habits_active_name" in text:
        return "name"
    if "slot" in text or "uq_habits_active_slot" in text:
        return "slot"
    return ""


def _flush(db: Session) -> None:
    try:
        db.flush()
    except IntegrityError as exc:
        db.rollback()
        kind = _constraint(exc)
        if kind == "slot":
            raise APIError(409, "slot_occupied", _OCCUPIED) from None
        if kind == "name":
            raise APIError(409, "name_taken", _TAKEN) from None
        raise


def _path_day(value: str) -> date:
    if len(value) != 10 or value[4] != "-" or value[7] != "-":
        raise APIError(422, "validation_error", _CHECK)
    try:
        parsed = date.fromisoformat(value)
    except ValueError:
        raise APIError(422, "validation_error", _CHECK) from None
    if parsed.isoformat() != value:
        raise APIError(422, "validation_error", _CHECK)
    return parsed


def _assign_name(db: Session, user_id: int, habit: Habit | None, raw: str) -> tuple[str, str]:
    name, key = _clean_name(raw)
    owner = habit.id if habit is not None else None
    if _name_taken(db, user_id, key, owner):
        raise APIError(409, "name_taken", _TAKEN)
    return name, key


def _cadence(
    db: Session, user_id: int, habit: Habit, today: date, now: datetime, per_week: int
) -> None:
    # The habit row keeps its original per_week. Only the Monday row changes.
    found = db.execute(
        select(HabitCadence.effective_from, HabitCadence.per_week).where(
            HabitCadence.habit_id == habit.id,
            HabitCadence.user_id == user_id,
        )
    ).all()
    rows: list[tuple[date, int]] = [(start, int(per_week_value)) for start, per_week_value in found]
    change = plan_cadence_change(today, habit.per_week, rows, per_week)
    if change is None:
        return
    current = db.scalar(
        select(HabitCadence).where(
            HabitCadence.habit_id == habit.id,
            HabitCadence.user_id == user_id,
            HabitCadence.effective_from == change.effective_from,
        )
    )
    if change.action == "delete":
        if current is not None:
            db.delete(current)
        return
    if current is None:
        db.add(
            HabitCadence(
                habit_id=habit.id,
                user_id=user_id,
                per_week=change.per_week,
                effective_from=change.effective_from,
                created_at=now,
            )
        )
        return
    current.per_week = change.per_week


def _checkin_body(
    db: Session,
    user_id: int,
    today: date,
    tz: str,
    habit_id: int,
    day: date,
    checked: bool,
) -> dict[str, Any]:
    return {
        "day": day,
        "checked": checked,
        "habit": _view(db, user_id, today, tz, habit_id),
        "town": _levels(db, user_id, today, tz),
    }


def create_habit_row(
    db: Session, user_id: int, today: date, now: datetime, tz: str, model: HabitCreate
) -> dict[str, Any]:
    name, key = _clean_name(model.name)
    slot = require_slot(model.slot)
    per_week = _per_week(model.per_week)
    if "building_style" in model.model_fields_set and model.building_style is None:
        raise field_validation_error("building_style", BUILDING_STYLE_ERROR)
    if model.building_style is None:
        style = SLOT_DEFAULT_STYLE[slot]
    else:
        style = require_building_style(model.building_style)
    count = db.scalar(select(func.count()).select_from(Habit).where(Habit.user_id == user_id)) or 0
    if count >= HABIT_TOTAL_MAX:
        raise APIError(409, "habit_limit", _LIMIT)
    lot = _lot(db, user_id, today, tz, slot)
    if lot["state"] == "occupied":
        raise APIError(409, "slot_occupied", _OCCUPIED)
    if lot["state"] == "locked":
        raise APIError(409, "slot_locked", f"That lot unlocks at Lv {lot['unlock_level']}.")
    if _name_taken(db, user_id, key, None):
        raise APIError(409, "name_taken", _TAKEN)
    habit = Habit(
        user_id=user_id,
        name=name,
        name_key=key,
        slot=slot,
        building_style=style,
        per_week=per_week,
        created_on=today,
        created_at=now,
        archived_at=None,
        archived_on=None,
    )
    db.add(habit)
    _flush(db)
    return _view(db, user_id, today, tz, habit.id)


async def create_habit(
    db: Session, user_id: int, today: date, now: datetime, tz: str, request: Request
) -> dict[str, Any]:
    model = _model(HabitCreate, await json_object(request))
    return create_habit_row(db, user_id, today, now, tz, model)


async def patch_habit(
    db: Session,
    user_id: int,
    habit_id: int,
    today: date,
    now: datetime,
    tz: str,
    request: Request,
) -> dict[str, Any]:
    # archived:false is an invalid payload, before the habit is looked up.
    model = _model(HabitPatch, await json_object(request))
    if model.archived is False:
        raise APIError(422, "validation_error", _CHECK)
    habit = _owned(db, user_id, habit_id)
    _active(habit)
    if "name" in model.model_fields_set:
        if model.name is None:
            raise field_validation_error("name", NAME_LENGTH_ERROR)
        habit.name, habit.name_key = _assign_name(db, user_id, habit, model.name)
    if "building_style" in model.model_fields_set:
        if model.building_style is None:
            raise field_validation_error("building_style", BUILDING_STYLE_ERROR)
        habit.building_style = require_building_style(model.building_style)
    if "per_week" in model.model_fields_set:
        if model.per_week is None:
            raise field_validation_error("per_week", PER_WEEK_ERROR)
        _cadence(db, user_id, habit, today, now, _per_week(model.per_week))
    if model.archived is True:
        habit.archived_at = now
        habit.archived_on = today
    owned_id = habit.id
    _flush(db)
    return _view(db, user_id, today, tz, owned_id)


def _server_day(now: datetime) -> date:
    """CHECKIN_WINDOW anchor. The client picks tz, so the server clock decides."""
    if now.tzinfo is None:
        now = now.replace(tzinfo=UTC)
    return now.astimezone(UTC).date()


def create_checkin_day(
    db: Session,
    user_id: int,
    habit_id: int,
    today: date,
    now: datetime,
    tz: str,
    day: date,
) -> tuple[dict[str, Any], int]:
    habit = _owned(db, user_id, habit_id)
    # Archived wins over the window. The window wins over day_before_habit.
    _active(habit)
    server_today = _server_day(now)
    start = server_today + timedelta(days=CHECKIN_WINDOW[0])
    end = server_today + timedelta(days=CHECKIN_WINDOW[1])
    if day < start or day > end:
        raise APIError(422, "day_out_of_window", _WINDOW)
    if day < habit.created_on:
        raise APIError(422, "day_before_habit", _BEFORE)
    owned_id = habit.id
    status = 200
    if existing_checkin(db, user_id, owned_id, day) is None:
        db.add(HabitCheckin(habit_id=owned_id, user_id=user_id, day=day, created_at=now))
        try:
            db.flush()
        except IntegrityError:
            db.rollback()
            if existing_checkin(db, user_id, owned_id, day) is None:
                raise
        else:
            status = 201
    return _checkin_body(db, user_id, today, tz, owned_id, day, True), status


async def create_checkin(
    db: Session,
    user_id: int,
    habit_id: int,
    today: date,
    now: datetime,
    tz: str,
    request: Request,
) -> tuple[dict[str, Any], int]:
    model = _model(CheckinCreate, await json_object(request))
    return create_checkin_day(db, user_id, habit_id, today, now, tz, model.day)


def delete_checkin(
    db: Session,
    user_id: int,
    habit_id: int,
    raw_day: str,
    today: date,
    tz: str,
    now: datetime,
) -> dict[str, Any]:
    # A bad date is 422 before the habit lookup.
    day = _path_day(raw_day)
    habit = _owned(db, user_id, habit_id)
    _active(habit)
    server_today = _server_day(now)
    if day < server_today or day > server_today + timedelta(days=CHECKIN_WINDOW[1]):
        raise APIError(409, "checkin_locked", _UNDO)
    owned_id = habit.id
    row = existing_checkin(db, user_id, owned_id, day)
    if row is not None:
        db.delete(row)
        db.flush()
    return _checkin_body(db, user_id, today, tz, owned_id, day, False)
