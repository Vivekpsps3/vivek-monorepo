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
  it('asks for one keepsake shelf and omits an empty day', () => {
    api.getKeepsakes('2026-10-01').subscribe();
    const dated = http.expectOne(request => request.url === '/api/town/keepsakes');
    expect(dated.request.params.get('on')).toBe('2026-10-01');
    expect(dated.request.params.get('tz')).toBeTruthy();
    dated.flush({});
    api.getKeepsakes(null).subscribe();
    const open = http.expectOne(request => request.url === '/api/town/keepsakes');
    expect(open.request.params.has('on')).toBeFalse();
    open.flush({});
  });
  it('reads the stamp wallet and posts a refund without a life metric', () => {
    api.getStamps().subscribe();
    const read = http.expectOne(request => request.url === '/api/town/stamps');
    expect(read.request.method).toBe('GET');
    expect(read.request.params.get('tz')).toBeTruthy();
    read.flush({ balance: 0, consumers: [], receipts: [], entitlements: [] });
    api.refundStamps({ grant_key: 'market:refund:tile-fountain:4', catalog_id: 'tile-fountain' }).subscribe();
    const refund = http.expectOne(request => request.url === '/api/town/stamps/refunds');
    expect(refund.request.method).toBe('POST');
    expect(refund.request.body).toEqual({ grant_key: 'market:refund:tile-fountain:4', catalog_id: 'tile-fountain' });
    refund.flush({ balance: 10, consumers: [], receipts: [], entitlements: [] });
  });
  it('preserves authentication errors for the expired state', () => {
    const error = jasmine.createSpy('error');
    api.getTown().subscribe({ error });
    http.expectOne(r => r.url === '/api/town').flush({}, { status: 401, statusText: 'Expired' });
    expect(error.calls.mostRecent().args[0].status).toBe(401);
  });
});
