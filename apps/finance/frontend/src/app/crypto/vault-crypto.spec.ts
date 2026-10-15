import {
  clearDekLocal,
  createVaultMaterial,
  decryptJson,
  encryptJson,
  generateDataKey,
  hmacBlindIndex,
  persistDekLocal,
  randomBytes,
  randomClientId,
  recordAad,
  restoreDekLocal,
  rewrapDekWithPassphrase,
  unlockWithPassphrase,
} from './vault-crypto';
import { encodeBase64 } from '@vivek/browser';

describe('vault-crypto', () => {
  const fastIterations = 120_000;

  it('generates random bytes and client ids', () => {
    const a = randomBytes(16);
    const b = randomBytes(16);
    expect(a.length).toBe(16);
    expect(b.length).toBe(16);
    expect(Array.from(a)).not.toEqual(Array.from(b));
    const id = randomClientId('tx');
    expect(id.startsWith('tx_')).toBeTrue();
    expect(id.length).toBeGreaterThan(8);
  });

  it('persists and restores a DEK in localStorage', async () => {
    clearDekLocal();
    const dek = await generateDataKey();
    const payload = { ok: true };
    const ct = await encryptJson(dek, payload);
    await persistDekLocal(dek);
    const restored = await restoreDekLocal();
    expect(restored).toBeTruthy();
    expect(await decryptJson<typeof payload>(restored!, ct)).toEqual(payload);
    clearDekLocal();
    expect(await restoreDekLocal()).toBeNull();
  });

  it('treats a stored value with an invalid AES key length as an unusable DEK', async () => {
    clearDekLocal();
    localStorage.setItem('finance-dek', btoa('short'));

    await expectAsync(restoreDekLocal()).toBeResolvedTo(null);

    clearDekLocal();
  });

  it('encrypts and decrypts JSON with a DEK', async () => {
    const dek = await generateDataKey();
    const payload = { amount: 12.34, name: 'Cash', nested: { ok: true } };
    const ct = await encryptJson(dek, payload);
    expect(typeof ct).toBe('string');
    expect(ct.length).toBeGreaterThan(20);
    const plain = await decryptJson<typeof payload>(dek, ct);
    expect(plain).toEqual(payload);
  });

  it('rejects ciphertext when its record identity changes', async () => {
    const dek = await generateDataKey();
    const payload = { amount: 12.34 };
    const aad = recordAad('assets', 'asset-001', 2, 1);
    const ct = await encryptJson(dek, payload, aad);

    await expectAsync(
      decryptJson<typeof payload>(dek, ct, recordAad('liabilities', 'asset-001', 2, 1))
    ).toBeRejected();
    await expectAsync(
      decryptJson<typeof payload>(dek, ct, recordAad('assets', 'asset-002', 2, 1))
    ).toBeRejected();
  });

  it('keeps schema-1 ciphertext decryptable without AAD', async () => {
    const dek = await generateDataKey();
    const payload = { amount: 12.34 };
    const ciphertext = await encryptJson(dek, payload);

    expect(await decryptJson<typeof payload>(dek, ciphertext)).toEqual(payload);
    await expectAsync(
      decryptJson<typeof payload>(dek, ciphertext, recordAad('assets', 'asset-001', 1, 1))
    ).toBeRejected();
  });

  it('creates a vault and unlocks with passphrase only', async () => {
    const passphrase = 'correct-horse-battery-staple';
    const material = await createVaultMaterial(passphrase, fastIterations);
    expect(material.setupPayload.recovery_wrapped_dek_b64).toBe('');
    expect(material.setupPayload.kdf_algorithm).toBe('PBKDF2');
    expect(material.setupPayload.kdf_iterations).toBe(fastIterations);
    expect(material.setupPayload.wrapped_dek_b64).toBeTruthy();

    const unlocked = await unlockWithPassphrase(
      passphrase,
      material.setupPayload.kdf_salt_b64,
      material.setupPayload.kdf_iterations,
      material.setupPayload.wrapped_dek_b64
    );
    const message = { hello: 'world', n: 1 };
    const ct = await encryptJson(material.dek, message);
    const roundTrip = await decryptJson<typeof message>(unlocked, ct);
    expect(roundTrip).toEqual(message);
  });

  it('unlocks the existing base64(iv || AES-GCM ciphertext) DEK wrap format', async () => {
    const passphrase = 'legacy-vault-passphrase';
    const salt = new Uint8Array(16).fill(7);
    const rawDek = new Uint8Array(32).fill(11);
    const wrapIv = new Uint8Array(12).fill(13);
    const iterations = fastIterations;

    const passphraseMaterial = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(passphrase),
      'PBKDF2',
      false,
      ['deriveKey']
    );
    const wrappingKey = await crypto.subtle.deriveKey(
      { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
      passphraseMaterial,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt']
    );
    const wrapCiphertext = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: wrapIv }, wrappingKey, rawDek));
    const packedWrap = new Uint8Array(wrapIv.length + wrapCiphertext.length);
    packedWrap.set(wrapIv);
    packedWrap.set(wrapCiphertext, wrapIv.length);

    const unlocked = await unlockWithPassphrase(
      passphrase,
      encodeBase64(salt),
      iterations,
      encodeBase64(packedWrap)
    );
    const legacyDek = await crypto.subtle.importKey('raw', rawDek, { name: 'AES-GCM' }, false, ['encrypt']);
    const recordIv = new Uint8Array(12).fill(17);
    const recordCiphertext = new Uint8Array(
      await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv: recordIv },
        legacyDek,
        new TextEncoder().encode(JSON.stringify({ legacy: true }))
      )
    );
    const packedRecord = new Uint8Array(recordIv.length + recordCiphertext.length);
    packedRecord.set(recordIv);
    packedRecord.set(recordCiphertext, recordIv.length);

    expect(await decryptJson<{ legacy: boolean }>(unlocked, encodeBase64(packedRecord))).toEqual({ legacy: true });
  });

  it('rejects wrong passphrase', async () => {
    const material = await createVaultMaterial('right-passphrase-12', fastIterations);
    await expectAsync(
      unlockWithPassphrase(
        'wrong-passphrase-12',
        material.setupPayload.kdf_salt_b64,
        material.setupPayload.kdf_iterations,
        material.setupPayload.wrapped_dek_b64
      )
    ).toBeRejected();
  });

  it('rewraps DEK under a new passphrase', async () => {
    const material = await createVaultMaterial('original-passphrase-12', fastIterations);
    const payload = { value: 99 };
    const ct = await encryptJson(material.dek, payload);
    const rewrap = await rewrapDekWithPassphrase(material.dek, 'new-passphrase-12', fastIterations);
    const unlocked = await unlockWithPassphrase(
      'new-passphrase-12',
      rewrap.kdf_salt_b64,
      rewrap.kdf_iterations,
      rewrap.wrapped_dek_b64
    );
    expect(await decryptJson(unlocked, ct)).toEqual(payload);
  });

  it('produces stable blind indexes for the same DEK and value', async () => {
    const dek = await generateDataKey();
    const a = await hmacBlindIndex(dek, 'dedupe:abc');
    const b = await hmacBlindIndex(dek, 'dedupe:abc');
    const c = await hmacBlindIndex(dek, 'dedupe:xyz');
    expect(a).toBe(b);
    expect(a).not.toBe(c);
    expect(a.length).toBeGreaterThan(10);
  });
});
