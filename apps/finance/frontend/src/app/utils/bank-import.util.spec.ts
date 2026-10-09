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
    expect(preview.skipped).toEqual([{ line: 3, reason: 'credit of $42.12 is not imported' }]);
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
    expect(preview.skipped).toEqual([{ line: 4, reason: 'credit of $42.12 is not imported' }]);
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
    expect(preview.skipped).toEqual([{ line: 3, reason: 'credit of $25.00 is not imported' }]);
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
