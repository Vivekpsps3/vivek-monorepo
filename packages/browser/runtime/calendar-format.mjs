/** Calendar copy shared by Travel and Media. Locale is en-US. Dates are local calendar days. */

import { daysBetweenDateOnly, isoDateInZone, parseDateOnly } from "./date.mjs";
import { browserTimeZone } from "./today.mjs";

const EN_DASH = "\u2013";
const THIN_SPACE = "\u2009";
const RANGE_SEPARATOR = `${THIN_SPACE}${EN_DASH}${THIN_SPACE}`;

function monthDay(date) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
  }).format(date);
}

function monthDayYear(date) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

/**
 * @param {string | null | undefined} iso
 * @param {Date} [now]
 */
export function formatDay(iso, now = new Date()) {
  if (iso == null || iso === "") return "";
  if (typeof iso !== "string") return "";
  const date = parseDateOnly(iso);
  if (!date) return iso;
  const sameYear = date.getFullYear() === now.getFullYear();
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: sameYear ? undefined : "numeric",
  }).format(date);
}

/**
 * Trip-style range. Same month: "Dec 12 – 15, 2026".
 * Across years: "Dec 30, 2026 – Jan 2, 2027".
 * Same year and different months share the year once at the end ("Nov 12 – Dec 2, 2026").
 * One calendar day is that day with its year ("Dec 12, 2026").
 * @param {string | null | undefined} start
 * @param {string | null | undefined} end
 */
export function formatDateRange(start, end) {
  const opening = parseDateOnly(start);
  const closing = parseDateOnly(end);
  if (!opening || !closing) {
    const left = opening
      ? monthDayYear(opening)
      : start == null || start === ""
        ? ""
        : String(start);
    const right = closing
      ? monthDayYear(closing)
      : end == null || end === ""
        ? ""
        : String(end);
    if (!left) return right;
    if (!right) return left;
    return `${left}${RANGE_SEPARATOR}${right}`;
  }
  if (opening.getTime() === closing.getTime()) return monthDayYear(opening);
  const sameYear = opening.getFullYear() === closing.getFullYear();
  const sameMonth = sameYear && opening.getMonth() === closing.getMonth();
  if (sameMonth) {
    const day = new Intl.DateTimeFormat("en-US", { day: "numeric" }).format(
      closing,
    );
    return `${monthDay(opening)}${RANGE_SEPARATOR}${day}, ${opening.getFullYear()}`;
  }
  if (sameYear) {
    return `${monthDay(opening)}${RANGE_SEPARATOR}${monthDay(closing)}, ${opening.getFullYear()}`;
  }
  return `${monthDayYear(opening)}${RANGE_SEPARATOR}${monthDayYear(closing)}`;
}

/**
 * @param {string | null | undefined} iso
 * @param {Date} [now]
 */
export function formatRelativeDay(iso, now = new Date()) {
  if (iso == null || iso === "") return "";
  if (typeof iso !== "string") return "";
  if (!parseDateOnly(iso)) return iso;
  const today = isoDateInZone(now, browserTimeZone());
  const delta = daysBetweenDateOnly(today, iso);
  if (delta == null) return iso;
  if (delta === 0) return "Today";
  if (delta === 1) return "Tomorrow";
  if (delta > 1) return `In ${delta} days`;
  const ago = -delta;
  return ago === 1 ? "1 day ago" : `${ago} days ago`;
}
