import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { formatDate, todayIsoDate } from '@vivek/browser';
import { UiButtonComponent, UiStateComponent, type HubCardState, type UiIconName } from '@vivek/ui';
import { LifePosterComponent } from './life-poster.component';
import { LifeTableComponent } from './life-table.component';
import { LifeWeekComponent, type LifeStep } from './life-week.component';
import {
  buildLifeGrid,
  lifeBirthdayState,
  lifeCellAt,
  lifeMoveSelection,
  lifePosterMetrics,
  lifePosterTier,
  lifeWeekAnnouncement,
  type LifeGrid,
} from './life-model';
import { sourceNotices, withoutFinance } from './pixels-model';
import { PixelsDataService } from './pixels-data.service';
import { PixelsPreferences } from './pixels-preferences';
import type { PixelsSnapshot } from './pixels.types';

type LifePhase = 'loading' | 'ready' | 'stale' | 'unavailable' | 'expired' | 'missing' | 'future';

@Component({
  selector: 'app-pixels-life',
  standalone: true,
  imports: [RouterLink, UiButtonComponent, UiStateComponent, LifePosterComponent, LifeTableComponent, LifeWeekComponent],
  templateUrl: './life-page.component.html',
  styleUrl: './life-page.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LifePageComponent {
  protected readonly preferences = inject(PixelsPreferences);
  private readonly data = inject(PixelsDataService);

  protected readonly phase = signal<LifePhase>('loading');
  protected readonly snapshot = signal<PixelsSnapshot | null>(null);
  protected readonly grid = signal<LifeGrid | null>(null);
  protected readonly selected = signal<{ row: number; week: number } | null>(null);
  protected readonly announcement = signal('');
  protected readonly viewport = signal(readWidth());

  protected readonly showAge = computed(() => this.snapshot()?.profile?.showAge === true);
  protected readonly metrics = computed(() => lifePosterMetrics(lifePosterTier(this.viewport()), this.showAge()));
  protected readonly selectedCell = computed(() => {
    const grid = this.grid();
    const selected = this.selected();
    if (!grid || !selected) return null;
    return lifeCellAt(grid, selected.row, selected.week);
  });
  protected readonly banners = computed(() => {
    const sources = this.snapshot()?.sources;
    if (!sources) return [];
    return sourceNotices(sources).filter(text => text.includes('unavailable'));
  });
  protected readonly trips = computed(() => {
    const trips = this.snapshot()?.trips ?? [];
    return [...trips].sort((left, right) => (left.start < right.start ? 1 : left.start > right.start ? -1 : right.id - left.id));
  });
  protected readonly uiState = computed<HubCardState>(() => {
    const phase = this.phase();
    if (phase === 'missing' || phase === 'future') return 'empty';
    return phase;
  });
  protected readonly emptyTitle = computed(() => (this.phase() === 'future' ? 'Check your birthday' : 'Add your birthday'));
  protected readonly emptyMessage = computed(() => (
    this.phase() === 'future'
      ? 'The saved birthday is in the future, so there is nothing to draw yet.'
      : 'Life in Pixels draws one square per week since you were born. Your birthday stays private.'
  ));
  protected readonly emptyAction = computed(() => (this.phase() === 'future' ? 'Fix in Settings' : 'Add your birthday'));
  protected readonly emptyIcon = computed<UiIconName>(() => (this.phase() === 'future' ? 'alert' : 'calendar'));
  protected readonly updatedAt = computed(() => this.snapshot()?.fetchedAt ?? null);
  protected readonly showTown = computed(() => this.snapshot()?.sources.town !== 'absent');
  protected readonly showMedia = computed(() => this.snapshot()?.sources.media !== 'absent');
  protected readonly showTravel = computed(() => this.snapshot()?.sources.travel !== 'absent');
  protected readonly groupLabel = computed(() => {
    const rows = this.grid()?.rowCount ?? 0;
    if (this.preferences.view() === 'table') {
      return `Life in weeks table, ${rows} rows of 52 weeks. Use arrow keys to move. Poster view is available.`;
    }
    return `Life in weeks: ${rows} rows of 52 weeks. Use arrow keys to move. Table view is available.`;
  });

  private generation = 0;
  private today = '';
  private announceTimer: ReturnType<typeof setTimeout> | null = null;
  private pendingAnnouncement = '';

  constructor() {
    const destroy = inject(DestroyRef);
    const onResize = () => this.viewport.set(readWidth());
    window.addEventListener('resize', onResize);
    destroy.onDestroy(() => {
      this.generation += 1;
      window.removeEventListener('resize', onResize);
      if (this.announceTimer != null) clearTimeout(this.announceTimer);
    });
    this.data.financeCleared$.pipe(takeUntilDestroyed()).subscribe(() => this.clearFinance());
    this.load();
  }

  protected load(): void {
    const generation = ++this.generation;
    void this.fetch(generation);
  }

  protected toggleView(): void {
    this.preferences.setView(this.preferences.view() === 'table' ? 'grid' : 'table');
  }

  protected select(next: { row: number; week: number }): void {
    const grid = this.grid();
    if (!grid) return;
    const cell = lifeCellAt(grid, next.row, next.week);
    if (!cell) return;
    this.selected.set({ row: cell.row, week: cell.week });
    this.queueAnnouncement(lifeWeekAnnouncement(cell, grid.showAge, formatDate(cell.start, 'range')));
  }

  protected selectRow(row: number): void {
    const grid = this.grid();
    if (!grid) return;
    const current = this.selected();
    const week = current?.row === row ? current.week : grid.now?.row === row ? grid.now.week : 1;
    this.select({ row, week });
  }

  protected onStep(step: LifeStep): void {
    const delta: Record<LifeStep, [number, number]> = {
      'week-prev': [0, -1],
      'week-next': [0, 1],
      'year-prev': [-1, 0],
      'year-next': [1, 0],
    };
    this.move(delta[step][0], delta[step][1]);
  }

  protected onKey(event: KeyboardEvent): void {
    if (event.altKey || event.metaKey || event.ctrlKey) return;
    const grid = this.grid();
    const selected = this.selected();
    if (!grid || !selected) return;
    if (event.key === 't' || event.key === 'T') {
      const now = grid.now;
      if (now) this.select(now);
      event.preventDefault();
      return;
    }
    if (event.key === 'Home') {
      this.move(0, 1 - selected.week);
      event.preventDefault();
      return;
    }
    if (event.key === 'End') {
      this.move(0, 52 - selected.week);
      event.preventDefault();
      return;
    }
    const deltas: Record<string, [number, number]> = {
      ArrowLeft: [0, -1],
      ArrowRight: [0, 1],
      ArrowUp: [-1, 0],
      ArrowDown: [1, 0],
      PageUp: [-10, 0],
      PageDown: [10, 0],
    };
    const delta = deltas[event.key];
    if (!delta) return;
    this.move(delta[0], delta[1]);
    event.preventDefault();
  }

  protected tripWhen(start: string): string {
    return formatDate(start, 'range');
  }

  private move(rowDelta: number, weekDelta: number): void {
    const grid = this.grid();
    const selected = this.selected();
    if (!grid || !selected) return;
    this.select(lifeMoveSelection(selected, grid.rowCount, rowDelta, weekDelta));
  }

  private async fetch(generation: number): Promise<void> {
    const today = todayIsoDate();
    this.today = today;
    if (!this.snapshot()) this.phase.set('loading');
    const probe = await this.data.load({ from: today, to: today, profile: true, includeTrips: true, today });
    if (generation !== this.generation) return;
    if (probe.status === 'dropped') {
      if (!this.snapshot()) this.phase.set('unavailable');
      return;
    }
    if (probe.status !== 'ready') {
      this.fail(probe.status);
      return;
    }
    const birthday = probe.snapshot.profile?.birthday ?? null;
    const state = lifeBirthdayState(birthday, today);
    if (state !== 'ready' || !birthday) {
      this.snapshot.set(probe.snapshot);
      this.grid.set(null);
      this.selected.set(null);
      this.phase.set(state === 'future' ? 'future' : 'missing');
      return;
    }
    const full = birthday === today
      ? probe
      : await this.data.load({ from: birthday, to: today, profile: true, includeTrips: true, today });
    if (generation !== this.generation) return;
    if (full.status === 'dropped') {
      if (!this.snapshot()) this.phase.set('unavailable');
      return;
    }
    if (full.status !== 'ready') {
      this.fail(full.status);
      return;
    }
    this.apply(full.snapshot);
  }

  private apply(snapshot: PixelsSnapshot): void {
    this.snapshot.set(snapshot);
    const birthday = snapshot.profile?.birthday ?? null;
    const state = lifeBirthdayState(birthday, this.today);
    if (state !== 'ready' || !birthday) {
      this.grid.set(null);
      this.selected.set(null);
      this.phase.set(state === 'future' ? 'future' : 'missing');
      return;
    }
    const grid = buildLifeGrid({
      birthday,
      today: this.today,
      showAge: snapshot.profile?.showAge === true,
      days: snapshot.days,
      trips: snapshot.trips,
    });
    this.grid.set(grid);
    if (!grid) {
      this.phase.set('missing');
      return;
    }
    this.phase.set('ready');
    const selected = this.selected();
    const next = selected && selected.row < grid.rowCount ? selected : grid.now ?? { row: 0, week: 1 };
    this.select(next);
  }

  private fail(status: 'expired' | 'unavailable'): void {
    if (this.grid()) this.phase.set('stale');
    else this.phase.set(status);
  }

  private clearFinance(): void {
    const snapshot = this.snapshot();
    if (!snapshot) return;
    this.apply(withoutFinance(snapshot, this.today || todayIsoDate()));
  }

  private queueAnnouncement(text: string): void {
    this.pendingAnnouncement = text;
    if (this.announceTimer != null) clearTimeout(this.announceTimer);
    this.announceTimer = setTimeout(() => {
      this.announceTimer = null;
      this.announcement.set(this.pendingAnnouncement);
    }, 150);
  }
}

function readWidth(): number {
  return typeof window === 'undefined' ? 1280 : window.innerWidth;
}
