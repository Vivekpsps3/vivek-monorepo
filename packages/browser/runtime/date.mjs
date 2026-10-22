/** Shared calendar dates for Finance, Media, and Travel. */

export { browserTimeZone, isoDateInZone, localTodayIso } from "./today.mjs";
import { browserTimeZone, isoDateInZone, localTodayIso } from "./today.mjs";

/**
 * Week start for the suite. Decision D11: Sunday (0). Flip this one constant.
 * Media Batch 4 can read the same value.
 */
export const WEEK_STARTS_ON = 0;

const ZONE_LABELS = {
  "America/Los_Angeles": "PT",
  "America/New_York": "ET",
  "America/Chicago": "CT",
  "America/Denver": "MT",
  "Pacific/Honolulu": "HT",
  UTC: "UTC",
};

/** Local calendar date. Invalid calendar days (and UTC-only parsing) return null. */
export function parseDateOnly(iso) {
  if (typeof iso !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  const [year, month, day] = iso.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null;
  return date;
}

/** Column offset of a local date, 0 meaning the week-start column. */
export function weekStartIndex(date, weekStartsOn = WEEK_STARTS_ON) {
  return (date.getDay() - weekStartsOn + 7) % 7;
}

/** Calendar-day distance. DST transitions do not add or drop a date. */
export function daysBetweenDateOnly(start, end) {
  const left = parseDateOnly(start);
  const right = parseDateOnly(end);
  if (!left || !right) return null;
  const utcLeft = Date.UTC(left.getFullYear(), left.getMonth(), left.getDate());
  const utcRight = Date.UTC(right.getFullYear(), right.getMonth(), right.getDate());
  return Math.round((utcRight - utcLeft) / 86_400_000);
}

/** True when a date-only value is on or before the local today, not UTC today. */
export function isOnOrBeforeToday(value, today = localTodayIso()) {
  if (!parseDateOnly(value) || !parseDateOnly(today)) return false;
  return value <= today;
}

function zoneLabel(timeZone) {
  if (ZONE_LABELS[timeZone]) return ZONE_LABELS[timeZone];
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone,
      timeZoneName: "short",
    }).formatToParts(new Date());
    return parts.find((part) => part.type === "timeZoneName")?.value || timeZone;
  } catch {
    return timeZone;
  }
}

function formatLocalDate(date, options) {
  return new Intl.DateTimeFormat("en-US", options).format(date);
}

/**
 * @param {string | null | undefined} value date-only YYYY-MM-DD or an ISO instant
 * @param {'table' | 'heading' | 'timestamp' | 'time' | 'month' | 'range'} style
 * @param {Date} now
 * @param {string} timeZone
 */
export function formatDate(value, style = "table", now = new Date(), timeZone = browserTimeZone()) {
  if (value == null || value === "") return "No date";
  if (typeof value !== "string") return "No date";
  const dateOnly = parseDateOnly(value);
  if (dateOnly) return formatCalendarDate(dateOnly, style, now);
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return "No date";
  const instant = new Date(value);
  if (Number.isNaN(instant.getTime())) return "No date";
  return formatInstant(instant, style, now, timeZone);
}

function formatCalendarDate(date, style, now) {
  const sameYear = date.getFullYear() === now.getFullYear();
  if (style === "heading") {
    return formatLocalDate(date, { weekday: "long", month: "short", day: "numeric" });
  }
  if (style === "month") {
    return formatLocalDate(date, { month: "long", year: "numeric" });
  }
  if (style === "range" || !sameYear) {
    return formatLocalDate(date, { month: "short", day: "numeric", year: "numeric" });
  }
  return formatLocalDate(date, { month: "short", day: "numeric" });
}

function formatInstant(instant, style, now, timeZone) {
  const zone = timeZone || "UTC";
  const day = isoDateInZone(instant, zone);
  const today = isoDateInZone(now, zone);
  const label = zoneLabel(zone);
  const time = new Intl.DateTimeFormat("en-US", {
    timeZone: zone,
    hour: "numeric",
    minute: "2-digit",
  }).format(instant);
  if (style === "time" || day === today) {
    if (style === "time" || style === "timestamp") return `${time} ${label}`;
  }
  const date = parseDateOnly(day);
  const dateText = date
    ? formatLocalDate(date, { month: "short", day: "numeric" })
    : day;
  if (style === "heading" && date) return formatCalendarDate(date, "heading", now);
  if (style === "month" && date) return formatCalendarDate(date, "month", now);
  if (style === "table" && date) return formatCalendarDate(date, "table", now);
  return `${dateText}, ${time} ${label}`;
}

export function formatDateRange(start, end) {
  const opening = formatDate(start, "range");
  if (opening === "No date") return opening;
  if (end == null || end === "" || end === "present" || end === "Present") return `${opening} → Present`;
  const closing = formatDate(end, "range");
  return `${opening} → ${closing}`;
}

export function todayIsoDate() {
  return localTodayIso();
}
