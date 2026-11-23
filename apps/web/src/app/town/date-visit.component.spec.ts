import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter, Router } from '@angular/router';
import { BehaviorSubject, Subject } from 'rxjs';
import { PixelsDataService } from '../pixels/pixels-data.service';
import type { DayFactsResult, PixelDayFacts } from '../pixels/pixels.types';
import { SessionService } from '../platform/session.service';
import { DateVisitComponent } from './date-visit.component';

describe('Date visit', () => {
  let query: BehaviorSubject<ReturnType<typeof convertToParamMap>>;
  let user: BehaviorSubject<{ id: number } | null>;
  let cleared: Subject<void>;
  let loadDay: jasmine.Spy<(date: string) => Promise<DayFactsResult>>;
  const session: {
    user: { id: number } | null;
    readonly currentUser: { id: number } | null;
    user$: BehaviorSubject<{ id: number } | null>;
    cleared$: Subject<void>;
  } = {
    user: { id: 7 },
    get currentUser() { return this.user; },
    user$: null as unknown as BehaviorSubject<{ id: number } | null>,
    cleared$: null as unknown as Subject<void>,
  };

  beforeEach(() => {
    query = new BehaviorSubject(convertToParamMap({}));
    user = new BehaviorSubject<{ id: number } | null>({ id: 7 });
    cleared = new Subject<void>();
    session.user = { id: 7 };
    session.user$ = user;
    session.cleared$ = cleared;
    loadDay = jasmine.createSpy('loadDay').and.returnValue(new Promise(() => undefined));
    TestBed.configureTestingModule({
      imports: [DateVisitComponent],
      providers: [
        provideRouter([]),
        { provide: ActivatedRoute, useValue: { queryParamMap: query } },
        { provide: PixelsDataService, useValue: { loadDay } },
        { provide: SessionService, useValue: session },
      ],
    });
  });

  function render(today = '2026-10-29') {
    const fixture = TestBed.createComponent(DateVisitComponent);
    fixture.componentRef.setInput('today', today);
    fixture.detectChanges();
    return fixture;
  }

  async function show(queryText: string, today = '2026-10-29') {
    const fixture = render(today);
    query.next(convertToParamMap(Object.fromEntries(new URLSearchParams(queryText))));
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture;
  }

  it('returns the year day and the life week, and does not load an invalid day', async () => {
    const fixture = await show('visit=2024-02-29&from=year&year=2024');
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('[data-visit-state]')?.getAttribute('data-origin')).toBe('year');
    expect(el.querySelector('[data-origin-year]')?.getAttribute('data-origin-year')).toBe('2024');
    expect(decodeURIComponent(el.querySelector('a')?.getAttribute('href') ?? '')).toContain('/pixels?year=2024&day=2024-02-29');
    expect(el.textContent).toContain('Current town layout');
    expect(el.textContent).not.toContain('Lv ');
    expect(loadDay).toHaveBeenCalledWith('2024-02-29');

    query.next(convertToParamMap({ visit: '2024-03-02', from: 'life', span: '2024-02-26' }));
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(el.querySelector('[data-origin]')?.getAttribute('data-origin')).toBe('life');
    expect(el.querySelector('[data-origin-span]')?.getAttribute('data-origin-span')).toBe('2024-02-26');
    expect(decodeURIComponent([...el.querySelectorAll('a')].find(link => link.textContent?.includes('Back'))?.getAttribute('href') ?? ''))
      .toContain('/pixels/life?span=2024-02-26');

    loadDay.calls.reset();
    query.next(convertToParamMap({ visit: '2024-02-31', from: 'year', year: '2024' }));
    fixture.detectChanges();
    expect(el.querySelector('[data-visit-state]')?.getAttribute('data-visit-state')).toBe('invalid');
    expect(el.textContent).toContain('2024-02-31 is not a date.');
    expect(el.textContent).not.toContain('Nothing recorded');
    expect(loadDay).not.toHaveBeenCalled();
  });

  it('keeps a losing read from replacing the current day and clears a draft when the owner changes', async () => {
    const pending: ((result: DayFactsResult) => void)[] = [];
    loadDay.and.callFake(() => new Promise(resolve => { pending.push(resolve); }));
    const fixture = await show('visit=2024-02-29&from=year&year=2024');
    const el = fixture.nativeElement as HTMLElement;
    const input = el.querySelector('input') as HTMLInputElement;
    input.value = '2024-03-02';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    query.next(convertToParamMap({ visit: '2024-03-01', from: 'year', year: '2024' }));
    fixture.detectChanges();
    expect(pending.length).toBe(2);
    pending[0]({ status: 'ready', facts: facts('2024-02-29', 'Foreign day') });
    await fixture.whenStable();
    fixture.detectChanges();
    expect(el.textContent).not.toContain('Foreign day');
    expect(input.value).toBe('2024-03-02');

    session.user = { id: 9 };
    user.next({ id: 9 });
    fixture.detectChanges();
    pending[1]({ status: 'ready', facts: facts('2024-03-01', 'Old owner') });
    await fixture.whenStable();
    fixture.detectChanges();
    expect(el.textContent).not.toContain('Old owner');
    expect((el.querySelector('input') as HTMLInputElement).value).toBe('');
  });

  it('keeps the typed date when the read fails and separates future, empty, and unavailable days', async () => {
    loadDay.and.resolveTo({ status: 'unavailable' });
    const failed = await show('visit=2024-01-15&from=year&year=2024');
    const failedEl = failed.nativeElement as HTMLElement;
    expect(failedEl.querySelector('[data-visit-state]')?.getAttribute('data-visit-state')).toBe('unavailable');
    expect(failedEl.textContent).toContain('Records for 2024-01-15 are unavailable.');
    expect(failedEl.textContent).not.toContain('Nothing recorded');
    const input = failedEl.querySelector('input') as HTMLInputElement;
    input.value = 'not-a-date';
    input.dispatchEvent(new Event('input'));
    failedEl.querySelector('form')?.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
    failed.detectChanges();
    expect(input.value).toBe('not-a-date');
    expect(failedEl.textContent).toContain('not-a-date is not a date.');

    loadDay.and.resolveTo({ status: 'ready', facts: facts('2024-01-16', '', true) });
    const empty = await show('visit=2024-01-16&from=year&year=2024');
    const emptyEl = empty.nativeElement as HTMLElement;
    expect(emptyEl.querySelector('[data-visit-state]')?.getAttribute('data-visit-state')).toBe('unrecorded');
    expect(emptyEl.textContent).toContain('Nothing recorded on 2024-01-16');
    expect(emptyEl.textContent).not.toContain('unavailable');
    expect(emptyEl.textContent).not.toContain('rest');
    emptyEl.querySelector('button')?.click();
    empty.detectChanges();
    expect(emptyEl.querySelector('[data-activity]')?.getAttribute('data-activity')).toBe('hidden');
    expect(emptyEl.querySelector('[data-visit-state]')?.getAttribute('data-visit-state')).toBe('unrecorded');

    loadDay.and.resolveTo({ status: 'ready', facts: facts('2026-12-01', 'Later trip') });
    const future = await show('visit=2026-12-01&from=year&year=2026');
    const futureEl = future.nativeElement as HTMLElement;
    expect(futureEl.querySelector('[data-visit-state]')?.getAttribute('data-visit-state')).toBe('future');
    expect(futureEl.textContent).toContain('2026-12-01 is still ahead.');
    expect(futureEl.textContent).toContain('Later trip');
    expect(futureEl.textContent).not.toContain('Nothing recorded');
    const navigate = spyOn(TestBed.inject(Router), 'navigate').and.resolveTo(true);
    const futureInput = futureEl.querySelector('input') as HTMLInputElement;
    futureInput.value = '2026-12-02';
    futureInput.dispatchEvent(new Event('input'));
    futureEl.querySelector('form')?.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
    expect(navigate).toHaveBeenCalledWith(['/town'], {
      queryParams: { visit: '2026-12-02', from: 'year', year: '2026' },
    });
  });
});

function facts(date: string, title: string, empty = false): PixelDayFacts {
  const coverage = { status: 'ok' as const, included: empty ? 0 : 1, total: empty ? 0 : 1, truncated: false };
  return {
    date,
    facts: empty || !title ? [] : [{
      id: `habit_checkin:${date}`,
      namespace: 'habit_checkin',
      occurrenceId: 1,
      kind: 'checkin',
      date,
      spanStart: null,
      spanEnd: null,
      coverage: 'complete',
      provenance: 'Town',
      title,
      route: '/town',
    }],
    annotations: [],
    coverage: { town: coverage, media: coverage, travel: coverage, concepts: coverage },
    differences: [],
    counts: {},
  };
}
