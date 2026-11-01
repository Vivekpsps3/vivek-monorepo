import { Observable } from 'rxjs';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { fakeAsync, TestBed, tick } from '@angular/core/testing';
import { SILENT_ERROR_TOAST } from '@vivek/ui';
import { HUB_SUMMARY_DEADLINE_MS } from '../hub/hub-load';
import { TownApiService } from './town.api';

describe('TownApiService', () => {
  let api: TownApiService;
  let http: HttpTestingController;
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    api = TestBed.inject(TownApiService);
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());
  it('sends all seven contracts with the current IANA zone and leaves errors to the screen', () => {
    const body = { name: 'Read 20 pages', slot: 0, per_week: 7 };
    const calls = [
      [() => api.getTown(), 'GET', '', null, {}],
      [() => api.getHabits(true), 'GET', '/habits', null, { include_archived: '1' }],
      [() => api.createHabit(body), 'POST', '/habits', body, {}],
      [() => api.patchHabit(12, { archived: true }), 'PATCH', '/habits/12', { archived: true }, {}],
      [() => api.checkin(12, '2026-11-01'), 'POST', '/habits/12/checkins', { day: '2026-11-01' }, {}],
      [() => api.undoCheckin(12, '2026-11-01'), 'DELETE', '/habits/12/checkins/2026-11-01', null, {}],
      [() => api.getCheckins(12, '2026-10-01', '2026-11-01'), 'GET', '/habits/12/checkins', null, { from: '2026-10-01', to: '2026-11-01' }],
    ] as const;
    for (const [call, method, path, payload, params] of calls) {
      (call() as Observable<unknown>).subscribe();
      const req = http.expectOne(r => r.url === `/api/town${path}` && r.method === method);
      expect(req.request.body).toEqual(payload);
      expect(req.request.params.get('tz')).toBe(Intl.DateTimeFormat().resolvedOptions().timeZone);
      for (const [key, value] of Object.entries(params)) expect(req.request.params.get(key)).toBe(value);
      expect(req.request.context.get(SILENT_ERROR_TOAST)).toBeTrue();
      req.flush({});
    }
  });
  it('cancels a stalled GET at the shared eight-second deadline', fakeAsync(() => {
    const error = jasmine.createSpy('error');
    api.getTown().subscribe({ error });
    const req = http.expectOne(r => r.url === '/api/town');
    tick(HUB_SUMMARY_DEADLINE_MS - 1);
    expect(error).not.toHaveBeenCalled();
    tick(1);
    expect(error).toHaveBeenCalled();
    expect(req.cancelled).toBeTrue();
  }));
  it('preserves authentication errors for the expired state', () => {
    const error = jasmine.createSpy('error');
    api.getTown().subscribe({ error });
    http.expectOne(r => r.url === '/api/town').flush({}, { status: 401, statusText: 'Expired' });
    expect(error.calls.mostRecent().args[0].status).toBe(401);
  });
});
