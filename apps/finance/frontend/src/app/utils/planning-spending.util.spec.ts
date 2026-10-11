import { BankAccountRecord, ImportReceipt, Transaction } from '../models/transaction.model';
import { buildSpendingSuggestion, lastThreeCompletedMonths } from './planning-spending.util';

const now = new Date('2026-10-11T12:00:00.000Z');
const period = lastThreeCompletedMonths(now);
const accounts: BankAccountRecord[] = [
  { id: 1, bank_slug: 'chase', account_mask: '1111', account_key: 'checking-a', display_name: 'Checking', confirmed: true },
  { id: 2, bank_slug: 'amex', account_mask: '2222', account_key: 'card-b', display_name: 'Card', confirmed: true },
];

function receipt(id: number, accountKey: string, start: string, end: string, status: ImportReceipt['status'] = 'complete'): ImportReceipt {
  return {
    id, bank_slugs: ['chase'], filenames: [`${id}.csv`], status,
    started_at: '2026-10-01T00:00:00Z', selected_row_count: 0, inserted_count: 0,
    unresolved: [], account_displays: ['Checking'],
    coverage: [{ account_display: 'Checking', account_key: accountKey, start_date: start, end_date: end, confirmed: true }],
  };
}

function tx(id: number, account: string, date: string, kind: Transaction['kind'], amount: number, category = 'Food'): Transaction {
  return { id, bank_account_key: account, date, type: 'expense', category, amount, kind } as Transaction;
}

describe('planning-spending.util', () => {
  it('uses the last three completed calendar months', () => {
    expect(period).toEqual({ start: '2026-07-01', end: '2026-09-30', months: ['2026-07', '2026-08', '2026-09'] });
  });

  it('merges confirmed per-account receipt intervals but refuses a date gap', () => {
    const context = {
      transactions: [],
      accounts,
      receipts: [
        receipt(1, 'checking-a', '2026-07-01', '2026-08-15'),
        receipt(2, 'checking-a', '2026-08-16', '2026-09-30'),
        receipt(3, 'card-b', '2026-07-01', '2026-09-29'),
        receipt(4, 'card-b', '2026-09-01', '2026-09-30', 'partial'),
      ],
      selectedAccountKeys: ['checking-a', 'card-b'],
      selectedCategories: ['*'],
      now,
    };
    const incomplete = buildSpendingSuggestion(context);
    expect(incomplete.canSuggest).toBeFalse();
    expect(incomplete.coverageGaps).toEqual([{ accountKey: 'card-b', from: '2026-09-30', through: '2026-09-30' }]);

    const complete = buildSpendingSuggestion({
      ...context,
      receipts: [...context.receipts, receipt(5, 'card-b', '2026-09-30', '2026-09-30')],
    });
    expect(complete.canSuggest).toBeTrue();
    expect(complete.includedReceiptIds).toContain(5);
  });

  it('requires confirmed receipt coverage and ignores staged, withdrawn, and unknown accounts', () => {
    const result = buildSpendingSuggestion({
      transactions: [],
      accounts,
      receipts: [
        receipt(1, 'checking-a', period.start, period.end, 'staged'),
        receipt(2, 'deleted-account', period.start, period.end),
      ],
      selectedAccountKeys: ['checking-a'],
      selectedCategories: ['*'],
      now,
    });
    expect(result.canSuggest).toBeFalse();
    expect(result.coverageGaps.length).toBe(1);
    expect(result.includedReceiptIds).toEqual([]);
  });

  it('rejects malformed calendar dates in otherwise confirmed receipt coverage', () => {
    const result = buildSpendingSuggestion({
      transactions: [], accounts,
      receipts: [receipt(1, 'checking-a', '2026-07-01', '2026-09-30'), receipt(2, 'card-b', '2026-02-30', '2026-09-30')],
      selectedAccountKeys: ['card-b'], selectedCategories: ['*'], now,
    });
    expect(result.canSuggest).toBeFalse();
    expect(result.coverageGaps[0].accountKey).toBe('card-b');
  });

  it('annualizes purchases and refunds while excluding payments, transfers, ambiguous credits, and selected recurring rows', () => {
    const result = buildSpendingSuggestion({
      transactions: [
        tx(1, 'checking-a', '2026-07-02', 'purchase', 100),
        tx(2, 'checking-a', '2026-08-02', 'refund', 25),
        tx(3, 'checking-a', '2026-09-02', 'payment', 500),
        tx(4, 'checking-a', '2026-09-03', 'transfer', 500),
        tx(5, 'checking-a', '2026-09-04', 'ambiguous_credit', 500),
        tx(6, 'checking-a', '2026-09-05', 'purchase', 50, 'Utilities'),
      ],
      accounts,
      receipts: [receipt(9, 'checking-a', period.start, period.end)],
      selectedAccountKeys: ['checking-a'],
      selectedCategories: ['Food', 'Utilities'],
      excludedRecurringTransactionIds: [6],
      now,
    });
    expect(result.canSuggest).toBeTrue();
    expect(result.transactionCount).toBe(2);
    expect(result.annualSuggestion).toBe(300);
  });

  it('accepts zero spending when all selected accounts have complete coverage', () => {
    const result = buildSpendingSuggestion({
      transactions: [], accounts,
      receipts: [receipt(1, 'checking-a', period.start, period.end)],
      selectedAccountKeys: ['checking-a'], selectedCategories: ['*'], now,
    });
    expect(result.canSuggest).toBeTrue();
    expect(result.annualSuggestion).toBe(0);
  });
});
