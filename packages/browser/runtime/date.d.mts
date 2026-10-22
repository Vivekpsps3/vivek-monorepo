export const WEEK_STARTS_ON: 0;
export function browserTimeZone(): string;
export function isoDateInZone(instant?: Date, timeZone?: string): string;
export function localTodayIso(): string;
export function parseDateOnly(iso: string | null | undefined): Date | null;
export function weekStartIndex(date: Date, weekStartsOn?: number): number;
export function daysBetweenDateOnly(start: string | null | undefined, end: string | null | undefined): number | null;
export function isOnOrBeforeToday(value: string | null | undefined, today?: string): boolean;
export function formatDate(
  value: string | null | undefined,
  style?: 'table' | 'heading' | 'timestamp' | 'time' | 'month' | 'range',
  now?: Date,
  timeZone?: string,
): string;
export function formatDateRange(start: string | null | undefined, end?: string | null): string;
export function todayIsoDate(): string;
