/** Legacy localStorage name. The key itself lives in IndexedDB. */
export const DEK_STORE = 'finance-dek';
export const VAULT_PRESENCE = 'finance-vault-present';
/** Other tabs lock when this appears. Migration does not write it. */
export const LOCK_SIGNAL = 'finance-vault-lock';
export const VAULT_DB_NAME = 'finance-vault';
export const VAULT_KEY_STORE = 'keys';
export const VAULT_KEY_ID = 'dek';

function presenceOwner(value: string | null): number | null {
  if (!value || !/^[1-9]\d*$/.test(value)) return null;
  const id = Number(value);
  return Number.isSafeInteger(id) ? id : null;
}

/** Clear the persisted key without loading the vault implementation. localStorage is cleared before the promise resolves. */
export function clearFinanceSessionStorage(): Promise<void> {
  try { localStorage.removeItem(DEK_STORE); } catch { /* private mode */ }
  try { localStorage.removeItem(VAULT_PRESENCE); } catch { /* private mode */ }
  return deleteFinanceVaultKey();
}

/** True when this browser still has a saved vault key. Does not import vault crypto. */
export function financeVaultPresent(): boolean {
  try {
    return !!localStorage.getItem(DEK_STORE) || presenceOwner(localStorage.getItem(VAULT_PRESENCE)) != null;
  } catch {
    return false;
  }
}

/** Presence value is the owning user id. A null or non-user value is not present for anyone. */
export function markVaultPresent(ownerId: number): void {
  if (!Number.isInteger(ownerId) || ownerId <= 0) return;
  try { localStorage.setItem(VAULT_PRESENCE, String(ownerId)); } catch { /* private mode */ }
}

export function vaultMarkedPresent(ownerId: number): boolean {
  try { return presenceOwner(localStorage.getItem(VAULT_PRESENCE)) === ownerId; } catch { return false; }
}

let removingKey: Promise<void> | null = null;

export function withVaultStore<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const factory = globalThis.indexedDB;
  if (!factory) return Promise.reject(new Error('IndexedDB is unavailable'));
  return new Promise((resolve, reject) => {
    let settled = false;
    const fail = (error: unknown) => { if (!settled) { settled = true; reject(error ?? new Error('IndexedDB request failed')); } };
    const open = factory.open(VAULT_DB_NAME, 1);
    open.onupgradeneeded = () => {
      if (!open.result.objectStoreNames.contains(VAULT_KEY_STORE)) open.result.createObjectStore(VAULT_KEY_STORE, { keyPath: 'id' });
    };
    open.onerror = () => fail(open.error);
    open.onsuccess = () => {
      const db = open.result;
      const tx = db.transaction(VAULT_KEY_STORE, mode);
      const request = run(tx.objectStore(VAULT_KEY_STORE));
      const close = () => db.close();
      tx.oncomplete = () => { if (!settled) { settled = true; close(); resolve(request.result); } };
      tx.onerror = () => { close(); fail(tx.error); };
      tx.onabort = () => { close(); fail(tx.error ?? request.error); };
    };
  });
}

/** Drop the IndexedDB key record. Progress rows in the same database stay. */
export function deleteFinanceVaultKey(): Promise<void> {
  if (!globalThis.indexedDB) return Promise.resolve();
  const prev = removingKey ?? Promise.resolve();
  let tracked: Promise<void> = Promise.resolve();
  tracked = prev.catch(() => undefined).then(() => withVaultStore('readwrite', store => store.delete(VAULT_KEY_ID))).then(() => undefined, () => undefined).finally(() => {
    if (removingKey === tracked) removingKey = null;
  });
  removingKey = tracked;
  return tracked;
}

let droppingDb: Promise<void> | null = null;

/** Test cleanup. Production lock deletes the key record and leaves re-index progress. */
export function deleteFinanceVaultDb(): Promise<void> {
  if (droppingDb) return droppingDb;
  const factory = globalThis.indexedDB;
  if (!factory) return Promise.resolve();
  droppingDb = new Promise(resolve => {
    const finish = () => { droppingDb = null; resolve(); };
    const request = factory.deleteDatabase(VAULT_DB_NAME);
    // onblocked means a connection is still open. Wait for onsuccess so a late delete cannot erase the next test's key.
    request.onsuccess = request.onerror = finish;
  });
  return droppingDb;
}
