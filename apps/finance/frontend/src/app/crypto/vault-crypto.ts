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
import { DEK_STORE } from './dek-store';

export { DEFAULT_PBKDF2_ITERATIONS, randomBytes };

/**
 * Browser-only crypto for server-blind storage.
 * Backend never receives passphrases or unwrapped DEKs.
 * Access is vault passphrase only (no recovery-key path).
 */

const textDecoder = new TextDecoder();
const textEncoder = new TextEncoder();

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

export async function generateDataKey(): Promise<CryptoKey> {
  return crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, [
    'encrypt',
    'decrypt',
  ]);
}

async function importAesKey(raw: ArrayBuffer | Uint8Array): Promise<CryptoKey> {
  const material = raw instanceof Uint8Array ? raw : new Uint8Array(raw);
  return crypto.subtle.importKey('raw', toArrayBuffer(material), { name: 'AES-GCM' }, true, [
    'encrypt',
    'decrypt',
  ]);
}

async function exportRawKey(key: CryptoKey): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.exportKey('raw', key));
}

/** Wrap format: base64(iv || ciphertext) where iv is 12 bytes. */
async function wrapKey(dek: CryptoKey, wrapKeyMaterial: CryptoKey): Promise<string> {
  const raw = await exportRawKey(dek);
  return encryptPackedAesGcm(raw, wrapKeyMaterial);
}

async function unwrapKey(wrappedB64: string, wrapKeyMaterial: CryptoKey): Promise<CryptoKey> {
  const raw = await decryptPackedAesGcm(wrappedB64, wrapKeyMaterial);
  return importAesKey(raw);
}

export async function createVaultMaterial(passphrase: string, iterations = DEFAULT_PBKDF2_ITERATIONS) {
  const dek = await generateDataKey();
  const salt = randomBytes(16);
  const passKey = await derivePbkdf2AesGcmKey(passphrase, salt, iterations);
  const wrappedDek = await wrapKey(dek, passKey);
  return {
    dek,
    setupPayload: {
      kdf_algorithm: 'PBKDF2' as const,
      kdf_salt_b64: bufToB64(salt),
      kdf_iterations: iterations,
      wrapped_dek_b64: wrappedDek,
      // Legacy column; recovery-key path removed. Empty means unused.
      recovery_wrapped_dek_b64: '',
      key_version: 1,
    },
  };
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
  dek: CryptoKey,
  passphrase: string,
  iterations = DEFAULT_PBKDF2_ITERATIONS
) {
  const salt = randomBytes(16);
  const passKey = await derivePbkdf2AesGcmKey(passphrase, salt, iterations);
  return {
    kdf_salt_b64: bufToB64(salt),
    kdf_iterations: iterations,
    wrapped_dek_b64: await wrapKey(dek, passKey),
  };
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

export async function persistDekLocal(dek: CryptoKey, stillCurrent?: () => boolean): Promise<void> {
  try {
    const raw = bufToB64(await exportRawKey(dek));
    if (stillCurrent && !stillCurrent()) return;
    localStorage.setItem(DEK_STORE, raw);
  } catch { /* private */ }
}

export async function restoreDekLocal(): Promise<CryptoKey | null> {
  try {
    const raw = localStorage.getItem(DEK_STORE);
    if (!raw) return null;
    return await importAesKey(b64ToBuf(raw));
  } catch {
    return null;
  }
}

export function clearDekLocal(): void {
  try { localStorage.removeItem(DEK_STORE); } catch { /* private */ }
}

export async function hmacBlindIndex(dek: CryptoKey, value: string): Promise<string> {
  // Derive a non-extractable HMAC key from DEK raw material via HKDF-like digest.
  const raw = await exportRawKey(dek);
  const keyMaterial = await crypto.subtle.importKey('raw', toArrayBuffer(raw), { name: 'HMAC', hash: 'SHA-256' }, false, [
    'sign',
  ]);
  const sig = await crypto.subtle.sign('HMAC', keyMaterial, toArrayBuffer(textEncoder.encode(value)));
  return bufToB64(sig);
}
