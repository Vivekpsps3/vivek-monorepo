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
  it('reads the wallet and posts only the selected unlock and receipt details', () => {
    api.getStamps().subscribe();
    const read = http.expectOne(request => request.url === '/api/town/stamps');
    expect(read.request.method).toBe('GET');
    expect(read.request.params.get('tz')).toBeTruthy();
    read.flush({ balance: 0, consumers: [], receipts: [], entitlements: [] });
    const buy = { grant_key: 'market:buy:example', catalog_id: 'tile-fountain', amount: 10 };
    api.purchaseStamps(buy).subscribe();
    const purchase = http.expectOne(request => request.url === '/api/town/stamps/purchases');
    expect(purchase.request.method).toBe('POST');
    expect(purchase.request.body).toEqual(buy);
    purchase.flush({ balance: 0, consumers: [], receipts: [], entitlements: [] });
    const giveBack = { grant_key: 'market:refund:tile-fountain:4', catalog_id: 'tile-fountain', spend_receipt_id: 4 };
    api.refundStamps(giveBack).subscribe();
    const refund = http.expectOne(request => request.url === '/api/town/stamps/refunds');
    expect(refund.request.method).toBe('POST');
    expect(refund.request.body).toEqual(giveBack);
    refund.flush({ balance: 10, consumers: [], receipts: [], entitlements: [] });
  });
  it('reads and saves a room layout without a life metric', () => {
    api.getLayout('study').subscribe();
    const read = http.expectOne(request => request.url === '/api/town/layouts/study');
    expect(read.request.method).toBe('GET');
    read.flush({ room_id: 'study', revision: 0, items: [] });
    api.saveLayout('study', { expected_revision: 0, items: [] }).subscribe();
    const save = http.expectOne(request => request.url === '/api/town/layouts/study');
    expect(save.request.method).toBe('PUT');
    expect(save.request.body).toEqual({ expected_revision: 0, items: [] });
    expect(JSON.stringify(save.request.body)).not.toContain('note');
    save.flush({ room_id: 'study', revision: 1, items: [] });
  });
  it('posts a quest step with only the action identity and expected revision', () => {
    api.getQuests().subscribe();
    const read = http.expectOne(request => request.url === '/api/town/quests');
    expect(read.request.method).toBe('GET');
    read.flush({ revision: 0, quests: [] });
    const body = {
      quest_id: 'make-a-home',
      step_id: 'enter-home',
      action_id: 'make-a-home:enter-home',
      expected_revision: 0,
    };
    api.recordQuestStep(body).subscribe();
    const post = http.expectOne(request => request.url === '/api/town/quests/steps');
    expect(post.request.method).toBe('POST');
    expect(post.request.body).toEqual(body);
    expect(Object.keys(post.request.body as object).sort()).toEqual([
      'action_id', 'expected_revision', 'quest_id', 'step_id',
    ]);
    post.flush({ revision: 1, quests: [] });
  });
  it('posts a conversation identity without a note or life metric', () => {
    api.getResidents().subscribe();
    const read = http.expectOne(request => request.url === '/api/town/residents');
    expect(read.request.method).toBe('GET');
    read.flush({ revision: 0, hour: 0, residents: [] });
    const body = { resident_id: 'mara', conversation_id: 'welcome', expected_revision: 0 };
    api.completeConversation(body).subscribe();
    const post = http.expectOne(request => request.url === '/api/town/residents/conversations');
    expect(post.request.method).toBe('POST');
    expect(post.request.body).toEqual(body);
    expect(Object.keys(post.request.body as object).sort()).toEqual([
      'conversation_id', 'expected_revision', 'resident_id',
    ]);
    post.flush({ revision: 1, hour: 0, residents: [] });
  });
  it('preserves authentication errors for the expired state', () => {
    const error = jasmine.createSpy('error');
    api.getTown().subscribe({ error });
    http.expectOne(r => r.url === '/api/town').flush({}, { status: 401, statusText: 'Expired' });
    expect(error.calls.mostRecent().args[0].status).toBe(401);
  });
});
