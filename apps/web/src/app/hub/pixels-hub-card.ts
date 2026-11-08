import { sundayOnOrBefore } from '@vivek/ui';
import { hubWindow } from '../pixels/pixels-dates';

/** Sunday-start weeks on the Hub card. The window is 13 × 7 = 91 days. */
export const HUB_STRIP_WEEKS = 13;
export const HUB_STRIP_ROWS = 7;

export interface HubStripDay {
  date: string;
  level: number;
  future: boolean;
  today: boolean;
  planned: boolean;
}

export interface HubStripCell {
  date: string;
  level: number;
  future: boolean;
  today: boolean;
  planned: boolean;
}

/** Thirteen Sunday-start weeks ending on the Saturday of the week that contains `today`. */
export function hubStripWindow(today: string): { start: string; end: string; dates: readonly string[] } {
  const window = hubWindow(today, sundayOnOrBefore);
  return { start: window.start, end: window.end, dates: eachInclusive(window.start, window.end) };
}

/**
 * Seven rows (Sunday through Saturday) and one column per week.
 * Days are placed by their weekday, so a missing date does not shift the rest.
 */
export function hubStripRows(days: readonly HubStripDay[]): HubStripCell[][] {
  const rows: HubStripCell[][] = Array.from({ length: HUB_STRIP_ROWS }, () => []);
  const ordered = [...days].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  for (const day of ordered) {
    const row = utcWeekday(day.date);
    if (row < 0 || row >= HUB_STRIP_ROWS) continue;
    rows[row].push({
      date: day.date,
      level: day.level,
      future: day.future,
      today: day.today,
      planned: day.planned,
    });
  }
  return rows;
}

export function hubStripSummary(stats: { active: number; longestRun: number }): { activeLine: string; runLine: string } {
  return {
    activeLine: `${stats.active} active days in the last 13 weeks`,
    runLine: `Longest run: ${stats.longestRun} days`,
  };
}

function eachInclusive(start: string, end: string): string[] {
  const dates: string[] = [];
  let cursor = start;
  for (let guard = 0; guard < HUB_STRIP_WEEKS * HUB_STRIP_ROWS && cursor <= end; guard += 1) {
    dates.push(cursor);
    if (cursor === end) break;
    cursor = shiftUtcDays(cursor, 1);
  }
  return dates;
}

function shiftUtcDays(iso: string, days: number): string {
  const [year, month, day] = iso.split('-').map(Number);
  const shifted = new Date(Date.UTC(year, month - 1, day + days));
  return shifted.toISOString().slice(0, 10);
}

function utcWeekday(iso: string): number {
  const [year, month, day] = iso.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}
