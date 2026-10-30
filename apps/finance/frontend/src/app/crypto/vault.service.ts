import { Injectable, inject } from '@angular/core';
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
  private dek: CryptoKey | null = null;
  private versionNumber = 1;
  private reindexed = new Set<string>();
  private reindexTask: Promise<void> | null = null;
  private reindexGeneration = 0;
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
    this.sessionPort?.cleared$?.pipe(takeUntilDestroyed()).subscribe(() => this.lock());
    this.boot = this.hydrate();
  }

  get blindIndexVersion(): number {
    return this.versionNumber;
  }

  private ownerId(): number | null {
    return this.sessionPort?.currentUser?.id ?? null;
  }
  private async hydrate(): Promise<void> {
    const epoch = this.epoch;
    let stored: StoredVaultKeys | null = null;
    try { stored = await restoreVaultKeys(); } catch { stored = null; }
    if (!stored || epoch !== this.epoch) return;
    await this.hold(stored.dek, stored.blind_index_version, stored.reindexed);
  }

  private async hold(dek: CryptoKey, version: number, reindexed: string[] = []): Promise<void> {
    const epoch = this.epoch;
    this.dek = dek;
    this.versionNumber = version;
    this.reindexed = new Set(reindexed);
    this.unlockedWrap = this.statusSubject.value?.wrapped_dek_b64 ?? null;
    // The hub reads presence before it will load vault code. Store the key before unlock returns.
    await this.persistProgress();
    if (epoch !== this.epoch) return;
    if (version < 2) {
      try { await this.ensureBlindIndexes(); } catch { /* next unlock resumes */ }
    }
    if (epoch !== this.epoch) return;
    this.unlockedSubject.next(true);
  }

  private async persistProgress(): Promise<void> {
    const epoch = this.epoch;
    const dek = this.dek;
    if (!dek) return;
    const progress = { blind_index_version: this.versionNumber, reindexed: [...this.reindexed] };
    await persistVaultKeys({ dek, ...progress });
    if (epoch !== this.epoch) {
      clearDekLocal();
      return;
    }
    const userId = this.ownerId();
    if (userId == null) return;
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
    this.lock();
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

  lock(): void {
    this.epoch += 1;
    this.reindexGeneration += 1;
    this.reindexTask = null;
    this.dek = null;
    this.unlockedWrap = null;
    this.unlockedSubject.next(false);
    clearDekLocal();
  }

  async setup(passphrase: string): Promise<void> {
    const material = await createVaultMaterial(passphrase);
    const status = await firstValueFrom(
      this.http.post<VaultStatus>(apiUrl('/finance/vault/setup'), material.setupPayload)
    );
    this.statusSubject.next(status);
    await this.hold(material.dek, 2);
  }

  /** Completes an atomically-created vault after passwordless account bootstrap/signup. */
  async adoptBootstrapVault(dek: CryptoKey): Promise<void> {
    await this.refreshStatus();
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

  async unlock(passphrase: string): Promise<void> {
    const status = this.statusSubject.value ?? (await this.refreshStatus());
    if (!status.exists || !status.kdf_salt_b64 || !status.wrapped_dek_b64 || !status.kdf_iterations) {
      throw new Error('Vault is not set up');
    }
    const dek = await unlockWithPassphrase(passphrase, status.kdf_salt_b64, status.kdf_iterations, status.wrapped_dek_b64);
    const progress = await readBlindIndexProgress(this.ownerId()).catch(() => null);
    await this.hold(dek, progress?.blind_index_version ?? 1, progress?.reindexed ?? []);
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

  async lookupBlindIndex(collection: string, indexName: string, value: string): Promise<string[]> {
    const dek = this.requireDek();
    const primary = await this.postBlindIndex(collection, indexName, await hmacBlindIndex(dek, value));
    if (primary.length) return primary;
    try { return await this.postBlindIndex(collection, indexName, await legacyDekBlindIndex(dek, value)); }
    catch { return primary; }
  }

  private postBlindIndex(collection: string, indexName: string, indexValue: string): Promise<string[]> {
    return firstValueFrom(this.http.post<{ client_ids?: string[] }>(apiUrl('/vault/indexes/lookup'), {
      collection, index_name: indexName, index_value_b64: indexValue,
    }, { context: silentErrorToast() })).then(body => body?.client_ids ?? []);
  }

  ensureBlindIndexes(): Promise<void> {
    if (this.versionNumber >= 2 || !this.dek) return Promise.resolve();
    if (this.reindexTask) return this.reindexTask;
    const generation = ++this.reindexGeneration;
    const epoch = this.epoch;
    this.reindexTask = this.runReindex(epoch).finally(() => {
      if (this.reindexGeneration === generation) this.reindexTask = null;
    });
    return this.reindexTask;
  }

  private async runReindex(epoch: number): Promise<void> {
    if (!this.dek || this.versionNumber >= 2) return;
    const records = await firstValueFrom(this.listRecords(undefined, { silent: true }));
    for (const record of records) {
      if (epoch !== this.epoch || !this.dek) return;
      const token = `${record.collection}/${record.client_id}`;
      if (this.reindexed.has(token)) continue;
      if (record.collection === 'transactions') await this.reindexTransaction(record, epoch);
      if (epoch !== this.epoch || !this.dek) return;
      this.reindexed.add(token);
      await this.persistProgress();
    }
    if (epoch !== this.epoch || !this.dek) return;
    this.versionNumber = 2;
    this.reindexed.clear();
    await this.persistProgress();
  }

  private async reindexTransaction(record: EncryptedRecordDto, epoch: number): Promise<void> {
    let current = record;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      let dedupe = '';
      try {
        const data = await this.decryptPayload<{ dedupe_key?: unknown }>(
          current.ciphertext_b64, current.collection, current.client_id, current.schema_version, current.key_version,
        );
        dedupe = typeof data?.dedupe_key === 'string' ? data.dedupe_key : '';
      } catch { return; }
      if (!dedupe || epoch !== this.epoch || !this.dek) return;
      try {
        await firstValueFrom(this.upsertRecords([{
          collection: current.collection, client_id: current.client_id, ciphertext_b64: current.ciphertext_b64,
          schema_version: current.schema_version, key_version: current.key_version, expected_revision: current.revision,
          indexes: [{ index_name: 'dedupe_key', index_value_b64: await hmacBlindIndex(this.dek, dedupe) }],
        }], { silent: true }));
        return;
      } catch (error) {
        const status = typeof error === 'object' && error && 'status' in error ? Number((error as { status?: unknown }).status) : 0;
        if (attempt === 1 || status !== 409) throw error;
        const latest = (await firstValueFrom(this.listRecords('transactions', { silent: true }))).find(row => row.client_id === record.client_id);
        if (!latest || epoch !== this.epoch || !this.dek) return;
        current = latest;
      }
    }
  }

  listRecords(collection?: string, options?: VaultWriteOptions): Observable<EncryptedRecordDto[]> {
    const q = collection ? `?collection=${encodeURIComponent(collection)}` : '';
    return this.http.get<EncryptedRecordDto[]>(apiUrl(`/vault/records${q}`), this.requestOptions(options));
  }

  /**
   * Dialog saves and other callers that show their own error pass `{ silent: true }`
   * on that call. A concurrent upsert or delete keeps the interceptor toast.
   */
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
