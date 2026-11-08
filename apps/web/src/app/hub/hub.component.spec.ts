import { ChangeDetectorRef } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter, Router } from '@angular/router';
import { BehaviorSubject, from, of, throwError } from 'rxjs';
import { SessionService as AuthService } from '../platform/session.service';
import { AuthUser } from '../platform/auth/auth.models';
import { DEK_STORE, LOCK_SIGNAL, VAULT_PRESENCE } from '../../../../finance/frontend/src/testing';
import { VaultService } from '../../../../finance/frontend/src/testing';
import { Asset, Holding, Liability } from '../../../../finance/frontend/src/testing';
import { FinanceService } from '../../../../finance/frontend/src/testing';
import { loadMarketRefreshCoordinatorService, type BudgetKeptDaysResult } from '../../../../finance/frontend/src/public-api';
import { todayIsoDate } from '@vivek/browser';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ThemeService } from '@vivek/ui';
import { PIXELS_FINANCE_DAYS, PixelsDataService } from '../pixels/pixels-data.service';
import { HubComponent } from './hub.component';
import { hubStripWindow } from './pixels-hub-card';

function person(id: number, name = 'Ada'): AuthUser {
  return {
    id,
    email: `${name.toLowerCase()}@pending.local`,
    username: name.toLowerCase(),
    display_name: name,
    role: 'user',
    is_active: true,
    must_change_password: false,
    created_at: '2026-10-14T00:00:00',
    updated_at: '2026-10-14T00:00:00',
  };
}

function trip(title: string) {
  return {
    id: 7,
    title,
    destination: title,
    start_date: '2026-11-02',
    end_date: '2026-11-06',
    phase: 'upcoming',
    days_until: 4,
    next_action: 'Open the trip',
    href: '/travel/#/trips/7',
  };
}

function townBody() {
  return {
    name: 'Terraria-on-Sea',
    founded_on: '2026-09-30',
    level: 3,
    xp: 260,
    level_xp_start: 250,
    next_level_xp: 500,
    today_done: 1,
    today_total: 2,
    longest_streak: 3,
    longest_streak_unit: 'days',
  };
}

function mediaBody() {
  return {
    currently: [{ id: 3, kind: 'tv', title: 'The Wire', progress_label: 'S1 E2' }],
    recent_reviews: [],
    upcoming: [{ id: 9, kind: 'movie', title: 'Later', when: 'upcoming', precision: 'day', release_on: '2026-12-02' }],
    next_episodes: [{ entry_id: 3, show_title: 'The Wire', season: 1, episode: 3 }],
  };
}

interface PendingCall {
  url: string;
  resolve: (value: Response) => void;
}

describe('HubComponent', () => {
  let fixture: ComponentFixture<HubComponent>;
  let users: BehaviorSubject<AuthUser | null>;
  let auth: {
    user$: BehaviorSubject<AuthUser | null>;
    readonly currentUser: AuthUser | null;
    logout: jasmine.Spy;
    updateDisplayName: jasmine.Spy;
  };
  let vaultReads: number;
  let vaultUnlocked: boolean;
  let vaultLocks: number;
  let financeCalls: number;
  let financeError: unknown;
  let assets$: BehaviorSubject<Asset[]>;
  let liabilities$: BehaviorSubject<Liability[]>;
  let holdings$: BehaviorSubject<Holding[]>;
  const pending: PendingCall[] = [];
  let holdFinance: Promise<void> | null = null;
  let releaseFinance: () => void = () => undefined;
  let financeDays: BudgetKeptDaysResult;

  function json(status: number, body: unknown): Response {
    return {
      ok: status >= 200 && status < 300,
      status,
      json: () => Promise.resolve(body),
    } as Response;
  }

  function takeCall(urlPart: string): PendingCall {
    const index = pending.findIndex(call => call.url.includes(urlPart));
    if (index < 0) throw new Error(`missing fetch ${urlPart}; have ${pending.map(call => call.url).join(', ')}`);
    return pending.splice(index, 1)[0];
  }

  function resolveTown(body: unknown = townBody()): void {
    takeCall('/api/town').resolve(json(200, body));
  }

  function pixelsBody(days: Array<{ date: string; town?: number; media?: number; trip?: number }> = [], profile?: unknown) {
    const window = hubStripWindow(todayIsoDate());
    return {
      from: window.start,
      to: window.end,
      days,
      sources: { town: 'ok', media: 'ok', travel: 'ok' },
      first_activity_on: null,
      ...(profile === undefined ? {} : { profile }),
    };
  }

  function flushPixels(body: unknown = pixelsBody(), status = 200): void {
    const req = TestBed.inject(HttpTestingController).expectOne(request => request.url === '/api/pixels');
    expect(req.request.params.has('profile')).withContext(req.request.urlWithParams).toBeFalse();
    expect(req.request.params.get('profile')).toBeNull();
    const window = hubStripWindow(todayIsoDate());
    expect(req.request.params.get('from')).toBe(window.start);
    expect(req.request.params.get('to')).toBe(window.end);
    const payload = (body ?? {}) as Record<string, unknown>;
    if (status === 200) req.flush(payload);
    else req.flush(payload, { status, statusText: status === 401 ? 'Expired' : 'Unavailable' });
  }

  async function render(body?: unknown): Promise<void> {
    fixture = TestBed.createComponent(HubComponent);
    fixture.detectChanges();
    flushPixels(body);
    await Promise.resolve();
  }

  async function paint(): Promise<void> {
    await fixture.whenStable();
    await new Promise(resolve => setTimeout(resolve, 0));
    await fixture.whenStable();
    fixture.detectChanges();
  }

  beforeEach(async () => {
    pending.length = 0;
    vaultReads = 0;
    vaultUnlocked = false;
    vaultLocks = 0;
    financeCalls = 0;
    financeError = null;
    financeDays = { status: 'locked' };
    localStorage.removeItem(DEK_STORE);
    users = new BehaviorSubject<AuthUser | null>(person(1));
    holdFinance = null;
    auth = {
      user$: users,
      get currentUser() { return users.value; },
      logout: jasmine.createSpy('logout'),
      updateDisplayName: jasmine.createSpy('updateDisplayName').and.resolveTo(person(1)),
    };
    assets$ = new BehaviorSubject<Asset[]>([]);
    liabilities$ = new BehaviorSubject<Liability[]>([]);
    holdings$ = new BehaviorSubject<Holding[]>([]);
    spyOn(window, 'fetch').and.callFake((input: RequestInfo | URL) => new Promise<Response>(resolve => {
      pending.push({ url: String(input), resolve });
    }));
    const MarketRefreshCoordinatorService = await loadMarketRefreshCoordinatorService();
    await TestBed.configureTestingModule({
      imports: [HubComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: PIXELS_FINANCE_DAYS, useValue: () => Promise.resolve(financeDays) },
        provideRouter([]),
        { provide: AuthService, useValue: auth },
        {
          provide: ThemeService,
          useValue: { current: 'system', choice$: new BehaviorSubject('system'), set: jasmine.createSpy('set') },
        },
        {
          provide: VaultService,
          useValue: {
            whenReady: () => {
              vaultReads += 1;
              return Promise.resolve();
            },
            get isUnlocked() {
              vaultReads += 1;
              return vaultUnlocked;
            },
            lock: () => {
              vaultLocks += 1;
              vaultUnlocked = false;
            },
          },
        },
        {
          provide: FinanceService,
          useValue: {
            loadDashboard: () => {
              financeCalls += 1;
              if (financeError) return throwError(() => financeError);
              if (holdFinance) return from(holdFinance.then(() => null));
              return of(null);
            },
            clearSessionState: () => {
              assets$.next([]);
              liabilities$.next([]);
              holdings$.next([]);
            },
            assets$,
            liabilities$,
            holdings$,
          },
        },
        {
          provide: MarketRefreshCoordinatorService,
          useValue: { broadcastLock: () => undefined, endSession: () => undefined },
        },
      ],
    }).compileComponents();
  });

  afterEach(() => {
    TestBed.inject(HttpTestingController).verify();
    localStorage.removeItem(DEK_STORE);
    localStorage.removeItem(VAULT_PRESENCE);
  });

  it('sends the account query to settings', async () => {
    const query = new BehaviorSubject(convertToParamMap({}));
    TestBed.overrideProvider(ActivatedRoute, {useValue: {queryParamMap: query}});
    const navigate = spyOn(TestBed.inject(Router), 'navigateByUrl').and.resolveTo(true);
    await render();
    expect(navigate).not.toHaveBeenCalled();
    takeCall('/travel/').resolve(json(200, {next_trip: null}));
    takeCall('/media/').resolve(json(200, {currently: [], recent_reviews: [], upcoming: [], next_episodes: []}));
    resolveTown();
    query.next(convertToParamMap({settings: 'account'}));
    expect(navigate).toHaveBeenCalledWith('/settings/account', { replaceUrl: true });
  });

  it('recovers one failed summary without loading the vault or signing out', async () => {
    await render();
    expect(pending.map(call => call.url.split('?')[0]).sort()).toEqual(['/api/town/summary', '/media/api/summary', '/travel/api/summary']);
    takeCall('/travel/').resolve(json(503, {}));
    takeCall('/media/').resolve(json(200, mediaBody()));
    resolveTown();
    await paint();

    const text = (fixture.nativeElement.textContent as string).replaceAll('\u2060', '');
    expect(text).toContain("Couldn't load trips.");
    expect(text).toContain('The Wire');
    expect(text).toContain('Series');
    expect(text).toContain('Finance is locked. Unlock to see net worth.');
    expect(text).not.toMatch(/\$\d/);
    expect(text).toContain('Open Travel');
    expect(text).toContain('Open Media');
    expect(text).toContain('Open Finance');
    expect(vaultReads).toBe(0);
    expect(financeCalls).toBe(0);
    expect(auth.logout).not.toHaveBeenCalled();

    fixture.nativeElement.querySelector('section[aria-labelledby="travel-heading"] button').click();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('section[aria-labelledby="travel-heading"]')?.getAttribute('aria-busy')).toBe('true');
    takeCall('/travel/').resolve(json(200, { next_trip: trip('Lisbon') }));
    await paint();
    expect(fixture.nativeElement.textContent).toContain('Lisbon');
    expect(fixture.nativeElement.textContent).toContain('The Wire');
    expect(auth.logout).not.toHaveBeenCalled();
  });

  it('keeps the other cards when a session rejection is not a sign-out', async () => {
    await render();
    takeCall('/travel/').resolve(json(401, { detail: 'expired' }));
    takeCall('/media/').resolve(json(200, mediaBody()));
    resolveTown();
    await paint();
    const text = (fixture.nativeElement.textContent as string).replaceAll('\u2060', '');
    expect(text).toContain('Your session ended. Sign in again to see trips.');
    expect(text).toContain('The Wire');
    expect(auth.logout).not.toHaveBeenCalled();
    expect(fixture.nativeElement.querySelector('[role="menu"]')).toBeNull();
  });

  it('keeps a stale snapshot when a retry fails and clears it on sign-out', async () => {
    await render();
    takeCall('/travel/').resolve(json(200, { next_trip: trip('Lisbon') }));
    takeCall('/media/').resolve(json(200, { currently: [], recent_reviews: [], upcoming: [], next_episodes: [] }));
    resolveTown();
    await paint();
    expect(fixture.nativeElement.textContent).toContain('Lisbon');

    fixture.componentInstance.retryTravel();
    fixture.detectChanges();
    takeCall('/travel/').resolve(json(503, {}));
    await paint();
    expect(fixture.nativeElement.textContent).toContain('Lisbon');
    expect(fixture.nativeElement.textContent).toContain('Updated');

    users.next(null);
    await paint();
    expect(fixture.nativeElement.textContent).not.toContain('Lisbon');
    expect(auth.logout).not.toHaveBeenCalled();
  });

  it('ignores a late summary from the previous user', async () => {
    await render();
    const firstTravel = takeCall('/travel/');
    const firstMedia = takeCall('/media/');
    const firstTown = takeCall('/api/town');
    users.next(person(2, 'Bea'));
    flushPixels();
    await Promise.resolve();
    firstTravel.resolve(json(200, { next_trip: trip('Secret') }));
    firstMedia.resolve(json(200, mediaBody()));
    firstTown.resolve(json(200, { ...townBody(), level: 99, xp: 9999 }));
    resolveTown();
    await paint();
    expect(fixture.nativeElement.textContent).not.toContain('Secret');
    expect(fixture.nativeElement.textContent).not.toContain('Lv 99');

    takeCall('/travel/').resolve(json(200, { next_trip: trip('Kyoto') }));
    takeCall('/media/').resolve(json(200, { currently: [], recent_reviews: [], upcoming: [], next_episodes: [] }));
    await paint();
    const text = (fixture.nativeElement.textContent as string).replaceAll('\u2060', '');
    expect(text).toContain('Kyoto');
    expect(text).toContain('Bea');
    expect(text).not.toContain('Secret');
    expect(text).not.toContain('The Wire');
  });

  it('reads finance only after the vault key is present and still shows travel when finance fails', async () => {
    localStorage.setItem(DEK_STORE, 'present');
    vaultUnlocked = true;
    financeError = new Error('finance down');
    await render();
    takeCall('/travel/').resolve(json(200, { next_trip: trip('Lisbon') }));
    takeCall('/media/').resolve(json(503, {}));
    resolveTown();
    await paint();
    const text = (fixture.nativeElement.textContent as string).replaceAll('\u2060', '');
    expect(text).toContain('Lisbon');
    expect(text).toContain("Couldn't load in-progress items.");
    expect(text).toContain("Couldn't load net worth.");
    expect(vaultReads).toBeGreaterThan(0);
    expect(financeCalls).toBe(1);
    expect(auth.logout).not.toHaveBeenCalled();
    expect(text).toContain('Open Finance');
  });

  it('shows an unlocked finance snapshot without blocking an empty travel card', async () => {
    localStorage.setItem(DEK_STORE, 'present');
    vaultUnlocked = true;
    assets$.next([{ id: 1, name: 'House', category: 'property', current_value: 500, as_of_date: '2026-10-15' } as Asset]);
    liabilities$.next([{ id: 1, name: 'Card', category: 'credit', balance_owed: 25, as_of_date: '2026-10-15' } as Liability]);
    await render();
    takeCall('/travel/').resolve(json(200, { next_trip: null }));
    takeCall('/media/').resolve(json(200, mediaBody()));
    resolveTown();
    await paint();
    const text = (fixture.nativeElement.textContent as string).replaceAll('\u2060', '');
    expect(text).toContain('No trips yet');
    expect(text).toContain('The Wire');
    expect(text).toMatch(/\$475/);
    expect(text).not.toContain('Finance is locked');
  });

  it('shows an empty finance card instead of $0.00 when the vault has no records', async () => {
    localStorage.setItem(DEK_STORE, 'present');
    vaultUnlocked = true;
    await render();
    takeCall('/travel/').resolve(json(200, { next_trip: null }));
    takeCall('/media/').resolve(json(200, { currently: [], recent_reviews: [], upcoming: [], next_episodes: [] }));
    resolveTown();
    await paint();
    const text = (fixture.nativeElement.textContent as string).replaceAll('\u2060', '');
    expect(text).toContain('No accounts yet');
    expect(text).toContain('Add an account');
    expect(text).not.toContain('$0.00');
    expect(text).not.toContain('Finance is locked');
  });

  it('keeps a zero-balance account out of the empty state', async () => {
    localStorage.setItem(DEK_STORE, 'present');
    vaultUnlocked = true;
    assets$.next([{ id: 1, name: 'Cash', category: 'cash', current_value: 0, as_of_date: '2026-10-15' } as Asset]);
    await render();
    takeCall('/travel/').resolve(json(200, { next_trip: null }));
    takeCall('/media/').resolve(json(200, { currently: [], recent_reviews: [], upcoming: [], next_episodes: [] }));
    resolveTown();
    await paint();
    const text = (fixture.nativeElement.textContent as string).replaceAll('\u2060', '');
    expect(text).not.toContain('No accounts yet');
    expect(text).toMatch(/\$0/);
    expect(text).not.toContain('Finance is locked');
  });

  it('labels trips and dates and clears summaries on sign-out', async () => {
    await render();
    const component = fixture.componentInstance;
    expect(component.tripWhen({ ...trip('Now'), phase: 'in_progress', days_until: 0 })).toBe('Underway');
    expect(component.tripWhen({ ...trip('Now'), phase: 'upcoming', days_until: 0 })).toBe('Leaves today');
    expect(component.tripWhen({ ...trip('Now'), phase: 'upcoming', days_until: 1 })).toBe('Tomorrow');
    expect(component.tripPlace({ ...trip('Named'), destination: null })).toBe('Named');
    expect(component.formatDay(null)).toBe('No date');
    expect(component.formatDay('nope')).toBe('nope');
    expect(component.formatDay('2026-11-02')).toContain('2026');
    expect(component.formatRange('2026-12-12', '2026-12-15')).toBe('Dec 12\u2009\u2013\u200915, 2026');
    expect(component.mediaWhen({ id: 1, kind: 'book', title: 'Dune', when: 'unknown' })).toBe('No date');
    expect(component.mediaWhen({ id: 2, kind: 'movie', title: 'Later', when: 'upcoming', precision: 'day', release_on: '2026-12-02' })).toContain('2026');
    expect(component.kindLabel('album')).toBe('Album');
    users.next(null);
    expect(component.financeState).toBe('locked');
    takeCall('/travel/').resolve(json(200, { next_trip: null }));
    takeCall('/media/').resolve(json(200, { currently: [], recent_reviews: [], upcoming: [], next_episodes: [] }));
    resolveTown();
    await paint();
  });

  function postLock(userId: number, kind = 'lock'): BroadcastChannel {
    const channel = new BroadcastChannel('finance-vault-sync-v1');
    channel.postMessage({ version: 1, userId, kind });
    return channel;
  }

  async function waitForVaultLock(): Promise<void> {
    for (let i = 0; i < 20 && vaultLocks === 0; i++) {
      await new Promise(resolve => setTimeout(resolve, 20));
    }
  }

  async function showHarbor(): Promise<void> {
    localStorage.setItem(DEK_STORE, 'present');
    vaultUnlocked = true;
    assets$.next([{ id: 1, name: 'Harbor Checking', category: 'cash', current_value: 1500, as_of_date: '2026-10-01' } as Asset]);
    holdings$.next([{
      id: 10,
      symbol: 'HBRX',
      shares: 2,
      current_price: 25,
      account_display: 'Harbor Brokerage',
      lifecycle_status: 'active',
    } as Holding]);
    await render();
    takeCall('/travel/').resolve(json(200, { next_trip: null }));
    takeCall('/media/').resolve(json(200, { currently: [], recent_reviews: [], upcoming: [], next_episodes: [] }));
    resolveTown();
    await paint();
  }

  it('clears numbers when a later read finds the vault locked', async () => {
    await showHarbor();
    const text = (fixture.nativeElement.textContent as string).replaceAll('\u2060', '');
    expect(text).toMatch(/\$[\s]*\d/);
    expect(text).toContain('HBRX');
    vaultUnlocked = false;
    fixture.componentInstance.retryFinance();
    await paint();
    const locked = (fixture.nativeElement.textContent as string).replaceAll('\u2060', '');
    expect(locked).toContain('Finance is locked.');
    expect(locked).not.toMatch(/\$[\s]*\d/);
    expect(locked).not.toContain('HBRX');
    expect(locked).not.toContain('Harbor');
    expect(fixture.componentInstance.netWorth).toBeNull();
    expect(fixture.componentInstance.accounts).toEqual([]);
    expect(fixture.componentInstance.positions).toEqual([]);
  });

  it('clears a loaded card when another tab broadcasts a lock', async () => {
    await showHarbor();
    const user = fixture.componentInstance['auth'].currentUser;
    expect(fixture.componentInstance['isRemoteLock']({ version: 1, userId: 1, kind: 'lock' }))
      .withContext(`currentUser=${JSON.stringify(user)}`)
      .toBeTrue();
    const heard: unknown[] = [];
    const ear = new BroadcastChannel('finance-vault-sync-v1');
    ear.addEventListener('message', event => heard.push(event.data));
    const channel = postLock(1);
    for (let i = 0; i < 10 && fixture.componentInstance['financeGeneration'] === 0; i++) {
      await new Promise(resolve => setTimeout(resolve, 20));
      fixture.detectChanges();
    }
    channel.close();
    ear.close();
    expect(heard).withContext('side channel').not.toEqual([]);
    const text = (fixture.nativeElement.textContent as string).replaceAll('\u2060', '');
    expect(text).toContain('Finance is locked.');
    expect(text).not.toMatch(/\$[\s]*\d/);
    expect(text).not.toContain('HBRX');
    expect(text).not.toContain('Harbor');
    expect(fixture.componentInstance.netWorth).toBeNull();
    expect(fixture.componentInstance.accounts).toEqual([]);
    expect(fixture.componentInstance.positions).toEqual([]);
    expect(fixture.componentInstance['financeGeneration']).toBe(1);
    const echo = postLock(1);
    await new Promise(resolve => setTimeout(resolve, 20));
    echo.close();
    expect(fixture.componentInstance['financeGeneration']).toBe(1);
    await waitForVaultLock();
    expect(vaultLocks).toBe(1);
  });

  it('keeps a loaded card when the lock broadcast is for someone else or is not a lock', async () => {
    await showHarbor();
    const other = postLock(2);
    const invalidate = postLock(1, 'invalidate');
    await paint();
    other.close();
    invalidate.close();
    const text = (fixture.nativeElement.textContent as string).replaceAll('\u2060', '');
    expect(text).toContain('HBRX');
    expect(text).not.toContain('Finance is locked.');
    expect(fixture.componentInstance['financeGeneration']).toBe(0);
  });

  it('hides the finance breakdown while locked, loading, or expired', async () => {
    await showHarbor();
    expect(fixture.nativeElement.textContent).toContain('Breakdown');
    for (const state of ['locked', 'loading', 'expired'] as const) {
      fixture.componentInstance.financeState = state;
      fixture.debugElement.injector.get(ChangeDetectorRef).markForCheck();
      fixture.detectChanges();
      expect(fixture.nativeElement.textContent).not.toContain('Breakdown');
    }
  });

  it('clears a loaded card when localStorage is cleared', async () => {
    await showHarbor();
    window.dispatchEvent(new StorageEvent('storage', { key: null }));
    fixture.detectChanges();
    expect([fixture.componentInstance.financeState, fixture.componentInstance.netWorth, fixture.nativeElement.textContent.includes('Breakdown')]).toEqual(['locked', null, false]);
  });

  it('clears a loaded card on a sign-out broadcast', async () => {
    await showHarbor();
    const channel = postLock(1, 'signout');
    for (let i = 0; i < 10 && fixture.componentInstance.financeState !== 'locked'; i += 1) {
      await new Promise(resolve => setTimeout(resolve, 20));
      fixture.detectChanges();
    }
    channel.close();
    expect([fixture.componentInstance.financeState, fixture.componentInstance.netWorth, fixture.nativeElement.textContent.includes('Breakdown')]).toEqual(['locked', null, false]);
    await waitForVaultLock();
    expect(vaultLocks).toBe(1);
  });

  it('clears a loaded card when another tab signals a vault lock', async () => {
    await showHarbor();
    window.dispatchEvent(new StorageEvent('storage', { key: LOCK_SIGNAL, newValue: '1', oldValue: null }));
    fixture.detectChanges();
    const text = (fixture.nativeElement.textContent as string).replaceAll('\u2060', '');
    expect(text).toContain('Finance is locked.');
    expect(text).not.toMatch(/\$[\s]*\d/);
    expect(text).not.toContain('Harbor');
    expect(fixture.componentInstance.netWorth).toBeNull();
    expect(fixture.componentInstance.accounts).toEqual([]);
    expect(fixture.componentInstance.positions).toEqual([]);
    expect(fixture.componentInstance['financeGeneration']).toBe(1);
    await waitForVaultLock();
    expect(vaultLocks).toBe(1);
  });

  it('clears a loaded card when another tab removes finance-vault-present', async () => {
    await showHarbor();
    window.dispatchEvent(new StorageEvent('storage', { key: VAULT_PRESENCE, newValue: null, oldValue: '1' }));
    fixture.detectChanges();
    const text = (fixture.nativeElement.textContent as string).replaceAll('\u2060', '');
    expect(text).toContain('Finance is locked.');
    expect(text).not.toMatch(/\$[\s]*\d/);
    expect(text).not.toContain('Harbor');
    expect(fixture.componentInstance.netWorth).toBeNull();
    expect(fixture.componentInstance.accounts).toEqual([]);
    expect(fixture.componentInstance.positions).toEqual([]);
    expect(fixture.componentInstance['financeGeneration']).toBe(1);
    await waitForVaultLock();
    expect(vaultLocks).toBe(1);
  });

  it('does not lock when another tab migrates finance-dek', async () => {
    await showHarbor();
    window.dispatchEvent(new StorageEvent('storage', { key: DEK_STORE, newValue: null, oldValue: 'present' }));
    await new Promise(resolve => setTimeout(resolve, 50));
    fixture.detectChanges();
    const text = (fixture.nativeElement.textContent as string).replaceAll('\u2060', '');
    expect(text).toContain('HBRX');
    expect(text).not.toContain('Finance is locked.');
    expect(fixture.componentInstance.netWorth).not.toBeNull();
    expect(vaultLocks).toBe(0);
    expect(fixture.componentInstance['financeGeneration']).toBe(0);
  });

  it('drops an in-flight finance load that resolves after a lock', async () => {
    localStorage.setItem(DEK_STORE, 'present');
    vaultUnlocked = true;
    holdFinance = new Promise<void>(resolve => { releaseFinance = resolve; });
    assets$.next([{ id: 1, name: 'Harbor Checking', category: 'cash', current_value: 1500, as_of_date: '2026-10-01' } as Asset]);
    holdings$.next([{
      id: 10, symbol: 'HBRX', shares: 2, current_price: 25, account_display: 'Harbor Brokerage', lifecycle_status: 'active',
    } as Holding]);
    await render();
    takeCall('/travel/').resolve(json(200, { next_trip: null }));
    takeCall('/media/').resolve(json(200, { currently: [], recent_reviews: [], upcoming: [], next_episodes: [] }));
    resolveTown();
    for (let i = 0; i < 20 && financeCalls === 0; i++) await new Promise(resolve => setTimeout(resolve, 0));
    fixture.detectChanges();
    expect(financeCalls).toBeGreaterThan(0);
    expect((fixture.nativeElement.textContent as string).replaceAll('\u2060', '')).not.toContain('HBRX');
    const channel = postLock(1);
    for (let i = 0; i < 10 && fixture.componentInstance['financeGeneration'] === 0; i++) {
      await new Promise(resolve => setTimeout(resolve, 20));
    }
    releaseFinance();
    await paint();
    channel.close();
    const text = (fixture.nativeElement.textContent as string).replaceAll('\u2060', '');
    expect(text).toContain('Finance is locked.');
    expect(text).not.toMatch(/\$[\s]*\d/);
    expect(text).not.toContain('HBRX');
    expect(text).not.toContain('Harbor');
    expect(fixture.componentInstance['financeGeneration']).toBeGreaterThan(0);
  });

  it('keeps account settings off the hub', async () => {
    await render();
    takeCall('/travel/').resolve(json(200, { next_trip: null }));
    takeCall('/media/').resolve(json(200, { currently: [], recent_reviews: [], upcoming: [], next_episodes: [] }));
    resolveTown();
    await paint();
    expect(fixture.nativeElement.querySelector('[role="dialog"]')).toBeNull();
    expect(fixture.nativeElement.textContent).not.toContain('Save name');
    expect(fixture.nativeElement.textContent).not.toContain('Change username');
  });

  it('shows the town card with level, today, and streak while finance stays locked', async () => {
    await render();
    takeCall('/travel/').resolve(json(200, { next_trip: null }));
    takeCall('/media/').resolve(json(200, { currently: [], recent_reviews: [], upcoming: [], next_episodes: [] }));
    resolveTown();
    await paint();
    const text = (fixture.nativeElement.textContent as string).replaceAll('\u2060', '');
    expect(text).toContain('Terraria-on-Sea');
    expect(text).toContain('Lv 3 · 260 / 500 XP');
    expect(text).toContain('1 of 2 habits done today');
    expect(text).toContain('Longest streak: 3-day streak');
    expect(text).toContain('Open Town');
    expect(text).toContain('Finance is locked. Unlock to see net worth.');
    expect(vaultReads).toBe(0);
    const bar = fixture.nativeElement.querySelector('section[aria-labelledby="town-heading"] progress');
    expect(bar?.getAttribute('aria-valuemin')).toBe('250');
    expect(bar?.getAttribute('aria-valuemax')).toBe('500');
    expect(bar?.getAttribute('aria-valuenow')).toBe('260');
    expect(bar?.getAttribute('aria-valuetext')).toBe('Level 3, 260 of 500 XP');
  });

  it('shows the town empty state for a town with no habits', async () => {
    await render();
    takeCall('/travel/').resolve(json(200, { next_trip: null }));
    takeCall('/media/').resolve(json(200, { currently: [], recent_reviews: [], upcoming: [], next_episodes: [] }));
    resolveTown({ ...townBody(), founded_on: null, level: 1, xp: 0, level_xp_start: 0, next_level_xp: 100, today_done: 0, today_total: 0, longest_streak: 0, longest_streak_unit: null });
    await paint();
    const text = (fixture.nativeElement.textContent as string).replaceAll('\u2060', '');
    expect(text).toContain('Start your town');
    expect(text).not.toContain('habits done today');
  });

  it('omits the streak line when every streak is 0 but habits exist', async () => {
    await render();
    takeCall('/travel/').resolve(json(200, { next_trip: null }));
    takeCall('/media/').resolve(json(200, { currently: [], recent_reviews: [], upcoming: [], next_episodes: [] }));
    resolveTown({ ...townBody(), longest_streak: 0, longest_streak_unit: null });
    await paint();
    const text = (fixture.nativeElement.textContent as string).replaceAll('\u2060', '');
    expect(text).toContain('1 of 2 habits done today');
    expect(text).not.toContain('Longest streak');
  });

  it('recovers the town card when a failed summary is retried', async () => {
    await render();
    takeCall('/travel/').resolve(json(200, { next_trip: null }));
    takeCall('/media/').resolve(json(200, { currently: [], recent_reviews: [], upcoming: [], next_episodes: [] }));
    takeCall('/api/town').resolve(json(503, {}));
    await paint();
    const text = (fixture.nativeElement.textContent as string).replaceAll('\u2060', '');
    expect(text).toContain("Couldn't load your town.");

    fixture.nativeElement.querySelector('section[aria-labelledby="town-heading"] button').click();
    fixture.detectChanges();
    resolveTown();
    await paint();
    expect(fixture.nativeElement.textContent).toContain('Lv 3 · 260 / 500 XP');
  });

  it('shows the session-ended copy when the town summary is rejected', async () => {
    await render();
    takeCall('/travel/').resolve(json(200, { next_trip: null }));
    takeCall('/media/').resolve(json(200, { currently: [], recent_reviews: [], upcoming: [], next_episodes: [] }));
    takeCall('/api/town').resolve(json(401, { detail: 'expired' }));
    await paint();
    const text = (fixture.nativeElement.textContent as string).replaceAll('\u2060', '');
    expect(text).toContain('Your session ended. Sign in again to see your town.');
    expect(auth.logout).not.toHaveBeenCalled();
  });

  it('shows the year strip after Town without a birthday or a tab stop on a cell', async () => {
    const day = hubStripWindow(todayIsoDate()).start;
    await render(pixelsBody(
      [{ date: day, town: 1 }],
      { birthday: '1990-05-04', show_age: true },
    ));
    takeCall('/travel/').resolve(json(200, { next_trip: null }));
    takeCall('/media/').resolve(json(200, { currently: [], recent_reviews: [], upcoming: [], next_episodes: [] }));
    resolveTown();
    await paint();
    expect(fixture.componentInstance.pixelsState).toBe('ready');
    const sections = [...fixture.nativeElement.querySelectorAll('.pair > section')].map(section => section.getAttribute('aria-labelledby'));
    expect(sections).toEqual(['travel-heading', 'media-heading', 'finance-heading', 'town-heading', 'pixels-heading']);
    const card = fixture.nativeElement.querySelector('section[aria-labelledby="pixels-heading"]') as HTMLElement;
    const text = card.textContent ?? '';
    expect(text).toContain('Year in Pixels');
    expect(text).toContain('1 active days in the last 13 weeks');
    expect(text).toContain('Longest run: 1 days');
    expect(text).not.toContain('1990-05-04');
    expect(text.toLowerCase()).not.toContain('birthday');
    expect(text).not.toContain('Finance');
    expect(card.innerHTML).not.toContain('1990-05-04');
    const links = [...card.querySelectorAll('a')];
    expect(links.map(link => link.textContent?.trim())).toEqual(['Open Pixels']);
    expect(links[0]?.getAttribute('href')).toBe('/pixels');
    expect(card.querySelectorAll('button').length).toBe(0);
    const cells = [...card.querySelectorAll('.pixel')] as HTMLElement[];
    expect(cells.length).toBe(91);
    for (const cell of cells) {
      expect(cell.tagName).toBe('DIV');
      expect(cell.getAttribute('aria-hidden')).toBe('true');
      expect(cell.getAttribute('tabindex')).toBeNull();
      expect(cell.tabIndex).toBeLessThan(0);
    }
    expect(card.querySelectorAll('a, button, input, select, textarea, [tabindex="0"]').length).toBe(1);
    expect(card.querySelector(`[data-date="${day}"]`)?.classList.contains('l1')).toBeTrue();

    const navigate = spyOn(TestBed.inject(Router), 'navigate').and.resolveTo(true);
    fixture.componentInstance.openPixelDay({ date: '2026-12-01', level: 0, future: true, today: false, planned: false });
    expect(navigate).not.toHaveBeenCalled();
    (card.querySelector(`[data-date="${day}"]`) as HTMLElement).click();
    expect(navigate).toHaveBeenCalledWith(['/pixels'], { queryParams: { year: day.slice(0, 4), day } });
  });

  it('drops finance colours when the vault lock clears kept days', async () => {
    localStorage.setItem(DEK_STORE, 'present');
    const day = hubStripWindow(todayIsoDate()).dates.find(date => date <= todayIsoDate()) ?? hubStripWindow(todayIsoDate()).start;
    financeDays = {
      status: 'ready',
      annualPlan: 1200,
      monthlyPlan: 100,
      mode: 'manual',
      days: [{ date: day, spend: 0, pace: 1, kept: true }],
    };
    await render(pixelsBody());
    takeCall('/travel/').resolve(json(200, { next_trip: null }));
    takeCall('/media/').resolve(json(200, { currently: [], recent_reviews: [], upcoming: [], next_episodes: [] }));
    resolveTown();
    await paint();
    const card = fixture.nativeElement.querySelector('section[aria-labelledby="pixels-heading"]') as HTMLElement;
    expect(card.querySelector(`[data-date="${day}"]`)?.classList.contains('l1')).toBeTrue();
    expect(card.textContent).toContain('1 active days in the last 13 weeks');
    expect(card.textContent).not.toContain('Finance is locked');
    TestBed.inject(PixelsDataService).dropFinance();
    fixture.detectChanges();
    expect(card.querySelector(`[data-date="${day}"]`)?.classList.contains('l1')).toBeFalse();
    expect(card.textContent).toContain('0 active days in the last 13 weeks');
    expect(card.textContent).toContain('Longest run: 0 days');
    expect(card.textContent).not.toContain('Finance');
  });

  it('keeps a scored strip when a refresh fails and shows session copy when pixels expires', async () => {
    const day = hubStripWindow(todayIsoDate()).start;
    await render(pixelsBody([{ date: day, town: 2 }]));
    takeCall('/travel/').resolve(json(200, { next_trip: null }));
    takeCall('/media/').resolve(json(200, { currently: [], recent_reviews: [], upcoming: [], next_episodes: [] }));
    resolveTown();
    await paint();
    expect(fixture.nativeElement.textContent).toContain('1 active days in the last 13 weeks');
    fixture.componentInstance.retryPixels();
    fixture.detectChanges();
    flushPixels({}, 503);
    await paint();
    const stale = (fixture.nativeElement.textContent as string).replaceAll('\u2060', '');
    expect(stale).toContain('1 active days in the last 13 weeks');
    expect(stale).toContain('Updated');

    fixture.componentInstance.retryPixels();
    fixture.detectChanges();
    flushPixels({}, 401);
    await paint();
    const expired = (fixture.nativeElement.textContent as string).replaceAll('\u2060', '');
    expect(expired).toContain('Your session ended. Sign in again to see pixels.');
    expect(expired).not.toContain('active days');
  });
});
