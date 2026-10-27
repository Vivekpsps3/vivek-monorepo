/** Restore personal row fields without replaying server-owned identity or timestamps. */
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
