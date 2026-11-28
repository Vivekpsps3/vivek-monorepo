"""Town habits, check-ins, cadence rows, cosmetic room layouts, quests, dialogue, discoveries, and play receipts.

TownBase is its own registry, separate from Finance, Travel, and Media.
Owner foreign keys to users.id are attached by apps.server.schema.OWNER_TABLES.
Check-ins and cadences reference habits (id, user_id) and restrict parent deletion.
"""

from datetime import date, datetime

from sqlalchemy import (
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    ForeignKeyConstraint,
    Index,
    Integer,
    SmallInteger,
    String,
    Text,
    UniqueConstraint,
    text,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column

# Same function as engine.name_key. A folded key longer than 40 characters
# raises APIError 422 name_too_long with field_errors.name set; it is not truncated.
from apps.server.town.discovery_catalog import discovery_check_sql
from apps.server.town.engine import name_key as make_name_key
from apps.server.town.quest_catalog import triple_check_sql
from apps.server.town.resident_catalog import conversation_check_sql, resident_check_sql

__all__ = [
    "DialogueCompletion",
    "DialogueJournal",
    "DiscoveryJournal",
    "DiscoveryStamp",
    "Habit",
    "HabitCadence",
    "HabitCheckin",
    "PlayReceipt",
    "QuestJournal",
    "QuestStep",
    "RoomLayout",
    "StampEntitlement",
    "StampReceipt",
    "StampWallet",
    "TownBase",
    "make_name_key",
]


class TownBase(DeclarativeBase):
    pass


class Habit(TownBase):
    __tablename__ = "habits"
    __table_args__ = (
        # (id, user_id) is the parent key for child ownership foreign keys.
        # id alone is already the primary key; SQLite still requires this
        # exact column list to be a UNIQUE constraint.
        UniqueConstraint("id", "user_id", name="uq_habits_id_user"),
        CheckConstraint(
            "building_style IN ('forge', 'garden', 'cottage')",
            name="ck_habits_building_style",
        ),
        CheckConstraint("per_week BETWEEN 1 AND 7", name="ck_habits_per_week"),
        CheckConstraint("slot BETWEEN 0 AND 5", name="ck_habits_slot"),
        CheckConstraint("length(name) BETWEEN 1 AND 40", name="ck_habits_name"),
        CheckConstraint("length(name_key) BETWEEN 1 AND 40", name="ck_habits_name_key"),
        Index("ix_habits_user_active", "user_id", "archived_at"),
        Index(
            "uq_habits_active_slot",
            "user_id",
            "slot",
            unique=True,
            sqlite_where=text("archived_at IS NULL"),
        ),
        Index(
            "uq_habits_active_name",
            "user_id",
            "name_key",
            unique=True,
            sqlite_where=text("archived_at IS NULL"),
        ),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(Integer, nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(40), nullable=False)
    slot: Mapped[int] = mapped_column(SmallInteger, nullable=False)
    building_style: Mapped[str] = mapped_column(String(16), nullable=False)
    per_week: Mapped[int] = mapped_column(SmallInteger, nullable=False)
    created_on: Mapped[date] = mapped_column(Date, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    archived_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    archived_on: Mapped[date | None] = mapped_column(Date, nullable=True)
    # make_name_key(name). Uniqueness is the partial index, among active rows only.
    # A casefold longer than 40 characters is rejected, not truncated.
    name_key: Mapped[str] = mapped_column(String(40), nullable=False)


class HabitCheckin(TownBase):
    __tablename__ = "habit_checkins"
    __table_args__ = (
        UniqueConstraint("habit_id", "day", name="uq_checkin_habit_day"),
        Index("ix_habit_checkins_user_day", "user_id", "day"),
        ForeignKeyConstraint(
            ["habit_id", "user_id"],
            ["habits.id", "habits.user_id"],
            ondelete="RESTRICT",
            name="fk_habit_checkins_owner",
        ),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    habit_id: Mapped[int] = mapped_column(Integer, nullable=False, index=True)
    user_id: Mapped[int] = mapped_column(Integer, nullable=False, index=True)
    day: Mapped[date] = mapped_column(Date, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)


class HabitCadence(TownBase):
    __tablename__ = "habit_cadences"
    __table_args__ = (
        UniqueConstraint("habit_id", "effective_from", name="uq_cadence_habit_from"),
        CheckConstraint("per_week BETWEEN 1 AND 7", name="ck_habit_cadences_per_week"),
        Index("ix_habit_cadences_user_id", "user_id"),
        ForeignKeyConstraint(
            ["habit_id", "user_id"],
            ["habits.id", "habits.user_id"],
            ondelete="RESTRICT",
            name="fk_habit_cadences_owner",
        ),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    habit_id: Mapped[int] = mapped_column(Integer, nullable=False, index=True)
    user_id: Mapped[int] = mapped_column(Integer, nullable=False)
    per_week: Mapped[int] = mapped_column(SmallInteger, nullable=False)
    effective_from: Mapped[date] = mapped_column(Date, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)


class StampWallet(TownBase):
    """One game-only balance per owner. Absence of a row means zero."""

    __tablename__ = "town_stamp_wallets"
    __table_args__ = (CheckConstraint("balance >= 0", name="ck_town_stamp_wallets_balance"),)

    user_id: Mapped[int] = mapped_column(Integer, primary_key=True)
    balance: Mapped[int] = mapped_column(Integer, nullable=False)


class StampReceipt(TownBase):
    """One owner and one grant identity. A retry returns this row."""

    __tablename__ = "town_stamp_receipts"
    __table_args__ = (
        Index("uq_town_stamp_receipt_grant", "user_id", "grant_key", unique=True),
        CheckConstraint(
            "consumer IN ('market', 'quest', 'minigame')",
            name="ck_town_stamp_receipts_consumer",
        ),
        CheckConstraint(
            "kind IN ('grant', 'spend', 'refund')",
            name="ck_town_stamp_receipts_kind",
        ),
        CheckConstraint("amount BETWEEN 1 AND 20", name="ck_town_stamp_receipts_amount"),
        CheckConstraint(
            "length(grant_key) BETWEEN 1 AND 80",
            name="ck_town_stamp_receipts_grant_key",
        ),
        CheckConstraint(
            "catalog_id IS NULL OR length(catalog_id) BETWEEN 1 AND 64",
            name="ck_town_stamp_receipts_catalog",
        ),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(Integer, nullable=False, index=True)
    grant_key: Mapped[str] = mapped_column(String(80), nullable=False)
    consumer: Mapped[str] = mapped_column(String(16), nullable=False)
    kind: Mapped[str] = mapped_column(String(8), nullable=False)
    amount: Mapped[int] = mapped_column(Integer, nullable=False)
    catalog_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)


class StampEntitlement(TownBase):
    """One unlock per owner and catalog id. Refund clears it without a second copy."""

    __tablename__ = "town_stamp_entitlements"
    __table_args__ = (
        Index("uq_town_stamp_entitlement_item", "user_id", "catalog_id", unique=True),
        CheckConstraint(
            "length(catalog_id) BETWEEN 1 AND 64",
            name="ck_town_stamp_entitlements_catalog",
        ),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(Integer, nullable=False, index=True)
    catalog_id: Mapped[str] = mapped_column(String(64), nullable=False)
    spend_receipt_id: Mapped[int] = mapped_column(
        ForeignKey("town_stamp_receipts.id", name="fk_town_stamp_entitlements_spend"),
        nullable=False,
    )
    refund_receipt_id: Mapped[int | None] = mapped_column(
        ForeignKey("town_stamp_receipts.id", name="fk_town_stamp_entitlements_refund"),
        nullable=True,
    )


class RoomLayout(TownBase):
    """One cosmetic layout per owner and room. Revision 0 means no row yet."""

    __tablename__ = "town_room_layouts"
    __table_args__ = (
        Index("uq_town_room_layout_owner", "user_id", "room_id", unique=True),
        CheckConstraint(
            "room_id IN ('living', 'study', 'bedroom', 'courtyard', 'exterior')",
            name="ck_town_room_layouts_room",
        ),
        CheckConstraint("revision >= 1", name="ck_town_room_layouts_revision"),
        CheckConstraint(
            "length(payload) BETWEEN 2 AND 16384",
            name="ck_town_room_layouts_payload",
        ),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(Integer, nullable=False)
    room_id: Mapped[str] = mapped_column(String(16), nullable=False)
    revision: Mapped[int] = mapped_column(Integer, nullable=False)
    payload: Mapped[str] = mapped_column(Text, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)


class QuestJournal(TownBase):
    """One revision for every optional chapter. Absence of a row means revision 0."""

    __tablename__ = "town_quest_journals"
    __table_args__ = (CheckConstraint("revision >= 1", name="ck_town_quest_journals_revision"),)

    user_id: Mapped[int] = mapped_column(Integer, primary_key=True)
    revision: Mapped[int] = mapped_column(Integer, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)


class QuestStep(TownBase):
    """One recorded game action per owner, quest, and step."""

    __tablename__ = "town_quest_steps"
    __table_args__ = (
        Index("ix_town_quest_steps_user_id", "user_id"),
        Index("uq_town_quest_step", "user_id", "quest_id", "step_id", unique=True),
        CheckConstraint("length(quest_id) BETWEEN 1 AND 40", name="ck_town_quest_steps_quest"),
        CheckConstraint("length(step_id) BETWEEN 1 AND 40", name="ck_town_quest_steps_step"),
        CheckConstraint("length(action_id) BETWEEN 1 AND 80", name="ck_town_quest_steps_action"),
        CheckConstraint(triple_check_sql(), name="ck_town_quest_steps_triple"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(Integer, nullable=False)
    quest_id: Mapped[str] = mapped_column(String(40), nullable=False)
    step_id: Mapped[str] = mapped_column(String(40), nullable=False)
    action_id: Mapped[str] = mapped_column(String(80), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)


class DialogueJournal(TownBase):
    """One revision for every resident conversation. Absence of a row means revision 0."""

    __tablename__ = "town_dialogue_journals"
    __table_args__ = (CheckConstraint("revision >= 1", name="ck_town_dialogue_journals_revision"),)

    user_id: Mapped[int] = mapped_column(Integer, primary_key=True)
    revision: Mapped[int] = mapped_column(Integer, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)


class DialogueCompletion(TownBase):
    """One finished conversation identity per owner and resident. Rank is the count."""

    __tablename__ = "town_dialogue_completions"
    __table_args__ = (
        Index("ix_town_dialogue_completions_user_id", "user_id"),
        Index(
            "uq_town_dialogue_completion",
            "user_id",
            "resident_id",
            "conversation_id",
            unique=True,
        ),
        CheckConstraint(resident_check_sql(), name="ck_town_dialogue_completions_resident"),
        CheckConstraint(conversation_check_sql(), name="ck_town_dialogue_completions_conversation"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(Integer, nullable=False)
    resident_id: Mapped[str] = mapped_column(String(40), nullable=False)
    conversation_id: Mapped[str] = mapped_column(String(40), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)


class DiscoveryJournal(TownBase):
    """One revision for every discovery. Absence of a row means revision 0."""

    __tablename__ = "town_discovery_journals"
    __table_args__ = (CheckConstraint("revision >= 1", name="ck_town_discovery_journals_revision"),)

    user_id: Mapped[int] = mapped_column(Integer, primary_key=True)
    revision: Mapped[int] = mapped_column(Integer, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)


class DiscoveryStamp(TownBase):
    """One journal stamp per owner and hotspot. Not cosmetic currency."""

    __tablename__ = "town_discovery_stamps"
    __table_args__ = (
        Index("ix_town_discovery_stamps_user_id", "user_id"),
        Index("uq_town_discovery_stamp", "user_id", "discovery_id", unique=True),
        CheckConstraint(
            "length(discovery_id) BETWEEN 1 AND 40",
            name="ck_town_discovery_stamps_id",
        ),
        CheckConstraint(discovery_check_sql(), name="ck_town_discovery_stamps_known"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(Integer, nullable=False)
    discovery_id: Mapped[str] = mapped_column(String(40), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)


_PLAY_SEED = (
    "(game_id = 'memory-shelves' AND seed = 10 AND mode IS NULL) OR "
    "(game_id = 'harbor-rhythm' AND seed = 1 AND mode IN ('timed', 'untimed'))"
)
_PLAY_DONE = (
    "(status = 'open' AND score IS NULL AND reward_amount = 0 AND completed_at IS NULL) OR "
    "(status = 'complete' AND score IS NOT NULL AND completed_at IS NOT NULL "
    "AND reward_amount IN (0, 5))"
)


class PlayReceipt(TownBase):
    """One owner-scoped run. The Town civil day is fixed when the run opens."""

    __tablename__ = "town_play_receipts"
    __table_args__ = (
        Index("ix_town_play_receipts_user_id", "user_id"),
        Index("uq_town_play_receipt_nonce", "nonce", unique=True),
        CheckConstraint(
            "game_id IN ('memory-shelves', 'harbor-rhythm')",
            name="ck_town_play_receipts_game",
        ),
        CheckConstraint(_PLAY_SEED, name="ck_town_play_receipts_seed"),
        CheckConstraint("status IN ('open', 'complete')", name="ck_town_play_receipts_status"),
        CheckConstraint(_PLAY_DONE, name="ck_town_play_receipts_complete"),
        CheckConstraint("length(nonce) BETWEEN 16 AND 64", name="ck_town_play_receipts_nonce"),
        CheckConstraint("length(zone) BETWEEN 1 AND 64", name="ck_town_play_receipts_zone"),
        CheckConstraint(
            "score IS NULL OR score BETWEEN 0 AND 1000",
            name="ck_town_play_receipts_score",
        ),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(Integer, nullable=False)
    nonce: Mapped[str] = mapped_column(String(64), nullable=False)
    game_id: Mapped[str] = mapped_column(String(32), nullable=False)
    seed: Mapped[int] = mapped_column(Integer, nullable=False)
    mode: Mapped[str | None] = mapped_column(String(16), nullable=True)
    civil_day: Mapped[date] = mapped_column(Date, nullable=False)
    zone: Mapped[str] = mapped_column(String(64), nullable=False)
    status: Mapped[str] = mapped_column(String(16), nullable=False)
    score: Mapped[int | None] = mapped_column(Integer, nullable=True)
    reward_amount: Mapped[int] = mapped_column(Integer, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
