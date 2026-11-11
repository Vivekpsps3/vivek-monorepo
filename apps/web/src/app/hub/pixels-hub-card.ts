import { formatDate } from '@vivek/browser';
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

const HUB_STRIP_KEYS = new Set(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End']);

/** Same date phrasing as the year grid: spoken day, year, then today/future/level. */
export function hubStripLabel(cell: HubStripCell): string {
  const spoken = formatDate(cell.date, 'heading');
  const parts = [spoken === 'No date' ? cell.date : `${spoken}, ${cell.date.slice(0, 4)}`];
  if (cell.today) parts.push('today');
  if (cell.planned) parts.push('planned trip');
  else if (cell.future) parts.push('future');
  if (!cell.future && cell.level > 0) parts.push(`level ${cell.level}`);
  return parts.join(', ');
}

export function isHubStripKey(key: string): boolean {
  return HUB_STRIP_KEYS.has(key);
}

/**
 * One roving stop in a Sunday-start strip. `dates` is chronological.
 * Right/left move a week; down/up move a weekday; Home/End stay on that weekday.
 */
export function adjacentHubStripDate(date: string, key: string, dates: readonly string[]): string | null {
  const index = dates.indexOf(date);
  const weeks = dates.length / 7;
  if (index < 0 || !Number.isInteger(weeks) || weeks < 1) return null;
  const weekday = index % 7;
  const week = Math.floor(index / 7);
  if (key === 'Home') return dates[weekday] ?? null;
  if (key === 'End') return dates[(weeks - 1) * 7 + weekday] ?? null;
  if (key === 'ArrowRight') return week + 1 < weeks ? dates[index + 7] ?? null : null;
  if (key === 'ArrowLeft') return week > 0 ? dates[index - 7] ?? null : null;
  if (key === 'ArrowDown') return weekday < 6 ? dates[index + 1] ?? null : null;
  if (key === 'ArrowUp') return weekday > 0 ? dates[index - 1] ?? null : null;
  return null;
}

/** The single tab stop: the last arrow target, otherwise today, otherwise the first day. */
export function hubStripTabDate(roving: string | null, dates: readonly string[], today: string): string {
  if (roving && dates.includes(roving)) return roving;
  if (dates.includes(today)) return today;
  return dates[0] ?? '';
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
