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
