/** Civil YYYY-MM-DD shifts. Comparisons use the string order of that form. */

const ISO = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isIsoDate(value: string): boolean {
  const match = ISO.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1) return false;
  return day <= daysInMonth(year, month);
}

export function isLeapYear(year: number): boolean {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}

export function daysInMonth(year: number, month: number): number {
  const lengths = [0, 31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (month < 1 || month > 12) return 0;
  if (month === 2 && isLeapYear(year)) return 29;
  return lengths[month] ?? 0;
}

export function shiftIsoDate(iso: string, days: number): string {
  if (!isIsoDate(iso) || !Number.isInteger(days)) {
    throw new RangeError(`Cannot shift ${iso} by ${days}`);
  }
  const [year, month, day] = iso.split('-').map(Number) as [number, number, number];
  const shifted = new Date(Date.UTC(year, month - 1, day + days));
  const text = shifted.toISOString().slice(0, 10);
  if (!isIsoDate(text)) throw new RangeError(`Shift left the calendar: ${text}`);
  return text;
}

export function inclusiveDays(from: string, to: string): number {
  if (!isIsoDate(from) || !isIsoDate(to) || from > to) return 0;
  let count = 1;
  let cursor = from;
  while (cursor < to) {
    cursor = shiftIsoDate(cursor, 1);
    count += 1;
    if (count > 40000) break;
  }
  return count;
}

/** Inclusive windows whose length is at most `maxInclusive`. */
export function inclusiveWindows(from: string, to: string, maxInclusive: number): Array<{ from: string; to: string }> {
  if (!isIsoDate(from) || !isIsoDate(to) || from > to) return [];
  if (!Number.isInteger(maxInclusive) || maxInclusive < 1) {
    throw new RangeError('maxInclusive must be a positive integer');
  }
  const windows: Array<{ from: string; to: string }> = [];
  let cursor = from;
  while (cursor <= to) {
    const end = minIso(to, shiftIsoDate(cursor, maxInclusive - 1));
    windows.push({ from: cursor, to: end });
    if (end >= to) break;
    cursor = shiftIsoDate(end, 1);
  }
  return windows;
}

export function eachDate(from: string, to: string): string[] {
  const dates: string[] = [];
  if (!isIsoDate(from) || !isIsoDate(to) || from > to) return dates;
  let cursor = from;
  while (cursor <= to) {
    dates.push(cursor);
    if (dates.length > 40000) break;
    cursor = shiftIsoDate(cursor, 1);
  }
  return dates;
}

export function minIso(left: string, right: string): string {
  return left <= right ? left : right;
}

export function yearOf(iso: string): number {
  return Number(iso.slice(0, 4));
}

export interface ClampedQuery {
  year: number;
  day: string | null;
  notice: string | null;
}

/**
 * `year` wins. A missing year uses `today`. An unusable year becomes the
 * year of `today` and sets `notice`. A day must be a real date in that year.
 */
export function clampYearDay(yearRaw: string | null, dayRaw: string | null, today: string): ClampedQuery {
  if (!isIsoDate(today)) throw new RangeError(`today must be YYYY-MM-DD, not ${today}`);
  const todayYear = yearOf(today);
  const yearText = (yearRaw ?? '').trim();
  let year = todayYear;
  let notice: string | null = null;
  if (yearText !== '') {
    if (!/^\d{1,4}$/.test(yearText)) {
      notice = `Showing ${todayYear}. ${yearText} is not a year.`;
    } else {
      const parsed = Number(yearText);
      if (parsed < 1 || parsed > 9999) notice = `Showing ${todayYear}. ${yearText} is not a year.`;
      else year = parsed;
    }
  }
  const dayText = (dayRaw ?? '').trim();
  if (dayText === '') return { year, day: null, notice };
  if (!isIsoDate(dayText) || yearOf(dayText) !== year) {
    const dayNotice = `No day selected. ${dayText} is not a date in ${year}.`;
    return { year, day: null, notice: notice ?? dayNotice };
  }
  return { year, day: dayText, notice };
}

export type YearOrientation = 'months-by-day' | 'days-by-month';

/** Next valid date inside the same year, or null when the key does not move. */
export function adjacentYearDate(date: string, key: string, orientation: YearOrientation): string | null {
  if (!isIsoDate(date)) return null;
  const year = yearOf(date);
  const month = Number(date.slice(5, 7));
  const day = Number(date.slice(8, 10));
  const horizontal = orientation === 'months-by-day' ? 'day' : 'month';
  const vertical = orientation === 'months-by-day' ? 'month' : 'day';
  if (key === 'Home') return firstValid(year, month, 1, 1);
  if (key === 'End') return lastValid(year, month, 31);
  if (key === 'PageUp') return step(year, month, day, vertical, -1);
  if (key === 'PageDown') return step(year, month, day, vertical, 1);
  if (key === 'ArrowLeft') return step(year, month, day, horizontal, -1);
  if (key === 'ArrowRight') return step(year, month, day, horizontal, 1);
  if (key === 'ArrowUp') return step(year, month, day, vertical, -1);
  if (key === 'ArrowDown') return step(year, month, day, vertical, 1);
  return null;
}

function step(year: number, month: number, day: number, axis: 'day' | 'month', delta: number): string | null {
  if (axis === 'day') {
    const next = day + delta;
    if (next < 1 || next > 31) return null;
    return validInYear(year, month, next);
  }
  const next = month + delta;
  if (next < 1 || next > 12) return null;
  return validInYear(year, next, day) ?? nearestValidDay(year, next, day);
}

function validInYear(year: number, month: number, day: number): string | null {
  if (day < 1 || day > daysInMonth(year, month)) return null;
  const text = `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  return isIsoDate(text) ? text : null;
}

function nearestValidDay(year: number, month: number, day: number): string | null {
  const length = daysInMonth(year, month);
  return validInYear(year, month, Math.min(day, length));
}

function firstValid(year: number, month: number, fromDay: number, toDay: number): string | null {
  for (let day = fromDay; day <= toDay; day += 1) {
    const found = validInYear(year, month, day);
    if (found) return found;
  }
  return null;
}

function lastValid(year: number, month: number, fromDay: number): string | null {
  for (let day = fromDay; day >= 1; day -= 1) {
    const found = validInYear(year, month, day);
    if (found) return found;
  }
  return null;
}

/** Thirteen Sunday-start weeks ending on the Saturday of the week that contains `today`. */
export function hubWindow(today: string, sundayOnOrBefore: (iso: string) => string): { start: string; end: string } {
  const sunday = sundayOnOrBefore(today);
  return { start: shiftIsoDate(sunday, -12 * 7), end: shiftIsoDate(sunday, 6) };
}
