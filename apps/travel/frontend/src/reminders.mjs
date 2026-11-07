/** Pure helpers for the trip reminders view (T3).
 *
 * All comparisons are naive local wall time: due_at and nowIso are both
 * local "YYYY-MM-DDTHH:MM" strings, so string compare works. The caller
 * builds nowIso from the browser's local clock (the LA/local calendar day
 * the user is in), never from a server date.
 */

export const SOON_DAYS = 7;

function addDaysToMinuteString(iso, days) {
  const [datePart, timePart = "00:00"] = String(iso).split("T");
  const [year, month, day] = datePart.split("-").map(Number);
  const [hour, minute] = timePart.split(":").map(Number);
  const date = new Date(year, month - 1, day + days, hour || 0, minute || 0);
  const pad = (value) => String(value).padStart(2, "0");
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}`
  );
}

function byDueThenId(a, b) {
  if (a.due_at == null && b.due_at == null) return a.id - b.id;
  if (a.due_at == null) return 1;
  if (b.due_at == null) return -1;
  if (a.due_at < b.due_at) return -1;
  if (a.due_at > b.due_at) return 1;
  return a.id - b.id;
}

export function groupReminders(list, nowIso) {
  const cutoff = addDaysToMinuteString(nowIso, SOON_DAYS);
  const soon = [];
  const later = [];
  const done = [];
  for (const reminder of list || []) {
    if (reminder.done) done.push(reminder);
    else if (reminder.due_at != null && reminder.due_at < cutoff) soon.push(reminder);
    else later.push(reminder);
  }
  soon.sort(byDueThenId);
  later.sort(byDueThenId);
  done.sort((a, b) => b.id - a.id);
  return { soon, later, done };
}

export function isOverdue(reminder, nowIso) {
  return Boolean(
    reminder && !reminder.done && reminder.due_at != null && reminder.due_at < nowIso,
  );
}

export function dueParts(dueAt) {
  if (dueAt == null || dueAt === "") return null;
  const text = String(dueAt);
  const date = text.slice(0, 10);
  const time = text.length > 11 ? text.slice(11, 16) : null;
  return { date, time: time && time !== "00:00" ? time : null };
}

export function validateTitle(text) {
  const trimmed = String(text ?? "").trim();
  if (!trimmed) return "Enter a reminder.";
  if (trimmed.length > 200) return "Keep it under 200 characters.";
  return null;
}
