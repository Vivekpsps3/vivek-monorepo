"""Request and response shapes for the travel API."""

from datetime import date, datetime
from decimal import Decimal
from math import isfinite
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from apps.travel.backend.services.money import clean_currency, parse_money

Role = Literal["outbound", "inbound", "connection", "local"]
Mode = Literal["flight", "drive", "train", "bus", "ferry", "other"]
TripStatus = Literal["planning", "booked", "done"]
TransportStatus = Literal["planned", "booked", "completed", "cancelled"]
PlanKind = Literal["restaurant", "activity", "lodging", "transit", "other"]
Necessary = Literal["yes", "no", "unknown"]
Arrangement = Literal["self_park", "valet", "offsite", "dropoff", "pickup", "rideshare", "none"]
ReminderKind = Literal["general", "parking", "flight", "packing"]
BudgetCategory = Literal[
    "outbound_flight",
    "inbound_flight",
    "connection_flight",
    "drive",
    "transport",
    "lodging",
    "food",
    "activity",
    "parking",
    "other",
]
AccrualUnit = Literal["day", "hour"]
AccrualCadence = Literal["weekly", "biweekly", "semimonthly", "monthly", "yearly"]

TIME_RE = r"^([01]\d|2[0-3]):[0-5]\d$"


_INVISIBLE = dict.fromkeys(map(ord, "\u200b\u200c\u200d\u2060\ufeff"), None)


def trip_title(value) -> str:
    if not isinstance(value, str):
        raise ValueError("Give the trip a name.")
    text = value.translate(_INVISIBLE).strip()
    if not text:
        raise ValueError("Give the trip a name.")
    if len(text) > 200:
        raise ValueError("Keep the name under 200 characters.")
    return text


def _blank(value: str | None, limit: int) -> str | None:
    if value is None:
        return None
    text = value.strip()
    if not text:
        return None
    if len(text) > limit:
        raise ValueError(f"Keep this under {limit} characters.")
    return text


def _coord(value: float | None, low: float, high: float, label: str) -> float | None:
    if value is None:
        return None
    if not isfinite(value):
        raise ValueError(f"{label} must be a finite number.")
    if value < low or value > high:
        raise ValueError(f"{label} must be between {low:g} and {high:g}.")
    return value


class StayIn(BaseModel):
    city: str
    region: str | None = None
    country: str | None = None
    arrive_on: date
    leave_on: date
    lodging_name: str | None = None
    lodging_address: str | None = None
    lat: float | None = None
    lng: float | None = None
    notes: str | None = None

    @field_validator("city")
    @classmethod
    def city_ok(cls, value: str) -> str:
        text = value.strip()
        if not text:
            raise ValueError("Name the city.")
        if len(text) > 200:
            raise ValueError("Keep the city under 200 characters.")
        return text

    @field_validator("region", "country", "lodging_name")
    @classmethod
    def short_text(cls, value: str | None) -> str | None:
        return _blank(value, 200)

    @field_validator("lodging_address")
    @classmethod
    def address_ok(cls, value: str | None) -> str | None:
        return _blank(value, 500)

    @field_validator("notes")
    @classmethod
    def notes_ok(cls, value: str | None) -> str | None:
        return _blank(value, 4000)

    @field_validator("lat")
    @classmethod
    def lat_ok(cls, value: float | None) -> float | None:
        return _coord(value, -90, 90, "Latitude")

    @field_validator("lng")
    @classmethod
    def lng_ok(cls, value: float | None) -> float | None:
        return _coord(value, -180, 180, "Longitude")

    @model_validator(mode="after")
    def dates_ok(self):
        if self.leave_on < self.arrive_on:
            raise ValueError("The city departure has to be on or after the arrival.")
        return self


class TransportIn(BaseModel):
    role: Role
    mode: Mode
    carrier: str | None = None
    number: str | None = None
    depart_place: str | None = None
    arrive_place: str | None = None
    depart_at: datetime | None = None
    arrive_at: datetime | None = None
    depart_tz: str | None = None
    arrive_tz: str | None = None
    confirmation: str | None = None
    seat: str | None = None
    cost: Decimal | None = None
    currency: str = "USD"
    paid: bool = False
    status: TransportStatus = "planned"
    notes: str | None = None
    fa_ident: str | None = None
    fa_status: str | None = None
    fa_aircraft: str | None = None
    fa_gate_origin: str | None = None
    fa_gate_destination: str | None = None
    fa_terminal_origin: str | None = None
    fa_terminal_destination: str | None = None
    fa_baggage_claim: str | None = None
    fa_delay_departure_seconds: int | None = None
    fa_delay_arrival_seconds: int | None = None
    fa_scheduled_out: str | None = None
    fa_estimated_out: str | None = None
    fa_actual_out: str | None = None
    fa_scheduled_in: str | None = None
    fa_estimated_in: str | None = None
    fa_actual_in: str | None = None
    fa_fetched_at: datetime | None = None

    @field_validator("currency")
    @classmethod
    def currency_ok(cls, value: str) -> str:
        return clean_currency(value)

    @field_validator("cost")
    @classmethod
    def cost_ok(cls, value: Decimal | None) -> Decimal | None:
        parse_money(value)
        return value

    @field_validator(
        "carrier",
        "depart_place",
        "arrive_place",
    )
    @classmethod
    def place_text(cls, value: str | None) -> str | None:
        return _blank(value, 200)

    @field_validator("number", "confirmation", "seat", "fa_ident", "fa_aircraft")
    @classmethod
    def code_text(cls, value: str | None) -> str | None:
        return _blank(value, 40)

    @field_validator(
        "depart_tz",
        "arrive_tz",
        "fa_status",
        "fa_gate_origin",
        "fa_gate_destination",
        "fa_terminal_origin",
        "fa_terminal_destination",
        "fa_baggage_claim",
        "fa_scheduled_out",
        "fa_estimated_out",
        "fa_actual_out",
        "fa_scheduled_in",
        "fa_estimated_in",
        "fa_actual_in",
    )
    @classmethod
    def fa_text(cls, value: str | None) -> str | None:
        return _blank(value, 80)

    @field_validator("notes")
    @classmethod
    def notes_ok(cls, value: str | None) -> str | None:
        return _blank(value, 4000)

    @field_validator("depart_at", "arrive_at", "fa_fetched_at")
    @classmethod
    def naive_wall(cls, value: datetime | None) -> datetime | None:
        if value is not None and value.tzinfo is not None:
            return value.replace(tzinfo=None)
        return value


class PtoDateIn(BaseModel):
    on_date: date
    amount: Decimal

    @field_validator("amount")
    @classmethod
    def amount_ok(cls, value: Decimal) -> Decimal:
        if not value.is_finite():
            raise ValueError("Enter a finite number of days.")
        if value < 0:
            raise ValueError("Days cannot be negative.")
        if value > 1:
            raise ValueError("A PTO day cannot be more than 1.")
        return value


class TripCreate(BaseModel):
    title: str
    start_date: date
    end_date: date
    status: TripStatus = "planning"
    origin_label: str | None = None
    notes: str | None = None
    counts_as_pto: bool = True
    pto_days: Decimal | None = None
    stays: list[StayIn] = Field(default_factory=list)
    transports: list[TransportIn] = Field(default_factory=list)

    @field_validator("title", mode="before")
    @classmethod
    def title_ok(cls, value: str) -> str:
        return trip_title(value)

    @field_validator("origin_label")
    @classmethod
    def origin_ok(cls, value: str | None) -> str | None:
        return _blank(value, 200)

    @field_validator("notes")
    @classmethod
    def notes_ok(cls, value: str | None) -> str | None:
        return _blank(value, 8000)

    @model_validator(mode="after")
    def dates_ok(self):
        if self.end_date < self.start_date:
            raise ValueError("The return date has to be on or after the day you leave.")
        if self.pto_days is not None:
            if not self.pto_days.is_finite():
                raise ValueError("PTO days have to be a finite number.")
            if self.pto_days < 0 or self.pto_days > 366:
                raise ValueError("PTO days have to be between 0 and 366.")
        return self


class TripPatch(BaseModel):
    title: str | None = None
    start_date: date | None = None
    end_date: date | None = None
    status: TripStatus | None = None
    origin_label: str | None = None
    notes: str | None = None
    counts_as_pto: bool | None = None
    pto_days: Decimal | None = None
    pto_dates: list[PtoDateIn] | None = None

    @field_validator("title", mode="before")
    @classmethod
    def title_ok(cls, value: str | None) -> str | None:
        return trip_title(value)

    @field_validator("origin_label")
    @classmethod
    def origin_ok(cls, value: str | None) -> str | None:
        return _blank(value, 200)

    @field_validator("notes")
    @classmethod
    def notes_ok(cls, value: str | None) -> str | None:
        return _blank(value, 8000)

    @field_validator("pto_days")
    @classmethod
    def pto_days_ok(cls, value: Decimal | None) -> Decimal | None:
        if value is None:
            return None
        if not value.is_finite():
            raise ValueError("PTO days have to be a finite number.")
        if value < 0 or value > 366:
            raise ValueError("PTO days have to be between 0 and 366.")
        return value

    @model_validator(mode="after")
    def one_choice_per_date(self):
        if self.pto_dates:
            dates = [item.on_date for item in self.pto_dates]
            if len(dates) != len(set(dates)):
                raise ValueError("Each PTO date can only be chosen once.")
        return self


class PlanIn(BaseModel):
    on_date: date
    start_time: str | None = None
    end_time: str | None = None
    kind: PlanKind = "activity"
    title: str
    place_name: str | None = None
    address: str | None = None
    lat: float | None = None
    lng: float | None = None
    url: str | None = None
    cost: Decimal | None = None
    currency: str = "USD"
    paid: bool = False
    notes: str | None = None
    stay_id: int | None = None

    @field_validator("title")
    @classmethod
    def title_ok(cls, value: str) -> str:
        text = value.strip()
        if not text:
            raise ValueError("Name this plan.")
        if len(text) > 200:
            raise ValueError("Keep the name under 200 characters.")
        return text

    @field_validator("start_time", "end_time")
    @classmethod
    def time_ok(cls, value: str | None) -> str | None:
        text = _blank(value, 5)
        if text is None:
            return None
        import re

        if not re.fullmatch(TIME_RE, text):
            raise ValueError("Use a time like 19:30.")
        return text

    @field_validator("place_name")
    @classmethod
    def place_ok(cls, value: str | None) -> str | None:
        return _blank(value, 200)

    @field_validator("address", "notes")
    @classmethod
    def long_ok(cls, value: str | None) -> str | None:
        return _blank(value, 4000)

    @field_validator("url")
    @classmethod
    def url_ok(cls, value: str | None) -> str | None:
        return _blank(value, 500)

    @field_validator("currency")
    @classmethod
    def currency_ok(cls, value: str) -> str:
        return clean_currency(value)

    @field_validator("cost")
    @classmethod
    def cost_ok(cls, value: Decimal | None) -> Decimal | None:
        parse_money(value)
        return value

    @field_validator("lat")
    @classmethod
    def lat_ok(cls, value: float | None) -> float | None:
        return _coord(value, -90, 90, "Latitude")

    @field_validator("lng")
    @classmethod
    def lng_ok(cls, value: float | None) -> float | None:
        return _coord(value, -180, 180, "Longitude")


class ParkingIn(BaseModel):
    transport_id: int | None = None
    necessary: Necessary = "unknown"
    booked: bool = False
    arrangement: Arrangement = "self_park"
    place_name: str | None = None
    address: str | None = None
    lat: float | None = None
    lng: float | None = None
    confirmation: str | None = None
    start_at: datetime | None = None
    end_at: datetime | None = None
    cost: Decimal | None = None
    currency: str = "USD"
    paid: bool = False
    notes: str | None = None

    @field_validator("place_name")
    @classmethod
    def place_ok(cls, value: str | None) -> str | None:
        return _blank(value, 200)

    @field_validator("address", "notes")
    @classmethod
    def long_ok(cls, value: str | None) -> str | None:
        return _blank(value, 4000)

    @field_validator("confirmation")
    @classmethod
    def confirm_ok(cls, value: str | None) -> str | None:
        return _blank(value, 80)

    @field_validator("currency")
    @classmethod
    def currency_ok(cls, value: str) -> str:
        return clean_currency(value)

    @field_validator("cost")
    @classmethod
    def cost_ok(cls, value: Decimal | None) -> Decimal | None:
        parse_money(value)
        return value

    @field_validator("lat")
    @classmethod
    def lat_ok(cls, value: float | None) -> float | None:
        return _coord(value, -90, 90, "Latitude")

    @field_validator("lng")
    @classmethod
    def lng_ok(cls, value: float | None) -> float | None:
        return _coord(value, -180, 180, "Longitude")

    @field_validator("start_at", "end_at")
    @classmethod
    def naive_wall(cls, value: datetime | None) -> datetime | None:
        if value is not None and value.tzinfo is not None:
            return value.replace(tzinfo=None)
        return value


class NoteIn(BaseModel):
    body: str
    on_date: date | None = None

    @field_validator("body")
    @classmethod
    def body_ok(cls, value: str) -> str:
        text = value.strip()
        if not text:
            raise ValueError("Write the note.")
        if len(text) > 8000:
            raise ValueError("Keep the note under 8000 characters.")
        return text


class ReminderIn(BaseModel):
    title: str
    due_at: datetime | None = None
    done: bool = False
    kind: ReminderKind = "general"
    notes: str | None = None

    @field_validator("title")
    @classmethod
    def title_ok(cls, value: str) -> str:
        text = value.strip()
        if not text:
            raise ValueError("Name the reminder.")
        if len(text) > 200:
            raise ValueError("Keep the reminder under 200 characters.")
        return text

    @field_validator("notes")
    @classmethod
    def notes_ok(cls, value: str | None) -> str | None:
        return _blank(value, 4000)

    @field_validator("due_at")
    @classmethod
    def naive_wall(cls, value: datetime | None) -> datetime | None:
        if value is not None and value.tzinfo is not None:
            return value.replace(tzinfo=None)
        return value


class BudgetLineIn(BaseModel):
    category: BudgetCategory
    label: str
    amount: Decimal
    currency: str = "USD"
    paid: bool = False
    notes: str | None = None

    @field_validator("label")
    @classmethod
    def label_ok(cls, value: str) -> str:
        text = value.strip()
        if not text:
            raise ValueError("Name this cost.")
        if len(text) > 200:
            raise ValueError("Keep the name under 200 characters.")
        return text

    @field_validator("currency")
    @classmethod
    def currency_ok(cls, value: str) -> str:
        return clean_currency(value)

    @field_validator("amount")
    @classmethod
    def amount_ok(cls, value: Decimal) -> Decimal:
        if parse_money(value) is None:
            raise ValueError("Enter an amount.")
        return value

    @field_validator("notes")
    @classmethod
    def notes_ok(cls, value: str | None) -> str | None:
        return _blank(value, 4000)


class PtoPolicyIn(BaseModel):
    accrual_amount: Decimal
    accrual_unit: AccrualUnit
    accrual_cadence: AccrualCadence
    hours_per_day: Decimal = Decimal("8")
    balance_days: Decimal
    balance_as_of: date
    annual_cap_days: Decimal | None = None

    @field_validator("accrual_amount", "hours_per_day", "balance_days", "annual_cap_days")
    @classmethod
    def finite_values(cls, value: Decimal | None) -> Decimal | None:
        if value is not None and not value.is_finite():
            raise ValueError("Enter a finite PTO value.")
        return value

    @model_validator(mode="after")
    def bounds(self):
        if self.accrual_amount < 0 or self.accrual_amount > 1000:
            raise ValueError("Accrual has to be between 0 and 1000.")
        if self.hours_per_day <= 0 or self.hours_per_day > 24:
            raise ValueError("Hours per day has to be greater than 0 and at most 24.")
        if self.balance_days < -366 or self.balance_days > 366:
            raise ValueError("Balance has to be between -366 and 366 days.")
        if self.annual_cap_days is not None and (
            self.annual_cap_days <= 0 or self.annual_cap_days > 366
        ):
            raise ValueError("The cap has to be greater than 0 and at most 366 days.")
        return self


class PtoEntryIn(BaseModel):
    label: str
    start_date: date
    end_date: date
    days: Decimal | None = None
    notes: str | None = None

    @field_validator("label")
    @classmethod
    def label_ok(cls, value: str) -> str:
        text = value.strip()
        if not text:
            raise ValueError("Name this PTO.")
        if len(text) > 200:
            raise ValueError("Keep the name under 200 characters.")
        return text

    @field_validator("notes")
    @classmethod
    def notes_ok(cls, value: str | None) -> str | None:
        return _blank(value, 4000)

    @field_validator("days")
    @classmethod
    def days_finite(cls, value: Decimal | None) -> Decimal | None:
        if value is not None and not value.is_finite():
            raise ValueError("Days have to be a finite number.")
        return value

    @model_validator(mode="after")
    def dates_ok(self):
        if self.end_date < self.start_date:
            raise ValueError("The end date has to be on or after the start date.")
        if self.days is not None and (self.days < 0 or self.days > 366):
            raise ValueError("Days have to be between 0 and 366.")
        return self


class FlightLookupIn(BaseModel):
    ident: str
    depart_on: date


class FlightAwareKeyIn(BaseModel):
    api_key: str = ""


class SessionIn(BaseModel):
    token: str


class TripDetail(BaseModel):
    """Loose response model. The assembler fills every field the UI reads."""

    model_config = ConfigDict(extra="allow")
