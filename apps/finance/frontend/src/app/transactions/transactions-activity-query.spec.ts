import { Transaction } from '../models/transaction.model';
import {
transactionActivityTotals
} from './transactions-activity-query';

const row = (overrides: Partial<Transaction>): Transaction => ({
  id: 1,
  date: '2026-10-05',
  type: 'expense',
  category: 'Food and Drink',
  amount: 0,
  description: '',
  ...overrides,
} as Transaction);

describe('activity totals and category filter', () => {

  it('payments, transfers and ambiguous credits count nowhere', () => {
    const totals = transactionActivityTotals([
      row({ id: 1, kind: 'payment', amount: 50 }),
      row({ id: 2, kind: 'transfer', amount: 50 }),
      row({ id: 3, kind: 'ambiguous_credit', type: 'income', amount: 30 }),
      row({ id: 4, kind: 'income', type: 'income', amount: 100 }),
    ]);
    expect(totals.purchaseCount).toBe(0);
    expect(totals.refundCount).toBe(0);
    expect(totals.monthExpenseTotal).toBe(0);
    expect(totals.incomeCount).toBe(1);
    expect(totals.monthIncomeTotal).toBe(100);
    expect(totals.excludedCount).toBe(0);
  });

});
