import { BankAccountRecord, ImportReceipt, Transaction } from '../models/transaction.model';
import { buildSpendingReviewPeriods, compareSpending, findCoverageGaps } from './spending-review.util';

describe('spending review comparisons', () => {
  it('compares the same elapsed day count in both windows when the prior month is shorter', () => {
    const march = buildSpendingReviewPeriods('2026-03', new Date(2026, 2, 31));
    expect(march).toEqual({
      current: { month: '2026-03', start: '2026-03-01', end: '2026-03-28' },
      previous: { month: '2026-02', start: '2026-02-01', end: '2026-02-28' },
      partialCurrentMonth: true,
      matchedElapsedDays: 28,
      omittedCurrentDays: 3,
    });

    const historical = buildSpendingReviewPeriods('2026-03', new Date(2026, 9, 11));
    expect(historical?.current.end).toBe('2026-03-31');
    expect(historical?.previous.end).toBe('2026-02-28');
    expect(historical?.omittedCurrentDays).toBe(0);
  });

  it('omits the unmatched elapsed day from the selected month for March 29 and May 31 boundaries', () => {
    const march = buildSpendingReviewPeriods('2026-03', new Date(2026, 2, 29));
    expect(march?.current.end).toBe('2026-03-28');
    expect(march?.previous.end).toBe('2026-02-28');
    expect(march?.omittedCurrentDays).toBe(1);

    const may = buildSpendingReviewPeriods('2026-05', new Date(2026, 4, 31));
    expect(may?.current.end).toBe('2026-05-30');
    expect(may?.previous.end).toBe('2026-04-30');
    expect(may?.omittedCurrentDays).toBe(1);
  });

  it('groups net spending by category or merchant, keeping refunds and excluding non-spend kinds', () => {
    const periods = buildSpendingReviewPeriods('2026-06', new Date(2026, 5, 30))!;
    const rows: Transaction[] = [
      { id: 1, date: '2026-06-04', type: 'expense', kind: 'purchase', category: 'Food', merchant: 'Cafe', amount: 80 },
      { id: 2, date: '2026-06-05', type: 'income', kind: 'refund', category: 'Food', merchant: 'Cafe', amount: 15 },
      { id: 3, date: '2026-06-06', type: 'expense', kind: 'payment', category: 'Food', merchant: 'Cafe', amount: 200 },
      { id: 4, date: '2026-06-07', type: 'expense', kind: 'transfer', category: 'Food', merchant: 'Cafe', amount: 50 },
      { id: 5, date: '2026-06-08', type: 'expense', kind: 'ambiguous_credit', category: 'Food', merchant: 'Cafe', amount: 10 },
      { id: 6, date: '2026-05-04', type: 'expense', kind: 'purchase', category: 'Food', merchant: 'Cafe', amount: 60 },
      { id: 7, date: '2026-07-01', type: 'expense', kind: 'purchase', category: 'Food', merchant: 'Cafe', amount: 999 },
    ];

    const category = compareSpending(rows, periods, 'category');
    const merchant = compareSpending(rows, periods, 'merchant');
    expect(category).toEqual([jasmine.objectContaining({ label: 'Food', currentAmount: 65, previousAmount: 60, difference: 5, currentCount: 2, previousCount: 1 })]);
    expect(merchant).toEqual([jasmine.objectContaining({ label: 'Cafe', currentAmount: 65, previousAmount: 60, difference: 5 })]);
  });

  it('filters to a selected confirmed account while the all-account view retains manual activity', () => {
    const periods = buildSpendingReviewPeriods('2026-06', new Date(2026, 5, 30))!;
    const rows: Transaction[] = [
      { id: 1, date: '2026-06-04', type: 'expense', category: 'Food', amount: 80, bank_account_key: 'account-a' },
      { id: 2, date: '2026-06-05', type: 'expense', category: 'Food', amount: 25, bank_account_key: 'account-b' },
      { id: 3, date: '2026-06-06', type: 'expense', category: 'Food', amount: 10 },
    ];
    expect(compareSpending(rows, periods, 'category', 'account-a')[0].currentAmount).toBe(80);
    expect(compareSpending(rows, periods, 'category')[0].currentAmount).toBe(115);
  });

  it('reports coverage gaps only from complete receipts with explicit coverage for the confirmed account', () => {
    const account: BankAccountRecord = {
      id: 1, bank_slug: 'bank', account_mask: '1234', account_key: 'account-a', display_name: 'Checking', confirmed: true,
    };
    const receipt = (id: number, status: ImportReceipt['status'], accountKey: string, start: string, end: string): ImportReceipt => ({
      id,
      bank_slugs: ['bank'],
      filenames: ['statement.csv'],
      status,
      started_at: '2026-06-10T00:00:00Z',
      selected_row_count: 0,
      inserted_count: 0,
      unresolved: [],
      account_displays: ['Checking'],
      coverage: [{ account_key: accountKey, account_display: 'Checking', start_date: start, end_date: end, confirmed: true }],
    });
    const period = { month: '2026-06', start: '2026-06-01', end: '2026-06-10' };
    const receipts = [
      receipt(1, 'complete', 'account-a', '2026-06-01', '2026-06-03'),
      receipt(2, 'partial', 'account-a', '2026-06-04', '2026-06-10'),
      receipt(3, 'complete', 'account-b', '2026-06-04', '2026-06-10'),
    ];
    expect(findCoverageGaps(account, period, receipts)).toEqual([{ start: '2026-06-04', end: '2026-06-10' }]);
    expect(findCoverageGaps(account, period, [
      receipt(4, 'complete', 'account-a', '2026-06-01', '2026-06-05'),
      receipt(5, 'complete', 'account-a', '2026-06-06', '2026-06-10'),
    ])).toEqual([]);
  });
});
