import { Observable, of, throwError } from 'rxjs';
import { encodeRecoveryBundle, RECOVERY_LIMITS, type RecoveryBundle } from './recovery-bundle';
import { FINANCE_COLLECTIONS, FINANCE_FOREIGN_COLLECTIONS } from './encrypted-store.persistence';
import { createVaultMaterial, decryptJson, encryptJson, recordAad } from './vault-crypto';
import { prepareRecoveryRestore, type RestorePort, type RestoreStage, type RestoreWireRecord } from './recovery-restore';
import type { RecoverySnapshot } from './recovery-export';

const password = 'Synthetic independent backup password';
function bundle(): RecoveryBundle {
  const names = [...FINANCE_COLLECTIONS, ...FINANCE_FOREIGN_COLLECTIONS];
  return { collections: names.map(collection => ({ collection, schema_versions: [2], count: 1 })), records: names.map((collection, index) => ({ collection, client_id: `synthetic_${collection}`, schema_version: 2, key_version: 1, value: { marker: `PRIVATE_${collection}`, id: index + 1, nested: { value: 12.25 } } })) };
}

describe('validated disposable vault restore', () => {
  let stop: AbortController;
  let owner: number;
  let port: jasmine.SpyObj<RestorePort>;
  let snapshot: RecoverySnapshot;
  let stage: RestoreStage;
  let uploaded: RestoreWireRecord[];
  let destination: Awaited<ReturnType<typeof createVaultMaterial>>;
  let closed: jasmine.Spy;
  let activated: jasmine.Spy;

  beforeEach(async () => {
    owner = 7; stop = new AbortController(); uploaded = [];
    destination = await createVaultMaterial('Different destination vault passphrase');
    closed = jasmine.createSpy('closed'); activated = jasmine.createSpy('activated').and.resolveTo();
    snapshot = { collections: bundle().collections.map(row => ({ ...row, count: 0 })), records: [], fingerprint: 'a'.repeat(64) };
    stage = { id: 'stage_1234', source_hash: '', base_fingerprint: snapshot.fingerprint!, mode: 'merge', key_version: 1, status: 'pending', expected_counts: {}, batch_count: 1, received_batches: [], result: {} };
    port = jasmine.createSpyObj<RestorePort>('restore', ['snapshot', 'keyVersion', 'encrypt', 'stages', 'create', 'get', 'put', 'activate', 'discard']);
    port.snapshot.and.callFake(() => of(snapshot)); port.keyVersion.and.returnValue(of(1)); port.stages.and.returnValue(of([]));
    port.encrypt.and.callFake(async (row, key) => ({ collection: row.collection, client_id: row.client_id, schema_version: 2, key_version: key, expected_revision: null, indexes: [], ciphertext_b64: await encryptJson(destination.dek, row.value, recordAad(row.collection, row.client_id, 2, key)) }));
    port.create.and.callFake(body => { stage = { ...stage, ...body }; return of(stage); });
    port.get.and.callFake(() => of(stage));
    port.put.and.callFake((_id, index, records) => { uploaded.push(...records); stage.received_batches.push(index); return of(stage); });
    port.activate.and.callFake(() => of({ restored: uploaded.length, removed: 0, mode: stage.mode }));
    port.discard.and.returnValue(of({ discarded: true }));
  });

  const eligible = (read: () => number) => () => { if (read() !== 7) throw new Error('obsolete owner'); };
  async function prepare(body = bundle(), mode: 'merge' | 'replace' = 'merge') {
    const file = await encodeRecoveryBundle(body, password);
    return prepareRecoveryRestore(port, file, password, mode, stop.signal, eligible(() => owner), closed, activated);
  }

  it('roundtrips all owner collections under a different destination DEK before one explicit activation', async () => {
    const source = bundle(); source.records[0].schema_version = 1; source.collections[0].schema_versions = [1, 2]; snapshot.collections[0].schema_versions = [1, 2];
    const plan = await prepare(source);
    expect(plan.total).toBe(source.records.length); expect(plan.conflicts).toBe(0);
    expect(port.create).not.toHaveBeenCalled();
    await plan.stage();
    expect(port.activate).not.toHaveBeenCalled();
    expect(plan.staged).toBeTrue();
    for (const row of uploaded) {
      const decoded = await decryptJson(destination.dek, row.ciphertext_b64, recordAad(row.collection, row.client_id, 2, 1));
      expect(decoded).toEqual(source.records.find(record => record.client_id === row.client_id)!.value);
      expect(row.schema_version).toBe(2);
    }
    await plan.activate('');
    expect(activated).toHaveBeenCalledTimes(1); expect(closed).toHaveBeenCalledTimes(1);
    expect(source.records.length).toBeGreaterThan(0);
  });

  it('defaults merge to skip existing IDs and previews replace removals with typed confirmation', async () => {
    const first = bundle().records[0];
    snapshot.records = [{ collection: first.collection, client_id: first.client_id, schema_version: 2, key_version: 1, ciphertext_b64: 'existing', revision: 4, updated_at: '' }];
    snapshot.records.push({ ...snapshot.records[0], client_id: 'existing_extra' });
    snapshot.collections[0].count = 2;
    const merge = await prepare();
    expect(merge.conflicts).toBe(1); expect(merge.total).toBe(bundle().records.length - 1);
    await merge.stage(); expect(uploaded.some(row => row.client_id === first.client_id)).toBeFalse(); merge.dispose();
    uploaded = []; stage.received_batches = []; port.create.calls.reset();
    const replace = await prepare(bundle(), 'replace');
    expect(replace.rows[0].remove).toBe(1); await replace.stage();
    await expectAsync(replace.activate('replace')).toBeRejected(); expect(port.activate).not.toHaveBeenCalled();
    await replace.activate('REPLACE'); expect(port.activate).toHaveBeenCalledWith(stage.id, 'REPLACE');
  });

  it('refuses wrong password, tamper, schema, owner metadata and oversized file before any stage writes', async () => {
    const file = await encodeRecoveryBundle(bundle(), password);
    const outer = JSON.parse(file); outer.header.version = 2;
    for (const [input, secret] of [[file, 'Wrong synthetic backup password'], [JSON.stringify(outer), password], ['broken file', password]]) {
      await expectAsync(prepareRecoveryRestore(port, input, secret, 'merge', stop.signal, eligible(() => owner))).toBeRejected();
    }
    const oversized = new Blob([' '.repeat(RECOVERY_LIMITS.fileBytes + 1)]);
    spyOn(oversized, 'text').and.callThrough();
    await expectAsync(prepareRecoveryRestore(port, oversized, password, 'merge', stop.signal, eligible(() => owner))).toBeRejected();
    expect(oversized.text).not.toHaveBeenCalled();
    expect(port.snapshot).not.toHaveBeenCalled(); expect(port.create).not.toHaveBeenCalled();
    const unknown = bundle(); unknown.collections[0].collection = 'unknown_owner'; unknown.records[0].collection = 'unknown_owner';
    await expectAsync(prepare(unknown)).toBeRejected(); expect(port.create).not.toHaveBeenCalled();
  });

  it('resumes uploaded batches after interruption without encrypting or writing them twice', async () => {
    const body = bundle(); const template = body.records[0];
    body.records = Array.from({ length: 205 }, (_, id) => ({ ...template, client_id: `synthetic_${id.toString().padStart(4, '0')}` }));
    body.collections = body.collections.map(row => ({ ...row, count: row.collection === template.collection ? 205 : 0 }));
    let failed = false;
    port.put.and.callFake((_id, index, records) => {
      if (index === 1 && !failed) { failed = true; return throwError(() => ({ status: 503 })); }
      uploaded.push(...records); stage.received_batches.push(index); return of(stage);
    });
    const plan = await prepare(body);
    await expectAsync(plan.stage()).toBeRejected(); expect(stage.received_batches).toEqual([0]); expect(port.activate).not.toHaveBeenCalled();
    await plan.stage(); expect(uploaded.length).toBe(205);
    expect(port.encrypt.calls.count()).toBe(305); // Failed second batch is retried; completed first batch is skipped.
    plan.dispose();
  });

  for (const boundary of ['read', 'status', 'encrypt', 'write', 'activate']) {
    it(`owner change/disposal during held ${boundary} cannot continue or publish a restore`, async () => {
      let resolve!: (value: unknown) => void;
      let started!: () => void;
      const arrived = new Promise<void>(r => { started = r; });
      const held = new Promise<unknown>(r => { resolve = r; });
      if (boundary === 'read') port.snapshot.and.returnValue(new Observable(subscriber => { started(); void held.then(value => subscriber.next(value as RecoverySnapshot)); }));
      if (boundary === 'status') port.keyVersion.and.returnValue(new Observable(subscriber => { started(); void held.then(value => subscriber.next(value as number)); }));
      const pendingPlan = prepare();
      let plan: Awaited<ReturnType<typeof prepare>> | undefined;
      let pending: Promise<unknown>;
      if (boundary === 'read' || boundary === 'status') pending = pendingPlan;
      else {
        plan = await pendingPlan;
        if (boundary === 'encrypt') {
          port.encrypt.and.callFake(async () => { started(); return await held as RestoreWireRecord; }); pending = plan.stage();
        } else if (boundary === 'write') {
          port.put.and.returnValue(new Observable(subscriber => { started(); void held.then(value => subscriber.next(value as RestoreStage)); })); pending = plan.stage();
        } else {
          await plan.stage();
          port.activate.and.returnValue(new Observable(subscriber => { started(); void held.then(value => subscriber.next(value as { restored: number; removed: number; mode: 'merge' })); })); pending = plan.activate('');
        }
      }
      await arrived;
      owner = 8; stop.abort();
      await expectAsync(pending).toBeRejected();
      resolve(boundary === 'read' ? snapshot : boundary === 'status' ? 1 : boundary === 'encrypt' ? { ciphertext_b64: 'late' } : boundary === 'activate' ? { restored: 1, removed: 0, mode: 'merge' } : stage);
      await Promise.resolve();
      expect(activated).not.toHaveBeenCalled();
      if (boundary !== 'activate') expect(port.activate).not.toHaveBeenCalled();
      plan?.dispose();
    });
  }
});
