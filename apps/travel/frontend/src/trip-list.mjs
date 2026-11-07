/** Pure helpers for the trips list: countdown cards, totals, past preview. */
import { daysText } from "./labels.mjs";

export { daysText };

export const PAST_PREVIEW = 6;

const DAY_MS = 24 * 60 * 60 * 1000;

function parseDay(iso) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ""));
  if (!match) return null;
  return Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

/** The browser's local calendar day as YYYY-MM-DD (never toISOString/UTC). */
export function localToday(date = new Date()) {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

export function dayOfTrip(startIso, endIso, todayIso) {
  const start = parseDay(startIso);
  const end = parseDay(endIso);
  const today = parseDay(todayIso);
  if (start == null || end == null || today == null) return { day: 1, of: 1 };
  const of = Math.max(Math.round((end - start) / DAY_MS) + 1, 1);
  const raw = Math.round((today - start) / DAY_MS) + 1;
  return { day: Math.min(Math.max(raw, 1), of), of };
}

export function countdownText(trip, todayIso) {
  if (!trip || trip.phase !== "in_progress") return null;
  const { day, of } = dayOfTrip(trip.start_date, trip.end_date, todayIso);
  if (of === 1) return "Today only";
  return `Day ${day} of ${of}`;
}

export function totals(trip) {
  const currencies = trip?.budget?.currencies ?? [];
  const result = [];
  for (const entry of currencies) {
    const cents = Number(entry?.total_cents);
    if (Number.isFinite(cents) && cents > 0) {
      result.push({ currency: entry.currency, cents });
    }
  }
  return result;
}

export function pastSlice(past, expanded) {
  const list = past ?? [];
  return expanded ? list : list.slice(0, PAST_PREVIEW);
}

export function isEmpty(home) {
  if (!home) return true;
  return !(home.in_progress?.length ?? 0) && !(home.upcoming?.length ?? 0);
}

/** "2 days PTO" / "0.5 days PTO" / "0 days PTO" for a trip card. */
export function cardPtoText(trip) {
  const text = daysText(trip?.pto_days_effective);
  return text ? `${text} PTO` : "";
}
