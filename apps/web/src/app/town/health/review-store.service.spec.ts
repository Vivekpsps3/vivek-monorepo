import { HttpErrorResponse } from '@angular/common/http';
import { Injector } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { BehaviorSubject, Observable, Subject, of } from 'rxjs';
import {
  lockFinance,
  type VaultRecordCapability,
  type VaultRecordEnvelope,
  type VaultRecordUpsert,
} from '../../../../../finance/frontend/src/public-api';
import { SessionService } from '../../platform/session.service';
import { HEALTH_SCHEMA_VERSION, TOWN_REVIEWS_COLLECTION } from './health-store.service';
import { emptyDraft, type WeeklyReview } from './review';
import {
  REVIEW_CONFLICT_MESSAGE,
  ReviewRejectedError,
  ReviewStoreService,
} from './review-store.service';

const MARKER = 'SyntheticReviewMarkerQX';
const OTHER = 'SyntheticOtherNoteQX';
const WEEK = '2026-12-28';

function encode(value: unknown): string {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return `ct:${btoa(binary)}`;
}

function decode(ciphertext: string): unknown {
  const binary = atob(ciphertext.slice(3));
  const bytes = Uint8Array.from(binary, char => char.charCodeAt(0));
  return JSON.parse(new TextDecoder().decode(bytes));
}

function stored(note: string, week = WEEK): WeeklyReview {
  return { v: 1, week, focus: ['Synthetic focus', '', ''], note, obsidian: null };
}

function row(value: unknown, extra: Partial<VaultRecordEnvelope> = {}): VaultRecordEnvelope {
  const clientId = extra.client_id ?? 'rev_StoreSpecClientId0001';
  return {
    collection: TOWN_REVIEWS_COLLECTION,
    ciphertext_b64: encode(value),
    schema_version: HEALTH_SCHEMA_VERSION,
    key_version: 1,
    revision: 1,
    updated_at: '2026-12-28T00:00:00Z',
    ...extra,
    client_id: clientId,
  };
}

class FakeVault implements VaultRecordCapability {
  rows: VaultRecordEnvelope[] = [];
  listed: string[] = [];
  upserted: VaultRecordUpsert[][] = [];
  holdUpsert = false;
  failUpsert: number | null = null;
  readonly upsertRelease: Array<() => void> = [];
  upsertCancelled = 0;

  listRecords(collection: string): Observable<VaultRecordEnvelope[]> {
    this.listed.push(collection);
    return of(this.rows.filter(item => item.collection === collection));
  }

  async encryptPayload(value: unknown): Promise<string> {
    return encode(value);
  }

  async decryptPayload<T>(ciphertextB64: string): Promise<T> {
    if (!ciphertextB64.startsWith('ct:')) throw new Error('undecryptable');
    return decode(ciphertextB64) as T;
  }

  upsertRecords(records: readonly VaultRecordUpsert[]): Observable<VaultRecordEnvelope[]> {
    const run = (): VaultRecordEnvelope[] => {
      if (this.failUpsert !== null) throw new HttpErrorResponse({ status: this.failUpsert });
      this.upserted.push([...records]);
      const saved: VaultRecordEnvelope[] = [];
      for (const record of records) {
        const existing = this.rows.find(item => item.collection === record.collection && item.client_id === record.client_id);
        if (existing) {
          if (record.expected_revision !== existing.revision) throw new HttpErrorResponse({ status: 409 });
          existing.ciphertext_b64 = record.ciphertext_b64;
          existing.revision += 1;
          saved.push(existing);
        } else {
          if (record.expected_revision !== null) throw new HttpErrorResponse({ status: 409 });
          const created: VaultRecordEnvelope = {
            collection: record.collection,
            client_id: record.client_id,
            ciphertext_b64: record.ciphertext_b64,
            schema_version: record.schema_version,
            key_version: record.key_version,
            revision: 1,
            updated_at: '2026-12-28T00:00:00Z',
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

  deleteRecords(records: readonly { collection: string; client_id: string; expected_revision: number }[]): Observable<{ deleted: number }> {
    let deleted = 0;
    for (const record of records) {
      const index = this.rows.findIndex(item => item.collection === record.collection && item.client_id === record.client_id);
      if (index < 0) continue;
      if (record.expected_revision !== this.rows[index].revision) throw new HttpErrorResponse({ status: 409 });
      this.rows.splice(index, 1);
      deleted += 1;
    }
    return of({ deleted });
  }
}

class SessionDouble {
  private readonly users = new BehaviorSubject<{ id: number } | null>({ id: 7 });
  private readonly clearedSubject = new Subject<void>();
  readonly user$ = this.users.asObservable();
  readonly cleared$ = this.clearedSubject.asObservable();
  get currentUser(): { id: number } | null { return this.users.value; }
  become(id: number | null): void {
    this.users.next(id == null ? null : { id });
    this.clearedSubject.next();
  }
}

class TestStore extends ReviewStoreService {
  protected override vault(): Promise<VaultRecordCapability> {
    return Promise.resolve(fake);
  }
}

let fake: FakeVault;
let session: SessionDouble;

function unlock(): void {
  localStorage.setItem('finance-dek', 'present');
}

async function until(ready: () => boolean): Promise<void> {
  for (let attempt = 0; attempt < 50 && !ready(); attempt += 1) await Promise.resolve();
  if (!ready()) throw new Error('timed out waiting for the held review save');
}

describe('ReviewStoreService', () => {
  let store: ReviewStoreService;

  beforeEach(() => {
    fake = new FakeVault();
    session = new SessionDouble();
    unlock();
    TestBed.configureTestingModule({
      providers: [
        { provide: ReviewStoreService, useClass: TestStore },
        { provide: SessionService, useValue: session as unknown as SessionService },
      ],
    });
    store = TestBed.inject(ReviewStoreService);
  });

  afterEach(() => {
    TestBed.resetTestingModule();
    localStorage.clear();
  });

  it('saves the exact schema across the ISO year boundary and does not list measurements', async () => {
    const draft = emptyDraft();
    draft.focus[0] = 'Synthetic focus';
    draft.note = MARKER;
    const first = await store.save(WEEK, draft, { clientId: null, revision: null, keyVersion: 1 });
    expect(fake.listed).toEqual([]);
    expect(fake.upserted[0][0].collection).toBe(TOWN_REVIEWS_COLLECTION);
    expect(fake.upserted[0][0].schema_version).toBe(HEALTH_SCHEMA_VERSION);
    expect(decode(fake.rows[0].ciphertext_b64)).toEqual(stored(MARKER));
    expect(Object.keys(decode(fake.rows[0].ciphertext_b64) as object)).toEqual(['v', 'week', 'focus', 'note', 'obsidian']);
    const next = emptyDraft();
    next.note = 'Synthetic next week';
    await store.save('2027-01-04', next, { clientId: null, revision: null, keyVersion: 1 });
    const loaded = await store.load();
    expect(fake.listed).toEqual([TOWN_REVIEWS_COLLECTION]);
    expect(loaded.state).toBe('ready');
    if (loaded.state !== 'ready') return;
    expect(loaded.weeks.map(item => item.value.week)).toEqual(['2027-01-04', WEEK]);
    expect(loaded.weeks.map(item => item.value)).toEqual([
      { v: 1, week: '2027-01-04', focus: ['', '', ''], note: 'Synthetic next week', obsidian: null },
      stored(MARKER),
    ]);
    await store.remove({ clientId: first.clientId, revision: first.revision, week: WEEK });
    expect(fake.rows.map(item => (decode(item.ciphertext_b64) as WeeklyReview).week)).toEqual(['2027-01-04']);
  });

  it('keeps an unreadable row and a lower revision, and edits only the highest', async () => {
    fake.rows = [
      row(stored('older'), { client_id: 'rev_StoreSpecClientId0001', revision: 1 }),
      row(stored('newer'), { client_id: 'rev_StoreSpecClientId0002', revision: 4 }),
      row({ secret: MARKER }, { client_id: 'rev_StoreSpecClientId0003', schema_version: 1 }),
      row('not-json', { client_id: 'rev_StoreSpecClientId0004', ciphertext_b64: 'opaque' }),
    ];
    const loaded = await store.load();
    expect(loaded).toEqual({
      state: 'ready',
      weeks: [jasmine.objectContaining({ clientId: 'rev_StoreSpecClientId0002', revision: 4 })],
      unreadable: 2,
    });
    expect(fake.rows).toHaveSize(4);
    expect(JSON.stringify(loaded)).not.toContain(MARKER);
    const draft = emptyDraft();
    draft.note = 'edited';
    const saved = await store.save(WEEK, draft, { clientId: 'rev_StoreSpecClientId0002', revision: 4, keyVersion: 1 });
    expect(saved.revision).toBe(5);
    expect(fake.rows).toHaveSize(4);
    expect(fake.rows.find(item => item.client_id === 'rev_StoreSpecClientId0001')?.revision).toBe(1);
  });

  it('refetches a conflict without requiring the caller to replace the draft', async () => {
    fake.rows = [row(stored('Kept baseline'))];
    const loaded = await store.load();
    if (loaded.state !== 'ready') throw new Error('expected a week');
    const entry = loaded.weeks[0];
    fake.rows[0].revision = 3;
    fake.rows[0].ciphertext_b64 = encode(stored(OTHER));
    const draft = emptyDraft();
    draft.note = MARKER;
    await expectAsync(store.save(WEEK, draft, entry)).toBeRejectedWithError(REVIEW_CONFLICT_MESSAGE);
    expect(store.weeksSnapshot[0].revision).toBe(3);
    expect(store.weeksSnapshot[0].value.note).toBe(OTHER);
    expect(decode(fake.rows[0].ciphertext_b64)).toEqual(stored(OTHER));
  });

  it('keeps the draft out of the vault when a save is rejected or fails', async () => {
    const empty = emptyDraft();
    await expectAsync(store.save(WEEK, empty, { clientId: null, revision: null, keyVersion: 1 }))
      .toBeRejectedWithError(ReviewRejectedError);
    expect(fake.upserted).toEqual([]);
    fake.failUpsert = 503;
    const draft = emptyDraft();
    draft.note = MARKER;
    await expectAsync(store.save(WEEK, draft, { clientId: null, revision: null, keyVersion: 1 })).toBeRejected();
    expect(fake.rows).toEqual([]);
    expect(store.weeksSnapshot).toEqual([]);
  });

  it('does not publish a held save after lock or an owner change', async () => {
    const draft = emptyDraft();
    draft.note = MARKER;
    fake.holdUpsert = true;
    const pending = store.save(WEEK, draft, { clientId: null, revision: null, keyVersion: 1 });
    await until(() => fake.upsertRelease.length === 1);
    const locking = lockFinance(TestBed.inject(Injector)).catch(() => undefined);
    expect(store.weeksSnapshot).toEqual([]);
    fake.upsertRelease.shift()?.();
    await expectAsync(pending).toBeRejected();
    await locking;
    expect(fake.upsertCancelled).toBe(1);
    expect(fake.rows).toEqual([]);
    expect(JSON.stringify(store.weeksSnapshot)).not.toContain(MARKER);

    unlock();
    fake.holdUpsert = true;
    const again = store.save(WEEK, draft, { clientId: null, revision: null, keyVersion: 1 });
    await until(() => fake.upsertRelease.length === 1);
    localStorage.removeItem('finance-dek');
    session.become(8);
    unlock();
    fake.upsertRelease.shift()?.();
    await expectAsync(again).toBeRejected();
    expect(fake.rows).toEqual([]);
    expect(JSON.stringify(store.weeksSnapshot)).not.toContain(MARKER);
  });
});
