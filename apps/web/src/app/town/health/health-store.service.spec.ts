import { HttpErrorResponse } from '@angular/common/http';
import { Injector } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Observable, of } from 'rxjs';
import type { EncryptedRecordDto } from '../../../../../finance/frontend/src/app/crypto/vault.service';
import { loadTownHealthStages } from './index';
import {
  HEALTH_CONFLICT_MESSAGE,
  HealthConflictError,
  HealthStoreService,
  newHealthClientId,
  type HealthVault,
} from './health-store.service';
import type { HealthPr, HealthStat } from './health.types';

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

class FakeVault {
  rows: EncryptedRecordDto[] = [];
  listed: (string | undefined)[] = [];
  upserted: Record<string, unknown>[][] = [];
  deleted: Record<string, unknown>[][] = [];
  decryptCalls: string[] = [];
  encryptCalls: { value: unknown; schemaVersion: number; keyVersion: number }[] = [];
  hangLists = false;

  listRecords(collection?: string): Observable<EncryptedRecordDto[]> {
    this.listed.push(collection);
    if (this.hangLists) return new Observable<EncryptedRecordDto[]>(() => undefined);
    return of(this.rows.filter(item => !collection || item.collection === collection));
  }

  async encryptPayload(
    value: unknown,
    _collection: string,
    _clientId: string,
    schemaVersion: number,
    keyVersion: number,
  ): Promise<string> {
    this.encryptCalls.push({ value, schemaVersion, keyVersion });
    return encode(value);
  }

  async decryptPayload<T>(ciphertextB64: string, _collection: string, clientId: string): Promise<T> {
    this.decryptCalls.push(clientId);
    if (!ciphertextB64.startsWith('ct:')) throw new Error('undecryptable');
    return JSON.parse(atob(ciphertextB64.slice(3))) as T;
  }

  upsertRecords(records: Record<string, unknown>[]): Observable<EncryptedRecordDto[]> {
    this.upserted.push(records);
    const saved: EncryptedRecordDto[] = [];
    for (const record of records) {
      const existing = this.rows.find(
        item => item.collection === record['collection'] && item.client_id === record['client_id'],
      );
      if (existing) {
        if (record['expected_revision'] !== existing.revision) {
          throw new HttpErrorResponse({ status: 409 });
        }
        existing.ciphertext_b64 = record['ciphertext_b64'] as string;
        existing.revision += 1;
        saved.push(existing);
      } else {
        if (record['expected_revision'] !== null) throw new HttpErrorResponse({ status: 409 });
        const created: EncryptedRecordDto = {
          collection: record['collection'] as string,
          client_id: record['client_id'] as string,
          ciphertext_b64: record['ciphertext_b64'] as string,
          schema_version: record['schema_version'] as number,
          key_version: record['key_version'] as number,
          revision: 1,
          updated_at: '2026-10-29T00:00:00Z',
        };
        this.rows.push(created);
        saved.push(created);
      }
    }
    return of(saved);
  }

  deleteRecords(records: Record<string, unknown>[]): Observable<{ deleted: number }> {
    this.deleted.push(records);
    let deleted = 0;
    for (const record of records) {
      const index = this.rows.findIndex(
        item => item.collection === record['collection'] && item.client_id === record['client_id'],
      );
      if (index >= 0) {
        if (record['expected_revision'] !== this.rows[index].revision) {
          throw new HttpErrorResponse({ status: 409 });
        }
        this.rows.splice(index, 1);
        deleted += 1;
      }
    }
    return of({ deleted });
  }
}

let fake: FakeVault;
let vaultCalls = 0;

class TestStore extends HealthStoreService {
  protected override vault(): Promise<HealthVault> {
    vaultCalls += 1;
    return Promise.resolve(fake as unknown as HealthVault);
  }
}

const STAT: HealthStat = {
  v: 1, kind: 'weight', measured_on: '2026-10-28', logged_on: '2026-10-28', kg: 80,
};
const PR: HealthPr = {
  v: 1, kind: 'lift', measured_on: '2026-10-28', logged_on: '2026-10-28',
  exercise: 'Squat', kg: 100, reps: 5,
};

describe('HealthStoreService', () => {
  let store: HealthStoreService;

  beforeEach(() => {
    fake = new FakeVault();
    vaultCalls = 0;
    localStorage.setItem('finance-dek', 'present');
    TestBed.configureTestingModule({
      providers: [{ provide: HealthStoreService, useClass: TestStore }],
    });
    store = TestBed.inject(HealthStoreService);
  });

  afterEach(() => {
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

  it('honours the deadline and the abort signal as unavailable', async () => {
    const hanging = {
      load: () => new Promise<never>(() => undefined),
    };
    const injector = Injector.create({
      providers: [{ provide: HealthStoreService, useValue: hanging }],
    });
    const timed = await loadTownHealthStages(injector, new AbortController().signal, {
      deadlineMs: 25,
    });
    expect(timed).toEqual({ state: 'unavailable' });

    const controller = new AbortController();
    const pending = loadTownHealthStages(injector, controller.signal, { deadlineMs: 5_000 });
    controller.abort();
    expect(await pending).toEqual({ state: 'unavailable' });
  });
});
