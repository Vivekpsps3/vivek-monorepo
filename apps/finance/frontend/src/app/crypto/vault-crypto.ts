import {
  decodeBase64 as b64ToBuf,
  decryptPackedAesGcm,
  derivePbkdf2AesGcmKey,
  encodeBase64 as bufToB64,
  encryptPackedAesGcm,
  randomBytes,
  toArrayBuffer,
  DEFAULT_PBKDF2_ITERATIONS,
} from '@vivek/browser';
import {
  DEK_STORE, VAULT_KEY_ID, VAULT_PRESENCE, clearFinanceSessionStorage, markVaultPresent, vaultMarkedPresent, withVaultStore,
} from './dek-store';
import { migrateLegacyDek } from './dek-holder';

export { DEFAULT_PBKDF2_ITERATIONS, randomBytes };

/**
 * Browser-only crypto for server-blind storage.
 * Backend never receives passphrases or unwrapped DEKs.
 * Access is vault passphrase only (no recovery-key path).
 */

const textDecoder = new TextDecoder();
const textEncoder = new TextEncoder();
const BLIND_INDEX_INFO = textEncoder.encode('finance-blind-index-v1');

export function recordAad(
  collection: string,
  clientId: string,
  schemaVersion: number,
  keyVersion: number
): Uint8Array {
  return textEncoder.encode(JSON.stringify([collection, clientId, schemaVersion, keyVersion]));
}

export function randomClientId(prefix = 'rec'): string {
  const id = bufToB64(randomBytes(18)).replace(/[+/=]/g, '').slice(0, 22);
  return `${prefix}_${id}`;
}

interface AttachedKeys { blindKey: CryptoKey; legacyBlindKey: CryptoKey | null }
const attached = new WeakMap<CryptoKey, AttachedKeys>();

function remember(dek: CryptoKey, blindKey: CryptoKey, legacyBlindKey: CryptoKey | null): void {
  attached.set(dek, { blindKey, legacyBlindKey });
}
function requireAttached(dek: CryptoKey): AttachedKeys {
  const keys = attached.get(dek);
  if (!keys?.blindKey) throw new Error('Vault key is missing blind-index material');
  return keys;
}
export async function importVaultKeys(raw: Uint8Array): Promise<{ dek: CryptoKey; blindKey: CryptoKey; legacyBlindKey: CryptoKey }> {
  const bytes = toArrayBuffer(raw);
  try {
    const dek = await crypto.subtle.importKey('raw', bytes, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
    const hkdf = await crypto.subtle.importKey('raw', bytes, 'HKDF', false, ['deriveKey']);
    const blindKey = await crypto.subtle.deriveKey(
      { name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(), info: toArrayBuffer(BLIND_INDEX_INFO) },
      hkdf, { name: 'HMAC', hash: 'SHA-256', length: 256 }, false, ['sign'],
    );
    const legacyBlindKey = await crypto.subtle.importKey('raw', bytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    remember(dek, blindKey, legacyBlindKey);
    return { dek, blindKey, legacyBlindKey };
  } finally {
    new Uint8Array(bytes).fill(0);
  }
}

export async function generateDataKey(): Promise<CryptoKey> {
  const raw = randomBytes(32);
  try { return (await importVaultKeys(raw)).dek; } finally { raw.fill(0); }
}
export async function createVaultMaterial(passphrase: string, iterations = DEFAULT_PBKDF2_ITERATIONS) {
  const raw = randomBytes(32);
  try {
    const { dek } = await importVaultKeys(raw);
    const salt = randomBytes(16);
    const passKey = await derivePbkdf2AesGcmKey(passphrase, salt, iterations);
    return {
      dek,
      setupPayload: {
        kdf_algorithm: 'PBKDF2' as const,
        kdf_salt_b64: bufToB64(salt),
        kdf_iterations: iterations,
        wrapped_dek_b64: await encryptPackedAesGcm(raw, passKey),
        // Legacy column; recovery-key path removed. Empty means unused.
        recovery_wrapped_dek_b64: '',
        key_version: 1,
      },
    };
  } finally {
    raw.fill(0);
  }
}

async function unwrapKey(wrappedB64: string, wrapKeyMaterial: CryptoKey): Promise<CryptoKey> {
  const raw = new Uint8Array(await decryptPackedAesGcm(wrappedB64, wrapKeyMaterial));
  try { return (await importVaultKeys(raw)).dek; } finally { raw.fill(0); }
}

export async function unlockWithPassphrase(
  passphrase: string,
  kdfSaltB64: string,
  kdfIterations: number,
  wrappedDekB64: string
): Promise<CryptoKey> {
  const salt = b64ToBuf(kdfSaltB64);
  const passKey = await derivePbkdf2AesGcmKey(passphrase, salt, kdfIterations);
  return unwrapKey(wrappedDekB64, passKey);
}

export async function rewrapDekWithPassphrase(
  currentPassphrase: string,
  wrapped: { kdf_salt_b64: string; kdf_iterations: number; wrapped_dek_b64: string },
  nextPassphrase: string,
  iterations = DEFAULT_PBKDF2_ITERATIONS,
) {
  const currentKey = await derivePbkdf2AesGcmKey(currentPassphrase, b64ToBuf(wrapped.kdf_salt_b64), wrapped.kdf_iterations);
  const raw = new Uint8Array(await decryptPackedAesGcm(wrapped.wrapped_dek_b64, currentKey));
  try {
    const salt = randomBytes(16);
    const nextKey = await derivePbkdf2AesGcmKey(nextPassphrase, salt, iterations);
    return { kdf_salt_b64: bufToB64(salt), kdf_iterations: iterations, wrapped_dek_b64: await encryptPackedAesGcm(raw, nextKey) };
  } finally {
    raw.fill(0);
  }
}

/** Encrypt JSON-serializable payload. Output base64(iv || ciphertext). */
export async function encryptJson(
  dek: CryptoKey,
  value: unknown,
  additionalData?: ArrayBuffer | Uint8Array
): Promise<string> {
  const plain = new TextEncoder().encode(JSON.stringify(value));
  return encryptPackedAesGcm(plain, dek, additionalData);
}

export async function decryptJson<T>(
  dek: CryptoKey,
  ciphertextB64: string,
  additionalData?: ArrayBuffer | Uint8Array
): Promise<T> {
  const plain = await decryptPackedAesGcm(ciphertextB64, dek, additionalData);
  return JSON.parse(textDecoder.decode(plain)) as T;
}

export interface StoredVaultKeys {
  dek: CryptoKey;
  blind_index_version: number;
  reindexed: string[];
}

type DekRecord = StoredVaultKeys & {
  id: string; owner_id: number | null; blindKey: CryptoKey; legacyBlindKey: CryptoKey | null; write_token?: string;
};
type Progress = { blind_index_version: number; reindexed: string[] };
type ProgressRecord = Progress & { id: string; owner_id: number | null };

function concreteOwner(ownerId: number | null): ownerId is number {
  return typeof ownerId === 'number' && Number.isInteger(ownerId) && ownerId > 0;
}

function progressId(userId: number): string {
  return `progress:${userId}`;
}

/** Remove this write only. A newer hold's record has a different token and stays. */
async function dropStaleVaultWrite(token: string, ownerId: number): Promise<void> {
  let removed = false;
  await withVaultStore('readwrite', store => {
    const request = store.get(VAULT_KEY_ID);
    request.onsuccess = () => {
      const row = request.result as { write_token?: string } | undefined;
      if (row?.write_token === token) {
        store.delete(VAULT_KEY_ID);
        removed = true;
      }
    };
    return request;
  });
  if (!removed) return;
  try {
    if (localStorage.getItem(VAULT_PRESENCE) === String(ownerId)) localStorage.removeItem(VAULT_PRESENCE);
  } catch { /* private mode */ }
}

/** Store the key for this user, then drop the legacy localStorage item through dek-holder's migrate path. */
export async function persistVaultKeys(keys: StoredVaultKeys, ownerId: number | null, stillCurrent: () => boolean = () => true): Promise<boolean> {
  if (!concreteOwner(ownerId)) return false;
  const extra = requireAttached(keys.dek);
  if (!stillCurrent()) return false;
  const writeToken = bufToB64(randomBytes(8));
  let wrote = false;
  await withVaultStore('readwrite', store => {
    if (!stillCurrent()) return store.get(VAULT_KEY_ID);
    wrote = true;
    return store.put({
      id: VAULT_KEY_ID, ...keys, owner_id: ownerId, blindKey: extra.blindKey, legacyBlindKey: extra.legacyBlindKey, write_token: writeToken,
    } satisfies DekRecord);
  });
  if (!wrote || !stillCurrent()) {
    if (wrote) await dropStaleVaultWrite(writeToken, ownerId);
    return false;
  }
  markVaultPresent(ownerId);
  if (!stillCurrent()) {
    await dropStaleVaultWrite(writeToken, ownerId);
    return false;
  }
  migrateLegacyDek();
  if (!stillCurrent()) {
    await dropStaleVaultWrite(writeToken, ownerId);
    return false;
  }
  return true;
}

export async function writeBlindIndexProgress(userId: number, progress: Progress): Promise<void> {
  if (!concreteOwner(userId)) return;
  await withVaultStore('readwrite', store => store.put({ id: progressId(userId), owner_id: userId, ...progress }));
}
export async function readBlindIndexProgress(userId: number): Promise<Progress | null> {
  if (!concreteOwner(userId)) return null;
  const record = await withVaultStore<ProgressRecord | undefined>('readonly', store => store.get(progressId(userId)));
  if (!record) return null;
  // A null owner matches nobody, including this user.
  if (record.owner_id == null || record.owner_id !== userId) {
    await withVaultStore('readwrite', store => store.delete(progressId(userId)));
    return null;
  }
  return { blind_index_version: record.blind_index_version || 1, reindexed: record.reindexed ?? [] };
}
export async function restoreVaultKeys(ownerId: number | null, stillCurrent: () => boolean = () => true): Promise<StoredVaultKeys | null> {
  if (!concreteOwner(ownerId)) {
    await clearFinanceSessionStorage();
    return null;
  }
  let legacy: string | null = null;
  try { legacy = localStorage.getItem(DEK_STORE); } catch { legacy = null; }
  if (legacy) {
    let raw: Uint8Array | null = null;
    try { raw = b64ToBuf(legacy); } catch { raw = null; }
    // An unusable legacy value must not keep finance-dek or the presence flag.
    if (!raw || raw.byteLength !== 32) {
      await clearFinanceSessionStorage();
      return null;
    }
    const imported = await importVaultKeys(raw);
    raw.fill(0);
    if (!stillCurrent()) {
      migrateLegacyDek();
      return null;
    }
    const stored: StoredVaultKeys = { dek: imported.dek, blind_index_version: 1, reindexed: [] };
    const kept = await persistVaultKeys(stored, ownerId, stillCurrent);
    if (!kept || !stillCurrent()) {
      migrateLegacyDek();
      return null;
    }
    return stored;
  }
  if (!stillCurrent()) return null;
  if (!vaultMarkedPresent(ownerId)) {
    await clearFinanceSessionStorage();
    return null;
  }
  const record = await withVaultStore<DekRecord | undefined>('readonly', store => store.get(VAULT_KEY_ID));
  if (!stillCurrent()) return null;
  if (!record?.dek || !record.blindKey || record.owner_id == null || record.owner_id !== ownerId) {
    await clearFinanceSessionStorage();
    return null;
  }
  remember(record.dek, record.blindKey, record.legacyBlindKey ?? null);
  return { dek: record.dek, blind_index_version: record.blind_index_version || 1, reindexed: record.reindexed ?? [] };
}

export async function restoreDekLocal(ownerId: number | null): Promise<CryptoKey | null> {
  return (await restoreVaultKeys(ownerId))?.dek ?? null;
}
export function clearDekLocal(): Promise<void> {
  return clearFinanceSessionStorage();
}
export async function indexedDbHoldsDek(): Promise<boolean> {
  if (!globalThis.indexedDB) return false;
  try { return !!(await withVaultStore<DekRecord | undefined>('readonly', store => store.get(VAULT_KEY_ID)))?.dek; }
  catch { return false; }
}
function signIndex(key: CryptoKey, value: string): Promise<string> {
  return crypto.subtle.sign('HMAC', key, toArrayBuffer(textEncoder.encode(value))).then(sig => bufToB64(sig));
}
export function hmacBlindIndex(dek: CryptoKey, value: string): Promise<string> {
  return signIndex(requireAttached(dek).blindKey, value);
}
export function legacyDekBlindIndex(dek: CryptoKey, value: string): Promise<string> {
  const legacy = requireAttached(dek).legacyBlindKey;
  if (!legacy) throw new Error('Legacy blind index is unavailable');
  return signIndex(legacy, value);
}
