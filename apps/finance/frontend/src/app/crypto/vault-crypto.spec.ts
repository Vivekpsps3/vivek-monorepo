import {
  clearDekLocal,
  createVaultMaterial,
  decryptJson,
  encryptJson,
  generateDataKey,
  hmacBlindIndex,
  importVaultKeys,
  indexedDbHoldsDek,
  legacyDekBlindIndex,
  persistVaultKeys,
  randomBytes,
  randomClientId,
  recordAad,
  restoreDekLocal,
  restoreVaultKeys,
  rewrapDekWithPassphrase,
  unlockWithPassphrase,
} from './vault-crypto';
import { encodeBase64 } from '@vivek/browser';
import { LOCK_SIGNAL, VAULT_PRESENCE, deleteFinanceVaultDb, deleteFinanceVaultKey, financeVaultPresent } from './dek-store';

function pauseNextOpen(): { ready: Promise<void>; release: () => void; restore: () => void } {
  const realOpen = indexedDB.open.bind(indexedDB);
  let release!: () => void;
  let markReady!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const ready = new Promise<void>(resolve => { markReady = resolve; });
  let armed = true;
  spyOn(indexedDB, 'open').and.callFake((name: string, version?: number) => {
    if (!armed) return realOpen(name, version);
    armed = false;
    const real = realOpen(name, version);
    let db: IDBDatabase | null = null;
    let failure: DOMException | null = null;
    let onsuccess: ((ev: Event) => void) | null = null;
    let onerror: ((ev: Event) => void) | null = null;
    let onupgradeneeded: ((ev: Event) => void) | null = null;
    let upgrade: Event | null = null;
    const fake = {} as IDBOpenDBRequest;
    const replayUpgrade = () => { if (upgrade && onupgradeneeded) onupgradeneeded.call(fake, upgrade); };
    Object.defineProperties(fake, {
      result: { configurable: true, get: () => db },
      error: { configurable: true, get: () => failure },
      onsuccess: { configurable: true, get: () => onsuccess, set: (fn: (ev: Event) => void) => { onsuccess = fn; } },
      onerror: { configurable: true, get: () => onerror, set: (fn: (ev: Event) => void) => { onerror = fn; } },
      onupgradeneeded: { configurable: true, get: () => onupgradeneeded, set: (fn: (ev: Event) => void) => { onupgradeneeded = fn; replayUpgrade(); } },
    });
    real.onupgradeneeded = ev => { db = real.result; upgrade = ev; replayUpgrade(); };
    real.onsuccess = () => { db = real.result; markReady(); void gate.then(() => onsuccess?.call(fake, new Event('success'))); };
    real.onerror = () => { failure = real.error; markReady(); void gate.then(() => onerror?.call(fake, new Event('error'))); };
    return fake;
  });
  return {
    ready,
    release,
    restore: () => { delete (indexedDB as unknown as { open?: unknown }).open; },
  };
}

describe('vault-crypto', () => {
  const fastIterations = 120_000;

  afterEach(async () => {
    localStorage.removeItem('finance-dek');
    localStorage.removeItem(VAULT_PRESENCE);
    localStorage.removeItem(LOCK_SIGNAL);
    await deleteFinanceVaultKey();
    await deleteFinanceVaultDb();
  });

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

  it('migrates a localStorage DEK into a non-extractable IndexedDB key', async () => {
    const raw = new Uint8Array(32).fill(5);
    const payload = { ok: true, scope: 'finance' };
    const ct = await encryptJson((await importVaultKeys(raw)).dek, payload);
    localStorage.setItem('finance-dek', encodeBase64(raw));
    const restored = await restoreDekLocal(1);
    expect(localStorage.getItem('finance-dek')).toBeNull();
    expect(financeVaultPresent()).toBeTrue();
    expect(restored?.extractable).toBeFalse();
    await expectAsync(crypto.subtle.exportKey('raw', restored!)).toBeRejected();
    expect(await indexedDbHoldsDek()).toBeTrue();
    expect(await decryptJson<typeof payload>(restored!, ct)).toEqual(payload);
  });

  it('removes the IndexedDB key on wipe', async () => {
    localStorage.setItem('finance-dek', encodeBase64(new Uint8Array(32).fill(3)));
    expect(await restoreDekLocal(1)).toBeTruthy();
    await clearDekLocal();
    expect(localStorage.getItem('finance-dek')).toBeNull();
    expect(financeVaultPresent()).toBeFalse();
    expect(await indexedDbHoldsDek()).toBeFalse();
    expect(await restoreDekLocal(1)).toBeNull();
  });

  it('rejects a failed IndexedDB delete and leaves the key', async () => {
    localStorage.setItem('finance-dek', encodeBase64(new Uint8Array(32).fill(3)));
    expect(await restoreDekLocal(1)).toBeTruthy();
    const del = IDBObjectStore.prototype.delete;
    const spy = spyOn(IDBObjectStore.prototype, 'delete').and.callFake(function (this: IDBObjectStore, query?: IDBValidKey | IDBKeyRange) {
      const request = del.call(this, query as IDBValidKey);
      setTimeout(() => { try { this.transaction.abort(); } catch { /* already finished */ } }, 0);
      return request;
    });
    try {
      await expectAsync(clearDekLocal()).toBeRejected();
      expect(await indexedDbHoldsDek()).toBeTrue();
    } finally {
      spy.and.callThrough();
    }
  });

  it('derives an HKDF blind-index subkey that differs from the DEK', async () => {
    const { dek, blindKey } = await importVaultKeys(new Uint8Array(32).fill(9));
    const next = await hmacBlindIndex(dek, 'dedupe:abc');
    expect(next).not.toBe(await legacyDekBlindIndex(dek, 'dedupe:abc'));
    expect(next.length).toBeGreaterThan(10);
    expect(blindKey.extractable).toBeFalse();
    expect(dek.extractable).toBeFalse();
    await expectAsync(crypto.subtle.exportKey('raw', blindKey)).toBeRejected();
    await expectAsync(crypto.subtle.exportKey('raw', dek)).toBeRejected();
    expect(await hmacBlindIndex(dek, 'dedupe:abc')).toBe(next);
  });

  it('wipes an invalid legacy finance-dek and does not leave the vault present', async () => {
    localStorage.setItem(VAULT_PRESENCE, '1');
    localStorage.setItem('finance-dek', btoa('short'));
    await expectAsync(restoreDekLocal(1)).toBeResolvedTo(null);
    expect(localStorage.getItem('finance-dek')).toBeNull();
    expect(localStorage.getItem(VAULT_PRESENCE)).toBeNull();
    expect(financeVaultPresent()).toBeFalse();

    localStorage.setItem(VAULT_PRESENCE, '1');
    localStorage.setItem('finance-dek', '%%%not-base64%%%');
    await expectAsync(restoreDekLocal(1)).toBeResolvedTo(null);
    expect(localStorage.getItem('finance-dek')).toBeNull();
    expect(financeVaultPresent()).toBeFalse();
  });

  it('does not wipe a newer key when a legacy migration goes stale', async () => {
    const raw = new Uint8Array(32).fill(4);
    localStorage.setItem('finance-dek', encodeBase64(raw));
    const fresh = (await importVaultKeys(new Uint8Array(32).fill(6))).dek;
    const secret = await encryptJson(fresh, { marker: 'user-2' });
    let current = true;
    const paused = pauseNextOpen();
    try {
      const pending = restoreVaultKeys(1, () => current);
      await paused.ready;
      current = false;
      expect(await persistVaultKeys({ dek: fresh, blind_index_version: 2, reindexed: [] }, 2)).toBeTrue();
      paused.release();
      await expectAsync(pending).toBeResolvedTo(null);
      const stored = await restoreVaultKeys(2);
      expect(await decryptJson(stored!.dek, secret)).toEqual({ marker: 'user-2' });
      expect(localStorage.getItem('finance-dek')).toBeNull();
      expect(financeVaultPresent()).toBeTrue();
    } finally {
      paused.release();
      paused.restore();
    }
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
    const rewrap = await rewrapDekWithPassphrase(
      'original-passphrase-12',
      material.setupPayload,
      'new-passphrase-12',
      fastIterations,
    );
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
