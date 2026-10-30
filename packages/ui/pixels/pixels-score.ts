/**
 * Day and week scores for Pixels, plus Life-poster geometry.
 * Dates are civil YYYY-MM-DD. This module does not read the host clock.
 */

export const CHANNEL_WEIGHT = { town: 1, media: 1, trip: 2, fin: 1 } as const;
export const CHANNEL_CAP = { town: 3, media: 3, trip: 1, fin: 1 } as const;
/** Level is how many of these are ≤ the day score. */
export const DAY_LEVEL_THRESHOLDS = [1, 3, 5, 7] as const;
/** Level is how many of these are ≤ the week score. */
export const WEEK_LEVEL_THRESHOLDS = [1, 8, 18, 30] as const;
/** Tie-break when contribution amounts are equal: Travel, then Town, then Media, then Finance. */
export const DOMINANCE_ORDER = ['travel', 'town', 'media', 'finance'] as const;
export const LIFE_MIN_ROWS = 90;
/** Columns in one life-year row. Week 52 is the last column. */
export const LIFE_WEEK_COUNT = 52;

const ORDINARY_WEEK_DAYS = 7;
const MS_EPOCH_DAY_OFFSET = 719468;
const DAYS_PER_ERA = 146097;

export type PixelApp = (typeof DOMINANCE_ORDER)[number];

export interface DayChannels {
  town: number;
  media: number;
  trip: number;
  /** 1 when the day's budget was kept, 0 when it was not, null when locked or there is no plan. */
  fin: number | null;
}

export interface AppAmounts {
  travel: number;
  town: number;
  media: number;
  finance: number;
}

export interface DatedChannels {
  date: string;
  channels: DayChannels;
}

export interface SundayWeekScore {
  /** Sunday, YYYY-MM-DD. */
  start: string;
  /** Saturday, YYYY-MM-DD. */
  end: string;
  dates: readonly string[];
  /** Score for each date in `dates`. A date that was not supplied is 0. */
  dayScores: readonly number[];
  score: number;
  level: number;
}

export interface LifeWeekSpan {
  /** 1-based. Weeks 1–51 have 7 days. Week 52 has 8 or 9. */
  week: number;
  start: string;
  end: string;
  days: number;
}

interface CivilDate {
  year: number;
  month: number;
  day: number;
}

function boundedCount(value: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return 0;
  return Math.floor(value);
}

function weighted(count: number, cap: number, weight: number): number {
  return Math.min(count, cap) * weight;
}

/** Capped, weighted contribution of each app. Null finance contributes 0. */
export function scoreParts(channels: DayChannels): AppAmounts {
  const finance = channels.fin === null ? 0 : boundedCount(channels.fin);
  return {
    town: weighted(boundedCount(channels.town), CHANNEL_CAP.town, CHANNEL_WEIGHT.town),
    media: weighted(boundedCount(channels.media), CHANNEL_CAP.media, CHANNEL_WEIGHT.media),
    travel: weighted(boundedCount(channels.trip), CHANNEL_CAP.trip, CHANNEL_WEIGHT.trip),
    finance: weighted(finance, CHANNEL_CAP.fin, CHANNEL_WEIGHT.fin),
  };
}

/** Σ min(channel, cap) × weight. Null finance counts as 0. Maximum is 9. */
export function dayScore(channels: DayChannels): number {
  const parts = scoreParts(channels);
  return parts.town + parts.media + parts.travel + parts.finance;
}

export function dayLevel(score: number): number {
  return levelAt(score, DAY_LEVEL_THRESHOLDS);
}

/** Raw counts. Null finance counts as 0. Caps do not apply. */
export function activityCounts(channels: DayChannels): AppAmounts {
  return {
    town: boundedCount(channels.town),
    media: boundedCount(channels.media),
    travel: boundedCount(channels.trip),
    finance: channels.fin === null ? 0 : boundedCount(channels.fin),
  };
}

export function dayActivities(channels: DayChannels): number {
  const counts = activityCounts(channels);
  return counts.town + counts.media + counts.travel + counts.finance;
}

/**
 * Highest positive amount wins.
 * Callers pass the capped, weighted parts from `scoreParts` (a trip counts 2).
 * Equal positive amounts resolve in `DOMINANCE_ORDER`: Travel, then Town, then Media, then Finance.
 * Zero and negative amounts do not compete, so an empty day has no dominant app.
 */
export function dominantApp(amounts: AppAmounts): PixelApp | null {
  let best: PixelApp | null = null;
  let bestAmount = 0;
  for (const app of DOMINANCE_ORDER) {
    const amount = amounts[app];
    if (typeof amount === 'number' && amount > bestAmount) {
      best = app;
      bestAmount = amount;
    }
  }
  return best;
}

function levelAt(score: number, thresholds: readonly number[]): number {
  if (typeof score !== 'number' || !Number.isFinite(score)) {
    throw new RangeError('Score must be a finite number');
  }
  let level = 0;
  for (const threshold of thresholds) {
    if (score >= threshold) level += 1;
  }
  return level;
}

export function weekLevel(score: number): number {
  return levelAt(score, WEEK_LEVEL_THRESHOLDS);
}

/**
 * Sum of per-day scores, including each day's Finance channel.
 * Pixels does not take a weekly budget-kept flag.
 */
export function weekScore(dayScores: readonly number[]): number {
  let total = 0;
  for (const score of dayScores) {
    if (typeof score !== 'number' || !Number.isFinite(score)) {
      throw new RangeError('Week score parts must be finite numbers');
    }
    total += score;
  }
  return total;
}

export function weekScoreFromDays(days: readonly DayChannels[]): number {
  let total = 0;
  for (const day of days) total += dayScore(day);
  return total;
}

/** Sunday of the Sunday-start week that contains `isoDate`. */
export function sundayOnOrBefore(isoDate: string): string {
  const day = dayNumber(isoDate);
  return formatDayNumber(day - weekdaySunday0(day));
}

/** Sunday through Saturday, as YYYY-MM-DD. */
export function sundayWeekDates(isoDate: string): readonly string[] {
  const start = dayNumber(sundayOnOrBefore(isoDate));
  const dates: string[] = [];
  for (let offset = 0; offset < ORDINARY_WEEK_DAYS; offset += 1) {
    dates.push(formatDayNumber(start + offset));
  }
  return dates;
}

/**
 * Groups the given days into Sunday–Saturday weeks, sorted by Sunday.
 * A repeated date keeps the last entry. A date that is not supplied scores 0.
 */
export function weeksBySunday(days: readonly DatedChannels[]): SundayWeekScore[] {
  const byStart = new Map<string, Map<string, DayChannels>>();
  for (const day of days) {
    const start = sundayOnOrBefore(day.date);
    let bucket = byStart.get(start);
    if (!bucket) {
      bucket = new Map();
      byStart.set(start, bucket);
    }
    bucket.set(day.date, day.channels);
  }
  return [...byStart.keys()].sort().map((start) => {
    const dates = sundayWeekDates(start);
    const bucket = byStart.get(start);
    const dayScores = dates.map((date) => {
      const channels = bucket?.get(date);
      return channels ? dayScore(channels) : 0;
    });
    const score = weekScore(dayScores);
    const end = dates[dates.length - 1] ?? start;
    return { start, end, dates, dayScores, score, level: weekLevel(score) };
  });
}

/** Rows on the Life poster: max(90, age + 1). */
export function lifeRowCount(age: number): number {
  if (typeof age !== 'number' || !Number.isFinite(age)) {
    throw new RangeError('Age must be a finite number');
  }
  return Math.max(LIFE_MIN_ROWS, age + 1);
}

/**
 * First day of life-year `row` (0-based).
 * A Feb 29 birthday starts that row on Feb 28 when the anniversary year is not a leap year.
 */
export function lifeRowStart(birthday: string, row: number): string {
  if (!Number.isInteger(row) || row < 0) {
    throw new RangeError(`Life row must be a whole number ≥ 0, not ${row}`);
  }
  const birth = parseIso(birthday);
  const year = birth.year + row;
  if (birth.month === 2 && birth.day === 29 && !isLeapYear(year)) {
    return formatIso(year, 2, 28);
  }
  return formatIso(year, birth.month, birth.day);
}

/** Days from this row's start up to, but not including, the next row's start. */
export function lifeRowDayCount(birthday: string, row: number): number {
  return dayNumber(lifeRowStart(birthday, row + 1)) - dayNumber(lifeRowStart(birthday, row));
}

/**
 * Days in a 1-based life week. Weeks 1–51 have 7 days.
 * Week 52 keeps the remaining day or two, so it has 8 days in a 365-day row and 9 in a 366-day row.
 */
export function lifeWeekDayCount(daysInRow: number, week: number): number {
  if (!Number.isInteger(week) || week < 1 || week > LIFE_WEEK_COUNT) {
    throw new RangeError(`Life week must be an integer 1..${LIFE_WEEK_COUNT}, not ${week}`);
  }
  if (daysInRow !== 365 && daysInRow !== 366) {
    throw new RangeError(`A life-year row is 365 or 366 days, not ${daysInRow}`);
  }
  if (week < LIFE_WEEK_COUNT) return ORDINARY_WEEK_DAYS;
  return daysInRow - ORDINARY_WEEK_DAYS * (LIFE_WEEK_COUNT - 1);
}

export function lifeWeeks(birthday: string, row: number): LifeWeekSpan[] {
  const origin = dayNumber(lifeRowStart(birthday, row));
  const total = lifeRowDayCount(birthday, row);
  const spans: LifeWeekSpan[] = [];
  let offset = 0;
  for (let week = 1; week <= LIFE_WEEK_COUNT; week += 1) {
    const days = lifeWeekDayCount(total, week);
    const startNumber = origin + offset;
    spans.push({
      week,
      start: formatDayNumber(startNumber),
      end: formatDayNumber(startNumber + days - 1),
      days,
    });
    offset += days;
  }
  return spans;
}

/**
 * Completed life years on `onDate`: the 0-based row whose start is on or before that date.
 * Null when `onDate` is before the birthday. A Feb 29 birthday reaches the next year on Feb 28
 * in a non-leap year, because that is when the next row starts.
 */
export function lifeAge(birthday: string, onDate: string): number | null {
  if (dayNumber(onDate) < dayNumber(birthday)) return null;
  const birth = parseIso(birthday);
  const on = parseIso(onDate);
  let age = on.year - birth.year;
  if (onDate < lifeRowStart(birthday, age)) age -= 1;
  return age < 0 ? null : age;
}

function isLeapYear(year: number): boolean {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}

function parseIso(iso: string): CivilDate {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) throw new RangeError(`Expected YYYY-MM-DD, got ${iso}`);
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const monthLength = daysInMonth(year, month);
  if (monthLength === 0 || day < 1 || day > monthLength) {
    throw new RangeError(`Not a calendar date: ${iso}`);
  }
  return { year, month, day };
}

function daysInMonth(year: number, month: number): number {
  const lengths = [0, 31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (month < 1 || month > 12) return 0;
  if (month === 2 && isLeapYear(year)) return 29;
  return lengths[month] ?? 0;
}

function formatIso(year: number, month: number, day: number): string {
  // parseIso accepts 0000–9999. Years below 1000 must keep their leading zeros.
  if (!Number.isInteger(year) || year < 0 || year > 9999) {
    throw new RangeError(`Year must be 0000–9999, not ${year}`);
  }
  const yearText = String(year).padStart(4, '0');
  const monthText = String(month).padStart(2, '0');
  const dayText = String(day).padStart(2, '0');
  return `${yearText}-${monthText}-${dayText}`;
}

/** Days since 1970-01-01. Howard Hinnant's civil algorithm; no clock and no time zone. */
function dayNumber(iso: string): number {
  const { year, month, day } = parseIso(iso);
  let shiftedYear = year;
  shiftedYear -= month <= 2 ? 1 : 0;
  const era = Math.trunc((shiftedYear >= 0 ? shiftedYear : shiftedYear - 399) / 400);
  const yearOfEra = shiftedYear - era * 400;
  const dayOfYear = Math.trunc((153 * (month + (month > 2 ? -3 : 9)) + 2) / 5) + day - 1;
  const dayOfEra = yearOfEra * 365 + Math.trunc(yearOfEra / 4) - Math.trunc(yearOfEra / 100) + dayOfYear;
  return era * DAYS_PER_ERA + dayOfEra - MS_EPOCH_DAY_OFFSET;
}

function formatDayNumber(dayIndex: number): string {
  const shifted = dayIndex + MS_EPOCH_DAY_OFFSET;
  const era = Math.trunc((shifted >= 0 ? shifted : shifted - (DAYS_PER_ERA - 1)) / DAYS_PER_ERA);
  const dayOfEra = shifted - era * DAYS_PER_ERA;
  const yearOfEra = Math.trunc(
    (dayOfEra - Math.trunc(dayOfEra / 1460) + Math.trunc(dayOfEra / 36524) - Math.trunc(dayOfEra / 146096)) / 365,
  );
  let year = yearOfEra + era * 400;
  const dayOfYear = dayOfEra - (365 * yearOfEra + Math.trunc(yearOfEra / 4) - Math.trunc(yearOfEra / 100));
  const monthPart = Math.trunc((5 * dayOfYear + 2) / 153);
  const day = dayOfYear - Math.trunc((153 * monthPart + 2) / 5) + 1;
  const month = monthPart + (monthPart < 10 ? 3 : -9);
  if (month <= 2) year += 1;
  return formatIso(year, month, day);
}

/** 1970-01-01 is Thursday. Sunday is 0. */
function weekdaySunday0(dayIndex: number): number {
  const weekday = (dayIndex + 4) % 7;
  return weekday < 0 ? weekday + 7 : weekday;
}
