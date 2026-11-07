import {
  bankExportHelp,
  importButtonLabel,
  importFileError,
  importSummaryLine,
  receiptLine,
  undoConfirmBody,
} from './bank-import-copy';

describe('bank-import-copy', () => {
  it('gives per-bank export help with a plain default', () => {
    expect(bankExportHelp('chase')).toContain('Download account activity');
    expect(bankExportHelp('capital_one')).toContain('Capital One');
    expect(bankExportHelp('amex')).toContain('American Express');
    expect(bankExportHelp('citi')).toContain('Citi');
    expect(bankExportHelp('bank_of_america')).toContain('Bank of America');
    expect(bankExportHelp('x_money')).toContain('X Money');
    expect(bankExportHelp('')).toBe('Download a CSV of your transactions from your bank, then choose that file here.');
    expect(bankExportHelp('unknown_bank')).toBe(bankExportHelp(''));
  });

  it('maps header problems to the not-a-bank-export line', () => {
    expect(importFileError('Missing required header: Transaction Date'))
      .toBe("This file doesn't look like a bank export. Download the CSV from your bank and try again.");
    expect(importFileError('Unknown column layout')).toBe(importFileError('Missing required header: X'));
  });

  it('maps empty files and ambiguous accounts', () => {
    expect(importFileError('The file is empty')).toBe('That file has no transactions in it.');
    expect(importFileError('Account match is ambiguous for this file'))
      .toBe("We couldn't tell which account this file belongs to. Pick the account and try again.");
  });

  it('never surfaces raw or stack-shaped errors', () => {
    const raw = 'TypeError: Cannot read properties of undefined\n    at parse (bank.ts:10:5)';
    expect(importFileError(raw)).toBe("That file couldn't be read. Download a fresh CSV from your bank and try again.");
    expect(importFileError('x'.repeat(300))).toBe(importFileError(raw));
    expect(importFileError('')).toBe('');
    expect(importFileError(null)).toBe('');
  });

  it('builds the one summary line', () => {
    expect(importSummaryLine({ total_parsed: 10, new: 4, duplicate: 5, skipped: 1, errors: 0 }, 6))
      .toBe('10 read · 6 new · 5 already imported · 1 skipped.');
    expect(importSummaryLine({ total_parsed: 10, new: 4, duplicate: 5, skipped: 1, errors: 2 }, 6))
      .toBe("10 read · 6 new · 5 already imported · 1 skipped · 2 couldn't be read.");
  });

  it('labels the import button for every state', () => {
    expect(importButtonLabel(6, 3)).toBe('Import 3 transactions');
    expect(importButtonLabel(6, 1)).toBe('Import 1 transaction');
    expect(importButtonLabel(6, 0)).toBe('Select the transactions to import');
    expect(importButtonLabel(0, 0)).toBe('Nothing importable in these files');
  });

  it('builds the undo confirm body from counts, omitting zero clauses', () => {
    expect(undoConfirmBody({ removable: 3, editedKept: 1, alreadyGone: 2 }))
      .toBe('Remove 3 transactions this import added. 1 transaction you edited will stay. 2 transactions are already gone. This also removes the statement coverage this import confirmed.');
    expect(undoConfirmBody({ removable: 0, editedKept: 0, alreadyGone: 0 }))
      .toBe('Nothing from this import is left to remove. This also removes the statement coverage this import confirmed.');
    expect(undoConfirmBody({ removable: 1, editedKept: 0, alreadyGone: 0 }))
      .toBe('Remove 1 transaction this import added. This also removes the statement coverage this import confirmed.');
  });

  it('renders receipt lines with sentence-case status labels', () => {
    expect(receiptLine({ filenames: ['chase.csv'], dateLabel: 'Oct 30, 2026', status: 'complete', saved: 12, needFixing: 0 }))
      .toBe('chase.csv · Oct 30, 2026 · Imported · 12 saved');
    expect(receiptLine({ filenames: ['a.csv', 'b.csv'], dateLabel: 'Oct 30, 2026', status: 'partial', saved: 3, needFixing: 2 }))
      .toBe('a.csv, b.csv · Oct 30, 2026 · Partly imported · 3 saved · 2 need fixing');
    expect(receiptLine({ filenames: [], dateLabel: 'Oct 30, 2026', status: 'withdrawn', saved: 0, needFixing: 0 }))
      .toBe('Bank CSV import · Oct 30, 2026 · Undone · 0 saved');
  });
});
