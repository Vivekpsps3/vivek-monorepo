import { firstValueFrom, Subject } from 'rxjs';
import { randomClientId } from './vault-crypto';
import { VaultService, type VaultWriteOptions } from './vault.service';

export type EncryptedCollection =
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

export type CollectionName = EncryptedCollection;

export interface EncryptedStoreChange {
  collection: EncryptedCollection;
  source: 'local' | 'remote';
}

export class RecordRevisionConflictError extends Error {
  constructor(readonly collection: EncryptedCollection, readonly recordId: number, latestLoaded: boolean) {
    super(latestLoaded
      ? `This ${collection.replaceAll('_', ' ')} record changed in another tab. The latest saved version was refreshed; your draft is still open. Review the saved version, then retry.`
      : `This ${collection.replaceAll('_', ' ')} record changed in another tab. Your draft is still open; reload the latest saved data, review it, then retry.`);
    this.name = 'RecordRevisionConflictError';
  }
}

export interface StoredEnvelope<T> {
  id: number;
  client_id: string;
  revision: number;
  schema_version: number;
  key_version: number;
  data: T;
}

const CURRENT_RECORD_SCHEMA_VERSION = 2;

/** Internal load options. `legacyRewrite` is not part of the public vault API. */
interface StoreLoadOptions extends VaultWriteOptions {
  /** Set only on the rewrite's own upsert so it does not wait for itself. */
  legacyRewrite?: boolean;
  /** Writes surface a failed rewrite. Reads keep the loaded rows. */
  reportRewriteFailure?: boolean;
}

interface InflightWork {
  generation: number;
  promise: Promise<void>;
  toasted: boolean;
}

export class EncryptedRecordPersistence {
  private changesSubject = new Subject<EncryptedStoreChange>();
  readonly changes$ = this.changesSubject.asObservable();
  private loaded = false;
  /** One physical load per session. Callers join it; they do not start another. */
  private inflightLoad: InflightWork | null = null;
  /** Schema rewrite failed after the rows were already usable. Retried on the next load or commit. */
  private legacyRewritePending = false;
  private inflightRewrite: InflightWork | null = null;
  private reservedIds = new Set<number>();
  /** Record ids whose queued write is currently running, so a nested write does not deadlock. */
  private activeRecordKeys = new Set<string>();
  private recordQueues = new Map<string, Promise<unknown>>();
  private reloadQueues = new Map<CollectionName, Promise<void>>();
  private collectionVersions = new Map<CollectionName, number>();
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

  constructor(private vault: VaultService, private getSessionToken: () => number) {}

  clear(): void {
    this.loaded = false;
    this.inflightLoad = null;
    this.legacyRewritePending = false;
    this.inflightRewrite = null;
    this.reservedIds.clear();
    this.activeRecordKeys.clear();
    this.recordQueues.clear();
    this.reloadQueues.clear();
    this.collectionVersions.clear();
    for (const key of Object.keys(this.bags)) this.bags[key] = new Map();
  }

  get sessionToken(): number {
    return this.getSessionToken();
  }

  assertSession(expectedGeneration: number): void {
    if (expectedGeneration !== this.getSessionToken()) throw new Error('Vault session changed');
  }

  private bumpCollectionVersion(collection: CollectionName): void {
    this.collectionVersions.set(collection, (this.collectionVersions.get(collection) ?? 0) + 1);
  }

  runRecordUpdate<T>(
    collection: CollectionName,
    id: number,
    expectedGeneration: number,
    update: () => Promise<T>
  ): Promise<T> {
    const key = `${collection}:${id}`;
    if (this.activeRecordKeys.has(key)) {
      this.assertSession(expectedGeneration);
      return update();
    }
    const previous = this.recordQueues.get(key) ?? Promise.resolve();
    const pending = previous.catch(() => undefined).then(async () => {
      this.assertSession(expectedGeneration);
      this.activeRecordKeys.add(key);
      try {
        return await update();
      } finally {
        this.activeRecordKeys.delete(key);
      }
    });
    this.recordQueues.set(key, pending);
    return pending.finally(() => {
      if (this.recordQueues.get(key) === pending) this.recordQueues.delete(key);
    });
  }

  async withRecordUpdates<T>(
    collection: CollectionName,
    ids: number[],
    expectedGeneration: number,
    update: () => Promise<T>
  ): Promise<T> {
    const uniqueIds = [...new Set(ids)].sort((a, b) => a - b);
    const acquire = (index: number): Promise<T> => index >= uniqueIds.length
      ? update()
      : this.runRecordUpdate(collection, uniqueIds[index], expectedGeneration, () => acquire(index + 1));
    return acquire(0);
  }

  async ensureLoaded(options?: StoreLoadOptions): Promise<void> {
    if (options?.legacyRewrite && this.loaded) return;
    const generation = this.getSessionToken();
    const rewrite = this.inflightRewrite?.generation === generation ? this.inflightRewrite : null;
    if (rewrite) {
      await this.finishRewrite(rewrite, options);
      return;
    }
    if (this.loaded && this.legacyRewritePending) {
      await this.finishRewrite(this.beginRewrite(generation), options);
      return;
    }
    if (this.loaded) return;
    if (!this.vault.isUnlocked) throw new Error('Vault locked');
    if (this.inflightLoad?.generation === generation) {
      await this.joinInflight(this.inflightLoad, options);
      return;
    }
    const promise = this.loadStore(generation).then(() => {
      if (generation !== this.getSessionToken()) throw new Error('Vault session changed');
      if (!this.loaded) throw new Error('Vault data could not be loaded');
    });
    const inflight = { generation, promise, toasted: false };
    this.inflightLoad = inflight;
    try {
      await this.joinInflight(inflight, options);
    } finally {
      if (this.inflightLoad === inflight) this.inflightLoad = null;
    }
  }

  /** The shared GET never toasts. One failed load produces at most one toast. */
  private async joinInflight(inflight: InflightWork, options?: StoreLoadOptions): Promise<void> {
    try {
      await inflight.promise;
    } catch (error) {
      this.surfaceLoadFailure(inflight, options, error);
      throw error;
    }
  }

  private surfaceLoadFailure(inflight: InflightWork, options: StoreLoadOptions | undefined, error: unknown): void {
    if (options?.silent) return;
    if (error instanceof Error && (error.message === 'Vault session changed' || error.message === 'Vault locked')) return;
    const status = typeof error === 'object' && error ? Number((error as { status?: number }).status) : NaN;
    if (status === 422) return;
    if (inflight.toasted) return;
    inflight.toasted = true;
    this.vault.reportFallbackFailure();
  }

  private beginRewrite(generation: number): InflightWork {
    const existing = this.inflightRewrite?.generation === generation ? this.inflightRewrite : null;
    if (existing) return existing;
    const promise = this.executeRewrite(generation);
    const inflight = { generation, promise, toasted: false };
    this.inflightRewrite = inflight;
    void promise.finally(() => {
      if (this.inflightRewrite === inflight) this.inflightRewrite = null;
    });
    return inflight;
  }

  /** Reads resolve with the loaded rows when the rewrite fails. Writes surface it once. */
  private async finishRewrite(inflight: InflightWork, options?: StoreLoadOptions): Promise<void> {
    try {
      await inflight.promise;
    } catch (error) {
      if (!options?.reportRewriteFailure) return;
      this.surfaceLoadFailure(inflight, options, error);
      throw error;
    }
  }

  private async executeRewrite(generation: number): Promise<void> {
    try {
      await this.rewriteLegacyRecords(generation);
      if (generation !== this.getSessionToken()) throw new Error('Vault session changed');
      this.legacyRewritePending = false;
    } catch (error) {
      if (generation === this.getSessionToken()) this.legacyRewritePending = true;
      throw error;
    }
  }

  private async loadStore(generation: number): Promise<void> {
    const rows = await firstValueFrom(this.vault.listRecords(undefined, { silent: true }));
    if (generation !== this.getSessionToken()) throw new Error('Vault session changed');
    for (const key of Object.keys(this.bags)) this.bags[key] = new Map();
    const decoded: Array<{ row: any; data: any }> = [];
    for (const row of rows) {
      if (!this.bags[row.collection]) continue;
      const data = await this.vault.decryptPayload<any>(
        row.ciphertext_b64,
        row.collection,
        row.client_id,
        row.schema_version,
        row.key_version
      );
      if (generation !== this.getSessionToken()) throw new Error('Vault session changed');
      const existingId = Number(data.id);
      if (existingId) this.reservedIds.add(existingId);
      decoded.push({ row, data });
    }
    for (const { row, data } of decoded) {
      const id = Number(data.id) || this.allocateId();
      this.reservedIds.add(id);
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
    await this.beginRewrite(generation).promise;
  }

  allocateId(): number {
    const inMemoryIds = new Set(this.reservedIds);
    for (const bag of Object.values(this.bags)) {
      for (const envelope of bag.values()) inMemoryIds.add(envelope.id);
    }
    const words = new Uint32Array(2);
    for (let attempt = 0; attempt < 128; attempt += 1) {
      globalThis.crypto.getRandomValues(words);
      const id = (words[0] & 0x001fffff) * 0x1_0000_0000 + words[1];
      if (id > 0 && Number.isSafeInteger(id) && !inMemoryIds.has(id)) {
        this.reservedIds.add(id);
        return id;
      }
    }
    throw new Error('Could not allocate a unique local record ID.');
  }

  list<T>(collection: CollectionName): T[] {
    return Array.from(this.bags[collection].values()).map(v => v.data as T);
  }

  /** Re-read and authenticate persisted ciphertext rather than trusting the decrypted cache. */
  async readPersistedRows<T>(collection: CollectionName, generation = this.getSessionToken()): Promise<T[]> {
    const records = await firstValueFrom(this.vault.listRecords());
    if (generation !== this.getSessionToken()) throw new Error('Vault session changed');
    const decoded: T[] = [];
    for (const record of records.filter(row => row.collection === collection)) {
      const data = await this.vault.decryptPayload<T>(
        record.ciphertext_b64,
        record.collection,
        record.client_id,
        record.schema_version,
        record.key_version
      );
      if (generation !== this.getSessionToken()) throw new Error('Vault session changed');
      const existingId = Number((data as any).id);
      if (existingId) this.reservedIds.add(existingId);
      decoded.push(data);
    }
    return decoded.map(data => {
      const id = Number((data as any).id) || this.allocateId();
      this.reservedIds.add(id);
      return { ...data, id } as T;
    });
  }

  async upsert<T extends { id?: number }>(
    collection: CollectionName,
    payload: T,
    clientId?: string,
    expectedGeneration?: number,
    options?: StoreLoadOptions,
  ): Promise<T> {
    const requestedGeneration = expectedGeneration ?? this.getSessionToken();
    await this.ensureLoaded(options?.legacyRewrite ? options : { ...options, reportRewriteFailure: true });
    const generation = requestedGeneration;
    if (generation !== this.getSessionToken()) throw new Error('Vault session changed');
    const preview = this.findEnvelope(collection, payload.id, clientId);
    const id = preview?.id ?? payload.id ?? this.allocateId();
    this.reservedIds.add(id);
    const cid = preview?.client_id ?? clientId ?? randomClientId(collection.slice(0, 3));
    const write = () => this.persistUpsert(collection, payload, id, cid, generation, options);
    if (options?.legacyRewrite) return write();
    return this.runRecordUpdate(collection, id, generation, write);
  }

  private findEnvelope(collection: CollectionName, id?: number, clientId?: string): StoredEnvelope<unknown> | undefined {
    if (clientId) return this.bags[collection].get(clientId);
    if (!id) return undefined;
    return Array.from(this.bags[collection].values()).find(envelope => envelope.id === id);
  }

  private async persistUpsert<T extends { id?: number }>(
    collection: CollectionName,
    payload: T,
    id: number,
    cid: string,
    generation: number,
    options?: StoreLoadOptions,
  ): Promise<T> {
    if (generation !== this.getSessionToken()) throw new Error('Vault session changed');
    const existing = this.findEnvelope(collection, id, cid);
    const data = { ...payload, id };
    const schemaVersion = CURRENT_RECORD_SCHEMA_VERSION;
    const keyVersion = existing?.key_version ?? 1;
    const ciphertext = await this.vault.encryptPayload(data, collection, cid, schemaVersion, keyVersion);
    if (generation !== this.getSessionToken()) throw new Error('Vault session changed');
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
      ], options)
    ).catch(async error => {
      const status = Number((error as { status?: number })?.status);
      if (status === 422 && !options?.silent) this.vault.reportFallbackFailure();
      if (status === 409) {
        let latestLoaded = false;
        if (this.loaded && generation === this.getSessionToken()) {
          try {
            await this.reloadCollections([collection], options);
            latestLoaded = true;
            this.changesSubject.next({ collection, source: 'remote' });
          } catch {
            // Keep the user's draft and report that the latest version still needs a reload.
          }
        }
        throw new RecordRevisionConflictError(collection, id, latestLoaded);
      }
      throw error;
    });
    if (generation !== this.getSessionToken()) throw new Error('Vault session changed');
    const row = saved[0];
    this.bumpCollectionVersion(collection);
    this.bags[collection].set(cid, {
      id,
      client_id: cid,
      revision: row.revision,
      schema_version: schemaVersion,
      key_version: keyVersion,
      data,
    });
    this.changesSubject.next({ collection, source: 'local' });
    return data;
  }

  /** Persists a bounded encrypted batch while preserving per-record revisions and client IDs. */
  async savePreparedRecords<T extends { id: number }>(
    collection: CollectionName,
    records: T[],
    _replaceExisting = false,
    options?: VaultWriteOptions,
  ): Promise<T[]> {
    const generation = this.getSessionToken();
    if (collection === 'holdings' && records.length) {
      return this.withRecordUpdates(collection, records.map(record => record.id), generation,
        () => this.savePreparedRecordsUnlocked(collection, records, generation, options));
    }
    return this.savePreparedRecordsUnlocked(collection, records, generation, options);
  }

  private async savePreparedRecordsUnlocked<T extends { id: number }>(
    collection: CollectionName,
    records: T[],
    generation: number,
    options?: VaultWriteOptions,
  ): Promise<T[]> {
    await this.ensureLoaded({ ...options, reportRewriteFailure: true });
    if (generation !== this.getSessionToken()) throw new Error('Vault session changed');
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
        this.reservedIds.add(data.id);
        const existing = Array.from(this.bags[collection].values()).find(row => row.id === data.id);
        const client_id = existing?.client_id ?? randomClientId(collection.slice(0, 3));
        const schema_version = CURRENT_RECORD_SCHEMA_VERSION;
        const key_version = existing?.key_version ?? 1;
        const ciphertext_b64 = await this.vault.encryptPayload(data, collection, client_id, schema_version, key_version);
        if (generation !== this.getSessionToken()) throw new Error('Vault session changed');
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
      if (generation !== this.getSessionToken()) throw new Error('Vault session changed');
      const saved = await firstValueFrom(this.vault.upsertRecords(prepared, options));
      if (generation !== this.getSessionToken()) throw new Error('Vault session changed');
      this.bumpCollectionVersion(collection);
      saved.forEach((row, index) => {
        const envelope = envelopes[index];
        this.bags[collection].set(envelope.client_id, {
          ...envelope,
          revision: row.revision,
        });
        output.push(envelope.data);
      });
      this.changesSubject.next({ collection, source: 'local' });
    }
    return output;
  }

  private async rewriteLegacyRecords(generation: number): Promise<void> {
    for (const collection of Object.keys(this.bags) as CollectionName[]) {
      for (const envelope of this.bags[collection].values()) {
        // Older ciphertext needs authenticated-record AAD; plaintext tables are retired.
        if (envelope.schema_version < CURRENT_RECORD_SCHEMA_VERSION) {
          await this.upsert(collection, envelope.data, envelope.client_id, generation, { silent: true, legacyRewrite: true });
        }
      }
    }
  }

  async remove(collection: CollectionName, id: number, options?: VaultWriteOptions): Promise<void> {
    const generation = this.getSessionToken();
    await this.ensureLoaded({ ...options, reportRewriteFailure: true });
    if (generation !== this.getSessionToken()) throw new Error('Vault session changed');
    const found = Array.from(this.bags[collection].values()).find(v => v.id === id);
    if (!found) return;
    await firstValueFrom(
      this.vault.deleteRecords([
        { collection, client_id: found.client_id, expected_revision: found.revision },
      ], options)
    );
    if (generation !== this.getSessionToken()) throw new Error('Vault session changed');
    this.bumpCollectionVersion(collection);
    this.bags[collection].delete(found.client_id);
    this.changesSubject.next({ collection, source: 'local' });
  }

  /** Reloads encrypted records after another same-account tab changes them. */
  async reloadCollections(collections: EncryptedCollection[], options?: VaultWriteOptions): Promise<void> {
    // Joins the single in-flight load, then refreshes with this caller's silence.
    const generation = this.getSessionToken();
    await this.ensureLoaded(options);
    for (const collection of [...new Set(collections)]) {
      const previous = this.reloadQueues.get(collection) ?? Promise.resolve();
      const pending = previous.catch(() => undefined).then(() => this.reloadCollectionSnapshot(collection, generation, options));
      this.reloadQueues.set(collection, pending);
      try {
        await pending;
      } finally {
        if (this.reloadQueues.get(collection) === pending) this.reloadQueues.delete(collection);
      }
    }
  }

  private async reloadCollectionSnapshot(collection: CollectionName, generation: number, options?: VaultWriteOptions): Promise<void> {
    for (let attempt = 0; attempt < 8; attempt += 1) {
      this.assertSession(generation);
      const version = this.collectionVersions.get(collection) ?? 0;
      const records = await firstValueFrom(this.vault.listRecords(collection, options));
      this.assertSession(generation);
      const latest = new Map<string, StoredEnvelope<any>>();
      const decoded: Array<{ record: any; data: any }> = [];
      for (const record of records) {
        const data = await this.vault.decryptPayload<any>(
          record.ciphertext_b64,
          record.collection,
          record.client_id,
          record.schema_version,
          record.key_version
        );
        this.assertSession(generation);
        const existingId = Number(data.id);
        if (existingId) this.reservedIds.add(existingId);
        decoded.push({ record, data });
      }
      for (const { record, data } of decoded) {
        const id = Number(data.id) || this.allocateId();
        this.reservedIds.add(id);
        latest.set(record.client_id, {
          id,
          client_id: record.client_id,
          revision: record.revision,
          schema_version: record.schema_version,
          key_version: record.key_version,
          data: { ...data, id },
        });
      }
      if (version !== (this.collectionVersions.get(collection) ?? 0)) continue;
      this.bags[collection] = latest;
      return;
    }
    throw new Error(`Could not refresh ${collection.replaceAll('_', ' ')} because local changes are still being saved.`);
  }


  async deleteMany(collection: CollectionName, ids: number[], options?: VaultWriteOptions): Promise<void> {
    await this.ensureLoaded({ ...options, reportRewriteFailure: true });
    const generation = this.getSessionToken();
    const records = ids
      .map(id => Array.from(this.bags[collection].values()).find(row => row.id === id))
      .filter(Boolean) as Array<StoredEnvelope<unknown>>;
    for (let offset = 0; offset < records.length; offset += 200) {
      this.assertSession(generation);
      const batch = records.slice(offset, offset + 200);
      await firstValueFrom(this.vault.deleteRecords(batch.map(row => ({
        collection, client_id: row.client_id, expected_revision: row.revision,
      })), options));
      this.assertSession(generation);
      this.bumpCollectionVersion(collection);
      for (const row of batch) this.bags[collection].delete(row.client_id);
      this.changesSubject.next({ collection, source: 'local' });
    }
  }
}
