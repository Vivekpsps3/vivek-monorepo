import type { Injector } from '@angular/core';
import { SESSION_CONTEXT } from '@vivek/ui';
import { readLockEpoch } from './dek-holder';
import { createVaultRecordCapability, type VaultRecordEligibility } from './vault-record-capability';
import { VaultService } from './vault.service';
import { RecoveryError } from './recovery-bundle';

/** One Finance recovery lifetime; export closes after download, restore after disposal. */
export function openRecoveryScope(injector: Injector, parent: AbortSignal) {
  const vault = injector.get(VaultService);
  const session = injector.get(SESSION_CONTEXT);
  const controller = new AbortController();
  const read = (): VaultRecordEligibility => ({ ownerId: session.currentUser?.id ?? null, generation: readLockEpoch(), unlocked: vault.isUnlocked });
  const ticket = read();
  const abort = (): void => controller.abort();
  const ownerSubscription = session.user$.subscribe(user => { if (user?.id !== ticket.ownerId) abort(); });
  const lockSubscription = vault.unlocked$.subscribe(unlocked => { if (!unlocked) abort(); });
  parent.addEventListener('abort', abort, { once: true });
  if (parent.aborted) abort();
  const check = (): void => {
    const now = read();
    if (controller.signal.aborted || !ticket.ownerId || !ticket.unlocked || !now.unlocked || now.ownerId !== ticket.ownerId || now.generation !== ticket.generation) {
      abort();
      throw new RecoveryError('Recovery cancelled. Unlock Finance and preview the file again.');
    }
  };
  return {
    vault, records: createVaultRecordCapability(vault, read), read, signal: controller.signal, check,
    dispose(): void {
      abort(); ownerSubscription.unsubscribe(); lockSubscription.unsubscribe();
      parent.removeEventListener('abort', abort);
    },
  };
}
