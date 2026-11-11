import { HttpClient, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { fakeAsync, flushMicrotasks, TestBed, tick } from '@angular/core/testing';
import { throwError } from 'rxjs';
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
import { PIXELS_ACTION_DEADLINE_MS, PIXELS_FINANCE_DAYS, PIXELS_VAULT_PRESENT, PixelsDataService } from './pixels-data.service';

describe('PixelsDataService', () => {
  let service: PixelsDataService;
  let http: HttpTestingController;
  let vault = false;
  let financeCalls = 0;
  let financeSignals: AbortSignal[] = [];
  let financeDeadlines: number[] = [];
  let releaseFinance: (result: BudgetKeptDaysResult) => void = () => undefined;
  let moduleReset = false;

  beforeEach(async () => {
    vault = false;
    financeCalls = 0;
    financeSignals = [];
    financeDeadlines = [];
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
          useValue: (_injector: Injector, signal: AbortSignal, opts: { deadlineMs?: number }) => {
            financeCalls += 1;
            financeSignals.push(signal);
            if (opts.deadlineMs != null) financeDeadlines.push(opts.deadlineMs);
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
    expect(financeSignals[0]?.aborted).toBeTrue();
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

  it('ends a hung source window on the one action deadline and ignores the late body', fakeAsync(() => {
    let status = '';
    void service.load({ from: '2024-01-01', to: '2026-01-01', profile: false, includeTrips: false, today: '2026-10-29' })
      .then(result => { status = result.status; });
    const first = http.expectOne(request => request.url === '/api/pixels');
    tick(6_000);
    expect(status).toBe('');
    first.flush(pixelsBody());
    tick();
    const second = http.expectOne(request => request.url === '/api/pixels');
    tick(PIXELS_ACTION_DEADLINE_MS - 6_000 - 1);
    expect(status).toBe('');
    expect(second.cancelled).toBeFalse();
    tick(1);
    flushMicrotasks();
    expect(second.cancelled).toBeTrue();
    expect(status).toBe('unavailable');
    expect(financeCalls).toBe(0);
  }));

  it('gives every Finance window the time left on one action, then ignores a late join', fakeAsync(() => {
    vault = true;
    let result: Awaited<ReturnType<PixelsDataService['load']>> | undefined;
    void service.load({ from: '2016-01-01', to: '2026-01-01', profile: true, includeTrips: false, today: '2026-10-29' })
      .then(value => { result = value; });
    http.expectOne(request => request.url === '/api/pixels').flush({
      ...pixelsBody(),
      profile: { birthday: null, show_age: false },
    });
    tick();
    expect(financeCalls).toBe(1);
    expect(financeDeadlines[0]).toBe(PIXELS_ACTION_DEADLINE_MS);
    const releaseFirst = releaseFinance;
    tick(6_000);
    expect(result).toBeUndefined();
    releaseFirst({ status: 'ready', annualPlan: 1, monthlyPlan: 1, mode: 'manual', days: [] });
    tick();
    expect(financeCalls).toBe(2);
    expect(financeSignals[1]).toBe(financeSignals[0]);
    expect(financeDeadlines[1]).toBeLessThanOrEqual(PIXELS_ACTION_DEADLINE_MS - 6_000);
    expect(financeDeadlines[1]).toBeGreaterThan(0);
    tick(PIXELS_ACTION_DEADLINE_MS - 6_000 - 1);
    expect(result).toBeUndefined();
    tick(1);
    flushMicrotasks();
    expect(result?.status).toBe('ready');
    if (result?.status !== 'ready') return;
    expect(result.snapshot.financeStatus).toBe('unavailable');
    expect(result.snapshot.days.every(day => day.channels.fin === null)).toBeTrue();
    expect(financeSignals[1]?.aborted).toBeTrue();
    releaseFinance({
      status: 'ready',
      annualPlan: 1,
      monthlyPlan: 1,
      mode: 'manual',
      days: [{ date: '2016-01-01', spend: 0, pace: 1, kept: true }],
    });
    flushMicrotasks();
    expect(result.snapshot.financeStatus).toBe('unavailable');
    expect(result.snapshot.days.every(day => day.channels.fin === null)).toBeTrue();
  }));

  it('cancels the pixels request when the owner changes and does not start Finance', fakeAsync(() => {
    vault = true;
    service.noteUser(7);
    let status = '';
    void service.load({ from: '2026-08-01', to: '2026-08-02', profile: false, includeTrips: false, today: '2026-10-29' })
      .then(result => { status = result.status; });
    const req = http.expectOne(request => request.url === '/api/pixels');
    service.noteUser(8);
    expect(req.cancelled).toBeTrue();
    tick();
    expect(status).toBe('dropped');
    expect(financeCalls).toBe(0);
  }));

  it('cancels an in-flight pixels request when the route is destroyed', async () => {
    const pending = service.load({ from: '2026-08-01', to: '2026-08-02', profile: false, includeTrips: false, today: '2026-10-29' });
    const req = http.expectOne(request => request.url === '/api/pixels');
    moduleReset = true;
    TestBed.resetTestingModule();
    expect(req.cancelled).toBeTrue();
    await expectAsync(pending).toBeResolvedTo({ status: 'dropped' });
  });

  it('reports an expired session and a JSON parse exception without throwing', async () => {
    const expired = service.load({ from: '2026-08-01', to: '2026-08-02', profile: false, includeTrips: false, today: '2026-10-29' });
    http.expectOne(request => request.url === '/api/pixels').flush(
      { detail: 'nope' },
      { status: 401, statusText: 'Unauthorized' },
    );
    await expectAsync(expired).toBeResolvedTo({ status: 'expired' });

    spyOn(TestBed.inject(HttpClient), 'get').and.returnValue(throwError(() => new SyntaxError('Unexpected token')));
    const broken = service.load({ from: '2026-08-01', to: '2026-08-02', profile: false, includeTrips: false, today: '2026-10-29' });
    await expectAsync(broken).toBeResolvedTo({ status: 'unavailable' });
  });

  it('keeps an available source when another source is down, and keeps a finished snapshot after cancel', async () => {
    const pending = service.load({ from: '2026-08-01', to: '2026-08-02', profile: false, includeTrips: false, today: '2026-10-29' });
    http.expectOne(request => request.url === '/api/pixels').flush({
      ...pixelsBody(),
      sources: { town: 'ok', media: 'unavailable', travel: 'absent' },
    });
    const result = await pending;
    expect(result.status).toBe('ready');
    if (result.status !== 'ready') return;
    expect(result.snapshot.sources).toEqual({ town: 'ok', media: 'unavailable', travel: 'absent' });
    expect(result.snapshot.financeStatus).toBe('locked');
    expect(result.snapshot.days.length).toBeGreaterThan(0);
    service.release();
    expect(result.snapshot.sources.town).toBe('ok');
    expect(result.snapshot.financeStatus).toBe('locked');
  });
});
