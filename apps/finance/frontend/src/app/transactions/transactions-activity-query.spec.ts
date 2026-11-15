import {
  filterTransactionActivity,
  transactionActivityTotals,
  type TransactionActivityFilters,
} from './transactions-activity-query';
import { Transaction } from '../models/transaction.model';

const row = (overrides: Partial<Transaction>): Transaction => ({
  id: 1,
  date: '2026-10-05',
  type: 'expense',
  category: 'Food and Drink',
  amount: 0,
  description: '',
  ...overrides,
} as Transaction);

const filters = (overrides: Partial<TransactionActivityFilters> = {}): TransactionActivityFilters => ({
  searchTerm: '',
  typeFilter: 'all',
  summaryMonth: '',
  fromDate: '',
  throughDate: '',
  selectedCalendarDate: null,
  accountFilter: '',
  categoryFilter: '',
  merchantFilter: '',
  receiptFilter: '',
  ...overrides,
});

describe('activity totals and category filter', () => {
  it('two purchases and one refund → purchaseCount 2, refundCount 1, expense net of refund', () => {
    const totals = transactionActivityTotals([
      row({ id: 1, kind: 'purchase', amount: 10 }),
      row({ id: 2, kind: 'purchase', amount: 9 }),
      row({ id: 3, kind: 'refund', amount: 5 }),
    ]);
    expect(totals.purchaseCount).toBe(2);
    expect(totals.refundCount).toBe(1);
    expect(totals.monthExpenseTotal).toBe(14);
  });

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

  it('category filter keeps the matching group and leaves the other rows out', () => {
    const rows = filterTransactionActivity([
      row({ id: 1, category: 'Food and Drink', kind: 'purchase', amount: 10, description: 'Cafe' }),
      row({ id: 2, category: 'Travel', kind: 'purchase', amount: 20, description: 'Train' }),
    ], filters({ categoryFilter: 'food and drink' }));
    expect(rows.map(item => item.id)).toEqual([1]);
  });

  it('excluded rows count only in excludedCount', () => {
    const totals = transactionActivityTotals([
      row({ id: 1, kind: 'purchase', amount: -5 }),
      row({ id: 2, kind: 'purchase', amount: 10 }),
    ]);
    expect(totals.excludedCount).toBe(1);
    expect(totals.purchaseCount).toBe(1);
    expect(totals.refundCount).toBe(0);
    expect(totals.monthExpenseTotal).toBe(10);
  });
});
