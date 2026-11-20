import { TestBed } from '@angular/core/testing';
import { Subject } from 'rxjs';
import { HabitDialogComponent } from './habit-dialog.component';
import { TownApiService } from './town.api';
import { LOT_UNLOCK_LV } from './town.constants';
import type { Habit,TownResponse } from './town.types';

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

  it('keeps the typed name when create fails', () => {
    const { fixture, el } = render(snapshot(), { slot: 2 });
    const input = el.querySelector<HTMLInputElement>('#habit-name')!;
    input.value = 'Walk 30 minutes';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    el.querySelector<HTMLButtonElement>('button[type="submit"]')!.click();
    fixture.detectChanges();
    create.error({ error: { message: 'Town is unavailable right now.' } });
    fixture.detectChanges();
    expect(input.value).toBe('Walk 30 minutes');
    expect(el.textContent).toContain('Town is unavailable right now.');
    expect(el.querySelector('app-habit-dialog, [role="dialog"]')).not.toBeNull();
  });
});
