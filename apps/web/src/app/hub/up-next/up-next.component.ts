import { HttpClient } from '@angular/common/http';
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, DestroyRef, computed, effect, inject, input, output, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Subject, finalize, takeUntil, timeout } from 'rxjs';
import { ToastService, UiButtonComponent, UiIconComponent, UiSkeletonComponent, UiStateComponent } from '@vivek/ui';
import type { HubCardState } from '../hub-load';
import type { MediaHubSummary, TravelReminder, TravelSummary } from '../hub-decode';
import { rowDateLabel, shiftDay, upNextRows, type AgendaSource, type UpNextRow } from './up-next';
import { browserTimeZone, isoDateInZone } from '@vivek/browser';

const compactLimit = 3;

@Component({
  selector: 'app-up-next',
  standalone: true,
  imports: [RouterLink, UiButtonComponent, UiIconComponent, UiSkeletonComponent, UiStateComponent],
  templateUrl: './up-next.component.html',
  styleUrl: './up-next.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UpNextComponent {
  expanded = input(false);
  windowStart = input('');
  windowEnd = input('');
  selectedSources = input<readonly AgendaSource[]>(['travel', 'media']);
  windowChange = output<string>();
  sourcesChange = output<readonly AgendaSource[]>();
  readonly monthLabel = computed(() => new Date(this.windowStart() + 'T12:00:00').toLocaleDateString(undefined, { month: 'long', year: 'numeric' }));
  readonly monthDays = computed(() => {
    if (!this.expanded()) return [];
    const first = new Date(this.windowStart() + 'T12:00:00');
    const days = Number(this.windowEnd().slice(8));
    return [...Array.from({ length: first.getDay() }, () => ''),
      ...Array.from({ length: days }, (_, i) => shiftDay(this.windowStart(), i))];
  });

  moveMonth(direction: number): void {
    const point = new Date(this.windowStart() + 'T12:00:00');
    point.setMonth(point.getMonth() + direction);
    this.windowChange.emit(isoDateInZone(point, browserTimeZone()));
  }

  dayLabel(date: string): string {
    const count = this.rows().filter(row => row.date === date).length;
    return `${new Date(date + 'T12:00:00').toLocaleDateString(undefined, { month: 'long', day: 'numeric' })}, ${count} ${count === 1 ? 'event' : 'events'}`;
  }

  hasEvents(date: string): boolean { return this.rows().some(row => row.date === date); }

  focusDate(date: string): void {
    document.getElementById(`agenda-${date}`)?.focus();
  }

  ownerId = input<number | null>(null);
  today = input.required<Date>();
  travel = input<TravelSummary | null>(null);
  travelState = input<HubCardState>('loading');
  travelPending = input(false);
  travelUpdatedAt = input<number | null>(null);
  media = input<MediaHubSummary | null>(null);
  mediaState = input<HubCardState>('loading');
  mediaPending = input(false);
  mediaUpdatedAt = input<number | null>(null);
  financeState = input<HubCardState>('locked');
  financePending = input(false);
  financeUpdatedAt = input<number | null>(null);
  billsDue = input<number | null>(null);
  retryTravel = output<void>();
  retryMedia = output<void>();
  retryFinance = output<void>();

  private readonly http = inject(HttpClient);
  private readonly toast = inject(ToastService);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly edits = new Subject<void>();
  private epoch = 0;
  readonly pending = new Map<number, { reminder: TravelReminder; before: boolean }>();
  readonly filters = signal<readonly AgendaSource[]>(['travel', 'media']);
  readonly skeleton = signal(false);
  readonly sources = computed(() => [
    { id: 'travel' as const, label: 'Travel', state: this.travelState(), pending: this.travelPending(), updatedAt: this.travelUpdatedAt() },
    { id: 'media' as const, label: 'Media', state: this.mediaState(), pending: this.mediaPending(), updatedAt: this.mediaUpdatedAt() },
  ]);
  readonly expired = computed(() => [...this.sources().map(source => source.state), this.financeState()].includes('expired'));
  readonly loading = computed(() => this.sources().some(source => source.state === 'loading') || this.financeState() === 'loading' || this.sources().some(source => source.pending) || this.financePending());
  readonly rows = computed(() => upNextRows(this.travel()?.up_next ?? [], this.media()?.calendars ?? [],
    isoDateInZone(this.today(), browserTimeZone()), this.expanded() ? this.windowStart() : undefined,
    this.expanded() ? this.windowEnd() : undefined, this.expanded()).filter(row => this.filters().includes(row.source)));
  readonly groups = computed(() => {
    const rows = this.rows();
    if (!this.expanded()) return rows.length ? [{ date: null, rows: rows.slice(0, compactLimit) }] : [];
    return [...new Set(rows.map(row => row.date))].sort().map(date => ({ date, rows: rows.filter(row => row.date === date) }));
  });
  readonly moreSources = computed(() => new Set(this.rows().slice(compactLimit).map(row => row.source)));
  readonly empty = computed(() => this.filters().length === 2 && this.rows().length === 0 && this.sources().every(source =>
    source.state === 'ready' || source.state === 'empty') && (this.financeState() === 'ready' || this.financeState() === 'empty') && this.billsDue() === 0);

  constructor() {
    effect(() => this.filters.set(this.selectedSources()));
    // A reload, owner switch or disposal invalidates pending writes and any toast Undo closure.
    effect(() => {
      this.ownerId(); this.travel(); this.travelPending(); this.travelState();
      this.resetEdits();
    });
    effect(onCleanup => {
      if (!this.loading()) { this.skeleton.set(false); return; }
      const timer = setTimeout(() => this.skeleton.set(true), 150);
      onCleanup(() => clearTimeout(timer));
    });
    inject(DestroyRef).onDestroy(() => { this.resetEdits(); this.edits.complete(); });
  }

  toggleSource(source: AgendaSource): void {
    this.filters.update(values => values.includes(source) ? values.filter(value => value !== source) : [...values, source]);
    this.sourcesChange.emit(this.filters());
  }

  retry(source: AgendaSource): void {
    if (source === 'travel') this.retryTravel.emit();
    else this.retryMedia.emit();
  }

  dateLabel(row: UpNextRow): string { return rowDateLabel(row, this.today()); }

  markDone(reminder: TravelReminder): void {
    if (!this.ownerId() || this.travelState() !== 'ready' || this.travelPending() || reminder.done || this.pending.has(reminder.id)) return;
    this.saveReminder(reminder, true, this.epoch);
  }

  private saveReminder(reminder: TravelReminder, done: boolean, epoch: number): void {
    if (epoch !== this.epoch || !this.ownerId() || reminder.done === done || this.pending.has(reminder.id)) return;
    const before = reminder.done;
    reminder.done = done;
    this.pending.set(reminder.id, { reminder, before });
    // ReminderIn replaces every field; preserve the original wall time, kind, and notes.
    const body = { title: reminder.title, due_at: reminder.due_at, done, kind: reminder.kind, notes: reminder.notes };
    this.http.patch(`/travel/api/reminders/${reminder.id}`, body).pipe(
      timeout(8_000), takeUntil(this.edits),
      finalize(() => { if (epoch === this.epoch) this.pending.delete(reminder.id); this.cdr.markForCheck(); }),
    ).subscribe({
      next: () => {
        if (epoch !== this.epoch) return;
        if (done) this.toast.success('Reminder marked done.', () => this.saveReminder(reminder, false, epoch));
      },
      error: () => {
        if (epoch !== this.epoch) return;
        reminder.done = before;
        this.toast.error(`Couldn't ${done ? 'mark' : 'undo'} "${reminder.title}"${done ? ' done' : ''}. Try again.`);
      },
    });
    this.cdr.markForCheck();
  }

  private resetEdits(): void {
    this.epoch += 1;
    this.edits.next();
    for (const { reminder, before } of this.pending.values()) reminder.done = before;
    this.pending.clear();
  }
}
