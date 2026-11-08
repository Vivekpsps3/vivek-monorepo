import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { fakeAsync, TestBed, tick } from '@angular/core/testing';
import type { BudgetKeptDaysResult } from '../../../../finance/frontend/src/public-api';
import { SessionService } from '../platform/session.service';
import { PIXELS_FINANCE_DAYS, PIXELS_VAULT_PRESENT, PixelsDataService } from './pixels-data.service';

describe('PixelsDataService', () => {
  let service: PixelsDataService;
  let http: HttpTestingController;
  let vault = false;
  let financeCalls = 0;
  let releaseFinance: (result: BudgetKeptDaysResult) => void = () => undefined;

  beforeEach(() => {
    vault = false;
    financeCalls = 0;
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: SessionService, useValue: { currentUser: { id: 7 } } },
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
    http.verify();
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
});
