import { decodeRecoveryBundle, encodeRecoveryBundle, RECOVERY_LIMITS, validateRecoveryBundle, type RecoveryBundle } from './recovery-bundle';

const password = 'Separate synthetic backup password';
function sample(): RecoveryBundle {
  return {
    collections: [
      { collection: 'transactions', schema_versions: [1, 2], count: 1 },
      { collection: 'health_stats', schema_versions: [2], count: 1 },
      { collection: 'future_review', schema_versions: [2], count: 1 },
      { collection: 'empty_private', schema_versions: [2], count: 0 },
    ],
    records: ['transactions', 'health_stats', 'future_review'].map((collection, index) => ({ collection, client_id: `synthetic_${index}`, schema_version: index ? 2 : 1, key_version: 1, value: { marker: `PRIVATE_RECOVERY_MARKER_${collection}`, id: index + 1 } })),
  };
}

describe('versioned encrypted recovery bundle', () => {
  it('roundtrips every descriptor, legacy schema, empty collection and future registered record with fresh randomness', async () => {
    const bundle = sample();
    const first = await encodeRecoveryBundle(bundle, password);
    const second = await encodeRecoveryBundle(bundle, password);
    expect(first).not.toEqual(second);
    expect(first).not.toContain('PRIVATE_RECOVERY_MARKER');
    expect(first).not.toContain('transactions');
    expect(await decodeRecoveryBundle(first, password)).toEqual(bundle);
    expect(await decodeRecoveryBundle(second, password)).toEqual(bundle);
  });

  it('rejects wrong password, authenticated header changes and ciphertext tampering', async () => {
    const file = await encodeRecoveryBundle(sample(), password);
    await expectAsync(decodeRecoveryBundle(file, 'Wrong synthetic password')).toBeRejected();
    const header = JSON.parse(file);
    header.header.created_at = '2025-01-01T00:00:00.000Z';
    await expectAsync(decodeRecoveryBundle(JSON.stringify(header), password)).toBeRejected();
    const body = JSON.parse(file);
    body.ciphertext_b64 = (body.ciphertext_b64[0] === 'A' ? 'B' : 'A') + body.ciphertext_b64.slice(1);
    await expectAsync(decodeRecoveryBundle(JSON.stringify(body), password)).toBeRejected();
  });

  it('rejects unknown envelope version, excessive KDF work and oversized files before deriving a key', async () => {
    const derive = spyOn(crypto.subtle, 'deriveKey').and.callThrough();
    const file = await encodeRecoveryBundle(sample(), password);
    derive.calls.reset();
    for (const mutate of [
      (outer: { header: { version: number; iterations: number }; extra?: string }) => { outer.header.version = 2; },
      (outer: { header: { version: number; iterations: number }; extra?: string }) => { outer.header.iterations = 999999999; },
      (outer: { header: { version: number; iterations: number }; extra?: string }) => { outer.extra = 'unknown'; },
    ]) {
      const outer = JSON.parse(file);
      mutate(outer);
      await expectAsync(decodeRecoveryBundle(JSON.stringify(outer), password)).toBeRejected();
    }
    await expectAsync(decodeRecoveryBundle(' '.repeat(RECOVERY_LIMITS.fileBytes + 1), password)).toBeRejected();
    expect(derive).not.toHaveBeenCalled();
  });

  it('refuses corrupt descriptors, unknown schema, duplicates, nonobjects, missing counts and size limits', () => {
    const mutations: Array<(body: RecoveryBundle) => void> = [
      body => { body.collections[0].schema_versions = [3]; },
      body => { body.records[0].schema_version = 3; },
      body => { body.records[0].collection = 'unknown_private'; },
      body => { body.records.push(body.records[0]); },
      body => { body.collections[0].count = 2; },
      body => { body.collections[0].count = RECOVERY_LIMITS.records + 1; },
      body => { body.records[0].value = null; },
      body => { body.records[0].client_id = 'bad/id'; },
      body => { body.records[0].key_version = 0; },
      body => { body.records[0].value = { oversized: 'x'.repeat(RECOVERY_LIMITS.recordBytes) }; },
    ];
    for (const mutate of mutations) {
      const body = sample();
      mutate(body);
      expect(() => validateRecoveryBundle(body)).toThrow();
    }
  });

  it('checks eligibility after held encryption and never returns an obsolete file', async () => {
    const realEncrypt = crypto.subtle.encrypt.bind(crypto.subtle);
    let finish!: (value: ArrayBuffer) => void;
    let started!: () => void;
    const arrived = new Promise<void>(resolve => { started = resolve; });
    spyOn(crypto.subtle, 'encrypt').and.callFake(async (...args) => {
      const encrypted = await realEncrypt(...args);
      started();
      return new Promise<ArrayBuffer>(resolve => { finish = () => resolve(encrypted); });
    });
    let eligible = true;
    const stop = new AbortController();
    const pending = encodeRecoveryBundle(sample(), password, () => { if (!eligible) throw new Error('obsolete'); }, stop.signal);
    await arrived;
    eligible = false;
    stop.abort();
    finish(new ArrayBuffer(0));
    await expectAsync(pending).toBeRejectedWithError('obsolete');
  });
});
