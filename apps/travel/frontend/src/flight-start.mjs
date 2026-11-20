/** A proposed flight is not a saved trip until the user accepts it. */

import {
  clockLabel,
  decideCandidates,
  departureDay,
  editManually,
  fillPreview,
  invalidateCandidate,
  lookupStillCurrent,
  previewModel,
  scheduleNotice,
} from "./flight-model.mjs";

const LEG_FIELDS = [
  "carrier",
  "depart_place",
  "arrive_place",
  "depart_at",
  "arrive_at",
  "depart_tz",
  "arrive_tz",
  "confirmation",
  "seat",
  "cost",
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
  "fa_scheduled_out",
  "fa_estimated_out",
  "fa_actual_out",
  "fa_scheduled_in",
  "fa_estimated_in",
  "fa_actual_in",
  "fa_fetched_at",
];

const DELAY_FIELDS = ["fa_delay_departure_seconds", "fa_delay_arrival_seconds"];

export function blankFlightStart() {
  return {
    ident: "",
    departOn: "",
    values: {},
    overrides: [],
    filled: [],
    manual: false,
    review: null,
  };
}

/** Drop the in-memory flight proposal. Nothing here is written onto a trip. */
export function clearFlightStart() {
  return blankFlightStart();
}

export function lookupApplies({ epoch, currentEpoch, sessionActive, settingsOpen, query, currentQuery }) {
  if (!sessionActive || settingsOpen) return false;
  if (!lookupStillCurrent(epoch, currentEpoch)) return false;
  if (!query || !currentQuery) return false;
  return query.ident === currentQuery.ident && query.depart_on === currentQuery.depart_on;
}

export function reviewOf(flight, fetchedAt) {
  const view = previewModel(flight);
  return {
    flight,
    title: view.title,
    from: view.from,
    to: view.to,
    departLabel: clockLabel(flight?.scheduled_out, flight?.origin_timezone) || "Time unavailable",
    arriveLabel: clockLabel(flight?.scheduled_in, flight?.destination_timezone) || "Time unavailable",
    relation: view.relation || "",
    status: view.status || "",
    notice: scheduleNotice(flight, fetchedAt),
    destination: view.to,
  };
}

export function reviewFromFlights(flights, departOn, { incomplete = false, fetchedAt = "" } = {}) {
  const choice = decideCandidates(flights, departOn, { incomplete });
  if (choice.kind === "preview" && choice.flight) {
    return {
      kind: "preview",
      note: "",
      flights: choice.flights,
      review: reviewOf(choice.flight, fetchedAt),
    };
  }
  if (choice.kind === "choose") {
    return {
      kind: "choose",
      note: choice.note || "Choose the matching flight.",
      flights: choice.flights,
      review: null,
    };
  }
  return {
    kind: "none",
    note: "No matching flight on that date. Type the times yourself.",
    flights: [],
    review: null,
  };
}

export function candidateLabel(flight) {
  const review = reviewOf(flight, "");
  return `${review.title} · ${review.from} → ${review.to} · ${review.departLabel}`;
}

export function beginManual(values, flight) {
  const seeded = flight ? fillPreview(values || {}, flight, []).values : { ...(values || {}) };
  const manual = editManually(seeded);
  return { values: manual.values, overrides: manual.overrides, filled: [], manual: true };
}

export function editFlightField(values, overrides, name, value) {
  return { ...typeLocked(values, overrides, name, value), manual: true };
}

function typeLocked(values, overrides, name, value) {
  const next = { ...(values || {}), [name]: value };
  const locked = new Set(overrides || []);
  if (!locked.has(name)) locked.add(name);
  return { values: next, overrides: [...locked] };
}

export function reviseFlightQuery(state) {
  return {
    ident: state?.ident || "",
    departOn: state?.departOn || "",
    values: invalidateCandidate(state?.values || {}, state?.filled || [], state?.overrides || []),
    overrides: [...(state?.overrides || [])],
    filled: [],
    manual: Boolean(state?.manual),
    review: null,
  };
}

function present(value) {
  return value != null && value !== "";
}

function delay(value) {
  if (!present(value)) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function legFrom(values, ident) {
  const leg = {
    role: "outbound",
    mode: "flight",
    status: "planned",
    currency: values.currency || "USD",
    paid: false,
  };
  if (ident) leg.number = ident;
  for (const key of LEG_FIELDS) {
    if (!present(values[key])) continue;
    leg[key] = values[key];
  }
  for (const key of DELAY_FIELDS) {
    const number = delay(values[key]);
    if (number != null) leg[key] = number;
  }
  return leg;
}

export function canAccept({ review, manual, values }) {
  if (review) return true;
  if (!manual) return false;
  return ["depart_place", "arrive_place", "depart_at", "arrive_at"].some((key) =>
    String(values?.[key] || "").trim(),
  );
}

/**
 * Copy an accepted flight into a leg.
 * The return date stays empty. The arrival airport stays a proposal.
 */
export function acceptFlight({ review, values, overrides, manual, ident, fetchedAt }) {
  const flight = review?.flight;
  if (!flight && !manual) return { ok: false, helper: "Choose a flight before planning the trip." };
  let nextValues = { ...(values || {}) };
  if (flight) {
    const filled = fillPreview(nextValues, flight, manual ? overrides || [] : []);
    nextValues = filled.values;
    if (fetchedAt) nextValues.fa_fetched_at = fetchedAt;
  }
  const number = String(ident || flight?.ident_iata || flight?.ident || "")
    .toUpperCase()
    .replace(/\s+/g, "");
  const leg = legFrom(nextValues, number);
  const start = String(nextValues.depart_at || "").slice(0, 10) || (flight ? departureDay(flight) : "");
  const destination = String(nextValues.arrive_place || review?.destination || "").trim();
  return {
    ok: true,
    helper: "",
    leg,
    start,
    end: "",
    proposal: destination
      ? { field: "destination_city", value: destination, source: "inferred" }
      : null,
    number,
  };
}

export function existingTrips(home) {
  const seen = new Set();
  const rows = [];
  for (const group of [home?.in_progress, home?.upcoming, home?.past]) {
    for (const trip of group || []) {
      if (!trip || seen.has(trip.id)) continue;
      seen.add(trip.id);
      rows.push({
        id: trip.id,
        title: String(trip.title || "Trip"),
        start: trip.start_date || "",
        end: trip.end_date || "",
      });
    }
  }
  return rows;
}

export function settleAttach({ epoch, currentEpoch, sessionActive, ok, submittedNumber, currentNumber }) {
  if (!sessionActive || epoch !== currentEpoch || submittedNumber !== currentNumber) {
    return { apply: false, keepForm: true, failed: false, notice: "" };
  }
  if (!ok) return { apply: false, keepForm: true, failed: true, notice: "" };
  return { apply: true, keepForm: true, failed: false, notice: "" };
}

/** Keep a departure the user already typed. Fill an empty one from the flight. */
export function stageStart(currentStart, stagedStart, nextStart) {
  if (!nextStart) return currentStart || "";
  if (!currentStart || currentStart === stagedStart) return nextStart;
  return currentStart;
}

export function destinationProposal(proposal, confirmed) {
  if (confirmed) return [];
  if (!proposal || proposal.source !== "inferred" || !String(proposal.value || "").trim()) return [];
  if (proposal.field !== "destination_city") return [];
  return [{ field: "destination_city", value: String(proposal.value).trim(), source: "inferred" }];
}

export function flightSectionDirty({
  ident,
  departOn,
  review,
  manualDirty,
  stagedNumber,
  stagedDate,
}) {
  const current = String(ident || "").toUpperCase().replace(/\s+/g, "");
  const typed = Boolean(current || departOn || review || manualDirty);
  if (!typed) return false;
  if (!stagedNumber) return true;
  if (current !== stagedNumber) return true;
  if ((departOn || "") !== (stagedDate || "")) return true;
  return Boolean(manualDirty);
}
