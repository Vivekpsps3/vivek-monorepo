import { BankAccountRecord, ImportReceipt, Transaction } from '../models/transaction.model';
import { transactionEffects } from '../crypto/client-finance';

export interface ReviewPeriod {
  month: string;
  start: string;
  end: string;
}

export interface SpendingReviewPeriods {
  current: ReviewPeriod;
  previous: ReviewPeriod;
  partialCurrentMonth: boolean;
  matchedElapsedDays: number;
  omittedCurrentDays: number;
}

export interface SpendingComparisonRow {
  key: string;
  label: string;
  currentAmount: number;
  previousAmount: number;
  difference: number;
  currentCount: number;
  previousCount: number;
}

export interface DateRange {
  start: string;
  end: string;
}

export type SpendingReviewDimension = 'category' | 'merchant';

function monthKey(year: number, monthIndex: number): string {
  return `${String(year).padStart(4, '0')}-${String(monthIndex + 1).padStart(2, '0')}`;
}

function daysInMonth(year: number, monthIndex: number): number {
  const date = new Date(0);
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCFullYear(year, monthIndex + 1, 0);
  return date.getUTCDate();
}

function monthParts(value: string): { year: number; monthIndex: number } | null {
  const match = /^(\d{4})-(\d{2})$/.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (year < 1 || month < 1 || month > 12) return null;
  return { year, monthIndex: month - 1 };
}

function isoDate(year: number, monthIndex: number, day: number): string {
  return `${monthKey(year, monthIndex)}-${String(day).padStart(2, '0')}`;
}

function previousMonth(year: number, monthIndex: number): { year: number; monthIndex: number } {
  return monthIndex === 0 ? { year: year - 1, monthIndex: 11 } : { year, monthIndex: monthIndex - 1 };
}

/**
 * Builds comparable month windows. The current month is compared through today
 * against the same elapsed calendar days in the prior month; older months use
 * full-month windows.
 */
export function buildSpendingReviewPeriods(month: string, now = new Date()): SpendingReviewPeriods | null {
  const selected = monthParts(month);
  if (!selected) return null;

  const isCurrentMonth = selected.year === now.getFullYear() && selected.monthIndex === now.getMonth();
  const previous = previousMonth(selected.year, selected.monthIndex);
  const elapsedDay = isCurrentMonth ? Math.min(now.getDate(), daysInMonth(selected.year, selected.monthIndex)) : 0;
  const matchedElapsedDays = isCurrentMonth
    ? Math.min(elapsedDay, daysInMonth(previous.year, previous.monthIndex))
    : daysInMonth(selected.year, selected.monthIndex);
  const selectedEndDay = isCurrentMonth ? matchedElapsedDays : daysInMonth(selected.year, selected.monthIndex);
  const previousEndDay = isCurrentMonth ? matchedElapsedDays : daysInMonth(previous.year, previous.monthIndex);

  return {
    current: {
      month,
      start: isoDate(selected.year, selected.monthIndex, 1),
      end: isoDate(selected.year, selected.monthIndex, selectedEndDay),
    },
    previous: {
      month: monthKey(previous.year, previous.monthIndex),
      start: isoDate(previous.year, previous.monthIndex, 1),
      end: isoDate(previous.year, previous.monthIndex, previousEndDay),
    },
    partialCurrentMonth: isCurrentMonth,
    matchedElapsedDays: isCurrentMonth ? matchedElapsedDays : 0,
    omittedCurrentDays: isCurrentMonth ? elapsedDay - matchedElapsedDays : 0,
  };
}

function normalizeLabel(value: string): string {
  return value.trim().toLocaleLowerCase();
}

function labelFor(transaction: Transaction, dimension: SpendingReviewDimension): string {
  const value = dimension === 'category' ? transaction.category : transaction.merchant;
  return String(value || '').trim() || (dimension === 'category' ? 'Uncategorized' : 'Unassigned merchant');
}

export function spendingComparisonGroupKey(transaction: Transaction, dimension: SpendingReviewDimension): string {
  return normalizeLabel(labelFor(transaction, dimension));
}

function inPeriod(date: string, period: ReviewPeriod): boolean {
  return date >= period.start && date <= period.end;
}

/** Compares recorded net spending, preserving refund offsets and excluding non-spending ledger kinds. */
export function compareSpending(
  transactions: Transaction[],
  periods: SpendingReviewPeriods,
  dimension: SpendingReviewDimension,
  accountKey = '',
): SpendingComparisonRow[] {
  const rows = new Map<string, SpendingComparisonRow>();
  for (const transaction of transactions) {
    if (accountKey && transaction.bank_account_key !== accountKey) continue;
    const current = inPeriod(transaction.date, periods.current);
    const previous = inPeriod(transaction.date, periods.previous);
    if (!current && !previous) continue;

    const amount = transactionEffects(transaction).spending;
    if (amount === 0) continue;

    const label = labelFor(transaction, dimension);
    const key = spendingComparisonGroupKey(transaction, dimension);
    const row = rows.get(key) || {
      key,
      label,
      currentAmount: 0,
      previousAmount: 0,
      difference: 0,
      currentCount: 0,
      previousCount: 0,
    };
    if (current) {
      row.currentAmount += amount;
      row.currentCount += 1;
    } else {
      row.previousAmount += amount;
      row.previousCount += 1;
    }
    rows.set(key, row);
  }

  return [...rows.values()]
    .map(row => ({ ...row, difference: row.currentAmount - row.previousAmount }))
    .sort((a, b) => b.currentAmount - a.currentAmount || a.label.localeCompare(b.label));
}

function validIsoDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const monthIndex = Number(match[2]) - 1;
  const day = Number(match[3]);
  return year > 0 && monthIndex >= 0 && monthIndex < 12 && day > 0 && day <= daysInMonth(year, monthIndex);
}

function dayNumber(value: string): number {
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(0);
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCFullYear(year, month - 1, day);
  return Math.floor(date.getTime() / 86_400_000);
}

function dateFromDayNumber(value: number): string {
  const date = new Date(value * 86_400_000);
  return isoDate(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

/**
 * Returns dates not explicitly covered by complete, confirmed import receipts
 * for this confirmed account. Transaction dates are deliberately never used
 * as a proxy for statement coverage.
 */
export function findCoverageGaps(
  account: BankAccountRecord,
  period: ReviewPeriod,
  receipts: ImportReceipt[],
): DateRange[] {
  const start = dayNumber(period.start);
  const end = dayNumber(period.end);
  if (!account.confirmed || start > end) return [{ start: period.start, end: period.end }];

  const ranges = receipts
    .filter(receipt => receipt.status === 'complete')
    .flatMap(receipt => receipt.coverage || [])
    .filter(range => range.confirmed === true && range.account_key === account.account_key
      && validIsoDate(range.start_date) && validIsoDate(range.end_date) && range.start_date <= range.end_date)
    .map(range => ({ start: Math.max(start, dayNumber(range.start_date)), end: Math.min(end, dayNumber(range.end_date)) }))
    .filter(range => range.start <= range.end)
    .sort((a, b) => a.start - b.start || a.end - b.end);

  const gaps: DateRange[] = [];
  let cursor = start;
  for (const range of ranges) {
    if (range.start > cursor) gaps.push({ start: dateFromDayNumber(cursor), end: dateFromDayNumber(range.start - 1) });
    cursor = Math.max(cursor, range.end + 1);
    if (cursor > end) break;
  }
  if (cursor <= end) gaps.push({ start: dateFromDayNumber(cursor), end: dateFromDayNumber(end) });
  return gaps;
}
