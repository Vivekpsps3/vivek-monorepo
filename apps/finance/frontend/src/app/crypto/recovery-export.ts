import type { Injector } from '@angular/core';
import { firstValueFrom, fromEvent, takeUntil, type Observable } from 'rxjs';
import { openBoundedWork } from '@vivek/browser';
import { SESSION_CONTEXT } from '@vivek/ui';
import { readLockEpoch } from './dek-holder';
import { createVaultRecordCapability, type VaultRecordEnvelope, type VaultRecordEligibility } from './vault-record-capability';
import { VaultService } from './vault.service';
import { encodeRecoveryBundle, RECOVERY_LIMITS, RecoveryError, validateRecoveryBundle, validateRecoveryCollections, type RecoveryBundle, type RecoveryCollection } from './recovery-bundle';

export interface RecoverySnapshot { collections: RecoveryCollection[]; records: VaultRecordEnvelope[] }
interface ExportVault {
  verifyRecoveryPassphrase(passphrase: string): Promise<void>;
  recoverySnapshot(): Observable<RecoverySnapshot>;
  decryptPayload<T>(ciphertext: string, collection: string, clientId: string, schema: number, key: number): Promise<T>;
}
/** One browser action, no persistent plaintext state. The publication callback runs only while eligible. */
export async function runRecoveryExport(
  vault: ExportVault,
  read: () => VaultRecordEligibility,
  currentPassphrase: string,
  backupPassword: string,
  signal: AbortSignal,
  publish: (file: string, count: number) => void,
): Promise<void> {
  const ticket = read();
  const work = openBoundedWork({ parents: [signal], deadlineMs: 120_000 });
  const bundle: RecoveryBundle = { collections: [], records: [] };
  const clear = (): void => {
    bundle.records.length = 0;
    bundle.collections.length = 0;
    currentPassphrase = '';
    backupPassword = '';
  };
  work.signal.addEventListener('abort', clear, { once: true });
  const check = (): void => {
    const now = read();
    if (work.signal.aborted || !ticket.ownerId || !ticket.unlocked || !now.unlocked || now.ownerId !== ticket.ownerId || now.generation !== ticket.generation) {
      clear();
      throw new RecoveryError('Backup cancelled. Unlock Finance and try again.');
    }
  };
  try {
    const result = await work.run(async () => {
      check();
      if (!currentPassphrase || backupPassword.length < 12 || backupPassword.length > 1024) throw new RecoveryError('Enter your current passphrase and a backup password of 12–1,024 characters.');
      try { await vault.verifyRecoveryPassphrase(currentPassphrase); }
      catch { check(); throw new RecoveryError('Current vault passphrase could not be verified. Check it and try again.'); }
      check();
      let snapshot: RecoverySnapshot;
      try {
        snapshot = await firstValueFrom(vault.recoverySnapshot().pipe(takeUntil(fromEvent(work.signal, 'abort'))));
      } catch (error) {
        check();
        const status = typeof error === 'object' && error && 'status' in error ? Number(error.status) : 0;
        if (status === 413) throw new RecoveryError('Vault exceeds the portable recovery size or record limit. No partial backup was created.');
        if (status === 422) throw new RecoveryError('Vault contains an unsupported record version or collection. Update the app before creating a backup.');
        if (status === 401) throw new RecoveryError('Your session expired. Sign in and unlock Finance before creating a backup.');
        throw new RecoveryError('Could not read the vault. Check your connection and try again. No partial backup was created.');
      }
      check();
      bundle.collections = validateRecoveryCollections(snapshot.collections).map(row => ({ ...row, schema_versions: [...row.schema_versions] }));
      if (!Array.isArray(snapshot.records) || snapshot.records.length > RECOVERY_LIMITS.records) throw new RecoveryError('Vault exceeds the recovery record limit. No partial backup was created.');
      let plainSize = 0;
      let ciphertextSize = 0;
      const descriptors = new Map(bundle.collections.map(row => [row.collection, row]));
      for (const row of snapshot.records) {
        check();
        if (!row || !descriptors.get(row.collection)?.schema_versions.includes(row.schema_version) || typeof row.ciphertext_b64 !== 'string' || row.ciphertext_b64.length > 4 * Math.ceil(RECOVERY_LIMITS.recordBytes / 3)) throw new RecoveryError('Vault contains an unsupported or oversized record. No partial backup was created.');
        ciphertextSize += row.ciphertext_b64.length;
        if (ciphertextSize > RECOVERY_LIMITS.fileBytes) throw new RecoveryError('Vault exceeds the recovery size limit. No partial backup was created.');
        let value: unknown;
        try { value = await vault.decryptPayload(row.ciphertext_b64, row.collection, row.client_id, row.schema_version, row.key_version); }
        catch { check(); throw new RecoveryError('A vault record could not be decrypted. No partial backup was created.'); }
        check();
        const record = { collection: row.collection, client_id: row.client_id, schema_version: row.schema_version, key_version: row.key_version, value };
        const size = new TextEncoder().encode(JSON.stringify(record)).byteLength;
        plainSize += size;
        if (size > RECOVERY_LIMITS.recordBytes || plainSize > RECOVERY_LIMITS.plainBytes) throw new RecoveryError('Vault exceeds the recovery size limit. No partial backup was created.');
        bundle.records.push(record);
      }
      check();
      validateRecoveryBundle(bundle);
      const count = bundle.records.length;
      const file = await encodeRecoveryBundle(bundle, backupPassword, check, work.signal);
      check();
      clear();
      publish(file, count);
    });
    if (result.status === 'failed') throw result.error;
    if (result.status === 'deadline') throw new RecoveryError('Backup timed out. No partial backup was created. Try again.');
    if (result.status === 'cancelled') throw new RecoveryError('Backup cancelled. No download was created.');
  } finally {
    clear();
    work.signal.removeEventListener('abort', clear);
    work.dispose();
  }
}

export async function exportFinanceRecovery(injector: Injector, current: string, password: string, signal: AbortSignal, publish: (file: string, count: number) => void): Promise<void> {
  const vault = injector.get(VaultService);
  const session = injector.get(SESSION_CONTEXT);
  const read = (): VaultRecordEligibility => ({ ownerId: session.currentUser?.id ?? null, generation: readLockEpoch(), unlocked: vault.isUnlocked });
  const records = createVaultRecordCapability(vault, read);
  const lifecycle = new AbortController();
  const owner = session.currentUser?.id;
  const ownerSubscription = session.user$.subscribe(user => { if (user?.id !== owner) lifecycle.abort(); });
  const lockSubscription = vault.unlocked$.subscribe(unlocked => { if (!unlocked) lifecycle.abort(); });
  const abort = (): void => lifecycle.abort();
  signal.addEventListener('abort', abort, { once: true });
  if (signal.aborted) lifecycle.abort();
  try {
    await runRecoveryExport({
      verifyRecoveryPassphrase: passphrase => vault.verifyRecoveryPassphrase(passphrase),
      recoverySnapshot: () => vault.recoverySnapshot(),
      decryptPayload: (...args) => records.decryptPayload(...args),
    }, read, current, password, lifecycle.signal, publish);
  } finally {
    ownerSubscription.unsubscribe(); lockSubscription.unsubscribe();
    signal.removeEventListener('abort', abort);
  }
}
