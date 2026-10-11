import {
  buildBankImportPreview,
  buildBankImportPreviews,
  commitBankImportRows,
  listClientBankImports,
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
});
