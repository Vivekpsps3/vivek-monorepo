import { Transaction } from '../models/transaction.model';
import { categorySpend, chartSlices, monthDelta } from './category-spend';

function tx(values: Partial<Transaction>): Transaction {
  return values as Transaction;
}

const october = [
  tx({ id: 1, date: '2026-10-03', type: 'expense', kind: 'purchase', category: 'Food', amount: 12 }),
  tx({ id: 2, date: '2026-10-04', type: 'expense', kind: 'purchase', category: 'Food', amount: 5.25 }),
  tx({ id: 3, date: '2026-10-05', type: 'expense', kind: 'refund', category: 'Shopping', amount: 3.25 }),
  tx({ id: 4, date: '2026-10-06', type: 'income', kind: 'payment', category: 'Card', amount: 500 }),
  tx({ id: 5, date: '2026-09-30', type: 'expense', kind: 'purchase', category: 'Food', amount: 99 }),
];

describe('categorySpend', () => {
  it('nets refunds against their category and excludes payments', () => {
    const result = categorySpend(october, '2026-10');
    expect(result.totalNet).toBe(14);
    expect(result.totalPurchases).toBe(17.25);
    expect(result.rows).toEqual([
      { label: 'Food', net: 17.25, purchases: 17.25, share: 100 },
      { label: 'Shopping', net: -3.25, purchases: 0, share: (-3.25 / 17.25) * 100 },
    ]);
  });

  it('reports a null share when the month has no purchases', () => {
    const result = categorySpend([tx({ date: '2026-10-05', kind: 'refund', category: 'Shopping', amount: 3.25 })], '2026-10');
    expect(result.rows[0].share).toBeNull();
    expect(result.totalNet).toBe(-3.25);
  });

  it('clamps negative nets to zero for chart slices only', () => {
    const { rows } = categorySpend(october, '2026-10');
    expect(chartSlices(rows)).toEqual([
      { label: 'Food', value: 17.25 },
      { label: 'Shopping', value: 0 },
    ]);
    expect(rows[1].net).toBe(-3.25);
  });
});

describe('monthDelta', () => {
  const txs = [
    tx({ date: '2026-11-02', kind: 'purchase', category: 'Food', amount: 10 }),
    tx({ date: '2026-11-20', kind: 'purchase', category: 'Food', amount: 50 }),
    tx({ date: '2026-10-05', kind: 'purchase', category: 'Food', amount: 4 }),
    tx({ date: '2026-10-25', kind: 'purchase', category: 'Food', amount: 40 }),
  ];

  it('compares the current month through today with the same prior-month window', () => {
    const result = monthDelta(txs, '2026-11', new Date(2026, 10, 14));
    expect(result.current).toBe(10);
    expect(result.prior).toBe(4);
    expect(result.delta).toBe(6);
    expect(result.label).toBe('vs Oct 1–14');
  });

  it('uses the full month for a completed month', () => {
    const result = monthDelta(txs, '2026-10', new Date(2026, 10, 14));
    expect(result.current).toBe(44);
    expect(result.prior).toBe(0);
    expect(result.label).toBe('vs Sep 1–30');
  });
});
