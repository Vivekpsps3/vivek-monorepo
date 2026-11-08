import { fakeAsync, flush, TestBed, tick } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { todayIsoDate } from '@vivek/browser';
import { lifeAge, lifeRowCount, type DayChannels } from '@vivek/ui';
import { Subject } from 'rxjs';
import { LifePageComponent } from './life-page.component';
import { PixelsDataService } from './pixels-data.service';
import { PixelsPreferences } from './pixels-preferences';
import type { PixelDayView, PixelsLoadRequest, PixelsSnapshot } from './pixels.types';

describe('Life page', () => {
  const financeCleared$ = new Subject<void>();
  let requests: PixelsLoadRequest[];
  let mode: 'life' | 'missing' | 'future' | 'invalid' | 'expired' | 'unavailable' | 'town-down' | 'town-absent' | 'elder';
  let showAge: boolean;
  let financeReady: boolean;

  function channels(fin: number | null): DayChannels {
    return { town: 1, media: 2, trip: 0, fin };
  }

  function view(date: string, fin: number | null): PixelDayView {
    return {
      date,
      channels: channels(fin),
      score: 0,
      level: 0,
      dominant: null,
      trip: null,
      future: false,
      planned: false,
      today: date === todayIsoDate(),
    };
  }

  function snap(request: PixelsLoadRequest, birthday: string | null, days: PixelDayView[] = []): PixelsSnapshot {
    return {
      from: request.from,
      to: request.to,
      days,
      sources: {
        town: mode === 'town-down' ? 'unavailable' : mode === 'town-absent' ? 'absent' : 'ok',
        media: 'ok',
        travel: 'ok',
      },
      firstActivityOn: days[0]?.date ?? null,
      profile: { birthday, showAge },
      financeStatus: financeReady ? 'ready' : 'locked',
      trips: [{ id: 7, title: 'Portland', start: '2026-08-14', end: '2026-08-17' }],
      fetchedAt: 1_700_000_000_000,
    };
  }

  beforeEach(() => {
    localStorage.clear();
    requests = [];
    mode = 'life';
    showAge = false;
    financeReady = true;
    TestBed.configureTestingModule({
      imports: [LifePageComponent],
      providers: [
        provideRouter([]),
        {
          provide: PixelsDataService,
          useValue: {
            financeCleared$,
            load: (request: PixelsLoadRequest) => {
              requests.push(request);
              if (mode === 'expired') return Promise.resolve({ status: 'expired' as const });
              if (mode === 'unavailable') return Promise.resolve({ status: 'unavailable' as const });
              const today = request.today;
              const birthday = mode === 'missing'
                ? null
                : mode === 'invalid'
                  ? 'nope'
                  : mode === 'future'
                    ? `${Number(today.slice(0, 4)) + 1}-01-01`
                    : mode === 'elder'
                      ? '1930-06-01'
                      : '1990-05-04';
              if (request.from === request.to) return Promise.resolve({ status: 'ready' as const, snapshot: snap(request, birthday) });
              return Promise.resolve({
                status: 'ready' as const,
                snapshot: snap(request, birthday, [view(today, 1)]),
              });
            },
          },
        },
      ],
    });
  });

  afterEach(() => {
    localStorage.clear();
    TestBed.resetTestingModule();
  });

  function render() {
    const fixture = TestBed.createComponent(LifePageComponent);
    fixture.detectChanges();
    flush();
    fixture.detectChanges();
    return fixture;
  }

  it('learns the birthday from today, then loads that day through today', fakeAsync(() => {
    const fixture = render();
    const today = todayIsoDate();
    expect(requests.map(request => ({ from: request.from, to: request.to, profile: request.profile, includeTrips: request.includeTrips }))).toEqual([
      { from: today, to: today, profile: true, includeTrips: true },
      { from: '1990-05-04', to: today, profile: true, includeTrips: true },
    ]);
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelectorAll('svg path, svg rect').length).toBeLessThanOrEqual(10);
    expect(el.querySelector('svg')?.textContent).toContain('1990');
    expect(el.textContent).not.toContain('1990-05-04');
    expect(el.textContent).toContain('Town · 1 check-in');
    expect(el.textContent).toContain('Media · 2 episodes');
    expect(el.textContent).toContain('Finance · 1 day kept');
    expect(el.textContent).toContain('Portland');
    expect(el.textContent).toContain('Age is hidden');
    expect(el.querySelector('svg')?.textContent).not.toContain('Age ');
  }));

  it('links to profile when the birthday is missing and does not throw when it is in the future', fakeAsync(() => {
    mode = 'missing';
    let fixture = render();
    let el = fixture.nativeElement as HTMLElement;
    expect(requests.length).toBe(1);
    expect(el.textContent).toContain('Add your birthday');
    expect(el.textContent).toContain('Your birthday stays private.');
    expect(el.querySelector('a')?.getAttribute('href')).toBe('/settings/profile');
    expect(el.querySelector('app-life-poster')).toBeNull();

    mode = 'future';
    requests = [];
    fixture = render();
    el = fixture.nativeElement as HTMLElement;
    expect(requests.length).toBe(1);
    expect(el.textContent).toContain('The saved birthday is in the future, so there is nothing to draw yet.');
    expect(el.textContent).toContain('Fix in Settings');
    expect(el.querySelector('a')?.getAttribute('href')).toBe('/settings/profile');
    expect(el.querySelector('app-life-poster')).toBeNull();

    mode = 'invalid';
    requests = [];
    fixture = render();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Add your birthday');
  }));

  it('keeps rows at and above age 90 and labels ages only when show age is on', fakeAsync(() => {
    mode = 'elder';
    showAge = true;
    const fixture = render();
    const el = fixture.nativeElement as HTMLElement;
    const age = lifeAge('1930-06-01', todayIsoDate());
    expect(age).not.toBeNull();
    const rows = lifeRowCount(age!);
    expect(rows).toBeGreaterThan(90);
    expect(el.querySelector('.life-keys')?.getAttribute('aria-label')).toContain(`${rows} rows of 52 weeks`);
    expect(el.querySelector('svg')?.textContent).toContain('Age 0');
    expect(el.querySelector('svg')?.textContent).not.toContain('1930-06-01');
    expect(el.textContent).toContain(`Age ${age}.`);
    expect(el.textContent).not.toContain('Age is hidden');
    (el.querySelector('button') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(el.querySelector('table')?.textContent).toContain('Jun 1930 – Jun 1931');
    expect(el.querySelector('table')?.textContent).toContain(String(age));
  }));

  it('throttles polite announcements to one per 150ms and moves by week, year, and T', fakeAsync(() => {
    const fixture = render();
    const live = () => (fixture.nativeElement as HTMLElement).querySelector('[aria-live="polite"]')?.textContent ?? '';
    const first = live();
    expect(first).toContain('Week of');
    const group = (fixture.nativeElement as HTMLElement).querySelector('.life-keys') as HTMLElement;
    group.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    group.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    tick(149);
    fixture.detectChanges();
    expect(live()).toBe(first);
    tick(1);
    fixture.detectChanges();
    const moved = live();
    expect(moved).not.toBe(first);
    expect(moved).toContain('Week of');
    expect(moved).not.toContain('Age ');

    group.dispatchEvent(new KeyboardEvent('keydown', { key: 't', bubbles: true }));
    tick(150);
    fixture.detectChanges();
    expect(live()).toContain('This week.');

    const steps = (fixture.nativeElement as HTMLElement).querySelectorAll('.life-steppers button');
    steps[1]!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    tick(150);
    fixture.detectChanges();
    expect(live()).not.toContain('This week.');
  }));

  it('switches to the week table through the saved view and drops finance when the vault locks', fakeAsync(() => {
    const fixture = render();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain('Finance · 1 day kept');
    el.querySelector('button')!.click();
    fixture.detectChanges();
    expect(TestBed.inject(PixelsPreferences).view()).toBe('table');
    expect(localStorage.getItem('pixels.view')).toBe('table');
    expect(el.querySelector('table')?.textContent).toContain('May 1990 – May 1991');
    expect(el.querySelector('svg')).toBeNull();
    expect(el.textContent).not.toContain('1990-05-04');

    financeCleared$.next();
    fixture.detectChanges();
    expect(el.textContent).toContain('Finance is locked. Unlock to include budget kept.');
    expect(el.textContent).not.toContain('1 day kept');
  }));

  it('shows source failure, session expiry, and retry without a town row when town is absent', fakeAsync(() => {
    mode = 'expired';
    let fixture = render();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Your session ended. Sign in again to see your pixels.');

    mode = 'unavailable';
    requests = [];
    fixture = render();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain("Couldn't load your pixels.");
    mode = 'town-down';
    el.querySelector('button')!.click();
    flush();
    fixture.detectChanges();
    expect(el.textContent).toContain('Town data unavailable. Squares show Media and Travel.');
    expect(requests.at(-1)?.profile).toBeTrue();

    mode = 'town-absent';
    requests = [];
    fixture = render();
    const absent = fixture.nativeElement as HTMLElement;
    expect(absent.textContent).not.toContain('Town is not set up');
    expect(absent.textContent).not.toContain('Town ·');
  }));
});
