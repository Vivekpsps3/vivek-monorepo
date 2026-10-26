import { api } from '../api.mjs';
import { escapeHtml as esc } from '../../../shared-browser/dom.mjs';

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

const pending = new WeakMap();

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
  const status = Number(error?.status) || 0;
  const code = text(error?.code);
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
    return { kind: "invalid", message: error?.message || "Enter a flight number such as UA 837." };
  }
  return { kind: "unavailable", message: "FlightAware could not look up that flight. You can still type it yourself." };
}

function clockText(label, clock) {
  if (!clock) return `${label} unavailable`;
  const offset = clock.offset ? ` ${clock.offset}` : "";
  const zone = clock.zone ? ` (${clock.zone})` : "";
  return `${label} ${clock.day} ${clock.time}${offset}${zone}`;
}

function choiceButton(flight, index) {
  const view = previewModel(flight);
  const when = view.scheduledOut
    ? `${view.scheduledOut.day} ${view.scheduledOut.time}${view.scheduledOut.offset ? ` ${view.scheduledOut.offset}` : ""}${view.scheduledOut.zone ? ` (${view.scheduledOut.zone})` : ""}`
    : "Scheduled departure unavailable";
  const bits = [view.airline, `${view.from} → ${view.to}`, when, view.relation, view.status].filter(Boolean);
  return `<button class="choice" type="button" data-action="choose-flight" data-index="${index}"><strong>${esc(view.title)}</strong><span>${esc(bits.join(" · "))}</span></button>`;
}

function previewBlock(flight, kept) {
  const view = previewModel(flight);
  const lines = [
    clockText("Scheduled departure", view.scheduledOut),
    clockText("Scheduled arrival", view.scheduledIn),
  ];
  if (view.estimatedOut) lines.push(clockText("Estimated departure", view.estimatedOut));
  if (view.estimatedIn) lines.push(clockText("Estimated arrival", view.estimatedIn));
  if (view.actualOut) lines.push(clockText("Actual departure", view.actualOut));
  if (view.actualIn) lines.push(clockText("Actual arrival", view.actualIn));
  if (view.relation) lines.push(view.relation);
  if (view.status) lines.push(view.status);
  const heading = [view.title, view.airline, view.from && view.to ? `${view.from} → ${view.to}` : view.from || view.to]
    .filter(Boolean)
    .join(" · ");
  const provenance = kept ? "Edited by you" : "FlightAware schedule";
  return `<div data-flight-status="preview"><p class="meta" data-flight-provenance>${esc(provenance)}</p><p>${esc(heading)}</p>${lines.map((line) => `<p class="meta">${esc(line)}</p>`).join("")}</div>`;
}

export function renderFlightState(model) {
  if (!model || model.kind === "idle") return "";
  if (model.kind === "loading") return `<p class="meta" data-flight-status="loading">Looking up the schedule…</p>`;
  if (model.kind === "problem") {
    return `<p class="meta" data-flight-status="${esc(model.problem.kind)}">${esc(model.problem.message)}</p>`;
  }
  if (model.kind === "none") {
    return `<p class="meta" data-flight-status="no_match">No flight matched that number on this date. Type the times yourself.</p>`;
  }
  if (model.kind === "need_choice") return `<p class="meta" data-flight-status="need_choice">Choose a flight first.</p>`;
  if (model.kind === "manual") {
    return `<p class="meta" data-flight-status="manual" data-flight-provenance>Edited by you. A lookup will not replace these times.</p>`;
  }
  if (model.kind === "choose") {
    const note = model.note ? `<p class="meta">${esc(model.note)}</p>` : "";
    const buttons = (model.flights || []).map((flight, index) => choiceButton(flight, index)).join("");
    return `<div data-flight-status="choose">${note}${buttons}</div>`;
  }
  if (model.kind === "preview") return previewBlock(model.flight, model.kept);
  return "";
}

export function readHiddenFlight(root) {
  const data = {};
  for (const name of HIDDEN_FLIGHT_FIELDS) {
    const element = root?.querySelector?.(`[name="${name}"]`);
    const raw = element ? element.value.trim() : "";
    if (name.endsWith("_seconds")) {
      if (!raw) {
        data[name] = null;
        continue;
      }
      const number = Number(raw);
      data[name] = Number.isFinite(number) ? number : null;
      continue;
    }
    data[name] = raw || null;
  }
  return data;
}

export function flightScope(node) {
  if (!node?.closest) return null;
  const leg = node.closest("[data-leg], [data-connection]");
  if (leg?.querySelector("[data-flight-only]")) return leg;
  const form = node.closest("form");
  if (form?.querySelector("[data-flight-only]")) return form;
  return null;
}

export function suggestFlightDate(input, iso) {
  if (!input || input.dataset?.edited) return false;
  if (!iso || input.value === iso) return false;
  input.value = iso;
  return true;
}

function slot(scope) {
  let row = pending.get(scope);
  if (!row) {
    row = { timer: 0, controller: null, generation: 0, flight: null, candidates: [], key: "" };
    pending.set(scope, row);
  }
  return row;
}

function inputValue(scope, name) {
  const element = scope.querySelector(`[name="${name}"]`);
  return element ? element.value.trim() : "";
}

function readValues(scope) {
  const values = {};
  for (const name of [...SCHEDULE_FIELDS, ...PROVIDER_FIELDS]) values[name] = inputValue(scope, name);
  return values;
}

function writeValues(scope, values, keys) {
  for (const name of keys) {
    const element = scope.querySelector(`[name="${name}"]`);
    if (!element || values[name] == null) continue;
    element.value = String(values[name]);
  }
}

function readOverrides(scope) {
  return inputValue(scope, "flight_overrides")
    .split(",")
    .map((part) => part.trim())
    .filter((name) => SCHEDULE_FIELDS.includes(name));
}

function writeOverrides(scope, overrides) {
  const element = scope.querySelector('[name="flight_overrides"]');
  if (element) element.value = SCHEDULE_FIELDS.filter((name) => overrides.includes(name)).join(",");
}

function readFilled(scope) {
  const element = scope.querySelector("[data-flight-filled]");
  return (element?.value || "")
    .split(",")
    .map((part) => part.trim())
    .filter((name) => SCHEDULE_FIELDS.includes(name));
}

function writeFilled(scope, filled) {
  const element = scope.querySelector("[data-flight-filled]");
  if (element) element.value = SCHEDULE_FIELDS.filter((name) => filled.includes(name)).join(",");
}

function paint(scope, model) {
  const box = scope.querySelector("[data-flight-preview]");
  if (box) box.innerHTML = renderFlightState(model);
}

function isFlightMode(scope) {
  const mode = scope.querySelector('[name="mode"]');
  return Boolean(mode && mode.value === "flight");
}

function applyFill(scope, flight) {
  const overrides = readOverrides(scope);
  const merged = fillPreview(readValues(scope), flight, overrides);
  writeValues(scope, merged.values, [...merged.filled, ...PROVIDER_FIELDS]);
  writeFilled(scope, merged.filled);
  writeOverrides(scope, merged.overrides);
  paint(scope, { kind: "preview", flight, kept: overrides.length > 0 });
}

function showDecision(scope, decision) {
  const row = slot(scope);
  row.candidates = decision.flights || [];
  if (decision.kind === "preview") {
    row.flight = decision.flight;
    applyFill(scope, decision.flight);
    return;
  }
  row.flight = null;
  if (decision.kind === "choose") {
    paint(scope, { kind: "choose", flights: decision.flights, note: decision.note });
    return;
  }
  paint(scope, { kind: "none" });
}

async function requestFlight(scope, query, generation) {
  const row = slot(scope);
  if (row.generation !== generation) return;
  const controller = new AbortController();
  row.controller = controller;
  paint(scope, { kind: "loading" });
  try {
    const result = await api("/api/flights/lookup", {
      method: "POST",
      body: JSON.stringify({ ident: query.ident, depart_on: query.depart_on }),
      signal: controller.signal,
    });
    if (slot(scope).generation !== generation) return;
    showDecision(scope, decideCandidates(result?.flights, query.depart_on));
  } catch (error) {
    if (error?.name === "AbortError") return;
    if (slot(scope).generation !== generation) return;
    const problem = flightProblem(error);
    if (problem) paint(scope, { kind: "problem", problem });
  }
}

export function queueFlightLookup(scope, immediate = false) {
  if (!scope || !isFlightMode(scope)) return;
  const row = slot(scope);
  const query = lookupQuery(inputValue(scope, "number"), inputValue(scope, "lookup_on"));
  const key = query ? `${query.ident}|${query.depart_on}` : "";
  if (key !== row.key) {
    const overrides = readOverrides(scope);
    const filled = readFilled(scope);
    const cleared = invalidateCandidate(readValues(scope), filled, overrides);
    writeValues(scope, cleared, [...new Set([...filled, ...PROVIDER_FIELDS, "depart_tz", "arrive_tz"])]);
    writeFilled(scope, []);
    row.flight = null;
    row.candidates = [];
    row.key = key;
    paint(scope, { kind: "idle" });
  } else if (!immediate && row.flight) {
    return;
  }
  row.generation += 1;
  const generation = row.generation;
  if (row.timer) clearTimeout(row.timer);
  row.timer = 0;
  row.controller?.abort();
  row.controller = null;
  if (!query) return;
  const run = () => {
    row.timer = 0;
    requestFlight(scope, query, generation);
  };
  if (immediate) run();
  else row.timer = setTimeout(run, FLIGHT_LOOKUP_DELAY);
}

export function cancelFlightLookup(scope) {
  const row = pending.get(scope);
  if (!row) return;
  if (row.timer) clearTimeout(row.timer);
  row.timer = 0;
  row.controller?.abort();
  row.controller = null;
  row.generation += 1;
}

export function chooseFlight(scope, index) {
  const flight = slot(scope).candidates[Number(index)];
  if (!flight) return;
  slot(scope).flight = flight;
  applyFill(scope, flight);
}

export function useFlightSchedule(scope) {
  const row = slot(scope);
  if (!row.flight) {
    paint(scope, { kind: "need_choice" });
    return;
  }
  const used = useSchedule(readValues(scope), row.flight);
  writeValues(scope, used.values, [...SCHEDULE_FIELDS, ...PROVIDER_FIELDS]);
  writeOverrides(scope, []);
  writeFilled(scope, used.filled);
  paint(scope, { kind: "preview", flight: row.flight, kept: false });
}

export function editFlightManually(scope) {
  const manual = editManually(readValues(scope));
  writeOverrides(scope, manual.overrides);
  writeFilled(scope, []);
  const row = slot(scope);
  if (row.flight) paint(scope, { kind: "preview", flight: row.flight, kept: true });
  else paint(scope, { kind: "manual" });
  scope.querySelector('[name="depart_at"]')?.focus?.();
}

export function noteTypedFlight(scope, name) {
  if (!SCHEDULE_FIELDS.includes(name)) return;
  const overrides = readOverrides(scope);
  if (!overrides.includes(name)) writeOverrides(scope, [...overrides, name]);
  writeFilled(scope, readFilled(scope).filter((key) => key !== name));
}
