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
  persistDekLocal,
  recordAad,
  restoreDekLocal,
  rewrapDekWithPassphrase,
  unlockWithPassphrase,
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
  private unlockedWrap: string | null = null;
  private statusSubject = new BehaviorSubject<VaultStatus | null>(null);
  private unlockedSubject = new BehaviorSubject<boolean>(false);
  private authWrap: WrappedSigningKey | null = null;
  private boot: Promise<void>;
  /** Failed KDF upgrades since this page loaded. The session stays unlocked either way. */
  kdfUpgradeFailures = 0;
  private readonly toast = inject(ToastService);

  readonly status$ = this.statusSubject.asObservable();
  readonly unlocked$ = this.unlockedSubject.asObservable();

  constructor(private http: HttpClient) {
    inject(SESSION_CONTEXT, { optional: true })?.cleared$?.pipe(takeUntilDestroyed()).subscribe(() => this.lock());
    this.boot = this.hydrate();
  }

  private async hydrate(): Promise<void> {
    const epoch = this.epoch;
    const dek = await restoreDekLocal();
    if (!dek || epoch !== this.epoch) return;
    this.dek = dek;
    this.unlockedSubject.next(true);
  }

  private async hold(dek: CryptoKey): Promise<void> {
    this.dek = dek;
    this.unlockedWrap = this.statusSubject.value?.wrapped_dek_b64 ?? null;
    this.unlockedSubject.next(true);
    // The hub reads this key before it will load vault code. Store it before unlock returns.
    await persistDekLocal(dek);
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
    await this.hold(material.dek);
  }

  /** Completes an atomically-created vault after passwordless account bootstrap/signup. */
  async adoptBootstrapVault(dek: CryptoKey): Promise<void> {
    await this.refreshStatus();
    await this.hold(dek);
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
    return rewrapDekWithPassphrase(this.requireDek(), passphrase, DEFAULT_PBKDF2_ITERATIONS);
  }

  async unlock(passphrase: string): Promise<void> {
    const status = this.statusSubject.value ?? (await this.refreshStatus());
    if (!status.exists || !status.kdf_salt_b64 || !status.wrapped_dek_b64 || !status.kdf_iterations) {
      throw new Error('Vault is not set up');
    }
    await this.hold(
      await unlockWithPassphrase(
        passphrase,
        status.kdf_salt_b64,
        status.kdf_iterations,
        status.wrapped_dek_b64
      )
    );
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
