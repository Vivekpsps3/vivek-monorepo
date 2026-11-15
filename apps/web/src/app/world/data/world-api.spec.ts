import { provideHttpClient,type HttpRequest } from '@angular/common/http';
import { HttpTestingController,provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { WorldApi,WorldRequestAborted } from './world-api';

function to(path: string) {
  return (req: HttpRequest<unknown>) => req.url === path;
}

describe('WorldApi', () => {
  let api: WorldApi;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    api = TestBed.inject(WorldApi);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
    TestBed.resetTestingModule();
  });

  it('cancels the request when the signal aborts', async () => {
    const ctrl = new AbortController();
    const pending = api.getWorld(null, null, ctrl.signal);
    const req = http.expectOne(to('/api/world'));
    ctrl.abort();
    expect(req.cancelled).toBeTrue();
    await expectAsync(pending).toBeRejectedWith(jasmine.any(WorldRequestAborted));
  });
});
