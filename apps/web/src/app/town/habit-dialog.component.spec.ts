import { TestBed } from '@angular/core/testing';
import { Subject } from 'rxjs';
import { ConfirmService } from '@vivek/ui';
import { HabitDialogComponent } from './habit-dialog.component';
import { TownApiService } from './town.api';
import { LOT_UNLOCK_LV } from './town.constants';
import type { Habit,TownResponse } from './town.types';

function habit(partial: Partial<Habit> = {}): Habit {
  return {
    id: 15, name: 'Walk 30 minutes', slot: 1, building_style: 'garden',
    cadence: { per_week: 3, kind: 'weekly', pending: null },
    created_on: '2026-10-05', archived_on: null, xp: 40, level: 1, stage: 1, level_xp_start: 0, next_level_xp: 50,
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
    expect((el.querySelector('#habit-cadence') as HTMLSelectElement).value).toBe('7');
  });

  it('skips an unchanged edit and sends only a moved cadence', () => {
    const walk = habit({ cadence: { per_week: 3, kind: 'weekly', pending: { per_week: 4, effective_from: '2026-11-02' } } });
    const { fixture, el } = render(snapshot([walk]), { habitId: 15 });
    const closed = jasmine.createSpy();
    fixture.componentInstance.closed.subscribe(closed);
    el.querySelector<HTMLButtonElement>('button[type="submit"]')!.click();
    expect(api.patchHabit).not.toHaveBeenCalled();
    expect(closed).toHaveBeenCalledWith(false);
    const cadence = el.querySelector<HTMLSelectElement>('#habit-cadence')!;
    expect(cadence.labels?.[0]?.textContent).toBe('Cadence');
    cadence.value = '5';
    cadence.dispatchEvent(new Event('change'));
    el.querySelector<HTMLButtonElement>('button[type="submit"]')!.click();
    el.querySelector<HTMLButtonElement>('button[type="submit"]')!.click();
    expect(api.patchHabit).toHaveBeenCalledTimes(1);
    expect(api.patchHabit).toHaveBeenCalledWith(15, { per_week: 5 });
    expect([...el.querySelectorAll('button')].some(button => button.textContent?.trim() === 'Archive habit')).toBeTrue();
  });

  it('links a cadence error, keeps the draft, and focuses the cadence field', async () => {
    const { fixture, el } = render(snapshot(), { slot: 2 });
    const input = el.querySelector<HTMLInputElement>('#habit-name')!;
    input.value = 'Walk 30 minutes';
    input.dispatchEvent(new Event('input'));
    const cadence = el.querySelector<HTMLSelectElement>('#habit-cadence')!;
    cadence.value = '3';
    cadence.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    el.querySelector<HTMLButtonElement>('button[type="submit"]')!.click();
    el.querySelector<HTMLButtonElement>('button[type="submit"]')!.click();
    expect(api.createHabit).toHaveBeenCalledTimes(1);
    create.error({ error: { message: 'Check the highlighted fields.', field_errors: { per_week: 'Choose 1 to 7 days.' } } });
    fixture.detectChanges();
    await new Promise<void>(resolve => queueMicrotask(() => resolve()));
    expect(input.value).toBe('Walk 30 minutes');
    expect(cadence.value).toBe('3');
    expect(el.querySelector('#habit-cadence-error')?.textContent).toBe('Choose 1 to 7 days.');
    expect(cadence.getAttribute('aria-describedby')).toBe('habit-cadence-error');
    expect(document.activeElement).toBe(cadence);
  });

  it('does not archive twice or apply a late archive after the dialog is destroyed', async () => {
    const walk = habit();
    const { fixture, el } = render(snapshot([walk]), { habitId: 15 });
    const confirm = TestBed.inject(ConfirmService);
    let answer: (ok: boolean) => void = () => undefined;
    spyOn(confirm, 'ask').and.returnValue(new Promise(resolve => { answer = resolve; }));
    const closed = jasmine.createSpy();
    fixture.componentInstance.closed.subscribe(closed);
    [...el.querySelectorAll('button')].find(button => button.textContent?.trim() === 'Archive habit')!.click();
    [...el.querySelectorAll('button')].find(button => button.textContent?.trim() === 'Archive habit')!.click();
    expect(confirm.ask).toHaveBeenCalledTimes(1);
    fixture.destroy();
    answer(true);
    await Promise.resolve();
    expect(api.patchHabit).not.toHaveBeenCalled();
    expect(closed).not.toHaveBeenCalled();
  });
});
