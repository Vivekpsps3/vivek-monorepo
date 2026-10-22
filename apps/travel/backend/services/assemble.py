"""Read models for the home page, a trip, and the calendar."""

from datetime import date, datetime

from sqlalchemy.orm import selectinload

from apps.travel.backend.models import (
    Note,
    Parking,
    PlanItem,
    PtoEntry,
    PtoPolicy,
    Reminder,
    Stay,
    Transport,
    Trip,
)
from apps.travel.backend.services.budget import (
    CATEGORY_LABELS,
    BudgetInput,
    category_for_plan,
    category_for_transport,
    rollup,
)
from apps.travel.backend.services.dates import iter_dates, nights_away, phase_for, span_days
from apps.travel.backend.services.money import fmt_days, fmt_money, stored_days
from apps.travel.backend.deps import require_actor
from apps.travel.backend.services.pto import (
    effective_pto_days,
    policy_from_row,
    trip_projection,
    usages_from_rows,
    walk,
)

ROLE_ORDER = {"outbound": 0, "connection": 1, "local": 2, "inbound": 3}
MODE_LABELS = {
    "flight": "Flight",
    "drive": "Drive",
    "train": "Train",
    "bus": "Bus",
    "ferry": "Ferry",
    "other": "Transport",
}


def load_trip(db, trip_id: int, user_id: int) -> Trip | None:
    # New flights, plans, and notes are inserted by trip_id. If this session
    # already loaded a collection, selectinload would keep that snapshot.
    return (
        db.query(Trip)
        .populate_existing()
        .filter(Trip.id == trip_id, Trip.user_id == user_id)
        .options(
            selectinload(Trip.stays),
            selectinload(Trip.transports),
            selectinload(Trip.plans),
            selectinload(Trip.parking),
            selectinload(Trip.reminders),
            selectinload(Trip.note_entries),
            selectinload(Trip.budget_lines),
            selectinload(Trip.pto_entry),
        )
        .one_or_none()
    )


def _iso(value: datetime | None) -> str | None:
    if value is None:
        return None
    return value.isoformat(timespec="minutes")


def _route(depart: str | None, arrive: str | None) -> str:
    if depart and arrive:
        return f"{depart} → {arrive}"
    return depart or arrive or ""


def transport_label(row: Transport) -> str:
    if row.mode == "flight":
        parts = [part for part in (row.carrier, row.number) if part]
        return " ".join(parts) or "Flight"
    if row.carrier and row.number:
        return f"{row.carrier} {row.number}"
    return row.carrier or row.number or MODE_LABELS.get(row.mode, "Transport")


def _budget_label(row: Transport) -> str:
    label = transport_label(row)
    route = _route(row.depart_place, row.arrive_place)
    if route:
        return f"{label} · {route}"
    return label


def transport_out(row: Transport) -> dict:
    return {
        "id": row.id,
        "role": row.role,
        "mode": row.mode,
        "label": transport_label(row),
        "carrier": row.carrier,
        "number": row.number,
        "depart_place": row.depart_place,
        "arrive_place": row.arrive_place,
        "route": _route(row.depart_place, row.arrive_place),
        "depart_at": _iso(row.depart_at),
        "arrive_at": _iso(row.arrive_at),
        "depart_tz": row.depart_tz,
        "arrive_tz": row.arrive_tz,
        "confirmation": row.confirmation,
        "seat": row.seat,
        "cost": fmt_money(row.cost_cents),
        "currency": row.currency,
        "paid": bool(row.paid),
        "status": row.status,
        "notes": row.notes,
        "sort_order": row.sort_order,
        "category": category_for_transport(row.role, row.mode),
        "fa_ident": row.fa_ident,
        "fa_status": row.fa_status,
        "fa_aircraft": row.fa_aircraft,
        "fa_gate_origin": row.fa_gate_origin,
        "fa_gate_destination": row.fa_gate_destination,
        "fa_terminal_origin": row.fa_terminal_origin,
        "fa_terminal_destination": row.fa_terminal_destination,
        "fa_baggage_claim": row.fa_baggage_claim,
        "fa_delay_departure_seconds": row.fa_delay_departure_seconds,
        "fa_delay_arrival_seconds": row.fa_delay_arrival_seconds,
        "fa_scheduled_out": row.fa_scheduled_out,
        "fa_estimated_out": row.fa_estimated_out,
        "fa_actual_out": row.fa_actual_out,
        "fa_scheduled_in": row.fa_scheduled_in,
        "fa_estimated_in": row.fa_estimated_in,
        "fa_actual_in": row.fa_actual_in,
        "fa_fetched_at": row.fa_fetched_at.isoformat() if row.fa_fetched_at else None,
    }


def plan_out(row: PlanItem, outside: bool) -> dict:
    return {
        "id": row.id,
        "on_date": row.on_date,
        "start_time": row.start_time,
        "end_time": row.end_time,
        "kind": row.kind,
        "title": row.title,
        "place_name": row.place_name,
        "address": row.address,
        "lat": row.lat,
        "lng": row.lng,
        "url": row.url,
        "cost": fmt_money(row.cost_cents),
        "currency": row.currency,
        "paid": bool(row.paid),
        "notes": row.notes,
        "stay_id": row.stay_id,
        "outside": outside,
    }


def stay_out(row: Stay, trip: Trip) -> dict:
    outside = row.arrive_on < trip.start_date or row.leave_on > trip.end_date
    return {
        "id": row.id,
        "sort_order": row.sort_order,
        "city": row.city,
        "region": row.region,
        "country": row.country,
        "arrive_on": row.arrive_on,
        "leave_on": row.leave_on,
        "lodging_name": row.lodging_name,
        "lodging_address": row.lodging_address,
        "lat": row.lat,
        "lng": row.lng,
        "notes": row.notes,
        "outside": outside,
    }


def parking_out(row: Parking) -> dict:
    return {
        "id": row.id,
        "transport_id": row.transport_id,
        "necessary": row.necessary,
        "booked": bool(row.booked),
        "arrangement": row.arrangement,
        "place_name": row.place_name,
        "address": row.address,
        "lat": row.lat,
        "lng": row.lng,
        "confirmation": row.confirmation,
        "start_at": _iso(row.start_at),
        "end_at": _iso(row.end_at),
        "cost": fmt_money(row.cost_cents),
        "currency": row.currency,
        "paid": bool(row.paid),
        "notes": row.notes,
    }


def reminder_out(row: Reminder) -> dict:
    return {
        "id": row.id,
        "title": row.title,
        "due_at": _iso(row.due_at),
        "done": bool(row.done),
        "kind": row.kind,
        "notes": row.notes,
    }


def note_out(row: Note) -> dict:
    return {
        "id": row.id,
        "on_date": row.on_date,
        "body": row.body,
        "created_at": row.created_at.isoformat() if row.created_at else None,
    }


def city_on(stays: list[Stay], day: date) -> str | None:
    names = [stay.city for stay in stays if stay.arrive_on <= day <= stay.leave_on]
    if not names:
        return None
    return " · ".join(dict.fromkeys(names))


def _movement(row: Transport, day: date) -> str | None:
    departs = bool(row.depart_at and row.depart_at.date() == day)
    arrives = bool(row.arrive_at and row.arrive_at.date() == day)
    if departs and arrives:
        return "both"
    if departs:
        return "departs"
    if arrives:
        return "arrives"
    return None


def budget_for(trip: Trip) -> dict:
    lines: list[BudgetInput] = []
    for row in trip.transports:
        if row.cost_cents is None:
            continue
        lines.append(
            BudgetInput(
                "transport",
                row.id,
                category_for_transport(row.role, row.mode),
                _budget_label(row),
                row.cost_cents,
                row.currency,
                bool(row.paid),
            )
        )
    for row in trip.plans:
        if row.cost_cents is None:
            continue
        label = row.title if not row.place_name else f"{row.title} · {row.place_name}"
        lines.append(
            BudgetInput(
                "plan",
                row.id,
                category_for_plan(row.kind),
                label,
                row.cost_cents,
                row.currency,
                bool(row.paid),
            )
        )
    for row in trip.parking:
        if row.cost_cents is None:
            continue
        lines.append(
            BudgetInput(
                "parking",
                row.id,
                "parking",
                row.place_name or "Parking",
                row.cost_cents,
                row.currency,
                bool(row.paid),
            )
        )
    for row in trip.budget_lines:
        lines.append(
            BudgetInput(
                "manual",
                row.id,
                row.category,
                row.label,
                row.amount_cents,
                row.currency,
                bool(row.paid),
            )
        )
    rolled = rollup(lines)
    currencies = []
    for bucket in rolled["currencies"]:
        currencies.append(
            {
                "currency": bucket["currency"],
                "total": fmt_money(bucket["total_cents"]),
                "paid": fmt_money(bucket["paid_cents"]),
                "unpaid": fmt_money(bucket["unpaid_cents"]),
                "categories": [
                    {
                        "category": item["category"],
                        "label": item["label"],
                        "amount": fmt_money(item["amount_cents"]),
                    }
                    for item in bucket["categories"]
                ],
            }
        )
    rendered_lines = [
        {
            "source": line.source,
            "source_id": line.source_id,
            "category": line.category,
            "label": line.label,
            "category_label": CATEGORY_LABELS.get(line.category, line.category),
            "amount": fmt_money(line.amount_cents),
            "currency": line.currency,
            "paid": line.paid,
        }
        for line in rolled["lines"]
    ]
    manual = [
        {
            "id": row.id,
            "category": row.category,
            "category_label": CATEGORY_LABELS.get(row.category, row.category),
            "label": row.label,
            "amount": fmt_money(row.amount_cents),
            "currency": row.currency,
            "paid": bool(row.paid),
            "notes": row.notes,
        }
        for row in trip.budget_lines
    ]
    return {"currencies": currencies, "lines": rendered_lines, "manual": manual}


def _sorted_transports(trip: Trip) -> list[Transport]:
    return sorted(
        trip.transports,
        key=lambda row: (
            ROLE_ORDER.get(row.role, 9),
            row.depart_at or datetime.max,
            row.sort_order,
            row.id,
        ),
    )


def _sorted_plans(trip: Trip) -> list[PlanItem]:
    return sorted(
        trip.plans,
        key=lambda row: (
            row.on_date,
            row.start_time is None,
            row.start_time or "",
            row.sort_order,
            row.id,
        ),
    )


def build_trip(trip: Trip, policy, usages, today: date | None = None) -> dict:
    today = today or date.today()
    stays = sorted(trip.stays, key=lambda row: (row.sort_order, row.arrive_on, row.id))
    transports = _sorted_transports(trip)
    plans = _sorted_plans(trip)
    days = []
    for day in iter_dates(trip.start_date, trip.end_date):
        day_plans = [plan_out(row, False) for row in plans if row.on_date == day]
        day_moves = []
        for row in transports:
            movement = _movement(row, day)
            if movement is None:
                continue
            payload = transport_out(row)
            payload["movement"] = movement
            day_moves.append(payload)
        days.append(
            {
                "on_date": day,
                "city": city_on(stays, day),
                "outside": False,
                "items": day_plans,
                "transports": day_moves,
            }
        )
    outside_plans = [
        plan_out(row, True)
        for row in plans
        if row.on_date < trip.start_date or row.on_date > trip.end_date
    ]
    effective, auto = effective_pto_days(trip.pto_days, trip.start_date, trip.end_date)
    open_reminders = sum(1 for row in trip.reminders if not row.done)
    return {
        "id": trip.id,
        "title": trip.title,
        "start_date": trip.start_date,
        "end_date": trip.end_date,
        "phase": phase_for(trip.start_date, trip.end_date, today),
        "status": trip.status,
        "origin_label": trip.origin_label,
        "notes": trip.notes,
        "counts_as_pto": bool(trip.counts_as_pto),
        "pto_days": fmt_days(stored_days(trip.pto_days)) if trip.pto_days else None,
        "pto_days_effective": fmt_days(effective),
        "nights": nights_away(trip.start_date, trip.end_date),
        "span_days": span_days(trip.start_date, trip.end_date),
        "cities": [stay.city for stay in stays],
        "stays": [stay_out(stay, trip) for stay in stays],
        "transports": [transport_out(row) for row in transports],
        "days": days,
        "outside_plans": outside_plans,
        "parking": [parking_out(row) for row in trip.parking],
        "reminders": [
            reminder_out(row)
            for row in sorted(
                trip.reminders, key=lambda item: (item.done, item.due_at or datetime.max, item.id)
            )
        ],
        "note_entries": [note_out(row) for row in trip.note_entries],
        "budget": budget_for(trip),
        "pto": trip_projection(policy, usages, trip, effective, auto),
        "open_reminders": open_reminders,
    }


def pto_context(db, user_id: int | None = None):
    owner = require_actor().id if user_id is None else user_id
    row = db.query(PtoPolicy).filter(PtoPolicy.user_id == owner).one_or_none()
    policy = policy_from_row(row)
    usages = usages_from_rows(
        db.query(PtoEntry)
        .filter(PtoEntry.user_id == owner)
        .order_by(PtoEntry.start_date, PtoEntry.id)
        .all()
    )
    return row, policy, usages


def snapshot_pto(policy, usages, today: date) -> dict:
    if not policy.configured:
        return {
            "configured": False,
            "balance_as_of": None,
            "balance_saved": None,
            "balance_today": None,
            "accrued_since": None,
            "used_since": None,
            "accrual_amount": None,
            "accrual_unit": "day",
            "accrual_cadence": "yearly",
            "hours_per_day": "8.0000",
            "annual_cap_days": None,
            "today_before_balance_date": False,
        }
    walked = walk(policy, usages, today)
    return {
        "configured": True,
        "balance_as_of": policy.balance_as_of,
        "balance_saved": fmt_days(policy.balance_days),
        "balance_today": fmt_days(walked.balance),
        "accrued_since": fmt_days(walked.accrued),
        "used_since": fmt_days(walked.used),
        "accrual_amount": fmt_days(policy.accrual_amount),
        "accrual_unit": policy.accrual_unit,
        "accrual_cadence": policy.accrual_cadence,
        "hours_per_day": fmt_days(policy.hours_per_day),
        "annual_cap_days": fmt_days(policy.annual_cap_days)
        if policy.annual_cap_days is not None
        else None,
        "today_before_balance_date": walked.before_balance_date,
    }


def _days_until(start: date, today: date) -> int:
    return max((start - today).days, 0)


def _choose_next(in_progress: list[dict], upcoming: list[dict]) -> dict | None:
    return (in_progress or upcoming or [None])[0]


def _next_action(phase: str, days_until: int) -> str:
    if phase == "in_progress":
        return "Open today's plan"
    if days_until == 0:
        return "Leaves today"
    if days_until == 1:
        return "Leaves tomorrow"
    return "Review the plan"


def attention_for(detail: dict) -> list[dict]:
    items = []
    if detail["phase"] == "past":
        return items
    for parking in detail["parking"]:
        if parking["necessary"] == "yes" and not parking["booked"]:
            place = parking["place_name"] or "Parking"
            items.append(
                {
                    "kind": "parking",
                    "trip_id": detail["id"],
                    "trip_title": detail["title"],
                    "text": f"{place} is marked necessary and is not booked.",
                }
            )
    for reminder in detail["reminders"]:
        if reminder["done"]:
            continue
        items.append(
            {
                "kind": "reminder",
                "trip_id": detail["id"],
                "trip_title": detail["title"],
                "text": reminder["title"],
                "due_at": reminder["due_at"],
            }
        )
    return items


def build_home(db, today: date | None = None) -> dict:
    today = today or date.today()
    owner = require_actor().id
    _row, policy, usages = pto_context(db, owner)
    trips = (
        db.query(Trip)
        .filter(Trip.user_id == owner)
        .options(
            selectinload(Trip.stays),
            selectinload(Trip.transports),
            selectinload(Trip.plans),
            selectinload(Trip.parking),
            selectinload(Trip.reminders),
            selectinload(Trip.note_entries),
            selectinload(Trip.budget_lines),
        )
        .order_by(Trip.start_date, Trip.id)
        .all()
    )
    details = [build_trip(trip, policy, usages, today) for trip in trips]
    in_progress = [item for item in details if item["phase"] == "in_progress"]
    upcoming = [item for item in details if item["phase"] == "upcoming"]
    past = [item for item in details if item["phase"] == "past"]
    past.sort(key=lambda item: item["end_date"], reverse=True)
    attention = []
    for item in in_progress + upcoming:
        attention.extend(attention_for(item))
    next_trip = None
    chosen = _choose_next(in_progress, upcoming)
    if chosen is not None:
        next_trip = {
            "id": chosen["id"],
            "title": chosen["title"],
            "start_date": chosen["start_date"],
            "end_date": chosen["end_date"],
            "phase": chosen["phase"],
            "days_until": _days_until(chosen["start_date"], today),
        }
    pto = snapshot_pto(policy, usages, today)
    next_pto = None
    for item in in_progress + upcoming:
        if item["counts_as_pto"] and item["pto"]["balance_when_you_leave"] is not None:
            next_pto = {
                "trip_id": item["id"],
                "title": item["title"],
                "start_date": item["start_date"],
                "days": item["pto"]["days"],
                "balance_when_you_leave": item["pto"]["balance_when_you_leave"],
                "leftover_after": item["pto"]["leftover_after"],
            }
            break
    return {
        "today": today,
        "metrics": {
            "upcoming_count": len(upcoming),
            "in_progress_count": len(in_progress),
            "next_trip": next_trip,
            "pto_configured": pto["configured"],
            "pto_balance_today": pto["balance_today"],
            "unbooked_parking": sum(1 for item in attention if item["kind"] == "parking"),
            "open_reminders": sum(1 for item in attention if item["kind"] == "reminder"),
        },
        "pto": pto,
        "next_pto": next_pto,
        "attention": attention[:12],
        "in_progress": in_progress,
        "upcoming": upcoming,
        "past": past[:4],
    }


def build_summary(db, today: date | None = None) -> dict:
    """Small next-trip card for the Hub. No budgets, notes, or PTO."""
    today = today or date.today()
    home = build_home(db, today)
    card = home["metrics"]["next_trip"]
    if card is None:
        return {"today": today, "next_trip": None}
    detail = next(
        item for item in (*home["in_progress"], *home["upcoming"]) if item["id"] == card["id"]
    )
    cities = detail["cities"]
    return {
        "today": today,
        "next_trip": {
            "id": card["id"],
            "title": card["title"],
            "destination": cities[0] if cities else None,
            "origin_label": detail.get("origin_label") or None,
            "start_date": card["start_date"],
            "end_date": card["end_date"],
            "phase": card["phase"],
            "days_until": card["days_until"],
            "next_action": _next_action(card["phase"], card["days_until"]),
            "href": f"/travel/#/trips/{card['id']}",
        },
    }


def build_calendar(db, start: date, end: date, today: date | None = None) -> dict:
    today = today or date.today()
    if end < start:
        raise ValueError("The calendar end date has to be on or after the start.")
    if (end - start).days > 70:
        raise ValueError("Ask for at most 70 calendar days at a time.")
    owner = require_actor().id
    trips = (
        db.query(Trip)
        .options(selectinload(Trip.stays))
        .filter(Trip.user_id == owner, Trip.end_date >= start, Trip.start_date <= end)
        .order_by(Trip.start_date, Trip.id)
        .all()
    )
    trip_rows = []
    ids = []
    for trip in trips:
        stays = sorted(trip.stays, key=lambda row: (row.sort_order, row.arrive_on, row.id))
        ids.append(trip.id)
        trip_rows.append(
            {
                "id": trip.id,
                "title": trip.title,
                "start_date": trip.start_date,
                "end_date": trip.end_date,
                "phase": phase_for(trip.start_date, trip.end_date, today),
                "status": trip.status,
                "cities": [stay.city for stay in stays],
            }
        )
    plans = []
    if ids:
        rows = (
            db.query(PlanItem, Trip.title)
            .join(Trip, Trip.id == PlanItem.trip_id)
            .filter(PlanItem.trip_id.in_(ids), PlanItem.on_date >= start, PlanItem.on_date <= end)
            .order_by(PlanItem.on_date, PlanItem.start_time, PlanItem.id)
            .all()
        )
        for plan, title in rows:
            plans.append(
                {
                    "id": plan.id,
                    "trip_id": plan.trip_id,
                    "trip_title": title,
                    "on_date": plan.on_date,
                    "kind": plan.kind,
                    "title": plan.title,
                    "start_time": plan.start_time,
                    "place_name": plan.place_name,
                }
            )
    return {"start": start, "end": end, "today": today, "trips": trip_rows, "plans": plans}
