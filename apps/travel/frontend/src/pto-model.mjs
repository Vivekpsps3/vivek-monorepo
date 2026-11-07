/** Hours, days, and leave-form checks. The page only wires these. */

import { formatDate } from "../../../../packages/browser/runtime/date.mjs";

export const MINUS = "\u2212";
export const DOT = "\u00b7";

export const START_COPY =
  "Starting balance has to be between \u22128784 and 8784 hours.";
export const ACCRUAL_COPY = "Accrual has to be between 0 and 8784 hours.";
export const CADENCE_COPY = "Pick how often you earn time off.";
export const CAP_COPY =
  "Cap has to be more than 0 and up to 8784 hours, or blank.";
export const YEAR_COPY = "Pick a valid date.";
export const HPD_COPY =
  "Hours in a workday has to be more than 0 and up to 24, with at most 2 decimals.";
export const NAME_COPY = "Name this time off.";
export const RANGE_COPY = "The last day has to be on or after the first day.";
export const SICK_HINT = "Set up Sick to track this balance.";
export const POLICY_SAVED = { pto: "PTO policy saved.", sick: "Sick policy saved." };
export const POLICY_FAILED = {
  pto: "Couldn't save your PTO policy.",
  sick: "Couldn't save your Sick policy.",
};
export const ENTRY_FAILED = "Couldn't add this time off.";
export const DISMISS_FAILED = "Couldn't save that. Retry";
export const EMPTY_TITLE = "Set up PTO";
export const EMPTY_MESSAGE =
  "Tell Travel your balance and how fast you earn time off, and it will project what's left after each trip.";
export const LOAD_ERROR = "Couldn't load PTO";
export const PAGE_TITLE = "PTO";
export const PAGE_LEDE = "Your time off today and what's left after each trip.";
export const FIRST_RUN_TITLE = "Track sick time too";
export const FIRST_RUN_BODY = "Add your sick balance to see it next to PTO.";
export const SICK_UNSET = "Sick: not set up \u00b7 Set up";
export const CAP_BLURB = "Leave blank for no cap";

export const CADENCES = [
  { value: "weekly", label: "Wk", period: "week" },
  { value: "biweekly", label: "2 wk", period: "two weeks" },
  { value: "semimonthly", label: "Twice a month", period: "half-month" },
  { value: "monthly", label: "Mo", period: "month" },
  { value: "yearly", label: "Yr", period: "year" },
];

export const MONTHS = [
  ["01", "Jan"],
  ["02", "Feb"],
  ["03", "Mar"],
  ["04", "Apr"],
  ["05", "May"],
  ["06", "Jun"],
  ["07", "Jul"],
  ["08", "Aug"],
  ["09", "Sep"],
  ["10", "Oct"],
  ["11", "Nov"],
  ["12", "Dec"],
];

const HOUR_FIELDS = ["start_balance_hours", "accrual_hours", "cap_hours"];
const FIELD_ORDER = [
  "start_balance_hours",
  "balance_as_of",
  "accrual_hours",
  "accrual_cadence",
  "cap_hours",
  "year_start",
];

export function periodWord(cadence) {
  return CADENCES.find((item) => item.value === cadence)?.period || "period";
}

export function addDays(iso, count) {
  const [year, month, day] = String(iso).split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + count);
  return date.toISOString().slice(0, 10);
}

export function longDate(iso) {
  return formatDate(iso, "range");
}

export function asOfCopy(today) {
  return `Pick a date from Jan 1, 2000 to ${longDate(addDays(today, 366))}.`;
}

/** Blank, a finite number, or unusable text. A single comma is a decimal point. */
export function parseHours(raw) {
  if (typeof raw === "number") {
    if (!Number.isFinite(raw)) return { ok: false };
    return { ok: true, value: raw, text: trimNumber(raw), places: placesOf(trimNumber(raw)) };
  }
  const text = String(raw ?? "")
    .trim()
    .replaceAll(MINUS, "-")
    .replaceAll("\u2013", "-");
  if (!text) return { ok: true, blank: true, text: "" };
  if ((text.match(/,/g) || []).length > 1 || (text.includes(",") && text.includes("."))) {
    return { ok: false };
  }
  const normalized = text.replace(",", ".");
  if (!/^-?\d+(\.\d+)?$/.test(normalized)) return { ok: false };
  const value = Number(normalized);
  if (!Number.isFinite(value)) return { ok: false };
  return { ok: true, value, text: normalized, places: placesOf(normalized) };
}

function placesOf(text) {
  return ((String(text).split(".")[1] || "").replace(/0+$/, "")).length;
}

export function roundHalfUp(value, places) {
  const sign = value < 0 ? -1 : 1;
  const factor = 10 ** places;
  const scaled = Math.abs(value) * factor;
  return (sign * Math.floor(scaled + 0.5 + 1e-8)) / factor;
}

/** Quarter-hour ties move away from zero. */
export function roundQuarter(value) {
  const sign = value < 0 ? -1 : 1;
  const steps = Math.abs(value) / 0.25;
  return sign * Math.floor(steps + 0.5 + 1e-8) * 0.25;
}

export function trimNumber(value) {
  if (!Number.isFinite(value) || Object.is(value, -0) || value === 0) return "0";
  const rounded = roundHalfUp(value, 6);
  let text = rounded.toFixed(6).replace(/0+$/, "").replace(/\.$/, "");
  if (text === "-0") text = "0";
  if (text.startsWith("-")) return MINUS + text.slice(1);
  return text;
}

export function formatBalance(hours, hoursPerDay) {
  const days = roundHalfUp(Number(hours) / Number(hoursPerDay), 2);
  const dayText = trimNumber(days).replace(MINUS, "");
  const signedDays = days < 0 && dayText !== "0" ? MINUS + dayText : trimNumber(days);
  return `${signedDays} days ${DOT} ${trimNumber(Number(hours))} h`;
}

export function daysHelper(hours, hoursPerDay) {
  const parsed = typeof hours === "number" ? { ok: true, value: hours } : parseHours(hours);
  const hpd = Number(hoursPerDay);
  if (!parsed.ok || parsed.blank || !hpd) return "";
  const days = trimNumber(roundHalfUp(parsed.value / hpd, 2));
  return `= ${days} days`;
}

export function softStart(hours, hoursPerDay) {
  const parsed = typeof hours === "number" ? { ok: true, value: hours } : parseHours(hours);
  const hpd = Number(hoursPerDay);
  if (!parsed.ok || parsed.blank || !hpd || Math.abs(parsed.value) <= 2000) return "";
  const days = trimNumber(roundHalfUp(parsed.value / hpd, 2));
  return `That's ${days} days. Double-check the hours.`;
}

export function softAccrual(hours, cadence) {
  const parsed = typeof hours === "number" ? { ok: true, value: hours } : parseHours(hours);
  if (!parsed.ok || parsed.blank || parsed.value <= 400) return "";
  return `That's a lot per ${periodWord(cadence)}. Double-check.`;
}

export function roundingNote(before, after) {
  if (!Number.isFinite(before) || !Number.isFinite(after) || before === after) return "";
  return `Rounded to ${trimNumber(after)} h.`;
}

export function fieldHint(field, raw, hoursPerDay, cadence, note) {
  if (note) return note;
  if (field === "start_balance_hours") return softStart(raw, hoursPerDay) || daysHelper(raw, hoursPerDay);
  if (field === "accrual_hours") return softAccrual(raw, cadence) || daysHelper(raw, hoursPerDay);
  if (field === "cap_hours") return daysHelper(raw, hoursPerDay);
  return "";
}

export function capLine(capHours) {
  const parsed = parseHours(capHours);
  if (!parsed.ok || parsed.blank) return "";
  return `At the ${trimNumber(parsed.value)} h cap. You stop earning until you use some.`;
}

function sameStored(raw, stored) {
  if (stored == null || stored === "") return false;
  const left = String(raw ?? "").trim().replaceAll(MINUS, "-");
  const right = String(stored).trim().replaceAll(MINUS, "-");
  if (left === right) return true;
  const a = parseHours(left);
  const b = parseHours(right);
  return Boolean(a.ok && !a.blank && b.ok && !b.blank && a.value === b.value);
}

export function yearStartOk(month, day) {
  const mm = String(month || "").padStart(2, "0");
  const dd = String(day || "").padStart(2, "0");
  if (!/^\d{2}$/.test(mm) || !/^\d{2}$/.test(dd)) return false;
  if (mm === "02" && dd === "29") return false;
  const date = new Date(Date.UTC(2023, Number(mm) - 1, Number(dd)));
  return date.getUTCFullYear() === 2023 && date.getUTCMonth() === Number(mm) - 1 && date.getUTCDate() === Number(dd);
}

export function yearStartText(month, day) {
  return `${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/**
 * Client hard limits. `stored` values pass untouched. `edited` is ignored:
 * equality with the stored text is what grandfathers a value.
 */
export function policyErrors(draft, stored, today) {
  const errors = {};
  const kept = stored || {};
  const start = parseHours(draft.start_balance_hours);
  if (
    !sameStored(draft.start_balance_hours, kept.start_balance_hours) &&
    (!start.ok || start.blank || start.places > 6 || start.value < -8784 || start.value > 8784)
  ) {
    errors.start_balance_hours = START_COPY;
  }
  const asOf = String(draft.balance_as_of || "");
  const limit = addDays(today, 366);
  if (
    asOf !== String(kept.balance_as_of || "") &&
    (!/^\d{4}-\d{2}-\d{2}$/.test(asOf) || asOf < "2000-01-01" || asOf > limit)
  ) {
    errors.balance_as_of = asOfCopy(today);
  }
  const accrual = parseHours(draft.accrual_hours);
  if (
    !sameStored(draft.accrual_hours, kept.accrual_hours) &&
    (!accrual.ok || accrual.blank || accrual.places > 6 || accrual.value < 0 || accrual.value > 8784)
  ) {
    errors.accrual_hours = ACCRUAL_COPY;
  }
  const cadence = draft.accrual_cadence;
  if (!CADENCES.some((item) => item.value === cadence) && cadence !== kept.accrual_cadence) {
    errors.accrual_cadence = CADENCE_COPY;
  }
  const capRaw = draft.cap_hours;
  if (!(capRaw == null || String(capRaw).trim() === "")) {
    const cap = parseHours(capRaw);
    if (
      !sameStored(capRaw, kept.cap_hours) &&
      (!cap.ok || cap.blank || cap.places > 6 || cap.value <= 0 || cap.value > 8784)
    ) {
      errors.cap_hours = CAP_COPY;
    }
  }
  const year = yearStartText(draft.year_month, draft.year_day);
  if (year !== String(kept.year_start || "") && !yearStartOk(draft.year_month, draft.year_day)) {
    errors.year_start = YEAR_COPY;
  }
  return errors;
}

export function firstInvalid(errors) {
  return FIELD_ORDER.find((field) => errors[field]) || "";
}

export function hoursPerDayError(raw, stored) {
  if (sameStored(raw, stored)) return "";
  const parsed = parseHours(raw);
  if (!parsed.ok || parsed.blank || parsed.places > 2 || parsed.value <= 0 || parsed.value > 24) return HPD_COPY;
  return "";
}

export function entryErrors(entry) {
  const errors = {};
  if (!String(entry.label || "").trim()) errors.label = NAME_COPY;
  if (entry.start_date && entry.end_date && entry.end_date < entry.start_date) errors.end_date = RANGE_COPY;
  return errors;
}

export function previewKey(input) {
  return JSON.stringify({
    start: input.start_date || "",
    end: input.end_date || "",
    days: input.days == null || input.days === "" ? null : String(input.days),
    bucket: input.bucket || "pto",
  });
}

export function blurHours(raw) {
  const parsed = parseHours(raw);
  if (!parsed.ok || parsed.blank) return { text: String(raw ?? ""), note: "" };
  const next = roundQuarter(parsed.value);
  return { text: trimNumber(next).replaceAll(MINUS, "-"), note: roundingNote(parsed.value, next) };
}

export function policyBody(draft) {
  const cap = parseHours(draft.cap_hours);
  return {
    start_balance_hours: String(draft.start_balance_hours ?? "").trim().replaceAll(MINUS, "-"),
    balance_as_of: draft.balance_as_of,
    accrual_hours: String(draft.accrual_hours ?? "").trim().replaceAll(MINUS, "-"),
    accrual_cadence: draft.accrual_cadence,
    cap_hours: !cap.ok || cap.blank ? null : String(draft.cap_hours).trim().replaceAll(MINUS, "-"),
    year_start: yearStartText(draft.year_month, draft.year_day),
  };
}

export function bucketLabel(bucket) {
  return bucket === "sick" ? "Sick" : "PTO";
}

export function chipText(entry) {
  if (entry.trip_id) return `PTO ${DOT} Trip`;
  return entry.bucket === "sick" ? "Sick" : "PTO";
}

export { HOUR_FIELDS };
