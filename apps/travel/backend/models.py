"""Travel ledger.

A trip is the span from the day you leave through the day you come back.
Flights, drives, city stays, daily plans, parking, and trip costs belong to
that trip. PTO is a separate projection and never writes finance data.
"""

from datetime import UTC, datetime

from sqlalchemy import Boolean, Column, Date, DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import declarative_base, relationship

Base = declarative_base()


def utc_now() -> datetime:
    return datetime.now(UTC)


class Trip(Base):
    __tablename__ = "trips"

    id = Column(Integer, primary_key=True)
    title = Column(String(200), nullable=False)
    start_date = Column(Date, nullable=False, index=True)
    end_date = Column(Date, nullable=False, index=True)
    status = Column(String(20), nullable=False, default="planning")
    origin_label = Column(String(200), nullable=True)
    notes = Column(Text, nullable=True)
    counts_as_pto = Column(Boolean, nullable=False, default=True)
    # Null means "count weekdays in the trip". A value is an explicit override.
    pto_days = Column(String(32), nullable=True)
    created_at = Column(DateTime(timezone=True), nullable=False, default=utc_now)
    updated_at = Column(DateTime(timezone=True), nullable=False, default=utc_now)

    stays = relationship("Stay", cascade="all, delete-orphan", order_by="Stay.sort_order")
    transports = relationship("Transport", cascade="all, delete-orphan", order_by="Transport.sort_order")
    plans = relationship("PlanItem", cascade="all, delete-orphan")
    parking = relationship("Parking", cascade="all, delete-orphan")
    reminders = relationship("Reminder", cascade="all, delete-orphan")
    note_entries = relationship("Note", cascade="all, delete-orphan", order_by="Note.created_at")
    budget_lines = relationship("BudgetLine", cascade="all, delete-orphan")
    pto_entry = relationship("PtoEntry", cascade="all, delete-orphan", uselist=False)


class Stay(Base):
    __tablename__ = "stays"

    id = Column(Integer, primary_key=True)
    trip_id = Column(Integer, ForeignKey("trips.id", ondelete="CASCADE"), nullable=False, index=True)
    sort_order = Column(Integer, nullable=False, default=0)
    city = Column(String(200), nullable=False)
    region = Column(String(200), nullable=True)
    country = Column(String(200), nullable=True)
    arrive_on = Column(Date, nullable=False)
    leave_on = Column(Date, nullable=False)
    lodging_name = Column(String(200), nullable=True)
    lodging_address = Column(String(500), nullable=True)
    lat = Column(Float, nullable=True)
    lng = Column(Float, nullable=True)
    notes = Column(Text, nullable=True)


class Transport(Base):
    __tablename__ = "transports"

    id = Column(Integer, primary_key=True)
    trip_id = Column(Integer, ForeignKey("trips.id", ondelete="CASCADE"), nullable=False, index=True)
    sort_order = Column(Integer, nullable=False, default=0)
    role = Column(String(20), nullable=False)  # outbound, inbound, connection, local
    mode = Column(String(20), nullable=False)  # flight, drive, train, bus, ferry, other
    carrier = Column(String(120), nullable=True)
    number = Column(String(40), nullable=True)
    depart_place = Column(String(200), nullable=True)
    arrive_place = Column(String(200), nullable=True)
    # Wall-clock times the user saved (airport local after a FlightAware fill).
    depart_at = Column(DateTime, nullable=True)
    arrive_at = Column(DateTime, nullable=True)
    depart_tz = Column(String(80), nullable=True)
    arrive_tz = Column(String(80), nullable=True)
    confirmation = Column(String(80), nullable=True)
    seat = Column(String(40), nullable=True)
    cost_cents = Column(Integer, nullable=True)
    currency = Column(String(3), nullable=False, default="USD")
    paid = Column(Boolean, nullable=False, default=False)
    status = Column(String(20), nullable=False, default="planned")
    notes = Column(Text, nullable=True)
    fa_ident = Column(String(20), nullable=True)
    fa_status = Column(String(80), nullable=True)
    fa_aircraft = Column(String(40), nullable=True)
    fa_gate_origin = Column(String(20), nullable=True)
    fa_gate_destination = Column(String(20), nullable=True)
    fa_terminal_origin = Column(String(20), nullable=True)
    fa_terminal_destination = Column(String(20), nullable=True)
    fa_baggage_claim = Column(String(20), nullable=True)
    fa_delay_departure_seconds = Column(Integer, nullable=True)
    fa_delay_arrival_seconds = Column(Integer, nullable=True)
    fa_scheduled_out = Column(String(40), nullable=True)
    fa_estimated_out = Column(String(40), nullable=True)
    fa_actual_out = Column(String(40), nullable=True)
    fa_scheduled_in = Column(String(40), nullable=True)
    fa_estimated_in = Column(String(40), nullable=True)
    fa_actual_in = Column(String(40), nullable=True)
    fa_fetched_at = Column(DateTime(timezone=True), nullable=True)


class PlanItem(Base):
    __tablename__ = "plan_items"

    id = Column(Integer, primary_key=True)
    trip_id = Column(Integer, ForeignKey("trips.id", ondelete="CASCADE"), nullable=False, index=True)
    stay_id = Column(Integer, ForeignKey("stays.id", ondelete="SET NULL"), nullable=True)
    on_date = Column(Date, nullable=False, index=True)
    start_time = Column(String(5), nullable=True)
    end_time = Column(String(5), nullable=True)
    kind = Column(String(20), nullable=False, default="activity")
    title = Column(String(200), nullable=False)
    place_name = Column(String(200), nullable=True)
    address = Column(String(500), nullable=True)
    lat = Column(Float, nullable=True)
    lng = Column(Float, nullable=True)
    url = Column(String(500), nullable=True)
    cost_cents = Column(Integer, nullable=True)
    currency = Column(String(3), nullable=False, default="USD")
    paid = Column(Boolean, nullable=False, default=False)
    notes = Column(Text, nullable=True)
    sort_order = Column(Integer, nullable=False, default=0)


class Parking(Base):
    __tablename__ = "parking"

    id = Column(Integer, primary_key=True)
    trip_id = Column(Integer, ForeignKey("trips.id", ondelete="CASCADE"), nullable=False, index=True)
    transport_id = Column(Integer, ForeignKey("transports.id", ondelete="SET NULL"), nullable=True)
    necessary = Column(String(10), nullable=False, default="unknown")  # yes, no, unknown
    booked = Column(Boolean, nullable=False, default=False)
    # self_park, valet, offsite, dropoff, pickup, rideshare, none
    arrangement = Column(String(20), nullable=False, default="self_park")
    place_name = Column(String(200), nullable=True)
    address = Column(String(500), nullable=True)
    lat = Column(Float, nullable=True)
    lng = Column(Float, nullable=True)
    confirmation = Column(String(80), nullable=True)
    start_at = Column(DateTime, nullable=True)
    end_at = Column(DateTime, nullable=True)
    cost_cents = Column(Integer, nullable=True)
    currency = Column(String(3), nullable=False, default="USD")
    paid = Column(Boolean, nullable=False, default=False)
    notes = Column(Text, nullable=True)


class Reminder(Base):
    __tablename__ = "reminders"

    id = Column(Integer, primary_key=True)
    trip_id = Column(Integer, ForeignKey("trips.id", ondelete="CASCADE"), nullable=False, index=True)
    title = Column(String(200), nullable=False)
    due_at = Column(DateTime, nullable=True)
    done = Column(Boolean, nullable=False, default=False)
    kind = Column(String(20), nullable=False, default="general")
    notes = Column(Text, nullable=True)


class Note(Base):
    __tablename__ = "notes"

    id = Column(Integer, primary_key=True)
    trip_id = Column(Integer, ForeignKey("trips.id", ondelete="CASCADE"), nullable=False, index=True)
    on_date = Column(Date, nullable=True)
    body = Column(Text, nullable=False)
    created_at = Column(DateTime(timezone=True), nullable=False, default=utc_now)


class BudgetLine(Base):
    """Extra trip costs that are not already stored on a flight, plan, or parking row."""

    __tablename__ = "budget_lines"

    id = Column(Integer, primary_key=True)
    trip_id = Column(Integer, ForeignKey("trips.id", ondelete="CASCADE"), nullable=False, index=True)
    category = Column(String(40), nullable=False)
    label = Column(String(200), nullable=False)
    amount_cents = Column(Integer, nullable=False)
    currency = Column(String(3), nullable=False, default="USD")
    paid = Column(Boolean, nullable=False, default=False)
    notes = Column(Text, nullable=True)


class PtoPolicy(Base):
    __tablename__ = "pto_policy"

    id = Column(Integer, primary_key=True)
    configured = Column(Boolean, nullable=False, default=False)
    accrual_amount = Column(String(32), nullable=False, default="0")
    accrual_unit = Column(String(10), nullable=False, default="day")  # day, hour
    # weekly, biweekly, semimonthly, monthly, yearly
    accrual_cadence = Column(String(20), nullable=False, default="yearly")
    hours_per_day = Column(String(32), nullable=False, default="8")
    # Balance at the end of balance_as_of, before PTO that starts after that date.
    balance_days = Column(String(32), nullable=False, default="0")
    balance_as_of = Column(Date, nullable=False)
    annual_cap_days = Column(String(32), nullable=True)


class PtoEntry(Base):
    __tablename__ = "pto_entries"

    id = Column(Integer, primary_key=True)
    trip_id = Column(Integer, ForeignKey("trips.id", ondelete="CASCADE"), nullable=True, unique=True)
    start_date = Column(Date, nullable=False, index=True)
    end_date = Column(Date, nullable=False)
    days = Column(String(32), nullable=False)
    label = Column(String(200), nullable=False)
    kind = Column(String(20), nullable=False, default="manual")  # trip, manual
    notes = Column(Text, nullable=True)


class Setting(Base):
    __tablename__ = "settings"

    key = Column(String(80), primary_key=True)
    value = Column(Text, nullable=False)


class PlaceCache(Base):
    __tablename__ = "place_cache"

    query = Column(String(500), primary_key=True)
    payload = Column(Text, nullable=False)
    fetched_at = Column(DateTime(timezone=True), nullable=False, default=utc_now)
