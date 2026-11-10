import type { Injector } from '@angular/core';
import { Observable } from 'rxjs';
import { SESSION_CONTEXT } from '@vivek/ui';
import { hasDek, readLockEpoch } from './dek-holder';
import { VaultService } from './vault.service';

/**
 * Wire row from list and upsert. Health reads client id, ciphertext, schema,
 * key version, and revision. `updated_at` stays so the endpoint envelope is
 * not rewritten.
 */
export interface VaultRecordEnvelope {
  collection: string;
  client_id: string;
  ciphertext_b64: string;
  schema_version: number;
  key_version: number;
  revision: number;
  updated_at: string;
}

/** Upsert body Health sends. A create uses a null expected revision. No indexes. */
export interface VaultRecordUpsert {
  collection: string;
  client_id: string;
  ciphertext_b64: string;
  schema_version: number;
  key_version: number;
  expected_revision: number | null;
}

export interface VaultRecordDelete {
  collection: string;
  client_id: string;
  expected_revision: number;
}

/** Per-call flag. Only that HTTP call skips the fallback toast. */
export interface VaultRecordRequestOptions {
  silent?: boolean;
}

/**
 * Record and browser-local crypto operations Health calls.
 * Each call captures the current owner and lock generation and yields a
 * result only while that pair is still current. CryptoKey, the raw DEK, and
 * Finance vault methods Health does not call are not on this surface.
 */
export interface VaultRecordCapability {
  listRecords(collection: string, options?: VaultRecordRequestOptions): Observable<VaultRecordEnvelope[]>;
  encryptPayload(
    value: unknown,
    collection: string,
    clientId: string,
    schemaVersion: number,
    keyVersion: number,
  ): Promise<string>;
  decryptPayload<T>(
    ciphertextB64: string,
    collection: string,
    clientId: string,
    schemaVersion: number,
    keyVersion: number,
  ): Promise<T>;
  upsertRecords(
    records: readonly VaultRecordUpsert[],
    options?: VaultRecordRequestOptions,
  ): Observable<VaultRecordEnvelope[]>;
  deleteRecords(
    records: readonly VaultRecordDelete[],
    options?: VaultRecordRequestOptions,
  ): Observable<{ deleted: number }>;
}

/** Owner and lock generation captured around one record or crypto call. */
export interface VaultRecordEligibility {
  readonly ownerId: number | null;
  readonly generation: number;
  readonly unlocked: boolean;
}

/** The captured owner or lock generation changed before the result could be returned. */
export class VaultRecordIneligibleError extends Error {
  constructor() {
    super('Vault record is no longer eligible.');
    this.name = 'VaultRecordIneligibleError';
  }
}

interface VaultRecordOperations {
  listRecords(collection?: string, options?: VaultRecordRequestOptions): Observable<VaultRecordEnvelope[]>;
  encryptPayload(
    value: unknown,
    collection: string,
    clientId: string,
    schemaVersion: number,
    keyVersion: number,
  ): Promise<string>;
  decryptPayload<T>(
    ciphertextB64: string,
    collection: string,
    clientId: string,
    schemaVersion: number,
    keyVersion: number,
  ): Promise<T>;
  upsertRecords(
    records: VaultRecordUpsert[],
    options?: VaultRecordRequestOptions,
  ): Observable<VaultRecordEnvelope[]>;
  deleteRecords(
    records: VaultRecordDelete[],
    options?: VaultRecordRequestOptions,
  ): Observable<{ deleted: number }>;
}

function ownerId(id: unknown): number | null {
  return typeof id === 'number' && Number.isInteger(id) && id > 0 ? id : null;
}

function captured(read: () => VaultRecordEligibility, needsKey: boolean): () => void {
  const ticket = read();
  const refuse = (): void => {
    const now = read();
    if (now.ownerId !== ticket.ownerId || now.generation !== ticket.generation) {
      throw new VaultRecordIneligibleError();
    }
    if (needsKey && (!ticket.unlocked || !now.unlocked)) throw new VaultRecordIneligibleError();
  };
  refuse();
  return refuse;
}

function delivered<T>(source: Observable<T>, refuse: () => void): Observable<T> {
  return new Observable(subscriber => {
    const subscription = source.subscribe({
      next: value => {
        try {
          refuse();
          subscriber.next(value);
        } catch (error) {
          subscriber.error(error);
        }
      },
      error: error => subscriber.error(error),
      complete: () => {
        try {
          refuse();
          subscriber.complete();
        } catch (error) {
          subscriber.error(error);
        }
      },
    });
    return () => subscription.unsubscribe();
  });
}

/** Adapts the existing Finance vault. This is the only record-capability implementation. */
export function createVaultRecordCapability(
  records: VaultRecordOperations,
  readEligibility: () => VaultRecordEligibility,
): VaultRecordCapability {
  return {
    listRecords(collection, options) {
      const refuse = captured(readEligibility, false);
      return delivered(records.listRecords(collection, options), refuse);
    },
    async encryptPayload(value, collection, clientId, schemaVersion, keyVersion) {
      const refuse = captured(readEligibility, true);
      const ciphertext = await records.encryptPayload(value, collection, clientId, schemaVersion, keyVersion);
      refuse();
      return ciphertext;
    },
    async decryptPayload<T>(
      ciphertextB64: string,
      collection: string,
      clientId: string,
      schemaVersion: number,
      keyVersion: number,
    ): Promise<T> {
      const refuse = captured(readEligibility, true);
      const value = await records.decryptPayload<T>(ciphertextB64, collection, clientId, schemaVersion, keyVersion);
      refuse();
      return value;
    },
    upsertRecords(recordsToSave, options) {
      const refuse = captured(readEligibility, false);
      return delivered(records.upsertRecords([...recordsToSave], options), refuse);
    },
    deleteRecords(recordsToDelete, options) {
      const refuse = captured(readEligibility, false);
      return delivered(records.deleteRecords([...recordsToDelete], options), refuse);
    },
  };
}

export function openVaultRecords(injector: Injector): VaultRecordCapability {
  const vault = injector.get(VaultService);
  const session = injector.get(SESSION_CONTEXT, null, { optional: true });
  return createVaultRecordCapability(vault, () => ({
    ownerId: ownerId(session?.currentUser?.id),
    generation: readLockEpoch(),
    unlocked: vault.isUnlocked && hasDek(),
  }));
}
