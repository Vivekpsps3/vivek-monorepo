import { BankAccountRecord,ImportReceipt } from '../models/transaction.model';
import { buildSpendingSuggestion } from './planning-spending.util';

const now = new Date('2026-10-11T12:00:00.000Z');
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

describe('planning-spending.util', () => {

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

});
