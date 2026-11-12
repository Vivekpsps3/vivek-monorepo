import { CustomCsvMapping, ImportPreviewRow, ImportReceipt, Transaction } from '../models/transaction.model';
import { EncryptedBankImportStore, type EncryptedBankImportPort } from '../crypto/encrypted-store.bank-imports';
import { buildDedupeKey } from './bank-import.parsers';
import {
  buildBankImportPreview,
  buildBankImportPreviews,
  commitBankImportRows,
  customCommitRefusal,
  listClientBankImports,
  resumeBankImportReceipt,
} from './bank-import.util';

describe('bank-import util', () => {
  it('lists supported client-side bank CSV importers', () => {
    expect(listClientBankImports().map(b => b.slug)).toEqual([
      'capital_one',
      'chase',
      'amex',
      'citi',
      'bank_of_america',
      'x_money',
      'custom_csv',
    ]);
  });

  it('previews Capital One expenses without sending CSV to the backend', async () => {
    const csv = [
      'Transaction Date,Posted Date,Card No.,Description,Category,Debit,Credit',
      '2026-01-02,2026-01-03,1234,COSTCO GAS,Gas,42.12,',
      '2026-01-04,2026-01-05,1234,PAYMENT,Payment,,42.12',
    ].join('\n');

    const preview = await buildBankImportPreview('capital_one', 'capital.csv', csv, new Set());

    expect(preview.bank).toBe('Capital One');
    expect(preview.summary).toEqual({ total_parsed: 1, new: 1, duplicate: 0, skipped: 1, errors: 0 });
    expect(preview.rows[0]).toEqual(
      jasmine.objectContaining({
        date: '2026-01-02',
        account_mask: '1234',
        account_display: 'Capital One ···1234',
        description: 'COSTCO GAS',
        category: 'Costco',
        amount: 42.12,
        status: 'new',
      })
    );
    expect(preview.rows[0].dedupe_key).toMatch(/^[a-f0-9]{64}$/);
    expect(preview.skipped).toEqual([{ line: 3, reason: 'card payment is excluded from spending', kind: 'payment' }]);
  });

  it('accepts a Capital One CSV without a card column when a file account was selected', async () => {
    const csv = [
      'Transaction Date,Posted Date,Description,Category,Debit,Credit',
      '2026-01-02,2026-01-03,Coffee,Food,12.00,',
    ].join('\n');
    const selected = await buildBankImportPreview(
      'capital_one', 'no-card-number.csv', csv, new Set(), 'Capital One card', 'account-A', false, new Set(), ''
    );
    const unselected = await buildBankImportPreview('capital_one', 'no-card-number.csv', csv, new Set());

    expect(selected.summary).toEqual({ total_parsed: 1, new: 1, duplicate: 0, skipped: 0, errors: 0 });
    expect(selected.rows[0]).toEqual(jasmine.objectContaining({
      account_display: 'Capital One card', account_key: 'account-A', source_account_mask: '', amount: 12,
    }));
    expect(unselected.summary.errors).toBe(1);
    expect(unselected.errors[0].reason).toBe('missing card number');
  });

  it('accepts selected-file account identity when Amex, Citi, or X Money omits its account column', async () => {
    const cases = [
      { bank: 'amex', file: 'amex.csv', mask: 'amex', csv: 'Date,Description,Amount\n01/02/2026,Coffee,8.50' },
      { bank: 'citi', file: 'citi.csv', mask: 'citi', csv: 'Status,Date,Description,Debit,Credit\nCleared,01/02/2026,Coffee,8.50,' },
      { bank: 'x_money', file: 'x.csv', mask: '', csv: 'Date,Description,Type,Category,Amount,Status\n2026-01-02,Coffee,Card purchase,Food,-8.50,Completed' },
    ];
    for (const row of cases) {
      const preview = await buildBankImportPreview(
        row.bank, row.file, row.csv, new Set(), `${row.bank} selected account`, 'selected-account', false, new Set(), ''
      );
      expect(preview.summary).withContext(row.bank).toEqual({ total_parsed: 1, new: 1, duplicate: 0, skipped: 0, errors: 0 });
      expect(preview.rows[0]).withContext(row.bank).toEqual(jasmine.objectContaining({
        account_key: 'selected-account', account_display: `${row.bank} selected account`, source_account_mask: row.mask,
      }));
    }
  });

  it('marks existing and same-file duplicate rows during preview', async () => {
    const csv = [
      'Transaction Date,Post Date,Description,Category,Type,Amount,Memo',
      '01/02/2026,01/03/2026,Groceries,Food,Sale,-10.00,',
      '01/02/2026,01/03/2026,Groceries,Food,Sale,-10.00,',
    ].join('\n');
    const first = await buildBankImportPreview('chase', 'chase.csv', csv, new Set());
    const existing = new Set([first.rows[0].dedupe_key]);

    const second = await buildBankImportPreview('chase', 'chase.csv', csv, existing);

    expect(first.summary).toEqual({ total_parsed: 2, new: 1, duplicate: 1, skipped: 0, errors: 0 });
    expect(second.summary).toEqual({ total_parsed: 2, new: 0, duplicate: 2, skipped: 0, errors: 0 });
  });

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

  it('previews Bank of America Posted Date/Payee expenses and skips credits', async () => {
    const csv = [
      'Posted Date,Reference Number,Payee,Address,Amount',
      '08/10/2026,24492166220100038524860,"OPENROUTER, INC OPENROUTER.AINY","OPENROUTER.AI NY ",-21.10',
      '08/11/2026,24492166220100038524861,"ONLINE PAYMENT, THANK YOU","",25.00',
    ].join('\n');

    const preview = await buildBankImportPreview('bank_of_america', 'boa.csv', csv, new Set());

    expect(preview.bank).toBe('Bank of America');
    expect(preview.summary).toEqual({ total_parsed: 1, new: 1, duplicate: 0, skipped: 1, errors: 0 });
    expect(preview.rows[0]).toEqual(
      jasmine.objectContaining({
        date: '2026-08-10',
        account_mask: 'boa',
        account_display: 'Bank of America ···boa',
        description: 'OPENROUTER, INC OPENROUTER.AINY',
        category: 'Uncategorized',
        amount: 21.1,
        status: 'new',
      })
    );
    expect(preview.skipped).toEqual([{ line: 3, reason: 'card payment is excluded from spending', kind: 'payment' }]);
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

  it('updates a selected legacy bank account record by id while preserving its stable account key', async () => {
    const preview = await buildBankImportPreview(
      'chase', 'legacy-account.csv',
      'Transaction Date,Post Date,Description,Category,Type,Amount,Memo\n01/02/2026,01/03/2026,Coffee,Food,Sale,-10.00,',
      new Set(), 'Chase Checking', 'legacy-bank-account:41'
    );
    const store = {
      getTransactions: async () => [],
      addTransaction: async (row: any) => ({ ...row, id: 1 }),
      upsertBankAccount: jasmine.createSpy('upsertBankAccount').and.resolveTo({ id: 41 } as any),
    };

    await commitBankImportRows(store, preview.rows, {
      confirmed_bank_accounts: [{
        id: 41, bank_slug: 'chase', account_mask: '', account_key: 'legacy-bank-account:41',
        display_name: 'Chase Checking', confirmed: true,
      }],
    });

    expect(store.upsertBankAccount).toHaveBeenCalledOnceWith(jasmine.objectContaining({
      id: 41, bank_slug: 'chase', account_key: 'legacy-bank-account:41',
      display_name: 'Chase Checking', confirmed: true,
    }));
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

  it('reports file errors without dropping good files, including mismatched banks and unreadable files', async () => {
    const unreadable = chase('unreadable.csv');
    spyOn(unreadable, 'text').and.rejectWith(new Error('Cannot read file'));
    const results = await buildBankImportPreviews([
      { id: 1, bank_slug: 'chase', file: chase('good.csv') },
      { id: 2, bank_slug: 'amex', file: chase('wrong-bank.csv') },
      { id: 3, bank_slug: 'chase', file: new File(['not csv'], 'statement.pdf') },
      { id: 4, bank_slug: 'chase', file: unreadable },
      { id: 5, bank_slug: 'amex', file: amex },
    ], new Set());
    expect(results[0].preview!.summary.new).toBe(1);
    expect(results[1].error).toContain('Missing required columns');
    expect(results[2].error).toContain('.csv');
    expect(results[3].error).toBe('Cannot read file');
    expect(results[4].preview!.summary.new).toBe(1);
    expect(results[1].filename).toBe('wrong-bank.csv');
  });

  it('keeps row-level errors and skipped rows attached to their source file', async () => {
    const file = chase('rows.csv', [
      'bad-date,01/03/2026,Coffee,Food,Sale,-10.00,',
      '01/02/2026,01/03/2026,Payment,Food,Payment,10.00,',
      '01/02/2026,01/03/2026,Coffee,Food,Sale,-10.00,',
    ].join('\n'));
    const [result] = await buildBankImportPreviews([{ id: 1, bank_slug: 'chase', file }], new Set());
    expect(result.preview!.errors[0].line).toBe(2);
    expect(result.preview!.skipped[0].line).toBe(3);
    expect(result.preview!.summary.new).toBe(1);
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

  it('matches old unassigned transactions only when legacy account mapping is explicitly enabled', async () => {
    const csv = await chase('legacy.csv').text();
    const legacy = await buildBankImportPreview('chase', 'legacy.csv', csv, new Set());
    const unassignedKey = legacy.rows[0].dedupe_key;
    const stored = new Set([unassignedKey]);
    const stableLegacyKeys = new Set([unassignedKey]);
    const defaultPreview = await buildBankImportPreview(
      'chase', 'legacy.csv', csv, stored, 'Chase Sapphire', 'account-A', false, stableLegacyKeys
    );
    const mappedPreview = await buildBankImportPreview(
      'chase', 'legacy.csv', csv, stored, 'Chase Sapphire', 'account-A', true, stableLegacyKeys, 'card'
    );

    expect(defaultPreview.rows[0].status).toBe('new');
    expect(defaultPreview.rows[0].legacy_dedupe_key).toBeUndefined();
    expect(mappedPreview.rows[0].status).toBe('duplicate');
    expect(mappedPreview.rows[0].legacy_dedupe_key).toBe(unassignedKey);
    expect(mappedPreview.rows[0].source_account_mask).toBe('card');
  });

  it('does not infer a legacy match from a selected mask when the source CSV has no historical identity', async () => {
    const withMask = [
      'Transaction Date,Posted Date,Card No.,Description,Category,Debit,Credit',
      '2026-01-02,2026-01-03,card,Coffee,Food,10.00,',
    ].join('\n');
    const historical = await buildBankImportPreview('capital_one', 'with-mask.csv', withMask, new Set());
    const withoutMask = [
      'Transaction Date,Posted Date,Description,Category,Debit,Credit',
      '2026-01-02,2026-01-03,Coffee,Food,10.00,',
    ].join('\n');

    const preview = await buildBankImportPreview(
      'capital_one', 'without-mask.csv', withoutMask, new Set(), 'Selected card', 'account-card',
      true, new Set([historical.rows[0].dedupe_key]), 'card'
    );

    expect(preview.rows[0].status).toBe('new');
    expect(preview.rows[0].legacy_dedupe_key).toBeUndefined();
    expect(preview.rows[0].source_account_mask).toBe('card');
  });

  it('binds explicitly mapped legacy rows without changing financial meaning or review state', async () => {
    const csv = await chase('legacy.csv').text();
    const legacy = await buildBankImportPreview('chase', 'legacy.csv', csv, new Set());
    const oldKey = legacy.rows[0].dedupe_key;
    const preview = await buildBankImportPreview(
      'chase', 'legacy.csv', csv, new Set([oldKey]), 'Chase Sapphire', 'account-A', true, new Set([oldKey]), 'card'
    );
    const existing: any = {
      id: 23,
      date: preview.rows[0].date,
      type: 'expense',
      category: 'Refunds',
      amount: 10,
      description: preview.rows[0].description,
      source: 'import',
      dedupe_key: oldKey,
      kind: 'refund',
      reviewed: true,
      review_reason: 'Reviewed credit',
      import_edited: false,
    };
    const store = {
      getTransactions: async () => [existing],
      addTransaction: jasmine.createSpy('addTransaction'),
      updateTransaction: async (id: number, patch: any) => {
        expect(id).toBe(existing.id);
        Object.assign(existing, patch);
        return existing;
      },
    };

    const result = await commitBankImportRows(store, preview.rows);

    expect(result.inserted).toBe(0);
    expect(result.skipped).toBe(1);
    expect(store.addTransaction).not.toHaveBeenCalled();
    expect(existing).toEqual(jasmine.objectContaining({
      type: 'expense', category: 'Refunds', amount: 10, kind: 'refund', reviewed: true,
      review_reason: 'Reviewed credit', account_display: 'Chase Sapphire', bank_account_key: 'account-A',
      source_bank: 'chase', source_account_mask: 'card', dedupe_key: preview.rows[0].dedupe_key,
    }));
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

  it('replaces only the corrected file rows and parse notes in a multi-file receipt', async () => {
    const correctedPreview = await buildBankImportPreviews([
      { id: 3, bank_slug: 'chase', file: chase('corrected.csv') },
    ], new Set());
    const correctedRows = correctedPreview[0].preview!.rows;
    expect(correctedRows[0].source_filename).toBe('corrected.csv');
    const keptRow = { ...correctedRows[0], dedupe_key: 'other-file-row', source_filename: 'other.csv' };
    const replacedRow = { ...correctedRows[0], dedupe_key: 'old-file-row', source_filename: 'broken.csv' };
    const stagedRows = [keptRow, replacedRow];
    const receipt: any = {
      id: 41,
      bank_slugs: ['chase'],
      filenames: ['broken.csv', 'other.csv'],
      status: 'partial',
      started_at: '2026-01-01T00:00:00Z',
      selected_row_count: 2,
      inserted_count: 0,
      unresolved: [{ line: 4, filename: 'broken.csv', reason: 'Unrecognized date: bad date' }],
      account_displays: ['Chase card'],
      coverage: [],
    };
    const savedTransactions: any[] = [];
    const store: any = {
      getTransactions: async () => savedTransactions,
      addTransaction: async (row: any) => {
        const saved = { ...row, id: savedTransactions.length + 1 };
        savedTransactions.push(saved);
        return saved;
      },
      getImportReceipt: async () => receipt,
      getImportReceiptRows: async () => stagedRows,
      saveImportReceiptRows: async (_id: number, rows: any[]) => { stagedRows.splice(0, stagedRows.length, ...rows); },
      updateImportReceipt: async (_id: number, patch: any) => Object.assign(receipt, patch),
    };

    await commitBankImportRows(store, correctedRows, {
      resume_receipt_id: 41,
      replace_filename: 'broken.csv',
      bank_slugs: ['chase'],
      filenames: ['corrected.csv'],
      unresolved: [],
      account_displays: ['Chase card'],
    });

    expect(stagedRows.map(row => row.source_filename).sort()).toEqual(['corrected.csv', 'other.csv']);
    expect(receipt.filenames).toEqual(['other.csv', 'corrected.csv']);
    expect(receipt.unresolved).toEqual([]);
    expect(receipt.status).toBe('complete');
    expect(savedTransactions.length).toBe(2);
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

const splitMapping: CustomCsvMapping = {
  version: 1,
  date_column: 'Posted',
  description_column: 'Details',
  debit_column: 'Debit',
  credit_column: 'Credit',
  account_column: 'Account',
  category_column: 'Category',
  date_format: 'dmy',
  amount_mode: 'debit_credit',
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
  const split = [
    'Posted;Details;Debit;Credit;Account;Category',
    '03/04/2026;Costco gas;42.12;;Checking;Gas',
    '03/04/2026;Store return;;9.00;Savings;Shopping',
  ].join('\n');

  it('CSV1 maps signed and debit-credit rows, refunds, and accounts onto one dedupe policy', async () => {
    const signedPreview = await buildBankImportPreview('custom_csv', 'signed.csv', signed, new Set(), undefined, undefined, false, new Set(), undefined, signedMapping);
    const splitPreview = await buildBankImportPreview('custom_csv', 'split.csv', split, new Set([signedPreview.rows[1].dedupe_key]), undefined, undefined, false, new Set(), undefined, splitMapping);

    expect(signedPreview.summary).toEqual({ total_parsed: 4, new: 3, duplicate: 1, skipped: 0, errors: 0 });
    expect(signedPreview.rows.map(row => ({ description: row.description, amount: row.amount, kind: row.kind, account: row.account_display, status: row.status, category: row.category }))).toEqual([
      { description: 'Market refund', amount: 12.5, kind: 'refund', account: 'Checking', status: 'new', category: 'Food' },
      { description: 'Costco gas', amount: 42.12, kind: 'purchase', account: 'Checking', status: 'new', category: 'Costco' },
      { description: 'Costco gas', amount: 42.12, kind: 'purchase', account: 'Checking', status: 'duplicate', category: 'Costco' },
      { description: 'Bus fare', amount: 3, kind: 'purchase', account: 'Joint', status: 'new', category: 'Transit' },
    ]);
    expect(signedPreview.rows[1].dedupe_key).toBe(await buildDedupeKey('custom_csv', 'Checking', '2026-04-03', 42.12, 'Costco gas'));
    expect(splitPreview.rows[0].status).toBe('duplicate');
    expect(splitPreview.rows[0].dedupe_key).toBe(signedPreview.rows[1].dedupe_key);
    expect(splitPreview.rows[1]).toEqual(jasmine.objectContaining({
      date: '2026-04-03', amount: 9, kind: 'refund', account_display: 'Savings', description: 'Store return',
    }));
    expect(JSON.stringify(signedPreview)).not.toContain('SECRET-NOTE-77');
  });

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
