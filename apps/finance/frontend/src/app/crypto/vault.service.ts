import { Injectable, inject, isDevMode } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, firstValueFrom, Observable } from 'rxjs';
import { apiUrl } from '../core/api-url';
import {
  clearDekLocal,
  createVaultMaterial,
  decryptJson,
  encryptJson,
  hmacBlindIndex,
  legacyDekBlindIndex,
  persistVaultKeys,
  readBlindIndexProgress,
  recordAad,
  restoreVaultKeys,
  rewrapDekWithPassphrase,
  unlockWithPassphrase,
  writeBlindIndexProgress,
  type StoredVaultKeys,
} from './vault-crypto';
import { rewrapSigningKey, WrappedSigningKey } from '@vivek/auth';
import { DEFAULT_PBKDF2_ITERATIONS } from '@vivek/browser';
import { HTTP_ERROR_FALLBACK, ToastService } from '@vivek/ui';
import { silentErrorToast } from '@vivek/ui';
import { SESSION_CONTEXT } from '@vivek/ui';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { hasDek, holdDek, readDek, readLockEpoch, wipeDek } from './dek-holder';

export interface VaultStatus {
  exists: boolean;
  kdf_algorithm?: string | null;
  kdf_salt_b64?: string | null;
  kdf_iterations?: number | null;
  wrapped_dek_b64?: string | null;
  recovery_wrapped_dek_b64?: string | null;
  key_version?: number | null;
}

/** Per-request flag. Only that HTTP call skips the fallback toast. */
export interface VaultWriteOptions {
  silent?: boolean;
}

export interface EncryptedRecordDto {
  collection: string;
  client_id: string;
  ciphertext_b64: string;
  schema_version: number;
  key_version: number;
  revision: number;
  updated_at: string;
}

@Injectable({ providedIn: 'root' })
export class VaultService {
  private epoch = 0;
  private get dek(): CryptoKey | null { return readDek(); }
  private set dek(next: CryptoKey | null) { holdDek(next); }
  private versionNumber = 1;
  private reindexed = new Set<string>();
  private reindexTask: Promise<void> | null = null;
  /** Prior batch, including one that lock already stopped. The next batch waits for it. */
  private reindexTail: Promise<void> = Promise.resolve();
  private reindexGeneration = 0;
  private holdGeneration = 0;
  private opChain: Promise<void> = Promise.resolve();
  /** Dev-only tally. The log line has the count and no row ids. */
  private undecryptableRows = 0;
  private unlockedWrap: string | null = null;
  private statusSubject = new BehaviorSubject<VaultStatus | null>(null);
  private unlockedSubject = new BehaviorSubject<boolean>(false);
  private authWrap: WrappedSigningKey | null = null;
  private boot: Promise<void>;
  /** Failed KDF upgrades since this page loaded. The session stays unlocked either way. */
  kdfUpgradeFailures = 0;
  private readonly toast = inject(ToastService);
  private readonly sessionPort = inject(SESSION_CONTEXT, { optional: true });

  readonly status$ = this.statusSubject.asObservable();
  readonly unlocked$ = this.unlockedSubject.asObservable();

  constructor(private http: HttpClient) {
    this.sessionPort?.cleared$?.pipe(takeUntilDestroyed()).subscribe(() => { void this.lock().catch(() => undefined); });
    this.boot = this.hydrate();
  }

  get blindIndexVersion(): number {
    return this.versionNumber;
  }

  private ownerId(): number | null {
    const id = this.sessionPort?.currentUser?.id;
    return typeof id === 'number' && Number.isInteger(id) && id > 0 ? id : null;
  }

  /** Wait until the session has a concrete user. A missing port is already resolved to nobody. Null matches nobody. */
  private async resolvedOwner(): Promise<number | null> {
    const port = this.sessionPort;
    if (!port) return null;
    const ready = this.ownerId();
    if (ready != null) return ready;
    if (typeof port.loadSession !== 'function') return null;
    try {
      const user = await firstValueFrom(port.loadSession());
      const id = user?.id;
      return typeof id === 'number' && Number.isInteger(id) && id > 0 ? id : null;
    } catch {
      return null;
    }
  }

  /** A null owner matches nobody. A newer hold supersedes this one when generation is passed. */
  private ownerMatches(userId: number | null): boolean {
    return userId != null && this.ownerId() === userId;
  }

  private owns(epoch: number, lockAt: number, userId: number | null, generation?: number): boolean {
    return !!this.dek && this.sameSession(epoch, lockAt, userId, generation);
  }

  private sameSession(epoch: number, lockAt: number, userId: number | null, generation?: number): boolean {
    if (epoch !== this.epoch || lockAt !== readLockEpoch()) return false;
    if (generation !== undefined && generation !== this.holdGeneration) return false;
    return this.ownerMatches(userId);
  }

  /** Session changed. A newer hold of the same session does not count. A null user is not this session. */
  private sessionMoved(epoch: number, lockAt: number, userId: number | null): boolean {
    return epoch !== this.epoch || lockAt !== readLockEpoch() || !this.ownerMatches(userId);
  }

  private enqueue(run: () => Promise<void>): Promise<void> {
    const next = this.opChain.then(run, run);
    this.opChain = next.then(() => undefined, () => undefined);
    return next;
  }

  private async hydrate(): Promise<void> {
    const epoch = this.epoch;
    const lockAt = readLockEpoch();
    const userId = await this.resolvedOwner();
    if (epoch !== this.epoch || lockAt !== readLockEpoch()) return;
    if (userId == null) {
      await clearDekLocal();
      return;
    }
    let stored: StoredVaultKeys | null = null;
    try { stored = await restoreVaultKeys(userId, () => this.sameSession(epoch, lockAt, userId)); } catch { stored = null; }
    if (!stored || !this.sameSession(epoch, lockAt, userId)) {
      // A newer hold owns the key once it has started. This path only deletes a key this restore just wrote.
      if (stored && this.holdGeneration === 0 && !this.dek) await clearDekLocal();
      return;
    }
    await this.hold(stored.dek, stored.blind_index_version, stored.reindexed);
  }

  private hold(dek: CryptoKey, version: number, reindexed: string[] = []): Promise<void> {
    const generation = ++this.holdGeneration;
    const epoch = this.epoch;
    const lockAt = readLockEpoch();
    const userId = this.ownerId();
    return this.enqueue(() => this.applyHold(dek, version, reindexed, epoch, lockAt, userId, generation));
  }

  private async applyHold(dek: CryptoKey, version: number, reindexed: string[], epoch: number, lockAt: number, userId: number | null, generation: number): Promise<void> {
    if (!this.sameSession(epoch, lockAt, userId, generation)) return;
    this.dek = dek;
    // A second unlock joins the in-flight batch and must not rewind its progress.
    if (!this.reindexTask) {
      this.versionNumber = version;
      this.reindexed = new Set(reindexed);
    }
    this.unlockedWrap = this.statusSubject.value?.wrapped_dek_b64 ?? null;
    // The hub reads presence before it will load vault code. Store the key before unlock returns.
    await this.persistProgress(epoch, lockAt, userId, generation);
    if (!this.sameSession(epoch, lockAt, userId, generation)) return;
    // Publish unlock before the batch. Navigation must not wait on re-index.
    this.unlockedSubject.next(true);
    if (this.versionNumber < 2) this.startBlindIndexes();
  }

  private async persistProgress(epoch: number, lockAt: number, userId: number | null, generation: number): Promise<void> {
    const dek = this.dek;
    if (!dek || !this.sameSession(epoch, lockAt, userId, generation)) return;
    const progress = { blind_index_version: this.versionNumber, reindexed: [...this.reindexed] };
    await persistVaultKeys({ dek, ...progress }, userId, () => this.sameSession(epoch, lockAt, userId, generation));
    // A lock or a user switch wins over an in-flight hold. A newer hold of this session does not.
    if (this.sessionMoved(epoch, lockAt, userId)) {
      // Same rule as replaced: a stale batch must not wipe the key a later hold stored.
      if (generation === this.holdGeneration) {
        if (this.dek === dek) { this.dek = null; this.unlockedSubject.next(false); }
        await clearDekLocal();
      }
      return;
    }
    if (this.dek !== dek || generation !== this.holdGeneration || userId == null || this.ownerId() !== userId) return;
    await writeBlindIndexProgress(userId, progress);
  }

  get isUnlocked(): boolean {
    return this.unlockedSubject.value && !!this.dek;
  }

  /** Resolves once a saved browser key has been restored or confirmed missing. */
  whenReady(): Promise<void> {
    return this.boot;
  }

  get currentStatus(): VaultStatus | null {
    return this.statusSubject.value;
  }

  /**
   * Unlock only the local-dev account, using the normal passphrase KDF.
   * The API returns a passphrase solely for that account, and only while the local bypass is on.
   */
  async ensureLocalDevUnlocked(): Promise<void> {
    await this.boot;
    const body = await firstValueFrom(
      this.http.get<{ passphrase: string }>(apiUrl('/auth/local-dev/vault'))
    );
    const passphrase = body?.passphrase?.trim() ?? '';
    if (passphrase.length < 12) {
      throw new Error('Local dev vault is unavailable');
    }
    const status = await this.refreshStatus();
    if (this.isUnlocked && this.unlockedWrap && this.unlockedWrap === status.wrapped_dek_b64) return;
    await this.lock();
    if (!status.exists) {
      await this.setup(passphrase);
      return;
    }
    await this.unlock(passphrase);
  }

  async refreshStatus(): Promise<VaultStatus> {
    await this.boot;
    const status = await firstValueFrom(this.http.get<VaultStatus>(apiUrl('/vault/status')));
    this.statusSubject.next(status);
    return status;
  }

  loadPublicStatus(status: VaultStatus | Omit<VaultStatus, 'exists'> & Partial<VaultStatus>): void {
    const hasWraps = !!(status.kdf_salt_b64 && status.wrapped_dek_b64 && status.kdf_iterations);
    this.statusSubject.next({
      exists: status.exists ?? hasWraps,
      kdf_algorithm: status.kdf_algorithm ?? null,
      kdf_salt_b64: status.kdf_salt_b64 ?? null,
      kdf_iterations: status.kdf_iterations ?? null,
      wrapped_dek_b64: status.wrapped_dek_b64 ?? null,
      recovery_wrapped_dek_b64: status.recovery_wrapped_dek_b64 ?? null,
      key_version: status.key_version ?? null,
    });
  }

  loadAuthWrap(wrap: WrappedSigningKey): void {
    this.authWrap = wrap;
  }

  /** Clears the key even when already locked. The counter moves only on an unlocked-to-locked transition. */
  async lock(): Promise<void> {
    const counting = this.unlockedSubject.value || hasDek();
    this.reindexGeneration += 1;
    this.reindexTask = null;
    wipeDek();
    this.unlockedWrap = null;
    const cleared = clearDekLocal();
    if (counting) {
      this.epoch += 1;
      this.unlockedSubject.next(false);
    }
    await cleared;
  }

  async setup(passphrase: string): Promise<void> {
    const epoch = this.epoch;
    const lockAt = readLockEpoch();
    const userId = await this.resolvedOwner();
    const material = await createVaultMaterial(passphrase);
    if (!this.sameSession(epoch, lockAt, userId)) return;
    const status = await firstValueFrom(
      this.http.post<VaultStatus>(apiUrl('/finance/vault/setup'), material.setupPayload)
    );
    if (!this.sameSession(epoch, lockAt, userId)) return;
    this.statusSubject.next(status);
    await this.hold(material.dek, 2);
  }

  /** Completes an atomically-created vault after passwordless account bootstrap/signup. */
  async adoptBootstrapVault(dek: CryptoKey): Promise<void> {
    const epoch = this.epoch;
    const lockAt = readLockEpoch();
    const userId = await this.resolvedOwner();
    await this.refreshStatus();
    if (!this.sameSession(epoch, lockAt, userId)) return;
    await this.hold(dek, 2);
  }

  /**
   * After a successful unlock, raise stored PBKDF2 iterations to the current floor.
   * The same DEK and signing key are kept, so existing ciphertext and the public key stay valid.
   * Callers on the login and unlock screens must not await this: the extra PBKDF2 work
   * must not delay navigation. A failed write leaves the previous wraps in place.
   */
  async upgradeKdfIfNeeded(passphrase: string): Promise<void> {
    try {
      await this.ensureAuthWrap();
      await this.applyKdfUpgrade(passphrase);
    } catch {
      this.kdfUpgradeFailures += 1;
      this.toast.error("Couldn't finish a security upgrade. We'll retry next time you unlock.");
    }
  }

  private async ensureAuthWrap(): Promise<void> {
    if (this.authWrap?.wrapped_private_key_b64 && this.authWrap.kdf_iterations) return;
    const body = await firstValueFrom(
      this.http.get<{ auth: WrappedSigningKey }>(apiUrl('/auth/passwordless/wraps'), { context: silentErrorToast() })
    );
    if (body?.auth?.wrapped_private_key_b64) this.authWrap = body.auth;
  }

  private async applyKdfUpgrade(passphrase: string): Promise<void> {
    const status = this.statusSubject.value;
    const auth = this.authWrap;
    const authStale = !!auth && auth.kdf_iterations < DEFAULT_PBKDF2_ITERATIONS;
    const vaultStale = !!status?.kdf_iterations && status.kdf_iterations < DEFAULT_PBKDF2_ITERATIONS && !!this.dek;
    if (!authStale && !vaultStale) return;
    if (authStale && auth) {
      const wrapped = await this.rewrapAuthWrap(passphrase, auth);
      await firstValueFrom(this.http.put(apiUrl('/auth/passwordless/wraps'), wrapped, { context: silentErrorToast() }));
      this.authWrap = wrapped;
    }
    if (vaultStale && this.dek && status) {
      const rewrap = await this.rewrapVaultDek(passphrase);
      const updated = await firstValueFrom(
        this.http.put<VaultStatus>(apiUrl('/vault/wraps'), rewrap, { context: silentErrorToast() })
      );
      this.statusSubject.next(updated);
      this.unlockedWrap = updated.wrapped_dek_b64 ?? this.unlockedWrap;
    }
  }

  private rewrapAuthWrap(passphrase: string, auth: WrappedSigningKey): Promise<WrappedSigningKey> {
    return rewrapSigningKey(passphrase, auth, DEFAULT_PBKDF2_ITERATIONS);
  }

  private rewrapVaultDek(passphrase: string): Promise<{ kdf_salt_b64: string; kdf_iterations: number; wrapped_dek_b64: string }> {
    const status = this.statusSubject.value;
    if (!status?.kdf_salt_b64 || !status.kdf_iterations || !status.wrapped_dek_b64) throw new Error('Vault is locked');
    return rewrapDekWithPassphrase(passphrase, {
      kdf_salt_b64: status.kdf_salt_b64,
      kdf_iterations: status.kdf_iterations,
      wrapped_dek_b64: status.wrapped_dek_b64,
    }, passphrase, DEFAULT_PBKDF2_ITERATIONS);
  }

  async unlock(passphrase: string, forceRefresh = false): Promise<boolean> {
    const epoch = this.epoch;
    const lockAt = readLockEpoch();
    const userId = await this.resolvedOwner();
    const status = !forceRefresh && this.statusSubject.value ? this.statusSubject.value : await this.refreshStatus();
    if (!this.sameSession(epoch, lockAt, userId)) return false;
    if (!status.exists || !status.kdf_salt_b64 || !status.wrapped_dek_b64 || !status.kdf_iterations) {
      throw new Error('Vault is not set up');
    }
    const dek = await unlockWithPassphrase(passphrase, status.kdf_salt_b64, status.kdf_iterations, status.wrapped_dek_b64);
    if (!this.sameSession(epoch, lockAt, userId) || userId == null) return false;
    const progress = await readBlindIndexProgress(userId).catch(() => null);
    if (!this.sameSession(epoch, lockAt, userId)) return false;
    await this.hold(dek, progress?.blind_index_version ?? 1, progress?.reindexed ?? []);
    return this.isUnlocked;
  }

  requireDek(): CryptoKey {
    if (!this.dek) throw new Error('Vault is locked');
    return this.dek;
  }

  async encryptPayload(
    value: unknown,
    collection: string,
    clientId: string,
    schemaVersion: number,
    keyVersion: number
  ): Promise<string> {
    return encryptJson(this.requireDek(), value, this.recordAdditionalData(collection, clientId, schemaVersion, keyVersion));
  }

  async decryptPayload<T>(
    ciphertextB64: string,
    collection: string,
    clientId: string,
    schemaVersion: number,
    keyVersion: number
  ): Promise<T> {
    return decryptJson<T>(
      this.requireDek(),
      ciphertextB64,
      this.recordAdditionalData(collection, clientId, schemaVersion, keyVersion)
    );
  }

  private recordAdditionalData(
    collection: string,
    clientId: string,
    schemaVersion: number,
    keyVersion: number
  ): Uint8Array | undefined {
    if (schemaVersion === 1) return undefined;
    if (schemaVersion === 2) return recordAad(collection, clientId, schemaVersion, keyVersion);
    throw new Error(`Unsupported record schema version: ${schemaVersion}`);
  }

  async blindIndex(value: string): Promise<string> {
    return hmacBlindIndex(this.requireDek(), value);
  }

  /** Unions the HKDF index with the pre-upgrade index, including after version 2. Health rows keep the legacy index. */
  async lookupBlindIndex(collection: string, indexName: string, value: string): Promise<string[]> {
    const dek = this.requireDek();
    const epoch = this.epoch;
    const lockAt = readLockEpoch();
    const userId = this.ownerId();
    const hkdf = await hmacBlindIndex(dek, value);
    if (!this.sameSession(epoch, lockAt, userId)) return [];
    const legacy = await legacyDekBlindIndex(dek, value);
    if (!this.sameSession(epoch, lockAt, userId)) return [];
    const primary = await this.postBlindIndex(collection, indexName, hkdf);
    if (!this.sameSession(epoch, lockAt, userId)) return [];
    let secondary: string[] = [];
    try { secondary = await this.postBlindIndex(collection, indexName, legacy); } catch { secondary = []; }
    if (!this.sameSession(epoch, lockAt, userId)) return [];
    return [...new Set([...primary, ...secondary])];
  }

  private postBlindIndex(collection: string, indexName: string, indexValue: string): Promise<string[]> {
    return firstValueFrom(this.http.post<{ client_ids?: string[] }>(apiUrl('/vault/indexes/lookup'), {
      collection, index_name: indexName, index_value_b64: indexValue,
    }, { context: silentErrorToast() })).then(body => body?.client_ids ?? []);
  }

  ensureBlindIndexes(): Promise<void> {
    if (this.versionNumber >= 2 || !this.dek) return Promise.resolve();
    if (this.reindexTask) return this.reindexTask;
    const userId = this.ownerId();
    if (userId == null) return Promise.resolve();
    const token = ++this.reindexGeneration;
    const epoch = this.epoch;
    const lockAt = readLockEpoch();
    const generation = this.holdGeneration;
    const run = this.reindexTail.then(() => this.runReindex(epoch, lockAt, userId, generation));
    this.reindexTail = run.then(() => undefined, () => undefined);
    this.reindexTask = run.finally(() => {
      if (this.reindexGeneration === token) this.reindexTask = null;
    });
    return this.reindexTask;
  }

  /** Fire-and-forget. A failure stays on the dev log and does not reject unlock. */
  private startBlindIndexes(): void {
    const task = this.ensureBlindIndexes();
    void task.catch(() => this.noteReindexFailure());
  }

  private noteReindexFailure(): void {
    if (isDevMode()) console.debug('vault re-index stopped before version 2');
  }

  /** Stop this batch on a lock or user switch. A second hold of the same session does not abandon it, and a stale batch must not wipe that hold's key. */
  private async replaced(epoch: number, lockAt: number, userId: number | null, generation: number): Promise<boolean> {
    if (this.owns(epoch, lockAt, userId)) return false;
    if (generation === this.holdGeneration && this.sessionMoved(epoch, lockAt, userId)) {
      this.dek = null;
      this.unlockedSubject.next(false);
      await clearDekLocal();
    }
    return true;
  }

  private async runReindex(epoch: number, lockAt: number, userId: number | null, generation: number): Promise<void> {
    if (await this.replaced(epoch, lockAt, userId, generation) || this.versionNumber >= 2) return;
    const records = await firstValueFrom(this.listRecords(undefined, { silent: true }));
    for (const record of records) {
      if (await this.replaced(epoch, lockAt, userId, generation)) return;
      const visited = `${record.collection}/${record.client_id}`;
      if (this.reindexed.has(visited)) continue;
      if (record.collection === 'transactions') await this.reindexTransaction(record, epoch, lockAt, userId);
      if (await this.replaced(epoch, lockAt, userId, generation)) return;
      this.reindexed.add(visited);
      await this.persistProgress(epoch, lockAt, userId, generation);
    }
    if (await this.replaced(epoch, lockAt, userId, generation)) return;
    this.versionNumber = 2;
    this.reindexed.clear();
    await this.persistProgress(epoch, lockAt, userId, generation);
  }

  /** null: this session no longer owns the key. undefined: skip the row. string: index of the ciphertext just read. */
  private async dedupeIndex(dek: CryptoKey, record: EncryptedRecordDto, epoch: number, lockAt: number, userId: number | null): Promise<string | null | undefined> {
    if (!this.owns(epoch, lockAt, userId)) return null;
    let dedupe = '';
    try {
      const data = await this.decryptPayload<{ dedupe_key?: unknown }>(record.ciphertext_b64, record.collection, record.client_id, record.schema_version, record.key_version);
      dedupe = typeof data?.dedupe_key === 'string' ? data.dedupe_key : '';
    } catch {
      if (!this.owns(epoch, lockAt, userId)) return null;
      this.noteUndecryptable();
      return undefined;
    }
    if (!this.owns(epoch, lockAt, userId)) return null;
    if (!dedupe) return undefined;
    const indexValue = await hmacBlindIndex(dek, dedupe);
    if (!this.owns(epoch, lockAt, userId)) return null;
    return indexValue;
  }

  private async reindexTransaction(record: EncryptedRecordDto, epoch: number, lockAt: number, userId: number | null): Promise<void> {
    const dek = this.dek;
    if (!dek || !this.sameSession(epoch, lockAt, userId)) return;
    const initial = await this.dedupeIndex(dek, record, epoch, lockAt, userId);
    if (initial === null || initial === undefined) return;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      if (!this.owns(epoch, lockAt, userId)) return;
      const fresh = (await firstValueFrom(this.listRecords('transactions', { silent: true }))).find(row => row.client_id === record.client_id);
      // Missing after the refetch means deleted. The update-only endpoint also reports a skip if it vanishes after that.
      if (!fresh || !this.owns(epoch, lockAt, userId)) return;
      const indexValue = await this.dedupeIndex(dek, fresh, epoch, lockAt, userId);
      if (indexValue === null || indexValue === undefined) return;
      try {
        const result = await firstValueFrom(this.reindexRecords([{
          collection: fresh.collection, client_id: fresh.client_id, ciphertext_b64: fresh.ciphertext_b64,
          schema_version: fresh.schema_version, key_version: fresh.key_version, expected_revision: fresh.revision,
          indexes: [{ index_name: 'dedupe_key', index_value_b64: indexValue }],
        }], { silent: true }));
        if (result?.skipped?.includes(fresh.client_id)) return;
        return;
      } catch (error) {
        const status = typeof error === 'object' && error && 'status' in error ? Number((error as { status?: unknown }).status) : 0;
        if (attempt === 1 || status !== 409) throw error;
      }
    }
  }

  private noteUndecryptable(): void {
    this.undecryptableRows += 1;
    if (isDevMode()) console.debug(`vault re-index skipped undecryptable rows: ${this.undecryptableRows}`);
  }

  listRecords(collection?: string, options?: VaultWriteOptions): Observable<EncryptedRecordDto[]> {
    const q = collection ? `?collection=${encodeURIComponent(collection)}` : '';
    return this.http.get<EncryptedRecordDto[]>(apiUrl(`/vault/records${q}`), this.requestOptions(options));
  }

  /**
   * Dialog saves and other callers that show their own error pass `{ silent: true }`
   * on that call. A concurrent upsert or delete keeps the interceptor toast.
   */
  reindexRecords(
    records: Array<{
      collection: string;
      client_id: string;
      ciphertext_b64: string;
      schema_version?: number;
      key_version?: number;
      expected_revision?: number | null;
      indexes?: Array<{ index_name: string; index_value_b64: string }>;
    }>,
    options?: VaultWriteOptions,
  ): Observable<{ records: EncryptedRecordDto[]; skipped: string[] }> {
    return this.http.post<{ records: EncryptedRecordDto[]; skipped: string[] }>(
      apiUrl('/vault/records/reindex'), { records }, this.requestOptions(options),
    );
  }

  upsertRecords(
    records: Array<{
      collection: string;
      client_id: string;
      ciphertext_b64: string;
      schema_version?: number;
      key_version?: number;
      expected_revision?: number | null;
      indexes?: Array<{ index_name: string; index_value_b64: string }>;
    }>,
    options?: VaultWriteOptions,
  ): Observable<EncryptedRecordDto[]> {
    return this.http.post<EncryptedRecordDto[]>(apiUrl('/vault/records/upsert'), { records }, this.requestOptions(options));
  }

  deleteRecords(
    records: Array<{ collection: string; client_id: string; expected_revision: number }>,
    options?: VaultWriteOptions,
  ): Observable<{ deleted: number }> {
    return this.http.post<{ deleted: number }>(apiUrl('/vault/records/delete'), { records }, this.requestOptions(options));
  }

  private requestOptions(options?: VaultWriteOptions): { context: ReturnType<typeof silentErrorToast> } | undefined {
    return options?.silent ? { context: silentErrorToast() } : undefined;
  }

  /**
   * The shared vault load suppresses the interceptor toast.
   * A normal caller asks for the standard failure toast after that load rejects.
   */
  reportFallbackFailure(): void {
    this.toast.error(HTTP_ERROR_FALLBACK);
  }

  getCounts(): Observable<{ counts: Record<string, number> }> {
    return this.http.get<{ counts: Record<string, number> }>(apiUrl('/vault/counts'));
  }
}
