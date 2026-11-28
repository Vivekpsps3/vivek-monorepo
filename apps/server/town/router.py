"""Town routes."""

import re
from datetime import date, datetime
from typing import Annotated
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, Query, Request, Response
from fastapi.concurrency import run_in_threadpool
from pydantic import BeforeValidator
from sqlalchemy.orm import Session

from apps.server.auth import Principal, require_principal
from apps.server.database import get_db
from apps.server.errors import APIError
from apps.server.identity.models import User
from apps.server.identity.session import get_current_user
from apps.server.path_ids import MAX_PATH_ID
from apps.server.town import writes
from apps.server.town.clock import get_town_clock, resolve_tz
from apps.server.town.dialogue import complete_conversation, read_directory
from apps.server.town.discoveries import read_journal as read_discoveries
from apps.server.town.discoveries import record_discovery
from apps.server.town.keepsakes import read_keepsakes
from apps.server.town.layouts import ROOMS, parse_body, read_layout, save_layout
from apps.server.town.play_receipts import finish_run, open_run, read_arcade, refuse_public_minigame
from apps.server.town.quests import read_journal, record_step
from apps.server.town.schemas import (
    CheckinDays,
    CheckinResult,
    DialogueDirectoryView,
    DiscoveryJournalView,
    Habit,
    HabitList,
    HubTownSummary,
    Keepsakes,
    PlayCollectionView,
    PlayRunView,
    QuestJournalView,
    RoomLayoutView,
    StampWalletView,
    Town,
)
from apps.server.town.service import read_checkins, read_habits, read_town, read_town_summary
from apps.server.town.stamps import grant_stamps, purchase_stamps, read_wallet, refund_stamps
from packages.time.today import today_in_zone

router = APIRouter(prefix="/town", tags=["town"])

_DATE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
_CHECK_FIELDS = "Check the highlighted fields."


def _habit_id(value: object) -> int:
    # T1F: the shared bounded_path_id pattern (same match and bounds as
    # apps.server.path_ids), raising the town APIError so an invalid id's
    # response is identical to a well-formed unknown habit's: a non-integer,
    # non-positive, or out-of-SQLite-range id is 404 habit_not_found, never
    # a 422 and never a 500 overflow.
    try:
        if re.fullmatch(r"[+-]?[0-9]+", str(value)):
            parsed = int(str(value))
            if 1 <= parsed <= MAX_PATH_ID:
                return parsed
    except ValueError:
        pass
    raise APIError(404, "habit_not_found", "That habit doesn't exist.")


HabitId = Annotated[int, BeforeValidator(_habit_id)]


def _reject() -> APIError:
    # Bad or missing from/to: field_errors stays null (Q4).
    return APIError(422, "validation_error", _CHECK_FIELDS)


def _date_param(value: str | None) -> date:
    if value is None or _DATE.fullmatch(value) is None:
        raise _reject()
    try:
        return date.fromisoformat(value)
    except ValueError:
        raise _reject() from None


def _archived_flag(value: str | None) -> bool:
    # Absent, blank, or 0 excludes archived habits. Any other value is 422 (Q3).
    if value is None or value in {"", "0"}:
        return False
    if value == "1":
        return True
    raise _reject()


def _zone(tz: str | None, now: datetime) -> tuple[str, date]:
    zone = resolve_tz(tz)
    return zone, today_in_zone(zone, now)


@router.get("", response_model=Town)
def get_town(
    tz: str | None = None,
    db: Session = Depends(get_db, scope="function"),
    principal: Principal = Depends(require_principal),
    now: datetime = Depends(get_town_clock),
) -> Town:
    zone = resolve_tz(tz)
    return Town.model_validate(read_town(db, principal.id, today_in_zone(zone, now), zone))


@router.get("/keepsakes", response_model=Keepsakes)
def get_keepsakes(
    tz: str | None = None,
    on_day: Annotated[str | None, Query(alias="on")] = None,
    db: Session = Depends(get_db, scope="function"),
    principal: Principal = Depends(require_principal),
    now: datetime = Depends(get_town_clock),
) -> Keepsakes:
    zone = resolve_tz(tz)
    selected = None if on_day is None else _date_param(on_day)
    return Keepsakes.model_validate(
        read_keepsakes(db, principal.id, zone, today_in_zone(zone, now), selected)
    )


@router.get("/summary", response_model=HubTownSummary)
def get_town_summary(
    tz: str | None = None,
    db: Session = Depends(get_db, scope="function"),
    principal: Principal = Depends(require_principal),
    now: datetime = Depends(get_town_clock),
) -> HubTownSummary:
    zone = resolve_tz(tz)
    return HubTownSummary.model_validate(
        read_town_summary(db, principal.id, today_in_zone(zone, now), zone)
    )


@router.get("/habits", response_model=HabitList)
def get_habits(
    tz: str | None = None,
    include_archived: str | None = None,
    db: Session = Depends(get_db, scope="function"),
    principal: Principal = Depends(require_principal),
    now: datetime = Depends(get_town_clock),
) -> HabitList:
    zone = resolve_tz(tz)
    return HabitList.model_validate(
        read_habits(
            db,
            principal.id,
            today_in_zone(zone, now),
            zone,
            include_archived=_archived_flag(include_archived),
        )
    )


@router.get("/habits/{habit_id}/checkins", response_model=CheckinDays)
def get_checkins(
    habit_id: HabitId,
    start: Annotated[str | None, Query(alias="from")] = None,
    end: Annotated[str | None, Query(alias="to")] = None,
    tz: str | None = None,
    db: Session = Depends(get_db, scope="function"),
    principal: Principal = Depends(require_principal),
) -> CheckinDays:
    resolve_tz(tz)  # accepted like the other reads; stored days are already local
    first = _date_param(start)
    last = _date_param(end)
    if first > last or (last - first).days > 120:
        raise _reject()
    return CheckinDays.model_validate(read_checkins(db, principal.id, habit_id, first, last))


@router.post("/habits", response_model=Habit, status_code=201)
async def post_habit(
    request: Request,
    tz: str | None = None,
    db: Session = Depends(get_db, scope="function"),
    user: User = Depends(get_current_user),
    now: datetime = Depends(get_town_clock),
) -> Habit:
    zone, today = _zone(tz, now)
    payload = await writes.create_habit(db, user.id, today, now, zone, request)
    return Habit.model_validate(payload)


@router.patch("/habits/{habit_id}", response_model=Habit)
async def patch_habit(
    habit_id: HabitId,
    request: Request,
    tz: str | None = None,
    db: Session = Depends(get_db, scope="function"),
    user: User = Depends(get_current_user),
    now: datetime = Depends(get_town_clock),
) -> Habit:
    zone, today = _zone(tz, now)
    payload = await writes.patch_habit(db, user.id, habit_id, today, now, zone, request)
    return Habit.model_validate(payload)


@router.post("/habits/{habit_id}/checkins", response_model=CheckinResult)
async def post_checkin(
    habit_id: HabitId,
    request: Request,
    response: Response,
    tz: str | None = None,
    db: Session = Depends(get_db, scope="function"),
    user: User = Depends(get_current_user),
    now: datetime = Depends(get_town_clock),
) -> CheckinResult:
    zone, today = _zone(tz, now)
    payload, status = await writes.create_checkin(db, user.id, habit_id, today, now, zone, request)
    response.status_code = status
    return CheckinResult.model_validate(payload)


@router.delete("/habits/{habit_id}/checkins/{day}", response_model=CheckinResult)
def delete_checkin(
    habit_id: HabitId,
    day: str,
    tz: str | None = None,
    db: Session = Depends(get_db, scope="function"),
    user: User = Depends(get_current_user),
    now: datetime = Depends(get_town_clock),
) -> CheckinResult:
    zone, today = _zone(tz, now)
    payload = writes.delete_checkin(db, user.id, habit_id, day, today, zone, now)
    return CheckinResult.model_validate(payload)


@router.get("/stamps", response_model=StampWalletView)
def get_stamps(
    db: Session = Depends(get_db, scope="function"),
    principal: Principal = Depends(require_principal),
) -> StampWalletView:
    return StampWalletView.model_validate(read_wallet(db, principal.id))


@router.post("/stamps/grants", response_model=StampWalletView)
async def post_stamp_grant(
    request: Request,
    response: Response,
    db: Session = Depends(get_db, scope="function"),
    user: User = Depends(get_current_user),
    now: datetime = Depends(get_town_clock),
) -> StampWalletView:
    payload = await writes.json_object(request)
    refuse_public_minigame(db, user.id, payload)
    wallet, created = grant_stamps(db, user.id, payload, now)
    response.status_code = 201 if created else 200
    return StampWalletView.model_validate(wallet)


@router.get("/minigames/runs", response_model=PlayCollectionView)
def get_play_runs(
    db: Session = Depends(get_db, scope="function"),
    principal: Principal = Depends(require_principal),
) -> PlayCollectionView:
    return PlayCollectionView.model_validate(read_arcade(db, principal.id))


@router.post("/minigames/runs", response_model=PlayRunView, status_code=201)
async def post_play_run(
    request: Request,
    tz: str | None = None,
    db: Session = Depends(get_db, scope="function"),
    user: User = Depends(get_current_user),
    now: datetime = Depends(get_town_clock),
) -> PlayRunView:
    payload = await writes.json_object(request)
    view = await run_in_threadpool(open_run, db, user.id, payload, now, tz)
    return PlayRunView.model_validate(view)


@router.post("/minigames/runs/{nonce}/finish", response_model=PlayRunView)
async def post_play_finish(
    nonce: str,
    request: Request,
    response: Response,
    tz: str | None = None,
    db: Session = Depends(get_db, scope="function"),
    user: User = Depends(get_current_user),
    now: datetime = Depends(get_town_clock),
) -> PlayRunView:
    del tz
    payload = await writes.json_object(request)
    view, created = await run_in_threadpool(finish_run, db, user.id, nonce, payload, now)
    response.status_code = 201 if created else 200
    return PlayRunView.model_validate(view)


@router.post("/stamps/purchases", response_model=StampWalletView)
async def post_stamp_purchase(
    request: Request,
    response: Response,
    db: Session = Depends(get_db, scope="function"),
    user: User = Depends(get_current_user),
    now: datetime = Depends(get_town_clock),
) -> StampWalletView:
    payload = await writes.json_object(request)
    # A competing SQLite writer can wait for the first request to commit.
    # Keep that wait off the event loop so it can schedule the first commit.
    wallet, created = await run_in_threadpool(purchase_stamps, db, user.id, payload, now)
    response.status_code = 201 if created else 200
    return StampWalletView.model_validate(wallet)


@router.post("/stamps/refunds", response_model=StampWalletView)
async def post_stamp_refund(
    request: Request,
    response: Response,
    db: Session = Depends(get_db, scope="function"),
    user: User = Depends(get_current_user),
    now: datetime = Depends(get_town_clock),
) -> StampWalletView:
    payload = await writes.json_object(request)
    wallet, created = refund_stamps(db, user.id, payload, now)
    response.status_code = 201 if created else 200
    return StampWalletView.model_validate(wallet)


@router.get("/quests", response_model=QuestJournalView)
def get_quests(
    db: Session = Depends(get_db, scope="function"),
    principal: Principal = Depends(require_principal),
) -> QuestJournalView:
    return QuestJournalView.model_validate(read_journal(db, principal.id))


@router.post("/quests/steps", response_model=QuestJournalView)
async def post_quest_step(
    request: Request,
    response: Response,
    db: Session = Depends(get_db, scope="function"),
    user: User = Depends(get_current_user),
    now: datetime = Depends(get_town_clock),
) -> QuestJournalView:
    payload = await writes.json_object(request)
    # A competing SQLite writer can wait for the first request to commit.
    view, created = await run_in_threadpool(record_step, db, user.id, payload, now)
    response.status_code = 201 if created else 200
    return QuestJournalView.model_validate(view)


def _hour(tz: str | None, now: datetime) -> int:
    return now.astimezone(ZoneInfo(resolve_tz(tz))).hour


@router.get("/residents", response_model=DialogueDirectoryView)
def get_residents(
    tz: str | None = None,
    db: Session = Depends(get_db, scope="function"),
    principal: Principal = Depends(require_principal),
    now: datetime = Depends(get_town_clock),
) -> DialogueDirectoryView:
    return DialogueDirectoryView.model_validate(read_directory(db, principal.id, _hour(tz, now)))


@router.post("/residents/conversations", response_model=DialogueDirectoryView)
async def post_resident_conversation(
    request: Request,
    response: Response,
    tz: str | None = None,
    db: Session = Depends(get_db, scope="function"),
    user: User = Depends(get_current_user),
    now: datetime = Depends(get_town_clock),
) -> DialogueDirectoryView:
    payload = await writes.json_object(request)
    view, created = await run_in_threadpool(
        complete_conversation, db, user.id, payload, now, _hour(tz, now)
    )
    response.status_code = 201 if created else 200
    return DialogueDirectoryView.model_validate(view)


@router.get("/discoveries", response_model=DiscoveryJournalView)
def get_discoveries(
    db: Session = Depends(get_db, scope="function"),
    principal: Principal = Depends(require_principal),
) -> DiscoveryJournalView:
    return DiscoveryJournalView.model_validate(read_discoveries(db, principal.id))


@router.post("/discoveries", response_model=DiscoveryJournalView)
async def post_discovery(
    request: Request,
    response: Response,
    db: Session = Depends(get_db, scope="function"),
    user: User = Depends(get_current_user),
    now: datetime = Depends(get_town_clock),
) -> DiscoveryJournalView:
    payload = await writes.json_object(request)
    view, created = await run_in_threadpool(record_discovery, db, user.id, payload, now)
    response.status_code = 201 if created else 200
    return DiscoveryJournalView.model_validate(view)


@router.get("/layouts/{room_id}", response_model=RoomLayoutView, response_model_exclude_unset=True)
def get_layout(
    room_id: str,
    db: Session = Depends(get_db, scope="function"),
    principal: Principal = Depends(require_principal),
) -> RoomLayoutView:
    return RoomLayoutView.model_validate(read_layout(db, principal.id, room_id))


@router.put("/layouts/{room_id}", response_model=RoomLayoutView, response_model_exclude_unset=True)
async def put_layout(
    room_id: str,
    request: Request,
    response: Response,
    tz: str | None = None,
    db: Session = Depends(get_db, scope="function"),
    user: User = Depends(get_current_user),
    now: datetime = Depends(get_town_clock),
) -> RoomLayoutView:
    if room_id not in ROOMS:
        raise APIError(404, "layout_not_found", "That room is not in this home.")
    view, created = save_layout(
        db, user.id, room_id, parse_body(await request.body()), now, resolve_tz(tz)
    )
    response.status_code = 201 if created else 200
    return RoomLayoutView.model_validate(view)
