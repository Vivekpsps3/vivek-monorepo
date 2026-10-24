/** Suite week start. 0 is Sunday, which is the en-US default. 1 is Monday.
 * `suite-week-start` is the one setting Media and Travel both read.
 */
export const WEEK_STARTS_ON = 0;
export const WEEK_START_KEY = "suite-week-start";

export function weekStartsOn() {
  try {
    const stored = localStorage.getItem(WEEK_START_KEY);
    if (stored === "0" || stored === "1") return Number(stored);
  } catch { /* node, or private mode */ }
  return WEEK_STARTS_ON;
}

export function writeWeekStart(value) {
  const next = value === 1 || value === "1" ? "1" : "0";
  try { localStorage.setItem(WEEK_START_KEY, next); } catch { /* private mode */ }
  return Number(next);
}

/** Rotate a Sunday-first label list so index 0 is the suite week start. */
export function rotateWeekLabels(labels) {
  const names = [...labels];
  const count = names.length || 1;
  const start = ((weekStartsOn() % count) + count) % count;
  return [...names.slice(start), ...names.slice(0, start)];
}
