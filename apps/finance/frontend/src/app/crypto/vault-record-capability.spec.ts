import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { Injector } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { encodeBase64 } from '@vivek/browser';
import { EMPTY, Observable, firstValueFrom } from 'rxjs';
import { SESSION_CONTEXT, SILENT_ERROR_TOAST, type SessionPort } from '@vivek/ui';
import { apiUrl } from '../core/api-url';
import { deleteFinanceVaultDb } from './dek-store';
import { openVaultRecords, type VaultRecordCapability, type VaultRecordEnvelope } from '../../public-api';
import {
  VaultRecordIneligibleError,
  type VaultRecordCapability as RecordCapability,
} from './vault-record-capability';
import { VaultService } from './vault.service';

const MARKER = 'PLAINTEXT_MARKER_719';

const who: { id: number | null } = { id: 1 };

function sessionProvider() {
  const session = {
    get currentUser() {
      return who.id == null ? null : { id: who.id };
    },
    user$: EMPTY,
    cleared$: EMPTY,
  } as unknown as SessionPort;
  return { provide: SESSION_CONTEXT, useValue: session };
}

/** A caller that can name only the record capability. */
async function readRecord<T>(
  capability: VaultRecordCapability,
  collection: string,
  clientId: string,
): Promise<T> {
  const rows = await firstValueFrom(capability.listRecords(collection, { silent: true }));
  const row = rows.find(item => item.client_id === clientId);
  if (!row) throw new Error('missing record');
  return capability.decryptPayload<T>(
    row.ciphertext_b64,
    row.collection,
    row.client_id,
    row.schema_version,
    row.key_version,
  );
}

describe('vault record capability', () => {
  let http: HttpTestingController;
  let service: VaultService;
  let capability: RecordCapability;

  beforeEach(async () => {
    who.id = 1;
    localStorage.removeItem('finance-dek');
    localStorage.removeItem('finance-vault-present');
    localStorage.removeItem('finance-vault-lock');
    await deleteFinanceVaultDb();
    localStorage.setItem('finance-dek', encodeBase64(new Uint8Array(32).fill(9)));
    spyOn(VaultService.prototype, 'ensureBlindIndexes').and.resolveTo();
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [sessionProvider()],
    });
    service = TestBed.inject(VaultService);
    http = TestBed.inject(HttpTestingController);
    await service.whenReady();
    capability = await openVaultRecords(TestBed.inject(Injector));
  });

  afterEach(async () => {
    http.verify();
    localStorage.removeItem('finance-dek');
    localStorage.removeItem('finance-vault-present');
    localStorage.removeItem('finance-vault-lock');
    TestBed.resetTestingModule();
    await deleteFinanceVaultDb();
  });

  it('round-trips a v2 record and refuses a changed collection, client id, or key version', async () => {
    expect(Object.keys(capability).sort()).toEqual([
      'decryptPayload',
      'deleteRecords',
      'encryptPayload',
      'listRecords',
      'upsertRecords',
    ]);
    const plain = { kind: 'weight', measured_on: '2026-10-28', logged_on: '2026-10-28', kg: 80 };
    const ciphertext = await capability.encryptPayload(plain, 'health_stats', 'hlt_stats0001', 2, 1);
    const pending = readRecord<typeof plain>(capability, 'health_stats', 'hlt_stats0001');
    const listed = http.expectOne(apiUrl('/vault/records?collection=health_stats'));
    expect(listed.request.method).toBe('GET');
    expect(listed.request.context.get(SILENT_ERROR_TOAST)).toBeTrue();
    const row: VaultRecordEnvelope = {
      collection: 'health_stats',
      client_id: 'hlt_stats0001',
      ciphertext_b64: ciphertext,
      schema_version: 2,
      key_version: 1,
      revision: 4,
      updated_at: '2026-10-29T00:00:00Z',
    };
    listed.flush([row]);
    expect(await pending).toEqual(plain);
    await expectAsync(capability.decryptPayload(ciphertext, 'health_prs', 'hlt_stats0001', 2, 1)).toBeRejected();
    await expectAsync(capability.decryptPayload(ciphertext, 'health_stats', 'hlt_other0001', 2, 1)).toBeRejected();
    await expectAsync(capability.decryptPayload(ciphertext, 'health_stats', 'hlt_stats0001', 2, 2)).toBeRejected();
  });

  it('keeps schema 1 decryptable and refuses an unsupported schema or malformed envelope', async () => {
    const legacy = await capability.encryptPayload({ kg: 1 }, 'health_stats', 'hlt_v1', 1, 1);
    expect(await capability.decryptPayload<{ kg: number }>(legacy, 'health_prs', 'hlt_other', 1, 9)).toEqual({ kg: 1 });
    await expectAsync(
      capability.encryptPayload({ kg: 1 }, 'health_stats', 'hlt_v3', 3, 1),
    ).toBeRejectedWithError(/Unsupported record schema version/);
    const malformed = capability.decryptPayload('not-a-ciphertext', 'health_stats', 'hlt_bad', 2, 1);
    await expectAsync(malformed).toBeRejected();
    await malformed.catch(error => expect(error).not.toEqual(jasmine.any(VaultRecordIneligibleError)));
  });

  it('lists, upserts, and deletes with the existing envelope, silence, and revision 409', async () => {
    const loud = firstValueFrom(capability.listRecords('health_prs'));
    const open = http.expectOne(apiUrl('/vault/records?collection=health_prs'));
    expect(open.request.context.get(SILENT_ERROR_TOAST)).toBeFalse();
    open.flush([]);
    expect(await loud).toEqual([]);

    const ciphertext = await capability.encryptPayload({ kg: 81 }, 'health_stats', 'hlt_a', 2, 1);
    const saving = firstValueFrom(capability.upsertRecords([{
      collection: 'health_stats',
      client_id: 'hlt_a',
      ciphertext_b64: ciphertext,
      schema_version: 2,
      key_version: 1,
      expected_revision: 4,
    }], { silent: true }));
    const upsert = http.expectOne(apiUrl('/vault/records/upsert'));
    expect(upsert.request.method).toBe('POST');
    expect(upsert.request.context.get(SILENT_ERROR_TOAST)).toBeTrue();
    expect(upsert.request.body).toEqual({
      records: [{
        collection: 'health_stats',
        client_id: 'hlt_a',
        ciphertext_b64: ciphertext,
        schema_version: 2,
        key_version: 1,
        expected_revision: 4,
      }],
    });
    expect(JSON.stringify(upsert.request.body)).not.toContain('indexes');
    expect(JSON.stringify(upsert.request.body)).not.toContain('"kg"');
    upsert.flush({ detail: 'conflict' }, { status: 409, statusText: 'Conflict' });
    const status = await saving.then(() => 0, (error: { status?: number }) => error.status ?? 0);
    expect(status).toBe(409);

    const retry = firstValueFrom(capability.upsertRecords([{
      collection: 'health_stats',
      client_id: 'hlt_a',
      ciphertext_b64: ciphertext,
      schema_version: 2,
      key_version: 1,
      expected_revision: 4,
    }], { silent: true }));
    const accepted = http.expectOne(apiUrl('/vault/records/upsert'));
    accepted.flush([{
      collection: 'health_stats',
      client_id: 'hlt_a',
      ciphertext_b64: ciphertext,
      schema_version: 2,
      key_version: 1,
      revision: 5,
      updated_at: '2026-10-29T00:00:00Z',
    }]);
    expect((await retry)[0].revision).toBe(5);

    const removing = firstValueFrom(capability.deleteRecords([{
      collection: 'health_stats',
      client_id: 'hlt_a',
      expected_revision: 5,
    }], { silent: true }));
    const deleted = http.expectOne(apiUrl('/vault/records/delete'));
    expect(deleted.request.context.get(SILENT_ERROR_TOAST)).toBeTrue();
    expect(deleted.request.body).toEqual({
      records: [{ collection: 'health_stats', client_id: 'hlt_a', expected_revision: 5 }],
    });
    deleted.flush({ deleted: 1 });
    expect(await removing).toEqual({ deleted: 1 });
  });

  it('does not call crypto when the vault is locked', async () => {
    await service.lock();
    const encrypt = spyOn(service, 'encryptPayload').and.resolveTo('cipher');
    const decrypt = spyOn(service, 'decryptPayload').and.resolveTo({ kg: 1 });
    await expectAsync(capability.encryptPayload({ kg: 1 }, 'health_stats', 'hlt_locked', 2, 1))
      .toBeRejectedWithError(VaultRecordIneligibleError);
    await expectAsync(capability.decryptPayload('cipher', 'health_stats', 'hlt_locked', 2, 1))
      .toBeRejectedWithError(VaultRecordIneligibleError);
    expect(encrypt).not.toHaveBeenCalled();
    expect(decrypt).not.toHaveBeenCalled();
  });

  it('drops plaintext when the lock generation changes during decrypt', async () => {
    let release!: () => void;
    let waiting = false;
    spyOn(service, 'decryptPayload').and.callFake((async () => {
      waiting = true;
      await new Promise<void>(resolve => { release = resolve; });
      return { note: MARKER };
    }) as VaultService['decryptPayload']);
    const pending = capability.decryptPayload<{ note: string }>('cipher', 'health_stats', 'hlt_a', 2, 1);
    for (let attempt = 0; attempt < 20 && !waiting; attempt += 1) await Promise.resolve();
    expect(waiting).toBeTrue();
    await service.lock();
    release();
    await expectAsync(pending).toBeRejectedWithError(VaultRecordIneligibleError, 'Vault record is no longer eligible.');
    await pending.catch(error => expect(String(error)).not.toContain(MARKER));
  });

  it('drops ciphertext when the owner changes during encrypt', async () => {
    let release!: () => void;
    let waiting = false;
    spyOn(service, 'encryptPayload').and.callFake(async () => {
      waiting = true;
      await new Promise<void>(resolve => { release = resolve; });
      return `ct:${MARKER}`;
    });
    const saving = capability.encryptPayload({ note: MARKER }, 'health_stats', 'hlt_b', 2, 1);
    for (let attempt = 0; attempt < 20 && !waiting; attempt += 1) await Promise.resolve();
    expect(waiting).toBeTrue();
    who.id = 8;
    release();
    await expectAsync(saving).toBeRejectedWithError(VaultRecordIneligibleError);
    await saving.catch(error => expect(String(error)).not.toContain(MARKER));
  });

  it('drops a list and an upsert when the owner logs out during the request', async () => {
    const releases: Array<() => void> = [];
    let cancelled = 0;
    spyOn(service, 'listRecords').and.callFake(() => new Observable<VaultRecordEnvelope[]>(subscriber => {
      releases.push(() => {
        if (subscriber.closed) return;
        subscriber.next([{
          collection: 'health_stats',
          client_id: 'hlt_a',
          ciphertext_b64: 'cipher',
          schema_version: 2,
          key_version: 1,
          revision: 1,
          updated_at: '2026-10-29T00:00:00Z',
        }]);
        subscriber.complete();
      });
      return () => { cancelled += 1; };
    }));
    const listed = firstValueFrom(capability.listRecords('health_stats', { silent: true }));
    const early = capability.listRecords('health_stats', { silent: true }).subscribe();
    early.unsubscribe();
    expect(cancelled).toBe(1);
    who.id = null;
    releases[0]();
    await expectAsync(listed).toBeRejectedWithError(VaultRecordIneligibleError);

    who.id = 1;
    let releaseUpsert!: () => void;
    spyOn(service, 'upsertRecords').and.callFake(() => new Observable<VaultRecordEnvelope[]>(subscriber => {
      releaseUpsert = () => {
        if (subscriber.closed) return;
        subscriber.next([{
          collection: 'health_stats',
          client_id: 'hlt_a',
          ciphertext_b64: `ct:${MARKER}`,
          schema_version: 2,
          key_version: 1,
          revision: 2,
          updated_at: '2026-10-29T00:00:00Z',
        }]);
        subscriber.complete();
      };
      return () => undefined;
    }));
    const saving = firstValueFrom(capability.upsertRecords([{
      collection: 'health_stats',
      client_id: 'hlt_a',
      ciphertext_b64: `ct:${MARKER}`,
      schema_version: 2,
      key_version: 1,
      expected_revision: 1,
    }], { silent: true }));
    who.id = null;
    releaseUpsert();
    await expectAsync(saving).toBeRejectedWithError(VaultRecordIneligibleError);
    await saving.catch(error => expect(JSON.stringify(error)).not.toContain(MARKER));
  });
});
