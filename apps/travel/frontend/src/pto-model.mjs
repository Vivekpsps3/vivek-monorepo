/** Hours, days, and leave-form checks. The page only wires these. */

import { formatDate, parseDateOnly } from "../../../../packages/browser/runtime/date.mjs";

export const MINUS = "\u2212";
export const DOT = "\u00b7";

export const START_COPY =
  "Starting balance has to be between \u22128784 and 8784 hours.";
export const ACCRUAL_COPY = "Accrual has to be between 0 and 8784 hours.";
export const CADENCE_COPY = "Pick how often you earn time off.";
export const CAP_COPY =
  "Cap has to be more than 0 and up to 8784 hours, or blank.";
export const YEAR_COPY = "Pick a valid date.";
export const CARRY_COPY = "Choose whether unused hours carry into the next policy year.";
export const MODE_COPY = "Pick daily accrual or a posting schedule.";
export const ANCHOR_COPY = "Pick the first posting date.";
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

export const ACCRUAL_MODES = [
  { value: "daily", label: "Each day" },
  { value: "scheduled", label: "On a schedule" },
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
  "accrual_mode",
  "accrual_anchor",
  "cap_hours",
  "year_start",
  "carry_forward",
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

function cleanHourText(raw) {
  return String(raw ?? "")
    .trim()
    .replaceAll(MINUS, "-")
    .replaceAll("\u2013", "-");
}

function canonicalFrom(sign, whole, frac) {
  const body = frac ? `${whole}.${frac}` : `${whole}`;
  if (body === "0") return "0";
  return sign < 0 ? `-${body}` : body;
}

function scaled(whole, frac, scale) {
  return BigInt(whole) * 10n ** BigInt(scale) + BigInt((frac || "").padEnd(scale, "0") || "0");
}

function compareAbs(aWhole, aFrac, bWhole, bFrac) {
  const scale = Math.max(aFrac.length, bFrac.length);
  const left = scaled(aWhole, aFrac, scale);
  const right = scaled(bWhole, bFrac, scale);
  return left > right ? 1 : left < right ? -1 : 0;
}

function isZero(parsed) {
  return parsed.whole === "0" && parsed.frac === "";
}

/** Blank, a finite decimal, or unusable text. A single comma is a decimal point. */
export function parseHours(raw) {
  if (typeof raw === "number") {
    if (!Number.isFinite(raw)) return { ok: false };
    return parseHours(trimNumber(raw));
  }
  const text = cleanHourText(raw);
  if (!text) return { ok: true, blank: true, text: "" };
  if ((text.match(/,/g) || []).length > 1 || (text.includes(",") && text.includes("."))) {
    return { ok: false };
  }
  const match = /^([+-]?)(\d+)(?:\.(\d+))?$/.exec(text.replace(",", "."));
  if (!match) return { ok: false };
  const sign = match[1] === "-" ? -1 : 1;
  const whole = match[2].replace(/^0+(?=\d)/, "") || "0";
  const frac = (match[3] || "").replace(/0+$/, "");
  return { ok: true, sign, whole, frac, places: frac.length, text: canonicalFrom(sign, whole, frac) };
}

function cmpParsed(parsed, limitText) {
  const limit = parseHours(limitText);
  if (parsed.sign !== limit.sign) return parsed.sign < limit.sign ? -1 : 1;
  const abs = compareAbs(parsed.whole, parsed.frac, limit.whole, limit.frac);
  return parsed.sign < 0 ? -abs : abs;
}

function spoken(text) {
  return text.startsWith("-") ? MINUS + text.slice(1) : text;
}

function divideRound(numer, denom, places) {
  if (isZero(denom)) return "";
  const scale = 10n ** BigInt(places);
  const nScale = numer.frac.length;
  const dScale = denom.frac.length;
  const numerator = scaled(numer.whole, numer.frac, nScale) * 10n ** BigInt(dScale) * scale;
  const denominator = scaled(denom.whole, denom.frac, dScale) * 10n ** BigInt(nScale);
  const rounded = (numerator + denominator / 2n) / denominator;
  const whole = rounded / scale;
  const frac = (rounded % scale).toString().padStart(places, "0").replace(/0+$/, "");
  const sign = numer.sign * denom.sign;
  return canonicalFrom(sign < 0 ? -1 : 1, whole.toString(), frac);
}

function signedDays(hours, hoursPerDay) {
  const parsed = parseHours(hours);
  const hpd = parseHours(hoursPerDay);
  if (!parsed.ok || parsed.blank || !hpd.ok || hpd.blank || isZero(hpd)) return "";
  return spoken(divideRound(parsed, hpd, 2));
}

const QUARTER_FRAC = ["", "25", "5", "75"];

function quarterText(parsed) {
  const scale = parsed.frac.length;
  const ten = 10n ** BigInt(scale);
  const rounded = (scaled(parsed.whole, parsed.frac, scale) * 4n + ten / 2n) / ten;
  return canonicalFrom(parsed.sign, (rounded / 4n).toString(), QUARTER_FRAC[Number(rounded % 4n)]);
}

export function roundHalfUp(value, places) {
  const sign = value < 0 ? -1 : 1;
  const factor = 10 ** places;
  const scaled = Math.abs(value) * factor;
  return (sign * Math.floor(scaled + 0.5 + 1e-8)) / factor;
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
  const parsed = parseHours(hours);
  const hourText = parsed.ok && !parsed.blank ? spoken(parsed.text) : trimNumber(Number(hours));
  return `${signedDays(hours, hoursPerDay)} days ${DOT} ${hourText} h`;
}

export function daysHelper(hours, hoursPerDay) {
  const days = signedDays(hours, hoursPerDay);
  return days ? `= ${days} days` : "";
}

export function softStart(hours, hoursPerDay) {
  const parsed = parseHours(hours);
  const hpd = parseHours(hoursPerDay);
  if (!parsed.ok || parsed.blank || !hpd.ok || hpd.blank || isZero(hpd)) return "";
  if (compareAbs(parsed.whole, parsed.frac, "2000", "") <= 0) return "";
  return `That's ${signedDays(hours, hoursPerDay)} days. Double-check the hours.`;
}

export function softAccrual(hours, cadence) {
  const parsed = parseHours(hours);
  if (!parsed.ok || parsed.blank || parsed.sign < 0) return "";
  if (compareAbs(parsed.whole, parsed.frac, "400", "") <= 0) return "";
  return `That's a lot per ${periodWord(cadence)}. Double-check.`;
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
  return `At the ${spoken(parsed.text)} h cap. You stop earning until you use some.`;
}

function sameStored(raw, stored) {
  if (stored == null || stored === "") return false;
  const left = cleanHourText(raw);
  const right = cleanHourText(stored);
  if (left === right) return true;
  const a = parseHours(left);
  const b = parseHours(right);
  return Boolean(a.ok && !a.blank && b.ok && !b.blank && a.text === b.text);
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

function anchorOk(text) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text) || text < "2000-01-01" || text > "2100-12-31") return false;
  const [year, month, day] = text.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
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
    (!start.ok || start.blank || start.places > 6 || cmpParsed(start, "-8784") < 0 || cmpParsed(start, "8784") > 0)
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
    (!accrual.ok || accrual.blank || accrual.places > 6 || cmpParsed(accrual, "0") < 0 || cmpParsed(accrual, "8784") > 0)
  ) {
    errors.accrual_hours = ACCRUAL_COPY;
  }
  const cadence = draft.accrual_cadence;
  if (!CADENCES.some((item) => item.value === cadence) && cadence !== kept.accrual_cadence) {
    errors.accrual_cadence = CADENCE_COPY;
  }
  const mode = draft.accrual_mode == null || draft.accrual_mode === "" ? "daily" : draft.accrual_mode;
  if (mode !== "daily" && mode !== "scheduled" && mode !== kept.accrual_mode) {
    errors.accrual_mode = MODE_COPY;
  }
  if (mode === "scheduled") {
    const anchor = String(draft.accrual_anchor || "");
    const keptAnchor = String(kept.accrual_anchor || "");
    const unchanged = anchor !== "" && anchor === keptAnchor;
    if (!unchanged && !anchorOk(anchor)) errors.accrual_anchor = ANCHOR_COPY;
  }
  const capRaw = draft.cap_hours;
  if (!(capRaw == null || String(capRaw).trim() === "")) {
    const cap = parseHours(capRaw);
    if (
      !sameStored(capRaw, kept.cap_hours) &&
      (!cap.ok || cap.blank || cap.places > 6 || cmpParsed(cap, "0") <= 0 || cmpParsed(cap, "8784") > 0)
    ) {
      errors.cap_hours = CAP_COPY;
    }
  }
  const year = yearStartText(draft.year_month, draft.year_day);
  if (year !== String(kept.year_start || "") && !yearStartOk(draft.year_month, draft.year_day)) {
    errors.year_start = YEAR_COPY;
  }
  if (draft.carry_forward != null && typeof draft.carry_forward !== "boolean") {
    errors.carry_forward = CARRY_COPY;
  }
  return errors;
}

export function firstInvalid(errors) {
  return FIELD_ORDER.find((field) => errors[field]) || "";
}

export function hoursPerDayError(raw, stored) {
  if (sameStored(raw, stored)) return "";
  const parsed = parseHours(raw);
  if (!parsed.ok || parsed.blank || parsed.places > 2 || cmpParsed(parsed, "0") <= 0 || cmpParsed(parsed, "24") > 0) {
    return HPD_COPY;
  }
  return "";
}

export function entryErrors(entry) {
  const errors = {};
  if (!String(entry.label || "").trim()) errors.label = NAME_COPY;
  if (entry.start_date && entry.end_date && entry.end_date < entry.start_date) errors.end_date = RANGE_COPY;
  return errors;
}

export function dateErrors(entry) {
  const errors = {};
  if (!entry.start_date) errors.start_date = RANGE_COPY;
  if (!entry.end_date || entry.end_date < entry.start_date) errors.end_date = RANGE_COPY;
  return errors;
}

export function fieldErrorMap(body) {
  const fields = body && typeof body === "object" ? body.field_errors : undefined;
  if (!fields || typeof fields !== "object" || Array.isArray(fields)) return null;
  const mapped = {};
  for (const [key, value] of Object.entries(fields)) {
    if (typeof value === "string") mapped[key] = value;
  }
  return mapped;
}

export function previewKey(input) {
  const source = input || {};
  return JSON.stringify({
    start: source.start_date || "",
    end: source.end_date || "",
    days: source.days == null || source.days === "" ? null : String(source.days),
    bucket: source.bucket || "pto",
    hours_per_day: source.hours_per_day == null ? "" : String(source.hours_per_day),
    policy: source.policy ?? null,
    entries: source.entries ?? null,
  });
}

export function blurHours(raw) {
  const parsed = parseHours(raw);
  if (!parsed.ok || parsed.blank) return { text: cleanHourText(raw), note: "" };
  const next = quarterText(parsed);
  return { text: next, note: next === parsed.text ? "" : `Rounded to ${spoken(next)} h.` };
}

/** Quarter-round an edited hour. An equal stored value is returned unchanged. */
export function commitHour(raw, stored, edited) {
  const text = cleanHourText(raw);
  if (stored != null && stored !== "" && sameStored(text, stored)) {
    return { text: cleanHourText(stored), note: "" };
  }
  if (!edited) return { text, note: "" };
  return blurHours(text);
}

/** Hours in a workday keep their decimals. Only an edited value is canonicalized. */
export function blurHoursPerDay(raw, stored) {
  if (sameStored(raw, stored)) return { text: cleanHourText(stored), error: "" };
  const parsed = parseHours(raw);
  const text = parsed.ok && !parsed.blank ? parsed.text : cleanHourText(raw);
  return { text, error: hoursPerDayError(raw, stored) };
}

function submittedHour(raw, stored, edited) {
  const next = commitHour(raw, stored, edited);
  return next.text;
}

export function policyBody(draft, stored, edited) {
  const kept = stored || {};
  const touched = edited && typeof edited.has === "function" ? edited : new Set(edited || []);
  const cap = submittedHour(draft.cap_hours, kept.cap_hours, touched.has("cap_hours"));
  return {
    start_balance_hours: submittedHour(draft.start_balance_hours, kept.start_balance_hours, touched.has("start_balance_hours")),
    balance_as_of: draft.balance_as_of,
    accrual_hours: submittedHour(draft.accrual_hours, kept.accrual_hours, touched.has("accrual_hours")),
    accrual_cadence: draft.accrual_cadence,
    cap_hours: cap === "" ? null : cap,
    year_start: yearStartText(draft.year_month, draft.year_day),
    carry_forward: draft.carry_forward !== false,
    accrual_mode: draft.accrual_mode === "scheduled" ? "scheduled" : "daily",
    accrual_anchor: draft.accrual_mode === "scheduled" ? String(draft.accrual_anchor || "") : null,
    accrual_version: Number.isInteger(draft.accrual_version) && draft.accrual_version >= 0 ? draft.accrual_version : 0,
  };
}

/**
 * Trip day presentation. Full, Half, and None are the three choices.
 * Any other stored decimal stays exact: this does not quarter-round.
 * The server in pto.py decides what is saved. This does not forecast
 * balances, overlaps, or accrual.
 */
export const ALLOCATION_CHOICES = [
  { id: "full", label: "Full", amount: "1" },
  { id: "half", label: "Half", amount: "0.5" },
  { id: "none", label: "None", amount: "0" },
];

/** Canonical day text. Trailing zeros drop. The value is not quarter-rounded. */
export function allocationText(raw) {
  if (raw == null || raw === "") return "0";
  const text = typeof raw === "number" ? String(raw) : raw;
  const parsed = parseHours(text);
  if (!parsed.ok || parsed.blank || !parsed.text) return String(text).trim();
  return parsed.text;
}

/** Monday–Friday starts as one day on an unsaved form. The server stores the choice. */
export function defaultAllocation(iso) {
  const date = parseDateOnly(String(iso || ""));
  if (!date) return "0";
  const weekday = date.getDay();
  return weekday === 0 || weekday === 6 ? "0" : "1";
}

function addAmounts(left, right) {
  const a = parseHours(left);
  const b = parseHours(right);
  if (!a.ok || a.blank || !b.ok || b.blank) return allocationText(left);
  const scale = Math.max(a.frac.length, b.frac.length);
  const total = scaled(a.whole, a.frac, scale) + scaled(b.whole, b.frac, scale);
  const base = 10n ** BigInt(scale);
  const whole = total / base;
  const frac = (total % base).toString().padStart(scale, "0").replace(/0+$/, "");
  return frac ? `${whole}.${frac}` : whole.toString();
}

/**
 * Fresh totals and payload for these dates only.
 * A previous return is stale once the dates or amounts change: call again.
 * `enabled` changes the shown total and leaves each day's amount in the payload.
 */
export function allocationDraft(dates, amounts, enabled = true) {
  const source = amounts || {};
  const rows = [];
  let total = "0";
  for (const on_date of dates || []) {
    const amount = allocationText(source[on_date] ?? "0");
    const known = ALLOCATION_CHOICES.find((choice) => choice.amount === amount);
    rows.push({
      on_date,
      amount,
      choice: known ? known.id : "exact",
      label: known ? known.label : amount,
    });
    total = addAmounts(total, amount);
  }
  return {
    total: enabled ? total : "0",
    payload: rows.map(({ on_date, amount }) => ({ on_date, amount })),
    rows,
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
