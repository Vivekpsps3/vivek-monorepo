"""Travel ledger.

A trip is the span from the day you leave through the day you come back.
Flights, drives, city stays, daily plans, parking, and trip costs belong to
that trip. PTO is a separate projection and never writes finance data.
"""

from datetime import UTC, date, datetime

from sqlalchemy import (
    Boolean,
    Date,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


class Base(DeclarativeBase):
    pass


def utc_now() -> datetime:
    return datetime.now(UTC)


class Trip(Base):
    __tablename__ = "trips"
    __table_args__ = (Index("uq_trip_create_attempt", "user_id", "client_request_id", unique=True),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    # Finance user id. Travel does not write finance rows; it only keeps this id.
    user_id: Mapped[int] = mapped_column(Integer, nullable=False, index=True)
    client_request_id: Mapped[str | None] = mapped_column(String(100), nullable=True)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    start_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    end_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="planning")
    origin_label: Mapped[str | None] = mapped_column(String(200), nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    counts_as_pto: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    # Null means "count weekdays in the trip". A value is an explicit override.
    pto_days: Mapped[str | None] = mapped_column(String(32), nullable=True)
    # dates: trip_pto_days is the allocation. legacy: pto_days is an unallocated
    # total and must not be spread across guessed dates. Null until backfill.
    pto_mode: Mapped[str | None] = mapped_column(String(20), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utc_now
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utc_now
    )

    stays: Mapped[list["Stay"]] = relationship(
        "Stay", cascade="all, delete-orphan", order_by="Stay.sort_order"
    )
    transports: Mapped[list["Transport"]] = relationship(
        "Transport", cascade="all, delete-orphan", order_by="Transport.sort_order"
    )
    plans: Mapped[list["PlanItem"]] = relationship("PlanItem", cascade="all, delete-orphan")
    parking: Mapped[list["Parking"]] = relationship("Parking", cascade="all, delete-orphan")
    reminders: Mapped[list["Reminder"]] = relationship("Reminder", cascade="all, delete-orphan")
    note_entries: Mapped[list["Note"]] = relationship(
        "Note", cascade="all, delete-orphan", order_by="Note.created_at"
    )
    budget_lines: Mapped[list["BudgetLine"]] = relationship(
        "BudgetLine", cascade="all, delete-orphan"
    )
    pto_entry: Mapped["PtoEntry | None"] = relationship(
        "PtoEntry", cascade="all, delete-orphan", uselist=False
    )
    pto_day_rows: Mapped[list["TripPtoDay"]] = relationship(
        "TripPtoDay",
        cascade="all, delete-orphan",
        order_by="TripPtoDay.on_date",
    )


class Stay(Base):
    __tablename__ = "stays"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    trip_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("trips.id", ondelete="CASCADE"), nullable=False, index=True
    )
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    city: Mapped[str] = mapped_column(String(200), nullable=False)
    region: Mapped[str | None] = mapped_column(String(200), nullable=True)
    country: Mapped[str | None] = mapped_column(String(200), nullable=True)
    arrive_on: Mapped[date] = mapped_column(Date, nullable=False)
    leave_on: Mapped[date] = mapped_column(Date, nullable=False)
    lodging_name: Mapped[str | None] = mapped_column(String(200), nullable=True)
    lodging_address: Mapped[str | None] = mapped_column(String(500), nullable=True)
    lat: Mapped[float | None] = mapped_column(Float, nullable=True)
    lng: Mapped[float | None] = mapped_column(Float, nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)


class Transport(Base):
    __tablename__ = "transports"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    trip_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("trips.id", ondelete="CASCADE"), nullable=False, index=True
    )
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    role: Mapped[str] = mapped_column(
        String(20), nullable=False
    )  # outbound, inbound, connection, local
    mode: Mapped[str] = mapped_column(
        String(20), nullable=False
    )  # flight, drive, train, bus, ferry, other
    carrier: Mapped[str | None] = mapped_column(String(120), nullable=True)
    number: Mapped[str | None] = mapped_column(String(40), nullable=True)
    depart_place: Mapped[str | None] = mapped_column(String(200), nullable=True)
    arrive_place: Mapped[str | None] = mapped_column(String(200), nullable=True)
    # Wall-clock times the user saved (airport local after a FlightAware fill).
    depart_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    arrive_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    depart_tz: Mapped[str | None] = mapped_column(String(80), nullable=True)
    arrive_tz: Mapped[str | None] = mapped_column(String(80), nullable=True)
    confirmation: Mapped[str | None] = mapped_column(String(80), nullable=True)
    seat: Mapped[str | None] = mapped_column(String(40), nullable=True)
    cost_cents: Mapped[int | None] = mapped_column(Integer, nullable=True)
    currency: Mapped[str] = mapped_column(String(3), nullable=False, default="USD")
    paid: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="planned")
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    fa_ident: Mapped[str | None] = mapped_column(String(20), nullable=True)
    fa_status: Mapped[str | None] = mapped_column(String(80), nullable=True)
    fa_aircraft: Mapped[str | None] = mapped_column(String(40), nullable=True)
    fa_gate_origin: Mapped[str | None] = mapped_column(String(20), nullable=True)
    fa_gate_destination: Mapped[str | None] = mapped_column(String(20), nullable=True)
    fa_terminal_origin: Mapped[str | None] = mapped_column(String(20), nullable=True)
    fa_terminal_destination: Mapped[str | None] = mapped_column(String(20), nullable=True)
    fa_baggage_claim: Mapped[str | None] = mapped_column(String(20), nullable=True)
    fa_delay_departure_seconds: Mapped[int | None] = mapped_column(Integer, nullable=True)
    fa_delay_arrival_seconds: Mapped[int | None] = mapped_column(Integer, nullable=True)
    fa_scheduled_out: Mapped[str | None] = mapped_column(String(40), nullable=True)
    fa_estimated_out: Mapped[str | None] = mapped_column(String(40), nullable=True)
    fa_actual_out: Mapped[str | None] = mapped_column(String(40), nullable=True)
    fa_scheduled_in: Mapped[str | None] = mapped_column(String(40), nullable=True)
    fa_estimated_in: Mapped[str | None] = mapped_column(String(40), nullable=True)
    fa_actual_in: Mapped[str | None] = mapped_column(String(40), nullable=True)
    fa_fetched_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class PlanItem(Base):
    __tablename__ = "plan_items"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    trip_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("trips.id", ondelete="CASCADE"), nullable=False, index=True
    )
    stay_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("stays.id", ondelete="SET NULL"), nullable=True
    )
    on_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    start_time: Mapped[str | None] = mapped_column(String(5), nullable=True)
    end_time: Mapped[str | None] = mapped_column(String(5), nullable=True)
    kind: Mapped[str] = mapped_column(String(20), nullable=False, default="activity")
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    place_name: Mapped[str | None] = mapped_column(String(200), nullable=True)
    address: Mapped[str | None] = mapped_column(String(500), nullable=True)
    lat: Mapped[float | None] = mapped_column(Float, nullable=True)
    lng: Mapped[float | None] = mapped_column(Float, nullable=True)
    url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    cost_cents: Mapped[int | None] = mapped_column(Integer, nullable=True)
    currency: Mapped[str] = mapped_column(String(3), nullable=False, default="USD")
    paid: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)


class Parking(Base):
    __tablename__ = "parking"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    trip_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("trips.id", ondelete="CASCADE"), nullable=False, index=True
    )
    transport_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("transports.id", ondelete="SET NULL"), nullable=True
    )
    necessary: Mapped[str] = mapped_column(
        String(10), nullable=False, default="unknown"
    )  # yes, no, unknown
    booked: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    # self_park, valet, offsite, dropoff, pickup, rideshare, none
    arrangement: Mapped[str] = mapped_column(String(20), nullable=False, default="self_park")
    place_name: Mapped[str | None] = mapped_column(String(200), nullable=True)
    address: Mapped[str | None] = mapped_column(String(500), nullable=True)
    lat: Mapped[float | None] = mapped_column(Float, nullable=True)
    lng: Mapped[float | None] = mapped_column(Float, nullable=True)
    confirmation: Mapped[str | None] = mapped_column(String(80), nullable=True)
    start_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    end_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    cost_cents: Mapped[int | None] = mapped_column(Integer, nullable=True)
    currency: Mapped[str] = mapped_column(String(3), nullable=False, default="USD")
    paid: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)


class Reminder(Base):
    __tablename__ = "reminders"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    trip_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("trips.id", ondelete="CASCADE"), nullable=False, index=True
    )
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    due_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    done: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    kind: Mapped[str] = mapped_column(String(20), nullable=False, default="general")
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)


class Note(Base):
    __tablename__ = "notes"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    trip_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("trips.id", ondelete="CASCADE"), nullable=False, index=True
    )
    on_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    body: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utc_now
    )


class BudgetLine(Base):
    """Extra trip costs that are not already stored on a flight, plan, or parking row."""

    __tablename__ = "budget_lines"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    trip_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("trips.id", ondelete="CASCADE"), nullable=False, index=True
    )
    category: Mapped[str] = mapped_column(String(40), nullable=False)
    label: Mapped[str] = mapped_column(String(200), nullable=False)
    amount_cents: Mapped[int] = mapped_column(Integer, nullable=False)
    currency: Mapped[str] = mapped_column(String(3), nullable=False, default="USD")
    paid: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)


class PtoPolicy(Base):
    __tablename__ = "pto_policy"
    __table_args__ = (UniqueConstraint("user_id", name="uq_pto_policy_user_id"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(Integer, nullable=False, index=True)
    configured: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    accrual_amount: Mapped[str] = mapped_column(String(32), nullable=False, default="0")
    accrual_unit: Mapped[str] = mapped_column(
        String(10), nullable=False, default="day"
    )  # day, hour
    # weekly, biweekly, semimonthly, monthly, yearly
    accrual_cadence: Mapped[str] = mapped_column(String(20), nullable=False, default="yearly")
    hours_per_day: Mapped[str] = mapped_column(String(32), nullable=False, default="8")
    # Balance at the end of balance_as_of, before PTO that starts after that date.
    balance_days: Mapped[str] = mapped_column(String(32), nullable=False, default="0")
    balance_as_of: Mapped[date] = mapped_column(Date, nullable=False)
    annual_cap_days: Mapped[str | None] = mapped_column(String(32), nullable=True)


class TripPtoDay(Base):
    """One PTO amount for one trip date. The trip owns the row."""

    __tablename__ = "trip_pto_days"
    __table_args__ = (UniqueConstraint("trip_id", "on_date", name="uq_trip_pto_day"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    trip_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("trips.id", ondelete="CASCADE"), nullable=False, index=True
    )
    on_date: Mapped[date] = mapped_column(Date, nullable=False)
    amount: Mapped[str] = mapped_column(String(32), nullable=False)
    # default follows the weekday policy. override is an explicit choice.
    provenance: Mapped[str] = mapped_column(String(20), nullable=False)
    # Set only when the allocation migration inserted the row.
    migration_source: Mapped[str | None] = mapped_column(String(40), nullable=True)


class PtoEntry(Base):
    __tablename__ = "pto_entries"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(Integer, nullable=False, index=True)
    trip_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("trips.id", ondelete="CASCADE"), nullable=True, unique=True
    )
    start_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    end_date: Mapped[date] = mapped_column(Date, nullable=False)
    days: Mapped[str] = mapped_column(String(32), nullable=False)
    label: Mapped[str] = mapped_column(String(200), nullable=False)
    kind: Mapped[str] = mapped_column(String(20), nullable=False, default="manual")  # trip, manual
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)


class Setting(Base):
    __tablename__ = "settings"

    key: Mapped[str] = mapped_column(String(80), primary_key=True)
    value: Mapped[str] = mapped_column(Text, nullable=False)


class PlaceCache(Base):
    __tablename__ = "place_cache"

    query: Mapped[str] = mapped_column(String(500), primary_key=True)
    payload: Mapped[str] = mapped_column(Text, nullable=False)
    fetched_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utc_now
    )
