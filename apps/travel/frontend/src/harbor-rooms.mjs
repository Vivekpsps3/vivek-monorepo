/** Map room and souvenir gallery projections. Trips, PTO, and costs stay on their owners. */

import { daysText } from "./labels.mjs";
import { hallDate, hallTrips, itineraryRows } from "./terminal-hall.mjs";
import { reconcileStages, spendState } from "./trip-costs.mjs";
import { cardPlaces } from "./trip-list.mjs";

const ROOMS = new Set(["map", "gallery"]);
const CARDS = new Set(["planned", "completed", "souvenir"]);

function text(value) {
  return value == null ? "" : String(value).trim();
}

function positiveId(value) {
  return /^[1-9]\d{0,15}$/.test(text(value));
}

function placeKey(value) {
  let clean = "";
  for (const char of text(value)) {
    if (char.charCodeAt(0) < 32) continue;
    clean += char;
    if (clean.length === 120) break;
  }
  return clean;
}

/** Public room coordinates. A ferry is not a room and not a trip. */
export function readRoomQuery(params) {
  const room = text(params?.get?.("room"));
  const card = text(params?.get?.("card"));
  const trip = text(params?.get?.("trip"));
  return {
    room: ROOMS.has(room) ? room : "",
    trip: positiveId(trip) ? Number(trip) : null,
    place: placeKey(params?.get?.("place")),
    card: CARDS.has(card) ? card : "",
  };
}

export function tripById(home, tripId) {
  if (!positiveId(tripId)) return null;
  return hallTrips(home).find((trip) => Number(trip.id) === Number(tripId)) || null;
}

/**
 * Saved leave and return. A missing return stays missing.
 * The leave date is not copied forward.
 */
export function tripSpan(trip) {
  const start = hallDate(trip?.start_date);
  const end = hallDate(trip?.end_date);
  let span = "Leave date is not saved.";
  if (start && end) span = start === end ? start : `${start} through ${end}`;
  else if (start) span = `Leaves ${start}. Return date is not saved.`;
  return { start, end, text: span, inventedReturn: false };
}

function ptoDates(trip) {
  const rows = Array.isArray(trip?.pto_dates) ? trip.pto_dates : [];
  const dates = [];
  for (const row of rows) {
    const onDate = hallDate(row?.on_date);
    if (!onDate) continue;
    dates.push({ on_date: onDate, amount: text(row?.amount) });
  }
  return dates;
}

/** The saved charge. Date rows are not added up into a new charge. */
export function tripPto(trip) {
  const projection = trip?.pto;
  if (!trip || !projection || typeof projection !== "object") {
    return {
      charged: "",
      counts: false,
      note: "",
      text: "PTO for this trip is not in the saved list. This room does not add a PTO charge.",
      dates: [],
    };
  }
  const charged = text(projection.days);
  const amount = daysText(charged);
  const note = text(projection.note);
  const chargeText = amount ? `PTO charge ${amount}.` : "No PTO charge is saved.";
  return {
    charged,
    counts: projection.counts === true,
    note,
    text: [chargeText, note, "This room does not add a PTO charge."].filter(Boolean).join(" "),
    dates: ptoDates(trip),
  };
}

export function mapDestinations(home) {
  const rows = [];
  for (const trip of hallTrips(home)) {
    const span = tripSpan(trip);
    const title = text(trip.title) || "Trip";
    const places = cardPlaces(trip);
    if (!places.length) {
      rows.push({
        tripId: Number(trip.id),
        title,
        kind: "",
        kindLabel: "",
        label: "",
        lat: null,
        lng: null,
        span,
        missing: true,
      });
      continue;
    }
    for (const place of places) {
      rows.push({
        tripId: Number(trip.id),
        title,
        kind: place.kind,
        kindLabel: place.kindLabel,
        label: place.label,
        lat: place.lat,
        lng: place.lng,
        span,
        missing: false,
      });
    }
  }
  return rows;
}

export function destinationLabel(row) {
  if (!row?.label) return `Select ${row?.title || "trip"}. No destination saved.`;
  return ["Select", row.kindLabel, row.label + ",", row.title].filter(Boolean).join(" ");
}

export function roomDayLabel(row) {
  return [`Show day ${text(row?.day)}`, text(row?.title), text(row?.city)].filter(Boolean).join(", ");
}

/** Saved local days. The span is not filled in when the payload has no days. */
export function visibleItinerary(home, tripId) {
  const rows = itineraryRows(home);
  if (!positiveId(tripId)) return rows;
  return rows.filter((row) => row.tripId === Number(tripId));
}

export function tripTransports(trip) {
  const rows = [];
  for (const leg of trip?.transports || []) {
    if (!positiveId(leg?.id)) continue;
    rows.push({
      id: Number(leg.id),
      mode: text(leg.mode),
      number: text(leg.number),
      role: text(leg.role),
    });
  }
  return rows;
}

function savedMemories(memories) {
  const rows = Array.isArray(memories) ? memories : [];
  return rows.filter((row) => row && positiveId(row.trip_id) && hallDate(row.span_start) && hallDate(row.span_end));
}

export function ordinarySouvenirs(memories) {
  return savedMemories(memories);
}

export function plannedPostcards(memories) {
  return savedMemories(memories).filter((row) => row.status === "planning" || row.mark === "planned");
}

export function completedPostcards(memories) {
  return savedMemories(memories).filter((row) => row.status === "done" || row.mark === "completed");
}

export function cardKind(memory) {
  if (!memory) return "";
  if (memory.status === "planning" || memory.mark === "planned") return "planned";
  if (memory.status === "done" || memory.mark === "completed") return "completed";
  return "souvenir";
}

export function postcardLabel(memory) {
  const kind = cardKind(memory);
  const name = kind === "completed" ? "completed" : kind === "planned" ? "planned" : "saved";
  return [
    `Select ${name} postcard ${text(memory?.title) || "trip"}`,
    text(memory?.mark_label),
    text(memory?.span_text),
  ].filter(Boolean).join(" ");
}

export function souvenirLabel(memory) {
  return [
    "Saved souvenir",
    text(memory?.mark_label),
    text(memory?.title) || "trip",
    text(memory?.span_text),
  ].filter(Boolean).join(" ");
}

export function matchingPostcard(memories, query) {
  if (!CARDS.has(query?.card) || !positiveId(query?.trip)) return null;
  const found = savedMemories(memories).find((row) => Number(row.trip_id) === Number(query.trip));
  if (!found || cardKind(found) !== query.card) return null;
  return found;
}

export function matchingDestination(rows, query) {
  if (!positiveId(query?.trip)) return null;
  const place = placeKey(query?.place);
  return (
    (rows || []).find((row) => row.tripId === Number(query.trip) && (!place || row.label === place)) || null
  );
}

/** Postcard status and span come from the memory. They are not rewritten from the phase. */
export function postcardFacts(memory, trip) {
  const spanStart = hallDate(memory?.span_start);
  const spanEnd = hallDate(memory?.span_end);
  const agrees = !trip || (spanStart === hallDate(trip.start_date) && spanEnd === hallDate(trip.end_date));
  return {
    status: text(memory?.status),
    markLabel: text(memory?.mark_label),
    spanStart,
    spanEnd,
    spanText: text(memory?.span_text),
    agrees,
  };
}

/**
 * Planned and booked stay on the Travel lines. Posted is null while Finance is locked.
 * Nothing here adds planned to posted.
 */
export function roomStages(trip, lookup, links) {
  const lines = Array.isArray(trip?.budget?.lines) ? trip.budget.lines : [];
  const codes = [];
  for (const line of lines) {
    const code = text(line?.currency);
    if (code && !codes.includes(code)) codes.push(code);
  }
  const spend = spendState(lookup, trip?.id);
  return codes.map((currency) => reconcileStages(lines, spend, links, currency, trip.id));
}

/** Decorative only. The returned status and return date are copies, not writes. */
export function ferryRing(trip) {
  return {
    rung: true,
    decorative: true,
    completesTrip: false,
    ptoCharge: false,
    inventedReturn: false,
    status: text(trip?.status),
    end: hallDate(trip?.end_date),
  };
}

export function acceptRoomLoad({ epoch, currentEpoch, sessionActive }) {
  return sessionActive === true && epoch === currentEpoch;
}

/** A losing or failed response does not replace the current room. */
export function settleRoomLoad({ epoch, currentEpoch, sessionActive, ok }) {
  if (!acceptRoomLoad({ epoch, currentEpoch, sessionActive })) return "drop";
  return ok === true ? "apply" : "keep";
}

export function clearRoomDraft() {
  return { note: "", ferry: null };
}
