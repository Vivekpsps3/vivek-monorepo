import { fromDollars } from '@vivek/browser';
import { transactionEffects } from '../crypto/client-finance';
import type { Transaction } from '../models/transaction.model';
import { FINANCE_TRIP_SPEND_CURRENCY, confirmPostedSpend, financeTripSpendLookup, tripSpendPostingLabel } from './trip-spend';

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
    const purchaseCents = fromDollars(transactionEffects(purchase).spending) ?? 0;
    const refundCents = fromDollars(transactionEffects(refund).spending) ?? 0;
    const cents = purchaseCents + refundCents;
    const otherCents = fromDollars(transactionEffects(otherTrip).spending) ?? 0;

    const lookup = financeTripSpendLookup([purchase, refund, income, payment, badTrip, otherTrip, invalidAmount]);

    expect(lookup(7)).toEqual([{
      currency: FINANCE_TRIP_SPEND_CURRENCY,
      cents,
      count: 2,
      postings: [
        { id: 1, cents: purchaseCents, label: '2026-06-01 · Travel' },
        { id: 2, cents: refundCents, label: '2026-06-01 · Travel' },
      ],
    }]);
    expect(lookup(8)).toEqual([{
      currency: FINANCE_TRIP_SPEND_CURRENCY,
      cents: otherCents,
      count: 1,
      postings: [{ id: 6, cents: otherCents, label: '2026-06-01 · Travel' }],
    }]);
    expect(lookup(9)).toEqual([]);
    expect(cents).toBe(675);
  });

  it('counts a repeated id in the total once in the posting list', () => {
    const lookup = financeTripSpendLookup([
      row({ id: 1, amount: 10, trip_id: 7 }),
      row({ id: 1, amount: 4, trip_id: 7 }),
    ]);
    expect(lookup(7)).toEqual([{
      currency: FINANCE_TRIP_SPEND_CURRENCY,
      cents: 1400,
      count: 2,
      postings: [{ id: 1, cents: 1000, label: '2026-06-01 · Travel' }],
    }]);
  });

  it('publishes date and category only', () => {
    const secret = row({
      id: 1,
      description: 'SYN flight marker',
      merchant: 'Hidden airline',
      account_display: 'Hidden card',
      trip_id: 7,
    });
    const published = JSON.stringify(financeTripSpendLookup([secret])(7));
    expect(published).not.toContain('SYN flight marker');
    expect(published).not.toContain('Hidden airline');
    expect(published).not.toContain('Hidden card');
    expect(published).toContain('2026-06-01 · Travel');
    expect(tripSpendPostingLabel({ date: 'yesterday', category: 'Travel' })).toBe('Travel');
    expect(tripSpendPostingLabel({ date: '2026-06-01', category: '  ' })).toBe('2026-06-01 · Posted');
    expect(tripSpendPostingLabel({ date: '', category: '' })).toBe('Posted');
  });
});

describe('confirmPostedSpend', () => {
  const rows = [row({ id: 4, amount: 10, trip_id: 7 })];

  it('returns the narrow posting and does not treat a read failure as a missing row', async () => {
    const finance = { readTripSpendLedgerStatus: async () => ({ rows }) };
    await expectAsync(confirmPostedSpend(finance, 7, 4)).toBeResolvedTo({
      status: 'posted',
      posting: { id: 4, cents: 1000, label: '2026-06-01 · Travel' },
    });
    await expectAsync(confirmPostedSpend(finance, 7, 9)).toBeResolvedTo({ status: 'missing' });
    await expectAsync(confirmPostedSpend(
      { readTripSpendLedgerStatus: async () => 'invalid' },
      7,
      4,
    )).toBeResolvedTo({ status: 'invalid' });
    await expectAsync(confirmPostedSpend(
      { readTripSpendLedgerStatus: async () => 'failed' },
      7,
      4,
    )).toBeResolvedTo({ status: 'failed' });
    await expectAsync(confirmPostedSpend(
      { readTripSpendLedgerStatus: async () => { throw new Error('offline'); } },
      7,
      4,
    )).toBeResolvedTo({ status: 'failed' });
  });
});
