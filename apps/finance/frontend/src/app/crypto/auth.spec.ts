import { decodeBase64, decryptPackedAesGcm, derivePbkdf2AesGcmKey } from '@vivek/browser';
import { createSigningKey, rewrapSigningKey, signChallenge } from '@vivek/auth';

describe('auth-crypto', () => {
  it('wraps the signing key with the vault passphrase only', async () => {
    const material = await createSigningKey('vault-passphrase', 120_000);
    const message = 'vault-auth-v1\n1\n1\nuser\nhttp://localhost\n2026-01-01T00:00:00';

    const byPassphrase = await signChallenge('vault-passphrase', material.wrapped, message);

    expect(byPassphrase).toBeTruthy();
    expect(material.wrapped.kdf_salt_b64).toBeTruthy();
    expect(material.wrapped.kdf_iterations).toBe(120_000);
    expect(material.wrapped.recovery_wrapped_private_key_b64).toBe('');
    // Decoys use this length (AUTH_WRAP_BYTES in the finance backend). A shorter
    // WebCrypto PKCS8 export would make unknown-user responses distinguishable.
    expect(decodeBase64(material.wrapped.wrapped_private_key_b64).byteLength).toBe(166);
  });

  it('rewraps the same signing key at a higher iteration count', async () => {
    const passphrase = 'vault-passphrase';
    const material = await createSigningKey(passphrase, 1_000);
    const upgraded = await rewrapSigningKey(passphrase, material.wrapped, 2_000);
    const message = 'vault-auth-v1\nhttp://localhost\n2026-01-01T00:00:00';

    const originalBytes = new Uint8Array(
      await decryptPackedAesGcm(
        material.wrapped.wrapped_private_key_b64,
        await derivePbkdf2AesGcmKey(passphrase, decodeBase64(material.wrapped.kdf_salt_b64), material.wrapped.kdf_iterations)
      )
    );
    const upgradedBytes = new Uint8Array(
      await decryptPackedAesGcm(
        upgraded.wrapped_private_key_b64,
        await derivePbkdf2AesGcmKey(passphrase, decodeBase64(upgraded.kdf_salt_b64), upgraded.kdf_iterations)
      )
    );

    expect(upgraded.kdf_iterations).toBe(2_000);
    expect(upgraded.kdf_salt_b64).not.toBe(material.wrapped.kdf_salt_b64);
    expect(Array.from(upgradedBytes)).toEqual(Array.from(originalBytes));
    expect(await signChallenge(passphrase, upgraded, message)).toBeTruthy();
    expect(await signChallenge(passphrase, material.wrapped, message)).toBeTruthy();
  });
  it('rewraps the same signing key under a new passphrase without retaining the old passphrase', async () => {
    const original = await createSigningKey('current synthetic passphrase', 1_000);
    const changed = await rewrapSigningKey('current synthetic passphrase', original.wrapped, 2_000, 'next synthetic passphrase');
    const publicKey = await crypto.subtle.importKey('spki', decodeBase64(original.publicKeyB64).buffer as ArrayBuffer, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
    const signature = await signChallenge('next synthetic passphrase', changed, 'synthetic proof');
    expect(await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, publicKey, decodeBase64(signature).buffer as ArrayBuffer, new TextEncoder().encode('synthetic proof'))).toBeTrue();
    await expectAsync(signChallenge('current synthetic passphrase', changed, 'synthetic proof')).toBeRejected();
  });

});
