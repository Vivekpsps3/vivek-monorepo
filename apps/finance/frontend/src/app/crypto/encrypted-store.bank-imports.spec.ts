import { ImportReceipt, Transaction } from '../models/transaction.model';
import { EncryptedBankImportStore, type EncryptedBankImportPort } from './encrypted-store.bank-imports';

type StoredImportRow = { id: number } & Record<string, unknown>;

function makeStore() {
  const importRows: StoredImportRow[] = [];
  const transactions: Transaction[] = [];
  let nextId = 100;
  const port: EncryptedBankImportPort = {
    ensureLoaded: async () => undefined,
    getImportRows: <T>() => importRows as unknown as T[],
    allocateId: () => ++nextId,
    upsertImportRecord: async <T extends { id?: number }>(payload: T) => {
      const row: StoredImportRow = { ...payload, id: payload.id ?? ++nextId };
      const index = importRows.findIndex(item => item.id === row.id);
      if (index >= 0) importRows[index] = row; else importRows.push(row);
      return row as unknown as T;
    },
    removeImportRecord: async (id: number) => {
      const index = importRows.findIndex(item => item.id === id);
      if (index >= 0) importRows.splice(index, 1);
    },
    savePreparedRecords: async <T extends { id: number }>(records: T[]) => records,
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
  return { store: new EncryptedBankImportStore(port), importRows, transactions };
}

const snapshot = {
  date: '2026-09-10', type: 'expense', category: 'Food', amount: 10,
  description: 'SOURCE', merchant: null, kind: 'purchase', reviewed: false,
} as Transaction['import_snapshot'];

async function seedReceipt(store: EncryptedBankImportStore, transactions: Transaction[]): Promise<ImportReceipt> {
  const receipt = await store.addImportReceipt({
    bank_slugs: ['chase'], filenames: ['statement.csv'], status: 'complete',
    started_at: '2026-10-01T00:00:00Z', selected_row_count: 3, inserted_count: 3,
    unresolved: [], account_displays: ['Card'],
  } as Omit<ImportReceipt, 'id'>);
  transactions.push(
    { id: 1, import_receipt_id: receipt.id, import_snapshot: snapshot, ...snapshot } as unknown as Transaction,
    { id: 2, import_receipt_id: receipt.id, import_snapshot: snapshot, ...snapshot, import_edited: true } as unknown as Transaction,
  );
  return receipt;
}

describe('EncryptedBankImportStore F9', () => {
  it('previews undo counts without changing anything', async () => {
    const { store, transactions } = makeStore();
    const receipt = await seedReceipt(store, transactions);
    // inserted_count is 3 but only 2 rows remain linked: 1 already gone.
    const preview = await store.previewUndoImportReceipt(receipt.id);
    expect(preview).toEqual({ removable: 1, editedKept: 1, alreadyGone: 1 });
    expect(transactions.length).toBe(2);
    expect((await store.getImportReceipt(receipt.id))?.status).toBe('complete');
  });

  it('deletes only the receipt record and its row chunks; transactions stay', async () => {
    const { store, transactions, importRows } = makeStore();
    const receipt = await seedReceipt(store, transactions);
    importRows.push({ id: 555, record_type: 'bank_receipt_rows', receipt_id: receipt.id, chunk_index: 0, rows: [] });
    await store.deleteImportReceipt(receipt.id);
    expect(await store.getImportReceipt(receipt.id)).toBeNull();
    expect(importRows.some(row => row.id === 555)).toBeFalse();
    expect(transactions.length).toBe(2);
  });

  it('stamps undone_at when an undo completes', async () => {
    const { store, transactions } = makeStore();
    const receipt = await seedReceipt(store, transactions);
    const result = await store.undoImportReceipt(receipt.id);
    expect(result.removed).toBe(1);
    const after = await store.getImportReceipt(receipt.id);
    expect(after?.status).toBe('withdrawn');
    expect(after?.undone_at).toBeTruthy();
  });

  it('keeps a custom mapping profile out of the receipt list and ignores a newer format', async () => {
    const { store, importRows } = makeStore();
    const mapping = {
      version: 1 as const, date_column: 'Date', description_column: 'Description', amount_column: 'Amount',
      date_format: 'iso' as const, amount_mode: 'signed' as const, outflow_sign: 'negative' as const,
      refund_mode: 'description' as const, header_row: true,
    };
    await store.saveCsvMappingProfile({ name: 'Checking export', mapping });
    await store.saveCsvMappingProfile({ name: 'Checking export', mapping: { ...mapping, outflow_sign: 'positive' } });
    const profiles = await store.listCsvMappingProfiles();
    expect(profiles.map(row => row.name)).toEqual(['Checking export']);
    expect(profiles[0].format_version).toBe(1);
    expect(profiles[0].mapping.outflow_sign).toBe('positive');
    expect(JSON.stringify(profiles)).not.toContain('SECRET-NOTE-77');
    expect(await store.getImportReceipts()).toEqual([]);
    importRows.push({ id: 9, record_type: 'csv_mapping_profile', format_version: 2, name: 'later', mapping });
    expect((await store.listCsvMappingProfiles()).map(row => row.name)).toEqual(['Checking export']);
  });

  it('undo of a custom receipt keeps the edited row and withdraws coverage', async () => {
    const { store, transactions } = makeStore();
    const receipt = await store.addImportReceipt({
      bank_slugs: ['custom_csv'], filenames: ['custom.csv'], status: 'complete',
      started_at: '2026-10-01T00:00:00Z', selected_row_count: 2, inserted_count: 2,
      unresolved: [], account_displays: ['Checking'],
      coverage: [{ account_display: 'Checking', account_key: 'checking', start_date: '2026-04-01', end_date: '2026-04-30', confirmed: true }],
      coverage_start: '2026-04-01', coverage_end: '2026-04-30',
    } as Omit<ImportReceipt, 'id'>);
    const customSnapshot = { ...snapshot, source_bank: 'custom_csv', account_display: 'Checking' };
    transactions.push(
      { id: 1, import_receipt_id: receipt.id, import_snapshot: customSnapshot, ...customSnapshot } as unknown as Transaction,
      { id: 2, import_receipt_id: receipt.id, import_snapshot: customSnapshot, ...customSnapshot, import_edited: true, merchant: 'Edited shop' } as unknown as Transaction,
    );
    const result = await store.undoImportReceipt(receipt.id);
    expect(result.edited).toBe(1);
    expect(result.removed).toBe(1);
    expect(transactions.map(row => row.merchant)).toEqual(['Edited shop']);
    const after = await store.getImportReceipt(receipt.id);
    expect(after?.status).toBe('withdrawn');
    expect(after?.coverage).toEqual([]);
  });
});
