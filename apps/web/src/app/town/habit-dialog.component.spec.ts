import { TestBed, fakeAsync, flushMicrotasks } from '@angular/core/testing';
import { Subject } from 'rxjs';
import { ConfirmService, ToastService } from '@vivek/ui';
import { HabitDialogComponent } from './habit-dialog.component';
import { TownApiService } from './town.api';
import { LOT_UNLOCK_LV } from './town.constants';
import type { Habit, TownResponse } from './town.types';

function habit(partial: Partial<Habit> & Pick<Habit, 'id' | 'name'>): Habit {
  return {
    slot: 0, building_style: 'forge', cadence: { per_week: 3, kind: 'weekly', pending: null },
    created_on: '2026-09-30', archived_on: null, xp: 100, level: 2, stage: 2, level_xp_start: 50, next_level_xp: 150,
    streak: { unit: 'weeks', current: 2, best: 2, best_days: 0, best_weeks: 2, rest_day_available: null, rest_used_on: null },
    week: { done: 2, target: 3 }, checked_today: false, checked_yesterday: false, can_check_yesterday: true, last7: [],
    ...partial,
  };
}

function snapshot(habits: Habit[] = []): TownResponse {
  const building = { xp: 0, level: 1, stage: 1 as const, level_xp_start: 0, next_level_xp: 50, today_xp: 0, today_cap: 10, source: 'ok' as const };
  return {
    town: { name: 'Terraria-on-Sea', founded_on: '2026-10-05', today: '2026-10-29', tz: 'America/Los_Angeles', xp: 340, level: 3, level_xp_start: 250, next_level_xp: 500 },
    buildings: { library: building, inn: building },
    lots: LOT_UNLOCK_LV.map((unlock_level, slot) => ({ slot, unlock_level, state: slot < 2 ? 'occupied' as const : unlock_level > 3 ? 'locked' as const : 'empty' as const, habit_id: null })),
    habits, archived: [], today: { done: 0, total: habits.length }, constants_version: 1,
  };
}

describe('Habit dialog', () => {
  let create: Subject<Habit>;
  let patch: Subject<Habit>;
  let api: { createHabit: jasmine.Spy; patchHabit: jasmine.Spy };

  beforeEach(() => {
    create = new Subject();
    patch = new Subject();
    api = { createHabit: jasmine.createSpy().and.callFake(() => create), patchHabit: jasmine.createSpy().and.callFake(() => patch) };
    TestBed.configureTestingModule({ imports: [HabitDialogComponent], providers: [{ provide: TownApiService, useValue: api }] });
  });

  function render(data: TownResponse, extra: Record<string, unknown> = {}) {
    const fixture = TestBed.createComponent(HabitDialogComponent);
    fixture.componentRef.setInput('data', data);
    for (const [key, value] of Object.entries(extra)) fixture.componentRef.setInput(key, value);
    fixture.detectChanges();
    return { fixture, el: fixture.nativeElement as HTMLElement };
  }

  it('creates from a prefilled chip and shows the server message verbatim', () => {
    const toast = spyOn(TestBed.inject(ToastService), 'error');
    const { fixture, el } = render(snapshot(), { slot: 2, prefill: 'Read 20 pages' });
    const closed = jasmine.createSpy();
    fixture.componentInstance.closed.subscribe(closed);
    const input = el.querySelector<HTMLInputElement>('#habit-name')!;
    expect(input.value).toBe('Read 20 pages');
    expect(el.querySelector('img')?.getAttribute('width')).toBe('48');
    el.querySelector<HTMLButtonElement>('button[type="submit"]')!.click();
    expect(api.createHabit).toHaveBeenCalledWith({ name: 'Read 20 pages', slot: 2, per_week: 7, building_style: 'cottage' });
    create.next(habit({ id: 3, name: 'Read 20 pages' }));
    expect(closed).toHaveBeenCalledWith(true);
    fixture.componentInstance.formError.set('');
    create = new Subject();
    api.createHabit.calls.reset();
    input.value = 'Walk'; input.dispatchEvent(new Event('input')); fixture.detectChanges();
    el.querySelector<HTMLButtonElement>('button[type="submit"]')!.click();
    create.error({ error: { code: 'name_taken', message: 'You already have a habit with that name.' } });
    fixture.detectChanges();
    expect(el.textContent).toContain('You already have a habit with that name.');
    expect(toast).toHaveBeenCalledWith('You already have a habit with that name.');
  });

  it('blocks 41 characters and bidi marks before posting', () => {
    const { fixture, el } = render(snapshot(), { slot: 2 });
    const input = el.querySelector<HTMLInputElement>('#habit-name')!;
    const submit = () => {
      el.querySelector<HTMLButtonElement>('button[type="submit"]')!.click();
      fixture.detectChanges();
    };
    input.value = 'a'.repeat(41); input.dispatchEvent(new Event('input')); submit();
    expect(el.textContent).toContain('Use 1 to 40 characters.');
    input.value = 'Go\u202Ewest'; input.dispatchEvent(new Event('input')); submit();
    expect(el.textContent).toContain('Use letters, numbers and punctuation only.');
    expect(api.createHabit).not.toHaveBeenCalled();
  });

  it('archives with the exact confirm copy and shows a pending cadence', fakeAsync(() => {
    const walk = habit({
      id: 15, name: 'Walk 30 minutes', slot: 1, building_style: 'garden',
      cadence: { per_week: 3, kind: 'weekly', pending: { per_week: 4, effective_from: '2026-11-02' } },
    });
    const { el } = render(snapshot([walk]), { habitId: 15 });
    expect(el.textContent).toContain('Changes to 4× a week from Mon 2 Nov');
    const ask = spyOn(TestBed.inject(ConfirmService), 'ask').and.resolveTo(true);
    [...el.querySelectorAll('button')].find(button => button.textContent?.trim() === 'Archive habit')!.click();
    flushMicrotasks();
    expect(ask).toHaveBeenCalledWith(
      'Archive habit',
      "Archive 'Walk 30 minutes'? It leaves the town, frees its lot and keeps its 100 XP. You can't undo this.",
      'Archive', 'Cancel',
    );
    expect(api.patchHabit).toHaveBeenCalledWith(15, { archived: true });
  }));
});
