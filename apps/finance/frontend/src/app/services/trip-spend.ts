import { fromDollars } from '@vivek/browser';
import type { TripSpendConfirmResult, TripSpendLookup, TripSpendPosting } from '@vivek/ui';
import { transactionEffects } from '../crypto/client-finance';
import type { Transaction } from '../models/transaction.model';
import { normalizeTripId } from '../transactions/trip-tag';

/** Transactions have no currency field. Trip tags total Finance's supported currency only. */
export const FINANCE_TRIP_SPEND_CURRENCY = 'USD';

export type TripSpendConfirm = TripSpendConfirmResult;

interface SpendBucket {
  cents: number;
  count: number;
  postings: TripSpendPosting[];
  seen: Set<number>;
}

/** Date and category only. Description, merchant, and account stay in the ledger. */
export function tripSpendPostingLabel(row: Pick<Transaction, 'date' | 'category'>): string {
  const date = typeof row.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(row.date) ? row.date : '';
  const category = typeof row.category === 'string' ? row.category.trim() : '';
  if (date && category) return `${date} · ${category}`;
  if (date) return `${date} · Posted`;
  if (category) return category;
  return 'Posted';
}

/**
 * One lookup from the shared transaction-effect rules.
 * Refunds subtract, income and zero-spend rows are omitted, and invalid trip ids are omitted.
 * Each counted row is also a narrow posting so Travel can link it without a second ledger.
 */
export function financeTripSpendLookup(rows: readonly Transaction[]): TripSpendLookup {
  const totals = new Map<number, SpendBucket>();
  for (const row of rows) {
    const tripId = normalizeTripId(row?.trip_id);
    if (tripId == null) continue;
    const effect = transactionEffects(row);
    if (effect.excluded || effect.spending === 0) continue;
    const cents = fromDollars(effect.spending);
    if (cents == null || cents === 0) continue;
    const current = totals.get(tripId) ?? { cents: 0, count: 0, postings: [], seen: new Set<number>() };
    current.cents += cents;
    current.count += 1;
    const postingId = normalizeTripId(row?.id);
    if (postingId != null && !current.seen.has(postingId)) {
      current.seen.add(postingId);
      current.postings.push({ id: postingId, cents, label: tripSpendPostingLabel(row) });
    }
    totals.set(tripId, current);
  }
  return tripId => {
    const id = normalizeTripId(tripId);
    const total = id == null ? undefined : totals.get(id);
    if (!total) return [];
    return [{
      currency: FINANCE_TRIP_SPEND_CURRENCY,
      cents: total.cents,
      count: total.count,
      postings: total.postings,
    }];
  };
}

/**
 * Re-read the same ledger before a link is kept.
 * `invalid` is lock or a session change. `failed` is an ordinary read error.
 * `missing` means the unlocked ledger no longer has that posted row.
 */
export async function confirmPostedSpend(
  finance: { readTripSpendLedgerStatus(): Promise<'invalid' | 'failed' | { rows: readonly Transaction[] }> },
  tripId: number,
  transactionId: number,
): Promise<TripSpendConfirm> {
  const trip = normalizeTripId(tripId);
  const postingId = normalizeTripId(transactionId);
  if (trip == null || postingId == null) return { status: 'missing' };
  let status: 'invalid' | 'failed' | { rows: readonly Transaction[] };
  try {
    status = await finance.readTripSpendLedgerStatus();
  } catch {
    return { status: 'failed' };
  }
  if (status === 'invalid' || status === 'failed') return { status };
  const posting = financeTripSpendLookup(status.rows)(trip)
    .flatMap(row => row.postings ?? [])
    .find(row => row.id === postingId);
  if (!posting) return { status: 'missing' };
  return { status: 'posted', posting: { id: posting.id, cents: posting.cents, label: posting.label } };
}
