import { fromDollars } from '@vivek/browser';
import type { TripSpendLookup } from '@vivek/ui';
import { transactionEffects } from '../crypto/client-finance';
import type { Transaction } from '../models/transaction.model';
import { normalizeTripId } from '../transactions/trip-tag';

/** Transactions have no currency field. Trip tags total Finance's supported currency only. */
export const FINANCE_TRIP_SPEND_CURRENCY = 'USD';

/**
 * One lookup from the shared transaction-effect rules.
 * Refunds subtract, income and zero-spend rows are omitted, and invalid trip ids are omitted.
 */
export function financeTripSpendLookup(rows: readonly Transaction[]): TripSpendLookup {
  const totals = new Map<number, { cents: number; count: number }>();
  for (const row of rows) {
    const tripId = normalizeTripId(row?.trip_id);
    if (tripId == null) continue;
    const effect = transactionEffects(row);
    if (effect.excluded || effect.spending === 0) continue;
    const cents = fromDollars(effect.spending);
    if (cents == null || cents === 0) continue;
    const current = totals.get(tripId) ?? { cents: 0, count: 0 };
    current.cents += cents;
    current.count += 1;
    totals.set(tripId, current);
  }
  return tripId => {
    const id = normalizeTripId(tripId);
    const total = id == null ? undefined : totals.get(id);
    if (!total) return [];
    return [{ currency: FINANCE_TRIP_SPEND_CURRENCY, cents: total.cents, count: total.count }];
  };
}
