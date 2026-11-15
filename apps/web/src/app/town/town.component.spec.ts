import { TestBed, fakeAsync, tick } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { BehaviorSubject, Subject } from 'rxjs';
import { ToastService } from '@vivek/ui';
import { VAULT_PRESENCE } from '../../../../finance/frontend/src/public-api';
import { SessionService } from '../platform/session.service';
import { TownApiService, type CheckinResult } from './town.api';
import { TOWN_BUDGET_KEPT, TownComponent } from './town.component';
import { LOT_UNLOCK_LV } from './town.constants';
import type { Habit, TownResponse } from './town.types';

function localDay(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
function keptBudgetWeeks(count: number): { weekStart: string; kept: true }[] {
  const weeks: { weekStart: string; kept: true }[] = [];
  let cursor = '2026-10-19';
  for (let index = 0; index < count; index += 1) {
    weeks.push({ weekStart: cursor, kept: true });
    const [year, month, day] = cursor.split('-').map(Number);
    cursor = new Date(Date.UTC(year, month - 1, day - 7)).toISOString().slice(0, 10);
  }
  return weeks;
}
function snapshot(): TownResponse {
  const building = { xp: 0, level: 1, stage: 1 as const, level_xp_start: 0, next_level_xp: 50, today_xp: 0, today_cap: 10, source: 'ok' as const };
  return {
    town: { name: 'Terraria-on-Sea', founded_on: '2026-10-05', today: '2026-10-29', tz: 'America/Los_Angeles', xp: 340, level: 3, level_xp_start: 250, next_level_xp: 500 },
    buildings: { library: building, inn: { ...building, today_cap: 15 } },
    lots: LOT_UNLOCK_LV.map((unlock_level, slot) => ({ slot, unlock_level, state: unlock_level > 3 ? 'locked' : 'empty', habit_id: null })),
    habits: [], archived: [], today: { done: 0, total: 0 }, constants_version: 1,
  };
}
describe('Town page', () => {
  let response: Subject<TownResponse>;
  let api: { getTown: jasmine.Spy; checkin: jasmine.Spy };
  let budget: jasmine.Spy;
  let user: BehaviorSubject<{ id: number } | null>;
  let cleared: Subject<void>;
  const session: { user: { id: number } | null; readonly currentUser: { id: number } | null; user$: BehaviorSubject<{ id: number } | null>; cleared$: Subject<void> } = {
    user: { id: 7 },
    get currentUser() { return this.user; },
    user$: null as unknown as BehaviorSubject<{ id: number } | null>,
    cleared$: null as unknown as Subject<void>,
  };
  beforeEach(() => {
    localStorage.clear();
    response = new Subject();
    user = new BehaviorSubject<{ id: number } | null>({ id: 7 });
    cleared = new Subject<void>();
    session.user = { id: 7 };
    session.user$ = user;
    session.cleared$ = cleared;
    budget = jasmine.createSpy('loadFinanceBudgetKept').and.resolveTo({ status: 'locked' });
    api = { getTown: jasmine.createSpy().and.callFake(() => response), checkin: jasmine.createSpy() };
    TestBed.configureTestingModule({
      imports: [TownComponent],
      providers: [
        provideRouter([]),
        { provide: TownApiService, useValue: api },
        { provide: SessionService, useValue: session },
        { provide: TOWN_BUDGET_KEPT, useValue: budget },
      ],
    });
  });
  function render(data?: TownResponse) {
    const fixture = TestBed.createComponent(TownComponent);
    fixture.detectChanges();
    if (data) { response.next(data); fixture.detectChanges(); }
    return { fixture, el: fixture.nativeElement as HTMLElement };
  }
  it('loads a header, nine tiles and three Today skeleton rows, then renders server progress', () => {
    const { fixture, el } = render();
    expect(el.querySelectorAll('.tile-skeleton').length).toBe(9);
    expect(el.querySelectorAll('ui-card .ui-skeleton__line').length).toBe(3);
    expect(el.querySelector('.header-skeleton')).not.toBeNull();
    response.next(snapshot()); fixture.detectChanges();
    expect(el.textContent).toContain('Lv 3 · 340 / 500 XP');
    const bar = el.querySelector('[role="progressbar"]')!;
    for (const [name, value] of Object.entries({ valuemin: '250', valuemax: '500', valuenow: '340', valuetext: 'Level 3, 340 of 500 XP' })) expect(bar.getAttribute(`aria-${name}`)).toBe(value);
    expect(el.querySelectorAll('ul > li').length).toBe(9);
    expect([...el.querySelectorAll('.name')].slice(0, 3).map(n => n.textContent)).toEqual(['Library', 'Inn', 'Treasury']);
    expect(el.querySelectorAll('ui-card h2').length).toBe(1);
    expect(el.querySelector('a[href="/town/world"]')?.textContent?.trim()).toBe('Explore the world');
  });
  it('shows max level without a next-XP denominator', () => {
    const data = snapshot(); Object.assign(data.town, { level: 10, xp: 5500, level_xp_start: 5000, next_level_xp: null });
    expect(render(data).el.textContent).toContain('Lv 10 · Max');
  });
  it('omits the progress bar at max level and renders Lv 10 · Max', () => {
    const data = snapshot(); Object.assign(data.town, { level: 10, xp: 5500, level_xp_start: 5000, next_level_xp: null });
    const el = render(data).el;
    expect(el.querySelector('header p')?.textContent).toBe('Lv 10 · Max');
    expect(el.querySelector('progress')).toBeNull();
    expect(el.querySelector('[role="progressbar"]')).toBeNull();
  });
  it('recovers from unavailable via Retry', () => {
    const { fixture, el } = render();
    response.error({ status: 503 }); fixture.detectChanges();
    expect(el.textContent).toContain('Town is unavailable right now.');
    response = new Subject();
    el.querySelector<HTMLButtonElement>('button')!.click();
    expect(api.getTown).toHaveBeenCalledTimes(2);
    response.next(snapshot()); fixture.detectChanges();
    expect(el.querySelector('ul')).not.toBeNull();
  });
  function expectOnePage(el: HTMLElement, heading: string): void {
    const mains = [...el.querySelectorAll('main')];
    expect(mains.length).toBe(1);
    const headings = [...el.querySelectorAll('h1')];
    expect(headings.length).toBe(1);
    expect(headings[0].textContent?.trim()).toBe(heading);
    expect(mains[0].contains(headings[0])).toBeTrue();
    const banner = el.querySelector('header');
    expect(banner).not.toBeNull();
    expect(mains[0].contains(banner)).toBeTrue();
    expect(el.querySelector('main main')).toBeNull();
  }
  it('keeps one main and the page heading through loading, error, and ready', () => {
    const { fixture, el } = render();
    expectOnePage(el, 'Town');
    expect(el.querySelector('main [aria-label="Loading Town"]')).not.toBeNull();
    response.error({ status: 503 }); fixture.detectChanges();
    expectOnePage(el, 'Town');
    expect(el.textContent).toContain('Town is unavailable right now.');
    response = new Subject();
    el.querySelector<HTMLButtonElement>('button')!.click();
    response.next(snapshot()); fixture.detectChanges();
    expectOnePage(el, 'Terraria-on-Sea');
    expect(el.querySelector('header a')?.getAttribute('href')).toBe('/town/world');
  });
  it('does not render a session-expired banner on 401', () => {
    const { fixture, el } = render();
    response.error({ status: 401 }); fixture.detectChanges();
    expect(el.textContent).not.toContain('Your session ended');
    expect(el.textContent).not.toContain('Town is unavailable right now.');
    expect(el.querySelector('a[href^="/auth/login"]')).toBeNull();
    expect(el.querySelector('[aria-label="Loading Town"]')).not.toBeNull();
  });
  it('offers the exact first-run copy and all three prefills, hiding Today', () => {
    const data = snapshot(); data.town.founded_on = null;
    const { fixture, el } = render(data);
    const open = spyOn(fixture.componentInstance, 'openHabitDialog');
    expect(el.textContent).toContain('Found Terraria-on-Sea');
    expect(el.textContent).toContain('Pick a first habit. Your town grows as you keep it, and as you watch things in Media and finish trips in Travel.');
    expect(el.textContent).toContain('Media and Travel count from today on.');
    expect(el.querySelector('ui-card')).toBeNull();
    expect(el.querySelector('a[href="/town/world"]')?.textContent?.trim()).toBe('Explore the world');
    expect(el.querySelector('img')?.width).toBe(128);
    const buttons = [...el.querySelectorAll('button')];
    buttons[0].click(); expect(open).toHaveBeenCalledWith(0, null);
    for (const [index, name] of ['Read 20 pages', 'Walk 30 minutes', 'Sleep by 12'].entries()) {
      expect(buttons[index + 1].textContent?.trim()).toBe(name);
      buttons[index + 1].click(); expect(open).toHaveBeenCalledWith(0, null, name);
    }
  });
  it('retains the founded scene with no active habits and forwards empty-lot clicks', () => {
    const { fixture, el } = render(snapshot());
    const open = spyOn(fixture.componentInstance, 'openHabitDialog');
    expect(el.textContent).toContain('No active habits');
    el.querySelector<HTMLButtonElement>('ul button')!.click(); expect(open).toHaveBeenCalledWith(0, null);
    el.querySelector<HTMLButtonElement>('ui-card button')!.click(); expect(open).toHaveBeenCalledWith(null, null);
  });
  it('renders the next-unlock and all-built helper copy', () => {
    const data = snapshot(); data.lots.forEach(lot => { if (lot.state === 'empty') lot.state = 'occupied'; });
    const { fixture, el } = render(data);
    expect(el.querySelector('footer')?.textContent).toBe('All unlocked lots are built. Reach Lv 5 for another.');
    data.lots.forEach(lot => lot.state = 'occupied'); response.next(data); fixture.detectChanges();
    expect(el.querySelector('footer')?.textContent).toBe('All lots are built.');
  });
  it('refreshes only on a visible date change, polls every five minutes, and cleans up', fakeAsync(() => {
    // mockDate sets fakeAsync's base time. install() would replace zone's interval, so the poll would never run.
    jasmine.clock().mockDate(new Date(2026, 9, 29, 12, 0, 0));
    const today = localDay(new Date());
    expect(today).toBe('2026-10-29');
    const visibility = spyOnProperty(document, 'visibilityState', 'get').and.returnValue('hidden');
    const data = snapshot(); data.town.today = '2000-01-01';
    const { fixture } = render(data);
    tick(300_000); expect(localDay(new Date())).toBe(today); expect(api.getTown).toHaveBeenCalledTimes(1);
    visibility.and.returnValue('visible'); document.dispatchEvent(new Event('visibilitychange'));
    expect(api.getTown).toHaveBeenCalledTimes(2);
    data.town.today = today; response.next(data); tick(300_000);
    expect(api.getTown).toHaveBeenCalledTimes(2);
    data.town.today = '2000-01-01'; response.next(data); tick(300_000);
    expect(api.getTown).toHaveBeenCalledTimes(3);
    fixture.destroy(); tick(300_000); document.dispatchEvent(new Event('visibilitychange'));
    expect(api.getTown).toHaveBeenCalledTimes(3);
  }));
  it('refreshes once when the visible local date changes across midnight', fakeAsync(() => {
    // Local 23:55 plus five minutes is 00:00 the next day in every timezone.
    jasmine.clock().mockDate(new Date(2026, 9, 29, 23, 55, 0));
    expect(localDay(new Date())).toBe('2026-10-29');
    spyOnProperty(document, 'visibilityState', 'get').and.returnValue('visible');
    expect(document.visibilityState).toBe('visible');
    const data = snapshot(); data.town.today = '2026-10-29';
    const { fixture } = render(data);
    tick(4 * 60_000);
    expect(localDay(new Date())).toBe('2026-10-29');
    expect(api.getTown).toHaveBeenCalledTimes(1);
    tick(60_000);
    expect(localDay(new Date())).toBe('2026-10-30');
    expect(api.getTown).toHaveBeenCalledTimes(2);
    tick(300_000);
    expect(api.getTown).toHaveBeenCalledTimes(2);
    data.town.today = '2026-10-30'; response.next(data); tick(300_000);
    expect(localDay(new Date())).toBe('2026-10-30');
    expect(api.getTown).toHaveBeenCalledTimes(2);
    fixture.destroy(); tick(300_000); document.dispatchEvent(new Event('visibilitychange'));
    expect(api.getTown).toHaveBeenCalledTimes(2);
  }));
  it('writes seen levels silently, then toasts once and swaps a stage', () => {
    const toast = TestBed.inject(ToastService);
    const success = spyOn(toast, 'success');
    const data = snapshot();
    const { fixture, el } = render(data);
    expect(success).not.toHaveBeenCalled();
    expect(JSON.parse(localStorage.getItem('town.seen.v1.7')!)).toEqual({ town: 3, b: { library: 1, inn: 1 } });
    data.town.level = 5; data.town.xp = 900; data.town.level_xp_start = 900; data.town.next_level_xp = 1400;
    data.buildings.library = { ...data.buildings.library, level: 4, stage: 3 };
    response.next(data); fixture.detectChanges();
    expect(success).toHaveBeenCalledOnceWith('Level up! Terraria-on-Sea Lv 5 · Library Lv 4 · New lot unlocked');
    expect(el.querySelector('.swap img.old')?.getAttribute('src')).toBe('/town/library-1.svg');
    expect(el.querySelector('.swap img.new')?.getAttribute('src')).toBe('/town/library-3.svg');
    data.buildings.library.source = 'unavailable';
    response.next(data); fixture.detectChanges();
    expect(success).toHaveBeenCalledTimes(1);
    expect(JSON.parse(localStorage.getItem('town.seen.v1.7')!).town).toBe(5);
  });
  it('announces a check-in without the XP clause when the refetch toasts', () => {
    const toast = TestBed.inject(ToastService);
    spyOn(toast, 'success');
    const read = {
      id: 12, name: 'Read 20 pages', slot: 0, building_style: 'forge',
      cadence: { per_week: 7, kind: 'daily', pending: null }, created_on: '2026-10-05', archived_on: null,
      xp: 80, level: 2, stage: 2, level_xp_start: 50, next_level_xp: 150,
      streak: { unit: 'days', current: 3, best: 3, best_days: 3, best_weeks: 0, rest_day_available: true, rest_used_on: null },
      week: null, checked_today: false, checked_yesterday: true, can_check_yesterday: false, last7: [],
    } as Habit;
    const data = snapshot(); data.habits = [read];
    const checkin = new Subject<CheckinResult>();
    api.checkin = jasmine.createSpy().and.returnValue(checkin);
    const { fixture, el } = render(data);
    el.querySelector<HTMLButtonElement>('ui-card button')!.click();
    expect(api.checkin).toHaveBeenCalledWith(12, '2026-10-29');
    const result: CheckinResult = {
      day: '2026-10-29', checked: true,
      habit: { ...read, checked_today: true, streak: { ...read.streak, current: 4 } },
      town: { xp: 500, level: 4, level_xp_start: 500, next_level_xp: 900 },
    };
    checkin.next(result);
    data.town = { ...data.town, ...result.town };
    data.habits = [result.habit];
    response.next(data); fixture.detectChanges();
    expect(toast.success).toHaveBeenCalledOnceWith('Terraria-on-Sea reached Lv 4!');
    expect(el.querySelector('[aria-live="polite"]')?.textContent).toBe('Read 20 pages checked. 4-day streak.');
  });
  it('leaves the skeletons behind when the snapshot lots are malformed', () => {
    const data = snapshot();
    Object.assign(data, { lots: null });
    const { fixture, el } = render(data);
    expect(fixture.componentInstance.state()).toBe('ready');
    expect(el.querySelector('[aria-label="Loading Town"]')).toBeNull();
    expect(el.textContent).toContain('Lv 3 · 340 / 500 XP');
  });
  it('renders even when localStorage throws', () => {
    spyOn(Storage.prototype, 'getItem').and.throwError(new Error('blocked'));
    spyOn(Storage.prototype, 'setItem').and.throwError(new Error('blocked'));
    const { fixture, el } = render(snapshot());
    expect(fixture.componentInstance.state()).toBe('ready');
    expect(el.textContent).toContain('Lv 3 · 340 / 500 XP');
  });
  it('explains a locked Finance vault on the treasury tile and in Today', () => {
    const { el } = render(snapshot());
    const tile = el.querySelectorAll('ul > li')[2] as HTMLElement;
    expect(tile.querySelector('img')?.getAttribute('src')).toBe('/town/treasury-locked.svg');
    expect(tile.textContent).toContain('Finance vault locked');
    expect(tile.textContent).not.toMatch(/\d/);
    expect(tile.querySelector('a')?.getAttribute('href')).toBe('/finance/vault/unlock?next=%2Ftown');
    expect(el.querySelector('.treasury a')?.textContent?.trim()).toBe('Finance vault locked');
    expect(budget).not.toHaveBeenCalled();
    expect(el.querySelector('ui-skeleton')).toBeNull();
    expect(tile.textContent).not.toMatch(/\$/);
  });
  it('shows the treasury tier from completed budget weeks, not a long habit streak', async () => {
    localStorage.setItem(VAULT_PRESENCE, '7');
    let release: (result: { status: string; weeks?: { weekStart: string; kept: boolean | null }[] }) => void = () => undefined;
    budget.and.returnValue(new Promise(resolve => { release = resolve; }));
    const data = snapshot();
    data.town = { ...data.town, xp: 340, level: 3, level_xp_start: 250, next_level_xp: 500 };
    data.habits = [{
      id: 4, name: 'Walk', slot: 0, building_style: 'garden',
      cadence: { per_week: 3, kind: 'weekly', pending: null }, created_on: '2026-10-05', archived_on: null,
      xp: 80, level: 2, stage: 2, level_xp_start: 50, next_level_xp: 150,
      streak: { unit: 'weeks', current: 4, best: 4, best_days: 0, best_weeks: 4, rest_day_available: null, rest_used_on: null },
      week: { done: 1, target: 3 }, checked_today: false, checked_yesterday: false, can_check_yesterday: true, last7: [],
    } as Habit];
    const { fixture, el } = render(data);
    const tile = () => el.querySelectorAll('ul > li')[2] as HTMLElement;
    expect(tile().textContent).toContain('Loading');
    expect(tile().textContent).not.toContain('Lv 4');
    expect(budget).toHaveBeenCalledOnceWith(
      jasmine.any(Object),
      jasmine.any(AbortSignal),
      { today: '2026-10-29', weeks: 52, includeCurrentWeek: false, deadlineMs: 8000 },
    );
    release({
      status: 'ready',
      weeks: [
        { weekStart: '2026-10-26', kept: true },
        { weekStart: '2026-10-19', kept: false },
        { weekStart: '2026-10-12', kept: true },
      ],
    });
    await fixture.whenStable();
    fixture.detectChanges();
    expect(tile().querySelector('img')?.getAttribute('src')).toBe('/town/treasury-1.svg');
    expect(tile().textContent).toContain('Lv 1 · 0 weeks');
    expect(tile().textContent).not.toContain('Lv 4');
    expect(el.querySelector('.treasury')?.textContent).toContain('Lv 1 · 0 weeks');
    expect(el.textContent).toContain('Lv 3 · 340 / 500 XP');
    expect(tile().querySelector('a')?.getAttribute('href')).toBe('/finance');
    expect(tile().textContent).not.toMatch(/\$/);
    expect(el.querySelector('ui-skeleton')).toBeNull();

    release = () => undefined;
    budget.and.returnValue(new Promise(resolve => { release = resolve; }));
    response.next(data);
    fixture.detectChanges();
    expect(tile().textContent).toContain('Loading');
    release({
      status: 'ready',
      weeks: [
        { weekStart: '2026-10-26', kept: false },
        { weekStart: '2026-10-19', kept: true },
        { weekStart: '2026-10-12', kept: true },
      ],
    });
    await fixture.whenStable();
    fixture.detectChanges();
    expect(tile().querySelector('img')?.getAttribute('src')).toBe('/town/treasury-2.svg');
    expect(tile().textContent).toContain('Lv 3 · 2 weeks');
    expect(el.querySelector('.treasury')?.textContent).toContain('Lv 3 · 2 weeks');
    expect(el.textContent).toContain('Lv 3 · 340 / 500 XP');
    expect(el.querySelector('ui-skeleton')).toBeNull();
  });
  it('clears a visible treasury tier on lock and does not let the old load return', async () => {
    localStorage.setItem(VAULT_PRESENCE, '7');
    let release: (result: { status: string; weeks?: { weekStart: string; kept: boolean | null }[] }) => void = () => undefined;
    budget.and.callFake(() => new Promise(resolve => { release = resolve; }));
    const { fixture, el } = render(snapshot());
    const tile = () => el.querySelectorAll('ul > li')[2] as HTMLElement;
    const xp = 'Lv 3 · 340 / 500 XP';
    expect(el.textContent).toContain(xp);
    release({ status: 'ready', weeks: [{ weekStart: '2026-10-19', kept: true }] });
    await fixture.whenStable();
    fixture.detectChanges();
    expect(tile().textContent).toContain('Lv 2 · 1 week');

    response.next(snapshot());
    fixture.detectChanges();
    expect(tile().textContent).toContain('Loading');
    const late = release;
    localStorage.removeItem(VAULT_PRESENCE);
    cleared.next();
    fixture.detectChanges();
    expect(tile().textContent).toContain('Finance vault locked');
    expect(tile().textContent).not.toContain('Lv 2');
    late({ status: 'ready', weeks: keptBudgetWeeks(8) });
    await fixture.whenStable();
    fixture.detectChanges();
    expect(tile().textContent).toContain('Finance vault locked');
    expect(tile().textContent).not.toContain('Lv 5');
    expect(el.textContent).toContain(xp);
    expect(tile().textContent).not.toMatch(/\$/);

    const callsAtLock = budget.calls.count();
    session.user = { id: 8 };
    user.next({ id: 8 });
    fixture.detectChanges();
    expect(tile().textContent).toContain('Finance vault locked');
    expect(budget.calls.count()).toBe(callsAtLock);

    session.user = { id: 9 };
    localStorage.setItem(VAULT_PRESENCE, '9');
    user.next({ id: 9 });
    fixture.detectChanges();
    expect(tile().textContent).toContain('Loading');
    expect(tile().textContent).not.toContain('Lv 2');
    release({ status: 'no_plan' });
    await fixture.whenStable();
    fixture.detectChanges();
    expect(tile().textContent).toContain('No spending plan');
    expect(tile().querySelector('a')?.getAttribute('href')).toBe('/finance/planning');
    expect(el.textContent).toContain(xp);
    localStorage.removeItem(VAULT_PRESENCE);
    session.user = null;
    user.next(null);
    fixture.detectChanges();
    expect(tile().textContent).toContain('Finance vault locked');
    expect(tile().textContent).not.toContain('No spending plan');
  });
  it('reflows to two columns below the minimum tile width using the scene container', () => {
    const { el } = render(snapshot());
    const scene = el.querySelector<HTMLElement>('.scene')!;
    scene.style.width = '300px';
    expect(getComputedStyle(el.querySelector('ul')!).gridTemplateColumns.split(' ').length).toBe(2);
    scene.style.width = '400px';
    expect(getComputedStyle(el.querySelector('ul')!).gridTemplateColumns.split(' ').length).toBe(3);
  });
});
