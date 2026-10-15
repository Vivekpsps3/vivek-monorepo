import {
  ImportPreviewRow,
  ImportReceipt,
  ImportReceiptRows,
  Transaction,
} from '../models/transaction.model';

export interface EncryptedBankImportPort {
  ensureLoaded(): Promise<void>;
  getImportRows<T>(): T[];
  allocateId(): number;
  upsertImportRecord<T extends { id?: number }>(payload: T, clientId?: string, generation?: number): Promise<T>;
  savePreparedRecords<T extends { id: number }>(records: T[], replaceExisting?: boolean): Promise<T[]>;
  getTransactions(): Promise<Transaction[]>;
  deleteTransactions(ids: number[]): Promise<void>;
  sessionToken(): number;
  assertSession(generation: number): void;
}

/** Owns staged bank receipt checkpoints, resume, and safe undo reconciliation. */
export class EncryptedBankImportStore {
  constructor(private port: EncryptedBankImportPort) {}

  async getImportReceipts(): Promise<ImportReceipt[]> {
    await this.port.ensureLoaded();
    return this.port.getImportRows<ImportReceipt>()
      .filter(row => {
        const type = (row as any).record_type;
        if (type === 'bank_receipt') return true;
        // Compatibility for pre-discriminator bank receipts, excluding all stage/chunk rows.
        return !type && Array.isArray((row as any).bank_slugs) && Array.isArray((row as any).filenames)
          && typeof (row as any).status === 'string';
      })
      .sort((a, b) => String(b.started_at || '').localeCompare(String(a.started_at || '')));
  }

  async getImportReceipt(id: number): Promise<ImportReceipt | null> {
    return (await this.getImportReceipts()).find(row => row.id === id) || null;
  }

  async addImportReceipt(body: Omit<ImportReceipt, 'id'>): Promise<ImportReceipt> {
    return this.port.upsertImportRecord({ ...body, record_type: 'bank_receipt' } as any);
  }

  async addImportReceiptWithRows(
    body: Omit<ImportReceipt, 'id'>,
    rows: ImportReceiptRows['rows']
  ): Promise<ImportReceipt> {
    await this.port.ensureLoaded();
    const receiptId = this.port.allocateId();
    const generation = this.port.sessionToken();
    const receipt = {
      ...body,
      id: receiptId,
      status: 'staging',
      // Persist the expected count before any row chunk. A failed first
      // checkpoint must not be mistaken for a valid empty import on resume.
      selected_row_count: rows.length,
      selected_rows: undefined,
      record_type: 'bank_receipt',
    } as ImportReceipt & { record_type: string };
    await this.port.upsertImportRecord( receipt as any, undefined, generation);
    const chunks: ImportReceiptRows[] = [];
    let chunk: ImportReceiptRows['rows'] = [];
    let chunkBytes = 0;
    let chunkIndex = 0;
    for (const row of rows) {
      const rowBytes = new TextEncoder().encode(JSON.stringify(row)).length;
      if (chunk.length && (chunk.length >= 100 || chunkBytes + rowBytes > 160_000)) {
        chunks.push({ id: this.port.allocateId(), record_type: 'bank_receipt_rows', receipt_id: receiptId, chunk_index: chunkIndex++, rows: chunk });
        chunk = [];
        chunkBytes = 0;
      }
      chunk.push(row);
      chunkBytes += rowBytes;
    }
    if (chunk.length) chunks.push({ id: this.port.allocateId(), record_type: 'bank_receipt_rows', receipt_id: receiptId, chunk_index: chunkIndex, rows: chunk });

    try {
      await this.port.savePreparedRecords(chunks);
      const staged = await this.updateImportReceipt(receiptId, { status: 'staged', selected_row_count: rows.length });
      return staged;
    } catch (error) {
      if (error && typeof error === 'object') (error as any).receipt_id = receiptId;
      throw error;
    }
  }

  async saveImportReceiptRows(receiptId: number, rows: ImportReceiptRows['rows']): Promise<void> {
    await this.port.ensureLoaded();
    const existing = this.port.getImportRows<ImportReceiptRows>()
      .filter(row => (row as any).record_type === 'bank_receipt_rows' && Number(row.receipt_id) === receiptId);
    const chunks: ImportReceiptRows[] = [];
    let current: ImportPreviewRow[] = [];
    let bytes = 0;
    const flush = () => {
      if (!current.length) return;
      const chunkIndex = chunks.length;
      const prior = existing.find(row => row.chunk_index === chunkIndex);
      chunks.push({
        id: prior?.id ?? this.port.allocateId(),
        record_type: 'bank_receipt_rows',
        receipt_id: receiptId,
        chunk_index: chunkIndex,
        rows: current,
      });
      current = [];
      bytes = 0;
    };
    for (const row of rows) {
      const rowBytes = new TextEncoder().encode(JSON.stringify(row)).length;
      if (current.length && (current.length >= 100 || bytes + rowBytes > 160_000)) flush();
      current.push(row);
      bytes += rowBytes;
    }
    flush();
    if (chunks.length) await this.port.savePreparedRecords(chunks, true);
    await this.updateImportReceipt(receiptId, { status: 'staged', selected_row_count: rows.length });
  }

  async getImportReceiptRows(receiptId: number): Promise<ImportReceiptRows['rows']> {
    const receipt = await this.getImportReceipt(receiptId);
    if (!receipt) return [];
    if (receipt.selected_rows?.length) return receipt.selected_rows;
    const rows = this.port.getImportRows<ImportReceiptRows>()
      .filter(row => (row as any).record_type === 'bank_receipt_rows' && Number(row.receipt_id) === receiptId)
      .sort((a, b) => a.chunk_index - b.chunk_index)
      .flatMap(row => row.rows || []);
    return rows;
  }

  async updateImportReceipt(id: number, body: Partial<ImportReceipt>): Promise<ImportReceipt> {
    const generation = this.port.sessionToken();
    const current = (await this.getImportReceipts()).find(row => row.id === id);
    this.port.assertSession(generation);
    if (!current) throw new Error('Import receipt not found');
    return this.port.upsertImportRecord({ ...current, ...body, record_type: 'bank_receipt', id } as any, undefined, generation);
  }

  async undoImportReceipt(id: number): Promise<{ removed: number; edited: number; missing: number }> {
    let receipt = (await this.getImportReceipts()).find(row => row.id === id);
    if (!receipt) throw new Error('Import receipt not found');
    if (receipt.status === 'withdrawn') return receipt.undo_summary || { removed: 0, edited: 0, missing: 0 };
    if (receipt.status !== 'undoing') {
      const linkedCount = (await this.port.getTransactions()).filter(row => row.import_receipt_id === id).length;
      await this.updateImportReceipt(id, {
        status: 'undoing',
        coverage: [],
        coverage_start: null,
        coverage_end: null,
        undo_progress: {
          removed: 0,
          edited: 0,
          missing: Math.max(0, (receipt.inserted_count || 0) - linkedCount),
          expected_count: linkedCount,
          pending_ids: [],
        },
      });
      receipt = (await this.getImportReceipt(id))!;
    }
    let progress = (await this.getImportReceipt(id))?.undo_progress || {
      removed: 0, edited: 0, missing: 0, expected_count: 0, pending_ids: [],
    };
    let linked = (await this.port.getTransactions()).filter(row => row.import_receipt_id === id);
    // A failed checkpoint after a delete is recovered by reconciling the last pending batch.
    if (progress.pending_ids?.length) {
      const linkedIds = new Set(linked.map(row => row.id));
      const recovered = progress.pending_ids.filter(rowId => !linkedIds.has(rowId)).length;
      progress = { ...progress, removed: progress.removed + recovered, pending_ids: [] };
      await this.updateImportReceipt(id, { status: 'undoing', coverage: [], coverage_start: null, coverage_end: null, undo_progress: progress });
    }
    while (true) {
      linked = (await this.port.getTransactions()).filter(row => row.import_receipt_id === id);
      const batch = linked.filter(row => !row.import_edited && matchesImportSnapshot(row)).slice(0, 200);
      if (!batch.length) break;
      const currentProgress = (await this.getImportReceipt(id))?.undo_progress || progress;
      const ids = batch.map(row => row.id);
      progress = { ...currentProgress, pending_ids: ids };
      await this.updateImportReceipt(id, { status: 'undoing', coverage: [], coverage_start: null, coverage_end: null, undo_progress: progress });
      const immediate = (await this.port.getTransactions()).filter(row => ids.includes(row.id) && !row.import_edited && matchesImportSnapshot(row));
      const safeIds = immediate.map(row => row.id);
      if (safeIds.length) await this.port.deleteTransactions(safeIds);
      progress = { ...progress, removed: progress.removed + safeIds.length, pending_ids: [] };
      await this.updateImportReceipt(id, { status: 'undoing', coverage: [], coverage_start: null, coverage_end: null, undo_progress: progress });
    }
    linked = (await this.port.getTransactions()).filter(row => row.import_receipt_id === id);
    const edited = linked.filter(row => row.import_edited || !matchesImportSnapshot(row)).length;
    const expectedCount = progress.expected_count ?? linked.length;
    const missing = Math.max(0, (receipt.inserted_count || 0) - expectedCount);
    const summary = { removed: progress.removed, edited, missing };
    await this.updateImportReceipt(id, {
      status: 'withdrawn',
      coverage_start: null,
      coverage_end: null,
      coverage: [],
      undo_summary: summary,
      undo_progress: { ...summary, expected_count: expectedCount, pending_ids: [] },
    });
    return summary;
  }


}

function matchesImportSnapshot(row: Transaction): boolean {
  const snapshot = row.import_snapshot;
  if (!snapshot) return false;
  const fields: Array<keyof NonNullable<Transaction['import_snapshot']>> = [
    'date', 'type', 'category', 'amount', 'description', 'merchant', 'kind', 'account_display',
    'bank_account_key', 'source_bank', 'source_account_mask', 'reviewed', 'review_reason',
  ];
  return fields.every(field => {
    const current = row[field as keyof Transaction] ?? null;
    const original = snapshot[field] ?? null;
    if (field === 'amount') return Number(current) === Number(original);
    return current === original;
  });
}
