import { inject } from '@angular/core';
import { SESSION_CONTEXT } from '@vivek/ui';
import { financeTabId } from './dek-holder';
import { LOCK_SIGNAL, VAULT_PRESENCE } from './dek-store';

/** BroadcastChannel name shared by the lock sender and the market coordinator. */
export const VAULT_SYNC_CHANNEL = 'finance-vault-sync-v1';

/**
 * Validated lock or sign-out. The object is built here, so a payload cannot
 * carry a passphrase, key, or any field that was not accepted.
 */
export interface LockSessionNotice {
  version: 1;
  userId?: number;
  kind: 'lock' | 'signout';
  tabId?: string;
}

type Binding = { drop: (notice: LockSessionNotice) => void };

const bindings = new Set<Binding>();
const ownerReaders = new Set<() => number | null>();
let channel: BroadcastChannel | null = null;
let onStorage: ((event: StorageEvent) => void) | null = null;

function ownerId(): number | null {
  for (const read of ownerReaders) {
    const id = read();
    if (Number.isInteger(id)) return id;
  }
  return null;
}

/**
 * One accepted cross-tab notice, or null.
 * A lock posted by this tab is an echo. A sign-out is never treated as an echo.
 * The input is not rewritten into a notice for the current owner.
 */
export function acceptLockNotice(
  value: unknown,
  userId: number | null,
  localTabId: string = financeTabId(),
): LockSessionNotice | null {
  if (!Number.isInteger(userId) || value === null || typeof value !== 'object' || Array.isArray(value)) return null;
  const message = value as Record<string, unknown>;
  const kind = message['kind'];
  if (message['version'] !== 1 || message['userId'] !== userId) return null;
  if (kind !== 'lock' && kind !== 'signout') return null;
  const tabId = message['tabId'];
  if (tabId !== undefined && typeof tabId !== 'string') return null;
  if (kind === 'lock' && tabId === localTabId) return null;
  const notice: LockSessionNotice = { version: 1, userId: userId as number, kind };
  if (typeof tabId === 'string') notice.tabId = tabId;
  return notice;
}

/** localStorage signals that already mean "lock" for every current consumer. */
export function storageLocksVault(event: StorageEvent): boolean {
  if (event.key === null) return true;
  if (event.key === LOCK_SIGNAL && event.newValue !== null) return true;
  return event.key === VAULT_PRESENCE && event.newValue === null;
}

function emit(notice: LockSessionNotice): void {
  for (const binding of [...bindings]) {
    if (!bindings.has(binding)) continue;
    try { binding.drop(notice); }
    catch { /* one listener must not stop the others */ }
  }
}

function onChannelMessage(event: MessageEvent<unknown>): void {
  const notice = acceptLockNotice(event.data, ownerId());
  if (notice) emit(notice);
}

function onStorageEvent(event: StorageEvent): void {
  if (!storageLocksVault(event)) return;
  const userId = ownerId();
  emit(userId == null ? { version: 1, kind: 'lock' } : { version: 1, userId, kind: 'lock' });
}

function ensureTransport(): void {
  if (typeof window !== 'undefined' && !onStorage) {
    try {
      window.addEventListener('storage', onStorageEvent);
      onStorage = onStorageEvent;
    } catch {
      // Storage events are unavailable. Channel delivery and same-tab snapshots still run.
    }
  }
  if (typeof BroadcastChannel !== 'undefined' && !channel) {
    try {
      channel = new BroadcastChannel(VAULT_SYNC_CHANNEL);
      channel.onmessage = onChannelMessage;
    } catch {
      channel = null;
    }
  }
}

function releaseTransport(): void {
  if (bindings.size > 0) return;
  if (onStorage && typeof window !== 'undefined') window.removeEventListener('storage', onStorage);
  onStorage = null;
  channel?.close();
  channel = null;
  ownerReaders.clear();
}

/** Subscribe to validated lock and sign-out notices. Disposal removes only this binding. */
export function bindLockNotices(drop: (notice: LockSessionNotice) => void): () => void {
  const session = inject(SESSION_CONTEXT, { optional: true });
  const readOwner = () => session?.currentUser?.id ?? null;
  ownerReaders.add(readOwner);
  const binding: Binding = { drop };
  bindings.add(binding);
  ensureTransport();
  let bound = true;
  return () => {
    if (!bound) return;
    bound = false;
    bindings.delete(binding);
    ownerReaders.delete(readOwner);
    releaseTransport();
  };
}
