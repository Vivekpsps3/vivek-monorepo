import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { formatDate, todayIsoDate } from '@vivek/browser';
import { UiButtonComponent, UiStateComponent, dayActivities, type HubCardState, type UiIconName } from '@vivek/ui';
import { atlasCoverageLines, compactMemoryPreview, type AtlasLine, type CompactMemoryPreview } from './atlas';
import { AtlasNoteComponent } from './atlas-note.component';
import { buildDayMemory, financeReading } from './day-memory';
import { isIsoDate } from './pixels-dates';
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
import { buildDay, sourceNotices, withoutFinance } from './pixels-model';
import { PixelsDataService } from './pixels-data.service';
import { PixelsPreferences } from './pixels-preferences';
import type { DayFactsStatus, PixelDayFacts, PixelDayView, PixelsSnapshot } from './pixels.types';

type LifePhase = 'loading' | 'ready' | 'stale' | 'unavailable' | 'expired' | 'missing' | 'future';

@Component({
  selector: 'app-pixels-life',
  standalone: true,
  imports: [AtlasNoteComponent, RouterLink, UiButtonComponent, UiStateComponent, LifePosterComponent, LifeTableComponent, LifeWeekComponent],
  templateUrl: './life-page.component.html',
  styleUrl: './life-page.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LifePageComponent {
  protected readonly preferences = inject(PixelsPreferences);
  private readonly data = inject(PixelsDataService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  protected readonly phase = signal<LifePhase>('loading');
  protected readonly snapshot = signal<PixelsSnapshot | null>(null);
  protected readonly grid = signal<LifeGrid | null>(null);
  protected readonly selected = signal<{ row: number; week: number } | null>(null);
  protected readonly announcement = signal('');
  protected readonly viewport = signal(readWidth());
  protected readonly focus = signal<string | null>(null);
  protected readonly loadedPreviewDate = signal<string | null>(null);
  protected readonly previewFacts = signal<PixelDayFacts | null>(null);
  protected readonly previewStatus = signal<DayFactsStatus>('idle');
  private loadedPreview: string | null = null;

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
  protected readonly coverage = computed((): AtlasLine[] => atlasCoverageLines({
    surface: 'life',
    firstActivityOn: this.snapshot()?.firstActivityOn ?? null,
  }));
  protected readonly previewDay = computed((): PixelDayView | null => {
    const date = this.loadedPreviewDate();
    const snapshot = this.snapshot();
    if (!date || !snapshot) return null;
    return snapshot.days.find(day => day.date === date)
      ?? buildDay(date, { town: 0, media: 0, trip: 0, fin: null }, this.today || date, snapshot.trips);
  });
  protected readonly memoryPreview = computed((): CompactMemoryPreview | null => {
    const day = this.previewDay();
    const snapshot = this.snapshot();
    if (!day || !snapshot) return null;
    const activities = dayActivities(day.channels);
    return compactMemoryPreview({
      memory: buildDayMemory({
        day,
        financeStatus: snapshot.financeStatus,
        facts: this.previewFacts(),
        factsStatus: this.previewStatus(),
      }),
      activityLabel: activities === 1 ? '1 activity' : `${activities} activities`,
      annotations: this.previewStatus() === 'ready' ? (this.previewFacts()?.annotations.length ?? 0) : 0,
      future: day.future,
      includeConnectors: true,
    });
  });
  protected readonly groupLabel = computed(() => {
    const rows = this.grid()?.rowCount ?? 0;
    if (this.preferences.view() === 'table') {
      return `Life in weeks table, ${rows} rows of 52 weeks. Use arrow keys to move. Poster view is available.`;
    }
    return `Life in weeks: ${rows} rows of 52 weeks. Use arrow keys to move. Table view is available.`;
  });

  private generation = 0;
  private previewRequest = 0;
  private today = '';
  private announceTimer: ReturnType<typeof setTimeout> | null = null;
  private pendingAnnouncement = '';

  constructor() {
    const destroy = inject(DestroyRef);
    const onResize = () => this.viewport.set(readWidth());
    window.addEventListener('resize', onResize);
    destroy.onDestroy(() => {
      this.generation += 1;
      this.previewRequest += 1;
      window.removeEventListener('resize', onResize);
      if (this.announceTimer != null) clearTimeout(this.announceTimer);
    });
    this.data.financeCleared$.pipe(takeUntilDestroyed()).subscribe(() => this.clearFinance());
    this.data.userChanged$.pipe(takeUntilDestroyed()).subscribe(() => this.onUserChanged());
    this.route.queryParamMap.pipe(takeUntilDestroyed()).subscribe(params => {
      this.restoreQuery(params.get('span'), params.get('focus'));
    });
    this.load();
  }

  protected load(): void {
    this.loadedPreview = null;
    const generation = ++this.generation;
    void this.fetch(generation);
  }

  protected toggleView(): void {
    this.preferences.setView(this.preferences.view() === 'table' ? 'grid' : 'table');
  }

  protected select(next: { row: number; week: number }): void {
    this.applySelection(next, true);
  }

  protected lifeReturn(): string {
    const start = this.selectedCell()?.start;
    return start ? `/pixels/life?span=${start}` : '/pixels/life';
  }

  protected financeLegendText(): string | null {
    const status = this.snapshot()?.financeStatus;
    if (!status || status === 'locked' || status === 'ready') return null;
    return financeReading(status, null).text;
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
    const focus = this.route.snapshot.queryParamMap.get('focus');
    const span = this.route.snapshot.queryParamMap.get('span');
    const focusCell = focus && isIsoDate(focus)
      ? grid.cells.find(cell => cell.start <= focus && focus <= cell.end)
      : null;
    const spanCell = !focusCell && span && isIsoDate(span)
      ? grid.cells.find(cell => cell.start === span)
      : null;
    const fromQuery = focusCell ?? spanCell;
    const selected = this.selected();
    const next = fromQuery
      ? { row: fromQuery.row, week: fromQuery.week }
      : selected && selected.row < grid.rowCount
        ? selected
        : grid.now ?? { row: 0, week: 1 };
    this.applySelection(next, true);
  }

  private applySelection(next: { row: number; week: number }, publish: boolean): void {
    const grid = this.grid();
    if (!grid) return;
    const cell = lifeCellAt(grid, next.row, next.week);
    if (!cell) return;
    const current = this.selected();
    if (current?.row !== cell.row || current.week !== cell.week) {
      this.selected.set({ row: cell.row, week: cell.week });
      this.queueAnnouncement(lifeWeekAnnouncement(cell, grid.showAge, formatDate(cell.start, 'range')));
    }
    const queryFocus = this.route.snapshot.queryParamMap.get('focus');
    const kept = queryFocus && isIsoDate(queryFocus) && queryFocus >= cell.start && queryFocus <= cell.end
      ? queryFocus
      : null;
    if (this.focus() !== kept) this.focus.set(kept);
    const date = kept ?? (this.today >= cell.start && this.today <= cell.end ? this.today : cell.start);
    if (this.loadedPreview !== date) this.loadPreview(date);
    if (publish) this.publishSpan(cell.start);
  }

  private restoreQuery(span: string | null, focus: string | null): void {
    const grid = this.grid();
    if (!grid) return;
    const focusCell = focus && isIsoDate(focus)
      ? grid.cells.find(cell => cell.start <= focus && focus <= cell.end)
      : null;
    const spanCell = span && isIsoDate(span) ? grid.cells.find(cell => cell.start === span) : null;
    const cell = focusCell ?? spanCell;
    if (!cell) return;
    const selected = this.selected();
    if (selected?.row === cell.row && selected.week === cell.week) {
      const kept = focusCell ? focus : null;
      if (this.focus() !== kept) this.focus.set(kept);
      return;
    }
    this.applySelection({ row: cell.row, week: cell.week }, false);
  }

  private publishSpan(start: string): void {
    if (this.route.snapshot.routeConfig?.path !== 'life') return;
    const currentSpan = this.route.snapshot.queryParamMap.get('span');
    const currentFocus = this.route.snapshot.queryParamMap.get('focus');
    const kept = this.focus();
    if (currentSpan === start && (currentFocus ?? null) === kept) return;
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { span: start, focus: kept },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  private loadPreview(date: string): void {
    const requestId = ++this.previewRequest;
    this.loadedPreview = date;
    this.loadedPreviewDate.set(date);
    this.previewFacts.set(null);
    this.previewStatus.set('loading');
    void this.data.loadDay(date).then(result => {
      if (requestId !== this.previewRequest) return;
      if (result.status === 'dropped') return;
      if (result.status === 'ready' && result.facts.date === date) {
        this.previewFacts.set(result.facts);
        this.previewStatus.set('ready');
        return;
      }
      this.previewFacts.set(null);
      this.previewStatus.set(result.status === 'expired' ? 'expired' : 'unavailable');
    });
  }

  private onUserChanged(): void {
    this.generation += 1;
    this.previewRequest += 1;
    this.loadedPreview = null;
    this.loadedPreviewDate.set(null);
    this.previewFacts.set(null);
    this.previewStatus.set('idle');
    this.focus.set(null);
    this.snapshot.set(null);
    this.grid.set(null);
    this.selected.set(null);
    this.phase.set('loading');
    this.load();
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
