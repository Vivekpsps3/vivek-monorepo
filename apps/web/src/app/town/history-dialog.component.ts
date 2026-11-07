import { ChangeDetectionStrategy, Component, DestroyRef, effect, inject, input, output, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ToastService, UiButtonComponent, UiDialogComponent, UiSkeletonComponent, UiStateComponent } from '@vivek/ui';
import { TownApiService } from './town.api';
import { addDays, apiProblem, eightWeekStarts, formatTownDay, historyFrom, labelRange, WEEKDAYS, type HistoryCell } from './town-text';
import type { Habit, TownResponse } from './town.types';

@Component({
  selector: 'app-history-dialog',
  imports: [UiButtonComponent, UiDialogComponent, UiSkeletonComponent, UiStateComponent],
  templateUrl: './history-dialog.component.html',
  styleUrl: './history-dialog.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HistoryDialogComponent {
  private readonly api = inject(TownApiService);
  private readonly toast = inject(ToastService);
  private readonly destroy = inject(DestroyRef);
  readonly data = input.required<TownResponse>();
  readonly dirty = output<void>();
  readonly closed = output<boolean>();
  readonly days = signal<Readonly<Record<number, readonly string[]>>>({});
  /** `ready` only after getCheckins succeeds. A failure must not look like an empty history. */
  private readonly rowState = signal<Readonly<Record<number, 'ready' | 'error'>>>({});
  readonly archivedPage = signal(0);
  readonly weekdays = WEEKDAYS;
  readonly formatTownDay = formatTownDay;
  private readonly started = new Set<number>();
  private changed = false;

  constructor() {
    effect(() => {
      for (const habit of this.data().habits) this.load(habit);
    });
  }

  weeks(habit: Habit): { start: string; cells: HistoryCell[] }[] {
    const today = this.data().town.today;
    const checked = new Set(this.days()[habit.id] ?? []);
    const labels = labelRange({
      created: habit.created_on,
      today,
      from: historyFrom(habit.created_on, today),
      to: today,
      daily: habit.cadence.kind === 'daily',
      checked,
    });
    const blank: HistoryCell = { text: '', kind: 'empty' };
    return eightWeekStarts(today).map(start => ({
      start,
      cells: WEEKDAYS.map((_, index) => labels.get(addDays(start, index)) ?? blank),
    }));
  }

  loaded(habit: Habit): boolean {
    return this.rowState()[habit.id] === 'ready';
  }

  rowFailed(habit: Habit): boolean {
    return this.rowState()[habit.id] === 'error';
  }

  retry(habit: Habit): void {
    this.started.delete(habit.id);
    this.rowState.update(state => {
      const copy = { ...state };
      delete copy[habit.id];
      return copy;
    });
    this.load(habit);
  }

  bestText(item: TownResponse['archived'][number]): string {
    const weeks = item.best_weeks > item.best_days;
    return `Lv ${item.level} · ${item.xp} XP · best ${weeks ? `${item.best_weeks} weeks` : `${item.best_days} days`}`;
  }

  /** §13 pages the archived list at 20. Labels are unspecified; Previous/Next match the dialog actions. */
  archivedItems(): TownResponse['archived'] {
    const start = this.archivedPage() * 20;
    return this.data().archived.slice(start, start + 20);
  }

  archivedPages(): number {
    return Math.ceil(this.data().archived.length / 20);
  }

  mark(habit: Habit): void {
    const day = addDays(this.data().town.today, -1);
    this.api.checkin(habit.id, day).pipe(takeUntilDestroyed(this.destroy)).subscribe({
      next: () => {
        this.changed = true;
        if (this.rowState()[habit.id] === 'ready') {
          this.days.update(map => ({ ...map, [habit.id]: [...(map[habit.id] ?? []), day] }));
        }
        this.dirty.emit();
      },
      error: (error: unknown) => this.toast.error(apiProblem(error).message),
    });
  }

  dismiss(): void {
    this.closed.emit(this.changed);
  }

  private load(habit: Habit): void {
    if (this.started.has(habit.id)) return;
    this.started.add(habit.id);
    const today = this.data().town.today;
    this.api.getCheckins(habit.id, historyFrom(habit.created_on, today), today)
      .pipe(takeUntilDestroyed(this.destroy))
      .subscribe({
        next: body => {
          this.days.update(map => ({ ...map, [habit.id]: body.days }));
          this.rowState.update(state => ({ ...state, [habit.id]: 'ready' }));
        },
        error: (error: unknown) => {
          this.toast.error(apiProblem(error).message);
          this.rowState.update(state => ({ ...state, [habit.id]: 'error' }));
        },
      });
  }
}
