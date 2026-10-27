import {
  decodeBase64,
  decryptPackedAesGcm,
  derivePbkdf2AesGcmKey,
  encodeBase64,
  encryptPackedAesGcm,
  randomBytes,
  toArrayBuffer,
  DEFAULT_PBKDF2_ITERATIONS,
} from '@vivek/browser';

const encoder = new TextEncoder();

export interface WrappedSigningKey {
  kdf_salt_b64: string;
  kdf_iterations: number;
  wrapped_private_key_b64: string;
  /** Legacy field; recovery-key path removed. Always empty for new wraps. */
  recovery_wrapped_private_key_b64: string;
}

async function encryptPrivateKey(privateKey: ArrayBuffer, wrappingKey: CryptoKey): Promise<string> {
  return encryptPackedAesGcm(privateKey, wrappingKey);
}

async function importWrappedPrivateKey(wrappedB64: string, wrappingKey: CryptoKey): Promise<CryptoKey> {
  const privateKey = await decryptPackedAesGcm(wrappedB64, wrappingKey);
  return crypto.subtle.importKey('pkcs8', toArrayBuffer(privateKey), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
}

export async function createSigningKey(
  passphrase: string,
  iterations = DEFAULT_PBKDF2_ITERATIONS
): Promise<{ publicKeyB64: string; wrapped: WrappedSigningKey }> {
  const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const salt = randomBytes(16);
  const privateKey = await crypto.subtle.exportKey('pkcs8', pair.privateKey);
  return {
    publicKeyB64: encodeBase64(await crypto.subtle.exportKey('spki', pair.publicKey)),
    wrapped: {
      kdf_salt_b64: encodeBase64(salt),
      kdf_iterations: iterations,
      wrapped_private_key_b64: await encryptPrivateKey(
        privateKey,
        await derivePbkdf2AesGcmKey(passphrase, salt, iterations)
      ),
      recovery_wrapped_private_key_b64: '',
    },
  };
}

/** Re-wrap the same signing key. A new keypair would strand the stored public key. */
export async function rewrapSigningKey(
  passphrase: string,
  wrapped: WrappedSigningKey,
  iterations = DEFAULT_PBKDF2_ITERATIONS
): Promise<WrappedSigningKey> {
  const privateKey = await decryptPackedAesGcm(
    wrapped.wrapped_private_key_b64,
    await derivePbkdf2AesGcmKey(passphrase, decodeBase64(wrapped.kdf_salt_b64), wrapped.kdf_iterations)
  );
  const salt = randomBytes(16);
  return {
    kdf_salt_b64: encodeBase64(salt),
    kdf_iterations: iterations,
    wrapped_private_key_b64: await encryptPrivateKey(
      privateKey,
      await derivePbkdf2AesGcmKey(passphrase, salt, iterations)
    ),
    recovery_wrapped_private_key_b64: '',
  };
}

export { USERNAME_PATTERN, usernameForStorage } from './username';
export type { SessionPort, SessionUser, SessionUser as AuthUser, UserRole } from './session-contract';

export async function signChallenge(
  passphrase: string,
  wrapped: WrappedSigningKey,
  message: string
): Promise<string> {
  const key = await importWrappedPrivateKey(
    wrapped.wrapped_private_key_b64,
    await derivePbkdf2AesGcmKey(passphrase, decodeBase64(wrapped.kdf_salt_b64), wrapped.kdf_iterations)
  );
  return encodeBase64(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, toArrayBuffer(encoder.encode(message))));
}

export { safeNextPathFrom } from './navigation.mjs';
