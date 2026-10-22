/** PBKDF2-HMAC-SHA256 floor. Keep equal to MIN_PBKDF2_ITERATIONS in the finance backend. */
export const DEFAULT_PBKDF2_ITERATIONS = 600_000;

const AES_GCM_IV_BYTES = 12;
const textEncoder = new TextEncoder();

/** Bytes WebCrypto will accept. A bare Uint8Array may be backed by a SharedArrayBuffer, which BufferSource rejects. */
export type CryptoBytes = ArrayBuffer | Uint8Array;

export function toArrayBuffer(value: CryptoBytes): ArrayBuffer {
  if (value instanceof ArrayBuffer) return value;
  const copy = new Uint8Array(value.byteLength);
  copy.set(value);
  return copy.buffer as ArrayBuffer;
}

export function encodeBase64(value: ArrayBuffer | Uint8Array): string {
  const bytes = value instanceof Uint8Array ? value : new Uint8Array(value);
  let binary = '';
  bytes.forEach(byte => (binary += String.fromCharCode(byte)));
  return btoa(binary);
}

export function decodeBase64(value: string): Uint8Array {
  const binary = atob(value);
  return Uint8Array.from(binary, char => char.charCodeAt(0));
}

export function randomBytes(length: number): Uint8Array {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return bytes;
}

export async function derivePbkdf2AesGcmKey(
  passphrase: string,
  salt: Uint8Array,
  iterations: number
): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey('raw', toArrayBuffer(textEncoder.encode(passphrase)), 'PBKDF2', false, [
    'deriveKey',
  ]);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: toArrayBuffer(salt), iterations, hash: 'SHA-256' },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

export async function deriveHkdfBits(
  inputKeyMaterial: Uint8Array,
  salt: Uint8Array,
  info: Uint8Array,
  lengthBits = 256
): Promise<Uint8Array> {
  const material = await crypto.subtle.importKey('raw', toArrayBuffer(inputKeyMaterial), 'HKDF', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'HKDF', hash: 'SHA-256', salt: toArrayBuffer(salt), info: toArrayBuffer(info) },
    material,
    lengthBits
  );
  return new Uint8Array(bits);
}

/** Encrypts bytes as base64(iv || AES-GCM ciphertext and tag), using a fresh 12-byte IV. */
export async function encryptPackedAesGcm(
  plaintext: ArrayBuffer | Uint8Array,
  key: CryptoKey,
  additionalData?: CryptoBytes
): Promise<string> {
  const iv = randomBytes(AES_GCM_IV_BYTES);
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: toArrayBuffer(iv), ...(additionalData ? { additionalData: toArrayBuffer(additionalData) } : {}) },
    key,
    toArrayBuffer(plaintext)
  );
  const packed = new Uint8Array(iv.length + ciphertext.byteLength);
  packed.set(iv);
  packed.set(new Uint8Array(ciphertext), iv.length);
  return encodeBase64(packed);
}

/** Decrypts base64(iv || AES-GCM ciphertext and tag) packed with a 12-byte IV. */
export async function decryptPackedAesGcm(
  packedBase64: string,
  key: CryptoKey,
  additionalData?: CryptoBytes
): Promise<ArrayBuffer> {
  const packed = decodeBase64(packedBase64);
  const iv = packed.slice(0, AES_GCM_IV_BYTES);
  const ciphertext = packed.slice(AES_GCM_IV_BYTES);
  return crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: toArrayBuffer(iv), ...(additionalData ? { additionalData: toArrayBuffer(additionalData) } : {}) },
    key,
    toArrayBuffer(ciphertext)
  );
}
