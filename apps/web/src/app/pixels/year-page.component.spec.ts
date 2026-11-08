import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { Subject } from 'rxjs';
import { todayIsoDate } from '@vivek/browser';
import { composeSnapshot } from './pixels-model';
import { PixelsPreferences } from './pixels-preferences';
import { PixelsDataService } from './pixels-data.service';
import type { PixelsLoadRequest, PixelsLoadResult, PixelsSnapshot } from './pixels.types';
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
    TestBed.configureTestingModule({
      providers: [
        provideRouter([{ path: 'pixels', component: YearPageComponent }]),
        { provide: PixelsDataService, useValue: { load, financeCleared$, userChanged$ } },
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

  it('shows the clamp notice and replaces an unusable year', async () => {
    const harness = await open('/pixels?year=nope');
    const year = Number(todayIsoDate().slice(0, 4));
    const el = harness.routeNativeElement as HTMLElement;
    expect(el.querySelector('.pixels-notice')?.textContent?.trim()).toBe(`Showing ${year}. nope is not a year.`);
    const url = TestBed.inject(Router).url;
    expect(url).toContain(`year=${year}`);
    expect(url).not.toContain('nope');
    expect(url).not.toContain('day=');
  });

  it('shows the clamp notice and drops a day that is not in the year', async () => {
    const year = todayIsoDate().slice(0, 4);
    const harness = await open(`/pixels?year=${year}&day=2024-02-31`);
    const el = harness.routeNativeElement as HTMLElement;
    expect(el.querySelector('.pixels-notice')?.textContent?.trim())
      .toBe(`No day selected. 2024-02-31 is not a date in ${Number(year)}.`);
    expect(TestBed.inject(Router).url).not.toContain('day=');
  });

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
    expect(link?.getAttribute('href')).toBe('/finance/vault/unlock?next=%2Fpixels');
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

  it('selects a day in the query and swaps to the table', async () => {
    const year = todayIsoDate().slice(0, 4);
    const harness = await open(`/pixels?year=${year}`);
    const el = harness.routeNativeElement as HTMLElement;
    el.querySelector<HTMLButtonElement>(`[data-date="${year}-01-01"]`)!.click();
    await harness.fixture.whenStable();
    harness.detectChanges();
    expect(TestBed.inject(Router).url).toContain(`day=${year}-01-01`);
    expect(el.querySelector(`#pixel-day-${year}-01-01`)?.classList.contains('selected')).toBeTrue();
    expect(el.querySelector('app-day-detail')).not.toBeNull();

    const view = [...el.querySelectorAll('button')].find(button => button.textContent?.includes('View as table'));
    view!.click();
    harness.detectChanges();
    expect(TestBed.inject(PixelsPreferences).view()).toBe('table');
    expect(el.querySelector('[role="grid"]')).toBeNull();
    expect(el.querySelector('app-year-table')).not.toBeNull();
    expect(el.querySelector('app-day-detail')).toBeNull();
  });
});
