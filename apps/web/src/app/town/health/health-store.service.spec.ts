import { HttpErrorResponse } from '@angular/common/http';
import { Injector } from '@angular/core';
import { TestBed, fakeAsync, flushMicrotasks, tick } from '@angular/core/testing';
import { BehaviorSubject, Observable, Subject, of } from 'rxjs';
import {
  lockFinance,
  type VaultRecordCapability,
  type VaultRecordEnvelope,
  type VaultRecordUpsert,
} from '../../../../../finance/frontend/src/public-api';
import type { VaultService } from '../../../../../finance/frontend/src/testing';
import { SessionService } from '../../platform/session.service';
import { loadTownHealthStages } from './index';
import {
  HEALTH_CONFLICT_MESSAGE,
  HealthConflictError,
  HealthStoreService,
  newHealthClientId,
  type HealthLoadResult,
} from './health-store.service';
import type { HealthPr, HealthStat } from './health.types';

type EncryptedRecordDto = VaultRecordEnvelope;

const MARKER = 'PLAINTEXT_MARKER_719';

function encode(value: unknown): string {
  return `ct:${btoa(JSON.stringify(value))}`;
}

function row(
  collection: string,
  clientId: string,
  value: unknown,
  extra: Partial<EncryptedRecordDto> = {},
): EncryptedRecordDto {
  return {
    collection,
    client_id: clientId,
    ciphertext_b64: encode(value),
    schema_version: 2,
    key_version: 1,
    revision: 1,
    updated_at: '2026-10-29T00:00:00Z',
    ...extra,
  };
}

class FakeVault implements VaultRecordCapability {
  rows: EncryptedRecordDto[] = [];
  listed: string[] = [];
  upserted: VaultRecordUpsert[][] = [];
  deleted: { collection: string; client_id: string; expected_revision: number }[][] = [];
  decryptCalls: string[] = [];
  encryptCalls: { value: unknown; schemaVersion: number; keyVersion: number }[] = [];
  hangLists = false;
  holdList = false;
  holdDecrypt = false;
  holdEncrypt = false;
  holdUpsert = false;
  holdDelete = false;
  listCancelled = 0;
  upsertCancelled = 0;
  deleteCancelled = 0;
  readonly listRelease: Array<() => void> = [];
  readonly decryptRelease: Array<() => void> = [];
  readonly encryptRelease: Array<() => void> = [];
  readonly upsertRelease: Array<() => void> = [];
  readonly deleteRelease: Array<() => void> = [];

  listRecords(collection: string, _options?: { silent?: boolean }): Observable<EncryptedRecordDto[]> {
    this.listed.push(collection);
    const rows = this.rows.filter(item => !collection || item.collection === collection);
    if (this.hangLists || this.holdList) {
      return new Observable<EncryptedRecordDto[]>(subscriber => {
        if (!this.hangLists) {
          this.listRelease.push(() => {
            if (subscriber.closed) return;
            subscriber.next(rows);
            subscriber.complete();
          });
        }
        return () => { this.listCancelled += 1; };
      });
    }
    return of(rows);
  }

  async encryptPayload(
    value: unknown,
    _collection: string,
    _clientId: string,
    schemaVersion: number,
    keyVersion: number,
  ): Promise<string> {
    if (this.holdEncrypt) await new Promise<void>(resolve => { this.encryptRelease.push(resolve); });
    this.encryptCalls.push({ value, schemaVersion, keyVersion });
    return encode(value);
  }

  async decryptPayload<T>(
    ciphertextB64: string,
    _collection: string,
    clientId: string,
    _schemaVersion: number,
    _keyVersion: number,
  ): Promise<T> {
    this.decryptCalls.push(clientId);
    if (this.holdDecrypt) await new Promise<void>(resolve => { this.decryptRelease.push(resolve); });
    if (!ciphertextB64.startsWith('ct:')) throw new Error('undecryptable');
    return JSON.parse(atob(ciphertextB64.slice(3))) as T;
  }

  upsertRecords(records: readonly VaultRecordUpsert[], _options?: { silent?: boolean }): Observable<EncryptedRecordDto[]> {
    const run = (): EncryptedRecordDto[] => {
      this.upserted.push([...records]);
      const saved: EncryptedRecordDto[] = [];
      for (const record of records) {
        const existing = this.rows.find(
          item => item.collection === record.collection && item.client_id === record.client_id,
        );
        if (existing) {
          if (record.expected_revision !== existing.revision) {
            throw new HttpErrorResponse({ status: 409 });
          }
          existing.ciphertext_b64 = record.ciphertext_b64;
          existing.revision += 1;
          saved.push(existing);
        } else {
          if (record.expected_revision !== null) throw new HttpErrorResponse({ status: 409 });
          const created: EncryptedRecordDto = {
            collection: record.collection,
            client_id: record.client_id,
            ciphertext_b64: record.ciphertext_b64,
            schema_version: record.schema_version,
            key_version: record.key_version,
            revision: 1,
            updated_at: '2026-10-29T00:00:00Z',
          };
          this.rows.push(created);
          saved.push(created);
        }
      }
      return saved;
    };
    if (!this.holdUpsert) return of(run());
    return new Observable(subscriber => {
      this.upsertRelease.push(() => {
        if (subscriber.closed) return;
        try {
          subscriber.next(run());
          subscriber.complete();
        } catch (error) {
          subscriber.error(error);
        }
      });
      return () => { this.upsertCancelled += 1; };
    });
  }

  deleteRecords(
    records: readonly { collection: string; client_id: string; expected_revision: number }[],
    _options?: { silent?: boolean },
  ): Observable<{ deleted: number }> {
    const run = (): { deleted: number } => {
      this.deleted.push([...records]);
      let deleted = 0;
      for (const record of records) {
        const index = this.rows.findIndex(
          item => item.collection === record.collection && item.client_id === record.client_id,
        );
        if (index >= 0) {
          if (record.expected_revision !== this.rows[index].revision) {
            throw new HttpErrorResponse({ status: 409 });
          }
          this.rows.splice(index, 1);
          deleted += 1;
        }
      }
      return { deleted };
    };
    if (!this.holdDelete) return of(run());
    return new Observable(subscriber => {
      this.deleteRelease.push(() => {
        if (subscriber.closed) return;
        try {
          subscriber.next(run());
          subscriber.complete();
        } catch (error) {
          subscriber.error(error);
        }
      });
      return () => { this.deleteCancelled += 1; };
    });
  }
}

/** Session port double. `become` is an owner switch or logout, then the vault can be present again. */
class SessionDouble {
  private readonly users = new BehaviorSubject<{ id: number } | null>({ id: 7 });
  private readonly clearedSubject = new Subject<void>();
  readonly user$ = this.users.asObservable();
  readonly cleared$ = this.clearedSubject.asObservable();
  revision = 1;
  get currentUser(): { id: number } | null { return this.users.value; }
  become(id: number | null): void {
    this.revision += 1;
    this.users.next(id == null ? null : { id });
    this.clearedSubject.next();
  }
}

let fake: FakeVault;
let session: SessionDouble;
let vaultCalls = 0;

async function until(ready: () => boolean): Promise<void> {
  for (let attempt = 0; attempt < 50 && !ready(); attempt += 1) await Promise.resolve();
  if (!ready()) throw new Error('timed out waiting for the held Health vault call');
}

function unlockVault(): void {
  localStorage.setItem('finance-dek', 'present');
}

function textOf(value: unknown): string {
  return JSON.stringify(value);
}

class TestStore extends HealthStoreService {
  protected override vault(): Promise<VaultRecordCapability> {
    vaultCalls += 1;
    return Promise.resolve(fake);
  }
}

const STAT: HealthStat = {
  v: 1, kind: 'weight', measured_on: '2026-10-28', logged_on: '2026-10-28', kg: 80,
};
const PR: HealthPr = {
  v: 1, kind: 'lift', measured_on: '2026-10-28', logged_on: '2026-10-28',
  exercise: 'Squat', kg: 100, reps: 5,
};

/** The capability Health's vault() returns. A Finance-only method must not typecheck. */
class HealthCapabilityProbe extends HealthStoreService {
  taken(): Promise<VaultRecordCapability> {
    return this.vault();
  }
}

type HealthCapability = Awaited<ReturnType<HealthCapabilityProbe['taken']>>;
type HealthCiphertext = Awaited<ReturnType<HealthCapability['encryptPayload']>>;
const healthCiphertextIsString: HealthCiphertext extends string ? true : never = true;

function rejectFinanceOnlyOnHealthCapability(capability: HealthCapability): void {
  void capability.listRecords('health_stats', { silent: true });
  void capability.encryptPayload({ kind: 'weight' }, 'health_stats', 'hlt_a', 2, 1);
  void capability.decryptPayload<unknown>('cipher', 'health_stats', 'hlt_a', 2, 1);
  void capability.upsertRecords([{
    collection: 'health_stats',
    client_id: 'hlt_a',
    ciphertext_b64: 'cipher',
    schema_version: 2,
    key_version: 1,
    expected_revision: null,
  }], { silent: true });
  void capability.deleteRecords([{
    collection: 'health_stats',
    client_id: 'hlt_a',
    expected_revision: 1,
  }], { silent: true });
  // @ts-expect-error unlock is a Finance vault method and is not on the Health capability
  void capability.unlock('passphrase');
  // @ts-expect-error requireDek would expose a CryptoKey
  void capability.requireDek();
  // @ts-expect-error lookupBlindIndex is not a Health record operation
  void capability.lookupBlindIndex('health_stats', 'record', 'token');
  // @ts-expect-error reindexRecords is a Finance migration method
  void capability.reindexRecords([]);
  // @ts-expect-error getCounts is not consumed by Health
  void capability.getCounts();
  // @ts-expect-error the Health capability is not the concrete Finance vault
  const concrete: VaultService = capability;
  void concrete;
}

describe('HealthStoreService', () => {
  let store: HealthStoreService;

  beforeEach(() => {
    fake = new FakeVault();
    session = new SessionDouble();
    vaultCalls = 0;
    unlockVault();
    TestBed.configureTestingModule({
      providers: [
        { provide: HealthStoreService, useClass: TestStore },
        { provide: SessionService, useValue: session as unknown as SessionService },
      ],
    });
    store = TestBed.inject(HealthStoreService);
  });

  it('rejects a Finance-only method on the Health capability (LOCAL1)', () => {
    expect(healthCiphertextIsString).toBeTrue();
    expect(rejectFinanceOnlyOnHealthCapability).toEqual(jasmine.any(Function));
  });

  afterEach(() => {
    TestBed.resetTestingModule();
    localStorage.removeItem('finance-dek');
    localStorage.removeItem('finance-vault-present');
  });

  it('lists only the two health collections and decrypts their rows', async () => {
    fake.rows = [
      row('health_stats', 'hlt_a', STAT),
      row('health_prs', 'hlt_b', PR),
      row('transactions', 'txn_1', { note: MARKER }),
    ];
    const result = await store.load();
    expect(fake.listed).toEqual(['health_stats', 'health_prs']);
    expect(result.state).toBe('ready');
    if (result.state !== 'ready') return;
    expect(result.stats.map(entry => entry.clientId)).toEqual(['hlt_a']);
    expect(result.prs.map(entry => entry.clientId)).toEqual(['hlt_b']);
    expect(result.unreadable).toBe(0);
    expect(textOf(result)).not.toContain(MARKER);
    expect(textOf(store.statsSnapshot)).not.toContain(MARKER);
  });

  it('LOCAL2: only the health codec decrypts health plaintext and finance rows stay preserved', async () => {
    const finance = row('transactions', 'txn_1', { note: MARKER });
    const financeCipher = finance.ciphertext_b64;
    fake.rows = [
      row('health_stats', 'hlt_a', STAT),
      row('health_prs', 'hlt_b', PR),
      finance,
    ];
    const result = await store.load();
    expect(result.state).toBe('ready');
    if (result.state !== 'ready') return;
    expect(result.stats.map(entry => entry.clientId)).toEqual(['hlt_a']);
    expect(result.prs.map(entry => entry.clientId)).toEqual(['hlt_b']);
    expect(fake.listed).toEqual(['health_stats', 'health_prs']);
    expect(fake.decryptCalls).toEqual(['hlt_a', 'hlt_b']);
    expect(fake.deleted).toEqual([]);
    expect(fake.upserted).toEqual([]);
    expect(finance.ciphertext_b64).toBe(financeCipher);
    expect(finance.revision).toBe(1);
    expect(textOf(result)).not.toContain(MARKER);
  });

  it('LOCAL3: an older health load or save does not decrypt, delete, or rewrite an unknown row', async () => {
    const future = row(
      'future_private',
      'future_private_1',
      { note: MARKER },
      { schema_version: 1, revision: 4 },
    );
    const futureCipher = future.ciphertext_b64;
    fake.rows = [
      row('health_stats', 'hlt_a', STAT),
      future,
    ];
    const result = await store.load();
    expect(result.state).toBe('ready');
    if (result.state !== 'ready') return;
    expect(fake.listed).toEqual(['health_stats', 'health_prs']);
    expect(fake.decryptCalls).toEqual(['hlt_a']);
    expect(fake.deleted).toEqual([]);
    await store.createStat(STAT);
    expect(fake.deleted).toEqual([]);
    expect(fake.decryptCalls).toEqual(['hlt_a']);
    expect(fake.upserted.every(batch => batch.every(item => item.collection === 'health_stats'))).toBeTrue();
    expect(future.ciphertext_b64).toBe(futureCipher);
    expect(future.revision).toBe(4);
    expect(future.schema_version).toBe(1);
    expect(fake.rows.find(item => item.client_id === 'future_private_1')).toBe(future);
  });

  it('skips and counts corrupt, unparsable and v1 rows without deleting them', async () => {
    fake.rows = [
      row('health_stats', 'hlt_good', STAT),
      row('health_stats', 'hlt_corrupt', STAT, { ciphertext_b64: 'not-a-ciphertext' }),
      row('health_stats', 'hlt_shape', { nope: true }),
      row('health_stats', 'hlt_v1', STAT, { schema_version: 1 }),
    ];
    const result = await store.load();
    expect(result.state).toBe('ready');
    if (result.state !== 'ready') return;
    expect(result.stats.map(entry => entry.clientId)).toEqual(['hlt_good']);
    expect(result.unreadable).toBe(3);
    expect(fake.rows).toHaveSize(4); // never deleted
    expect(fake.deleted).toEqual([]);
    // The v1 row is refused before any decrypt attempt.
    expect(fake.decryptCalls).not.toContain('hlt_v1');
  });

  it('reports locked and clears memory when the vault is not present', async () => {
    fake.rows = [row('health_stats', 'hlt_a', STAT)];
    await store.load();
    expect(store.statsSnapshot).toHaveSize(1);
    localStorage.removeItem('finance-dek');
    const callsBefore = vaultCalls;
    const result = await store.load();
    expect(result).toEqual({ state: 'locked' });
    expect(vaultCalls).toBe(callsBefore); // vault never touched while locked
    expect(store.statsSnapshot).toEqual([]);
  });

  it('times out to unavailable at the load deadline', async () => {
    fake.hangLists = true;
    const result = await store.load({ deadlineMs: 25 });
    expect(result).toEqual({ state: 'unavailable' });
    expect(fake.listCancelled).toBeGreaterThan(0);
    expect(store.statsSnapshot).toEqual([]);
  });

  it('does not touch the vault when the caller aborted before load', async () => {
    fake.rows = [row('health_stats', 'hlt_a', { ...STAT, note: MARKER })];
    const callsBefore = vaultCalls;
    const controller = new AbortController();
    controller.abort();
    const result = await store.load({ signal: controller.signal });
    expect(result).toEqual({ state: 'unavailable' });
    expect(vaultCalls).toBe(callsBefore);
    expect(store.statsSnapshot).toEqual([]);
    expect(textOf(result)).not.toContain(MARKER);
  });

  it('creates with an hlt_ client id, v2 envelope and ciphertext only (AC-H2 store half)', async () => {
    const value: HealthStat = { ...STAT, note: MARKER };
    const entry = await store.createStat(value);
    expect(entry.clientId).toMatch(/^hlt_[A-Za-z0-9_-]{22}$/);
    expect(fake.upserted).toHaveSize(1);
    const body = fake.upserted[0][0];
    expect(body['schema_version']).toBe(2);
    expect(body['expected_revision']).toBeNull();
    expect(body['collection']).toBe('health_stats');
    // No plaintext anywhere in the request body the store built: the body
    // carries envelope fields and ciphertext only.
    expect(JSON.stringify(fake.upserted)).not.toContain(MARKER);
    expect(Object.keys(body).sort()).toEqual([
      'ciphertext_b64',
      'client_id',
      'collection',
      'expected_revision',
      'key_version',
      'schema_version',
    ]);
    expect(fake.encryptCalls[0].schemaVersion).toBe(2);
    expect(fake.encryptCalls[0].keyVersion).toBe(1);
  });

  it('generates distinct random client ids', () => {
    const ids = new Set(Array.from({ length: 50 }, () => newHealthClientId()));
    expect(ids.size).toBe(50);
    for (const id of ids) expect(id).toMatch(/^hlt_[A-Za-z0-9_-]{22}$/);
  });

  it('preserves logged_on and the existing key_version on edit', async () => {
    fake.rows = [row('health_stats', 'hlt_a', STAT, { key_version: 3, revision: 4 })];
    await store.load();
    const entry = store.statsSnapshot[0];
    const saved = await store.updateStat(entry, { kg: 81, logged_on: '2020-01-01' });
    expect(saved.value.kg).toBe(81);
    expect(saved.value.logged_on).toBe(STAT.logged_on);
    expect(saved.revision).toBe(5);
    expect(fake.encryptCalls.at(-1)?.keyVersion).toBe(3);
    expect(fake.upserted.at(-1)?.[0]['expected_revision']).toBe(4);
  });

  it('surfaces the exact conflict message and refetches on a 409', async () => {
    fake.rows = [row('health_stats', 'hlt_a', STAT)];
    await store.load();
    const entry = store.statsSnapshot[0];
    // Another tab writes first.
    fake.rows[0].revision = 9;
    fake.rows[0].ciphertext_b64 = encode({ ...STAT, kg: 70 });
    const listsBefore = fake.listed.length;
    await expectAsync(store.updateStat(entry, { kg: 82 })).toBeRejectedWith(
      new HealthConflictError(),
    );
    await expectAsync(store.updateStat(entry, { kg: 82 })).toBeRejectedWithError(
      HEALTH_CONFLICT_MESSAGE,
    );
    expect(fake.listed.length).toBeGreaterThan(listsBefore); // refetch happened
    expect(store.statsSnapshot[0].value.kg).toBe(70); // memory refreshed
  });

  it('deletes for real with the expected revision', async () => {
    fake.rows = [row('health_prs', 'hlt_b', PR)];
    await store.load();
    await store.deletePr(store.prsSnapshot[0]);
    expect(fake.deleted[0][0]).toEqual({
      collection: 'health_prs',
      client_id: 'hlt_b',
      expected_revision: 1,
    });
    expect(fake.rows).toEqual([]);
    expect(store.prsSnapshot).toEqual([]);
  });

  it('creates PRs in health_prs only', async () => {
    const entry = await store.createPr(PR);
    expect(fake.upserted[0][0]['collection']).toBe('health_prs');
    expect(store.prsSnapshot.map(item => item.clientId)).toEqual([entry.clientId]);
  });

  it('drops a held decrypt after lock and abort, including once the vault is present again (LOCAL1)', async () => {
    fake.holdDecrypt = true;
    fake.rows = [row('health_stats', 'hlt_a', { ...STAT, note: MARKER })];
    const controller = new AbortController();
    const pending = store.load({ signal: controller.signal });
    await until(() => fake.decryptRelease.length === 1);
    const locking = lockFinance(TestBed.inject(Injector)).catch(() => undefined);
    expect(store.statsSnapshot).toEqual([]);
    expect(store.prsSnapshot).toEqual([]);
    expect(store.unreadableCount).toBe(0);
    unlockVault();
    controller.abort();
    fake.decryptRelease.shift()?.();
    const result = await pending;
    await locking;
    expect(result.state).not.toBe('ready');
    expect(store.statsSnapshot).toEqual([]);
    expect(store.prsSnapshot).toEqual([]);
    expect(store.unreadableCount).toBe(0);
    expect(textOf(result)).not.toContain(MARKER);
    expect(textOf(store.statsSnapshot)).not.toContain(MARKER);
  });

  it('does not let the stage read model publish a held row after lock (LOCAL1)', async () => {
    fake.holdDecrypt = true;
    fake.rows = [row('health_stats', 'hlt_a', { ...STAT, note: MARKER })];
    const injector = Injector.create({
      providers: [{ provide: HealthStoreService, useValue: store }],
    });
    const pending = loadTownHealthStages(injector, new AbortController().signal, { deadlineMs: 60_000 });
    await until(() => fake.decryptRelease.length === 1);
    const locking = lockFinance(TestBed.inject(Injector)).catch(() => undefined);
    expect(store.statsSnapshot).toEqual([]);
    expect(store.unreadableCount).toBe(0);
    fake.decryptRelease.shift()?.();
    const stage = await pending;
    await locking;
    expect(stage).toEqual({ state: 'locked' });
    expect(textOf(stage)).not.toContain(MARKER);
    expect(textOf(store.statsSnapshot)).not.toContain(MARKER);
    expect(store.prsSnapshot).toEqual([]);
  });

  it('does not let an older load overwrite the newest load (LOCAL1)', async () => {
    fake.holdDecrypt = true;
    fake.rows = [row('health_stats', 'hlt_old', { ...STAT, note: MARKER })];
    const older = store.load();
    await until(() => fake.decryptRelease.length === 1);
    fake.rows = [row('health_stats', 'hlt_new', { ...STAT, kg: 81 })];
    const newer = store.load();
    await until(() => fake.decryptRelease.length === 2);
    fake.decryptRelease.shift()?.();
    const olderResult = await older;
    expect(olderResult.state).not.toBe('ready');
    expect(store.statsSnapshot).toEqual([]);
    fake.decryptRelease.shift()?.();
    const newerResult = await newer;
    expect(newerResult.state).toBe('ready');
    if (newerResult.state !== 'ready') return;
    expect(newerResult.stats.map(entry => entry.clientId)).toEqual(['hlt_new']);
    expect(store.statsSnapshot.map(entry => entry.clientId)).toEqual(['hlt_new']);
    expect(textOf(store.statsSnapshot)).not.toContain(MARKER);
  });

  it('keeps A plaintext out of B after a held load, save, and conflict refetch (LOCAL2)', async () => {
    fake.holdDecrypt = true;
    fake.rows = [row('health_stats', 'hlt_a', { ...STAT, note: MARKER })];
    const pending = store.load();
    await until(() => fake.decryptRelease.length === 1);
    localStorage.removeItem('finance-dek');
    session.become(8);
    unlockVault();
    fake.decryptRelease.shift()?.();
    const result = await pending;
    expect(result.state).not.toBe('ready');
    expect(store.statsSnapshot).toEqual([]);
    expect(textOf(store.statsSnapshot)).not.toContain(MARKER);

    fake.holdDecrypt = false;
    fake.rows = [row('health_stats', 'hlt_b', { ...STAT, kg: 70 })];
    const loaded = await store.load();
    expect(loaded.state).toBe('ready');
    if (loaded.state !== 'ready') return;
    expect(loaded.stats.map(entry => entry.clientId)).toEqual(['hlt_b']);
    expect(textOf(loaded)).not.toContain(MARKER);

    fake.holdEncrypt = true;
    const saving = store.createStat({ ...STAT, note: MARKER });
    await until(() => fake.encryptRelease.length === 1);
    localStorage.removeItem('finance-dek');
    session.become(9);
    unlockVault();
    fake.encryptRelease.shift()?.();
    await expectAsync(saving).toBeRejected();
    expect(store.statsSnapshot).toEqual([]);
    expect(textOf(store.statsSnapshot)).not.toContain(MARKER);
    expect(textOf(fake.upserted)).not.toContain(MARKER);

    fake.holdEncrypt = false;
    fake.rows = [row('health_stats', 'hlt_c', STAT, { revision: 2 })];
    await store.load();
    const entry = store.statsSnapshot[0];
    fake.rows[0].revision = 4;
    fake.rows[0].ciphertext_b64 = encode({ ...STAT, note: MARKER, kg: 61 });
    fake.holdList = true;
    const conflict = store.updateStat(entry, { kg: 82 });
    await until(() => fake.listRelease.length === 1);
    localStorage.removeItem('finance-dek');
    session.become(10);
    unlockVault();
    fake.listRelease.shift()?.();
    await expectAsync(conflict).toBeRejected();
    expect(textOf(store.statsSnapshot)).not.toContain(MARKER);
    expect(store.statsSnapshot.map(item => item.value.kg)).not.toContain(61);
  });

  it('cancels a held list, save, and delete without publishing plaintext (LOCAL2)', async () => {
    fake.holdList = true;
    fake.rows = [row('health_stats', 'hlt_a', { ...STAT, note: MARKER })];
    const controller = new AbortController();
    const pending = store.load({ signal: controller.signal });
    await until(() => fake.listed.length === 2);
    controller.abort();
    expect(fake.listCancelled).toBeGreaterThan(0);
    fake.listRelease.splice(0).forEach(release => release());
    const result = await pending;
    expect(result).toEqual({ state: 'unavailable' });
    expect(store.statsSnapshot).toEqual([]);
    expect(textOf(result)).not.toContain(MARKER);

    fake.holdList = false;
    await store.load();
    fake.holdUpsert = true;
    const saving = store.createStat({ ...STAT, note: MARKER });
    await until(() => fake.upsertRelease.length === 1);
    localStorage.removeItem('finance-dek');
    session.become(null);
    expect(fake.upsertCancelled).toBe(1);
    fake.upsertRelease.shift()?.();
    await expectAsync(saving).toBeRejected();
    expect(textOf(store.statsSnapshot)).not.toContain(MARKER);
    expect(textOf(fake.upserted)).not.toContain(MARKER);

    unlockVault();
    session.become(7);
    fake.holdUpsert = false;
    fake.rows = [row('health_prs', 'hlt_pr', { ...PR, name: MARKER })];
    await store.load();
    expect(store.prsSnapshot).toHaveSize(1);
    fake.holdDelete = true;
    const removing = store.deletePr(store.prsSnapshot[0]);
    await until(() => fake.deleteRelease.length === 1);
    const retained = store;
    TestBed.resetTestingModule();
    expect(retained.prsSnapshot).toEqual([]);
    expect(fake.deleteCancelled).toBe(1);
    fake.deleteRelease.shift()?.();
    await expectAsync(removing).toBeRejected();
    expect(retained.statsSnapshot).toEqual([]);
    expect(retained.prsSnapshot).toEqual([]);
    expect(textOf(retained.prsSnapshot)).not.toContain(MARKER);
  });

  it('does not publish a load that loses its deadline (LOCAL3)', fakeAsync(() => {
    fake.holdDecrypt = true;
    fake.rows = [row('health_stats', 'hlt_a', { ...STAT, note: MARKER })];
    let result: HealthLoadResult | undefined;
    const pending = store.load({ deadlineMs: 1_000 });
    pending.then(value => { result = value; });
    for (let attempt = 0; attempt < 20 && fake.decryptRelease.length === 0; attempt += 1) flushMicrotasks();
    expect(fake.decryptRelease.length).toBe(1);
    tick(999);
    expect(result).toBeUndefined();
    tick(1);
    flushMicrotasks();
    expect(result).toEqual({ state: 'unavailable' });
    expect(store.statsSnapshot).toEqual([]);
    fake.decryptRelease.shift()?.();
    flushMicrotasks();
    expect(result).toEqual({ state: 'unavailable' });
    expect(store.statsSnapshot).toEqual([]);
    expect(store.prsSnapshot).toEqual([]);
    expect(store.unreadableCount).toBe(0);
    expect(textOf(result)).not.toContain(MARKER);
    expect(textOf(store.statsSnapshot)).not.toContain(MARKER);
  }));

  it('bounds the stage read on the store deadline and drops a late decrypt', fakeAsync(() => {
    fake.holdDecrypt = true;
    fake.rows = [row('health_stats', 'hlt_a', { ...STAT, note: MARKER })];
    const injector = Injector.create({
      providers: [{ provide: HealthStoreService, useValue: store }],
    });
    let stage: Awaited<ReturnType<typeof loadTownHealthStages>> | undefined;
    const pending = loadTownHealthStages(injector, new AbortController().signal, { deadlineMs: 1_000 });
    pending.then(value => { stage = value; });
    for (let attempt = 0; attempt < 20 && fake.decryptRelease.length === 0; attempt += 1) flushMicrotasks();
    expect(fake.decryptRelease.length).toBe(1);
    tick(999);
    expect(stage).toBeUndefined();
    tick(1);
    flushMicrotasks();
    expect(stage).toEqual({ state: 'unavailable' });
    fake.decryptRelease.shift()?.();
    flushMicrotasks();
    expect(stage).toEqual({ state: 'unavailable' });
    expect(textOf(stage)).not.toContain(MARKER);
    expect(store.statsSnapshot).toEqual([]);
  }));
});

describe('loadTownHealthStages (barrel)', () => {
  beforeEach(() => {
    localStorage.setItem('finance-dek', 'present');
  });

  afterEach(() => {
    localStorage.removeItem('finance-dek');
    localStorage.removeItem('finance-vault-present');
  });

  it('returns locked without touching the store or the vault', async () => {
    localStorage.removeItem('finance-dek');
    const throwing = {
      get: () => {
        throw new Error('injector must not be used while locked');
      },
    };
    const result = await loadTownHealthStages(
      throwing as never,
      new AbortController().signal,
    );
    expect(result).toEqual({ state: 'locked' });
  });

  it('returns ready stages computed by health-math, with no other numbers', async () => {
    const stats = Array.from({ length: 10 }, (_, i) => ({
      clientId: `hlt_s${i}`,
      revision: 1,
      keyVersion: 1,
      value: {
        v: 1 as const,
        kind: 'checkup' as const,
        measured_on: `2026-10-${String(i + 1).padStart(2, '0')}`,
        logged_on: `2026-10-${String(i + 1).padStart(2, '0')}`,
      },
    }));
    const stub = {
      load: async () => ({ state: 'ready' as const, stats, prs: [], unreadable: 0 }),
    };
    const injector = Injector.create({
      providers: [{ provide: HealthStoreService, useValue: stub }],
    });
    const result = await loadTownHealthStages(injector, new AbortController().signal);
    // 10 checkups x 10 XP on distinct days = 100 XP -> clinic level 2 -> stage 2.
    expect(result).toEqual({ state: 'ready', clinic: 2, gym: 1 });
    expect(Object.keys(result).sort()).toEqual(['clinic', 'gym', 'state']);
  });

  it('returns unavailable when the caller already aborted, without asking the store', async () => {
    const controller = new AbortController();
    controller.abort();
    let calls = 0;
    const stub = {
      load: () => {
        calls += 1;
        return Promise.resolve({ state: 'unavailable' as const, stats: [], prs: [], unreadable: 0 });
      },
    };
    const injector = Injector.create({
      providers: [{ provide: HealthStoreService, useValue: stub }],
    });
    const result = await loadTownHealthStages(injector, controller.signal, { deadlineMs: 25 });
    expect(result).toEqual({ state: 'unavailable' });
    expect(calls).toBe(0);
  });
});
