"""Town API shapes. Field names and nesting match design §8.1."""

from datetime import date
from typing import Literal

from pydantic import BaseModel, ConfigDict, field_validator

Last7Value = Literal["done", "rest", "miss", "pending", "none", "off"]
CadenceKind = Literal["daily", "weekly"]
StreakUnit = Literal["days", "weeks"]
BuildingSource = Literal["ok", "unavailable"]
LotState = Literal["occupied", "empty", "locked"]


class _Shape(BaseModel):
    model_config = ConfigDict(extra="forbid")


class PendingCadence(_Shape):
    per_week: int
    effective_from: date


class Cadence(_Shape):
    per_week: int
    kind: CadenceKind
    pending: PendingCadence | None


class Streak(_Shape):
    unit: StreakUnit
    current: int
    best: int
    best_days: int
    best_weeks: int
    rest_day_available: bool | None
    rest_used_on: date | None


class Week(_Shape):
    done: int
    target: int


class Habit(_Shape):
    id: int
    name: str
    slot: int | None
    building_style: str
    cadence: Cadence
    created_on: date
    archived_on: date | None
    xp: int
    level: int
    stage: int
    level_xp_start: int
    next_level_xp: int | None
    streak: Streak
    week: Week | None
    checked_today: bool
    checked_yesterday: bool
    can_check_yesterday: bool
    last7: list[Last7Value]


class Building(_Shape):
    xp: int
    level: int
    stage: int
    level_xp_start: int
    next_level_xp: int | None
    today_xp: int
    today_cap: int
    source: BuildingSource


class TownSummary(_Shape):
    name: str
    founded_on: date | None
    today: date
    tz: str
    xp: int
    level: int
    level_xp_start: int
    next_level_xp: int | None


class HubTownSummary(_Shape):
    """The Hub card's slice of the town payload (TF5 §10)."""

    name: str
    founded_on: date | None
    level: int
    xp: int
    level_xp_start: int
    next_level_xp: int | None
    today_done: int
    today_total: int
    longest_streak: int
    longest_streak_unit: StreakUnit | None


class Lot(_Shape):
    slot: int
    unlock_level: int
    state: LotState
    habit_id: int | None


class ArchivedHabit(_Shape):
    id: int
    name: str
    xp: int
    level: int
    best_days: int
    best_weeks: int
    created_on: date
    archived_on: date


class Today(_Shape):
    done: int
    total: int


class Buildings(_Shape):
    library: Building
    inn: Building


class Town(_Shape):
    town: TownSummary
    buildings: Buildings
    lots: list[Lot]
    habits: list[Habit]
    archived: list[ArchivedHabit]
    today: Today
    constants_version: int


class HabitList(_Shape):
    items: list[Habit]


class CheckinDays(_Shape):
    days: list[date]


# --- write models (TB2C) ---


class _Write(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)


class HabitCreate(_Write):
    name: str
    slot: int
    per_week: int
    building_style: str | None = None


class HabitPatch(_Write):
    name: str | None = None
    building_style: str | None = None
    per_week: int | None = None
    archived: bool | None = None


class CheckinCreate(_Write):
    day: date

    @field_validator("day", mode="before")
    @classmethod
    def _day(cls, value: object) -> date:
        # A lax date would accept a datetime string. Require a calendar day.
        if type(value) is not str or len(value) != 10:
            raise ValueError("day")
        try:
            return date.fromisoformat(value)
        except ValueError:
            raise ValueError("day") from None


class TownProgress(_Shape):
    xp: int
    level: int
    level_xp_start: int
    next_level_xp: int | None


class CheckinResult(_Shape):
    day: date
    checked: bool
    habit: Habit
    town: TownProgress


KeepsakeSource = Literal["ok", "absent", "unavailable"]
KeepsakeMark = Literal["planned", "souvenir", "ineligible"]
FinishedKind = Literal["movie", "tv", "book", "game"]
KeepsakeDateSource = Literal["completed_on", "finished_on"]


class KeepsakeCoverage(_Shape):
    status: KeepsakeSource
    included: int
    total: int
    truncated: bool


class KeepsakeTravel(_Shape):
    status: KeepsakeSource
    souvenirs: KeepsakeCoverage
    planned: KeepsakeCoverage
    ineligible: KeepsakeCoverage


class KeepsakePlace(_Shape):
    label: str
    lat_e2: int | None


class MediaKeepsake(_Shape):
    id: str
    entry_id: int
    kind: FinishedKind
    title: str
    on: date
    route: str
    note: str
    date_source: KeepsakeDateSource


class TripKeepsake(_Shape):
    id: str
    trip_id: int
    title: str
    status: str
    mark: KeepsakeMark
    span_start: date
    span_end: date
    credit_date: date | None
    credit_eligible: bool
    destinations: list[str]
    place: KeepsakePlace | None
    scenery: str
    route: str
    note: str


class KeepsakeDifference(_Shape):
    id: str
    text: str


class Keepsakes(_Shape):
    on: date | None
    cap: int
    media: KeepsakeCoverage
    travel: KeepsakeTravel
    keepsakes: list[MediaKeepsake]
    souvenirs: list[TripKeepsake]
    planned: list[TripKeepsake]
    ineligible: list[TripKeepsake]
    differences: list[KeepsakeDifference]


StampConsumerId = Literal["market", "quest", "minigame"]
StampKind = Literal["grant", "spend", "refund"]


class StampConsumer(_Shape):
    id: StampConsumerId
    name: str
    detail: str


class StampReceiptView(_Shape):
    id: int
    grant_key: str
    consumer: StampConsumerId
    kind: StampKind
    amount: int
    catalog_id: str | None
    created_at: str


class StampEntitlementView(_Shape):
    catalog_id: str
    active: bool
    amount: int
    spend_receipt_id: int


class StampWalletView(_Shape):
    balance: int
    consumers: list[StampConsumer]
    receipts: list[StampReceiptView]
    entitlements: list[StampEntitlementView]


class RoomLayoutItem(_Shape):
    instance_id: str
    catalog_id: str
    anchor: str
    column: int | None
    row: int | None
    slot: str | None
    orientation: Literal[0, 1, 2, 3]
    palette: Literal[0, 1, 2, 3]


class RoomLayoutView(_Shape):
    room_id: str
    revision: int
    items: list[RoomLayoutItem]
    recovery_required: Literal[True] | None = None


class QuestStepView(_Shape):
    id: str
    label: str
    action_id: str
    source: Literal["library", "travel", "memory"] | None
    sample_action_id: str | None
    sample_label: str | None
    sample_detail: str | None
    recorded_action: str | None


class QuestView(_Shape):
    id: str
    title: str
    detail: str
    completed: int
    total: int
    steps: list[QuestStepView]


class QuestJournalView(_Shape):
    revision: int
    quests: list[QuestView]
