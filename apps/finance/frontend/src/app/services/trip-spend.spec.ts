import { fromDollars } from '@vivek/browser';
import { transactionEffects } from '../crypto/client-finance';
import type { Transaction } from '../models/transaction.model';
import { FINANCE_TRIP_SPEND_CURRENCY, financeTripSpendLookup } from './trip-spend';

function row(patch: Partial<Transaction>): Transaction {
  return {
    id: 1,
    date: '2026-06-01',
    type: 'expense',
    category: 'Travel',
    amount: 10,
    kind: 'purchase',
    trip_id: 7,
    ...patch,
  };
}

describe('financeTripSpendLookup', () => {
  it('nets refunds in USD, counts those rows, and skips income, zero-spend, and invalid trip ids', () => {
    const purchase = row({ id: 1, amount: 10, kind: 'purchase', trip_id: 7 });
    const refund = row({ id: 2, amount: 3.25, kind: 'refund', trip_id: 7 });
    const income = row({ id: 3, amount: 80, type: 'income', kind: 'income', trip_id: 7 });
    const payment = row({ id: 4, amount: 40, kind: 'payment', trip_id: 7 });
    const badTrip = row({ id: 5, amount: 99, trip_id: 0 });
    const otherTrip = row({ id: 6, amount: 4, trip_id: 8 });
    const invalidAmount = row({ id: 7, amount: Number.NaN, trip_id: 7 });
    const cents = (fromDollars(transactionEffects(purchase).spending) ?? 0)
      + (fromDollars(transactionEffects(refund).spending) ?? 0);

    const lookup = financeTripSpendLookup([purchase, refund, income, payment, badTrip, otherTrip, invalidAmount]);

    expect(lookup(7)).toEqual([{ currency: FINANCE_TRIP_SPEND_CURRENCY, cents, count: 2 }]);
    expect(lookup(8)).toEqual([{
      currency: FINANCE_TRIP_SPEND_CURRENCY,
      cents: fromDollars(transactionEffects(otherTrip).spending) ?? 0,
      count: 1,
    }]);
    expect(lookup(9)).toEqual([]);
    expect(cents).toBe(675);
  });
});
