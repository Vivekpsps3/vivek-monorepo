import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Subject, of } from 'rxjs';
import { SessionService } from '../platform/session.service';
import { KeepsakeShelfComponent } from './keepsake-shelf.component';
import type { KeepsakeCoverage, KeepsakeShelf, MediaKeepsake, TripKeepsake } from './keepsake.types';
import { TownApiService } from './town.api';

function coverage(included = 0, total = included, status: KeepsakeCoverage['status'] = 'ok'): KeepsakeCoverage {
  return { status, included, total, truncated: total > included };
}

function shelf(patch: Partial<KeepsakeShelf> = {}): KeepsakeShelf {
  const keepsakes = patch.keepsakes ?? [];
  const souvenirs = patch.souvenirs ?? [];
  const planned = patch.planned ?? [];
  const ineligible = patch.ineligible ?? [];
  return {
    on: patch.on === undefined ? null : patch.on,
    cap: 50,
    media: patch.media ?? coverage(keepsakes.length),
    travel: patch.travel ?? {
      status: 'ok',
      souvenirs: coverage(souvenirs.length),
      planned: coverage(planned.length),
      ineligible: coverage(ineligible.length),
    },
    keepsakes,
    souvenirs,
    planned,
    ineligible,
    differences: [{ id: 'episode-versus-completion', text: 'A watched episode stays an episode.' }],
    ...patch,
  };
}

function book(title: string, id = title): MediaKeepsake {
  return {
    id, entry_id: 1, kind: 'book', title, on: '2026-10-01',
    route: '/media/item/1', note: 'Completed book on 2026-10-01.', date_source: 'completed_on',
  };
}

function souvenir(title: string): TripKeepsake {
  return {
    id: `trip:${title}`, trip_id: 4, title, status: 'booked', mark: 'souvenir',
    span_start: '2026-12-20', span_end: '2026-12-31', credit_date: '2027-01-01', credit_eligible: true,
    destinations: ['Portland'], place: { label: 'Portland, Oregon, United States', lat_e2: 4552 },
    scenery: 'The saved destination is Portland. Scenery on this souvenir is illustrative. It is not a map of the trip.',
    route: '/travel/trips/4', note: 'Town credits this trip once on 2027-01-01.',
  };
}

describe('Keepsake shelf', () => {
  let users: Subject<{ id: number } | null>;
  let cleared: Subject<void>;
  let getKeepsakes: jasmine.Spy;

  beforeEach(() => {
    users = new Subject();
    cleared = new Subject();
    getKeepsakes = jasmine.createSpy('getKeepsakes').and.returnValue(of(shelf()));
    TestBed.configureTestingModule({
      imports: [KeepsakeShelfComponent],
      providers: [
        provideRouter([]),
        { provide: TownApiService, useValue: { getKeepsakes } },
        { provide: SessionService, useValue: { user$: users, cleared$: cleared } },
      ],
    });
  });

  function open(day?: string): { fixture: ReturnType<typeof TestBed.createComponent<KeepsakeShelfComponent>>; el: HTMLElement } {
    const fixture = TestBed.createComponent(KeepsakeShelfComponent);
    if (day) fixture.componentRef.setInput('day', day);
    users.next({ id: 1 });
    fixture.detectChanges();
    return { fixture, el: fixture.nativeElement as HTMLElement };
  }

  it('drops a held shelf when the owner changes', () => {
    const first = new Subject<KeepsakeShelf>();
    const second = new Subject<KeepsakeShelf>();
    getKeepsakes.and.returnValues(first, second);
    const { fixture, el } = open();
    users.next({ id: 2 });
    fixture.detectChanges();
    first.next(shelf({ keepsakes: [book('Ada book')] }));
    fixture.detectChanges();
    expect(el.textContent).not.toContain('Ada book');
    second.next(shelf({ keepsakes: [book('Bea book')] }));
    fixture.detectChanges();
    expect(el.textContent).toContain('Bea book');
    expect(getKeepsakes).toHaveBeenCalledTimes(2);
  });

  it('keeps the find draft through a failed refresh and clears it for a new owner', () => {
    const failed = new Subject<KeepsakeShelf>();
    const later = new Subject<KeepsakeShelf>();
    getKeepsakes.and.returnValues(of(shelf({ keepsakes: [book('Shelf Atlas')] })), failed, later);
    const { fixture, el } = open();
    const input = el.querySelector('input');
    expect(input).not.toBeNull();
    input!.value = 'Atlas';
    input!.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    fixture.componentInstance.retry();
    failed.error(new Error('down'));
    fixture.detectChanges();
    expect(el.textContent).toContain('Shelf Atlas');
    expect(el.textContent).toContain('This refresh failed');
    expect((el.querySelector('input') as HTMLInputElement).value).toBe('Atlas');
    users.next({ id: 2 });
    fixture.detectChanges();
    expect(fixture.componentInstance.draft()).toBe('');
    cleared.next();
    fixture.detectChanges();
    expect(fixture.componentInstance.draft()).toBe('');
  });

  it('returns focus when the selected record is gone', async () => {
    getKeepsakes.and.returnValues(
      of(shelf({ keepsakes: [book('Shelf Atlas', 'finished:1:2026-10-01')] })),
      of(shelf({ keepsakes: [book('Shelf Reel', 'finished:2:2026-10-01')] })),
    );
    const { fixture, el } = open();
    const inspect = [...el.querySelectorAll('button')].find(button => button.textContent?.includes('Inspect Shelf Atlas'));
    inspect?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    fixture.detectChanges();
    expect(inspect?.getAttribute('aria-current')).toBe('true');
    fixture.componentInstance.retry();
    fixture.detectChanges();
    await fixture.whenStable();
    expect(el.textContent).not.toContain('Inspect Shelf Atlas');
    expect(el.querySelector('#keepsake-heading')).toBe(document.activeElement);
  });

  it('reveals the fourth keepsake and filters before the preview', () => {
    getKeepsakes.and.returnValue(of(shelf({
      keepsakes: [book('Shelf Atlas'), book('Shelf Beta'), book('Shelf Cedar'), book('Shelf Dune')],
    })));
    const { fixture, el } = open();
    expect(el.textContent).toContain('Shelf Cedar');
    expect(el.textContent).not.toContain('Shelf Dune');
    expect(getKeepsakes).toHaveBeenCalledTimes(1);
    const more = [...el.querySelectorAll('button')].find(button => button.textContent?.includes('More keepsakes'));
    more?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    fixture.detectChanges();
    expect(el.textContent).toContain('Shelf Dune');
    const input = el.querySelector('input') as HTMLInputElement;
    input.value = 'Atlas';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    expect(el.textContent).toContain('Shelf Atlas');
    expect(el.textContent).not.toContain('Shelf Beta');
  });

  it('keeps a travel souvenir when media is unavailable', () => {
    getKeepsakes.and.returnValue(of(shelf({
      media: coverage(0, 0, 'unavailable'),
      keepsakes: [],
      souvenirs: [souvenir('Shelf Harbor')],
    })));
    const { el } = open();
    expect(el.querySelector('[data-source="media"]')?.textContent).toContain('Media is unavailable');
    expect(el.textContent).toContain('does not ask an artwork provider');
    expect(el.textContent).toContain('Shelf Harbor');
    expect(el.textContent).toContain('forest');
    expect(el.textContent).toContain('not a map');
    expect(getKeepsakes).toHaveBeenCalledTimes(1);
  });

  it('hides the previous day before the next shelf arrives', () => {
    const next = new Subject<KeepsakeShelf>();
    getKeepsakes.and.returnValues(of(shelf({ on: '2026-10-01', keepsakes: [book('Shelf Atlas')] })), next);
    const { fixture, el } = open('2026-10-01');
    expect(el.textContent).toContain('Shelf Atlas');
    fixture.componentRef.setInput('day', '2026-10-02');
    fixture.detectChanges();
    expect(el.textContent).not.toContain('Shelf Atlas');
    next.next(shelf({ on: '2026-10-02', keepsakes: [book('Shelf Later')] }));
    fixture.detectChanges();
    expect(el.textContent).toContain('Shelf Later');
  });
});
