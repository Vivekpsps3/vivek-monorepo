/** Date-range model for the new-trip composer. Pointer, touch, and keyboard share it. */
import { weekStartsOn } from "../../../../packages/browser/runtime/week.mjs";

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const WEEKDAYS_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const WEEKDAYS_NARROW = ["S", "M", "T", "W", "T", "F", "S"];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function parseIso(value) {
  const [year, month, day] = String(value).split("-").map(Number);
  return new Date(year, month - 1, day);
}

export function toIso(date) {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

export function addDays(value, count) {
  const date = parseIso(value);
  date.setDate(date.getDate() + count);
  return toIso(date);
}

export function shiftMonthIso(value, delta) {
  const date = parseIso(value);
  const day = date.getDate();
  const next = new Date(date.getFullYear(), date.getMonth() + delta, 1);
  const last = new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate();
  next.setDate(Math.min(day, last));
  return toIso(next);
}

export function nightsBetween(start, end) {
  if (!start || !end) return 0;
  const ms = parseIso(end) - parseIso(start);
  return Math.max(0, Math.round(ms / 86400000));
}

export function shortRange(start, end) {
  const left = parseIso(start);
  const right = parseIso(end);
  const a = `${MONTHS_SHORT[left.getMonth()]} ${left.getDate()}`;
  const b = `${MONTHS_SHORT[right.getMonth()]} ${right.getDate()}`;
  if (start === end) return a;
  return `${a} – ${b}`;
}

export function summaryText(start, end) {
  if (!start) return "Pick the day you leave.";
  if (!end) return "Now pick the day you come back.";
  const nights = nightsBetween(start, end);
  if (nights === 0) return `${shortRange(start, end)} · same day`;
  const nightLabel = nights === 1 ? "1 night" : `${nights} nights`;
  return `${shortRange(start, end)} · ${nightLabel}`;
}

export function dayName(iso, { start = "", end = "", splits = [] } = {}) {
  const date = parseIso(iso);
  const text = `${WEEKDAYS[date.getDay()]}, ${MONTHS[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`;
  if (start && iso === start) return `${text}, start`;
  if (end && iso === end && splits.includes(iso)) return `${text}, change city, end`;
  if (end && iso === end) return `${text}, end`;
  if (splits.includes(iso)) return `${text}, change city`;
  if (start && end && iso > start && iso < end) return `${text}, in trip`;
  return text;
}

export function weekdayHeads(narrow = false) {
  const start = weekStartsOn();
  return Array.from({ length: 7 }, (_, index) => {
    const day = (start + index) % 7;
    return {
      title: WEEKDAYS[day],
      label: narrow ? WEEKDAYS_NARROW[day] : WEEKDAYS_SHORT[day],
    };
  });
}

export function blankRange(start = "") {
  return {
    anchor: start ? parseIso(start) : new Date(),
    start: start || "",
    end: "",
    awaitingEnd: Boolean(start),
    splits: [],
    cities: {},
    tripName: "",
    nameTouched: false,
    pto: true,
    pendingSpan: null,
  };
}

function clone(model) {
  return {
    ...model,
    splits: [...(model.splits || [])],
    cities: { ...(model.cities || {}) },
  };
}

function namedStops(model) {
  return segments(model)
    .map((part) => ({
      key: part.key,
      city: String(model.cities?.[part.key] || "").trim(),
      arrive: part.arrive,
      leave: part.leave,
    }))
    .filter((part) => part.city);
}

function applySpan(model, start, end) {
  const before = segments(model);
  const from = start <= end ? start : end;
  const to = start <= end ? end : start;
  const splits = (model.splits || []).filter((iso) => iso > from && iso <= to).sort();
  const draft = { ...clone(model), start: from, end: to, awaitingEnd: false, splits, pendingSpan: null };
  const after = segments(draft);
  const cities = {};
  const used = new Set();
  for (const part of after) {
    const exact = before.find((old) => old.key === part.key && !used.has(old.key));
    if (exact) {
      used.add(exact.key);
      cities[part.key] = model.cities?.[exact.key] || "";
      continue;
    }
    const overlap = before.find((old) => !used.has(old.key) && old.leave >= part.arrive && old.arrive <= part.leave);
    if (overlap) {
      used.add(overlap.key);
      cities[part.key] = model.cities?.[overlap.key] || "";
      continue;
    }
    const keyed = Object.keys(model.cities || {}).filter((key) => key >= part.arrive && key <= part.leave).sort();
    cities[part.key] = keyed.map((key) => String(model.cities[key] || "").trim()).find(Boolean) || "";
  }
  draft.cities = cities;
  return draft;
}

export function guardSpan(model, start, end) {
  if (!start || !end) {
    const named = namedStops(model);
    if (named.length && (!start || !end)) {
      return {
        ...model,
        pendingSpan: {
          start: start || "",
          end: end || "",
          dropped: named,
          clearEnd: Boolean(start && !end),
          clearStart: Boolean(end && !start),
        },
      };
    }
    return {
      ...clone(model),
      start: start || "",
      end: end || "",
      awaitingEnd: Boolean(start && !end),
      splits: start && !end ? [] : [...(model.splits || [])],
      pendingSpan: null,
    };
  }
  const from = start <= end ? start : end;
  const to = start <= end ? end : start;
  const dropped = namedStops(model).filter((part) => part.leave < from || part.arrive > to);
  if (dropped.length) return { ...model, pendingSpan: { start: from, end: to, dropped } };
  return applySpan(model, from, to);
}

export function confirmSpan(model) {
  const pending = model.pendingSpan;
  if (!pending) return model;
  if (pending.reset) {
    const next = blankRange(pending.start);
    next.anchor = model.anchor;
    next.pto = model.pto;
    next.tripName = model.nameTouched ? model.tripName : "";
    next.nameTouched = Boolean(model.nameTouched);
    return next;
  }
  if (!pending.end || !pending.start) {
    const dropped = new Set((pending.dropped || []).map((part) => part.key));
    const cities = {};
    for (const [key, value] of Object.entries(model.cities || {})) {
      if (!dropped.has(key)) cities[key] = value;
    }
    return {
      ...clone(model),
      start: pending.start || "",
      end: pending.end || "",
      awaitingEnd: Boolean(pending.start && !pending.end),
      splits: [],
      cities,
      pendingSpan: null,
    };
  }
  return applySpan(model, pending.start, pending.end);
}

export function pickDay(model, iso, { shift = false } = {}) {
  if (shift && model.start) {
    const start = iso < model.start ? iso : model.start;
    const end = iso < model.start ? (model.end || model.start) : iso;
    return guardSpan(model, start, end);
  }
  if (!model.start || !model.awaitingEnd) {
    const named = namedStops(model);
    if (named.length) return { ...model, pendingSpan: { start: iso, end: "", reset: true, dropped: named } };
    return { ...clone(model), start: iso, end: "", awaitingEnd: true, splits: [], pendingSpan: null };
  }
  if (iso < model.start) return guardSpan(model, iso, model.start);
  return guardSpan(model, model.start, iso);
}

export function dragRange(model, origin, iso) {
  if (!origin || !iso || origin === iso) return model;
  const start = origin < iso ? origin : iso;
  const end = origin < iso ? iso : origin;
  const next = guardSpan(model, start, end);
  if (next.pendingSpan) return model;
  return next;
}

export function clearRange(model) {
  return { ...model, start: "", end: "", awaitingEnd: false, splits: [], cities: {}, pendingSpan: null };
}

function citiesAfterAdd(before, after, cities, added) {
  const next = {};
  for (const part of after) next[part.key] = part.key === added ? "" : (cities[part.key] || "");
  if (before.length && after.length && !before.some((part) => part.key === after[0].key)) {
    next[after[0].key] = cities[before[0].key] || "";
  }
  return next;
}

/** `iso` is the first day at the next destination, not the last day of this one. */
export function changeCity(model, iso) {
  if (!model.start || !model.end || !iso) return model;
  if (iso <= model.start || iso > model.end) return model;
  if ((model.splits || []).includes(iso)) return model;
  const before = segments(model);
  const splits = [...(model.splits || []), iso].sort();
  const draft = { ...clone(model), splits, pendingSpan: null };
  draft.cities = citiesAfterAdd(before, segments(draft), model.cities || {}, iso);
  return draft;
}

export function moveChange(model, fromIso, toIso) {
  if (!(model.splits || []).includes(fromIso)) return model;
  if (!toIso || fromIso === toIso) return model;
  if (toIso <= model.start || toIso > model.end || model.splits.includes(toIso)) return model;
  const crossed = model.splits.some((iso) => iso !== fromIso && ((fromIso < iso && iso < toIso) || (toIso < iso && iso < fromIso)));
  if (crossed) return model;
  const before = segments(model);
  const splits = model.splits.map((iso) => (iso === fromIso ? toIso : iso)).sort();
  const draft = { ...clone(model), splits, pendingSpan: null };
  const cities = {};
  segments(draft).forEach((part, index) => {
    const old = before[index];
    cities[part.key] = old ? (model.cities?.[old.key] || "") : "";
  });
  draft.cities = cities;
  return draft;
}

export function removeChange(model, iso) {
  if (!(model.splits || []).includes(iso)) return model;
  const before = segments(model);
  const draft = { ...clone(model), splits: model.splits.filter((item) => item !== iso), pendingSpan: null };
  const cities = {};
  for (const part of segments(draft)) {
    const covered = before.filter((old) => old.arrive >= part.arrive && old.leave <= part.leave);
    const names = covered.map((old) => String(model.cities?.[old.key] || "").trim()).filter(Boolean);
    cities[part.key] = names[0] || "";
  }
  draft.cities = cities;
  return draft;
}

export function segments(model) {
  if (!model.start || !model.end) return [];
  const cuts = [model.start, ...model.splits.filter((split) => split > model.start && split <= model.end), addDays(model.end, 1)];
  const rows = [];
  for (let index = 0; index < cuts.length - 1; index += 1) {
    rows.push({ arrive: cuts[index], leave: addDays(cuts[index + 1], -1), key: cuts[index] });
  }
  return rows;
}

export function segmentDays(part) {
  const days = [];
  for (let cursor = part.arrive; cursor <= part.leave; cursor = addDays(cursor, 1)) days.push(cursor);
  return days;
}

export function moveFocus(iso, key, startOn = weekStartsOn()) {
  if (key === "ArrowLeft") return addDays(iso, -1);
  if (key === "ArrowRight") return addDays(iso, 1);
  if (key === "ArrowUp") return addDays(iso, -7);
  if (key === "ArrowDown") return addDays(iso, 7);
  if (key === "PageUp") return shiftMonthIso(iso, -1);
  if (key === "PageDown") return shiftMonthIso(iso, 1);
  if (key === "Home" || key === "End") {
    const date = parseIso(iso);
    const delta = (date.getDay() - startOn + 7) % 7;
    if (key === "Home") return addDays(iso, -delta);
    return addDays(iso, 6 - delta);
  }
  if (key === "Escape") return "";
  return iso;
}

export function monthCells(anchor, startOn = weekStartsOn()) {
  const year = anchor.getFullYear();
  const month = anchor.getMonth();
  const first = new Date(year, month, 1);
  const start = new Date(first);
  start.setDate(1 - ((first.getDay() - startOn + 7) % 7));
  const cells = [];
  for (let index = 0; index < 42; index += 1) {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    cells.push({ iso: toIso(date), day: date.getDate(), outside: date.getMonth() !== month });
  }
  return cells;
}

export function monthRows(anchor, startOn = weekStartsOn()) {
  const cells = monthCells(anchor, startOn);
  const rows = [];
  for (let index = 0; index < cells.length; index += 7) {
    const row = cells.slice(index, index + 7);
    if (row.some((cell) => !cell.outside)) rows.push(row);
  }
  return rows;
}

export function gridDay(cell, { focusIso, selected, label }) {
  if (cell.outside) return `<span class="composer-day is-out" aria-hidden="true">${cell.day}</span>`;
  const tab = cell.iso === focusIso ? "0" : "-1";
  return `<button type="button" role="gridcell" class="composer-day" data-day="${cell.iso}" tabindex="${tab}" aria-selected="${selected ? "true" : "false"}" aria-label="${label}">${cell.day}</button>`;
}

export function cityColor(index) {
  return `var(--city-${(index % 5) + 1})`;
}

function destinationTitle(names) {
  if (names.length <= 1) return names[0] || "";
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(", ")}, and ${names[names.length - 1]}`;
}

export function saveState(model) {
  const parts = segments(model).map((part) => ({
    ...part,
    city: String(model.cities?.[part.key] || "").trim(),
  }));
  const missing = parts.find((part) => !part.city);
  if (!model.start || !model.end) {
    return { ok: false, helper: "Pick the day you leave and the day you come back.", focus: "grid", field: "" };
  }
  if (missing) {
    return {
      ok: false,
      helper: "Name every destination.",
      focus: "city",
      field: "city",
      cityKey: missing.key,
      parts,
    };
  }
  const names = parts.map((part) => part.city).filter(Boolean);
  const title = String(model.tripName || "").trim() || destinationTitle(names) || "Trip";
  return { ok: true, helper: "", focus: "", field: "", title, city: names[0] || "", cityKey: "", parts };
}

export function defaultTripName(model) {
  if (model.nameTouched) return model.tripName;
  const names = segments(model).map((part) => String(model.cities?.[part.key] || "").trim()).filter(Boolean);
  return destinationTitle(names);
}
