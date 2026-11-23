import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { ToastService } from '@vivek/ui';
import { BehaviorSubject, Subject } from 'rxjs';
import { SessionService } from '../platform/session.service';
import { TownTodayComponent, liveAgain, liveCheck, liveUndo } from './town-today.component';
import { TownApiService,type CheckinResult } from './town.api';
import { LOT_UNLOCK_LV } from './town.constants';
import type { Habit,TownResponse } from './town.types';

function habit(partial: Partial<Habit> & Pick<Habit, 'id' | 'name'>): Habit {
  return {
    slot: 0, building_style: 'forge', cadence: { per_week: 7, kind: 'daily', pending: null },
    created_on: '2026-10-05', archived_on: null, xp: 80, level: 2, stage: 2, level_xp_start: 50, next_level_xp: 150,
    streak: { unit: 'days', current: 3, best: 3, best_days: 3, best_weeks: 0, rest_day_available: true, rest_used_on: null },
    week: null, checked_today: false, checked_yesterday: false, can_check_yesterday: true, last7: [],
    ...partial,
  };
}

function snapshot(habits: Habit[] = []): TownResponse {
  const building = { xp: 0, level: 1, stage: 1 as const, level_xp_start: 0, next_level_xp: 50, today_xp: 10, today_cap: 10, source: 'ok' as const };
  return {
    town: { name: 'Terraria-on-Sea', founded_on: '2026-10-05', today: '2026-10-29', tz: 'America/Los_Angeles', xp: 340, level: 3, level_xp_start: 250, next_level_xp: 500 },
    buildings: { library: building, inn: { ...building, today_xp: 5, today_cap: 15 } },
    lots: LOT_UNLOCK_LV.map((unlock_level, slot) => ({ slot, unlock_level, state: unlock_level > 3 ? 'locked' as const : 'empty' as const, habit_id: null })),
    habits, archived: [], today: { done: 0, total: habits.length }, constants_version: 1,
  };
}

describe('Today panel', () => {
  let checkin: Subject<CheckinResult>;
  let undo!: Subject<CheckinResult>;
  let api: { checkin: jasmine.Spy; undoCheckin: jasmine.Spy };
  let toast: ToastService;
  let user: BehaviorSubject<{ id: number } | null>;
  let cleared: Subject<void>;

  beforeEach(() => {
    checkin = new Subject();
    user = new BehaviorSubject<{ id: number } | null>({ id: 7 });
    cleared = new Subject<void>();
    api = {
      checkin: jasmine.createSpy().and.callFake(() => checkin),
      undoCheckin: jasmine.createSpy().and.callFake(() => (undo = new Subject<CheckinResult>())),
    };
    TestBed.configureTestingModule({
      imports: [TownTodayComponent],
      providers: [
        provideRouter([]),
        { provide: TownApiService, useValue: api },
        { provide: SessionService, useValue: { user$: user, currentUser: { id: 7 }, cleared$: cleared } },
      ],
    });
    toast = TestBed.inject(ToastService);
  });

  function render(data: TownResponse, vault = false) {
    const fixture = TestBed.createComponent(TownTodayComponent);
    fixture.componentRef.setInput('data', data);
    fixture.componentRef.setInput('vaultPresent', vault);
    fixture.detectChanges();
    return { fixture, el: fixture.nativeElement as HTMLElement };
  }

  it('renders rows, named source credits, a locked treasury, and the rest-day note', () => {
    const read = habit({ id: 1, name: 'Read 20 pages', slot: 0 });
    const walk = habit({
      id: 2, name: 'Walk 30 minutes', slot: 1, building_style: 'garden',
      cadence: { per_week: 3, kind: 'weekly', pending: null }, week: { done: 2, target: 3 },
      streak: { unit: 'weeks', current: 2, best: 2, best_days: 0, best_weeks: 2, rest_day_available: null, rest_used_on: null },
    });
    const sleep = habit({
      id: 3, name: 'Sleep by 12', slot: 2, building_style: 'cottage',
      streak: { unit: 'days', current: 1, best: 1, best_days: 1, best_weeks: 0, rest_day_available: false, rest_used_on: '2026-10-28' },
    });
    const { fixture, el } = render(snapshot([read, walk, sleep]));
    expect(el.textContent).toContain('Read 20 pages');
    expect(el.textContent).toContain('Forge');
    expect(el.textContent).toContain('3-day streak');
    expect(el.textContent).toContain('2/3 this week');
    expect(el.textContent).toContain('Media · +10/10 XP today');
    expect(el.textContent).toContain('Travel · +5/15 XP today');
    expect(el.textContent).not.toContain('Auto');
    expect(el.querySelectorAll('.passive ui-badge')[0]?.textContent?.trim()).toBe('Media');
    expect(el.querySelectorAll('.passive ui-badge')[1]?.textContent?.trim()).toBe('Travel');
    expect(el.querySelector('.treasury a')?.textContent?.trim()).toBe('Finance vault locked');
    expect(el.querySelector('.treasury a')?.getAttribute('href')).toBe('/finance/vault/unlock?next=%2Ftown');
    expect(el.querySelector('ui-skeleton')).toBeNull();
    expect(el.textContent).toContain('Rest days: Forge ✓, Cottage used');
    const button = el.querySelector<HTMLButtonElement>('button')!;
    expect(button.getAttribute('aria-label')).toBe('Mark Read 20 pages done for today');
    expect(button.getAttribute('aria-pressed')).toBe('false');
    expect(button.getBoundingClientRect().width).toBeGreaterThanOrEqual(44);
    const history = jasmine.createSpy(); fixture.componentInstance.history.subscribe(history);
    [...el.querySelectorAll('button')].find(item => item.textContent?.trim() === 'History')!.click();
    expect(history).toHaveBeenCalled();
    fixture.componentRef.setInput('data', snapshot([]));
    fixture.componentRef.setInput('vaultPresent', true);
    // 8 kept budget weeks is treasury tier 5. The snapshot town is level 3, which must not leak in.
    fixture.componentRef.setInput('treasury', { status: 'ready', run: 8, saturated: false, tier: 5, stage: 3 });
    fixture.detectChanges();
    expect(el.textContent).toContain('No active habits');
    expect(el.querySelector('ui-skeleton')).toBeNull();
    expect(el.querySelector('.treasury')?.textContent).toContain('Lv 5');
    expect(el.querySelector('.treasury a')?.getAttribute('href')).toBe('/finance');
    expect(el.textContent).not.toContain('Locked');
    expect(el.querySelector('.treasury')?.textContent).not.toMatch(/\$/);
    fixture.componentRef.setInput('treasury', { status: 'unavailable' });
    fixture.detectChanges();
    expect(el.querySelector('ui-skeleton')).toBeNull();
    expect(el.querySelector('.treasury')?.textContent).toContain('Unavailable');
    expect(el.querySelector('.treasury')?.textContent).not.toMatch(/Lv \d/);
  });

  it('posts today optimistically, keeps focus, undoes, and shows the server message', () => {
    spyOn(toast, 'error');
    const read = habit({ id: 12, name: 'Read 20 pages' });
    const { fixture, el } = render(snapshot([read]));
    const settled = jasmine.createSpy(); const dayChanged = jasmine.createSpy();
    fixture.componentInstance.settled.subscribe(settled);
    fixture.componentInstance.dayChanged.subscribe(dayChanged);
    const button = el.querySelector<HTMLButtonElement>('button')!;
    button.focus();
    button.click(); fixture.detectChanges();
    expect(button.getAttribute('aria-pressed')).toBe('true');
    expect(api.checkin).toHaveBeenCalledWith(12, '2026-10-29');
    const result: CheckinResult = {
      day: '2026-10-29', checked: true,
      habit: { ...read, checked_today: true, streak: { ...read.streak, current: 4 } },
      town: { xp: 350, level: 3, level_xp_start: 250, next_level_xp: 500 },
    };
    checkin.next(result); fixture.detectChanges();
    expect(settled).toHaveBeenCalledWith(result);
    expect(document.activeElement).toBe(button);
    expect(liveCheck(read.name, result.habit, result.town, false)).toBe('Read 20 pages checked. 4-day streak. Town 350 of 500 XP.');
    expect(liveCheck(read.name, result.habit, result.town, true)).toBe('Read 20 pages checked. 4-day streak.');
    expect(liveCheck(read.name, result.habit, { ...result.town, next_level_xp: null }, false)).toBe('Read 20 pages checked. 4-day streak.');
    read.checked_today = true;
    fixture.componentRef.setInput('data', snapshot([read])); fixture.detectChanges();
    button.click(); fixture.detectChanges();
    expect(button.getAttribute('aria-pressed')).toBe('false');
    expect(api.undoCheckin).toHaveBeenCalledWith(12, '2026-10-29');
    undo.error({ error: { code: 'habit_archived', message: 'That habit is archived.' } }); fixture.detectChanges();
    expect(toast.error).toHaveBeenCalledWith('That habit is archived.');
    expect(button.getAttribute('aria-pressed')).toBe('true');
    button.click();
    undo.error({ error: { code: 'day_out_of_window', message: 'You can only check in for today or yesterday.' } });
    expect(toast.error).toHaveBeenCalledWith('The day changed. Try again.');
    expect(dayChanged).toHaveBeenCalledTimes(1);
    expect(liveUndo('Read 20 pages')).toBe('Read 20 pages undone.');
    expect(liveAgain('Read 20 pages undone.', 'Read 20 pages undone.')).toBe('Read 20 pages undone.\u200b');
  });

  it('ignores a second check while the first post is held and a late result after the owner changes', () => {
    const read = habit({ id: 12, name: 'Read 20 pages' });
    const { fixture, el } = render(snapshot([read]));
    const settled = jasmine.createSpy();
    fixture.componentInstance.settled.subscribe(settled);
    const button = el.querySelector<HTMLButtonElement>('button')!;
    button.click();
    button.click();
    fixture.detectChanges();
    expect(api.checkin).toHaveBeenCalledTimes(1);
    expect(button.getAttribute('aria-disabled')).toBe('true');
    expect(button.getAttribute('aria-busy')).toBe('true');
    user.next({ id: 8 });
    fixture.detectChanges();
    expect(button.getAttribute('aria-pressed')).toBe('false');
    expect(button.getAttribute('aria-disabled')).toBeNull();
    checkin.next({
      day: '2026-10-29', checked: true, habit: read,
      town: { xp: 350, level: 3, level_xp_start: 250, next_level_xp: 500 },
    });
    fixture.detectChanges();
    expect(settled).not.toHaveBeenCalled();
    expect(button.getAttribute('aria-pressed')).toBe('false');
    cleared.next();
    button.click();
    expect(api.checkin).toHaveBeenCalledTimes(2);
    cleared.next();
    checkin.next({
      day: '2026-10-29', checked: true, habit: read,
      town: { xp: 360, level: 3, level_xp_start: 250, next_level_xp: 500 },
    });
    expect(settled).not.toHaveBeenCalled();
  });

});
