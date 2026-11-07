import { fromDollars, toDollars } from '@vivek/browser';
import { transactionEffects } from '../crypto/client-finance';
import { Transaction } from '../models/transaction.model';

export interface CategorySpendRow {
  label: string;
  /** Signed net spend in dollars (refunds reduce it; may be negative). */
  net: number;
  /** Gross purchases in dollars (the share denominator). */
  purchases: number;
  /** net / gross purchases x 100 for the whole set; null when no purchases. */
  share: number | null;
}

export interface CategorySpend {
  rows: CategorySpendRow[];
  totalNet: number;
  totalPurchases: number;
}

type SpendTx = Pick<Transaction, 'date' | 'type' | 'category' | 'description' | 'amount' | 'kind'>;

function monthKeyOf(month: string): string {
  return month.slice(0, 7);
}

function inMonth(date: string, month: string): boolean {
  const key = monthKeyOf(month);
  return !key || date.startsWith(`${key}-`);
}

/**
 * Refund-aware category spend for one month, in integer cents.
 * Purchases add, refunds subtract (F2.2); payment/transfer effects are zero
 * in transactionEffects and never reach a row. Share is net over gross
 * purchases, so a refund-heavy category can read negative or over 100%.
 */
export function categorySpend(transactions: SpendTx[], month: string): CategorySpend {
  const byLabel = new Map<string, { netCents: number; purchaseCents: number }>();
  let totalNetCents = 0;
  let totalPurchaseCents = 0;
  for (const tx of transactions) {
    if (!inMonth(tx.date, month)) continue;
    const effect = transactionEffects(tx as Transaction);
    if (!effect.spending) continue;
    const cents = fromDollars(effect.spending) ?? 0;
    const label = (tx.category ?? '').trim() || 'Uncategorized';
    const row = byLabel.get(label) ?? { netCents: 0, purchaseCents: 0 };
    row.netCents += cents;
    if (cents > 0) row.purchaseCents += cents;
    byLabel.set(label, row);
    totalNetCents += cents;
    if (cents > 0) totalPurchaseCents += cents;
  }
  const rows = [...byLabel.entries()]
    .map(([label, row]) => ({
      label,
      net: toDollars(row.netCents),
      purchases: toDollars(row.purchaseCents),
      share: totalPurchaseCents > 0 ? (row.netCents / totalPurchaseCents) * 100 : null,
    }))
    .sort((a, b) => Math.abs(b.net) - Math.abs(a.net));
  return { rows, totalNet: toDollars(totalNetCents), totalPurchases: toDollars(totalPurchaseCents) };
}

/** Chart-safe slices: negative nets clamp to 0 for the doughnut only. */
export function chartSlices(rows: CategorySpendRow[]): { label: string; value: number }[] {
  return rows.map(row => ({ label: row.label, value: Math.max(0, row.net) }));
}

export interface MonthDelta {
  /** Current month net spend minus the like-for-like prior-month window. */
  delta: number;
  /** e.g. "vs Oct 1–14". */
  label: string;
  current: number;
  prior: number;
}

function monthParts(month: string): { year: number; monthIndex: number } {
  const [year, m] = monthKeyOf(month).split('-').map(Number);
  return { year, monthIndex: m - 1 };
}

function daysIn(year: number, monthIndex: number): number {
  return new Date(year, monthIndex + 1, 0).getDate();
}

function netSpendThrough(transactions: SpendTx[], month: string, throughDay: number): number {
  let cents = 0;
  for (const tx of transactions) {
    if (!inMonth(tx.date, month)) continue;
    const day = Number(tx.date.slice(8, 10));
    if (!Number.isFinite(day) || day > throughDay) continue;
    cents += fromDollars(transactionEffects(tx as Transaction).spending) ?? 0;
  }
  return toDollars(cents);
}

/**
 * Like-for-like month delta (F2.3): both months are summed through the same
 * day-of-month — today for the current month, the prior month's last day
 * when the viewed month is complete. Future months yield a zero delta.
 */
export function monthDelta(transactions: SpendTx[], month: string, today: Date = new Date()): MonthDelta {
  const { year, monthIndex } = monthParts(month);
  const key = monthKeyOf(month);
  const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
  const monthDays = daysIn(year, monthIndex);
  let throughDay: number;
  if (key === todayKey) throughDay = today.getDate();
  else if (key < todayKey) throughDay = monthDays;
  else return { delta: 0, label: '', current: 0, prior: 0 };

  const priorDate = new Date(year, monthIndex - 1, 1);
  const priorKey = `${priorDate.getFullYear()}-${String(priorDate.getMonth() + 1).padStart(2, '0')}`;
  const priorEnd = Math.min(throughDay, daysIn(priorDate.getFullYear(), priorDate.getMonth()));
  const current = netSpendThrough(transactions, key, throughDay);
  const prior = netSpendThrough(transactions, priorKey, priorEnd);
  const priorMonthName = priorDate.toLocaleString('en-US', { month: 'short' });
  return {
    delta: toDollars((fromDollars(current) ?? 0) - (fromDollars(prior) ?? 0)),
    label: `vs ${priorMonthName} 1–${priorEnd}`,
    current,
    prior,
  };
}
