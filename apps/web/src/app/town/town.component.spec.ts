import { TestBed,fakeAsync,tick } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { BehaviorSubject,Subject } from 'rxjs';
import { ToastService } from '@vivek/ui';
import { VAULT_PRESENCE } from '../../../../finance/frontend/src/public-api';
import { PixelsDataService } from '../pixels/pixels-data.service';
import { SessionService } from '../platform/session.service';
import { TownApiService, type CheckinResult } from './town.api';
import { TOWN_BUDGET_KEPT, TOWN_HEALTH_STAGES, TownComponent } from './town.component';
import { LOT_UNLOCK_LV } from './town.constants';
import type { TownResponse } from './town.types';

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
async function flushBudget(fixture: { detectChanges(): void }): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  fixture.detectChanges();
}
function treasuryTile(el: HTMLElement): HTMLElement {
  const tile = [...el.querySelectorAll('[aria-label="Town buildings"] li')].find(item => item.textContent?.includes('Treasury'));
  if (!(tile instanceof HTMLElement)) throw new Error('missing treasury');
  return tile;
}
function clinicLink(el: HTMLElement): HTMLAnchorElement {
  const link = el.querySelector('[data-building="clinic"]');
  if (!(link instanceof HTMLAnchorElement)) throw new Error('missing clinic');
  return link;
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
  let created: Subject<unknown>;
  let api: { getTown: jasmine.Spy; checkin: jasmine.Spy; undoCheckin: jasmine.Spy; createHabit: jasmine.Spy };
  let budget: jasmine.Spy;
  let health: jasmine.Spy;
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
    created = new Subject();
    user = new BehaviorSubject<{ id: number } | null>({ id: 7 });
    cleared = new Subject<void>();
    session.user = { id: 7 };
    session.user$ = user;
    session.cleared$ = cleared;
    budget = jasmine.createSpy('loadFinanceBudgetKept').and.resolveTo({ status: 'locked' });
    health = jasmine.createSpy('loadTownHealthStages').and.resolveTo({ state: 'locked' });
    api = {
      getTown: jasmine.createSpy().and.callFake(() => response),
      checkin: jasmine.createSpy(),
      undoCheckin: jasmine.createSpy().and.callFake(() => new Subject()),
      createHabit: jasmine.createSpy().and.callFake(() => created),
    };
    TestBed.configureTestingModule({
      imports: [TownComponent],
      providers: [
        provideRouter([]),
        { provide: TownApiService, useValue: api },
        { provide: SessionService, useValue: session },
        { provide: TOWN_BUDGET_KEPT, useValue: budget },
        { provide: TOWN_HEALTH_STAGES, useValue: health },
        { provide: PixelsDataService, useValue: { loadDay: () => Promise.resolve({ status: 'dropped' }) } },
      ],
    });
  });
  function render(data?: TownResponse) {
    const fixture = TestBed.createComponent(TownComponent);
    fixture.detectChanges();
    if (data) { response.next(data); fixture.detectChanges(); }
    return { fixture, el: fixture.nativeElement as HTMLElement };
  }

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

  it('does not render a session-expired banner on 401', () => {
    const { fixture, el } = render();
    response.error({ status: 401 }); fixture.detectChanges();
    expect(el.textContent).not.toContain('Your session ended');
    expect(el.textContent).not.toContain('Town is unavailable right now.');
    expect(el.querySelector('a[href^="/auth/login"]')).toBeNull();
    expect(el.querySelector('[aria-label="Loading Town"]')).not.toBeNull();
  });

  it('renders the next-unlock and all-built helper copy', () => {
    const data = snapshot(); data.lots.forEach(lot => { if (lot.state === 'empty') lot.state = 'occupied'; });
    const { fixture, el } = render(data);
    expect(el.querySelector('footer')?.textContent).toBe('All unlocked lots are built. Reach Lv 5 for another.');
    data.lots.forEach(lot => lot.state = 'occupied'); response.next(data); fixture.detectChanges();
    expect(el.querySelector('footer')?.textContent).toBe('All lots are built.');
  });

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

  it('explains a locked Finance vault on the treasury tile and in Today', () => {
    const { el } = render(snapshot());
    const tile = treasuryTile(el);
    expect(tile.querySelector('img')?.getAttribute('src')).toBe('/town/treasury-locked.svg');
    expect(tile.textContent).toContain('Finance vault locked');
    expect(tile.textContent).not.toMatch(/\d/);
    expect(tile.querySelector('a')?.getAttribute('href')).toBe('/finance/vault/unlock?next=%2Ftown');
    expect(el.querySelector('.treasury a')?.textContent?.trim()).toBe('Finance vault locked');
    expect(budget).not.toHaveBeenCalled();
    expect(health).not.toHaveBeenCalled();
    expect(el.querySelector('ui-skeleton')).toBeNull();
    expect(tile.textContent).not.toMatch(/\$/);
  });

  it('clears a visible treasury tier on lock and does not let the old load return', async () => {
    localStorage.setItem(VAULT_PRESENCE, '7');
    let release: (result: { status: string; weeks?: { weekStart: string; kept: boolean | null }[] }) => void = () => undefined;
    budget.and.callFake(() => new Promise(resolve => { release = resolve; }));
    const { fixture, el } = render(snapshot());
    const tile = () => treasuryTile(el);
    const xp = 'Lv 3 · 340 / 500 XP';
    expect(el.textContent).toContain(xp);
    release({ status: 'ready', weeks: [{ weekStart: '2026-10-19', kept: true }] });
    await flushBudget(fixture);
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
    await flushBudget(fixture);
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
    await flushBudget(fixture);
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

  it('keeps the town and an open draft when a later load fails', () => {
    const toast = TestBed.inject(ToastService);
    spyOn(toast, 'error');
    const { fixture, el } = render(snapshot());
    fixture.componentInstance.openHabitDialog(0, null, 'Walk 30 minutes');
    fixture.detectChanges();
    expect(el.querySelector<HTMLInputElement>('#habit-name')?.value).toBe('Walk 30 minutes');
    response.error({ status: 503 });
    fixture.detectChanges();
    expect(el.querySelector('[aria-label="Town buildings"]')).not.toBeNull();
    expect(el.textContent).toContain('Terraria-on-Sea');
    expect(el.textContent).not.toContain('Retry');
    expect(el.querySelector<HTMLInputElement>('#habit-name')?.value).toBe('Walk 30 minutes');
    expect(toast.error).toHaveBeenCalledWith('Town is unavailable right now.');
    expect(el.textContent).not.toContain('Your session ended');
  });

  it('does not paint a session banner when a ready town receives 401', () => {
    const { fixture, el } = render(snapshot());
    response.error({ status: 401 });
    fixture.detectChanges();
    expect(el.textContent).not.toContain('Your session ended');
    expect(el.querySelector('[aria-label="Loading Town"]')).not.toBeNull();
  });

  it('shows entrances before the first habit', () => {
    const data = snapshot();
    data.town.founded_on = null;
    data.town.level = 1;
    data.town.xp = 0;
    data.town.next_level_xp = 100;
    data.lots = LOT_UNLOCK_LV.map((unlock_level, slot) => ({
      slot, unlock_level, state: unlock_level > 1 ? 'locked' as const : 'empty' as const, habit_id: null,
    }));
    const { el } = render(data);
    expect(el.textContent).toContain('Found Terraria-on-Sea');
    expect(el.textContent).toContain('Choose a first habit');
    expect(el.textContent).toContain('Read 20 pages');
    expect(el.querySelector('a[href="/town/library"]')?.textContent).toContain('Visit the Reading Hall');
    expect(el.querySelector('a[href="/town/keepsakes"]')?.textContent).toContain('Keepsake shelf');
    expect(el.querySelector('a[href="/town/home/living"]')?.textContent).toContain('Visit Home');
    expect(el.querySelector('a[href="/town/hall"]')?.textContent).toContain('Visit the Hall');
    const list = el.querySelector('[aria-label="Town buildings"]');
    expect(list?.textContent).toContain('Library');
    expect(list?.textContent).toContain('Inn');
    expect(list?.textContent).toContain('Clinic');
    expect(list?.textContent).toContain('Empty lot');
    expect(el.textContent).toContain('Harbor');
    expect(el.querySelector('a[href="/travel"]')).not.toBeNull();
    const clinic = clinicLink(el);
    expect(clinic.getAttribute('href')).toBe('/town/clinic');
    expect(clinic.textContent).not.toMatch(/\d/);
  });

  it('drops a late Health result on lock and keeps the Clinic route without digits', async () => {
    localStorage.setItem(VAULT_PRESENCE, '7');
    let release: (value: { state: 'ready'; clinic: 2; gym: 1 }) => void = () => undefined;
    health.and.callFake(() => new Promise(resolve => { release = resolve; }));
    const { fixture, el } = render(snapshot());
    fixture.componentInstance.openHabitDialog(0, null, 'Walk 30 minutes');
    fixture.detectChanges();
    const clinic = () => clinicLink(el);
    expect(clinic().textContent).toContain('Loading');
    expect(el.querySelector<HTMLInputElement>('#habit-name')?.value).toBe('Walk 30 minutes');
    window.dispatchEvent(new StorageEvent('storage', { key: null }));
    fixture.detectChanges();
    expect(clinic().textContent).toContain('Health locked');
    expect(clinic().textContent).not.toMatch(/\d/);
    expect(clinic().querySelector('img')?.getAttribute('src')).toBe('/town/clinic-locked.svg');
    expect(clinic().getAttribute('href')).toBe('/town/clinic');
    expect(el.querySelector<HTMLInputElement>('#habit-name')?.value).toBe('Walk 30 minutes');
    release({ state: 'ready', clinic: 2, gym: 1 });
    await flushBudget(fixture);
    expect(clinic().textContent).toContain('Health locked');
    expect(clinic().querySelector('img')?.getAttribute('src')).toBe('/town/clinic-locked.svg');
    expect(clinic().textContent).not.toMatch(/\d/);
  });

  it('clears a private draft when the owner changes or the session ends', () => {
    const { fixture, el } = render(snapshot());
    fixture.componentInstance.openHabitDialog(0, null, 'Walk 30 minutes');
    fixture.detectChanges();
    expect(el.querySelector('#habit-name')).not.toBeNull();
    session.user = { id: 8 };
    user.next({ id: 8 });
    fixture.detectChanges();
    expect(el.querySelector('app-habit-dialog')).toBeNull();

    fixture.componentInstance.openHabitDialog(1, null, 'Sleep by 12');
    fixture.detectChanges();
    expect(el.querySelector<HTMLInputElement>('#habit-name')?.value).toBe('Sleep by 12');
    cleared.next();
    fixture.detectChanges();
    expect(el.querySelector('app-habit-dialog')).toBeNull();
    expect(treasuryTile(el).textContent).toContain('Finance vault locked');
  });

  it('announces undo, repeats an identical announcement, and drops a late create after the owner changes', () => {
    const { fixture, el } = render(snapshot());
    const live = () => el.querySelector('app-town-today [aria-live="polite"]')?.textContent ?? '';
    const result = {
      day: '2026-10-29',
      checked: false,
      habit: {
        id: 12, name: 'Read 20 pages', slot: 0, building_style: 'forge',
        cadence: { per_week: 7, kind: 'daily', pending: null },
        created_on: '2026-10-05', archived_on: null, xp: 80, level: 2, stage: 2, level_xp_start: 50, next_level_xp: 150,
        streak: { unit: 'days', current: 3, best: 3, best_days: 3, best_weeks: 0, rest_day_available: true, rest_used_on: null },
        week: null, checked_today: false, checked_yesterday: false, can_check_yesterday: true, last7: [],
      },
      town: { xp: 340, level: 3, level_xp_start: 250, next_level_xp: 500 },
    } as CheckinResult;
    fixture.componentInstance.onSettled(result);
    response.next(snapshot());
    fixture.detectChanges();
    expect(live()).toBe('Read 20 pages undone.');
    fixture.componentInstance.onSettled(result);
    response.next(snapshot());
    fixture.detectChanges();
    expect(live()).toBe('Read 20 pages undone.\u200b');

    fixture.componentInstance.openHabitDialog(0, null);
    fixture.detectChanges();
    const input = el.querySelector<HTMLInputElement>('#habit-name')!;
    input.value = 'Walk 30 minutes';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    el.querySelector<HTMLButtonElement>('button[type="submit"]')!.click();
    expect(api.createHabit).toHaveBeenCalledWith(jasmine.objectContaining({ name: 'Walk 30 minutes' }));
    const loads = api.getTown.calls.count();
    session.user = { id: 8 };
    user.next({ id: 8 });
    fixture.detectChanges();
    expect(el.querySelector('app-habit-dialog')).toBeNull();
    created.next({});
    fixture.detectChanges();
    expect(el.querySelector('app-habit-dialog')).toBeNull();
    expect(api.getTown.calls.count()).toBe(loads);
    expect(live()).not.toContain('checked');
  });

  it('shows a ready Clinic and Gym without measurement digits', async () => {
    localStorage.setItem(VAULT_PRESENCE, '7');
    health.and.resolveTo({ state: 'ready', clinic: 2, gym: 1 });
    const { fixture, el } = render(snapshot());
    await flushBudget(fixture);
    const clinic = clinicLink(el);
    expect(clinic.textContent).toContain('Open');
    expect(clinic.textContent).not.toMatch(/\d/);
    expect(clinic.querySelector('img')?.getAttribute('src')).toBe('/town/clinic-2.svg');
    expect(clinic.getAttribute('href')).toBe('/town/clinic');
    const gym = el.querySelector('[data-building="gym"]') as HTMLAnchorElement;
    expect(gym.querySelector('img')?.getAttribute('src')).toBe('/town/gym-1.svg');
    expect(gym.getAttribute('href')).toBe('/town/gym');
    expect(gym.textContent).toContain('Open');
  });

  it('celebrates one lot only after the check-in succeeds and does not replay it', () => {
    const read = {
      id: 12, name: 'Read 20 pages', slot: 0, building_style: 'cottage' as const,
      cadence: { per_week: 7, kind: 'daily' as const, pending: null },
      created_on: '2026-10-05', archived_on: null, xp: 80, level: 2, stage: 2 as const, level_xp_start: 50, next_level_xp: 150,
      streak: { unit: 'days' as const, current: 3, best: 3, best_days: 3, best_weeks: 0, rest_day_available: true, rest_used_on: null },
      week: null, checked_today: false, checked_yesterday: false, can_check_yesterday: true, last7: [],
    };
    const walk = { ...read, id: 15, name: 'Walk 30 minutes', slot: 1, building_style: 'garden' as const };
    const data = snapshot();
    data.lots = data.lots.map(lot => {
      if (lot.slot === 0) return { ...lot, state: 'occupied' as const, habit_id: 12 };
      if (lot.slot === 1) return { ...lot, state: 'occupied' as const, habit_id: 15 };
      return lot;
    });
    data.habits = [read, walk];
    const checkin = new Subject<CheckinResult>();
    const undo = new Subject<CheckinResult>();
    api.checkin.and.returnValue(checkin);
    api.undoCheckin.and.returnValue(undo);
    const { fixture, el } = render(data);
    const xp = () => el.querySelector('header p')?.textContent ?? '';
    const before = xp();
    expect(before).toContain('340 / 500');
    const readButton = el.querySelector<HTMLButtonElement>('[data-check="12"] button')!;
    const walkButton = el.querySelector<HTMLButtonElement>('[data-check="15"] button')!;
    readButton.click();
    fixture.detectChanges();
    expect(el.querySelector('[data-scene-object="slot-0"] [data-habit-feedback="pending"]')).not.toBeNull();
    expect(el.querySelector('[data-scene-object="slot-0"] [data-habit-feedback="light"]')).toBeNull();
    expect(el.querySelector('[data-building="slot-0"]')?.textContent).toContain('Saving check');
    expect(el.querySelector('[data-scene-object="slot-1"] [data-habit-feedback]')).toBeNull();
    expect(xp()).toBe(before);
    expect(walkButton.getAttribute('aria-disabled')).toBeNull();
    checkin.error({ error: { message: 'Check not saved. Try again.' } });
    fixture.detectChanges();
    expect(el.querySelector('[data-habit-feedback="light"]')).toBeNull();
    expect(el.querySelector('[data-habit-feedback="pending"]')).toBeNull();
    expect(xp()).toBe(before);
    expect(el.querySelector('app-town-today [aria-live="polite"]')?.textContent).not.toContain('checked');

    const again = new Subject<CheckinResult>();
    api.checkin.and.returnValue(again);
    readButton.click();
    fixture.detectChanges();
    again.next({
      day: '2026-10-29', checked: true,
      habit: { ...read, checked_today: true },
      town: { xp: 350, level: 3, level_xp_start: 250, next_level_xp: 500 },
    });
    fixture.detectChanges();
    expect(xp()).toContain('350 / 500');
    expect(el.querySelectorAll('[data-scene-object="slot-0"] [data-habit-feedback="light"]').length).toBe(1);
    expect(el.querySelector('[data-scene-object="slot-0"] [data-celebration="1"]')).not.toBeNull();
    expect(el.querySelector('[data-scene-object="slot-1"] [data-habit-feedback]')).toBeNull();
    expect(el.querySelector('[data-building="slot-0"]')?.textContent).toContain('Window lit');
    el.querySelector<HTMLButtonElement>('[data-building="slot-0"]')!.click();
    fixture.detectChanges();
    expect(el.querySelector('.inspector')?.textContent).toContain('Window lit');
    const checked = snapshot();
    checked.lots = data.lots;
    checked.habits = [{ ...read, checked_today: true }, walk];
    checked.town = { ...checked.town, xp: 350 };
    response.next(checked);
    fixture.detectChanges();
    expect(el.querySelectorAll('[data-scene-object="slot-0"] [data-celebration]').length).toBe(1);
    expect(el.querySelector('app-town-today [aria-live="polite"]')?.textContent).toContain('Read 20 pages checked.');

    const undoing = new Subject<CheckinResult>();
    api.undoCheckin.and.returnValue(undoing);
    readButton.click();
    fixture.detectChanges();
    expect(el.querySelector('[data-scene-object="slot-0"] [data-celebration="1"]')).not.toBeNull();
    expect(el.querySelector('[data-building="slot-0"]')?.textContent).toContain('Undoing check');
    undoing.next({
      day: '2026-10-29', checked: false,
      habit: read,
      town: { xp: 340, level: 3, level_xp_start: 250, next_level_xp: 500 },
    });
    fixture.detectChanges();
    expect(el.querySelector('[data-scene-object="slot-0"] [data-habit-feedback]')).toBeNull();
    expect(el.textContent).not.toContain('Window lit');
    response.next(data);
    fixture.detectChanges();
    expect(el.querySelectorAll('[data-celebration]').length).toBe(0);

    fixture.destroy();
    const reloaded = snapshot();
    reloaded.lots = data.lots;
    reloaded.habits = [{ ...read, checked_today: true }, walk];
    const next = render(reloaded);
    expect(next.el.querySelector('[data-habit-feedback="light"]')).toBeNull();
    expect(next.el.querySelector('[data-celebration]')).toBeNull();
    expect(next.el.querySelector('[data-check="12"] button')?.getAttribute('aria-pressed')).toBe('true');
  });

});
