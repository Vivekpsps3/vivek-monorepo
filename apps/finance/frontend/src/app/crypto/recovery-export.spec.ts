import { Observable, of, throwError } from 'rxjs';
import { fakeAsync, flushMicrotasks, tick } from '@angular/core/testing';
import { runRecoveryExport, type RecoverySnapshot } from './recovery-export';
import { decodeRecoveryBundle } from './recovery-bundle';
import type { VaultRecordEligibility } from './vault-record-capability';

const current = 'Synthetic current passphrase';
const password = 'Synthetic separate backup password';
function snapshot(): RecoverySnapshot {
  return {
    collections: ['transactions', 'health_stats', 'future_review'].map(collection => ({ collection, schema_versions: [2], count: 1 })),
    records: ['transactions', 'health_stats', 'future_review'].map(collection => ({ collection, client_id: `synthetic_${collection}`, schema_version: 2, key_version: 1, revision: 3, updated_at: '', ciphertext_b64: 'synthetic ciphertext' })),
  };
}

describe('complete owner-scoped recovery export', () => {
  let state: VaultRecordEligibility;
  let stop: AbortController;
  let publish: jasmine.Spy;
  let vault: { verifyRecoveryPassphrase: jasmine.Spy; recoverySnapshot: jasmine.Spy; decryptPayload: jasmine.Spy };
  beforeEach(() => {
    state = { ownerId: 7, generation: 1, unlocked: true };
    stop = new AbortController();
    publish = jasmine.createSpy('publish');
    vault = {
      verifyRecoveryPassphrase: jasmine.createSpy('verify').and.resolveTo(),
      recoverySnapshot: jasmine.createSpy('snapshot').and.returnValue(of(snapshot())),
      decryptPayload: jasmine.createSpy('decrypt').and.callFake(async (_cipher, collection) => ({ marker: `PRIVATE_${collection}` })),
    };
  });

  it('enumerates the contract, including newly registered collections, with no extra name list', async () => {
    await runRecoveryExport(vault, () => state, current, password, stop.signal, publish);
    expect(vault.verifyRecoveryPassphrase).toHaveBeenCalledOnceWith(current);
    expect(vault.decryptPayload).toHaveBeenCalledTimes(3);
    expect(publish).toHaveBeenCalledTimes(1);
    const [file, count] = publish.calls.mostRecent().args;
    expect(count).toBe(3);
    expect(file).not.toContain('PRIVATE_');
    const body = await decodeRecoveryBundle(file, password);
    expect(body.records.map(row => row.collection)).toEqual(['transactions', 'health_stats', 'future_review']);
  });

  it('wrong current passphrase never reads records or offers a file', async () => {
    vault.verifyRecoveryPassphrase.and.rejectWith(new Error('wrong passphrase'));
    await expectAsync(runRecoveryExport(vault, () => state, current, password, stop.signal, publish)).toBeRejected();
    expect(vault.recoverySnapshot).not.toHaveBeenCalled();
    expect(publish).not.toHaveBeenCalled();
  });

  it('cancels a held snapshot subscription and ignores the late body', async () => {
    let deliver!: (value: RecoverySnapshot) => void;
    let cancelled = false;
    vault.recoverySnapshot.and.returnValue(new Observable(subscriber => {
      deliver = body => subscriber.next(body);
      return () => { cancelled = true; };
    }));
    const pending = runRecoveryExport(vault, () => state, current, password, stop.signal, publish);
    await Promise.resolve();
    stop.abort();
    await expectAsync(pending).toBeRejected();
    expect(cancelled).toBeTrue();
    deliver(snapshot());
    expect(vault.decryptPayload).not.toHaveBeenCalled();
    expect(publish).not.toHaveBeenCalled();
  });

  for (const change of ['lock', 'owner', 'logout', 'cancel', 'dispose']) {
    it(`drops a held decrypt after ${change} without publishing or reading further rows`, async () => {
      let complete!: (value: unknown) => void;
      let started!: () => void;
      const arrived = new Promise<void>(resolve => { started = resolve; });
      vault.decryptPayload.and.callFake(() => { started(); return new Promise(resolve => { complete = resolve; }); });
      const pending = runRecoveryExport(vault, () => state, current, password, stop.signal, publish);
      await arrived;
      if (change === 'lock') state = { ...state, unlocked: false, generation: 2 };
      if (change === 'owner') state = { ...state, ownerId: 8 };
      if (change === 'logout') state = { ...state, ownerId: null };
      stop.abort();
      await expectAsync(pending).toBeRejected();
      complete({ marker: 'PRIVATE_LATE_PLAINTEXT' });
      await Promise.resolve();
      expect(vault.decryptPayload).toHaveBeenCalledTimes(1);
      expect(publish).not.toHaveBeenCalled();
    });
  }

  it('refuses corrupt, mismatched-count, unsupported and oversized data with no partial download', async () => {
    for (const mutate of [
      (body: RecoverySnapshot) => { body.records[0].schema_version = 3; },
      (body: RecoverySnapshot) => { body.collections[0].count = 0; },
      (body: RecoverySnapshot) => { body.records[0].ciphertext_b64 = 'x'.repeat(700000); },
    ]) {
      const body = snapshot();
      mutate(body);
      vault.recoverySnapshot.and.returnValue(of(body));
      await expectAsync(runRecoveryExport(vault, () => state, current, password, stop.signal, publish)).toBeRejected();
    }
    vault.recoverySnapshot.and.returnValue(of(snapshot()));
    vault.decryptPayload.and.rejectWith(new Error('corrupt GCM'));
    await expectAsync(runRecoveryExport(vault, () => state, current, password, stop.signal, publish)).toBeRejected();
    expect(publish).not.toHaveBeenCalled();
  });

  it('uses one bounded action deadline and unsubscribes a hung snapshot', fakeAsync(() => {
    let cancelled = false;
    vault.recoverySnapshot.and.returnValue(new Observable(() => () => { cancelled = true; }));
    let failure: unknown;
    void runRecoveryExport(vault, () => state, current, password, stop.signal, publish).catch(error => { failure = error; });
    flushMicrotasks();
    tick(120_000);
    flushMicrotasks();
    expect(failure instanceof Error && failure.message).toContain('timed out');
    expect(cancelled).toBeTrue();
    expect(publish).not.toHaveBeenCalled();
  }));

  it('checks owner eligibility again after bundle encryption even without a cancellation signal', async () => {
    const original = crypto.subtle.encrypt.bind(crypto.subtle);
    let release!: () => void;
    let started!: () => void;
    const arrived = new Promise<void>(resolve => { started = resolve; });
    spyOn(crypto.subtle, 'encrypt').and.callFake(async (...args) => {
      const encrypted = await original(...args);
      started();
      await new Promise<void>(resolve => { release = resolve; });
      return encrypted;
    });
    const pending = runRecoveryExport(vault, () => state, current, password, stop.signal, publish);
    await arrived;
    state = { ...state, ownerId: 8 };
    release();
    await expectAsync(pending).toBeRejected();
    expect(publish).not.toHaveBeenCalled();
  });


  it('explains server size/version/session refusals without exposing error details or downloading partial data', async () => {
    for (const [status, message] of [[413, 'limit'], [422, 'unsupported'], [401, 'session expired'], [503, 'connection']] as const) {
      vault.recoverySnapshot.and.returnValue(throwError(() => ({ status, detail: 'PRIVATE_SERVER_DETAIL' })));
      let failure: unknown;
      try { await runRecoveryExport(vault, () => state, current, password, stop.signal, publish); }
      catch (error) { failure = error; }
      expect(failure instanceof Error && failure.message).toContain(message);
      expect(failure instanceof Error && failure.message).not.toContain('PRIVATE_SERVER_DETAIL');
    }
    expect(vault.decryptPayload).not.toHaveBeenCalled();
    expect(publish).not.toHaveBeenCalled();
  });

});
