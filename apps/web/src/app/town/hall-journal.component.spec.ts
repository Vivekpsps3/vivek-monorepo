import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { BehaviorSubject, Subject } from 'rxjs';
import { SessionService } from '../platform/session.service';
import { HallJournalComponent } from './hall-journal.component';
import type { JournalSource } from './hall-journal';
import { TownApiService } from './town.api';

function source(): JournalSource {
  return {
    quests: {
      revision: 3,
      quests: [{
        id: 'make-a-home',
        title: 'Make a home',
        detail: 'Optional. No deadline.',
        completed: 3,
        total: 3,
        reward_stamps: 10,
        keepsake: { id: 'paper-house-postcard', name: 'paper-house postcard', kind: 'postcard', kept: true },
        steps: [{
          id: 'enter-home',
          label: 'Enter Home',
          action_id: 'make-a-home:enter-home',
          source: null,
          sample_action_id: null,
          sample_label: null,
          sample_detail: null,
          recorded_action: 'make-a-home:enter-home',
        }, {
          id: 'place-starter',
          label: 'Place a starter item',
          action_id: 'make-a-home:place-starter',
          source: null,
          sample_action_id: null,
          sample_label: null,
          sample_detail: null,
          recorded_action: 'make-a-home:place-starter',
        }, {
          id: 'save-layout',
          label: 'Save the layout',
          action_id: 'make-a-home:save-layout',
          source: null,
          sample_action_id: null,
          sample_label: null,
          sample_detail: null,
          recorded_action: 'make-a-home:save-layout',
        }],
      }],
    },
    discoveries: { revision: 0, discoveries: [] },
    residents: { revision: 0, hour: 0, residents: [] },
    arcade: { games: [] },
  };
}

describe('Hall journal page', () => {
  let user: BehaviorSubject<{ id: number } | null>;
  let quests: Subject<JournalSource['quests']>[];
  let discoveries: Subject<JournalSource['discoveries']>[];
  let residents: Subject<JournalSource['residents']>[];
  let arcade: Subject<JournalSource['arcade']>[];

  beforeEach(() => {
    user = new BehaviorSubject<{ id: number } | null>({ id: 4 });
    quests = [];
    discoveries = [];
    residents = [];
    arcade = [];
    const bucket = <T>(items: Subject<T>[]) => jasmine.createSpy().and.callFake(() => {
      const pending = new Subject<T>();
      items.push(pending);
      return pending;
    });
    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          { path: 'town/hall/journal', component: HallJournalComponent },
          { path: 'town/hall/journal/:collection', component: HallJournalComponent },
        ]),
        { provide: SessionService, useValue: { user$: user } },
        {
          provide: TownApiService,
          useValue: {
            getQuests: bucket(quests),
            getDiscoveries: bucket(discoveries),
            getResidents: bucket(residents),
            getArcade: bucket(arcade),
          },
        },
      ],
    });
  });

  function emit(index: number, body = source()): void {
    quests[index].next(body.quests);
    discoveries[index].next(body.discoveries);
    residents[index].next(body.residents);
    arcade[index].next(body.arcade);
    quests[index].complete();
    discoveries[index].complete();
    residents[index].complete();
    arcade[index].complete();
  }

  async function open(url = '/town/hall/journal/chapters?item=make-a-home') {
    const harness = await RouterTestingHarness.create(url);
    emit(0);
    harness.detectChanges();
    return harness;
  }

  it('shows the same keepsake after a failed reload and a retry', async () => {
    const harness = await open();
    const el = harness.routeNativeElement!;
    expect(el.querySelector('article[data-open="true"] [data-badge="once"]')?.textContent).toBe('paper-house postcard, once');
    expect(el.querySelector('[data-source]')?.textContent).toContain('quest:make-a-home');
    expect(el.querySelector('[data-explanation]')?.textContent).toContain('10 Stamps, once');
    expect(el.textContent).toContain('not Health badges, Finance totals, or Media memberships');

    const find = el.querySelector('#journal-find');
    if (!(find instanceof HTMLInputElement)) throw new Error('missing find');
    find.value = 'home';
    find.dispatchEvent(new Event('input'));
    harness.detectChanges();
    expect(el.querySelector('[data-record="make-a-home"]')).not.toBeNull();

    const reload = Array.from(el.querySelectorAll('button')).find(button => button.textContent?.trim() === 'Reload journal');
    reload?.click();
    quests[1].error(new Error('unavailable'));
    harness.detectChanges();
    expect(find.value).toBe('home');
    expect(el.querySelector('#journal-stale')?.textContent).toContain('records already shown are unchanged');
    expect(el.querySelector('article [data-badge="once"]')?.textContent).toBe('paper-house postcard, once');

    const retry = Array.from(el.querySelectorAll('button')).find(button => button.textContent?.trim() === 'Retry');
    retry?.click();
    emit(2);
    harness.detectChanges();
    expect(find.value).toBe('home');
    expect(el.querySelector('article [data-badge="once"]')?.textContent).toBe('paper-house postcard, once');
    expect(el.querySelector('#journal-stale')).toBeNull();
  });

  it('drops a late journal after the owner changes and clears the find draft', async () => {
    const harness = await open('/town/hall/journal/chapters');
    const el = harness.routeNativeElement!;
    const find = el.querySelector('#journal-find');
    if (!(find instanceof HTMLInputElement)) throw new Error('missing find');
    find.value = 'secret draft';
    find.dispatchEvent(new Event('input'));
    harness.detectChanges();

    const reload = Array.from(el.querySelectorAll('button')).find(button => button.textContent?.trim() === 'Reload journal');
    reload?.click();
    user.next({ id: 9 });
    harness.detectChanges();
    expect(el.textContent).not.toContain('paper-house postcard');
    expect(el.querySelector('#journal-find')).toBeNull();

    emit(1, source());
    harness.detectChanges();
    expect(el.textContent).not.toContain('paper-house postcard');
    expect(el.querySelector('#journal-find')).toBeNull();

    const other = source();
    other.quests.quests[0].keepsake.name = 'other postcard';
    emit(2, other);
    harness.detectChanges();
    const cleared = el.querySelector('#journal-find');
    if (!(cleared instanceof HTMLInputElement)) throw new Error('missing find');
    expect(cleared.value).toBe('');
    expect(el.textContent).toContain('other postcard, once');
    expect(el.textContent).not.toContain('paper-house postcard');
  });

  it('names an unknown collection without inventing a record', async () => {
    const harness = await open('/town/hall/journal/trophies');
    const el = harness.routeNativeElement!;
    expect(el.textContent).toContain('That collection is not in the Hall journal.');
    expect(el.querySelector('[data-badge]')).toBeNull();
  });
});
