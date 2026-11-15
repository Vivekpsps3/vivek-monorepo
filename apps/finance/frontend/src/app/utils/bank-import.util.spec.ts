import { EncryptedBankImportStore,type EncryptedBankImportPort } from '../crypto/encrypted-store.bank-imports';
import { CustomCsvMapping,ImportPreviewRow,ImportReceipt,Transaction } from '../models/transaction.model';
import {
buildBankImportPreview,
buildBankImportPreviews,
commitBankImportRows,
customCommitRefusal,
resumeBankImportReceipt
} from './bank-import.util';

describe('bank-import util', () => {

  it('reports malformed rows as errors and by-design rows as skipped without aborting the preview', async () => {
    const csv = [
      'Transaction Date,Posted Date,Card No.,Description,Category,Debit,Credit',
      '2026-01-02,2026-01-03,1234,COSTCO GAS,Gas,42.12,',
      'not-a-date,2026-01-03,1234,BAD DATE,Gas,10.00,',
      '2026-01-04,2026-01-05,1234,PAYMENT,Payment,,42.12',
    ].join('\n');

    const preview = await buildBankImportPreview('capital_one', 'capital.csv', csv, new Set());

    expect(preview.summary).toEqual({ total_parsed: 1, new: 1, duplicate: 0, skipped: 1, errors: 1 });
    expect(preview.errors).toEqual([{ line: 3, reason: 'Unrecognized date: "not-a-date"' }]);
    expect(preview.skipped).toEqual([{ line: 4, reason: 'card payment is excluded from spending', kind: 'payment' }]);
    expect(preview.rows.map(row => row.description)).toEqual(['COSTCO GAS']);
  });

  it('commits only non-duplicate preview rows as encrypted expense transactions', async () => {
    const added: any[] = [];
    const store = {
      getTransactions: jasmine.createSpy().and.resolveTo([]),
      addTransaction: jasmine.createSpy().and.callFake(async row => {
        added.push(row);
        return { ...row, id: added.length };
      }),
    };
    const preview = await buildBankImportPreview(
      'amex',
      'amex.csv',
      ['Date,Description,Account #,Amount,Category', '01/02/2026,Coffee,-1001,8.50,Food'].join('\n'),
      new Set()
    );

    const result = await commitBankImportRows(store, preview.rows);

    expect(result).toEqual({ inserted: 1, skipped: 0, batch_id: 0 });
    expect(store.addTransaction).toHaveBeenCalledOnceWith(
      jasmine.objectContaining({
        date: '2026-01-02',
        type: 'expense',
        category: 'Food',
        amount: 8.5,
        description: 'Coffee',
        source: 'import',
        account_display: 'American Express ···1001',
        dedupe_key: preview.rows[0].dedupe_key,
      })
    );
  });

});

describe('multi-file bank import', () => {
  const chase = (name: string, rows = '01/02/2026,01/03/2026,Coffee,Food,Sale,-10.00,') => new File([
    'Transaction Date,Post Date,Description,Category,Type,Amount,Memo\n' + rows,
  ], name);
  const amex = new File(['Date,Description,Account #,Amount,Category\n01/02/2026,Coffee,-1001,10.00,Food'], 'amex.csv');

  it('uses each file bank and deduplicates overlapping statements in file order', async () => {
    const existing = new Set<string>();
    const results = await buildBankImportPreviews([
      { id: 1, bank_slug: 'chase', file: chase('january.csv') },
      { id: 2, bank_slug: 'amex', file: amex },
      { id: 3, bank_slug: 'chase', file: chase('overlap.csv') },
    ], existing);
    expect(results.map(result => result.id)).toEqual([1, 2, 3]);
    expect(results.map(result => result.preview!.summary.new)).toEqual([1, 1, 0]);
    expect(results[2].preview!.rows[0].status).toBe('duplicate');
    expect(results[1].preview!.rows[0].account_display).toBe('American Express ···1001');
    expect(existing.size).toBe(0);
    const stored = new Set([results[0].preview!.rows[0].dedupe_key]);
    const repeated = await buildBankImportPreviews([{ id: 4, bank_slug: 'chase', file: chase('again.csv') }], stored);
    expect(repeated[0].preview!.summary.duplicate).toBe(1);
  });

  it('deduplicates stable account keys across renames while keeping different accounts separate', async () => {
    const csv = await chase('statement.csv').text();
    const first = await buildBankImportPreview('chase', 'statement.csv', csv, new Set(), 'Old Chase name', 'account-A');
    const renamed = await buildBankImportPreview(
      'chase', 'renamed.csv', csv, new Set([first.rows[0].dedupe_key]), 'New Chase name', 'account-A'
    );
    const differentAccount = await buildBankImportPreview(
      'chase', 'other.csv', csv, new Set([first.rows[0].dedupe_key]), 'Other Chase account', 'account-B'
    );

    expect(renamed.rows[0].status).toBe('duplicate');
    expect(renamed.rows[0].account_display).toBe('New Chase name');
    expect(differentAccount.rows[0].status).toBe('new');
    expect(differentAccount.rows[0].dedupe_key).not.toBe(first.rows[0].dedupe_key);
  });

  it('retries a partially failed combined commit without inserting saved rows twice', async () => {
    const previews = await buildBankImportPreviews([
      { id: 1, bank_slug: 'chase', file: chase('chase.csv') },
      { id: 2, bank_slug: 'amex', file: amex },
    ], new Set());
    const rows = previews.flatMap(result => result.preview!.rows);
    const saved: any[] = [];
    let fail = true;
    const store = {
      getTransactions: async () => saved,
      addTransaction: async (row: any) => {
        if (saved.length === 1 && fail) throw new Error('Temporary failure');
        const tx = { ...row, id: saved.length + 1 };
        saved.push(tx);
        return tx;
      },
    };
    await expectAsync(commitBankImportRows(store, rows)).toBeRejectedWithError('Temporary failure');
    expect(saved.length).toBe(1);
    fail = false;
    const result = await commitBankImportRows(store, rows);
    expect(result.inserted).toBe(1);
    expect(result.skipped).toBe(1);
    expect(saved.length).toBe(2);
    expect(new Set(saved.map(row => row.dedupe_key)).size).toBe(2);
  });

});

const signedMapping: CustomCsvMapping = {
  version: 1,
  date_column: 'Date',
  description_column: 'Description',
  amount_column: 'Amount',
  account_column: 'Account',
  category_column: 'Category',
  date_format: 'iso',
  amount_mode: 'signed',
  outflow_sign: 'negative',
  refund_mode: 'description',
  header_row: true,
};

describe('custom CSV adapter', () => {
  const signed = [
    'Date,Description,Amount,Account,Category,Note',
    '2026-04-02,Market refund,12.50,Checking,Food,SECRET-NOTE-77',
    '2026-04-03,Costco gas,-42.12,Checking,Gas,SECRET-NOTE-77',
    '2026-04-03,Costco gas,-42.12,Checking,Gas,SECRET-NOTE-77',
    '2026-04-04,Bus fare,-3.00,Joint,Transit,SECRET-NOTE-77',
  ].join('\n');

  it('CSV2 rejects foreign currency, empty files, and wrong columns without mixing totals', async () => {
    const mixed = [
      'Date,Description,Amount,Currency',
      '2026-04-05,Taxi,-10.00,EUR',
      '2026-04-06,Bus,-3.00,USD',
      '2026-04-07,Tip,-1.00,',
    ].join('\n');
    const mapping: CustomCsvMapping = {
      ...signedMapping, account_column: undefined, category_column: undefined, currency_column: 'Currency',
    };
    const preview = await buildBankImportPreview('custom_csv', 'mixed.csv', mixed, new Set(), 'Cash', 'cash-1', false, new Set(), undefined, mapping);
    expect(preview.rows.map(row => row.description)).toEqual(['Bus']);
    expect(preview.rows.reduce((sum, row) => sum + row.amount, 0)).toBe(3);
    expect(preview.errors.map(note => note.reason)).toEqual([
      'unsupported currency EUR. Finance records USD only.',
      'missing currency. Finance records USD only.',
    ]);
    expect(JSON.stringify(preview.rows)).not.toContain('Taxi');
    expect(preview.rows.some(row => row.amount === 10)).toBeFalse();

    const bareMapping: CustomCsvMapping = { ...signedMapping, account_column: undefined, category_column: undefined };
    await expectAsync(buildBankImportPreview('custom_csv', 'empty.csv', 'Date,Description,Amount\n', new Set(), 'Cash', 'cash-1', false, new Set(), undefined, bareMapping))
      .toBeRejectedWithError('CSV file is empty');
    await expectAsync(buildBankImportPreview('custom_csv', 'wrong.csv', signed, new Set(), 'Cash', 'cash-1', false, new Set(), undefined, { ...signedMapping, date_column: 'When' }))
      .toBeRejectedWithError('Choose a date column that exists in this file.');

    const malformed = await buildBankImportPreview('custom_csv', 'bad.csv', 'Date,Description,Amount,Account\nnot-a-date,Nope,-5,Checking', new Set(), undefined, undefined, false, new Set(), undefined, { ...signedMapping, category_column: undefined });
    expect(malformed.rows).toEqual([]);
    expect(malformed.errors[0].reason).toContain('Unrecognized date');

    const corrected = await buildBankImportPreview('custom_csv', 'mixed.csv', mixed, new Set(), 'Cash', 'cash-1', false, new Set(), undefined, { ...mapping, currency_column: undefined });
    expect(corrected.rows.map(row => row.amount).sort((a, b) => a - b)).toEqual([1, 3, 10]);
    const calls = { transactions: 0, writes: 0 };
    const store = {
      getTransactions: async (): Promise<Transaction[]> => { calls.transactions += 1; return []; },
      addTransaction: async (row: ImportPreviewRow): Promise<Transaction> => {
        calls.writes += 1;
        return { ...row, id: calls.writes, type: 'expense' } as unknown as Transaction;
      },
      addImportReceiptWithRows: jasmine.createSpy('addImportReceiptWithRows'),
    };
    await expectAsync(commitBankImportRows(store, [{ ...corrected.rows[0], currency_code: 'EUR' }])).toBeRejectedWithError('Unsupported currency EUR. Finance records USD only.');
    expect(calls).toEqual({ transactions: 0, writes: 0 });
    expect(store.addImportReceiptWithRows).not.toHaveBeenCalled();
    expect(customCommitRefusal(
      [{ id: 1, bank_slug: 'custom_csv' }],
      [{ id: 1, bank_slug: 'custom_csv', filename: 'mixed.csv', error: null, preview }],
      0,
    )).toContain('unsupported currency EUR');

    const committed = await commitBankImportRows(store, corrected.rows.filter(row => row.description === 'Bus'), {
      bank_slugs: ['custom_csv'], filenames: ['mixed.csv'],
    });
    expect(committed.inserted).toBe(1);
    expect(calls.writes).toBe(1);
  });

  it('CSV3 keeps a failed custom checkpoint uncommitted, resumes, and undo keeps the edited row', async () => {
    const harness = customHarness(0);
    const preview = await buildBankImportPreview('custom_csv', 'signed.csv', signed, new Set(), undefined, undefined, false, new Set(), undefined, signedMapping);
    const selected = preview.rows.filter(row => row.status === 'new');
    await expectAsync(commitBankImportRows(harness.store, selected, {
      bank_slugs: ['custom_csv'], filenames: ['signed.csv'],
      coverage: [{ account_display: 'Checking', account_key: 'checking', start_date: '2026-04-01', end_date: '2026-04-30', confirmed: true }],
    })).toBeRejectedWithError('checkpoint failed');
    expect(harness.transactions).toEqual([]);
    expect(harness.importRows.some(row => row.status === 'staging')).toBeTrue();
    expect(JSON.stringify(harness.importRows)).not.toContain('SECRET-NOTE-77');
    const staged = harness.importRows.find(row => row.record_type === 'bank_receipt');
    expect(staged).toBeDefined();
    await expectAsync(resumeBankImportReceipt(harness.store, staged ? staged.id : 0)).toBeRejectedWithError(/missing staged rows/);

    const live = customHarness(null);
    let completeWrites = 0;
    const conflicting = {
      ...live.store,
      updateImportReceipt: async (id: number, patch: Partial<ImportReceipt>) => {
        if (patch.status === 'complete' && completeWrites++ === 0) throw new Error('session changed');
        return live.store.updateImportReceipt(id, patch);
      },
    };
    await expectAsync(commitBankImportRows(conflicting, selected, {
      bank_slugs: ['custom_csv'], filenames: ['signed.csv'],
      coverage: [{ account_display: 'Checking', account_key: 'checking', start_date: '2026-04-01', end_date: '2026-04-30', confirmed: true }],
    })).toBeRejectedWithError('session changed');
    expect(live.transactions.length).toBe(selected.length);
    const partial = live.importRows.find(row => row.record_type === 'bank_receipt');
    expect(partial?.status).toBe('partial');
    completeWrites = 99;
    const resumed = await resumeBankImportReceipt(live.store, partial ? partial.id : 0);
    expect(resumed.inserted).toBe(0);
    expect(live.transactions.length).toBe(selected.length);

    const finished = customHarness(null);
    const result = await commitBankImportRows(finished.store, selected, {
      bank_slugs: ['custom_csv'], filenames: ['signed.csv'],
      coverage: [{ account_display: 'Checking', account_key: 'checking', start_date: '2026-04-01', end_date: '2026-04-30', confirmed: true }],
    });
    finished.transactions[0].import_edited = true;
    finished.transactions[0].merchant = 'Edited shop';
    const receiptId = result.receipt_id;
    expect(receiptId).toBeTruthy();
    const undone = await finished.bank.undoImportReceipt(receiptId || 0);
    expect(undone.edited).toBe(1);
    expect(undone.removed).toBe(selected.length - 1);
    expect(finished.transactions.map(row => row.description)).toEqual([selected[0].description]);
    const receipt = await finished.bank.getImportReceipt(receiptId || 0);
    expect(receipt?.status).toBe('withdrawn');
    expect(receipt?.coverage).toEqual([]);
    expect(JSON.stringify(finished.importRows)).not.toContain('SECRET-NOTE-77');
  });
});

type StoredImport = { id: number; record_type?: string; status?: string; receipt_id?: number };

function customHarness(failCheckpoint: number | null) {
  const importRows: StoredImport[] = [];
  const transactions: Transaction[] = [];
  let nextId = 100;
  const remember = (row: StoredImport) => {
    const index = importRows.findIndex(item => item.id === row.id);
    if (index >= 0) importRows[index] = row;
    else importRows.push(row);
  };
  const port: EncryptedBankImportPort = {
    ensureLoaded: async () => undefined,
    getImportRows: <T>() => importRows as T[],
    allocateId: () => ++nextId,
    upsertImportRecord: async <T extends { id?: number }>(payload: T) => {
      const row = { ...payload, id: payload.id ?? ++nextId } as T & StoredImport;
      remember(row);
      return row;
    },
    removeImportRecord: async (id: number) => {
      const index = importRows.findIndex(item => item.id === id);
      if (index >= 0) importRows.splice(index, 1);
    },
    savePreparedRecords: async <T extends { id: number }>(records: T[]) => {
      if (failCheckpoint === 0) throw new Error('checkpoint failed');
      for (const record of records) remember(record as T & StoredImport);
      return records;
    },
    getTransactions: async () => transactions,
    deleteTransactions: async (ids: number[]) => {
      for (const id of ids) {
        const index = transactions.findIndex(row => row.id === id);
        if (index >= 0) transactions.splice(index, 1);
      }
    },
    sessionToken: () => 1,
    assertSession: () => undefined,
    runRecordUpdate: async (_collection, _id, _generation, update) => update(),
  };
  const bank = new EncryptedBankImportStore(port);
  const store = {
    getTransactions: async () => transactions,
    addTransaction: async (row: ImportPreviewRow) => {
      const saved = { ...row, id: transactions.length + 1, type: row.kind === 'income' ? 'income' : 'expense' } as unknown as Transaction;
      transactions.push(saved);
      return saved;
    },
    addImportReceiptWithRows: (body: Omit<ImportReceipt, 'id'>, rows: ImportPreviewRow[]) => bank.addImportReceiptWithRows(body, rows),
    saveImportReceiptRows: (id: number, rows: ImportPreviewRow[]) => bank.saveImportReceiptRows(id, rows),
    getImportReceiptRows: (id: number) => bank.getImportReceiptRows(id),
    getImportReceipt: (id: number) => bank.getImportReceipt(id),
    updateImportReceipt: (id: number, patch: Partial<ImportReceipt>) => bank.updateImportReceipt(id, patch),
  };
  return { bank, store, importRows, transactions };
}
