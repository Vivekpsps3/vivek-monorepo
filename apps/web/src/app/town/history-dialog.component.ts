import { ChangeDetectionStrategy, Component, DestroyRef, effect, inject, input, output, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ToastService, UiButtonComponent, UiDialogComponent, UiSkeletonComponent, UiStateComponent } from '@vivek/ui';
import { TownApiService } from './town.api';
import { addDays, apiProblem, eightWeekStarts, formatTownDay, HISTORY_LEGEND, historyFrom, labelRange, WEEKDAYS, type HistoryCell } from './town-text';
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
  /** Habit ids with a yesterday POST still in flight. A second click must not post again. */
  private readonly markingIds = signal<Readonly<Record<number, true>>>({});
  readonly archivedPage = signal(0);
  readonly weekdays = WEEKDAYS;
  readonly legend = HISTORY_LEGEND;
  readonly formatTownDay = formatTownDay;
  private readonly started = new Set<number>();
  private readonly loadGen = new Map<number, number>();
  private readonly markGen = new Map<number, number>();
  private seen: TownResponse | null = null;
  private changed = false;

  constructor() {
    effect(() => {
      const data = this.data();
      if (this.seen !== null && this.seen !== data) {
        for (const habit of data.habits) this.bump(this.markGen, habit.id);
        this.markingIds.set({});
      }
      this.seen = data;
      for (const habit of data.habits) this.load(habit);
    });
    this.destroy.onDestroy(() => {
      for (const habit of this.data().habits) this.bump(this.markGen, habit.id);
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
    this.bump(this.loadGen, habit.id);
    this.bump(this.markGen, habit.id);
    this.clearMarking(habit.id);
    this.started.delete(habit.id);
    this.rowState.update(state => {
      const copy = { ...state };
      delete copy[habit.id];
      return copy;
    });
    this.load(habit);
  }

  /** Yesterday stays unmarked until this habit's history has loaded, and while its POST is in flight. */
  yesterdayBlocked(habit: Habit): boolean {
    return !this.loaded(habit) || this.marking(habit);
  }

  marking(habit: Habit): boolean {
    return this.markingIds()[habit.id] === true;
  }

  yesterdayNote(habit: Habit): string {
    if (this.marking(habit)) return 'Saving yesterday.';
    if (this.rowFailed(habit)) return 'History failed to load. Yesterday cannot be marked.';
    return 'History is still loading. Yesterday cannot be marked yet.';
  }

  yesterdayNoteId(habit: Habit): string {
    return `yesterday-note-${habit.id}`;
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
    if (this.yesterdayBlocked(habit)) return;
    const day = addDays(this.data().town.today, -1);
    const generation = this.generation(this.markGen, habit.id);
    this.markingIds.update(state => ({ ...state, [habit.id]: true }));
    this.api.checkin(habit.id, day).pipe(takeUntilDestroyed(this.destroy)).subscribe({
      next: () => {
        this.clearMarking(habit.id);
        if (!this.markStillCurrent(habit.id, generation)) return;
        this.changed = true;
        this.days.update(map => {
          const current = map[habit.id] ?? [];
          if (current.includes(day)) return map;
          return { ...map, [habit.id]: [...current, day] };
        });
        this.dirty.emit();
      },
      error: (error: unknown) => {
        this.clearMarking(habit.id);
        if (!this.markStillCurrent(habit.id, generation)) return;
        this.toast.error(apiProblem(error).message);
      },
    });
  }

  dismiss(): void {
    for (const habit of this.data().habits) this.bump(this.markGen, habit.id);
    this.closed.emit(this.changed);
  }

  private load(habit: Habit): void {
    if (this.started.has(habit.id)) return;
    this.started.add(habit.id);
    const generation = this.generation(this.loadGen, habit.id);
    const today = this.data().town.today;
    this.api.getCheckins(habit.id, historyFrom(habit.created_on, today), today)
      .pipe(takeUntilDestroyed(this.destroy))
      .subscribe({
        next: body => {
          if (this.generation(this.loadGen, habit.id) !== generation) return;
          this.days.update(map => ({ ...map, [habit.id]: body.days }));
          this.rowState.update(state => ({ ...state, [habit.id]: 'ready' }));
        },
        error: (error: unknown) => {
          if (this.generation(this.loadGen, habit.id) !== generation) return;
          this.toast.error(apiProblem(error).message);
          this.rowState.update(state => ({ ...state, [habit.id]: 'error' }));
        },
      });
  }

  private markStillCurrent(id: number, generation: number): boolean {
    return this.generation(this.markGen, id) === generation && this.rowState()[id] === 'ready';
  }

  private generation(map: Map<number, number>, id: number): number {
    return map.get(id) ?? 0;
  }

  private bump(map: Map<number, number>, id: number): void {
    map.set(id, this.generation(map, id) + 1);
  }

  private clearMarking(id: number): void {
    this.markingIds.update(state => {
      if (!state[id]) return state;
      const copy = { ...state };
      delete copy[id];
      return copy;
    });
  }
}
