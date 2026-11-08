import { provideHttpClient, type HttpRequest } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { WorldApi, WorldApiError, WorldRequestAborted } from './world-api';

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

  it('sends tz and only the from/to Mondays that are set', async () => {
    const pending = api.getWorld(null, null, new AbortController().signal);
    const open = http.expectOne(to('/api/world'));
    expect(open.request.method).toBe('GET');
    expect(open.request.params.keys()).toEqual(['tz']);
    expect(open.request.params.get('tz')).toBe(api.timezone());
    expect(open.request.params.has('from')).toBeFalse();
    expect(open.request.params.has('to')).toBeFalse();
    expect(open.request.params.has('title')).toBeFalse();
    open.flush({ meta: { today: '2026-11-07', current_week: '2026-11-02', start_week: '2026-05-11', version: 1 }, weeks: [] });
    await pending;

    const ranged = api.getWorld('2026-05-11', '2026-11-02', new AbortController().signal);
    const page = http.expectOne(to('/api/world'));
    expect(page.request.params.get('from')).toBe('2026-05-11');
    expect(page.request.params.get('to')).toBe('2026-11-02');
    expect(page.request.params.has('title')).toBeFalse();
    page.flush({ meta: { today: '2026-11-07', current_week: '2026-11-02', start_week: '2026-05-11', version: 1 }, weeks: [] });
    await ranged;
  });

  it('loads town with tz and lists concepts as archived 0 or 1', async () => {
    const town = api.getTown(new AbortController().signal);
    const townReq = http.expectOne(to('/api/town'));
    expect(townReq.request.params.get('tz')).toBe(api.timezone());
    expect(townReq.request.params.keys()).toEqual(['tz']);
    townReq.flush({ town: { name: 'Home' } });
    await town;

    const active = api.listConcepts(false, new AbortController().signal);
    const activeReq = http.expectOne(to('/api/world/concepts'));
    expect(activeReq.request.params.get('archived')).toBe('0');
    expect(activeReq.request.params.has('tz')).toBeFalse();
    activeReq.flush([]);
    await active;

    const archived = api.listConcepts(true, new AbortController().signal);
    const archivedReq = http.expectOne(to('/api/world/concepts'));
    expect(archivedReq.request.params.get('archived')).toBe('1');
    archivedReq.flush([]);
    await archived;
  });

  it('posts source as text and does not fetch that URL', async () => {
    const source = 'https://example.invalid/paper';
    const pending = api.createConcept({ name: 'Kalman', note: 'line', source, understood_on: null }, new AbortController().signal);
    const req = http.expectOne(to('/api/world/concepts'));
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({
      name: 'Kalman',
      note: 'line',
      source,
      understood_on: null,
      tz: api.timezone(),
    });
    req.flush({ id: 1, name: 'Kalman', note: 'line', source, understood_on: null, archived: false, created_at: '2026-11-07T00:00:00Z', updated_at: '2026-11-07T00:00:00Z' });
    await pending;
    http.expectNone(source);
  });

  it('keeps 404, 409, and 422 distinct', async () => {
    const missing = api.deleteConcept(4, new AbortController().signal);
    const missingReq = http.expectOne(to('/api/world/concepts/4'));
    expect(missingReq.request.method).toBe('DELETE');
    missingReq.flush({ detail: "That concept doesn't exist." }, { status: 404, statusText: 'Not Found' });
    await expectAsync(missing).toBeRejectedWith(jasmine.objectContaining<WorldApiError>({
      status: 404,
      message: "That concept doesn't exist.",
    }));

    const limited = api.createConcept({ name: 'One more', tz: 'UTC' }, new AbortController().signal);
    const limitedReq = http.expectOne(to('/api/world/concepts'));
    expect(limitedReq.request.body).toEqual({ name: 'One more', tz: 'UTC' });
    limitedReq.flush(
      { code: 'concept_limit', message: 'Delete a concept to free a space. You can keep at most 500.', field_errors: null },
      { status: 409, statusText: 'Conflict' },
    );
    await expectAsync(limited).toBeRejectedWith(jasmine.objectContaining<WorldApiError>({
      status: 409,
      code: 'concept_limit',
      message: 'Delete a concept to free a space. You can keep at most 500.',
      fieldErrors: null,
    }));

    const invalid = api.patchConcept(9, { source: 'a\nb' }, new AbortController().signal);
    const invalidReq = http.expectOne(to('/api/world/concepts/9'));
    expect(invalidReq.request.method).toBe('PATCH');
    invalidReq.flush(
      {
        code: 'concept_invalid',
        message: "That concept can't be saved.",
        field_errors: { source: 'Source must be a single line of at most 500 characters.' },
      },
      { status: 422, statusText: 'Unprocessable Entity' },
    );
    await expectAsync(invalid).toBeRejectedWith(jasmine.objectContaining<WorldApiError>({
      status: 422,
      code: 'concept_invalid',
      message: "That concept can't be saved.",
      fieldErrors: { source: 'Source must be a single line of at most 500 characters.' },
    }));
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
