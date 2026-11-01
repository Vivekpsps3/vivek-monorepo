import { TestBed, fakeAsync, flushMicrotasks } from '@angular/core/testing';
import { Subject } from 'rxjs';
import { ToastService } from '@vivek/ui';
import { TownApiService, type CheckinResult } from './town.api';
import { TownTodayComponent, liveCheck, restNote } from './town-today.component';
import { LOT_UNLOCK_LV } from './town.constants';
import type { Habit, TownResponse } from './town.types';

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

  beforeEach(() => {
    checkin = new Subject();
    api = {
      checkin: jasmine.createSpy().and.callFake(() => checkin),
      undoCheckin: jasmine.createSpy().and.callFake(() => (undo = new Subject<CheckinResult>())),
    };
    TestBed.configureTestingModule({ imports: [TownTodayComponent], providers: [{ provide: TownApiService, useValue: api }] });
    toast = TestBed.inject(ToastService);
  });

  function render(data: TownResponse, vault = false) {
    const fixture = TestBed.createComponent(TownTodayComponent);
    fixture.componentRef.setInput('data', data);
    fixture.componentRef.setInput('vaultPresent', vault);
    fixture.detectChanges();
    return { fixture, el: fixture.nativeElement as HTMLElement };
  }

  it('renders rows, auto credits, a locked treasury, and the rest-day note', () => {
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
    expect(el.textContent).toContain('Auto · +10/10 XP today');
    expect(el.textContent).toContain('Auto · +5/15 XP today');
    expect(el.textContent).toContain('Auto ✓');
    expect(el.textContent).toContain('Locked');
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
    fixture.detectChanges();
    expect(el.textContent).toContain('No active habits');
    expect(el.querySelector('ui-skeleton')).not.toBeNull();
    expect(el.textContent).not.toContain('Locked');
  });

  it('disables a new habit when no lot is free and keeps the helper copy', () => {
    const data = snapshot();
    data.lots.forEach(lot => { if (lot.state === 'empty') lot.state = 'occupied'; });
    const { fixture, el } = render(data);
    const button = [...el.querySelectorAll('button')].find(item => item.textContent?.trim() === '+ New habit')!;
    expect(button.disabled).toBeTrue();
    expect(button.getAttribute('title')).toBe('No free lots');
    expect(el.querySelector('footer')?.textContent).toBe('All unlocked lots are built. Reach Lv 5 for another.');
    data.lots.forEach(lot => lot.state = 'occupied');
    // setInput ignores an identical reference, so OnPush would keep the locked-lot footer.
    fixture.componentRef.setInput('data', { ...data, lots: data.lots.map(lot => ({ ...lot })) });
    fixture.detectChanges();
    expect(el.querySelector('footer')?.textContent).toBe('All lots are built.');
    expect(restNote([])).toBe('');
    expect(restNote([habit({ id: 1, name: 'Read', streak: { unit: 'days', current: 1, best: 1, best_days: 1, best_weeks: 0, rest_day_available: false, rest_used_on: null } })])).toBe('Rest day used this week');
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
  });

  it('refocuses the check button only on the refresh that follows that write', fakeAsync(() => {
    const read = habit({ id: 12, name: 'Read 20 pages' });
    const { fixture, el } = render(snapshot([read]));
    const button = el.querySelector<HTMLButtonElement>('[data-check="12"] button')!;
    const history = () => [...el.querySelectorAll('button')].find(item => item.textContent?.trim() === 'History')!;
    const settle = () => {
      fixture.detectChanges();
      TestBed.tick();
      flushMicrotasks();
    };
    button.click();
    settle();
    history().focus();
    expect(document.activeElement).toBe(history());
    read.checked_today = true;
    fixture.componentRef.setInput('data', snapshot([read]));
    settle();
    expect(document.activeElement).toBe(button);
    // Dialog close, Mark yesterday, and the visible-date poll are later snapshots.
    for (const data of [
      snapshot([{ ...read }]),
      snapshot([{ ...read, xp: 90 }]),
      snapshot([{ ...read, streak: { ...read.streak, current: 5 } }]),
    ]) {
      history().focus();
      fixture.componentRef.setInput('data', data);
      settle();
      expect(document.activeElement).toBe(history());
    }
  }));
});
