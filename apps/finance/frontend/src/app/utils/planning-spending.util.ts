import { BankAccountRecord, ImportReceipt, Transaction } from '../models/transaction.model';
import { transactionEffects } from '../crypto/client-finance';

export interface SpendingPeriod {
  start: string;
  end: string;
  months: string[];
}

export interface SpendingCoverageGap {
  accountKey: string;
  from: string;
  through: string;
}

export interface SpendingSuggestionResult {
  period: SpendingPeriod;
  canSuggest: boolean;
  coverageGaps: SpendingCoverageGap[];
  invalidAccountKeys: string[];
  monthlyAverage: number | null;
  annualSuggestion: number | null;
  includedReceiptIds: number[];
  eligibleTransactions: Transaction[];
  transactionCount: number;
}

export interface SpendingSuggestionOptions {
  transactions: Transaction[];
  receipts: ImportReceipt[];
  accounts: BankAccountRecord[];
  selectedAccountKeys: string[];
  selectedCategories: string[];
  excludedRecurringTransactionIds?: number[];
  now?: Date;
}

/** Returns the three full calendar months immediately before the current browser-local month. */
export function lastThreeCompletedMonths(now = new Date()): SpendingPeriod {
  const year = now.getFullYear();
  const month = now.getMonth();
  const first = new Date(year, month - 3, 1);
  const last = new Date(year, month, 0);
  const months = Array.from({ length: 3 }, (_, offset) => {
    const date = new Date(year, month - 3 + offset, 1);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
  });
  return { start: isoDate(first), end: isoDate(last), months };
}

function isoDate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function isIsoCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function shiftIsoDate(value: string, days: number): string {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

function accountCoverage(
  accountKey: string,
  receipts: ImportReceipt[],
  period: SpendingPeriod
): { covered: boolean; gap?: SpendingCoverageGap; receiptIds: number[] } {
  const intervals: Array<{ start: string; end: string; receiptId: number }> = [];
  for (const receipt of receipts) {
    if (receipt.status !== 'complete') continue;
    for (const row of receipt.coverage || []) {
      if (row.confirmed !== true || row.account_key !== accountKey) continue;
      if (!isIsoCalendarDate(row.start_date) || !isIsoCalendarDate(row.end_date) || row.start_date > row.end_date) continue;
      const start = row.start_date < period.start ? period.start : row.start_date;
      const end = row.end_date > period.end ? period.end : row.end_date;
      if (start <= end) intervals.push({ start, end, receiptId: receipt.id });
    }
  }
  intervals.sort((a, b) => a.start.localeCompare(b.start) || b.end.localeCompare(a.end));
  let cursor = period.start;
  const contributing = new Set<number>();
  for (const interval of intervals) {
    if (interval.end < cursor) continue;
    if (interval.start > cursor) {
      return {
        covered: false,
        gap: { accountKey, from: cursor, through: shiftIsoDate(interval.start, -1) },
        receiptIds: [...contributing],
      };
    }
    contributing.add(interval.receiptId);
    cursor = shiftIsoDate(interval.end, 1);
    if (cursor > period.end) return { covered: true, receiptIds: [...contributing] };
  }
  return {
    covered: false,
    gap: { accountKey, from: cursor, through: period.end },
    receiptIds: [...contributing],
  };
}

function isEligibleSpend(tx: Transaction): boolean {
  return transactionEffects(tx).spending !== 0;
}

/**
 * Builds a coverage-qualified, explicitly selected spending estimate. Receipt coverage is
 * checked per stable account key and merged as a date union, so unrelated intervals cannot
 * hide an account-specific gap.
 */
export function buildSpendingSuggestion(options: SpendingSuggestionOptions): SpendingSuggestionResult {
  const period = lastThreeCompletedMonths(options.now);
  const selectedAccountKeys = [...new Set(options.selectedAccountKeys.filter(Boolean))];
  const selectedCategories = new Set(options.selectedCategories.filter(Boolean));
  const accountByKey = new Map(options.accounts.map(account => [account.account_key, account]));
  const invalidAccountKeys = selectedAccountKeys.filter(key => !accountByKey.get(key)?.confirmed);
  const coverageGaps: SpendingCoverageGap[] = [];
  const receiptIds = new Set<number>();
  for (const key of selectedAccountKeys) {
    if (!accountByKey.get(key)?.confirmed) continue;
    const coverage = accountCoverage(key, options.receipts, period);
    if (!coverage.covered && coverage.gap) coverageGaps.push(coverage.gap);
    for (const id of coverage.receiptIds) receiptIds.add(id);
  }

  const hasCategorySelection = selectedCategories.size > 0;
  const canSuggest = selectedAccountKeys.length > 0
    && invalidAccountKeys.length === 0
    && coverageGaps.length === 0
    && hasCategorySelection;
  const accountsSelected = new Set(selectedAccountKeys);
  const excluded = new Set(options.excludedRecurringTransactionIds || []);
  const eligibleTransactions = options.transactions.filter(tx => {
    if (!accountsSelected.has(tx.bank_account_key || '')) return false;
    if (tx.date < period.start || tx.date > period.end || !isEligibleSpend(tx)) return false;
    const category = (tx.category || '').trim() || 'Uncategorized';
    if (!selectedCategories.has('*') && !selectedCategories.has(category)) return false;
    if (excluded.has(tx.id)) return false;
    return true;
  });
  const netSpend = eligibleTransactions.reduce((sum, tx) => sum + transactionEffects(tx).spending, 0);
  // A fully covered three-month period with no recorded expenses is a valid $0 estimate.
  const annualSuggestion = canSuggest ? Math.max(0, (netSpend / 3) * 12) : null;
  const usedReceipts = new Set<number>();
  for (const key of selectedAccountKeys) {
    const coverage = accountCoverage(key, options.receipts, period);
    for (const id of coverage.receiptIds) usedReceipts.add(id);
  }
  return {
    period,
    canSuggest,
    coverageGaps,
    invalidAccountKeys,
    monthlyAverage: annualSuggestion == null ? null : annualSuggestion / 12,
    annualSuggestion,
    includedReceiptIds: [...usedReceipts].sort((a, b) => a - b),
    eligibleTransactions,
    transactionCount: eligibleTransactions.length,
  };
}

export function spendingCategories(
  transactions: Transaction[],
  selectedAccountKeys: string[],
  period: SpendingPeriod
): string[] {
  const accounts = new Set(selectedAccountKeys);
  const labels = new Set<string>();
  for (const tx of transactions) {
    if (!accounts.has(tx.bank_account_key || '') || tx.date < period.start || tx.date > period.end || !isEligibleSpend(tx)) continue;
    labels.add((tx.category || '').trim() || 'Uncategorized');
  }
  return ['*', ...[...labels].sort((a, b) => a.localeCompare(b))];
}
