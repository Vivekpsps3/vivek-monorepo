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
});
