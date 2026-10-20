import { Injectable } from '@angular/core';
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
  unlockWithPassphrase,
} from './vault-crypto';
import { WrappedSigningKey } from '@vivek/auth';

export interface VaultStatus {
  exists: boolean;
  kdf_algorithm?: string | null;
  kdf_salt_b64?: string | null;
  kdf_iterations?: number | null;
  wrapped_dek_b64?: string | null;
  recovery_wrapped_dek_b64?: string | null;
  key_version?: number | null;
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
  private dek: CryptoKey | null = null;
  private statusSubject = new BehaviorSubject<VaultStatus | null>(null);
  private unlockedSubject = new BehaviorSubject<boolean>(false);
  private authWrap: WrappedSigningKey | null = null;
  private boot: Promise<void>;

  readonly status$ = this.statusSubject.asObservable();
  readonly unlocked$ = this.unlockedSubject.asObservable();

  constructor(private http: HttpClient) {
    this.boot = this.hydrate();
  }

  private async hydrate(): Promise<void> {
    const dek = await restoreDekLocal();
    if (!dek) return;
    this.dek = dek;
    this.unlockedSubject.next(true);
  }

  private hold(dek: CryptoKey): void {
    this.dek = dek;
    this.unlockedSubject.next(true);
    void persistDekLocal(dek);
  }

  get isUnlocked(): boolean {
    return this.unlockedSubject.value && !!this.dek;
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
    if (this.isUnlocked) return;
    const body = await firstValueFrom(
      this.http.get<{ passphrase: string }>(apiUrl('/auth/local-dev/vault'))
    );
    const passphrase = body?.passphrase?.trim() ?? '';
    if (passphrase.length < 12) {
      throw new Error('Local dev vault is unavailable');
    }
    const status = this.statusSubject.value ?? (await this.refreshStatus());
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
    this.dek = null;
    this.unlockedSubject.next(false);
    clearDekLocal();
  }

  async setup(passphrase: string): Promise<void> {
    const material = await createVaultMaterial(passphrase);
    const status = await firstValueFrom(
      this.http.post<VaultStatus>(apiUrl('/vault/setup'), material.setupPayload)
    );
    this.statusSubject.next(status);
    this.hold(material.dek);
  }

  /** Completes an atomically-created vault after passwordless account bootstrap/signup. */
  async adoptBootstrapVault(dek: CryptoKey): Promise<void> {
    await this.refreshStatus();
    this.hold(dek);
  }

  async unlock(passphrase: string): Promise<void> {
    const status = this.statusSubject.value ?? (await this.refreshStatus());
    if (!status.exists || !status.kdf_salt_b64 || !status.wrapped_dek_b64 || !status.kdf_iterations) {
      throw new Error('Vault is not set up');
    }
    this.hold(
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

  listRecords(collection?: string): Observable<EncryptedRecordDto[]> {
    const q = collection ? `?collection=${encodeURIComponent(collection)}` : '';
    return this.http.get<EncryptedRecordDto[]>(apiUrl(`/vault/records${q}`));
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
    }>
  ): Observable<EncryptedRecordDto[]> {
    return this.http.post<EncryptedRecordDto[]>(apiUrl('/vault/records/upsert'), { records });
  }

  deleteRecords(
    records: Array<{ collection: string; client_id: string; expected_revision: number }>
  ): Observable<{ deleted: number }> {
    return this.http.post<{ deleted: number }>(apiUrl('/vault/records/delete'), { records });
  }

  getCounts(): Observable<{ counts: Record<string, number> }> {
    return this.http.get<{ counts: Record<string, number> }>(apiUrl('/vault/counts'));
  }
}
