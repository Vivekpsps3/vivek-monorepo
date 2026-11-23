import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, effect, inject, input, output, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { ToastService, UiBadgeComponent, UiButtonComponent, UiEmptyStateComponent } from '@vivek/ui';
import { SessionService } from '../platform/session.service';
import {
  EMPTY_FEEDBACK,
  armCheck,
  armUndo,
  commitCheck,
  commitUndo,
  dropAll,
  dropHabit,
  failCheck,
  failUndo,
  feedbackAttr,
  feedbackLabel,
  visibleMark,
  type FeedbackBook,
  type FeedbackMark,
} from './habit-feedback';
import { TownApiService, type CheckinResult } from './town.api';
import { treasuryFace as presentTreasury, type TreasuryFace, type TreasuryView } from './weeks-kept';
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
export function liveUndo(name: string): string {
  return `${name} undone.`;
}

/** Repeat an identical announcement so a second check or undo is spoken again. */
export function liveAgain(previous: string, message: string): string {
  return previous === message ? `${message}\u200b` : message;
}

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
  imports: [RouterLink, UiBadgeComponent, UiButtonComponent, UiEmptyStateComponent],
  templateUrl: './town-today.component.html',
  styleUrl: './town-today.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[attr.data-pending-ms]': 'pendingMs()' },
})
export class TownTodayComponent {
  private readonly api = inject(TownApiService);
  private readonly toast = inject(ToastService);
  private readonly session = inject(SessionService);
  private readonly destroy = inject(DestroyRef);
  private readonly host = inject(ElementRef<HTMLElement>);
  private actionEpoch = 0;
  private ownerId: number | null | undefined;
  private readonly inflight = signal<Readonly<Record<number, true>>>({});
  readonly data = input.required<TownResponse>();
  readonly vaultPresent = input(false);
  /** Completed Finance budget weeks. Habit streaks do not fill this in. */
  readonly treasury = input<TreasuryView | null>(null);
  readonly live = input('');
  readonly newHabit = output<void>();
  readonly history = output<void>();
  readonly settled = output<CheckinResult>();
  readonly dayChanged = output<void>();
  readonly feedback = output<FeedbackBook>();
  readonly pending = signal<Readonly<Record<number, boolean>>>({});
  readonly feedbackBook = signal<FeedbackBook>(EMPTY_FEEDBACK);
  /** Milliseconds from the click to the pending mark. Scene celebration is not included. */
  readonly pendingMs = signal<number | null>(null);
  protected readonly feedbackLabel = feedbackLabel;
  protected readonly feedbackAttr = feedbackAttr;
  private book: FeedbackBook = EMPTY_FEEDBACK;
  private boundDay: string | null = null;
  private readonly focusHabit = signal<number | null>(null);
  /** Snapshot present when a check was armed. Only the next snapshot may move focus back. */
  private focusBaseline: TownResponse | null = null;

  constructor() {
    this.session.user$.pipe(takeUntilDestroyed(this.destroy)).subscribe(user => {
      const id = user?.id ?? null;
      if (this.ownerId === undefined) {
        this.ownerId = id;
        return;
      }
      if (this.ownerId === id) return;
      this.ownerId = id;
      this.dropPending();
    });
    this.session.cleared$.pipe(takeUntilDestroyed(this.destroy)).subscribe(() => this.dropPending());
    effect(() => {
      const data = this.data();
      const day = data.town.today;
      if (this.boundDay === null) this.boundDay = day;
      else if (this.boundDay !== day) {
        this.boundDay = day;
        this.dropPending();
        return;
      }
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

  treasuryFace(): TreasuryFace {
    return presentTreasury(!this.vaultPresent()
      ? { status: 'locked' }
      : (this.treasury() ?? { status: 'loading' }));
  }

  autoLabel(kind: 'library' | 'inn', building: Building): string {
    const source = kind === 'library' ? 'Media' : 'Travel';
    if (building.source === 'unavailable') return `${source} unavailable`;
    return `${source} · +${building.today_xp}/${building.today_cap} XP today`;
  }

  busyCheck(habit: Habit): boolean {
    return this.inflight()[habit.id] === true;
  }

  markFor(habit: Habit): FeedbackMark | null {
    const owner = this.ownerNow();
    if (owner == null) return null;
    return visibleMark(this.feedbackBook(), habit.id, owner, this.data().town.today);
  }

  describedBy(habit: Habit): string | undefined {
    return this.markFor(habit) ? `habit-feedback-${habit.id}` : undefined;
  }

  toggle(habit: Habit): void {
    if (this.busyCheck(habit)) return;
    const started = performance.now();
    const next = !this.pressed(habit);
    const day = this.data().town.today;
    const epoch = this.actionEpoch;
    const owner = this.ownerId;
    const ownerForMark = this.ownerNow();
    this.pending.update(state => ({ ...state, [habit.id]: next }));
    this.inflight.update(state => ({ ...state, [habit.id]: true }));
    this.focusHabit.set(habit.id);
    if (ownerForMark != null) {
      const subject = { habitId: habit.id, day, ownerId: ownerForMark, style: habit.building_style };
      this.publish(next ? armCheck(this.book, subject) : armUndo(this.book, subject));
    }
    this.pendingMs.set(performance.now() - started);
    const request = next ? this.api.checkin(habit.id, day) : this.api.undoCheckin(habit.id, day);
    request.pipe(takeUntilDestroyed(this.destroy)).subscribe({
      next: result => {
        this.clearInflight(habit.id);
        if (epoch !== this.actionEpoch || owner !== this.ownerId) return;
        if (result.day !== day || this.data().town.today !== day) {
          this.clearOptimistic(habit.id);
          this.publish(dropHabit(this.book, habit.id));
          return;
        }
        if (next) {
          if (ownerForMark != null) {
            const committed = commitCheck(this.book, { habitId: habit.id, day, ownerId: ownerForMark });
            if (!committed.celebrated) {
              this.clearOptimistic(habit.id);
              return;
            }
            this.publish(committed.book);
          }
        } else if (ownerForMark != null) {
          this.publish(commitUndo(this.book, { habitId: habit.id, day, ownerId: ownerForMark }));
        }
        this.settled.emit(result);
      },
      error: (error: unknown) => {
        this.clearInflight(habit.id);
        if (epoch !== this.actionEpoch || owner !== this.ownerId) return;
        this.fail(habit.id, problem(error));
      },
    });
  }

  private ownerNow(): number | null {
    return this.ownerId === undefined ? (this.session.currentUser?.id ?? null) : this.ownerId;
  }

  private publish(book: FeedbackBook): void {
    if (book === this.book) return;
    this.book = book;
    this.feedbackBook.set(book);
    this.feedback.emit(book);
  }

  /** Owner, session, and day changes drop every in-flight check before a late response can celebrate. */
  private dropPending(): void {
    this.actionEpoch += 1;
    this.pending.set({});
    this.inflight.set({});
    this.focusHabit.set(null);
    this.focusBaseline = null;
    this.publish(dropAll(this.book));
  }

  private clearInflight(id: number): void {
    this.inflight.update(state => {
      if (!state[id]) return state;
      const copy = { ...state };
      delete copy[id];
      return copy;
    });
  }

  private clearOptimistic(id: number): void {
    this.pending.update(state => {
      if (!(id in state)) return state;
      const copy = { ...state };
      delete copy[id];
      return copy;
    });
  }

  private fail(id: number, issue: { code?: string; message: string }): void {
    if (issue.code === 'day_out_of_window') {
      this.dropPending();
      this.toast.error('The day changed. Try again.');
      this.dayChanged.emit();
      return;
    }
    this.clearOptimistic(id);
    const mark = this.book.marks[id];
    this.publish(mark?.intent === 'undo' ? failUndo(this.book, id) : failCheck(this.book, id));
    this.focusHabit.set(null);
    this.toast.error(issue.message);
  }
}
