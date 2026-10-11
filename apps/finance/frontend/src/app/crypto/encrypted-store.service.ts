import { Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import {
  Asset,
  BankAccountRecord,
  FixedExpense,
  Holding,
  JobIncome,
  Liability,
  ImportReceipt,
  ImportReceiptRows,
  ImportPreviewRow,
  Subscription,
  Transaction,
} from '../models/transaction.model';
import { StockLabScenario } from '../models/stock-lab.model';
import type { BrokerageAccountRecord, FidelityStageRecord, FidelityStageRow } from '../utils/fidelity-import.util';
import {
  computeCashflowSummary,
  computeNetWorth,
  enrichFixedExpense,
  enrichHolding,
  enrichJobIncome,
  enrichSubscription,
} from './client-finance';
import { randomClientId } from './vault-crypto';
import { VaultService } from './vault.service';

type CollectionName =
  | 'transactions'
  | 'assets'
  | 'liabilities'
  | 'holdings'
  | 'job_incomes'
  | 'fixed_expenses'
  | 'subscriptions'
  | 'bank_accounts'
  | 'brokerage_accounts'
  | 'import_batches'
  | 'planning_profiles'
  | 'stock_lab_scenarios';

interface StoredEnvelope<T> {
  id: number;
  client_id: string;
  revision: number;
  schema_version: number;
  key_version: number;
  data: T;
}

const CURRENT_RECORD_SCHEMA_VERSION = 2;

@Injectable({ providedIn: 'root' })
export class EncryptedStoreService {
  private loaded = false;
  private generation = 0;
  private loadingGeneration = -1;
  private loadingPromise: Promise<void> | null = null;
  private nextId = 1;
  private bags: Record<string, Map<string, StoredEnvelope<any>>> = {
    transactions: new Map(),
    assets: new Map(),
    liabilities: new Map(),
    holdings: new Map(),
    job_incomes: new Map(),
    fixed_expenses: new Map(),
    subscriptions: new Map(),
    bank_accounts: new Map(),
    brokerage_accounts: new Map(),
    import_batches: new Map(),
    planning_profiles: new Map(),
    stock_lab_scenarios: new Map(),
  };

  constructor(private vault: VaultService) {}

  clear(): void {
    this.generation += 1;
    this.loaded = false;
    this.loadingGeneration = -1;
    this.loadingPromise = null;
    this.nextId = 1;
    for (const key of Object.keys(this.bags)) this.bags[key] = new Map();
  }

  async ensureLoaded(): Promise<void> {
    if (this.loaded) return;
    if (!this.vault.isUnlocked) throw new Error('Vault locked');
    const generation = this.generation;
    if (this.loadingPromise && this.loadingGeneration === generation) return this.loadingPromise;
    const promise = this.loadStore(generation);
    this.loadingPromise = promise;
    this.loadingGeneration = generation;
    try {
      await promise;
      if (generation !== this.generation) throw new Error('Vault session changed');
      if (!this.loaded) throw new Error('Vault data could not be loaded');
    } catch (error) {
      if (this.generation === generation && this.loadingPromise === promise) {
        this.loaded = false;
        this.loadingPromise = null;
        this.loadingGeneration = -1;
      }
      throw error;
    } finally {
      if (this.loadingPromise === promise) {
        this.loadingPromise = null;
        this.loadingGeneration = -1;
      }
    }
  }

  private async loadStore(generation: number): Promise<void> {
    const rows = await firstValueFrom(this.vault.listRecords());
    if (generation !== this.generation) throw new Error('Vault session changed');
    for (const key of Object.keys(this.bags)) this.bags[key] = new Map();
    let maxId = 0;
    for (const row of rows) {
      if (!this.bags[row.collection]) continue;
      const data = await this.vault.decryptPayload<any>(
        row.ciphertext_b64,
        row.collection,
        row.client_id,
        row.schema_version,
        row.key_version
      );
      if (generation !== this.generation) throw new Error('Vault session changed');
      const id = Number(data.id) || this.allocateId();
      maxId = Math.max(maxId, id);
      const envelope: StoredEnvelope<any> = {
        id,
        client_id: row.client_id,
        revision: row.revision,
        schema_version: row.schema_version,
        key_version: row.key_version,
        data: { ...data, id },
      };
      this.bags[row.collection].set(row.client_id, envelope);
    }
    this.loaded = true;
    this.nextId = maxId + 1;
    await this.rewriteLegacyRecords(generation);
    if (generation !== this.generation) throw new Error('Vault session changed');
    await this.migrateLegacyPlaintext(generation);
  }

  private allocateId(): number {
    const id = this.nextId;
    this.nextId += 1;
    return id;
  }

  private list<T>(collection: CollectionName): T[] {
    return Array.from(this.bags[collection].values()).map(v => v.data as T);
  }

  /** Re-read and authenticate persisted ciphertext rather than trusting the decrypted cache. */
  private async readPersistedRows<T>(collection: CollectionName, generation = this.generation): Promise<T[]> {
    const records = await firstValueFrom(this.vault.listRecords());
    if (generation !== this.generation) throw new Error('Vault session changed');
    const rows: T[] = [];
    for (const record of records.filter(row => row.collection === collection)) {
      const data = await this.vault.decryptPayload<T>(
        record.ciphertext_b64,
        record.collection,
        record.client_id,
        record.schema_version,
        record.key_version
      );
      if (generation !== this.generation) throw new Error('Vault session changed');
      rows.push({ ...data, id: Number((data as any).id) || this.allocateId() } as T);
    }
    return rows;
  }

  private async upsert<T extends { id?: number }>(
    collection: CollectionName,
    payload: T,
    clientId?: string,
    expectedGeneration?: number
  ): Promise<T> {
    const requestedGeneration = expectedGeneration ?? this.generation;
    await this.ensureLoaded();
    const generation = requestedGeneration;
    if (generation !== this.generation) throw new Error('Vault session changed');
    const existing = clientId
      ? this.bags[collection].get(clientId)
      : payload.id
        ? Array.from(this.bags[collection].values()).find(v => v.id === payload.id)
        : undefined;
    const id = existing?.id ?? payload.id ?? this.allocateId();
    this.nextId = Math.max(this.nextId, id + 1);
    const cid = existing?.client_id ?? clientId ?? randomClientId(collection.slice(0, 3));
    const data = { ...payload, id };
    const schemaVersion = CURRENT_RECORD_SCHEMA_VERSION;
    const keyVersion = existing?.key_version ?? 1;
    const ciphertext = await this.vault.encryptPayload(data, collection, cid, schemaVersion, keyVersion);
    if (generation !== this.generation) throw new Error('Vault session changed');
    const indexes =
      collection === 'transactions' && (data as any).dedupe_key
        ? [
            {
              index_name: 'dedupe_key',
              index_value_b64: await this.vault.blindIndex(String((data as any).dedupe_key)),
            },
          ]
        : [];
    const saved = await firstValueFrom(
      this.vault.upsertRecords([
        {
          collection,
          client_id: cid,
          ciphertext_b64: ciphertext,
          schema_version: schemaVersion,
          key_version: keyVersion,
          expected_revision: existing?.revision ?? null,
          indexes,
        },
      ])
    );
    if (generation !== this.generation) throw new Error('Vault session changed');
    const row = saved[0];
    this.bags[collection].set(cid, {
      id,
      client_id: cid,
      revision: row.revision,
      schema_version: schemaVersion,
      key_version: keyVersion,
      data,
    });
    return data;
  }

  /** Persists a bounded encrypted batch while preserving per-record revisions and client IDs. */
  private async savePreparedRecords<T extends { id: number }>(
    collection: CollectionName,
    records: T[],
    _replaceExisting = false
  ): Promise<T[]> {
    const generation = this.generation;
    await this.ensureLoaded();
    if (generation !== this.generation) throw new Error('Vault session changed');
    const output: T[] = [];
    for (let offset = 0; offset < records.length; offset += 200) {
      const part = records.slice(offset, offset + 200);
      const prepared: Array<{
        collection: CollectionName;
        client_id: string;
        ciphertext_b64: string;
        schema_version: number;
        key_version: number;
        expected_revision: number | null;
        indexes: Array<{ index_name: string; index_value_b64: string }>;
      }> = [];
      const envelopes: Array<{ id: number; client_id: string; schema_version: number; key_version: number; data: T }> = [];
      for (const data of part) {
        const existing = Array.from(this.bags[collection].values()).find(row => row.id === data.id);
        const client_id = existing?.client_id ?? randomClientId(collection.slice(0, 3));
        const schema_version = CURRENT_RECORD_SCHEMA_VERSION;
        const key_version = existing?.key_version ?? 1;
        const ciphertext_b64 = await this.vault.encryptPayload(data, collection, client_id, schema_version, key_version);
        if (generation !== this.generation) throw new Error('Vault session changed');
        prepared.push({
          collection,
          client_id,
          ciphertext_b64,
          schema_version,
          key_version,
          expected_revision: existing?.revision ?? null,
          indexes: [],
        });
        envelopes.push({ id: data.id, client_id, schema_version, key_version, data });
      }
      if (generation !== this.generation) throw new Error('Vault session changed');
      const saved = await firstValueFrom(this.vault.upsertRecords(prepared));
      if (generation !== this.generation) throw new Error('Vault session changed');
      saved.forEach((row, index) => {
        const envelope = envelopes[index];
        this.bags[collection].set(envelope.client_id, {
          ...envelope,
          revision: row.revision,
        });
        output.push(envelope.data);
      });
    }
    return output;
  }

  private async rewriteLegacyRecords(generation: number): Promise<void> {
    const migrated: Array<{ collection: string; client_id: string }> = [];
    for (const collection of Object.keys(this.bags) as CollectionName[]) {
      for (const envelope of this.bags[collection].values()) {
        // Version 1 records did not authenticate their server-owned identity.
        // Rewrite them once with version 2 AAD after successful local decryption.
        if (envelope.schema_version < CURRENT_RECORD_SCHEMA_VERSION) {
          await this.upsert(collection, envelope.data, envelope.client_id, generation);
          migrated.push({ collection, client_id: envelope.client_id });
        }
      }
    }
    // Plaintext migration owns completion while legacy database rows still exist.
    if (migrated.length && this.vault.currentStatus?.migration_status !== 'vault_ready') {
      const counts = migrated.reduce<Record<string, number>>((out, record) => {
        out[record.collection] = (out[record.collection] ?? 0) + 1;
        return out;
      }, {});
      await firstValueFrom(this.vault.completeLegacyMigration(counts, migrated));
    }
  }

  private async migrateLegacyPlaintext(generation: number): Promise<void> {
    if (this.vault.currentStatus?.migration_status !== 'vault_ready') return;
    const exported = await firstValueFrom(this.vault.exportLegacyRecords());
    if (generation !== this.generation) return;
    const migrated: Array<{ collection: string; client_id: string }> = [];
    for (const record of exported.records) {
      if (!this.bags[record.collection]) throw new Error(`Unsupported legacy collection: ${record.collection}`);
      const clientId = `legacy:${record.collection}:${record.data['id']}`;
      await this.upsert(record.collection as CollectionName, record.data as { id?: number }, clientId, generation);
      migrated.push({ collection: record.collection, client_id: clientId });
    }
    await firstValueFrom(this.vault.completeLegacyMigration(exported.counts, migrated));
  }

  private async remove(collection: CollectionName, id: number): Promise<void> {
    const generation = this.generation;
    await this.ensureLoaded();
    if (generation !== this.generation) throw new Error('Vault session changed');
    const found = Array.from(this.bags[collection].values()).find(v => v.id === id);
    if (!found) return;
    await firstValueFrom(
      this.vault.deleteRecords([
        { collection, client_id: found.client_id, expected_revision: found.revision },
      ])
    );
    if (generation !== this.generation) throw new Error('Vault session changed');
    this.bags[collection].delete(found.client_id);
  }

  async getTransactions(): Promise<Transaction[]> {
    await this.ensureLoaded();
    return this.list<Transaction>('transactions').sort((a, b) => b.date.localeCompare(a.date));
  }

  async addTransaction(tx: Omit<Transaction, 'id'> & { dedupe_key?: string }): Promise<Transaction> {
    return this.upsert('transactions', { ...tx, source: tx.source || 'manual' } as Transaction);
  }

  async updateTransaction(id: number, tx: Partial<Transaction>): Promise<Transaction> {
    await this.ensureLoaded();
    const current = this.list<Transaction>('transactions').find(t => t.id === id);
    if (!current) throw new Error('Transaction not found');
    const contentFields: Array<keyof Transaction> = [
      'date', 'type', 'category', 'amount', 'description', 'merchant', 'kind', 'account_display',
      'bank_account_key', 'source_bank', 'source_account_mask', 'reviewed', 'review_reason',
    ];
    const edited = current.source === 'import' && contentFields.some(
      key => tx[key] !== undefined && tx[key] !== current[key]
    );
    return this.upsert('transactions', {
      ...current,
      ...tx,
      ...(edited ? { import_edited: true } : {}),
      id,
    });
  }

  async deleteTransaction(id: number): Promise<void> {
    return this.remove('transactions', id);
  }

  async deleteTransactions(ids: number[]): Promise<void> {
    await this.ensureLoaded();
    const generation = this.generation;
    const records = ids.map(id => Array.from(this.bags['transactions'].values()).find(row => row.id === id)).filter(Boolean) as Array<StoredEnvelope<Transaction>>;
    for (let offset = 0; offset < records.length; offset += 200) {
      if (generation !== this.generation) throw new Error('Vault session changed');
      const batch = records.slice(offset, offset + 200);
      await firstValueFrom(this.vault.deleteRecords(batch.map(row => ({
        collection: 'transactions', client_id: row.client_id, expected_revision: row.revision,
      }))));
      if (generation !== this.generation) throw new Error('Vault session changed');
      for (const row of batch) this.bags['transactions'].delete(row.client_id);
    }
  }

  async getBankAccounts(): Promise<BankAccountRecord[]> {
    await this.ensureLoaded();
    return this.list<BankAccountRecord>('bank_accounts');
  }

  async upsertBankAccount(body: Omit<BankAccountRecord, 'id'> & { id?: number }): Promise<BankAccountRecord> {
    const generation = this.generation;
    const accounts = await this.getBankAccounts();
    const suppliedKey = String(body.account_key || '').trim();
    const current = body.id != null
      ? accounts.find(row => Number(row.id) === Number(body.id))
      : suppliedKey
        ? accounts.find(row => row.bank_slug === body.bank_slug && row.account_key === suppliedKey)
        : undefined;
    if (body.id != null && !current) throw new Error('Bank account mapping not found');
    if (current && current.bank_slug !== body.bank_slug) throw new Error('Bank account identity does not match this mapping');
    if (current?.account_key && suppliedKey && current.account_key !== suppliedKey) {
      throw new Error('Bank account identity does not match this mapping');
    }
    if (generation !== this.generation) throw new Error('Vault session changed');
    const saved = await this.upsert('bank_accounts', {
      ...current,
      ...body,
      account_key: current?.account_key || body.account_key || randomClientId('bank-account'),
      id: body.id ?? current?.id,
    });
    return { ...saved, id: Number(saved.id) };
  }

  async getImportReceipts(): Promise<ImportReceipt[]> {
    await this.ensureLoaded();
    return this.list<ImportReceipt>('import_batches')
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
    return this.upsert('import_batches', { ...body, record_type: 'bank_receipt' } as any);
  }

  async addImportReceiptWithRows(
    body: Omit<ImportReceipt, 'id'>,
    rows: ImportReceiptRows['rows']
  ): Promise<ImportReceipt> {
    await this.ensureLoaded();
    const receiptId = this.allocateId();
    const generation = this.generation;
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
    await this.upsert('import_batches', receipt as any, undefined, generation);
    const chunks: ImportReceiptRows[] = [];
    let chunk: ImportReceiptRows['rows'] = [];
    let chunkBytes = 0;
    let chunkIndex = 0;
    for (const row of rows) {
      const rowBytes = new TextEncoder().encode(JSON.stringify(row)).length;
      if (chunk.length && (chunk.length >= 100 || chunkBytes + rowBytes > 160_000)) {
        chunks.push({ id: this.allocateId(), record_type: 'bank_receipt_rows', receipt_id: receiptId, chunk_index: chunkIndex++, rows: chunk });
        chunk = [];
        chunkBytes = 0;
      }
      chunk.push(row);
      chunkBytes += rowBytes;
    }
    if (chunk.length) chunks.push({ id: this.allocateId(), record_type: 'bank_receipt_rows', receipt_id: receiptId, chunk_index: chunkIndex, rows: chunk });

    try {
      await this.savePreparedRecords('import_batches', chunks);
      const staged = await this.updateImportReceipt(receiptId, { status: 'staged', selected_row_count: rows.length });
      return staged;
    } catch (error) {
      if (error && typeof error === 'object') (error as any).receipt_id = receiptId;
      throw error;
    }
  }

  async saveImportReceiptRows(receiptId: number, rows: ImportReceiptRows['rows']): Promise<void> {
    await this.ensureLoaded();
    const existing = this.list<ImportReceiptRows>('import_batches')
      .filter(row => (row as any).record_type === 'bank_receipt_rows' && Number(row.receipt_id) === receiptId);
    const chunks: ImportReceiptRows[] = [];
    let current: ImportPreviewRow[] = [];
    let bytes = 0;
    const flush = () => {
      if (!current.length) return;
      const chunkIndex = chunks.length;
      const prior = existing.find(row => row.chunk_index === chunkIndex);
      chunks.push({
        id: prior?.id ?? this.allocateId(),
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
    if (chunks.length) await this.savePreparedRecords('import_batches', chunks, true);
    await this.updateImportReceipt(receiptId, { status: 'staged', selected_row_count: rows.length });
  }

  async getImportReceiptRows(receiptId: number): Promise<ImportReceiptRows['rows']> {
    const receipt = await this.getImportReceipt(receiptId);
    if (!receipt) return [];
    if (receipt.selected_rows?.length) return receipt.selected_rows;
    const rows = this.list<ImportReceiptRows>('import_batches')
      .filter(row => (row as any).record_type === 'bank_receipt_rows' && Number(row.receipt_id) === receiptId)
      .sort((a, b) => a.chunk_index - b.chunk_index)
      .flatMap(row => row.rows || []);
    return rows;
  }

  async updateImportReceipt(id: number, body: Partial<ImportReceipt>): Promise<ImportReceipt> {
    const current = (await this.getImportReceipts()).find(row => row.id === id);
    if (!current) throw new Error('Import receipt not found');
    return this.upsert('import_batches', { ...current, ...body, record_type: 'bank_receipt', id } as any);
  }

  async undoImportReceipt(id: number): Promise<{ removed: number; edited: number; missing: number }> {
    let receipt = (await this.getImportReceipts()).find(row => row.id === id);
    if (!receipt) throw new Error('Import receipt not found');
    if (receipt.status === 'withdrawn') return receipt.undo_summary || { removed: 0, edited: 0, missing: 0 };
    if (receipt.status !== 'undoing') {
      const linkedCount = (await this.getTransactions()).filter(row => row.import_receipt_id === id).length;
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
    let linked = (await this.getTransactions()).filter(row => row.import_receipt_id === id);
    // A failed checkpoint after a delete is recovered by reconciling the last pending batch.
    if (progress.pending_ids?.length) {
      const linkedIds = new Set(linked.map(row => row.id));
      const recovered = progress.pending_ids.filter(rowId => !linkedIds.has(rowId)).length;
      progress = { ...progress, removed: progress.removed + recovered, pending_ids: [] };
      await this.updateImportReceipt(id, { status: 'undoing', coverage: [], coverage_start: null, coverage_end: null, undo_progress: progress });
    }
    while (true) {
      linked = (await this.getTransactions()).filter(row => row.import_receipt_id === id);
      const batch = linked.filter(row => !row.import_edited && matchesImportSnapshot(row)).slice(0, 200);
      if (!batch.length) break;
      const currentProgress = (await this.getImportReceipt(id))?.undo_progress || progress;
      const ids = batch.map(row => row.id);
      progress = { ...currentProgress, pending_ids: ids };
      await this.updateImportReceipt(id, { status: 'undoing', coverage: [], coverage_start: null, coverage_end: null, undo_progress: progress });
      const immediate = (await this.getTransactions()).filter(row => ids.includes(row.id) && !row.import_edited && matchesImportSnapshot(row));
      const safeIds = immediate.map(row => row.id);
      if (safeIds.length) await this.deleteTransactions(safeIds);
      progress = { ...progress, removed: progress.removed + safeIds.length, pending_ids: [] };
      await this.updateImportReceipt(id, { status: 'undoing', coverage: [], coverage_start: null, coverage_end: null, undo_progress: progress });
    }
    linked = (await this.getTransactions()).filter(row => row.import_receipt_id === id);
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

  async bulkRenameTransactionCategories(renames: { fromCategory: string; toCategory: string }[]): Promise<{ updated: number; conflicts: number }> {
    const lookup = new Map(renames.map(row => [row.fromCategory, row.toCategory]));
    const rows = (await this.getTransactions()).filter(row => lookup.has(row.category));
    let updated = 0;
    let conflicts = 0;
    for (const row of rows) {
      try {
        await this.updateTransaction(row.id, { category: lookup.get(row.category)! });
        updated += 1;
      } catch {
        conflicts += 1;
      }
    }
    return { updated, conflicts };
  }

  async bulkCategorizeMerchant(merchant: string, category: string): Promise<{ updated: number; conflicts: number }> {
    const normalizedMerchant = merchant.trim().toLocaleLowerCase();
    const rows = (await this.getTransactions()).filter(row =>
      String(row.merchant || '').trim().toLocaleLowerCase() === normalizedMerchant
    );
    let updated = 0;
    let conflicts = 0;
    for (const row of rows) {
      try {
        await this.updateTransaction(row.id, { category });
        updated += 1;
      } catch {
        conflicts += 1;
      }
    }
    return { updated, conflicts };
  }

  async getAssets(): Promise<Asset[]> {
    await this.ensureLoaded();
    return this.list<Asset>('assets');
  }

  async addAsset(body: any): Promise<Asset> {
    return this.upsert('assets', body);
  }

  async updateAsset(id: number, body: any): Promise<Asset> {
    const current = (await this.getAssets()).find(a => a.id === id);
    if (!current) throw new Error('Asset not found');
    return this.upsert('assets', { ...current, ...body, id });
  }

  async deleteAsset(id: number): Promise<void> {
    return this.remove('assets', id);
  }

  async getLiabilities(): Promise<Liability[]> {
    await this.ensureLoaded();
    return this.list<Liability>('liabilities');
  }

  async addLiability(body: any): Promise<Liability> {
    return this.upsert('liabilities', body);
  }

  async updateLiability(id: number, body: any): Promise<Liability> {
    const current = (await this.getLiabilities()).find(a => a.id === id);
    if (!current) throw new Error('Liability not found');
    return this.upsert('liabilities', { ...current, ...body, id });
  }

  async deleteLiability(id: number): Promise<void> {
    return this.remove('liabilities', id);
  }

  async getHoldings(): Promise<Holding[]> {
    await this.ensureLoaded();
    const accounts = this.list<{
      id: number;
      broker_name?: string;
      account_mask?: string;
      nickname?: string | null;
      label?: string | null;
    }>('brokerage_accounts');
    const labels = new Map(
      accounts.map(acc => [
        acc.id,
        acc.nickname?.trim() ||
          acc.label?.trim() ||
          `${acc.broker_name || 'Fidelity'} ···${acc.account_mask || ''}`.trim(),
      ])
    );
    const allHoldings = this.list<Holding>('holdings');
    const latestStages = await this.getLatestActivatedHoldingStages();
    const activeHoldings = allHoldings.flatMap(h => {
      if (h.lifecycle_status === 'inactive') return [];
      const display = String(h.account_display || '').trim().toLocaleLowerCase();
      const suffix = display.startsWith('fidelity')
        ? display.split('···').at(-1)?.trim().split(/[\s(]/, 1)[0] || ''
        : '';
      const activeStage = h.brokerage_account_id == null
        ? (suffix ? latestStages.byAccountMask.get(suffix)?.id : undefined)
        : latestStages.byAccountId.get(Number(h.brokerage_account_id))?.id;
      if (activeStage != null) {
        // Only the active generation and manual rows added after it belong in this account projection.
        if (h.portfolio_stage_id !== activeStage) return [];
        return [{ ...h, lifecycle_status: 'active' as const }];
      }
      return h.lifecycle_status !== 'staged' ? [h] : [];
    });
    return activeHoldings.map(h =>
      enrichHolding({
        ...h,
        account_display:
          (h.brokerage_account_id != null ? labels.get(h.brokerage_account_id) : null) ||
          h.account_display ||
          null,
      })
    );
  }

  async addHolding(body: any): Promise<Holding> {
    const payload = { ...body };
    if (payload.brokerage_account_id != null && payload.portfolio_stage_id == null) {
      const stage = (await this.getLatestActivatedHoldingStages()).byAccountId.get(Number(payload.brokerage_account_id));
      if (stage) {
        payload.portfolio_stage_id = stage.id;
        payload.lifecycle_status = 'active';
      }
    }
    const row = await this.upsert('holdings', {
      ...payload,
      current_price: body.current_price ?? body.purchase_price,
      price_source: body.price_source ?? 'manual',
    });
    return enrichHolding(row);
  }

  async updateHolding(id: number, body: any): Promise<Holding> {
    const current = (await this.getHoldings()).find(a => a.id === id);
    if (!current) throw new Error('Holding not found');
    const next = { ...current, ...body, id };
    const sharesChanged = body.shares !== undefined && Number(body.shares) !== Number(current.shares);
    const priceChanged = body.current_price !== undefined && (body.current_price == null
      ? current.current_price != null
      : Number(body.current_price) !== Number(current.current_price));
    if ((sharesChanged || priceChanged) && body.market_value === undefined) {
      // Imported market value describes the imported share count and price. When
      // either input changes, derive a fresh value while retaining source dates.
      next.market_value = null;
      next.value = null;
    }
    if (body.purchase_price !== undefined && body.cost_basis_status === undefined) {
      next.cost_basis_status = body.purchase_price == null ? 'unknown' : 'known';
    }
    return enrichHolding(await this.upsert('holdings', next));
  }

  async updateHoldingPrice(
    id: number,
    quote: { price: number; price_source: string; price_as_of?: string | null; quote_date?: string | null; market_date?: string | null }
  ): Promise<Holding> {
    return this.updateHolding(id, {
      current_price: quote.price,
      market_value: null,
      value: null,
      price_source: quote.price_source,
      price_as_of: quote.price_as_of ?? null,
      quote_date: quote.quote_date ?? quote.market_date ?? quote.price_as_of?.slice(0, 10) ?? null,
    });
  }

  async deleteHolding(id: number): Promise<void> {
    return this.remove('holdings', id);
  }

  async getBrokerageAccounts(): Promise<
    Array<{
      id: number;
      broker_slug: string;
      broker_name: string;
      account_mask: string;
      account_name?: string;
      nickname?: string | null;
      label?: string | null;
    }>
  > {
    await this.ensureLoaded();
    return this.list('brokerage_accounts');
  }

  async upsertBrokerageAccount(body: {
    id?: number;
    broker_slug: string;
    broker_name: string;
    account_mask: string;
    account_name?: string;
    nickname?: string | null;
    label?: string | null;
  }): Promise<{
    id: number;
    broker_slug: string;
    broker_name: string;
    account_mask: string;
    account_name?: string;
    nickname?: string | null;
    label?: string | null;
  }> {
    const existing = (await this.getBrokerageAccounts()).find(account =>
      account.broker_slug === body.broker_slug && account.account_mask === body.account_mask
    );
    const row = await this.upsert('brokerage_accounts', { ...existing, ...body, id: body.id ?? existing?.id });
    return { ...row, id: Number(row.id) };
  }

  async createHoldingImportStage(
    body: Omit<FidelityStageRecord, 'id' | 'selected_rows'>,
    rows: FidelityStageRow[]
  ): Promise<FidelityStageRecord> {
    await this.ensureLoaded();
    const generation = this.generation;
    const id = this.allocateId();
    const stage = { ...body, id, status: 'staged', expected_row_count: rows.length, record_type: 'holding_stage' } as FidelityStageRecord & { record_type: string };
    await this.upsert('import_batches', stage as any, undefined, generation);
    const chunks: Array<{ id: number; record_type: 'holding_stage_rows'; stage_id: number; chunk_index: number; rows: FidelityStageRow[] }> = [];
    let current: FidelityStageRow[] = [];
    let bytes = 0;
    const flush = () => {
      if (!current.length) return;
      chunks.push({ id: this.allocateId(), record_type: 'holding_stage_rows', stage_id: id, chunk_index: chunks.length, rows: current });
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
    try {
      await this.savePreparedRecords('import_batches', chunks);
      const persisted = await this.getHoldingImportStageRows(id);
      if (persisted.length !== rows.length) throw new Error('Holding stage checkpoint is incomplete');
      return (await this.getHoldingImportStages()).find(row => row.id === id)!;
    } catch (error) {
      if (error && typeof error === 'object') (error as any).stage_id = id;
      await this.upsert('import_batches', { ...stage, status: 'interrupted', error: String((error as any)?.message || error) } as any, undefined, generation).catch(() => undefined);
      throw error;
    }
  }

  async getHoldingImportStages(): Promise<FidelityStageRecord[]> {
    await this.ensureLoaded();
    return this.list<any>('import_batches')
      .filter(row => row.record_type === 'holding_stage')
      .sort((a, b) => Number(b.id) - Number(a.id));
  }

  async getHoldingImportStageRows(stageId: number): Promise<FidelityStageRow[]> {
    await this.ensureLoaded();
    return this.list<any>('import_batches')
      .filter(row => row.record_type === 'holding_stage_rows' && Number(row.stage_id) === stageId)
      .sort((a, b) => Number(a.chunk_index) - Number(b.chunk_index))
      .flatMap(row => row.rows || []);
  }

  private async getLatestActivatedHoldingStages(): Promise<{
    byAccountId: Map<number, FidelityStageRecord>;
    byAccountMask: Map<string, FidelityStageRecord>;
  }> {
    const stages = (await this.getHoldingImportStages())
      .filter(stage => stage.status === 'activated')
      .sort((a, b) => {
        const byActivationTime = String(a.activated_at || a.created_at || '')
          .localeCompare(String(b.activated_at || b.created_at || ''));
        return byActivationTime || Number(a.id) - Number(b.id);
      });
    const byAccountId = new Map<number, FidelityStageRecord>();
    const byAccountMask = new Map<string, FidelityStageRecord>();
    for (const stage of stages) {
      for (const row of await this.getHoldingImportStageRows(stage.id)) {
        byAccountId.set(Number(row.brokerage_account_id), stage);
      }
      for (const mask of stage.account_masks || []) {
        byAccountMask.set(String(mask).trim().toLocaleLowerCase(), stage);
      }
    }
    return { byAccountId, byAccountMask };
  }

  async verifyHoldingImportStage(stageId: number): Promise<FidelityStageRecord> {
    const generation = this.generation;
    const persisted = await this.readPersistedRows<any>('import_batches', generation);
    const stage = persisted.find(row => row.record_type === 'holding_stage' && Number(row.id) === stageId) as FidelityStageRecord | undefined;
    if (!stage) throw new Error('Holding replacement stage not found');
    // An activated header is the durable commit point. Never downgrade it during cleanup retry.
    if (stage.status === 'activated') return stage;
    const persistedRows = persisted
      .filter(row => row.record_type === 'holding_stage_rows' && Number(row.stage_id) === stageId)
      .sort((a, b) => Number(a.chunk_index) - Number(b.chunk_index))
      .flatMap(row => row.rows || []) as FidelityStageRow[];
    if (persistedRows.length !== stage.expected_row_count) throw new Error('Holding stage is incomplete; active holdings were not changed');
    if (persistedRows.some(row => !row.symbol || !(row.shares > 0))) {
      throw new Error('Holding stage verification failed; active holdings were not changed');
    }
    if (generation !== this.generation) throw new Error('Vault session changed');
    return this.upsert('import_batches', { ...stage, status: 'verified', verified_at: new Date().toISOString(), record_type: 'holding_stage' } as any) as Promise<FidelityStageRecord>;
  }

  async activateHoldingImportStage(stageId: number): Promise<import('../models/transaction.model').FidelityCommitResult> {
    const generation = this.generation;
    const stage = await this.verifyHoldingImportStage(stageId);
    const persistedBatches = await this.readPersistedRows<any>('import_batches', generation);
    const rows = persistedBatches
      .filter(row => row.record_type === 'holding_stage_rows' && Number(row.stage_id) === stageId)
      .sort((a, b) => Number(a.chunk_index) - Number(b.chunk_index))
      .flatMap(row => row.rows || []) as FidelityStageRow[];
    const accounts = await this.getBrokerageAccounts();
    if (generation !== this.generation) throw new Error('Vault session changed');
    const targetAccountIds = new Set(rows.map(row => row.brokerage_account_id));
    const isTargetAccount = (row: Holding): boolean => {
      if (row.brokerage_account_id != null) {
        if (targetAccountIds.has(row.brokerage_account_id)) return true;
        const linked = accounts.find(account => Number(account.id) === Number(row.brokerage_account_id));
        if (linked) return false;
      }
      const label = String(row.account_display || '').trim().toLocaleLowerCase();
      if (!label.startsWith('fidelity')) return false;
      const suffix = label.split('···').at(-1)?.trim().split(/[\s(]/, 1)[0] || '';
      return stage.account_masks.some(mask => suffix === String(mask).trim().toLocaleLowerCase());
    };
    let activeStage = stage;
    if (stage.status !== 'activated') {
      const previousStageRows = this.list<Holding>('holdings').filter(row => row.portfolio_stage_id === stageId);
      const replacements = rows.map((row, index) => ({
        ...row,
        id: previousStageRows.find(existing => existing.portfolio_row_index === index
          && existing.symbol === row.symbol && existing.brokerage_account_id === row.brokerage_account_id)?.id ?? this.allocateId(),
        lifecycle_status: 'staged' as const,
        portfolio_stage_id: stageId,
        portfolio_row_index: index,
        cost_basis_status: row.cost_basis_status || (row.purchase_price == null ? 'unknown' : 'known'),
      }));
      await this.savePreparedRecords('holdings', replacements);
      if (generation !== this.generation) throw new Error('Vault session changed');
      const persistedHoldings = await this.readPersistedRows<Holding>('holdings', generation);
      const verifiedReplacements = persistedHoldings.filter(row => row.portfolio_stage_id === stageId);
      if (verifiedReplacements.length !== stage.expected_row_count || rows.some((row, index) => {
        const actual = verifiedReplacements.find(candidate => Number(candidate.portfolio_row_index) === index);
        return !actual || actual.symbol !== row.symbol || Number(actual.shares) !== Number(row.shares);
      })) {
        throw new Error('Persisted replacement positions could not be verified; the previous holdings remain active');
      }
      activeStage = await this.upsert('import_batches', {
        ...stage,
        status: 'activated',
        activated_at: new Date().toISOString(),
        cleanup_complete: false,
        record_type: 'holding_stage',
      } as any, undefined, generation) as FidelityStageRecord;
    }
    // Once activated, stage holdings may have been edited and new manual holdings may
    // have joined this stage. Resume only removes superseded rows; it never reapplies
    // the original import snapshot over the active holdings.
    const latestStages = await this.getLatestActivatedHoldingStages();
    const obsolete = (await this.readPersistedRows<Holding>('holdings', generation))
      .filter(row => {
        if (row.portfolio_stage_id === stageId || row.lifecycle_status === 'inactive' || !isTargetAccount(row)) return false;
        const label = String(row.account_display || '').trim().toLocaleLowerCase();
        const suffix = label.startsWith('fidelity')
          ? label.split('···').at(-1)?.trim().split(/[\s(]/, 1)[0] || ''
          : '';
        const latestStage = row.brokerage_account_id == null
          ? latestStages.byAccountMask.get(suffix)
          : latestStages.byAccountId.get(Number(row.brokerage_account_id));
        return latestStage?.id === stageId;
      });
    for (const row of obsolete) {
      if (generation !== this.generation) throw new Error('Vault session changed');
      await this.remove('holdings', row.id);
    }
    await this.upsert('import_batches', { ...activeStage, status: 'activated', cleanup_complete: true, record_type: 'holding_stage' } as any, undefined, generation);
    return {
      accounts_replaced: stage.account_masks.length,
      holdings_replaced: obsolete.length,
      inserted: stage.expected_row_count,
      accounts: stage.account_masks.map(mask => accounts.find(account => account.account_mask === mask)?.label || mask),
      stage_id: stageId,
      status: 'activated',
    };
  }

  async setBrokerageAccountNickname(accountId: number, nickname: string | null) {
    const accounts = await this.getBrokerageAccounts();
    const current = accounts.find(a => a.id === accountId);
    if (!current) throw new Error('Brokerage account not found');
    const nextNickname = nickname?.trim() || null;
    const label =
      nextNickname ||
      current.label ||
      `${current.broker_name || 'Fidelity'} ···${current.account_mask}`;
    const updated = await this.upsertBrokerageAccount({
      ...current,
      nickname: nextNickname,
      label,
    });
    const holdings = await this.getHoldings();
    for (const holding of holdings.filter(h => h.brokerage_account_id === accountId)) {
      await this.updateHolding(holding.id, { account_display: label });
    }
    return updated;
  }

  async getJobIncomes(): Promise<JobIncome[]> {
    await this.ensureLoaded();
    return this.list<JobIncome>('job_incomes').map(enrichJobIncome);
  }

  async addJobIncome(body: any): Promise<JobIncome> {
    return enrichJobIncome(await this.upsert('job_incomes', body));
  }

  async updateJobIncome(id: number, body: any): Promise<JobIncome> {
    const current = (await this.getJobIncomes()).find(a => a.id === id);
    if (!current) throw new Error('Income not found');
    return enrichJobIncome(await this.upsert('job_incomes', { ...current, ...body, id }));
  }

  async deleteJobIncome(id: number): Promise<void> {
    return this.remove('job_incomes', id);
  }

  async getFixedExpenses(): Promise<FixedExpense[]> {
    await this.ensureLoaded();
    return this.list<FixedExpense>('fixed_expenses').map(enrichFixedExpense);
  }

  async addFixedExpense(body: any): Promise<FixedExpense> {
    return enrichFixedExpense(await this.upsert('fixed_expenses', body));
  }

  async updateFixedExpense(id: number, body: any): Promise<FixedExpense> {
    const current = (await this.getFixedExpenses()).find(a => a.id === id);
    if (!current) throw new Error('Expense not found');
    return enrichFixedExpense(await this.upsert('fixed_expenses', { ...current, ...body, id }));
  }

  async deleteFixedExpense(id: number): Promise<void> {
    return this.remove('fixed_expenses', id);
  }

  async getSubscriptions(): Promise<Subscription[]> {
    await this.ensureLoaded();
    return this.list<Subscription>('subscriptions').map(enrichSubscription);
  }

  async addSubscription(body: any): Promise<Subscription> {
    return enrichSubscription(await this.upsert('subscriptions', body));
  }

  async updateSubscription(id: number, body: any): Promise<Subscription> {
    const current = (await this.getSubscriptions()).find(a => a.id === id);
    if (!current) throw new Error('Subscription not found');
    return enrichSubscription(await this.upsert('subscriptions', { ...current, ...body, id }));
  }

  async deleteSubscription(id: number): Promise<void> {
    return this.remove('subscriptions', id);
  }

  async getNetWorth() {
    const [assets, liabilities, holdings] = await Promise.all([
      this.getAssets(),
      this.getLiabilities(),
      this.getHoldings(),
    ]);
    return computeNetWorth(assets, liabilities, holdings);
  }

  async getCashflowSummary(start: string, end: string) {
    const [txs, incomes, fixed, subs] = await Promise.all([
      this.getTransactions(),
      this.getJobIncomes(),
      this.getFixedExpenses(),
      this.getSubscriptions(),
    ]);
    const base = computeCashflowSummary(start, end, txs, incomes, fixed, subs);
    return {
      ...base,
    };
  }

  async listPlanningProfiles(): Promise<any[]> {
    await this.ensureLoaded();
    return this.list<any>('planning_profiles');
  }

  async savePlanningProfile(body: any, id?: number): Promise<any> {
    if (id != null) {
      const current = (await this.listPlanningProfiles()).find(p => p.id === id) || { id };
      return this.upsert('planning_profiles', { ...current, ...body, id });
    }
    return this.upsert('planning_profiles', body);
  }

  async deletePlanningProfile(id: number): Promise<void> {
    return this.remove('planning_profiles', id);
  }

  async getStockLabScenarios(): Promise<StockLabScenario[]> {
    await this.ensureLoaded();
    return this.list<StockLabScenario>('stock_lab_scenarios').sort((a, b) =>
      b.updated_at.localeCompare(a.updated_at)
    );
  }

  async saveStockLabScenario(body: StockLabScenario, id?: number): Promise<StockLabScenario> {
    const current = id
      ? (await this.getStockLabScenarios()).find(row => row.id === id)
      : undefined;
    const now = new Date().toISOString();
    return this.upsert('stock_lab_scenarios', {
      ...current,
      ...body,
      id: id ?? body.id,
      created_at: current?.created_at ?? body.created_at ?? now,
      updated_at: now,
    });
  }

  async deleteStockLabScenario(id: number): Promise<void> {
    return this.remove('stock_lab_scenarios', id);
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
