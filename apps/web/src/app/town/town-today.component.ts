import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, effect, inject, input, output, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ToastService, UiBadgeComponent, UiButtonComponent, UiEmptyStateComponent, UiSkeletonComponent } from '@vivek/ui';
import { TownApiService, type CheckinResult } from './town.api';
import type { Building, Habit, TownResponse } from './town.types';

const STYLE_NAME = { forge: 'Forge', garden: 'Garden', cottage: 'Cottage' } as const;

function formatRest(habits: readonly Habit[]): string {
  const daily = [...habits].filter(habit => habit.cadence.kind === 'daily').sort((a, b) => (a.slot ?? 0) - (b.slot ?? 0));
  if (!daily.length) return '';
  const available = (habit: Habit) => habit.streak.rest_day_available !== false;
  if (daily.every(habit => available(habit) === available(daily[0]))) {
    return available(daily[0]) ? '1 rest day left this week' : 'Rest day used this week';
  }
  return `Rest days: ${daily.map(habit => `${STYLE_NAME[habit.building_style]} ${available(habit) ? '✓' : 'used'}`).join(', ')}`;
}

export function restNote(habits: readonly Habit[]): string {
  return formatRest(habits);
}

/** Polite check-in announcement. The XP clause is omitted at max level and when a level-up toast fired. */
export function liveCheck(
  name: string,
  habit: Habit,
  town: { xp: number; next_level_xp: number | null },
  toasted: boolean,
): string {
  const unit = habit.streak.unit === 'days' ? 'day' : 'week';
  const base = `${name} checked. ${habit.streak.current}-${unit} streak.`;
  if (toasted || town.next_level_xp == null) return base;
  return `${base} Town ${town.xp} of ${town.next_level_xp} XP.`;
}

function problem(error: unknown): { code?: string; message: string } {
  const body = typeof error === 'object' && error && 'error' in error
    ? (error as { error?: { code?: string; message?: unknown } }).error : undefined;
  return {
    code: body?.code,
    message: typeof body?.message === 'string' ? body.message : 'Town is unavailable right now.',
  };
}

@Component({
  selector: 'app-town-today',
  imports: [UiBadgeComponent, UiButtonComponent, UiEmptyStateComponent, UiSkeletonComponent],
  templateUrl: './town-today.component.html',
  styleUrl: './town-today.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TownTodayComponent {
  private readonly api = inject(TownApiService);
  private readonly toast = inject(ToastService);
  private readonly destroy = inject(DestroyRef);
  private readonly host = inject(ElementRef<HTMLElement>);
  readonly data = input.required<TownResponse>();
  readonly vaultPresent = input(false);
  readonly live = input('');
  readonly newHabit = output<void>();
  readonly history = output<void>();
  readonly settled = output<CheckinResult>();
  readonly dayChanged = output<void>();
  readonly pending = signal<Readonly<Record<number, boolean>>>({});
  private readonly focusHabit = signal<number | null>(null);
  /** Snapshot present when a check was armed. Only the next snapshot may move focus back. */
  private focusBaseline: TownResponse | null = null;

  constructor() {
    effect(() => {
      const data = this.data();
      const pending = this.pending();
      const copy = { ...pending };
      let changed = false;
      for (const habit of data.habits) {
        if (copy[habit.id] === habit.checked_today) {
          delete copy[habit.id];
          changed = true;
        }
      }
      if (changed) this.pending.set(copy);
      const id = this.focusHabit();
      if (id == null) {
        this.focusBaseline = null;
        return;
      }
      const refresh = this.focusBaseline !== null && data !== this.focusBaseline;
      if (this.focusBaseline === null || refresh) this.focusCheck(id);
      if (refresh) {
        this.focusHabit.set(null);
        this.focusBaseline = null;
        return;
      }
      this.focusBaseline = data;
    });
  }

  private focusCheck(id: number): void {
    queueMicrotask(() => {
      const button = this.host.nativeElement.querySelector(`[data-check="${id}"] button`);
      if (button instanceof HTMLButtonElement) button.focus();
    });
  }

  pressed(habit: Habit): boolean {
    const pending = this.pending()[habit.id];
    return pending !== undefined ? pending : habit.checked_today;
  }

  checkLabel(habit: Habit): string {
    return this.pressed(habit) ? `${habit.name}, done today. Undo` : `Mark ${habit.name} done for today`;
  }

  styleName(habit: Habit): string {
    return STYLE_NAME[habit.building_style];
  }

  streakText(habit: Habit): string {
    return `${habit.streak.current}-${habit.streak.unit === 'days' ? 'day' : 'week'} streak`;
  }

  habits(): Habit[] {
    return [...this.data().habits].sort((a, b) => (a.slot ?? 0) - (b.slot ?? 0));
  }

  helper(): string {
    const lots = this.data().lots;
    if (lots.some(lot => lot.state === 'empty')) return '';
    const next = lots.find(lot => lot.state === 'locked');
    return next ? `All unlocked lots are built. Reach Lv ${next.unlock_level} for another.` : 'All lots are built.';
  }

  restNote(): string {
    return formatRest(this.habits());
  }

  autoLabel(kind: 'library' | 'inn', building: Building): string {
    const source = kind === 'library' ? 'Media' : 'Travel';
    return building.source === 'unavailable' ? `${source} unavailable` : `Auto · +${building.today_xp}/${building.today_cap} XP today`;
  }

  toggle(habit: Habit): void {
    const next = !this.pressed(habit);
    const day = this.data().town.today;
    this.pending.update(state => ({ ...state, [habit.id]: next }));
    this.focusHabit.set(habit.id);
    const request = next ? this.api.checkin(habit.id, day) : this.api.undoCheckin(habit.id, day);
    request.pipe(takeUntilDestroyed(this.destroy)).subscribe({
      next: result => this.settled.emit(result),
      error: (error: unknown) => this.fail(habit.id, problem(error)),
    });
  }

  private fail(id: number, issue: { code?: string; message: string }): void {
    this.pending.update(state => {
      const copy = { ...state };
      delete copy[id];
      return copy;
    });
    if (issue.code === 'day_out_of_window') {
      this.toast.error('The day changed. Try again.');
      this.dayChanged.emit();
      return;
    }
    this.focusHabit.set(null);
    this.toast.error(issue.message);
  }
}
