import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController,provideHttpClientTesting } from '@angular/common/http/testing';
import { fakeAsync,TestBed,tick } from '@angular/core/testing';
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
