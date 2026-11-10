import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { fakeAsync, TestBed, tick } from '@angular/core/testing';
import { Injector } from '@angular/core';
import { SESSION_CONTEXT, ToastService } from '@vivek/ui';
import { FinanceService, VaultService } from '../../../../finance/frontend/src/testing';
import {
  LOCK_SIGNAL,
  VAULT_PRESENCE,
  financeTabId,
  loadMarketRefreshCoordinatorService,
  lockFinance,
  type BudgetKeptDaysResult,
} from '../../../../finance/frontend/src/public-api';
import { SessionService } from '../platform/session.service';
import { PIXELS_FINANCE_DAYS, PIXELS_VAULT_PRESENT, PixelsDataService } from './pixels-data.service';

describe('PixelsDataService', () => {
  let service: PixelsDataService;
  let http: HttpTestingController;
  let vault = false;
  let financeCalls = 0;
  let releaseFinance: (result: BudgetKeptDaysResult) => void = () => undefined;
  let moduleReset = false;

  beforeEach(async () => {
    vault = false;
    financeCalls = 0;
    const MarketRefreshCoordinatorService = await loadMarketRefreshCoordinatorService();
    const session = { currentUser: { id: 7 } };
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: SessionService, useValue: session },
        { provide: SESSION_CONTEXT, useValue: session },
        { provide: FinanceService, useValue: { clearSessionState() { /* same-tab lock */ } } },
        { provide: MarketRefreshCoordinatorService, useValue: { endSession() { /* same-tab lock */ } } },
        { provide: VaultService, useValue: { lock: () => Promise.resolve() } },
        { provide: ToastService, useValue: { error() { /* lock fallback */ } } },
        { provide: PIXELS_VAULT_PRESENT, useValue: () => vault },
        {
          provide: PIXELS_FINANCE_DAYS,
          useValue: () => {
            financeCalls += 1;
            return new Promise<BudgetKeptDaysResult>(resolve => { releaseFinance = resolve; });
          },
        },
      ],
    });
    service = TestBed.inject(PixelsDataService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    if (!moduleReset) http.verify();
    moduleReset = false;
    TestBed.resetTestingModule();
  });

  function pixelsBody() {
    return {
      from: '2026-08-01',
      to: '2026-08-02',
      days: [{ date: '2026-08-01', town: 1 }],
      sources: { town: 'ok', media: 'ok', travel: 'ok' },
      first_activity_on: '2026-08-01',
    };
  }

  it('does not call Finance or profile while locked', async () => {
    const pending = service.load({ from: '2026-08-01', to: '2026-08-02', profile: false, includeTrips: false, today: '2026-10-29' });
    const req = http.expectOne(request => request.url === '/api/pixels');
    expect(req.request.params.has('profile')).toBeFalse();
    req.flush(pixelsBody());
    const result = await pending;
    expect(financeCalls).toBe(0);
    expect(result.status).toBe('ready');
    if (result.status === 'ready') {
      expect(result.snapshot.financeStatus).toBe('locked');
      expect(result.snapshot.profile).toBeNull();
      expect(result.snapshot.days[0]?.channels.fin).toBeNull();
    }
  });

  it('drops a Finance payload that resolves after lock', fakeAsync(() => {
    vault = true;
    let status = '';
    void service.load({ from: '2026-08-01', to: '2026-08-02', profile: false, includeTrips: false, today: '2026-10-29' })
      .then(result => { status = result.status; });
    http.expectOne(request => request.url === '/api/pixels').flush(pixelsBody());
    tick();
    expect(financeCalls).toBe(1);
    service.dropFinance();
    releaseFinance({
      status: 'ready',
      annualPlan: 1200,
      monthlyPlan: 100,
      mode: 'manual',
      days: [
        { date: '2026-08-01', spend: 0, pace: 1, kept: false },
        { date: '2026-08-02', spend: 0, pace: 1, kept: false },
      ],
    });
    tick();
    expect(status).toBe('dropped');
  }));

  it('asks for a birthday only when Life requests a profile', async () => {
    const pending = service.load({ from: '1990-05-04', to: '1990-05-04', profile: true, includeTrips: false, today: '2026-10-29' });
    const req = http.expectOne(request => request.url === '/api/pixels');
    expect(req.request.params.get('profile')).toBe('1');
    req.flush({
      ...pixelsBody(),
      from: '1990-05-04',
      to: '1990-05-04',
      days: [],
      profile: { birthday: '1990-05-04', show_age: false },
    });
    const result = await pending;
    expect(result.status).toBe('ready');
    if (result.status === 'ready') expect(result.snapshot.profile).toEqual({ birthday: '1990-05-04', showAge: false });
  });

  it('forgets Finance when the account changes', () => {
    const cleared = jasmine.createSpy('cleared');
    service.financeCleared$.subscribe(cleared);
    service.noteUser(7);
    service.noteUser(8);
    expect(cleared).toHaveBeenCalled();
  });

  it('drops finance on a same-tab lock when BroadcastChannel is missing', async () => {
    const cleared = jasmine.createSpy('cleared');
    service.financeCleared$.subscribe(cleared);
    const realChannel = globalThis.BroadcastChannel;
    globalThis.BroadcastChannel = undefined as unknown as typeof BroadcastChannel;
    try {
      await lockFinance(TestBed.inject(Injector));
    } finally {
      globalThis.BroadcastChannel = realChannel;
    }
    expect(cleared).toHaveBeenCalledTimes(1);
  });

  it('drops finance for a remote lock or sign-out and ignores foreign, malformed, and self-echo', async () => {
    const cleared = jasmine.createSpy('cleared');
    service.financeCleared$.subscribe(cleared);
    const send = (message: unknown) => {
      const channel = new BroadcastChannel('finance-vault-sync-v1');
      channel.postMessage(message);
      channel.close();
    };
    send({ version: 1, userId: 8, kind: 'lock', tabId: 'other' });
    send({ version: 1, userId: 7, kind: 'invalidate' });
    send({ version: 1, userId: 7, kind: 'lock', tabId: financeTabId() });
    await new Promise(resolve => setTimeout(resolve, 30));
    expect(cleared).not.toHaveBeenCalled();
    send({ version: 1, userId: 7, kind: 'lock', tabId: 'other' });
    send({ version: 1, userId: 7, kind: 'lock', tabId: 'other-again' });
    await new Promise(resolve => setTimeout(resolve, 30));
    expect(cleared).toHaveBeenCalledTimes(2);
    send({ version: 1, userId: 7, kind: 'signout', tabId: financeTabId() });
    await new Promise(resolve => setTimeout(resolve, 30));
    expect(cleared).toHaveBeenCalledTimes(3);
    window.dispatchEvent(new StorageEvent('storage', { key: LOCK_SIGNAL, newValue: '1' }));
    window.dispatchEvent(new StorageEvent('storage', { key: VAULT_PRESENCE, newValue: null }));
    window.dispatchEvent(new StorageEvent('storage', { key: 'finance-dek', newValue: null }));
    expect(cleared).toHaveBeenCalledTimes(5);
  });

  it('does not drop finance after the service is destroyed', async () => {
    const cleared = jasmine.createSpy('cleared');
    service.financeCleared$.subscribe(cleared);
    moduleReset = true;
    TestBed.resetTestingModule();
    const channel = new BroadcastChannel('finance-vault-sync-v1');
    channel.postMessage({ version: 1, userId: 7, kind: 'lock', tabId: 'other' });
    channel.close();
    window.dispatchEvent(new StorageEvent('storage', { key: LOCK_SIGNAL, newValue: '1' }));
    await new Promise(resolve => setTimeout(resolve, 30));
    expect(cleared).not.toHaveBeenCalled();
  });
});
