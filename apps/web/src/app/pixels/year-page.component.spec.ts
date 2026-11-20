import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { todayIsoDate } from '@vivek/browser';
import { Subject } from 'rxjs';
import { PixelsDataService } from './pixels-data.service';
import { composeSnapshot, dayScoreVector } from './pixels-model';
import type {
  AnnotationChange,
  AnnotationChangeResult,
  DayFactsResult,
  PixelDayFacts,
  PixelsLoadRequest,
  PixelsLoadResult,
  PixelsSnapshot,
} from './pixels.types';
import { YearPageComponent } from './year-page.component';

function snapshotFor(request: PixelsLoadRequest, finance: 'locked' | 'ready'): PixelsSnapshot {
  const kept = new Map<string, boolean | null>();
  if (finance === 'ready') kept.set(request.from, true);
  return composeSnapshot({
    body: {
      from: request.from,
      to: request.to,
      days: [{ date: request.from, town: 1 }],
      sources: { town: 'ok', media: 'ok', travel: 'ok' },
      first_activity_on: request.from,
    },
    today: request.today,
    trips: [],
    financeStatus: finance,
    financeKept: kept,
    fetchedAt: 1,
    profile: null,
  });
}

describe('Year page', () => {
  let load: jasmine.Spy<(request: PixelsLoadRequest) => Promise<PixelsLoadResult>>;
  let loadDay: jasmine.Spy<(date: string) => Promise<DayFactsResult>>;
  let changeAnnotation: jasmine.Spy<(action: AnnotationChange) => Promise<AnnotationChangeResult>>;
  let financeCleared$: Subject<void>;
  let userChanged$: Subject<void>;

  beforeEach(() => {
    localStorage.clear();
    financeCleared$ = new Subject<void>();
    userChanged$ = new Subject<void>();
    load = jasmine.createSpy('load').and.callFake((request: PixelsLoadRequest) => Promise.resolve({
      status: 'ready' as const,
      snapshot: snapshotFor(request, 'locked'),
    }));
    loadDay = jasmine.createSpy('loadDay').and.callFake((date: string) => Promise.resolve({
      status: 'ready' as const,
      facts: dayFacts(date, { town: 99 }),
    }));
    changeAnnotation = jasmine.createSpy('changeAnnotation').and.resolveTo({ status: 'ready' as const });
    TestBed.configureTestingModule({
      providers: [
        provideRouter([{ path: 'pixels', component: YearPageComponent }]),
        { provide: PixelsDataService, useValue: { load, loadDay, changeAnnotation, financeCleared$, userChanged$ } },
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

  it('keeps the grid when Finance is locked and does not show a kept count', async () => {
    const year = todayIsoDate().slice(0, 4);
    const harness = await open(`/pixels?year=${year}`);
    const el = harness.routeNativeElement as HTMLElement;
    expect(el.querySelector('[role="grid"]')).not.toBeNull();
    const kept = el.querySelector('[data-stat="budget-kept"]');
    expect(kept?.textContent ?? '').not.toMatch(/\d/);
    expect(kept?.querySelector('[role="img"]')?.getAttribute('aria-label')).toBe('Finance locked');
    const link = el.querySelector('a');
    expect(link?.textContent?.trim()).toBe('Finance locked · Unlock');
    expect(link?.getAttribute('href')).toBe('/finance/vault/unlock?next=%2Fpixels%3Fyear%3D2026');
    const request = load.calls.mostRecent().args[0] as PixelsLoadRequest;
    expect(request.profile).toBeFalse();
    expect(request.includeTrips).toBeTrue();
    expect(request.from).toBe(`${year}-01-01`);
    expect(request.to).toBe(`${year}-12-31`);
  });

  it('does not let a dropped result repopulate Finance', async () => {
    const year = todayIsoDate().slice(0, 4);
    let calls = 0;
    load.and.callFake((request: PixelsLoadRequest) => {
      calls += 1;
      if (calls > 1) return Promise.resolve({ status: 'dropped' as const });
      return Promise.resolve({ status: 'ready' as const, snapshot: snapshotFor(request, 'locked') });
    });
    const harness = await open(`/pixels?year=${year}`);
    const el = harness.routeNativeElement as HTMLElement;
    expect(el.querySelector('[role="grid"]')).not.toBeNull();
    financeCleared$.next();
    await harness.fixture.whenStable();
    harness.detectChanges();
    expect(calls).toBeGreaterThan(1);
    expect(el.querySelector('[role="grid"]')).not.toBeNull();
    expect(el.querySelector('[data-stat="budget-kept"]')?.textContent ?? '').not.toMatch(/\d/);
  });

  it('keeps the year score when facts disagree and a failed redate keeps its draft', async () => {
    const year = todayIsoDate().slice(0, 4);
    const date = `${year}-01-01`;
    const harness = await open(`/pixels?year=${year}&day=${date}`);
    const el = harness.routeNativeElement as HTMLElement;
    expect(loadDay).toHaveBeenCalledTimes(1);
    const expected = dayScoreVector(snapshotFor({
      from: `${year}-01-01`,
      to: `${year}-12-31`,
      profile: false,
      includeTrips: true,
      today: todayIsoDate(),
    }, 'locked').days.find(day => day.date === date)!);
    expect(el.querySelector('.day-detail')?.getAttribute('data-score-vector')).toBe(expected);
    expect(expected).toContain('"town":1');
    const input = el.querySelector('input');
    expect(input).not.toBeNull();
    input!.value = '2026-02-31';
    input!.dispatchEvent(new Event('input'));
    harness.detectChanges();
    changeAnnotation.and.resolveTo({ status: 'failed', message: 'Enter a real date.' });
    const yearLoads = load.calls.count();
    el.querySelector('.redate button')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await harness.fixture.whenStable();
    harness.detectChanges();
    expect(changeAnnotation).toHaveBeenCalled();
    expect(load.calls.count()).toBe(yearLoads);
    expect(input!.value).toBe('2026-02-31');
    expect(el.textContent).toContain('Enter a real date.');
    expect(el.querySelector('.day-detail')?.getAttribute('data-score-vector')).toBe(expected);
    userChanged$.next();
    await harness.fixture.whenStable();
    harness.detectChanges();
    await harness.fixture.whenStable();
    harness.detectChanges();
    expect(el.querySelector('input')?.value ?? '').toBe('');
    expect(el.querySelector('.day-detail')?.getAttribute('data-score-vector')).toBe(expected);
    expect(el.textContent).not.toContain('Foreign concept');
  });

  it('reloads the selected day after archive and ignores a losing day response', async () => {
    const year = todayIsoDate().slice(0, 4);
    const date = `${year}-01-01`;
    const pending: Array<(result: DayFactsResult) => void> = [];
    loadDay.and.callFake(() => new Promise(resolve => { pending.push(resolve); }));
    const harness = await open(`/pixels?year=${year}&day=${date}`);
    const el = harness.routeNativeElement as HTMLElement;
    expect(pending).toHaveSize(1);
    pending[0]!({ status: 'ready', facts: dayFacts(date, { town: 99 }) });
    await harness.fixture.whenStable();
    harness.detectChanges();
    const yearLoads = load.calls.count();
    const archive = [...el.querySelectorAll('button')].find(button => button.textContent?.includes('Archive Synthetic concept'));
    archive?.click();
    await harness.fixture.whenStable();
    harness.detectChanges();
    expect(load.calls.count()).toBe(yearLoads);
    expect(pending).toHaveSize(2);
    userChanged$.next();
    await harness.fixture.whenStable();
    harness.detectChanges();
    pending[1]!({
      status: 'ready',
      facts: {
        ...dayFacts(date),
        annotations: [{
          id: 'world_concept:8',
          conceptId: 8,
          name: 'Foreign concept',
          understoodOn: date,
          provenance: 'It does not change the Pixels score.',
        }],
      },
    });
    await harness.fixture.whenStable();
    harness.detectChanges();
    expect(el.textContent ?? '').not.toContain('Foreign concept');
    pending[pending.length - 1]!({ status: 'ready', facts: dayFacts(date) });
    await harness.fixture.whenStable();
    harness.detectChanges();
    expect(el.textContent).toContain('Synthetic concept');
  });

});

function dayFacts(date: string, counts: PixelDayFacts['counts'] = {}): PixelDayFacts {
  const row = { status: 'ok' as const, included: 1, total: 1, truncated: false };
  return {
    date,
    facts: [],
    annotations: [{
      id: 'world_concept:7',
      conceptId: 7,
      name: 'Synthetic concept',
      understoodOn: date,
      provenance: 'It does not change the Pixels score.',
    }],
    coverage: { town: row, media: row, travel: row, concepts: row },
    differences: [{ id: 'concept-not-score', text: 'It does not change the Pixels score.' }],
    counts,
  };
}
