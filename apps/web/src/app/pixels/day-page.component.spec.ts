import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { todayIsoDate } from '@vivek/browser';
import { Subject, of } from 'rxjs';
import { SessionService } from '../platform/session.service';
import { TownApiService } from '../town/town.api';
import { DayPageComponent } from './day-page.component';
import { PixelsDataService } from './pixels-data.service';
import { composeSnapshot } from './pixels-model';
import type {
  AnnotationChange,
  AnnotationChangeResult,
  DayFactsResult,
  PixelDayFacts,
  PixelsLoadRequest,
  PixelsLoadResult,
  PixelsSnapshot,
} from './pixels.types';

function snapshotFor(request: PixelsLoadRequest, finance: 'locked' | 'unavailable' = 'locked'): PixelsSnapshot {
  return composeSnapshot({
    body: {
      from: request.from,
      to: request.to,
      days: [{ date: request.from, town: 1 }],
      sources: { town: 'ok', media: 'ok', travel: 'ok' },
      first_activity_on: request.from,
    },
    today: request.today,
    trips: [{ id: 4, title: 'Leap harbor', start: request.from, end: request.from }],
    financeStatus: finance,
    financeKept: new Map(),
    fetchedAt: 1,
    profile: null,
  });
}

function dayFacts(date: string, name = 'Synthetic concept'): PixelDayFacts {
  const row = { status: 'ok' as const, included: 1, total: 1, truncated: false };
  return {
    date,
    facts: [],
    annotations: [{
      id: 'world_concept:7',
      conceptId: 7,
      name,
      understoodOn: date,
      provenance: 'It does not change the Pixels score.',
    }],
    coverage: { town: row, media: row, travel: row, concepts: row },
    differences: [{ id: 'concept-not-score', text: 'It does not change the Pixels score.' }],
    counts: {},
  };
}

describe('Day page', () => {
  let load: jasmine.Spy<(request: PixelsLoadRequest) => Promise<PixelsLoadResult>>;
  let loadDay: jasmine.Spy<(date: string) => Promise<DayFactsResult>>;
  let changeAnnotation: jasmine.Spy<(action: AnnotationChange) => Promise<AnnotationChangeResult>>;
  let financeCleared$: Subject<void>;
  let userChanged$: Subject<void>;

  beforeEach(() => {
    financeCleared$ = new Subject<void>();
    userChanged$ = new Subject<void>();
    load = jasmine.createSpy('load').and.callFake((request: PixelsLoadRequest) => Promise.resolve({
      status: 'ready' as const,
      snapshot: snapshotFor(request),
    }));
    loadDay = jasmine.createSpy('loadDay').and.callFake((date: string) => Promise.resolve({
      status: 'ready' as const,
      facts: dayFacts(date),
    }));
    changeAnnotation = jasmine.createSpy('changeAnnotation').and.resolveTo({ status: 'ready' as const });
    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          { path: 'pixels/day', component: DayPageComponent },
          { path: 'pixels/life', component: DayPageComponent },
          { path: 'pixels', component: DayPageComponent },
        ]),
        { provide: PixelsDataService, useValue: { load, loadDay, changeAnnotation, financeCleared$, userChanged$ } },
        { provide: SessionService, useValue: { user$: of({ id: 1 }), cleared$: new Subject() } },
        { provide: TownApiService, useValue: { getKeepsakes: () => of({
          on: '2024-02-29', cap: 50,
          media: { status: 'ok', included: 0, total: 0, truncated: false },
          travel: {
            status: 'ok',
            souvenirs: { status: 'ok', included: 0, total: 0, truncated: false },
            planned: { status: 'ok', included: 0, total: 0, truncated: false },
            ineligible: { status: 'ok', included: 0, total: 0, truncated: false },
          },
          keepsakes: [], souvenirs: [], planned: [], ineligible: [], differences: [],
        }) } },
      ],
    });
  });

  async function open(url: string): Promise<RouterTestingHarness> {
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl(url);
    await harness.fixture.whenStable();
    harness.detectChanges();
    return harness;
  }

  it('shows the leap day and a failed finance join as unavailable', async () => {
    load.and.callFake((request: PixelsLoadRequest) => Promise.resolve({
      status: 'ready' as const,
      snapshot: snapshotFor(request, 'unavailable'),
    }));
    const harness = await open('/pixels/day?date=2024-02-29&from=year&year=2024');
    const el = harness.routeNativeElement as HTMLElement;
    expect(el.textContent).toContain('Thu, Feb 29, 2024');
    expect(el.querySelector('[data-source="finance"]')?.getAttribute('data-source-state')).toBe('unavailable');
    expect(el.querySelector('[data-source="finance"]')?.textContent).toContain('Finance is unavailable.');
    expect(el.querySelector('[data-source="finance"]')?.textContent).not.toContain('no data');
    const request = load.calls.mostRecent().args[0] as PixelsLoadRequest;
    expect(request).toEqual(jasmine.objectContaining({
      from: '2024-02-29',
      to: '2024-02-29',
      profile: false,
      includeTrips: true,
      today: todayIsoDate(),
    }));
    expect(el.querySelector('.day-detail')?.getAttribute('data-origin')).toBe('year');
    expect(el.querySelector('.day-detail')?.getAttribute('data-origin-year')).toBe('2024');
  });

  it('refuses an invalid date instead of opening another day', async () => {
    const harness = await open('/pixels/day?date=2024-02-31&from=year&year=2024');
    const el = harness.routeNativeElement as HTMLElement;
    expect(el.textContent).toContain('2024-02-31 is not a date.');
    expect(el.querySelector('app-day-detail')).toBeNull();
    expect(load).not.toHaveBeenCalled();
    expect(loadDay).not.toHaveBeenCalled();
  });

  it('keeps a failed redate and clears it when the owner changes', async () => {
    const harness = await open('/pixels/day?date=2024-02-29&from=life&year=2024&span=2024-02-29');
    const el = harness.routeNativeElement as HTMLElement;
    const input = el.querySelector('input');
    expect(input).not.toBeNull();
    input!.value = '2026-02-31';
    input!.dispatchEvent(new Event('input'));
    harness.detectChanges();
    changeAnnotation.and.resolveTo({ status: 'failed', message: 'Enter a real date.' });
    el.querySelector('.redate button')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await harness.fixture.whenStable();
    harness.detectChanges();
    expect(input!.value).toBe('2026-02-31');
    expect(el.textContent).toContain('Enter a real date.');
    expect(el.querySelector('.day-detail')?.getAttribute('data-origin-span')).toBe('2024-02-29');
    userChanged$.next();
    await harness.fixture.whenStable();
    harness.detectChanges();
    await harness.fixture.whenStable();
    harness.detectChanges();
    expect(el.querySelector('input')?.value ?? '').toBe('');
    expect(el.textContent).not.toContain('Foreign concept');
  });

  it('ignores a losing response after the open day changes', async () => {
    const pending: Array<(result: DayFactsResult) => void> = [];
    const lateLoads: Array<(result: PixelsLoadResult) => void> = [];
    let calls = 0;
    load.and.callFake((request: PixelsLoadRequest) => {
      calls += 1;
      if (calls === 1) {
        return new Promise(resolve => {
          lateLoads.push(resolve);
        });
      }
      return Promise.resolve({
        status: 'ready' as const,
        snapshot: snapshotFor(request),
      });
    });
    loadDay.and.callFake((date: string) => {
      if (date === '2024-02-29') return new Promise(resolve => { pending.push(resolve); });
      return Promise.resolve({ status: 'ready' as const, facts: dayFacts(date, 'Kept concept') });
    });
    const harness = await open('/pixels/day?date=2024-02-29&from=year&year=2024');
    expect(pending).toHaveSize(1);
    expect(lateLoads).toHaveSize(1);
    await harness.navigateByUrl('/pixels/day?date=2024-03-01&from=year&year=2024');
    await harness.fixture.whenStable();
    harness.detectChanges();
    pending[0]!({ status: 'ready', facts: dayFacts('2024-02-29', 'Foreign concept') });
    lateLoads[0]!({
      status: 'ready',
      snapshot: composeSnapshot({
        body: {
          from: '2024-02-29',
          to: '2024-02-29',
          days: [{ date: '2024-02-29', town: 1 }],
          sources: { town: 'ok', media: 'ok', travel: 'ok' },
          first_activity_on: '2024-02-29',
        },
        today: todayIsoDate(),
        trips: [{ id: 9, title: 'Late harbor', start: '2024-02-29', end: '2024-02-29' }],
        financeStatus: 'locked',
        financeKept: new Map(),
        fetchedAt: 2,
        profile: null,
      }),
    });
    await harness.fixture.whenStable();
    harness.detectChanges();
    const el = harness.routeNativeElement as HTMLElement;
    const page = harness.routeDebugElement?.componentInstance as DayPageComponent | undefined;
    expect(page).toBeTruthy();
    expect(el.textContent).toContain('Kept concept');
    expect(el.textContent).not.toContain('Foreign concept');
    expect(el.textContent).not.toContain('Late harbor');
    expect(page?.snapshot()?.trips.map(trip => trip.title)).toEqual(['Leap harbor']);
    expect(page?.query()?.date).toBe('2024-03-01');
  });
});
