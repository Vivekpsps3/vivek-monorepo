/** Session guards for the trip-memory read. The dates themselves come from the server. */

export function browserZone(zone) {
  const name = String(zone ?? "").trim();
  return name || "UTC";
}

/** A list response may publish only for the load that is still current. */
export function acceptMemoryLoad({ epoch, currentEpoch, sessionActive }) {
  return sessionActive === true && epoch === currentEpoch;
}

/**
 * What to do with a write that has already reached the server.
 * drop: the form moved on, or the session/epoch is gone.
 * reload: another trip's draft is open; refresh the list and leave that draft.
 * apply: this draft still matches the request, so close it and reread.
 */
export function settleMemoryWrite({
  epoch,
  currentEpoch,
  sessionActive,
  tripId,
  editingTripId,
  start,
  end,
  sentStart,
  sentEnd,
}) {
  if (sessionActive !== true || epoch !== currentEpoch) return "drop";
  if (editingTripId == null) return "apply";
  if (Number(editingTripId) !== Number(tripId)) return "reload";
  if (String(start) !== String(sentStart) || String(end) !== String(sentEnd)) return "drop";
  return "apply";
}

/** Private redate fields cleared when the session or owner is no longer current. */
export function clearMemoryDraft() {
  return { tripId: null, start: "", end: "", note: "" };
}

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

/** Format a server civil date from its ISO parts so a zone cannot shift the day. */
export function civilDay(iso) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso ?? "").trim());
  if (!match) return "";
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return "";
  return `${MONTHS[month - 1]} ${day}, ${match[1]}`;
}

function joinNames(names) {
  const list = (Array.isArray(names) ? names : [])
    .map((name) => String(name ?? "").trim())
    .filter(Boolean);
  if (list.length === 0) return "";
  if (list.length === 1) return list[0];
  if (list.length === 2) return `${list[0]} and ${list[1]}`;
  return `${list.slice(0, -1).join(", ")}, and ${list[list.length - 1]}`;
}

function dayCount(memory) {
  const days = Number(memory?.span_days);
  if (!Number.isInteger(days) || days < 1) return "";
  return days === 1 ? "1 day" : `${days} days`;
}

/** Card labels read the server projection. They do not decide credit. */
export function memoryDates(memory) {
  const span = String(memory?.span_text ?? "").trim();
  const days = dayCount(memory);
  if (!span) return days;
  if (!days) return span;
  return `${span} · ${days}`;
}

export function memoryPlace(memory) {
  return joinNames(memory?.destinations) || "No saved city";
}

export function memoryCredit(memory) {
  const credit = civilDay(memory?.credit_date);
  if (memory?.credit_date) return credit || "No credit";
  if (memory?.status === "planning") return "No credit · planned";
  const status = memory?.status;
  if (status !== "booked" && status !== "done") return "No credit";
  if (!memory?.logged_on) return "No credit · no logged time";
  if (String(memory.logged_on) > String(memory.span_end ?? "")) return "No credit · logged late";
  return "No credit";
}

export function memoryLoggedDay(memory) {
  if (memoryCredit(memory) !== "No credit · logged late") return "";
  const text = String(memory?.logged_text ?? "");
  const match = /^Logged on (.+)\.$/.exec(text);
  if (match) return match[1];
  return text.startsWith("Logged on ") ? text : "";
}

export function memoryOverlapNames(memory) {
  const titles = (Array.isArray(memory?.overlaps) ? memory.overlaps : []).map((item) =>
    String(item?.title ?? "").trim(),
  );
  return joinNames(titles);
}
