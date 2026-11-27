import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { BehaviorSubject, Subject } from 'rxjs';
import { SessionService } from '../platform/session.service';
import { DiscoveriesComponent } from './discoveries.component';
import { TownApiService, type DiscoveryJournal, type DiscoveryView } from './town.api';

function item(patch: Partial<DiscoveryView> & Pick<DiscoveryView, 'id' | 'name'>): DiscoveryView {
  return {
    district: 'harbor',
    hint: 'Beside the model ferry at the terminal.',
    reaction: 'You ring the model ferry bell. The sound stays in town. No trip is created.',
    found: false,
    ...patch,
  };
}

function journal(revision: number, found = false, name = 'Ferry bell'): DiscoveryJournal {
  return {
    revision,
    discoveries: [
      item({ id: 'ferry-bell', name, found }),
      item({
        id: 'gym-chalkboard',
        name: 'Gym chalkboard',
        district: 'wellness',
        hint: 'Inside the gym, on the far wall.',
        reaction: 'You mark the gym chalkboard. The chalk is a toy. No workout is recorded.',
      }),
      item({
        id: 'rooftop-telescope',
        name: 'Rooftop telescope',
        district: 'residential',
        hint: 'On the home roof, aimed over the harbor.',
        reaction: 'You look through the rooftop telescope. The harbor is still there. No trip is created.',
      }),
    ],
  };
}

describe('Town discoveries', () => {
  let user: BehaviorSubject<{ id: number } | null>;
  let loads: Subject<DiscoveryJournal>[];
  let writes: Subject<DiscoveryJournal>[];
  let api: { getDiscoveries: jasmine.Spy; recordDiscovery: jasmine.Spy };

  beforeEach(() => {
    user = new BehaviorSubject<{ id: number } | null>({ id: 1 });
    loads = [];
    writes = [];
    const request = (responses: Subject<DiscoveryJournal>[]) => jasmine.createSpy().and.callFake(() => {
      const pending = new Subject<DiscoveryJournal>();
      responses.push(pending);
      return pending;
    });
    api = { getDiscoveries: request(loads), recordDiscovery: request(writes) };
    TestBed.configureTestingModule({
      providers: [
        provideRouter([{ path: 'town/discoveries', component: DiscoveriesComponent }]),
        { provide: SessionService, useValue: { user$: user } },
        { provide: TownApiService, useValue: api },
      ],
    });
  });

  async function open(page = '/town/discoveries', body = journal(0)) {
    const harness = await RouterTestingHarness.create(page);
    loads[0].next(body);
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

  it('keeps hints hidden until asked and does not show a timer', async () => {
    const { el, click } = await open();
    expect(el.querySelector('main')?.getAttribute('data-hints')).toBe('hidden');
    expect(el.textContent).not.toContain('Beside the model ferry');
    expect(el.textContent).toContain('These discoveries stay found.');
    expect(el.textContent).not.toMatch(/\bdue\b/i);
    click('Show location hints');
    expect(el.querySelector('main')?.getAttribute('data-hints')).toBe('shown');
    expect(el.textContent).toContain('Beside the model ferry at the terminal.');
    click('Hide location hints');
    expect(el.textContent).not.toContain('Beside the model ferry');
  });

  it('keeps a failed save and drops a losing conflict without the stale name', async () => {
    const { harness, el, click } = await open();
    click('Activate Ferry bell');
    click('Cancel');
    expect(api.recordDiscovery).not.toHaveBeenCalled();
    click('Activate Ferry bell');
    expect(el.textContent).toContain('does not change a library item, trip, finance record, or health record');
    click('Confirm discovery');
    const body = { discovery_id: 'ferry-bell', expected_revision: 0 };
    expect(api.recordDiscovery).toHaveBeenCalledOnceWith(body);
    writes[0].error({ status: 503 });
    harness.detectChanges();
    expect(el.textContent).toContain('Try again.');
    expect(el.textContent).toContain('Activate Ferry bell?');
    click('Retry discovery');
    expect(api.recordDiscovery.calls.argsFor(1)).toEqual([body]);
    writes[1].error({ status: 409, error: { code: 'discovery_conflict', name: 'STALE' } });
    loads[1].next(journal(4, false, 'Current bell'));
    harness.detectChanges();
    expect(el.textContent).toContain('This journal changed');
    expect(el.textContent).toContain('Current bell');
    expect(el.textContent).not.toContain('STALE');
    expect(el.querySelector('main')?.getAttribute('data-revision')).toBe('4');
    expect(el.textContent).not.toContain('Activate Ferry bell?');
    expect(el.querySelector('[data-discovery="ferry-bell"]')?.getAttribute('data-found')).toBe('false');
  });

  it('drops a held success after the owner changes', async () => {
    const { harness, el, click } = await open();
    click('Activate Ferry bell');
    click('Confirm discovery');
    user.next({ id: 2 });
    loads[1].next(journal(2, false, 'Second owner'));
    writes[0].next(journal(9, true, 'STALE'));
    harness.detectChanges();
    expect(el.textContent).toContain('Second owner');
    expect(el.querySelector('main')?.getAttribute('data-revision')).toBe('2');
    expect(el.textContent).not.toContain('STALE');
    expect(el.textContent).not.toContain('Found once.');
  });

  it('reads a found bell again without treating the replay as a new stamp', async () => {
    const { harness, el, click } = await open('/town/discoveries', journal(1, true));
    expect(el.textContent).toContain('You ring the model ferry bell.');
    click('Read Ferry bell again');
    click('Confirm discovery');
    expect(api.recordDiscovery).toHaveBeenCalledOnceWith({ discovery_id: 'ferry-bell', expected_revision: 1 });
    writes[0].next(journal(1, true));
    harness.detectChanges();
    expect(el.textContent).toContain('Already in the journal.');
    expect(el.querySelector('main')?.getAttribute('data-revision')).toBe('1');
  });

  it('opens the requested object once and does not reopen it after cancel', async () => {
    const { el, click } = await open('/town/discoveries?object=gym-chalkboard');
    expect(el.textContent).toContain('Activate Gym chalkboard?');
    click('Cancel');
    expect(el.textContent).not.toContain('Activate Gym chalkboard?');
    expect(el.querySelector('#discovery-gym-chalkboard')).toBeTruthy();
  });
});
