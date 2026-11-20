import { HttpErrorResponse } from '@angular/common/http';
import { Component, Injectable, Injector } from '@angular/core';
import { ComponentFixture, TestBed, fakeAsync, flushMicrotasks, tick } from '@angular/core/testing';
import { provideRouter, ActivatedRoute, convertToParamMap } from '@angular/router';
import { localTodayIso } from '@vivek/browser';
import { UiConfirmDialogComponent } from '@vivek/ui';
import { BehaviorSubject, Observable, Subject, of, throwError } from 'rxjs';
import {
  DEK_STORE,
  VAULT_PRESENCE,
  lockFinance,
  type VaultRecordCapability,
  type VaultRecordEnvelope,
} from '../../../../../finance/frontend/src/public-api';
import { SessionService } from '../../platform/session.service';
import { healthDeletePhrase } from './health-entry';
import { displayWeight, lbToKg } from './health-units';
import { HEALTH_VAULT_EXISTS, HealthRoomComponent } from './health-room.component';
import {
  HEALTH_CONFLICT_MESSAGE,
  HEALTH_LOAD_DEADLINE_MS,
  HealthStoreService,
} from './health-store.service';

const WEIGHT_ID = 'hlt_SyntheticWeightEntryAB';
const LIFT_ID = 'hlt_SyntheticLiftEntryABCD';
const CORRUPT_ID = 'hlt_CorruptRowNoticeABCDEF';
const MISSING_ID = 'hlt_MissingEntryNoticeABCD';
const DAY = '2026-10-28';

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

function row(
  collection: string,
  clientId: string,
  value: unknown,
  extra: Partial<VaultRecordEnvelope> = {},
): VaultRecordEnvelope {
  return {
    collection,
    client_id: clientId,
    ciphertext_b64: encode(value),
    schema_version: 2,
    key_version: 1,
    revision: 1,
    updated_at: '2026-10-28T00:00:00Z',
    ...extra,
  };
}

const WEIGHT = { v: 1, kind: 'weight', measured_on: DAY, logged_on: DAY, kg: 80 };
const LIFT = { v: 1, kind: 'lift', measured_on: DAY, logged_on: DAY, exercise: 'Squat', kg: 100, reps: 5 };
const CORRUPT = { v: 1, kind: 'weight', measured_on: DAY, logged_on: DAY, kg: 64.25 };

class FakeVault implements VaultRecordCapability {
  rows: VaultRecordEnvelope[] = [];
  listed: string[] = [];
  upserted: unknown[] = [];
  deleted: unknown[] = [];
  decryptCalls: string[] = [];
  encryptCalls: unknown[] = [];
  holdList = false;
  holdUpsert = false;
  holdDelete = false;
  failUpsert = false;
  failDelete = false;
  conflict = false;
  listCancelled = 0;
  upsertCancelled = 0;
  deleteCancelled = 0;
  readonly listRelease: Array<() => void> = [];
  readonly upsertRelease: Array<() => void> = [];
  readonly deleteRelease: Array<() => void> = [];

  listRecords(collection: string): Observable<VaultRecordEnvelope[]> {
    this.listed.push(collection);
    const rows = this.rows.filter(item => item.collection === collection);
    if (!this.holdList) return of(rows);
    return new Observable(subscriber => {
      this.listRelease.push(() => {
        if (subscriber.closed) return;
        subscriber.next(this.rows.filter(item => item.collection === collection));
        subscriber.complete();
      });
      return () => { this.listCancelled += 1; };
    });
  }

  async encryptPayload(value: unknown): Promise<string> {
    this.encryptCalls.push(value);
    return encode(value);
  }

  async decryptPayload<T>(ciphertextB64: string, _collection: string, clientId: string): Promise<T> {
    this.decryptCalls.push(clientId);
    if (!ciphertextB64.startsWith('ct:')) throw new Error('undecryptable');
    return decode(ciphertextB64) as T;
  }

  upsertRecords(records: readonly unknown[]): Observable<VaultRecordEnvelope[]> {
    if (this.failUpsert) return throwError(() => new Error('save failed'));
    if (this.conflict) return throwError(() => new HttpErrorResponse({ status: 409 }));
    const run = (): VaultRecordEnvelope[] => {
      this.upserted.push(records);
      return records.map(record => {
        const item = record as {
          collection: string;
          client_id: string;
          ciphertext_b64: string;
          schema_version: number;
          key_version: number;
          expected_revision: number | null;
        };
        const index = this.rows.findIndex(existing => existing.collection === item.collection && existing.client_id === item.client_id);
        const previous = index >= 0 ? this.rows[index] : undefined;
        if ((previous?.revision ?? null) !== item.expected_revision) throw new HttpErrorResponse({ status: 409 });
        const saved = row(item.collection, item.client_id, {}, {
          ciphertext_b64: item.ciphertext_b64,
          schema_version: item.schema_version,
          key_version: item.key_version,
          revision: (previous?.revision ?? 0) + 1,
        });
        if (index >= 0) this.rows[index] = saved;
        else this.rows.push(saved);
        return saved;
      });
    };
    if (!this.holdUpsert) {
      try {
        return of(run());
      } catch (error) {
        return throwError(() => error);
      }
    }
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
    if (this.failDelete) return throwError(() => new Error('delete failed'));
    const run = (): { deleted: number } => {
      for (const record of records) {
        const index = this.rows.findIndex(item => item.collection === record.collection && item.client_id === record.client_id);
        if (index < 0 || this.rows[index].revision !== record.expected_revision) {
          throw new HttpErrorResponse({ status: 409 });
        }
      }
      for (const record of records) {
        const index = this.rows.findIndex(item => item.collection === record.collection && item.client_id === record.client_id);
        this.rows.splice(index, 1);
      }
      this.deleted.push(records);
      return { deleted: records.length };
    };
    if (!this.holdDelete) {
      try {
        return of(run());
      } catch (error) {
        return throwError(() => error);
      }
    }
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

@Component({
  imports: [HealthRoomComponent, UiConfirmDialogComponent],
  template: '<app-health-room /><ui-confirm-dialog />',
})
class HealthRoomSpecHost {}

class SessionDouble {
  readonly users = new BehaviorSubject<{ id: number } | null>({ id: 7 });
  readonly cleared = new Subject<void>();
  readonly user$ = this.users.asObservable();
  readonly cleared$ = this.cleared.asObservable();
  get currentUser(): { id: number } | null { return this.users.value; }
}

class RouteDouble {
  readonly query = new BehaviorSubject(convertToParamMap({ entry: WEIGHT_ID }));
  readonly routeData = new BehaviorSubject<{ healthRoom: string }>({ healthRoom: 'clinic' });
  readonly queryParamMap = this.query.asObservable();
  readonly data = this.routeData.asObservable();
}

@Injectable()
class TestStore extends HealthStoreService {
  protected override vault(): Promise<VaultRecordCapability> {
    vaultCalls += 1;
    return Promise.resolve(fake);
  }
}

let fake: FakeVault;
let session: SessionDouble;
let route: RouteDouble;
let gate: { exists: boolean | null };
let vaultCalls = 0;

function clearStorage(): void {
  localStorage.removeItem(DEK_STORE);
  localStorage.removeItem(VAULT_PRESENCE);
  localStorage.removeItem('finance-vault-lock');
  for (const key of Object.keys(localStorage)) {
    if (key.startsWith('town.health.units.v1.')) localStorage.removeItem(key);
  }
}

function unlock(): void {
  localStorage.setItem(DEK_STORE, 'present');
}

function seed(): void {
  fake.rows = [
    row('health_stats', WEIGHT_ID, WEIGHT),
    row('health_stats', CORRUPT_ID, CORRUPT, { schema_version: 1, ciphertext_b64: 'garbage' }),
    row('health_prs', LIFT_ID, LIFT),
  ];
}

function button(el: HTMLElement, name: string): HTMLButtonElement {
  const found = [...el.querySelectorAll('button')].find(item => item.textContent?.includes(name));
  if (!(found instanceof HTMLButtonElement)) throw new Error(`missing ${name}`);
  return found;
}

function typeInto(el: HTMLElement, selector: string, value: string): HTMLInputElement {
  const input = el.querySelector<HTMLInputElement>(selector);
  if (!input) throw new Error(`missing ${selector}`);
  input.value = value;
  input.dispatchEvent(new Event('input', { bubbles: true }));
  return input;
}

function href(el: HTMLElement, label: string): string {
  const link = [...el.querySelectorAll('a')].find(item => item.textContent?.includes(label));
  if (!(link instanceof HTMLAnchorElement)) throw new Error(`missing ${label}`);
  return link.getAttribute('href') ?? '';
}

function visible(el: HTMLElement): string {
  const inputs = [...el.querySelectorAll('input, textarea')].map(item => (item as HTMLInputElement).value);
  return `${el.textContent ?? ''}\n${inputs.join('\n')}`;
}

async function until(ready: () => boolean): Promise<void> {
  for (let attempt = 0; attempt < 50 && !ready(); attempt += 1) await Promise.resolve();
  if (!ready()) throw new Error('timed out waiting for the health shell');
}

async function settle(fixture: { detectChanges(): void; whenStable(): Promise<unknown> }): Promise<void> {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    fixture.detectChanges();
    await Promise.resolve();
  }
  await fixture.whenStable();
  fixture.detectChanges();
}

async function show(): Promise<{ fixture: ComponentFixture<HealthRoomSpecHost>; el: HTMLElement }> {
  const fixture = TestBed.createComponent(HealthRoomSpecHost);
  await settle(fixture);
  const el = fixture.nativeElement.querySelector('app-health-room');
  if (!(el instanceof HTMLElement)) throw new Error('missing health room');
  return { fixture, el };
}

function clickConfirm(fixture: ComponentFixture<HealthRoomSpecHost>, phrase: string, label = 'Delete measurement'): void {
  const input = fixture.nativeElement.querySelector('#confirm-phrase-field');
  if (!(input instanceof HTMLInputElement)) throw new Error('missing confirmation phrase');
  input.value = phrase;
  input.dispatchEvent(new Event('input', { bubbles: true }));
  fixture.detectChanges();
  const confirm = [...fixture.nativeElement.querySelectorAll('button')].find(item => item.textContent?.includes(label));
  if (!(confirm instanceof HTMLButtonElement)) throw new Error(`missing ${label}`);
  confirm.click();
  fixture.detectChanges();
}

describe('Health room shell', () => {
  beforeEach(() => {
    clearStorage();
    fake = new FakeVault();
    session = new SessionDouble();
    route = new RouteDouble();
    gate = { exists: true };
    vaultCalls = 0;
    TestBed.configureTestingModule({
      imports: [HealthRoomComponent, HealthRoomSpecHost],
      providers: [
        provideRouter([]),
        { provide: ActivatedRoute, useValue: route },
        { provide: SessionService, useValue: session as unknown as SessionService },
        { provide: HealthStoreService, useClass: TestStore },
        { provide: HEALTH_VAULT_EXISTS, useValue: () => Promise.resolve(gate.exists) },
      ],
    });
  });

  afterEach(() => {
    TestBed.resetTestingModule();
    clearStorage();
  });

  it('keeps a locked deep link free of measurement digits and returns to it', async () => {
    seed();
    const { el } = await show();
    expect(el.getAttribute('data-health-state')).toBe('locked');
    expect(el.getAttribute('data-health-room')).toBe('clinic');
    expect(visible(el)).not.toMatch(/\d/);
    expect(el.querySelectorAll('input, textarea')).toHaveSize(0);
    expect(fake.listed).toEqual([]);
    expect(fake.decryptCalls).toEqual([]);
    const locked = new URL(href(el, 'Unlock'), 'http://localhost');
    expect(locked.pathname).toBe('/finance/vault/unlock');
    expect(locked.searchParams.get('next')).toBe(`/town/clinic?entry=${WEIGHT_ID}`);

    route.query.next(convertToParamMap({ entry: LIFT_ID }));
    route.routeData.next({ healthRoom: 'gym' });
    const fixture = TestBed.createComponent(HealthRoomComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const gym = fixture.nativeElement as HTMLElement;
    expect(gym.getAttribute('data-health-state')).toBe('locked');
    expect(visible(gym)).not.toMatch(/\d/);
    expect(visible(gym)).not.toContain('Squat');
    const setup = new URL(href(gym, 'Unlock'), 'http://localhost');
    expect(setup.searchParams.get('next')).toBe(`/town/gym?entry=${LIFT_ID}`);
  });

  it('links setup back to the same room when no vault exists', async () => {
    seed();
    gate.exists = false;
    const { el } = await show();
    expect(el.getAttribute('data-health-state')).toBe('setup');
    expect(visible(el)).not.toMatch(/\d/);
    expect(fake.decryptCalls).toEqual([]);
    const link = new URL(href(el, 'Set up Finance'), 'http://localhost');
    expect(link.pathname).toBe('/finance/vault/setup');
    expect(link.searchParams.get('next')).toBe(`/town/clinic?entry=${WEIGHT_ID}`);
  });

  it('retries an unavailable status without treating it as a new vault', async () => {
    seed();
    gate.exists = null;
    const first = await show();
    expect(first.el.getAttribute('data-health-state')).toBe('unavailable');
    expect(visible(first.el)).toContain('Clinic is unavailable right now.');
    expect(visible(first.el)).not.toMatch(/\d/);
    expect(fake.listed).toEqual([]);
    gate.exists = true;
    button(first.el, 'Retry').click();
    first.fixture.detectChanges();
    await first.fixture.whenStable();
    first.fixture.detectChanges();
    expect(first.el.getAttribute('data-health-state')).toBe('locked');
    expect(visible(first.el)).not.toMatch(/\d/);

    session.users.next(null);
    gate.exists = false;
    const second = await show();
    expect(second.el.getAttribute('data-health-state')).toBe('unavailable');
    expect(second.el.textContent).not.toContain('Set up Finance');
  });

  it('shows canonical units, the corrupt notice, and a missing entry without the id', async () => {
    unlock();
    seed();
    const { fixture, el } = await show();
    expect(el.getAttribute('data-health-state')).toBe('ready');
    expect(vaultCalls).toBe(1);
    expect(el.textContent).toContain('176.4 lb');
    expect(el.textContent).toContain('1 saved entry could not be read. It stays in the vault.');
    expect(el.textContent).not.toContain('64.25');
    expect(el.textContent).not.toContain('Squat');
    expect(fake.decryptCalls).not.toContain(CORRUPT_ID);
    expect(document.activeElement).toBe(el.querySelector(`#health-entry-${WEIGHT_ID}`));
    const savedKg = (fake.rows.find(item => item.client_id === WEIGHT_ID) as { ciphertext_b64: string }).ciphertext_b64;
    const upserts = fake.upserted.length;
    button(el, 'Kilograms').click();
    fixture.detectChanges();
    expect(el.textContent).toContain('80.0 kg');
    expect(el.textContent).not.toContain('176.4');
    expect(fake.upserted).toHaveSize(upserts);
    expect((fake.rows.find(item => item.client_id === WEIGHT_ID) as { ciphertext_b64: string }).ciphertext_b64).toBe(savedKg);
    expect(JSON.parse(atob(savedKg.slice(3))).kg).toBe(80);

    route.query.next(convertToParamMap({ entry: MISSING_ID }));
    fixture.detectChanges();
    expect(el.textContent).toContain('That entry is not in this room.');
    expect(el.textContent).not.toContain(MISSING_ID);
  });

  it('focuses the invalid weight and keeps the same-session draft', async () => {
    unlock();
    seed();
    const { fixture, el } = await show();
    button(el, 'Add weight').click();
    fixture.detectChanges();
    const today = localTodayIso();
    typeInto(el, '#health-measured-on', today);
    typeInto(el, '#health-weight', '1');
    fixture.detectChanges();
    button(el, 'Save').click();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const weight = el.querySelector<HTMLInputElement>('#health-weight');
    expect(weight).withContext('draft field').not.toBeNull();
    expect(document.activeElement).toBe(weight);
    expect(weight?.value).toBe('1');
    expect(weight?.getAttribute('aria-invalid')).toBe('true');
    expect(weight?.getAttribute('aria-describedby')).toBe('health-weight-error');
    expect(el.textContent).toContain('That value is outside the allowed range.');
    expect(fake.upserted).toEqual([]);
    expect(fake.encryptCalls).toEqual([]);

    button(el, 'Cancel').click();
    fixture.detectChanges();
    expect(el.querySelector('#health-weight')).toBeNull();
    button(el, 'Add weight').click();
    fixture.detectChanges();
    await fixture.whenStable();
    expect(el.querySelector<HTMLInputElement>('#health-weight')?.value).toBe('1');
    expect(el.querySelector<HTMLInputElement>('#health-measured-on')?.value).toBe(today);
  });

  it('keeps a recoverable draft when a save fails or conflicts', async () => {
    unlock();
    seed();
    const { fixture, el } = await show();
    const today = localTodayIso();
    button(el, 'Add weight').click();
    fixture.detectChanges();
    typeInto(el, '#health-measured-on', today);
    typeInto(el, '#health-weight', '200');
    fixture.detectChanges();
    fake.failUpsert = true;
    button(el, 'Save').click();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(el.textContent).toContain('Could not save this entry. Try again.');
    expect(el.querySelector<HTMLInputElement>('#health-weight')?.value).toBe('200');
    expect(fake.upserted).toEqual([]);
    expect(el.textContent).toContain('176.4 lb');

    fake.failUpsert = false;
    fake.conflict = true;
    button(el, 'Save').click();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(el.textContent).toContain(HEALTH_CONFLICT_MESSAGE);
    expect(el.querySelector<HTMLInputElement>('#health-weight')?.value).toBe('200');
    expect(el.getAttribute('data-health-state')).toBe('ready');
  });

  it('stores a canonical kilogram weight and clears the draft after success', async () => {
    unlock();
    seed();
    const { fixture, el } = await show();
    button(el, 'Add weight').click();
    fixture.detectChanges();
    typeInto(el, '#health-measured-on', localTodayIso());
    typeInto(el, '#health-weight', '200');
    fixture.detectChanges();
    button(el, 'Save').click();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const stored = lbToKg(200);
    expect(fake.encryptCalls).toEqual([jasmine.objectContaining({ kind: 'weight', kg: stored, logged_on: localTodayIso() })]);
    expect(el.textContent).toContain(`${displayWeight(stored, 'lb')} lb`);
    expect(el.querySelector('#health-weight')).toBeNull();
    expect(stored).not.toBe(200);
  });

  it('shows the gym lift from the same store and focuses a blank exercise first', async () => {
    unlock();
    seed();
    route.routeData.next({ healthRoom: 'gym' });
    route.query.next(convertToParamMap({ entry: LIFT_ID }));
    const { fixture, el } = await show();
    expect(el.getAttribute('data-health-room')).toBe('gym');
    expect(el.textContent).toContain('220.5 lb');
    expect(el.textContent).toContain('Squat');
    expect(el.textContent).not.toContain('176.4');
    expect(el.textContent).not.toContain('64.25');
    expect(document.activeElement).toBe(el.querySelector(`#health-entry-${LIFT_ID}`));
    button(el, 'Add lift').click();
    fixture.detectChanges();
    typeInto(el, '#health-measured-on', localTodayIso());
    typeInto(el, '#health-weight', '1');
    fixture.detectChanges();
    button(el, 'Save').click();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(document.activeElement).toBe(el.querySelector('#health-exercise'));
    expect(el.querySelector<HTMLInputElement>('#health-weight')?.value).toBe('1');
    expect(fake.encryptCalls).toEqual([]);
  });

  it('clears a draft when the room changes and shows that room only', async () => {
    unlock();
    seed();
    const { fixture, el } = await show();
    button(el, 'Add weight').click();
    fixture.detectChanges();
    typeInto(el, '#health-weight', '155.5');
    fixture.detectChanges();
    const calls = vaultCalls;
    route.routeData.next({ healthRoom: 'gym' });
    route.query.next(convertToParamMap({ entry: LIFT_ID }));
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(vaultCalls).toBe(calls);
    expect(fake.upserted).toEqual([]);
    expect(el.textContent).toContain('Squat');
    expect(el.textContent).toContain('220.5 lb');
    expect(el.textContent).not.toContain('176.4');
    expect(visible(el)).not.toContain('155.5');
    expect(el.querySelector('#health-weight')).toBeNull();
  });

  it('drops a draft and the previous measurement when the owner changes', async () => {
    unlock();
    seed();
    const { fixture, el } = await show();
    button(el, 'Add weight').click();
    fixture.detectChanges();
    typeInto(el, '#health-weight', '155.5');
    fixture.detectChanges();
    fake.holdList = true;
    fake.rows = [row('health_stats', WEIGHT_ID, { ...WEIGHT, kg: 70 })];
    session.users.next({ id: 8 });
    fixture.detectChanges();
    await until(() => el.getAttribute('data-health-state') === 'loading' && fake.listRelease.length >= 2);
    expect(visible(el)).not.toContain('176.4');
    expect(visible(el)).not.toContain('155.5');
    expect(visible(el)).not.toContain('64.25');
    fake.listRelease.splice(0).forEach(release => release());
    await settle(fixture);
    expect(el.getAttribute('data-health-state')).toBe('ready');
    expect(el.textContent).toContain(`${displayWeight(70, 'lb')} lb`);
    expect(el.textContent).not.toContain('176.4');
    expect(visible(el)).not.toContain('155.5');
  });

  it('clears a draft when the session is cleared and reloads the current vault', async () => {
    unlock();
    seed();
    const { fixture, el } = await show();
    button(el, 'Add weight').click();
    fixture.detectChanges();
    typeInto(el, '#health-weight', '155.5');
    fixture.detectChanges();
    session.cleared.next();
    await settle(fixture);
    expect(el.getAttribute('data-health-state')).toBe('ready');
    expect(el.textContent).toContain('176.4 lb');
    expect(visible(el)).not.toContain('155.5');
    expect(el.querySelector('#health-weight')).toBeNull();
  });

  it('ignores a load that loses the eight-second deadline', fakeAsync(() => {
    expect(HEALTH_LOAD_DEADLINE_MS).toBe(8000);
    unlock();
    seed();
    fake.holdList = true;
    const fixture = TestBed.createComponent(HealthRoomComponent);
    fixture.detectChanges();
    for (let attempt = 0; attempt < 30 && fake.listed.length < 2; attempt += 1) flushMicrotasks();
    expect(fake.listed).toEqual(['health_stats', 'health_prs']);
    const el = fixture.nativeElement as HTMLElement;
    tick(HEALTH_LOAD_DEADLINE_MS - 1);
    flushMicrotasks();
    fixture.detectChanges();
    expect(el.getAttribute('data-health-state')).toBe('loading');
    expect(visible(el)).not.toContain('176.4');
    expect(visible(el)).not.toContain('64.25');
    tick(1);
    flushMicrotasks();
    fixture.detectChanges();
    expect(el.getAttribute('data-health-state')).toBe('unavailable');
    expect(fake.listCancelled).toBeGreaterThan(0);
    fake.listRelease.splice(0).forEach(release => release());
    flushMicrotasks();
    fixture.detectChanges();
    expect(el.getAttribute('data-health-state')).toBe('unavailable');
    expect(visible(el)).not.toContain('176.4');
    expect(visible(el)).not.toContain('64.25');
    expect(visible(el)).not.toContain('Squat');

    fake.holdList = false;
    button(el, 'Retry').click();
    for (let attempt = 0; attempt < 30; attempt += 1) flushMicrotasks();
    fixture.detectChanges();
    expect(el.getAttribute('data-health-state')).toBe('ready');
    expect(el.textContent).toContain('176.4 lb');
    expect(el.textContent).toContain('1 saved entry could not be read. It stays in the vault.');
    expect(el.textContent).not.toContain('64.25');
    tick();
  }));

  it('ignores a save that loses to a lock', async () => {
    unlock();
    seed();
    const { fixture, el } = await show();
    button(el, 'Add weight').click();
    fixture.detectChanges();
    typeInto(el, '#health-measured-on', localTodayIso());
    typeInto(el, '#health-weight', '155.5');
    fixture.detectChanges();
    fake.holdUpsert = true;
    button(el, 'Save').click();
    fixture.detectChanges();
    await until(() => fake.upsertRelease.length === 1);
    const locking = lockFinance(TestBed.inject(Injector));
    for (let attempt = 0; attempt < 50; attempt += 1) {
      fixture.detectChanges();
      if (fake.upsertCancelled > 0 && el.getAttribute('data-health-state') === 'locked') break;
      await Promise.resolve();
    }
    expect(fake.upsertCancelled).toBeGreaterThan(0);
    fake.upsertRelease.shift()?.();
    await locking.catch(() => undefined);
    fixture.detectChanges();
    expect(el.getAttribute('data-health-state')).toBe('locked');
    expect(visible(el)).not.toContain('155.5');
    expect(visible(el)).not.toContain('176.4');
    expect(visible(el)).not.toContain('64.25');
    expect(visible(el)).not.toContain('Squat');
    expect(fake.upserted).toEqual([]);
  });

  it('drops a late load after the room is gone', async () => {
    unlock();
    seed();
    fake.holdList = true;
    const fixture = TestBed.createComponent(HealthRoomComponent);
    fixture.detectChanges();
    await until(() => fake.listRelease.length >= 2);
    const el = fixture.nativeElement as HTMLElement;
    expect(el.getAttribute('data-health-state')).toBe('loading');
    const before = el.textContent;
    fixture.destroy();
    fake.listRelease.splice(0).forEach(release => release());
    await until(() => fake.listRelease.length === 0);
    expect(el.textContent).toBe(before);
    expect(visible(el)).not.toContain('176.4');
    expect(visible(el)).not.toContain('64.25');
  });

  it('edits each vital in both weight units without rewriting an unchanged record', async () => {
    unlock();
    seed();
    const { fixture, el } = await show();
    const seedRow = () => fake.rows.find(item => item.client_id === WEIGHT_ID);
    const before = seedRow()?.ciphertext_b64;
    const today = localTodayIso();
    button(el, 'Edit').click();
    fixture.detectChanges();
    expect(el.textContent).toContain('Edit weight');
    expect(el.querySelector('#health-logged-on')?.textContent).toContain(DAY);
    expect(el.querySelector<HTMLInputElement>('#health-weight')?.value).toBe('176.4');
    button(el, 'Save').click();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fake.encryptCalls).toEqual([]);
    expect(fake.upserted).toEqual([]);
    expect(seedRow()?.ciphertext_b64).toBe(before);
    expect(seedRow()?.revision).toBe(1);

    button(el, 'Edit').click();
    fixture.detectChanges();
    typeInto(el, '#health-measured-on', today);
    fixture.detectChanges();
    button(el, 'Save').click();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fake.encryptCalls).toEqual([jasmine.objectContaining({
      kind: 'weight', kg: 80, measured_on: today, logged_on: DAY,
    })]);
    const update = fake.upserted.at(-1) as Array<{ expected_revision: number }>;
    expect(update[0].expected_revision).toBe(1);
    expect(seedRow()?.revision).toBe(2);
    expect(JSON.parse(atob(String(seedRow()?.ciphertext_b64).slice(3))).kg).toBe(80);
    button(el, 'Edit').click();
    fixture.detectChanges();
    expect(el.querySelector('#health-logged-on')?.textContent).toContain(DAY);
    expect(el.querySelector<HTMLInputElement>('#health-measured-on')?.value).toBe(today);
    button(el, 'Cancel').click();
    fixture.detectChanges();

    button(el, 'Kilograms').click();
    fixture.detectChanges();
    expect(el.textContent).toContain(`Weight · 80.0 kg · ${today}`);
    expect(seedRow()?.revision).toBe(2);
    button(el, 'Edit').click();
    fixture.detectChanges();
    expect(el.querySelector<HTMLInputElement>('#health-weight')?.value).toBe('80.0');
    typeInto(el, '#health-weight', '70');
    fixture.detectChanges();
    button(el, 'Save').click();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fake.encryptCalls.at(-1)).toEqual(jasmine.objectContaining({ kind: 'weight', kg: 70, logged_on: DAY }));
    expect((fake.upserted.at(-1) as Array<{ expected_revision: number }>)[0].expected_revision).toBe(2);
    expect(el.textContent).toContain(`Weight · 70.0 kg · ${today}`);

    button(el, 'Add resting heart rate').click();
    fixture.detectChanges();
    typeInto(el, '#health-measured-on', today);
    typeInto(el, '#health-bpm', '24');
    fixture.detectChanges();
    button(el, 'Save').click();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(document.activeElement).toBe(el.querySelector('#health-bpm'));
    expect(el.textContent).toContain('That value is outside the allowed range.');
    typeInto(el, '#health-bpm', '62');
    fixture.detectChanges();
    button(el, 'Save').click();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(el.textContent).toContain(`Resting heart rate · 62 bpm · ${today}`);

    button(el, 'Add blood pressure').click();
    fixture.detectChanges();
    typeInto(el, '#health-measured-on', today);
    typeInto(el, '#health-systolic', '90');
    typeInto(el, '#health-diastolic', '90');
    fixture.detectChanges();
    button(el, 'Save').click();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(document.activeElement).toBe(el.querySelector('#health-systolic'));
    expect(el.textContent).toContain('Systolic must be higher than diastolic.');
    typeInto(el, '#health-systolic', '118');
    typeInto(el, '#health-diastolic', '76');
    fixture.detectChanges();
    button(el, 'Save').click();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(el.textContent).toContain(`Blood pressure · 118/76 · ${today}`);

    button(el, 'Add sleep').click();
    fixture.detectChanges();
    typeInto(el, '#health-measured-on', today);
    typeInto(el, '#health-sleep', '7.3');
    fixture.detectChanges();
    button(el, 'Save').click();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(document.activeElement).toBe(el.querySelector('#health-sleep'));
    expect(el.textContent).toContain('Use a quarter-hour step.');
    typeInto(el, '#health-sleep', '7.25');
    fixture.detectChanges();
    button(el, 'Save').click();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(el.textContent).toContain(`Sleep · 7.25 h · ${today}`);
    expect(JSON.parse(atob(String(seedRow()?.ciphertext_b64).slice(3))).kg).toBe(70);
  });

  it('keeps the draft and the previous record when an edit conflicts or fails', async () => {
    unlock();
    seed();
    const { fixture, el } = await show();
    const today = localTodayIso();
    button(el, 'Edit').click();
    fixture.detectChanges();
    typeInto(el, '#health-weight', '150');
    fixture.detectChanges();
    fake.failUpsert = true;
    button(el, 'Save').click();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    await Promise.resolve();
    expect(el.textContent).toContain('Could not save this entry. Try again.');
    expect(el.querySelector<HTMLInputElement>('#health-weight')?.value).toBe('150');
    expect(document.activeElement).toBe(el.querySelector('#health-form-error'));
    expect(el.textContent).toContain('176.4 lb');
    expect(fake.rows.find(item => item.client_id === WEIGHT_ID)?.revision).toBe(1);

    fake.failUpsert = false;
    fake.conflict = true;
    button(el, 'Save').click();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    await Promise.resolve();
    expect(el.textContent).toContain(HEALTH_CONFLICT_MESSAGE);
    expect(el.querySelector<HTMLInputElement>('#health-weight')?.value).toBe('150');
    expect(document.activeElement).toBe(el.querySelector('#health-form-error'));
    expect(el.textContent).toContain('176.4 lb');
    expect(JSON.parse(atob(String(fake.rows.find(item => item.client_id === WEIGHT_ID)?.ciphertext_b64).slice(3))).kg).toBe(80);
    expect(today).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('requires the exact phrase and retries a delete with the current revision', async () => {
    unlock();
    seed();
    const { fixture, el } = await show();
    const remove = el.querySelector<HTMLButtonElement>(`#health-delete-${WEIGHT_ID} button`);
    if (!remove) throw new Error('missing delete');
    remove.click();
    fixture.detectChanges();
    await fixture.whenStable();
    await Promise.resolve();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain(healthDeletePhrase('weight'));
    expect(fixture.nativeElement.textContent).toContain(`measured on ${DAY}`);
    clickConfirm(fixture, 'delete weight');
    await fixture.whenStable();
    fixture.detectChanges();
    expect(el.textContent).toContain('176.4 lb');
    expect(fake.deleted).toEqual([]);

    const kept = [...fixture.nativeElement.querySelectorAll('button')].find(item => item.textContent?.includes('Keep measurement'));
    if (!(kept instanceof HTMLButtonElement)) throw new Error('missing keep');
    kept.click();
    fixture.detectChanges();
    await Promise.resolve();
    expect(fixture.nativeElement.querySelector('#confirm-phrase-field')).toBeNull();
    expect(el.textContent).toContain('176.4 lb');

    remove.click();
    fixture.detectChanges();
    await fixture.whenStable();
    const weight = fake.rows.find(item => item.client_id === WEIGHT_ID);
    if (!weight) throw new Error('missing weight row');
    weight.revision = 9;
    clickConfirm(fixture, healthDeletePhrase('weight'));
    await fixture.whenStable();
    fixture.detectChanges();
    await Promise.resolve();
    expect(el.textContent).toContain('176.4 lb');
    expect(fixture.nativeElement.textContent).toContain('Could not delete this entry. It is still saved. Try again.');
    expect(document.activeElement).toBe(fixture.nativeElement.querySelector('#confirm-phrase-field'));

    clickConfirm(fixture, healthDeletePhrase('weight'));
    await fixture.whenStable();
    fixture.detectChanges();
    expect(el.textContent).not.toContain('176.4 lb');
    expect(fake.deleted).toHaveSize(1);
    const deleted = fake.deleted[0] as Array<{ client_id: string; expected_revision: number }>;
    expect(deleted[0]).toEqual(jasmine.objectContaining({ client_id: WEIGHT_ID, expected_revision: 9 }));
    fixture.detectChanges();
    await new Promise(resolve => setTimeout(resolve));
    expect(document.activeElement).toBe(el.querySelector('#health-add-weight button'));
  });

  it('keeps a newer draft when a late save succeeds and drops it when the owner changes', async () => {
    unlock();
    seed();
    const { fixture, el } = await show();
    button(el, 'Add weight').click();
    fixture.detectChanges();
    typeInto(el, '#health-measured-on', localTodayIso());
    typeInto(el, '#health-weight', '200');
    fixture.detectChanges();
    fake.holdUpsert = true;
    button(el, 'Save').click();
    fixture.detectChanges();
    await until(() => fake.upsertRelease.length === 1);
    typeInto(el, '#health-weight', '210');
    fixture.detectChanges();
    fake.upsertRelease.shift()?.();
    await settle(fixture);
    expect(el.textContent).toContain(`${displayWeight(lbToKg(200), 'lb')} lb`);
    expect(el.querySelector<HTMLInputElement>('#health-weight')?.value).toBe('210');
    expect(fake.encryptCalls).toEqual([jasmine.objectContaining({ kg: lbToKg(200) })]);

    fake.holdUpsert = false;
    fake.holdList = true;
    fake.rows = [row('health_stats', WEIGHT_ID, { ...WEIGHT, kg: 70 })];
    session.users.next({ id: 8 });
    fixture.detectChanges();
    await until(() => el.getAttribute('data-health-state') === 'loading');
    expect(visible(el)).not.toContain('210');
    expect(visible(el)).not.toContain('176.4');
    fake.listRelease.splice(0).forEach(release => release());
    await settle(fixture);
    expect(el.textContent).toContain(`${displayWeight(70, 'lb')} lb`);
    expect(visible(el)).not.toContain('210');
  });

  it('ignores a delete that loses to a lock', async () => {
    unlock();
    seed();
    const { fixture, el } = await show();
    const remove = el.querySelector<HTMLButtonElement>(`#health-delete-${WEIGHT_ID} button`);
    if (!remove) throw new Error('missing delete');
    remove.click();
    fixture.detectChanges();
    await fixture.whenStable();
    fake.holdDelete = true;
    clickConfirm(fixture, healthDeletePhrase('weight'));
    await until(() => fake.deleteRelease.length === 1);
    const locking = lockFinance(TestBed.inject(Injector));
    for (let attempt = 0; attempt < 50; attempt += 1) {
      fixture.detectChanges();
      if (fake.deleteCancelled > 0 && el.getAttribute('data-health-state') === 'locked') break;
      await Promise.resolve();
    }
    expect(fake.deleteCancelled).toBeGreaterThan(0);
    fake.deleteRelease.shift()?.();
    await locking.catch(() => undefined);
    fixture.detectChanges();
    expect(el.getAttribute('data-health-state')).toBe('locked');
    expect(visible(el)).not.toContain('176.4');
    expect(visible(el)).not.toMatch(/\d/);
    expect(fake.deleted).toEqual([]);
    expect(fake.rows.some(item => item.client_id === WEIGHT_ID)).toBeTrue();
  });

  it('groups below, in, above, and no-range labs and edits a checkup on the same dialog', async () => {
    unlock();
    seed();
    const belowId = 'hlt_SyntheticLabBelowRange';
    const inId = 'hlt_SyntheticLabInRangeABC';
    const aboveId = 'hlt_SyntheticLabAboveRange';
    const noneId = 'hlt_SyntheticLabNoRangeABC';
    const checkupId = 'hlt_SyntheticCheckupEntryAB';
    const lab = (name: string, value: number, refs: { ref_low?: number; ref_high?: number } = {}) => ({
      v: 1, kind: 'lab' as const, measured_on: DAY, logged_on: DAY, lab: { name, value, unit: 'u', ...refs },
    });
    fake.rows.push(
      row('health_stats', belowId, lab('Ω-marker', 9, { ref_low: 10, ref_high: 20 })),
      row('health_stats', inId, lab('Ω-marker', 15, { ref_low: 10, ref_high: 20 })),
      row('health_stats', aboveId, lab('Ω-marker', 21, { ref_low: 10, ref_high: 20 })),
      row('health_stats', noneId, lab('Ω-other', 4)),
      row('health_stats', checkupId, { v: 1, kind: 'checkup', measured_on: DAY, logged_on: DAY, note: 'Synthetic visit note' }),
    );
    const { fixture, el } = await show();
    expect(el.querySelector('#health-group-measurements')).not.toBeNull();
    expect(el.querySelector('#health-group-labs')).not.toBeNull();
    expect(el.querySelector('#health-group-checkups')).not.toBeNull();
    const folders = [...el.querySelectorAll('h3.lab-folder')];
    const marker = folders.find(node => node.textContent === 'Ω-marker');
    const other = folders.find(node => node.textContent === 'Ω-other');
    expect(marker?.textContent).toBe('Ω-marker');
    expect(other?.textContent).toBe('Ω-other');
    expect(marker?.closest('.lab-block')?.querySelectorAll('[data-health-kind="lab"]').length).toBe(3);
    expect(other?.closest('.lab-block')?.querySelectorAll('[data-health-kind="lab"]').length).toBe(1);
    expect(marker?.closest('.lab-block')?.querySelector('[data-health-sparkline="lab"]')?.textContent).toContain('below range');
    expect(marker?.closest('.lab-block')?.querySelector('[data-health-sparkline="lab"]')?.textContent).toContain('in range');
    expect(marker?.closest('.lab-block')?.querySelector('[data-health-sparkline="lab"]')?.textContent).toContain('above range');
    expect(other?.closest('.lab-block')?.querySelector('[data-health-sparkline="lab"]')?.textContent).toContain('no range');
    expect(el.textContent).toContain(`Lab · Ω-marker · 9 u · below range · 10 to 20 u · ${DAY}`);
    expect(el.textContent).toContain(`Lab · Ω-marker · 15 u · in range · 10 to 20 u · ${DAY}`);
    expect(el.textContent).toContain(`Lab · Ω-marker · 21 u · above range · 10 to 20 u · ${DAY}`);
    expect(el.textContent).toContain(`Lab · Ω-other · 4 u · no range · ${DAY}`);
    expect(el.textContent).toContain(`Checkup · Synthetic visit note · ${DAY}`);
    expect(el.querySelector(`#health-edit-${belowId}`)).not.toBeNull();
    expect(el.querySelector(`#health-delete-${checkupId}`)).not.toBeNull();
    expect(el.textContent).not.toContain('medical');

    const edit = el.querySelector<HTMLButtonElement>(`#health-edit-${noneId} button`);
    if (!edit) throw new Error('missing lab edit');
    edit.click();
    fixture.detectChanges();
    expect(el.querySelector('#health-entry-title')?.textContent).toBe('Edit lab result');
    expect(el.querySelector<HTMLInputElement>('#health-lab-name')?.value).toBe('Ω-other');
    expect(el.querySelector<HTMLInputElement>('#health-lab-value')?.value).toBe('4');
    expect(el.querySelector<HTMLInputElement>('#health-lab-unit')?.value).toBe('u');
    expect(el.querySelector<HTMLInputElement>('#health-lab-ref-low')?.value).toBe('');
    typeInto(el, '#health-lab-ref-low', '20');
    typeInto(el, '#health-lab-ref-high', '10');
    fixture.detectChanges();
    button(el, 'Save').click();
    fixture.detectChanges();
    await fixture.whenStable();
    expect(document.activeElement).toBe(el.querySelector('#health-lab-ref-high'));
    expect(el.textContent).toContain('The high end of the range must be above the low end.');
    expect(fake.encryptCalls.some(item => JSON.stringify(item).includes('Ω-other'))).toBeFalse();

    typeInto(el, '#health-lab-ref-low', '');
    typeInto(el, '#health-lab-ref-high', '');
    fixture.detectChanges();
    fake.failUpsert = true;
    typeInto(el, '#health-lab-name', 'Ω-held');
    button(el, 'Save').click();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(el.textContent).toContain('Could not save this entry. Try again.');
    expect(el.querySelector<HTMLInputElement>('#health-lab-name')?.value).toBe('Ω-held');
    expect(el.textContent).toContain(`Lab · Ω-other · 4 u · no range · ${DAY}`);
    expect(fake.rows.find(item => item.client_id === noneId)?.revision).toBe(1);

    fake.failUpsert = false;
    typeInto(el, '#health-lab-name', 'Ω-other');
    typeInto(el, '#health-lab-value', '5');
    button(el, 'Save').click();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(el.querySelector('#health-lab-name')).toBeNull();
    expect(el.textContent).toContain(`Lab · Ω-other · 5 u · no range · ${DAY}`);
    const savedLab = fake.encryptCalls.at(-1) as { lab?: { name?: string; value?: number; unit?: string; ref_low?: number } };
    expect(savedLab.lab).toEqual({ name: 'Ω-other', value: 5, unit: 'u' });
    const stored = decode(String(fake.rows.find(item => item.client_id === noneId)?.ciphertext_b64)) as { lab?: { name?: string } };
    expect(stored.lab?.name).toBe('Ω-other');
    expect(JSON.stringify(stored)).not.toContain('Ω-held');

    button(el, 'Add checkup').click();
    fixture.detectChanges();
    expect(el.querySelector('#health-entry-title')?.textContent).toBe('Add checkup');
    typeInto(el, '#health-measured-on', DAY);
    typeInto(el, '#health-checkup-note', 'Second synthetic note');
    fixture.detectChanges();
    button(el, 'Save').click();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(el.textContent).toContain(`Checkup · Second synthetic note · ${DAY}`);
    expect(fake.encryptCalls.at(-1)).toEqual(jasmine.objectContaining({
      kind: 'checkup', note: 'Second synthetic note', measured_on: DAY, logged_on: localTodayIso(),
    }));

    const remove = el.querySelector<HTMLButtonElement>(`#health-delete-${checkupId} button`);
    if (!remove) throw new Error('missing checkup delete');
    remove.click();
    fixture.detectChanges();
    await fixture.whenStable();
    expect(fixture.nativeElement.textContent).toContain('DELETE CHECKUP');
    clickConfirm(fixture, 'DELETE CHECKUP', 'Delete checkup');
    await fixture.whenStable();
    fixture.detectChanges();
    expect(el.textContent).not.toContain('Synthetic visit note');
    expect(el.textContent).toContain('Second synthetic note');
    await new Promise(resolve => setTimeout(resolve));
    expect(document.activeElement).toBe(el.querySelector('#health-add-checkup button'));
  });

  it('clears a lab draft on owner change and ignores the losing save', async () => {
    unlock();
    seed();
    const { fixture, el } = await show();
    const store = TestBed.inject(HealthStoreService);
    button(el, 'Add lab result').click();
    fixture.detectChanges();
    typeInto(el, '#health-measured-on', DAY);
    typeInto(el, '#health-lab-name', 'Ω-marker');
    typeInto(el, '#health-lab-value', '9');
    typeInto(el, '#health-lab-unit', 'u');
    typeInto(el, '#health-lab-ref-low', '10');
    typeInto(el, '#health-lab-ref-high', '20');
    fixture.detectChanges();
    fake.holdUpsert = true;
    button(el, 'Save').click();
    fixture.detectChanges();
    await until(() => fake.upsertRelease.length === 1);
    typeInto(el, '#health-lab-name', 'Ω-held');
    fixture.detectChanges();
    expect(visible(el)).toContain('Ω-held');

    fake.holdList = true;
    fake.rows = [row('health_stats', WEIGHT_ID, { ...WEIGHT, kg: 70 })];
    session.users.next({ id: 8 });
    fixture.detectChanges();
    await until(() => el.getAttribute('data-health-state') === 'loading');
    expect(visible(el)).not.toContain('Ω-marker');
    expect(visible(el)).not.toContain('Ω-held');
    fake.upsertRelease.shift()?.();
    await Promise.resolve();
    fixture.detectChanges();
    expect(store.statsSnapshot.some(item => JSON.stringify(item.value).includes('Ω-'))).toBeFalse();
    expect(fake.upsertCancelled).toBeGreaterThan(0);
    fake.listRelease.splice(0).forEach(release => release());
    await settle(fixture);
    expect(el.getAttribute('data-health-state')).toBe('ready');
    expect(el.textContent).toContain(`${displayWeight(70, 'lb')} lb`);
    expect(visible(el)).not.toContain('Ω-marker');
    expect(visible(el)).not.toContain('Ω-held');
    expect(el.querySelector('#health-lab-name')).toBeNull();
  });

  it('pages every Clinic kind, keeps sparkline text, and does not rewrite stored rows', async () => {
    unlock();
    route.query.next(convertToParamMap({}));
    const count = 101;
    const stats: VaultRecordEnvelope[] = [
      row('health_stats', CORRUPT_ID, CORRUPT, { schema_version: 1, ciphertext_b64: 'garbage' }),
    ];
    for (let index = 0; index < count; index += 1) {
      const measured = historyDay(index);
      stats.push(
        row('health_stats', historyId('W', index), { v: 1, kind: 'weight', measured_on: measured, logged_on: measured, kg: 40 + index }),
        row('health_stats', historyId('R', index), { v: 1, kind: 'rhr', measured_on: measured, logged_on: measured, bpm: 30 + index }),
        row('health_stats', historyId('B', index), { v: 1, kind: 'bp', measured_on: measured, logged_on: measured, sys: 80 + index, dia: 50 }),
        row('health_stats', historyId('S', index), { v: 1, kind: 'sleep', measured_on: measured, logged_on: measured, hours: (index % 8) + 1 }),
        row('health_stats', historyId('L', index), {
          v: 1, kind: 'lab', measured_on: measured, logged_on: measured,
          lab: { name: 'Ω-series', value: index + 1, unit: 'u', ref_low: 40, ref_high: 60 },
        }),
        row('health_stats', historyId('C', index), { v: 1, kind: 'checkup', measured_on: measured, logged_on: measured, note: `Note ${index}` }),
      );
    }
    const marked = historyDay(400);
    stats.push(
      row('health_stats', 'hlt_SyntheticLabBelowRange', { v: 1, kind: 'lab', measured_on: marked, logged_on: marked, lab: { name: 'Ω-marker', value: 9, unit: 'u', ref_low: 10, ref_high: 20 } }),
      row('health_stats', 'hlt_SyntheticLabInRangeABC', { v: 1, kind: 'lab', measured_on: marked, logged_on: marked, lab: { name: 'Ω-marker', value: 15, unit: 'u', ref_low: 10, ref_high: 20 } }),
      row('health_stats', 'hlt_SyntheticLabAboveRange', { v: 1, kind: 'lab', measured_on: marked, logged_on: marked, lab: { name: 'Ω-marker', value: 21, unit: 'u', ref_low: 10, ref_high: 20 } }),
      row('health_stats', 'hlt_SyntheticLabNoRangeABC', { v: 1, kind: 'lab', measured_on: marked, logged_on: marked, lab: { name: 'Ω-other', value: 4, unit: 'u' } }),
    );
    fake.rows = stats;
    const { fixture, el } = await show();
    const newest = historyDay(count - 1);
    const weightSpark = el.querySelector('[data-health-sparkline="weight"]');
    const weightLine = weightSpark?.querySelector('polyline')?.getAttribute('points');
    expect(el.textContent).toContain('1 saved entry could not be read. It stays in the vault.');
    expect(el.textContent).not.toContain('64.25');
    expect(el.querySelector('[data-health-latest="weight"]')?.textContent).toBe(`Latest · Weight · ${displayWeight(140, 'lb')} lb · ${newest}`);
    expect(weightSpark?.querySelectorAll('li').length).toBe(12);
    expect(weightSpark?.textContent).toContain(`Weight · ${displayWeight(140, 'lb')} lb · ${newest}`);
    expect(weightSpark?.textContent).toContain(historyDay(89));
    expect(weightSpark?.textContent).not.toContain(historyDay(88));
    expect(el.querySelector('[data-health-series="weight"]')?.getAttribute('data-health-shown')).toBe('100');
    expect(el.querySelector('[data-health-series="weight"]')?.getAttribute('data-health-total')).toBe('101');
    expect(el.querySelector(`#health-entry-${historyId('W', 0)}`)).toBeNull();
    expect(el.querySelector('[data-health-sparkline="bp"]')?.querySelectorAll('polyline').length).toBe(2);
    expect(el.querySelector('[data-health-sparkline="checkup"] polyline')).toBeNull();
    expect(el.querySelector('[data-health-sparkline="checkup"]')?.textContent).toContain(`Checkup · Note ${count - 1} · ${newest}`);
    const marker = [...el.querySelectorAll('h3.lab-folder')].find(node => node.textContent === 'Ω-marker');
    expect(marker?.closest('.lab-block')?.querySelector('[data-health-sparkline="lab"]')?.textContent).toContain('below range');
    expect(marker?.closest('.lab-block')?.querySelector('[data-health-sparkline="lab"]')?.textContent).toContain('in range');
    expect(marker?.closest('.lab-block')?.querySelector('[data-health-sparkline="lab"]')?.textContent).toContain('above range');
    expect(el.querySelector('[data-health-series="lab"]')?.getAttribute('data-health-total')).toBe('105');
    expect(el.textContent).not.toContain('medical');

    const listed = fake.listed.length;
    const newestStored = storedRow(historyId('W', count - 1));
    const oldestStored = storedRow(historyId('W', 0));
    const more = el.querySelector<HTMLButtonElement>('#health-more-weight button');
    if (!more) throw new Error('missing show more');
    expect(more.getBoundingClientRect().height).toBeGreaterThanOrEqual(44);
    more.click();
    fixture.detectChanges();
    expect(fake.listed.length).toBe(listed);
    expect(el.querySelector(`#health-entry-${historyId('W', 0)}`)).not.toBeNull();
    expect(el.querySelector(`#health-entry-${historyId('W', count - 1)}`)).not.toBeNull();
    expect(document.activeElement).toBe(el.querySelector(`#health-entry-${historyId('W', 0)}`));
    expect(el.querySelector('#health-more-weight')).toBeNull();
    expect(storedRow(historyId('W', 0))).toEqual(oldestStored);
    expect(storedRow(historyId('W', count - 1))).toEqual(newestStored);

    button(el, 'Kilograms').click();
    fixture.detectChanges();
    expect(el.querySelector('[data-health-latest="weight"]')?.textContent).toContain('140.0 kg');
    expect(el.querySelector('[data-health-sparkline="weight"] polyline')?.getAttribute('points')).toBe(weightLine);
    expect(storedRow(historyId('W', count - 1))).toEqual(newestStored);
    expect((decode(newestStored.ciphertext) as { kg?: number }).kg).toBe(140);
    button(el, 'Pounds').click();
    fixture.detectChanges();
    const pounds = el.querySelector('[data-health-sparkline="weight"]')?.textContent;
    document.documentElement.setAttribute('data-theme', 'dark');
    fixture.detectChanges();
    expect(el.querySelector('[data-health-sparkline="weight"]')?.textContent).toBe(pounds);
    expect(storedRow(historyId('W', count - 1))).toEqual(newestStored);
    document.documentElement.removeAttribute('data-theme');

    const oldestLab = storedRow(historyId('L', 0));
    for (const [kind, mark] of [['rhr', 'R'], ['bp', 'B'], ['sleep', 'S'], ['lab', 'L'], ['checkup', 'C']] as const) {
      const control = el.querySelector<HTMLButtonElement>(`#health-more-${kind} button`);
      if (!control) throw new Error(`missing show more ${kind}`);
      control.click();
      fixture.detectChanges();
      expect(el.querySelector(`#health-entry-${historyId(mark, 0)}`)).not.toBeNull();
      expect(el.querySelector(`#health-entry-${historyId(mark, count - 1)}`)).not.toBeNull();
    }
    expect(storedRow(historyId('L', 0))).toEqual(oldestLab);
    expect(oldestLab.revision).toBe(1);
  });

  it('keeps expanded history and a draft when saving fails, then drops both if a late response loses', async () => {
    unlock();
    route.query.next(convertToParamMap({}));
    const stats = [row('health_stats', CORRUPT_ID, CORRUPT, { schema_version: 1, ciphertext_b64: 'garbage' })];
    for (let index = 0; index < 101; index += 1) {
      const measured = historyDay(index);
      stats.push(row('health_stats', historyId('W', index), {
        v: 1, kind: 'weight', measured_on: measured, logged_on: measured, kg: 40 + index,
      }));
    }
    fake.rows = stats;
    const { fixture, el } = await show();
    const store = TestBed.inject(HealthStoreService);
    button(el, 'Show more weight').click();
    fixture.detectChanges();
    expect(el.textContent).toContain(historyDay(0));
    button(el, 'Add weight').click();
    fixture.detectChanges();
    typeInto(el, '#health-measured-on', DAY);
    typeInto(el, '#health-weight', '155.5');
    fixture.detectChanges();
    fake.failUpsert = true;
    button(el, 'Save').click();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(el.querySelector<HTMLInputElement>('#health-weight')?.value).toBe('155.5');
    expect(el.textContent).toContain('Could not save this entry. Try again.');
    expect(el.textContent).toContain(historyDay(0));
    expect(el.textContent).toContain(displayWeight(140, 'lb'));
    expect(storedRow(historyId('W', 100)).revision).toBe(1);

    fake.failUpsert = false;
    fake.holdUpsert = true;
    typeInto(el, '#health-weight', '160');
    button(el, 'Save').click();
    fixture.detectChanges();
    await until(() => fake.upsertRelease.length === 1);
    fake.holdList = true;
    fake.rows = [row('health_stats', WEIGHT_ID, { ...WEIGHT, kg: 70 })];
    session.users.next({ id: 8 });
    fixture.detectChanges();
    await until(() => el.getAttribute('data-health-state') === 'loading');
    expect(visible(el)).not.toContain('155.5');
    expect(visible(el)).not.toContain('160');
    expect(visible(el)).not.toContain(historyDay(0));
    fake.upsertRelease.shift()?.();
    await Promise.resolve();
    fixture.detectChanges();
    expect(store.statsSnapshot.some(item => item.value.kind === 'weight' && item.value.kg === 160)).toBeFalse();
    fake.listRelease.splice(0).forEach(release => release());
    await settle(fixture);
    expect(el.getAttribute('data-health-state')).toBe('ready');
    expect(el.textContent).toContain(`${displayWeight(70, 'lb')} lb`);
    expect(visible(el)).not.toContain(historyDay(0));
    expect(visible(el)).not.toContain('160');
    expect(el.querySelector('#health-weight')).toBeNull();
    expect(el.querySelector('#health-more-weight')).toBeNull();
  });
});

function historyId(mark: string, index: number): string {
  return `hlt_${mark}${String(index).padStart(21, '0')}`;
}

function historyDay(index: number): string {
  return new Date(Date.UTC(2024, 0, 1 + index)).toISOString().slice(0, 10);
}

function storedRow(clientId: string): { ciphertext: string; revision: number } {
  const item = fake.rows.find(row => row.client_id === clientId);
  if (!item) throw new Error(`missing ${clientId}`);
  return { ciphertext: item.ciphertext_b64, revision: item.revision };
}


