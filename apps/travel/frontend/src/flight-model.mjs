/** Debounce so a flight number does not request on every keystroke. */
export const FLIGHT_LOOKUP_DELAY = 400;

export const SCHEDULE_FIELDS = [
  "carrier", "depart_place", "arrive_place", "depart_at", "arrive_at", "depart_tz", "arrive_tz",
];

export const PROVIDER_FIELDS = [
  "fa_ident", "fa_status", "fa_aircraft",
  "fa_gate_origin", "fa_gate_destination",
  "fa_terminal_origin", "fa_terminal_destination",
  "fa_baggage_claim",
  "fa_delay_departure_seconds", "fa_delay_arrival_seconds",
  "fa_scheduled_out", "fa_estimated_out", "fa_actual_out",
  "fa_scheduled_in", "fa_estimated_in", "fa_actual_in",
];

export const HIDDEN_FLIGHT_FIELDS = [...PROVIDER_FIELDS, "depart_tz", "arrive_tz"];


function text(value) {
  if (value == null) return "";
  return String(value);
}

function partsIn(iso, timeZone) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  const formatted = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZoneName: "shortOffset",
  }).formatToParts(date);
  const part = Object.fromEntries(formatted.map((item) => [item.type, item.value]));
  let hour = part.hour || "";
  if (hour === "24") hour = "00";
  if (!part.year || !part.month || !part.day || !hour || !part.minute) return null;
  const day = `${part.year}-${part.month}-${part.day}`;
  const time = `${hour}:${part.minute}`;
  return { day, time, stamp: `${day}T${time}`, offset: part.timeZoneName || "", zone: timeZone };
}

/** Airport-local clock. Scheduled display uses this; actual time is never substituted. */
export function localClock(iso, timeZone) {
  if (!iso) return null;
  const zone = timeZone || "UTC";
  try {
    return partsIn(iso, zone);
  } catch {
    if (zone === "UTC") return null;
    try {
      return partsIn(iso, "UTC");
    } catch {
      return null;
    }
  }
}

export function lookupQuery(ident, departOn) {
  const normalized = text(ident).toUpperCase().replace(/\s+/g, "");
  if (!/^[A-Z0-9]{2,12}$/.test(normalized)) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(departOn || "")) return null;
  return { ident: normalized, depart_on: departOn };
}

export function departureDay(flight) {
  const iso = flight?.scheduled_out || flight?.estimated_out || flight?.actual_out || "";
  return localClock(iso, flight?.origin_timezone || "")?.day || "";
}

function dayShift(from, to) {
  if (!from || !to) return 0;
  const [fromYear, fromMonth, fromDay] = from.split("-").map(Number);
  const [toYear, toMonth, toDay] = to.split("-").map(Number);
  return Math.round((Date.UTC(toYear, toMonth - 1, toDay) - Date.UTC(fromYear, fromMonth - 1, fromDay)) / 86400000);
}

export function arrivalNote(flight) {
  const depart = localClock(flight?.scheduled_out, flight?.origin_timezone)?.day;
  const arrive = localClock(flight?.scheduled_in, flight?.destination_timezone)?.day;
  const shift = dayShift(depart, arrive);
  if (shift > 1) return "Arrives a later local day";
  if (shift === 1) return "Arrives the next local day";
  if (shift < 0) return "Arrives on an earlier local date";
  return "";
}

export function previewModel(flight) {
  const departZone = flight?.origin_timezone || "";
  const arriveZone = flight?.destination_timezone || "";
  return {
    title: flight?.ident_iata || flight?.ident || "Flight",
    airline: flight?.operator_iata || flight?.operator || "",
    from: flight?.origin_iata || flight?.origin_icao || flight?.origin_city || "",
    to: flight?.destination_iata || flight?.destination_icao || flight?.destination_city || "",
    status: flight?.status || "",
    relation: arrivalNote(flight),
    scheduledOut: localClock(flight?.scheduled_out, departZone),
    scheduledIn: localClock(flight?.scheduled_in, arriveZone),
    estimatedOut: localClock(flight?.estimated_out, departZone),
    estimatedIn: localClock(flight?.estimated_in, arriveZone),
    actualOut: localClock(flight?.actual_out, departZone),
    actualIn: localClock(flight?.actual_in, arriveZone),
  };
}

export function scheduleValues(flight) {
  const view = previewModel(flight);
  return {
    carrier: view.airline,
    depart_place: view.from,
    arrive_place: view.to,
    depart_at: view.scheduledOut?.stamp || "",
    arrive_at: view.scheduledIn?.stamp || "",
    depart_tz: flight?.origin_timezone || "",
    arrive_tz: flight?.destination_timezone || "",
    fa_ident: text(flight?.ident),
    fa_status: text(flight?.status),
    fa_aircraft: text(flight?.aircraft_type),
    fa_gate_origin: text(flight?.gate_origin),
    fa_gate_destination: text(flight?.gate_destination),
    fa_terminal_origin: text(flight?.terminal_origin),
    fa_terminal_destination: text(flight?.terminal_destination),
    fa_baggage_claim: text(flight?.baggage_claim),
    fa_delay_departure_seconds: flight?.departure_delay_seconds == null ? "" : text(flight.departure_delay_seconds),
    fa_delay_arrival_seconds: flight?.arrival_delay_seconds == null ? "" : text(flight.arrival_delay_seconds),
    fa_scheduled_out: text(flight?.scheduled_out),
    fa_estimated_out: text(flight?.estimated_out),
    fa_actual_out: text(flight?.actual_out),
    fa_scheduled_in: text(flight?.scheduled_in),
    fa_estimated_in: text(flight?.estimated_in),
    fa_actual_in: text(flight?.actual_in),
  };
}

export function decideCandidates(flights, departOn) {
  const list = (Array.isArray(flights) ? flights : []).filter((flight) => flight && typeof flight === "object");
  const day = list.filter((flight) => departureDay(flight) === departOn);
  if (day.length === 1) return { kind: "preview", flight: day[0], flights: day, note: "" };
  if (day.length > 1) return { kind: "choose", flights: day, note: "" };
  if (list.length) {
    return { kind: "choose", flights: list, note: "None of these depart on that local date." };
  }
  return { kind: "none", flights: [], note: "" };
}

function copySchedule(current, flight, overrides, { force }) {
  const incoming = scheduleValues(flight);
  const locked = new Set(force ? [] : overrides);
  const values = { ...current };
  const filled = [];
  for (const key of SCHEDULE_FIELDS) {
    if (locked.has(key) || !incoming[key]) continue;
    values[key] = incoming[key];
    filled.push(key);
  }
  for (const key of PROVIDER_FIELDS) values[key] = incoming[key] || "";
  return { values, filled, overrides: force ? [] : [...locked] };
}

/** Fill unlocked fields from the scheduled local time, not the actual time. */
export function fillPreview(current, flight, overrides) {
  return copySchedule(current, flight, overrides, { force: false });
}

/** Apply the preview and clear manual locks. */
export function useSchedule(current, flight) {
  return copySchedule(current, flight, [], { force: true });
}

/** Lock every schedule field and leave whatever was typed. */
export function editManually(current) {
  return { values: { ...current }, overrides: [...SCHEDULE_FIELDS], filled: [] };
}

export function typeField(current, overrides, name, value) {
  const values = { ...current, [name]: value };
  if (!SCHEDULE_FIELDS.includes(name) || overrides.includes(name)) {
    return { values, overrides: [...overrides] };
  }
  return { values, overrides: [...overrides, name] };
}

export function invalidateCandidate(values, filled, overrides) {
  const locked = new Set(overrides);
  const next = { ...values };
  for (const key of filled) {
    if (!locked.has(key)) next[key] = "";
  }
  for (const key of PROVIDER_FIELDS) next[key] = "";
  if (!locked.has("depart_tz")) next.depart_tz = "";
  if (!locked.has("arrive_tz")) next.arrive_tz = "";
  return next;
}

export function overridesFromSaved(item) {
  if (!item) return [];
  const hasProvider = Boolean(item.fa_ident || item.fa_scheduled_out || item.fa_scheduled_in);
  if (!hasProvider) return SCHEDULE_FIELDS.filter((key) => text(item[key]));
  const depart = text(item.depart_at).slice(0, 16);
  const arrive = text(item.arrive_at).slice(0, 16);
  const scheduledDepart = localClock(item.fa_scheduled_out, item.depart_tz)?.stamp || "";
  const scheduledArrive = localClock(item.fa_scheduled_in, item.arrive_tz)?.stamp || "";
  const departDiffers = Boolean(depart) && depart !== scheduledDepart;
  const arriveDiffers = Boolean(arrive) && arrive !== scheduledArrive;
  if (departDiffers || arriveDiffers) return [...SCHEDULE_FIELDS];
  return [];
}

export function savedProvenance(item) {
  if (!item || (!item.fa_ident && !item.fa_scheduled_out && !item.fa_scheduled_in)) return "";
  return overridesFromSaved(item).length ? "Edited by you" : "FlightAware schedule";
}

export function flightProblem(error) {
  const body = error?.error && typeof error.error === "object" ? error.error : null;
  const status = Number(error?.status || body?.status) || 0;
  const code = text(body?.code || error?.code);
  const name = text(error?.name);
  if (name === "TimeoutError" || code === "provider_timeout") {
    return { kind: "timeout", message: "FlightAware took too long. Type the times yourself." };
  }
  if (code === "schedule_unavailable") {
    return {
      kind: "future",
      message: "FlightAware only returns flights from 10 days ago through 2 days ahead. Type the times yourself.",
    };
  }
  if (code === "provider_unconfigured") {
    return {
      kind: "missing_key",
      message: "Add a FlightAware AeroAPI key in Settings. You can still type the flight yourself.",
    };
  }
  if (code === "provider_auth") {
    return { kind: "bad_key", message: "FlightAware rejected the API key. You can still type the flight yourself." };
  }
  if (code === "provider_throttled" || status === 429) {
    return { kind: "throttled", message: "FlightAware rate limit reached. Try again shortly." };
  }
  if (status === 401) {
    return { kind: "signed_out", message: "Sign in again to look up flights. You can still type this one." };
  }
  if (!status) {
    return { kind: "network", message: "Can't reach Travel. You can still type the flight yourself." };
  }
  if (status === 422 || code === "invalid") {
    return { kind: "invalid", message: text(body?.message || error?.message) || "Enter a flight number such as UA 837." };
  }
  return { kind: "unavailable", message: "FlightAware could not look up that flight. You can still type it yourself." };
}
