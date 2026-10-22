/**
 * Delete and checkbox-save payloads.
 * Undo re-posts the snapshot. Trip delete and key removal use a dialog.
 * Flip DECISIONS.undoRowDeletes to send row deletes through the dialog too.
 */
import { DECISIONS } from "./decisions.mjs";

const TRANSPORT_FIELDS = [
  "role", "mode", "status", "carrier", "number", "depart_place", "arrive_place",
  "depart_at", "arrive_at", "depart_tz", "arrive_tz", "confirmation", "seat",
  "cost", "currency", "paid", "notes",
  "fa_ident", "fa_status", "fa_aircraft", "fa_gate_origin", "fa_gate_destination",
  "fa_terminal_origin", "fa_terminal_destination", "fa_baggage_claim",
  "fa_delay_departure_seconds", "fa_delay_arrival_seconds",
  "fa_scheduled_out", "fa_estimated_out", "fa_actual_out",
  "fa_scheduled_in", "fa_estimated_in", "fa_actual_in",
];

function copyFields(item, keys) {
  const body = {};
  for (const key of keys) body[key] = item?.[key] ?? null;
  return body;
}

export function deletionMode(kind) {
  if (kind === "trip" || kind === "flight-key") return "dialog";
  if (DECISIONS.undoRowDeletes) return "undo";
  return "dialog";
}

export function undoCopy(kind) {
  const labels = {
    stay: "City deleted.",
    transport: "Ride deleted.",
    plan: "Plan deleted.",
    parking: "Parking deleted.",
    note: "Note deleted.",
    reminder: "Reminder deleted.",
    budget: "Cost deleted.",
    pto: "Time off deleted.",
  };
  return labels[kind] || "Deleted.";
}

export function pieceCount(trip) {
  if (!trip) return 0;
  const plans = (trip.days || []).reduce((sum, day) => sum + (day.items?.length || 0), 0) + (trip.outside_plans?.length || 0);
  return plans
    + (trip.transports?.length || 0)
    + (trip.parking?.length || 0)
    + (trip.note_entries?.length || 0)
    + (trip.reminders?.length || 0);
}

export function dialogCopy(kind, trip) {
  if (kind === "flight-key") {
    return {
      title: "Remove the saved key?",
      body: "Flight lookup stops working until you add another.",
      confirm: "Remove key",
    };
  }
  const title = trip?.title || "this trip";
  const count = pieceCount(trip);
  return {
    title: `Delete ${title}?`,
    body: `This removes the trip and its ${count} plans, rides, parking, notes and reminders. This can't be undone.`,
    confirm: "Delete trip",
  };
}

export function restoreBody(kind, item) {
  if (!item) return {};
  if (kind === "stay") {
    return copyFields(item, ["city", "region", "country", "arrive_on", "leave_on", "lodging_name", "lodging_address", "lat", "lng", "notes"]);
  }
  if (kind === "transport") {
    const body = copyFields(item, TRANSPORT_FIELDS);
    if (!body.currency) body.currency = "USD";
    if (!body.status) body.status = "planned";
    body.paid = Boolean(item.paid);
    return body;
  }
  if (kind === "plan") {
    const body = copyFields(item, ["on_date", "start_time", "end_time", "kind", "title", "place_name", "address", "lat", "lng", "url", "cost", "currency", "notes", "stay_id"]);
    if (!body.currency) body.currency = "USD";
    if (!body.kind) body.kind = "activity";
    body.paid = Boolean(item.paid);
    return body;
  }
  if (kind === "parking") {
    const body = copyFields(item, ["transport_id", "necessary", "arrangement", "place_name", "address", "lat", "lng", "confirmation", "start_at", "end_at", "cost", "currency", "notes"]);
    if (!body.currency) body.currency = "USD";
    body.booked = Boolean(item.booked);
    body.paid = Boolean(item.paid);
    return body;
  }
  if (kind === "note") return copyFields(item, ["body", "on_date"]);
  if (kind === "reminder") {
    return {
      title: item.title,
      due_at: item.due_at ?? null,
      done: Boolean(item.done),
      kind: item.kind || "general",
      notes: item.notes ?? null,
    };
  }
  if (kind === "budget") {
    return {
      category: item.category || "other",
      label: item.label,
      amount: item.amount,
      currency: item.currency || "USD",
      paid: Boolean(item.paid),
      notes: item.notes ?? null,
    };
  }
  if (kind === "pto") {
    return {
      label: item.label,
      start_date: item.start_date,
      end_date: item.end_date,
      days: item.days ?? null,
      notes: item.notes ?? null,
    };
  }
  return {};
}

export function flagBody(kind, item, flag, value) {
  const body = restoreBody(kind, item);
  body[flag] = Boolean(value);
  return body;
}

export function flagToast(kind, flag, on) {
  if (kind === "reminder" && flag === "done") return on ? "Reminder marked done." : "Reminder marked open.";
  const noun = { parking: "Parking", transport: "Ride", plan: "Plan", budget: "Cost" }[kind] || "Item";
  const word = flag === "booked" ? "booked" : "paid";
  return on ? `${noun} marked ${word}.` : `${noun} marked not ${word}.`;
}

export function restorePath(kind, tripId) {
  return {
    stay: `/api/trips/${tripId}/stays`,
    transport: `/api/trips/${tripId}/transports`,
    plan: `/api/trips/${tripId}/plans`,
    parking: `/api/trips/${tripId}/parking`,
    note: `/api/trips/${tripId}/notes`,
    reminder: `/api/trips/${tripId}/reminders`,
    budget: `/api/trips/${tripId}/budget-lines`,
    pto: "/api/pto/entries",
  }[kind] || "";
}

export function patchPath(kind, id) {
  return {
    stay: `/api/stays/${id}`,
    transport: `/api/transports/${id}`,
    plan: `/api/plans/${id}`,
    parking: `/api/parking/${id}`,
    reminder: `/api/reminders/${id}`,
    budget: `/api/budget-lines/${id}`,
  }[kind] || "";
}

export function deletePath(kind, id) {
  return {
    trip: `/api/trips/${id}`,
    stay: `/api/stays/${id}`,
    transport: `/api/transports/${id}`,
    plan: `/api/plans/${id}`,
    parking: `/api/parking/${id}`,
    note: `/api/notes/${id}`,
    reminder: `/api/reminders/${id}`,
    budget: `/api/budget-lines/${id}`,
    pto: `/api/pto/entries/${id}`,
  }[kind] || "";
}

export function findItem(trip, kind, id, extras = {}) {
  const num = Number(id);
  if (kind === "pto") return (extras.entries || []).find((item) => item.id === num) || null;
  if (!trip) return null;
  const plans = [
    ...(trip.days || []).flatMap((day) => day.items || []),
    ...(trip.outside_plans || []),
  ];
  const lists = {
    stay: trip.stays,
    transport: trip.transports,
    plan: plans,
    parking: trip.parking,
    note: trip.note_entries,
    reminder: trip.reminders,
    budget: trip.budget?.manual,
  };
  return (lists[kind] || []).find((item) => item.id === num) || null;
}
