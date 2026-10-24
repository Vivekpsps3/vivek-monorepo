/** Date-range model for the new-trip composer. Pointer, touch, and keyboard share it. */
import { DECISIONS } from "./decisions.mjs";
import { weekStartsOn } from "../../shared-browser/week.mjs";

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
  const nightLabel = nights === 1 ? "1 night" : `${nights} nights`;
  return `${shortRange(start, end)} · ${nightLabel}`;
}

export function dayName(iso, { start = "", end = "" } = {}) {
  const date = parseIso(iso);
  const text = `${WEEKDAYS[date.getDay()]}, ${MONTHS[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`;
  if (start && iso === start) return `${text}, start`;
  if (end && iso === end) return `${text}, end`;
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
  };
}

export function pickDay(model, iso, { shift = false } = {}) {
  const next = { ...model, splits: [...(model.splits || [])] };
  if (shift && model.start) {
    if (iso < model.start) {
      next.start = iso;
      next.end = model.end || model.start;
    } else {
      next.start = model.start;
      next.end = iso;
    }
    next.awaitingEnd = false;
    return next;
  }
  if (!model.start || !model.awaitingEnd) {
    return { ...next, start: iso, end: "", awaitingEnd: true, splits: [] };
  }
  if (iso < model.start) return { ...next, start: iso, end: model.start, awaitingEnd: false };
  return { ...next, end: iso, awaitingEnd: false };
}

export function dragRange(model, origin, iso) {
  const start = origin < iso ? origin : iso;
  const end = origin < iso ? iso : origin;
  return { ...model, start, end, awaitingEnd: false, splits: [] };
}

export function clearRange(model) {
  return { ...model, start: "", end: "", awaitingEnd: false, splits: [] };
}

export function toggleSplit(model, iso) {
  if (!model.start || !model.end || !iso) return model;
  if (iso <= model.start || iso > model.end) return model;
  const has = model.splits.includes(iso);
  const splits = has ? model.splits.filter((split) => split !== iso) : [...model.splits, iso].sort();
  return { ...model, splits };
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

export function gridDay(cell, { focusIso, selected, label }) {
  if (cell.outside) return `<span class="composer-day is-out" aria-hidden="true">${cell.day}</span>`;
  const tab = cell.iso === focusIso ? "0" : "-1";
  return `<button type="button" role="gridcell" class="composer-day" data-day="${cell.iso}" tabindex="${tab}" aria-selected="${selected ? "true" : "false"}" aria-label="${label}">${cell.day}</button>`;
}

export function cityColor(index) {
  return `var(--city-${(index % 5) + 1})`;
}

export function saveState(model) {
  const parts = segments(model);
  const first = parts[0];
  const city = first ? String(model.cities[first.key] || "").trim() : "";
  if (!model.start || !model.end) {
    return { ok: false, helper: "Pick the day you leave and the day you come back.", focus: "grid", field: "" };
  }
  if (DECISIONS.cityRequired && !city) {
    return { ok: false, helper: "Pick dates and name at least one city.", focus: "city", field: "city" };
  }
  const title = String(model.tripName || "").trim() || city || "Trip";
  return { ok: true, helper: "", focus: "", field: "", title, city, parts };
}

export function defaultTripName(model) {
  if (model.nameTouched) return model.tripName;
  const first = segments(model)[0];
  return first ? String(model.cities[first.key] || "") : "";
}
