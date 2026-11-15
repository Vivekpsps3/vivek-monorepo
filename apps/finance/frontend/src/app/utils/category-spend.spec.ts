import { Transaction } from '../models/transaction.model';
import { categorySpend } from './category-spend';

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

});
