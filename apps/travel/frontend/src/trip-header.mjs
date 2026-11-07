/** Pure helpers for the trip page header and transport rows. */
import { formatDays } from "./labels.mjs";

export function showSubtitle(title, cities) {
  const list = cities ?? [];
  if (list.length >= 2) return true;
  if (list.length === 1) {
    return String(title ?? "").trim().toLowerCase() !== String(list[0] ?? "").trim().toLowerCase();
  }
  return false;
}

export function nightsWord(nights) {
  const count = Number(nights) || 0;
  if (count <= 0) return "same day";
  if (count === 1) return "1 night";
  return `${count} nights`;
}

export function ptoText(value) {
  const clean = formatDays(value) || "0";
  return clean === "1" ? "1 PTO day" : `${clean} PTO days`;
}

function parseWhen(value) {
  const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/.exec(String(value || ""));
  if (!match) return null;
  return { date: match[1], time: match[2] };
}

export function transportWhen(departAt, arriveAt) {
  const depart = parseWhen(departAt);
  const arrive = parseWhen(arriveAt);
  return {
    depart,
    arrive,
    sameDay: Boolean(depart && arrive && depart.date === arrive.date),
  };
}
