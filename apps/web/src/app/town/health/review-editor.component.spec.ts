import { HttpErrorResponse } from '@angular/common/http';
import { Injector } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { BehaviorSubject, Observable, Subject, of } from 'rxjs';
import {
  lockFinance,
  type VaultRecordCapability,
  type VaultRecordEnvelope,
  type VaultRecordUpsert,
} from '../../../../../finance/frontend/src/public-api';
import { SessionService } from '../../platform/session.service';
import { WeeklyReviewComponent, REVIEW_TODAY, REVIEW_VAULT_EXISTS } from './review-editor.component';
import { REVIEW_CONFLICT_MESSAGE, ReviewStoreService } from './review-store.service';
import { TOWN_REVIEWS_COLLECTION } from './health-store.service';
import { type WeeklyReview } from './review';

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

class FakeVault implements VaultRecordCapability {
  rows: VaultRecordEnvelope[] = [];
  listed: string[] = [];
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
const gate = { exists: true as boolean | null };

function unlock(): void {
  localStorage.setItem('finance-dek', 'present');
}

async function settle(fixture: ComponentFixture<unknown>): Promise<void> {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    fixture.detectChanges();
    await Promise.resolve();
  }
  await fixture.whenStable();
  fixture.detectChanges();
}

async function until(fixture: ComponentFixture<unknown>, ready: () => boolean): Promise<void> {
  for (let attempt = 0; attempt < 50 && !ready(); attempt += 1) {
    fixture.detectChanges();
    await Promise.resolve();
  }
  if (!ready()) throw new Error('timed out waiting for the review editor');
}

async function show(url = `/town/review?week=${WEEK}`): Promise<{ harness: RouterTestingHarness; el: HTMLElement }> {
  const harness = await RouterTestingHarness.create();
  await harness.navigateByUrl(url);
  await settle(harness.fixture);
  const el = harness.routeNativeElement;
  if (!(el instanceof HTMLElement)) throw new Error('missing review editor');
  return { harness, el };
}

function field(el: HTMLElement, selector: string): HTMLInputElement | HTMLTextAreaElement {
  const input = el.querySelector(selector);
  if (!(input instanceof HTMLInputElement || input instanceof HTMLTextAreaElement)) throw new Error(selector);
  return input;
}

function typeInto(el: HTMLElement, selector: string, value: string, fixture: ComponentFixture<unknown>): void {
  const input = field(el, selector);
  input.value = value;
  input.dispatchEvent(new Event('input', { bubbles: true }));
  fixture.detectChanges();
}

function clickNamed(el: HTMLElement, name: string, fixture: ComponentFixture<unknown>): void {
  const button = [...el.querySelectorAll('button')].find(item => item.textContent?.includes(name));
  if (!(button instanceof HTMLButtonElement)) throw new Error(`missing ${name}`);
  button.click();
  fixture.detectChanges();
}

describe('Weekly review editor', () => {
  beforeEach(() => {
    fake = new FakeVault();
    session = new SessionDouble();
    gate.exists = true;
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          { path: 'town/review', component: WeeklyReviewComponent },
          { path: 'town/hall', children: [] },
        ]),
        { provide: ReviewStoreService, useClass: TestStore },
        { provide: SessionService, useValue: session as unknown as SessionService },
        { provide: REVIEW_TODAY, useValue: () => '2027-01-03' },
        { provide: REVIEW_VAULT_EXISTS, useValue: () => Promise.resolve(gate.exists) },
      ],
    });
  });

  afterEach(() => {
    TestBed.resetTestingModule();
    localStorage.clear();
  });

  it('writes the Monday into a locked return link and shows no note fields', async () => {
    fake.rows = [{
      collection: TOWN_REVIEWS_COLLECTION,
      client_id: 'rev_EditorSpecClient00001',
      ciphertext_b64: encode(stored(MARKER)),
      schema_version: 2,
      key_version: 1,
      revision: 1,
      updated_at: '2026-12-28T00:00:00Z',
    }];
    const { el } = await show('/town/review');
    expect(el.getAttribute('data-review-state')).toBe('locked');
    expect(TestBed.inject(Router).url).toContain(`week=${WEEK}`);
    expect(el.querySelectorAll('[data-review-marker]')).toHaveSize(0);
    expect(el.textContent).not.toContain(MARKER);
    expect(el.textContent).toContain('Finance is locked. The review stays encrypted.');
    const unlock = el.querySelector('a[href*="/finance/vault/unlock"]');
    if (!(unlock instanceof HTMLAnchorElement)) throw new Error('missing unlock');
    const next = new URL(unlock.href, 'http://localhost').searchParams.get('next');
    expect(next).toBe(`/town/review?week=${WEEK}`);
    expect(fake.listed).toEqual([]);
  });

  it('prompts on Sunday, saves the exact schema, and blocks a dirty week change', async () => {
    unlock();
    const { harness, el } = await show();
    const fixture = harness.fixture;
    expect(el.getAttribute('data-review-state')).toBe('ready');
    expect(el.textContent).toContain('This week ends today. Saving is optional and does not change Town.');
    expect(el.querySelectorAll('[data-review-marker]')).toHaveSize(5);
    typeInto(el, '#review-focus-1', 'Synthetic focus', fixture);
    typeInto(el, '#review-note', MARKER, fixture);
    typeInto(el, '#review-obsidian', 'https://example.com/synthetic-review', fixture);
    expect(el.querySelector('a.reference')?.textContent).toBe('https://example.com/synthetic-review');
    expect(el.querySelector('a.reference')?.textContent).not.toContain(MARKER);
    clickNamed(el, 'Later', fixture);
    expect(el.textContent).toContain('Save or discard this week before opening another.');
    expect(TestBed.inject(Router).url).toContain(WEEK);
    clickNamed(el, 'Save', fixture);
    await settle(fixture);
    expect(decode(fake.rows[0].ciphertext_b64)).toEqual({
      v: 1,
      week: WEEK,
      focus: ['Synthetic focus', '', ''],
      note: MARKER,
      obsidian: 'https://example.com/synthetic-review',
    });
    expect(JSON.stringify(localStorage)).not.toContain(MARKER);
    clickNamed(el, 'Later', fixture);
    await settle(fixture);
    expect(TestBed.inject(Router).url).toContain('week=2027-01-04');
    expect(el.textContent).not.toContain('This week ends today.');
    expect(field(el, '#review-note').value).toBe('');
    typeInto(el, '#review-note', 'Synthetic next week', fixture);
    clickNamed(el, 'Save', fixture);
    await settle(fixture);
    const notes = fake.rows.map(item => (decode(item.ciphertext_b64) as WeeklyReview));
    expect(notes.map(item => item.week).sort()).toEqual(['2026-12-28', '2027-01-04']);
    clickNamed(el, '2026-12-28', fixture);
    await settle(fixture);
    expect(field(el, '#review-note').value).toBe(MARKER);
    clickNamed(el, 'Delete', fixture);
    const dialog = document.querySelector('[role="dialog"]');
    if (!(dialog instanceof HTMLElement)) throw new Error('missing delete dialog');
    expect(dialog.textContent).toContain('Delete this week');
    expect(dialog.textContent).not.toContain(MARKER);
    clickNamed(dialog, 'Delete', fixture);
    await settle(fixture);
    expect(fake.rows.map(item => (decode(item.ciphertext_b64) as WeeklyReview).week)).toEqual(['2027-01-04']);
    expect(field(el, '#review-note').value).toBe('');
  });

  it('keeps a same-session draft through conflict and an ordinary failure', async () => {
    unlock();
    fake.rows = [{
      collection: TOWN_REVIEWS_COLLECTION,
      client_id: 'rev_EditorSpecClient00001',
      ciphertext_b64: encode(stored('Kept baseline')),
      schema_version: 2,
      key_version: 1,
      revision: 1,
      updated_at: '2026-12-28T00:00:00Z',
    }];
    const { harness, el } = await show();
    const fixture = harness.fixture;
    expect(field(el, '#review-note').value).toBe('Kept baseline');
    typeInto(el, '#review-note', MARKER, fixture);
    fake.rows[0].revision = 2;
    fake.rows[0].ciphertext_b64 = encode(stored(OTHER));
    clickNamed(el, 'Save', fixture);
    await settle(fixture);
    expect(el.textContent).toContain(REVIEW_CONFLICT_MESSAGE);
    expect(field(el, '#review-note').value).toBe(MARKER);
    expect(el.textContent).not.toContain(OTHER);
    clickNamed(el, 'Discard changes', fixture);
    expect(field(el, '#review-note').value).toBe('Kept baseline');
    expect(el.textContent).not.toContain(OTHER);
    typeInto(el, '#review-note', MARKER, fixture);
    fake.failUpsert = 503;
    clickNamed(el, 'Save', fixture);
    await settle(fixture);
    expect(el.textContent).toContain('Could not save this week. Try again.');
    expect(field(el, '#review-note').value).toBe(MARKER);
    expect(decode(fake.rows[0].ciphertext_b64)).toEqual(stored(OTHER));
  });

  it('clears markers when a held save meets a lock or an owner change', async () => {
    unlock();
    const { harness, el } = await show();
    const fixture = harness.fixture;
    typeInto(el, '#review-note', MARKER, fixture);
    fake.holdUpsert = true;
    clickNamed(el, 'Save', fixture);
    await until(fixture, () => fake.upsertRelease.length === 1);
    const locking = lockFinance(TestBed.inject(Injector)).catch(() => undefined);
    await until(fixture, () => el.getAttribute('data-review-state') === 'locked');
    expect(el.querySelectorAll('[data-review-marker]')).toHaveSize(0);
    expect(el.textContent).not.toContain(MARKER);
    fake.upsertRelease.shift()?.();
    await settle(fixture);
    await locking;
    expect(fake.rows).toEqual([]);
    expect(el.textContent).not.toContain(MARKER);
    expect(JSON.stringify(localStorage)).not.toContain(MARKER);

    await harness.navigateByUrl('/town/hall');
    unlock();
    await harness.navigateByUrl(`/town/review?week=${WEEK}`);
    await settle(harness.fixture);
    const again = harness.routeNativeElement;
    if (!(again instanceof HTMLElement)) throw new Error('missing review editor');
    expect(again.getAttribute('data-review-state')).toBe('ready');
    typeInto(again, '#review-note', MARKER, harness.fixture);
    fake.holdUpsert = true;
    fake.upsertRelease.splice(0);
    clickNamed(again, 'Save', harness.fixture);
    await until(harness.fixture, () => fake.upsertRelease.length === 1);
    localStorage.removeItem('finance-dek');
    session.become(8);
    await until(harness.fixture, () => again.getAttribute('data-review-state') === 'locked');
    fake.upsertRelease.shift()?.();
    await settle(harness.fixture);
    expect(again.querySelectorAll('[data-review-marker]')).toHaveSize(0);
    expect(again.textContent).not.toContain(MARKER);
    expect(fake.rows).toEqual([]);
    expect(JSON.stringify(localStorage)).not.toContain(MARKER);

    await harness.navigateByUrl('/town/hall');
    unlock();
    await harness.navigateByUrl(`/town/review?week=${WEEK}`);
    await settle(harness.fixture);
    const leaving = harness.routeNativeElement;
    if (!(leaving instanceof HTMLElement)) throw new Error('missing review editor');
    expect(leaving.getAttribute('data-review-state')).toBe('ready');
    typeInto(leaving, '#review-note', MARKER, harness.fixture);
    fake.holdUpsert = true;
    fake.upsertRelease.splice(0);
    clickNamed(leaving, 'Save', harness.fixture);
    await until(harness.fixture, () => fake.upsertRelease.length === 1);
    await harness.navigateByUrl('/town/hall');
    await settle(harness.fixture);
    fake.upsertRelease.shift()?.();
    await settle(harness.fixture);
    expect(fake.rows).toEqual([]);
    expect(JSON.stringify(localStorage)).not.toContain(MARKER);
  });
});
