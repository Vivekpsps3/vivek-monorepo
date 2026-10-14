"""Turn validated payloads into rows."""

from datetime import UTC, datetime

from models import BudgetLine, Parking, PlanItem, Reminder, Stay, Transport
from services.money import fmt_days, parse_days, parse_money


def touch(trip) -> None:
    trip.updated_at = datetime.now(UTC)


def _fa_fetched(body) -> datetime | None:
    if body.fa_fetched_at is not None:
        return body.fa_fetched_at
    if body.fa_ident:
        return datetime.now(UTC)
    return None


def apply_transport(row: Transport, body) -> None:
    row.role = body.role
    row.mode = body.mode
    row.carrier = body.carrier
    row.number = body.number
    row.depart_place = body.depart_place
    row.arrive_place = body.arrive_place
    row.depart_at = body.depart_at
    row.arrive_at = body.arrive_at
    row.depart_tz = body.depart_tz
    row.arrive_tz = body.arrive_tz
    row.confirmation = body.confirmation
    row.seat = body.seat
    row.cost_cents = parse_money(body.cost)
    row.currency = body.currency
    row.paid = body.paid
    row.status = body.status
    row.notes = body.notes
    row.fa_ident = body.fa_ident
    row.fa_status = body.fa_status
    row.fa_aircraft = body.fa_aircraft
    row.fa_gate_origin = body.fa_gate_origin
    row.fa_gate_destination = body.fa_gate_destination
    row.fa_terminal_origin = body.fa_terminal_origin
    row.fa_terminal_destination = body.fa_terminal_destination
    row.fa_baggage_claim = body.fa_baggage_claim
    row.fa_delay_departure_seconds = body.fa_delay_departure_seconds
    row.fa_delay_arrival_seconds = body.fa_delay_arrival_seconds
    row.fa_scheduled_out = body.fa_scheduled_out
    row.fa_estimated_out = body.fa_estimated_out
    row.fa_actual_out = body.fa_actual_out
    row.fa_scheduled_in = body.fa_scheduled_in
    row.fa_estimated_in = body.fa_estimated_in
    row.fa_actual_in = body.fa_actual_in
    fetched = _fa_fetched(body)
    if fetched is not None:
        row.fa_fetched_at = fetched


def apply_stay(row: Stay, body) -> None:
    row.city = body.city
    row.region = body.region
    row.country = body.country
    row.arrive_on = body.arrive_on
    row.leave_on = body.leave_on
    row.lodging_name = body.lodging_name
    row.lodging_address = body.lodging_address
    row.lat = body.lat
    row.lng = body.lng
    row.notes = body.notes


def apply_plan(row: PlanItem, body) -> None:
    row.on_date = body.on_date
    row.start_time = body.start_time
    row.end_time = body.end_time
    row.kind = body.kind
    row.title = body.title
    row.place_name = body.place_name
    row.address = body.address
    row.lat = body.lat
    row.lng = body.lng
    row.url = body.url
    row.cost_cents = parse_money(body.cost)
    row.currency = body.currency
    row.paid = body.paid
    row.notes = body.notes
    row.stay_id = body.stay_id


def apply_parking(row: Parking, body) -> None:
    row.transport_id = body.transport_id
    row.necessary = body.necessary
    row.booked = body.booked
    row.arrangement = body.arrangement
    row.place_name = body.place_name
    row.address = body.address
    row.lat = body.lat
    row.lng = body.lng
    row.confirmation = body.confirmation
    row.start_at = body.start_at
    row.end_at = body.end_at
    row.cost_cents = parse_money(body.cost)
    row.currency = body.currency
    row.paid = body.paid
    row.notes = body.notes


def apply_reminder(row: Reminder, body) -> None:
    row.title = body.title
    row.due_at = body.due_at
    row.done = body.done
    row.kind = body.kind
    row.notes = body.notes


def apply_budget_line(row: BudgetLine, body) -> None:
    cents = parse_money(body.amount)
    if cents is None:
        raise ValueError("Enter an amount.")
    row.category = body.category
    row.label = body.label
    row.amount_cents = cents
    row.currency = body.currency
    row.paid = body.paid
    row.notes = body.notes


def pto_override(value) -> str | None:
    if value is None:
        return None
    return fmt_days(parse_days(value))
