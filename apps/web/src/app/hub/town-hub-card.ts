/**
 * The Hub Town card's view of GET /api/town/summary (TF5 §10).
 *
 * This module is deliberately self-contained: it imports nothing from
 * Finance, and the card it feeds never shows Treasury, Health, or any
 * Finance-derived data. The card has no `locked` state.
 */
export interface TownSummary {
  name: string;
  founded_on: string | null;
  level: number;
  xp: number;
  level_xp_start: number;
  next_level_xp: number | null;
  today_done: number;
  today_total: number;
  longest_streak: number;
  longest_streak_unit: 'days' | 'weeks' | null;
}

/** A town with no active habits has nothing for the card to report yet. */
export function townIsEmpty(summary: TownSummary): boolean {
  return summary.today_total === 0;
}

/**
 * The longest current streak in the town page's own phrasing
 * ("3-day streak", "2-week streak"), or null when every streak is 0
 * and the line is omitted.
 */
export function townStreakText(summary: TownSummary): string | null {
  if (summary.longest_streak <= 0 || summary.longest_streak_unit == null) return null;
  const unit = summary.longest_streak_unit === 'days' ? 'day' : 'week';
  return `${summary.longest_streak}-${unit} streak`;
}
