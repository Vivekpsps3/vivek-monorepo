import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { BehaviorSubject, Subject } from 'rxjs';
import { SessionService } from '../platform/session.service';
import { QuestsComponent } from './quests.component';
import { TownApiService, type QuestJournal, type QuestKeepsake, type QuestStepView } from './town.api';

function step(patch: Partial<QuestStepView> & Pick<QuestStepView, 'id' | 'label' | 'action_id'>): QuestStepView {
  return {
    source: null,
    sample_action_id: null,
    sample_label: null,
    sample_detail: null,
    recorded_action: null,
    ...patch,
  };
}

function keepsake(id: string, name: string, kind: QuestKeepsake['kind'], kept = false): QuestKeepsake {
  return { id, name, kind, kept };
}

function shelves(recorded = false): QuestJournal {
  return {
    revision: recorded ? 1 : 0,
    quests: [{
      id: 'find-your-shelves',
      title: 'Find your shelves',
      detail: 'Optional. No deadline.',
      completed: recorded ? 1 : 0,
      total: 3,
      reward_stamps: 10,
      keepsake: keepsake('library-seal', 'library seal', 'seal'),
      steps: [
        step({
          id: 'meet-librarian',
          label: 'Meet the librarian',
          action_id: 'find-your-shelves:meet-librarian',
          recorded_action: recorded ? 'find-your-shelves:meet-librarian' : null,
        }),
        step({
          id: 'inspect-saved',
          label: 'Inspect a saved item',
          action_id: 'find-your-shelves:inspect-saved',
          source: 'library',
          sample_action_id: 'find-your-shelves:inspect-saved:sample',
          sample_label: 'Sample shelf item',
          sample_detail: 'Labeled sample. Not your library.',
        }),
        step({ id: 'choose-display', label: 'Choose a shelf display', action_id: 'find-your-shelves:choose-display' }),
      ],
    }],
  };
}

function home(revision: number, title = 'Make a home', kept = false): QuestJournal {
  return {
    revision,
    quests: [{
      id: 'make-a-home',
      title,
      detail: 'Optional. No deadline.',
      completed: kept ? 1 : 0,
      total: 1,
      reward_stamps: 10,
      keepsake: keepsake(
        'paper-house-postcard',
        title === 'STALE' ? 'stale postcard' : 'paper-house postcard',
        'postcard',
        kept || title === 'STALE',
      ),
      steps: [step({
        id: 'enter-home',
        label: 'Enter Home',
        action_id: 'make-a-home:enter-home',
        recorded_action: kept || title === 'STALE' ? 'make-a-home:enter-home' : null,
      })],
    }],
  };
}

describe('Optional quests', () => {
  let user: BehaviorSubject<{ id: number } | null>;
  let loads: Subject<QuestJournal>[];
  let writes: Subject<QuestJournal>[];
  let http: HttpTestingController;
  let api: { getQuests: jasmine.Spy; recordQuestStep: jasmine.Spy };

  beforeEach(() => {
    user = new BehaviorSubject<{ id: number } | null>({ id: 1 });
    loads = [];
    writes = [];
    const request = (responses: Subject<QuestJournal>[]) => jasmine.createSpy().and.callFake(() => {
      const pending = new Subject<QuestJournal>();
      responses.push(pending);
      return pending;
    });
    api = { getQuests: request(loads), recordQuestStep: request(writes) };
    TestBed.configureTestingModule({
      providers: [
        provideRouter([{ path: 'town/quests', component: QuestsComponent }]),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: SessionService, useValue: { user$: user } },
        { provide: TownApiService, useValue: api },
      ],
    });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  function flushSources(library: { status?: number; body?: unknown } = {}): void {
    const summary = http.expectOne(request => request.url === '/media/api/summary');
    const travel = http.expectOne(request => request.url === '/travel/api/memories');
    const memory = http.expectOne(request => request.url === '/api/world/concepts');
    expect(travel.request.params.get('tz')).toBeTruthy();
    if (library.status && library.status !== 200) {
      summary.flush({}, { status: library.status, statusText: 'locked' });
    } else {
      summary.flush(library.body ?? { currently: [], recent_reviews: [], upcoming: [], next_episodes: [] });
    }
    travel.flush({ total: 0 });
    memory.flush([]);
  }

  async function open(journal: QuestJournal, library?: { status?: number; body?: unknown }) {
    const harness = await RouterTestingHarness.create('/town/quests');
    loads[0].next(journal);
    flushSources(library);
    harness.detectChanges();
    const el = harness.routeNativeElement!;
    function click(name: string): void {
      const button = Array.from(el.querySelectorAll('button')).find(item => item.textContent?.trim() === name);
      expect(button).withContext(name).toBeTruthy();
      button?.click();
      harness.detectChanges();
    }
    return { harness, el, click };
  }

  it('keeps a failed save and retries the same action without applying a stale conflict', async () => {
    const { harness, el, click } = await open(home(0));
    click('Record Enter Home');
    click('Cancel');
    expect(api.recordQuestStep).not.toHaveBeenCalled();
    expect(el.querySelector('#quest-step-make-a-home-enter-home')).toBeTruthy();
    click('Record Enter Home');
    click('Confirm step');
    const body = {
      quest_id: 'make-a-home', step_id: 'enter-home',
      action_id: 'make-a-home:enter-home', expected_revision: 0,
    };
    expect(api.recordQuestStep).toHaveBeenCalledOnceWith(body);
    writes[0].error({ status: 503 });
    harness.detectChanges();
    expect(el.textContent).toContain('Try this step again');
    expect(el.textContent).toContain('Record Enter Home?');
    click('Retry step');
    expect(api.recordQuestStep.calls.argsFor(1)).toEqual([body]);
    writes[1].error({ status: 409, error: { code: 'quest_conflict', revision: 9, title: 'STALE' } });
    loads[1].next(home(4, 'Current home'));
    flushSources();
    harness.detectChanges();
    expect(el.textContent).toContain('This quest changed');
    expect(el.textContent).toContain('Current home');
    expect(el.textContent).not.toContain('STALE');
    expect(el.querySelector('main')?.getAttribute('data-revision')).toBe('4');
    expect(el.textContent).not.toContain('Record Enter Home?');
  });

  it('drops a held success after the owner changes', async () => {
    const { harness, el, click } = await open(home(0));
    click('Record Enter Home');
    click('Confirm step');
    user.next({ id: 2 });
    loads[1].next(home(2, 'Second owner'));
    flushSources();
    writes[0].next(home(9, 'STALE'));
    harness.detectChanges();
    expect(el.textContent).toContain('Second owner');
    expect(el.querySelector('main')?.getAttribute('data-revision')).toBe('2');
    expect(el.textContent).not.toContain('STALE');
    expect(el.textContent).not.toContain('stale postcard');
    expect(el.querySelector('[data-keepsake]')).toBeNull();
    expect(el.textContent).not.toContain('Record Enter Home?');
  });

  it('drops a late error after the owner changes', async () => {
    const { harness, el, click } = await open(home(0));
    click('Record Enter Home');
    click('Confirm step');
    user.next({ id: 2 });
    writes[0].error({ status: 503 });
    loads[1].next(home(2, 'Second owner'));
    flushSources();
    harness.detectChanges();
    expect(el.textContent).toContain('Second owner');
    expect(el.textContent).not.toContain('Try this step again');
    expect(el.textContent).not.toContain('Record Enter Home?');
  });

  it('offers a labeled sample when the library is empty and confirms it once', async () => {
    const { el, click } = await open(shelves(true));
    expect(el.textContent).toContain('The library is empty');
    expect(el.textContent).toContain('Use Sample shelf item');
    expect(el.textContent).not.toContain('Record Inspect a saved item');
    click('Use Sample shelf item');
    expect(el.textContent).toContain('does not create a library, trip, or Health record');
    click('Confirm step');
    expect(api.recordQuestStep).toHaveBeenCalledOnceWith({
      quest_id: 'find-your-shelves',
      step_id: 'inspect-saved',
      action_id: 'find-your-shelves:inspect-saved:sample',
      expected_revision: 1,
    });
  });

  it('records the saved action when the library has an item and hides the sample title', async () => {
    const { el } = await open(shelves(true), {
      body: { currently: [{ title: 'Sample book' }], recent_reviews: [], upcoming: [], next_episodes: [] },
    });
    expect(el.textContent).toContain('Record Inspect a saved item');
    expect(el.textContent).not.toContain('Sample book');
    expect(el.textContent).not.toContain('Use Sample shelf item');
  });

  it('keeps the reward off the page until the saved journal includes it', async () => {
    const { harness, el, click } = await open(home(0));
    expect(el.textContent).toContain('10 Stamps and the paper-house postcard, once.');
    expect(el.querySelector('[data-keepsake]')).toBeNull();
    click('Record Enter Home');
    click('Confirm step');
    writes[0].error({ status: 503 });
    harness.detectChanges();
    expect(el.textContent).toContain('Record Enter Home?');
    expect(el.querySelector('[data-keepsake]')).toBeNull();
    click('Retry step');
    writes[1].next(home(1, 'Make a home', true));
    harness.detectChanges();
    expect(el.querySelector('[data-keepsake="paper-house-postcard"]')?.textContent).toContain('paper-house postcard');
    expect(el.textContent).toContain('Recorded once. paper-house postcard. 10 Stamps, once.');
    expect(el.textContent).not.toContain('Record Enter Home?');
  });

  it('offers the labeled sample when the library is locked', async () => {
    const { el } = await open(shelves(true), { status: 403 });
    expect(el.textContent).toContain('The library is locked');
    expect(el.textContent).toContain('Use Sample shelf item');
  });
});
