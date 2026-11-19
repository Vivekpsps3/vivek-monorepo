/** Confirmed trip-draft body. An arrival time or a proposal is not a saved fact. */

const LEG_KEYS = [
  "role",
  "mode",
  "carrier",
  "number",
  "depart_place",
  "arrive_place",
  "depart_at",
  "arrive_at",
  "depart_tz",
  "arrive_tz",
  "confirmation",
  "seat",
  "cost",
  "currency",
  "paid",
  "status",
  "notes",
  "fa_ident",
  "fa_flight_id",
  "fa_status",
  "fa_aircraft",
  "fa_gate_origin",
  "fa_gate_destination",
  "fa_terminal_origin",
  "fa_terminal_destination",
  "fa_baggage_claim",
  "fa_delay_departure_seconds",
  "fa_delay_arrival_seconds",
  "fa_scheduled_out",
  "fa_estimated_out",
  "fa_actual_out",
  "fa_scheduled_in",
  "fa_estimated_in",
  "fa_actual_in",
  "fa_fetched_at",
];

const PROPOSAL_FIELDS = new Set([
  "end_date",
  "destination_city",
  "lodging_name",
  "counts_as_pto",
  "duration",
]);

function text(value) {
  return String(value ?? "").trim();
}

function confirmedLeg(raw) {
  const leg = {};
  for (const key of LEG_KEYS) {
    if (!raw || !Object.prototype.hasOwnProperty.call(raw, key)) continue;
    const value = raw[key];
    if (value == null || value === "") continue;
    leg[key] = value;
  }
  if (!leg.role) leg.role = "outbound";
  return leg;
}

/**
 * Build the save body from fields the owner confirmed.
 * `end` blank stays null even when a leg arrived the next day.
 * Proposals are copied only as labeled inferences.
 */
export function draftRequest(input) {
  const start = text(input?.start);
  const end = text(input?.end);
  const legs = (input?.transports || []).map(confirmedLeg);
  if (!start) {
    return { ok: false, helper: "Pick the day you leave before saving a draft.", field: "start" };
  }
  if (!legs.some((leg) => leg.role === "outbound" && leg.mode)) {
    return { ok: false, helper: "Add the outbound leg before saving a draft.", field: "transport" };
  }
  if (end && end < start) {
    return {
      ok: false,
      helper: "The return date has to be on or after the day you leave.",
      field: "end",
    };
  }
  const proposals = [];
  for (const item of input?.proposals || []) {
    const field = text(item?.field);
    const value = text(item?.value);
    if (item?.source !== "inferred" || !PROPOSAL_FIELDS.has(field) || !value) continue;
    if (proposals.some((row) => row.field === field)) continue;
    proposals.push({ field, value, source: "inferred" });
  }
  const destination = text(input?.destination);
  const origin = text(input?.origin);
  const notes = text(input?.notes);
  return {
    ok: true,
    field: "",
    helper: "",
    body: {
      title: text(input?.title) || "Draft",
      start_date: start,
      end_date: end || null,
      destination_label: destination || null,
      origin_label: origin || null,
      notes: notes || null,
      legs,
      proposals,
    },
  };
}

/** Drop the in-memory draft. Nothing here is written back onto the form. */
export function clearPrivateTripDraft() {
  return {
    start: "",
    end: "",
    transports: [],
    charges: {},
    changeDate: "",
    tripName: "",
    cities: {},
    notice: "",
    error: "",
    draftId: null,
    revision: null,
  };
}

export function sameDraftInput(submitted, current) {
  return JSON.stringify(submitted ?? null) === JSON.stringify(current ?? null);
}

export function draftSavedNotice(end, newer) {
  if (newer) return "Draft saved. Your newer edits still need saving.";
  if (!text(end)) {
    return "Draft saved. The return date is still unknown, and this draft has no PTO charge.";
  }
  return "Draft saved. This return date is saved, and this draft has no PTO charge.";
}

/**
 * A late or losing response does not replace the form.
 * Invalidation drops the response. A failure leaves the current input in place.
 */
export function settleDraftResponse({ epoch, currentEpoch, sessionActive, ok, submitted, current }) {
  if (!sessionActive || epoch !== currentEpoch) {
    return { apply: false, keepForm: true, failed: false, notice: "" };
  }
  if (!ok) return { apply: false, keepForm: true, failed: true, notice: "" };
  const newer = !sameDraftInput(submitted, current);
  return {
    apply: true,
    keepForm: true,
    failed: false,
    notice: draftSavedNotice(submitted?.end, newer),
  };
}
