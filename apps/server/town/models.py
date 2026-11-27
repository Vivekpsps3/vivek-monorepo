"""Town habits, check-ins, cadence rows, cosmetic room layouts, and quest steps.

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
from apps.server.town.engine import name_key as make_name_key
from apps.server.town.quest_catalog import triple_check_sql

__all__ = [
    "Habit",
    "HabitCadence",
    "HabitCheckin",
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
