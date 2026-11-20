import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, ViewChild, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, NavigationStart, Router, Scroll } from '@angular/router';
import { todayIsoDate } from '@vivek/browser';
import { ReturnContext, UiStateComponent, returnPath, type HubCardState } from '@vivek/ui';
import { DayDetailComponent } from './day-detail.component';
import { PixelsLegendComponent } from './pixels-legend.component';
import { PixelsDataService } from './pixels-data.service';
import { clampYearDay, yearOf } from './pixels-dates';
import { sourceNotices, withoutFinance, yearScreenState, yearStats } from './pixels-model';
import { PixelsPreferences } from './pixels-preferences';
import type { AnnotationChange, DayFactsStatus, PixelDayFacts, PixelsSnapshot } from './pixels.types';
import { YearGridComponent } from './year-grid.component';
import { YearStatsComponent } from './year-stats.component';
import { YearTableComponent } from './year-table.component';
import { YearToolbarComponent } from './year-toolbar.component';

function yearKey(year: number): string {
  return String(year).padStart(4, '0');
}

@Component({
  selector: 'app-pixels-year',
  standalone: true,
  imports: [
    DayDetailComponent,
    PixelsLegendComponent,
    UiStateComponent,
    YearGridComponent,
    YearStatsComponent,
    YearTableComponent,
    YearToolbarComponent,
  ],
  templateUrl: './year-page.component.html',
  styleUrls: ['./pixels.css', './year-page.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class YearPageComponent {
  @ViewChild(YearGridComponent) private yearGrid?: YearGridComponent;
  private readonly data = inject(PixelsDataService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly context = inject(ReturnContext);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly destroyRef = inject(DestroyRef);
  protected readonly preferences = inject(PixelsPreferences);

  readonly today = todayIsoDate();
  readonly year = signal(yearOf(this.today));
  readonly day = signal<string | null>(null);
  readonly notice = signal<string | null>(null);
  readonly phone = signal(false);
  private readonly phase = signal<HubCardState>('loading');
  readonly snapshot = signal<PixelsSnapshot | null>(null);
  readonly facts = signal<PixelDayFacts | null>(null);
  readonly factsStatus = signal<DayFactsStatus>('idle');
  readonly annotationError = signal<string | null>(null);
  readonly draftEpoch = signal(0);
  readonly mutating = signal(false);

  private requestId = 0;
  private dayRequest = 0;
  private loadedYear: number | null = null;
  private correcting = false;
  private returnFrame = 0;
  private returnFocus: string | null = null;
  private returnView: ReturnType<ReturnContext['view']> = null;

  protected unlockSource(): string {
    return returnPath(this.router.url) ?? '/pixels';
  }

  readonly screen = computed(() => yearScreenState(this.snapshot(), this.phase(), this.today));
  readonly readySnapshot = computed(() => {
    const screen = this.screen();
    const snapshot = this.snapshot();
    if (!snapshot || (screen !== 'ready' && screen !== 'stale')) return null;
    return snapshot;
  });
  readonly notices = computed(() => {
    const snapshot = this.readySnapshot();
    return snapshot ? sourceNotices(snapshot.sources) : [];
  });
  readonly stats = computed(() => {
    const snapshot = this.readySnapshot();
    return snapshot ? yearStats(snapshot.days, snapshot.financeStatus) : null;
  });
  readonly selectedDay = computed(() => {
    const snapshot = this.snapshot();
    const date = this.day();
    if (!snapshot || !date) return null;
    return snapshot.days.find(item => item.date === date) ?? null;
  });

  constructor() {
    this.router.events.pipe(takeUntilDestroyed()).subscribe(event => {
      if (event instanceof NavigationStart) {
        cancelAnimationFrame(this.returnFrame);
        this.returnView = null;
        if (event.navigationTrigger === 'imperative') {
          const date = document.activeElement?.getAttribute('data-date') ?? this.day();
          this.context.saveView('/pixels', date);
        }
      }
      if (event instanceof Scroll) {
        this.returnView = this.context.view('/pixels');
        this.restoreView();
      }
    });
    this.destroyRef.onDestroy(() => {
      this.requestId += 1;
      this.dayRequest += 1;
      cancelAnimationFrame(this.returnFrame);
    });
    this.route.queryParamMap.pipe(takeUntilDestroyed()).subscribe(params => {
      this.onQuery(params.get('year'), params.get('day'));
    });
    this.data.financeCleared$.pipe(takeUntilDestroyed()).subscribe(() => {
      this.draftEpoch.update(value => value + 1);
      this.snapshot.update(current => current ? withoutFinance(current, this.today) : current);
      this.loadedYear = null;
      this.load(true);
      this.loadDayFacts(this.day());
    });
    this.data.userChanged$.pipe(takeUntilDestroyed()).subscribe(() => {
      this.draftEpoch.update(value => value + 1);
      this.snapshot.set(null);
      this.phase.set('loading');
      this.loadedYear = null;
      this.load(true);
      this.loadDayFacts(this.day());
    });
    this.bindPhone();
  }

  shiftYear(delta: number): void {
    const next = this.year() + delta;
    if (next < 1 || next > 9999) return;
    this.correcting = false;
    this.notice.set(null);
    this.returnFocus = null;
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { year: String(next), day: null },
    });
  }

  selectDay(date: string): void {
    if (date === this.day()) return;
    const replacing = this.day() !== null;
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { year: String(this.year()), day: date },
      replaceUrl: replacing,
      state: replacing ? this.context.sourceState('/pixels') : this.context.link('/pixels'),
    });
  }

  clearDay(): void {
    if (this.context.back('/pixels')) return;
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { year: String(this.year()), day: null },
      replaceUrl: true,
    });
  }

  reload(): void {
    this.load(true);
    this.loadDayFacts(this.day());
  }

  protected onArchive(conceptId: number): void {
    void this.mutate({ kind: 'archive', conceptId });
  }

  protected onRemove(conceptId: number): void {
    void this.mutate({ kind: 'delete', conceptId });
  }

  protected onRedate(change: { conceptId: number; understoodOn: string }): void {
    void this.mutate({ kind: 'redate', conceptId: change.conceptId, understoodOn: change.understoodOn });
  }

  private onQuery(yearRaw: string | null, dayRaw: string | null): void {
    const clamped = clampYearDay(yearRaw, dayRaw, this.today);
    if (clamped.notice) {
      this.notice.set(clamped.notice);
      this.correcting = true;
      this.applyYear(clamped.year, clamped.day);
      void this.router.navigate([], {
        relativeTo: this.route,
        queryParams: { year: String(clamped.year), day: clamped.day },
        replaceUrl: true,
      });
      return;
    }
    if (this.correcting) this.correcting = false;
    else this.notice.set(null);
    this.applyYear(clamped.year, clamped.day);
  }

  private applyYear(year: number, day: string | null): void {
    if (day === null && year === this.year()) this.returnFocus = this.day() ?? this.returnFocus;
    else this.returnFocus = null;
    if (year !== this.year()) {
      this.snapshot.set(null);
      this.phase.set('loading');
      this.loadedYear = null;
    }
    this.year.set(year);
    this.day.set(day);
    this.load();
    this.loadDayFacts(day);
    this.restoreView();
  }

  private async mutate(action: AnnotationChange): Promise<void> {
    const date = this.day();
    if (!date) return;
    this.annotationError.set(null);
    this.mutating.set(true);
    try {
      const result = await this.data.changeAnnotation(action);
      if (this.day() !== date) return;
      if (result.status === 'dropped') return;
      if (result.status === 'failed') {
        this.annotationError.set(result.message);
        return;
      }
      this.loadDayFacts(date, true);
    } finally {
      this.mutating.set(false);
    }
  }

  private loadDayFacts(date: string | null, preserve = false): void {
    const requestId = ++this.dayRequest;
    this.annotationError.set(null);
    if (!date) {
      this.facts.set(null);
      this.factsStatus.set('idle');
      return;
    }
    const current = this.facts();
    const keep = preserve && current?.date === date && this.factsStatus() === 'ready';
    if (!keep) {
      this.facts.set(null);
      this.factsStatus.set('loading');
    }
    void this.data.loadDay(date).then(result => {
      if (requestId !== this.dayRequest || this.day() !== date) return;
      if (result.status === 'ready') {
        this.facts.set(result.facts);
        this.factsStatus.set('ready');
        return;
      }
      if (result.status === 'dropped') return;
      this.facts.set(null);
      this.factsStatus.set(result.status);
    });
  }

  private load(force = false): void {
    const year = this.year();
    if (!force && this.loadedYear === year) return;
    this.loadedYear = year;
    const requestId = ++this.requestId;
    const key = yearKey(year);
    const current = this.snapshot();
    if (current?.from.startsWith(`${key}-`)) this.phase.set('stale');
    else {
      this.snapshot.set(null);
      this.phase.set('loading');
    }
    void this.data.load({
      from: `${key}-01-01`,
      to: `${key}-12-31`,
      profile: false,
      includeTrips: true,
      today: this.today,
    }).then(result => {
      if (requestId !== this.requestId) return;
      if (result.status === 'dropped') return;
      if (result.status === 'ready') {
        this.snapshot.set(result.snapshot);
        this.phase.set('ready');
        this.restoreView();
        return;
      }
      this.phase.set(result.status);
    });
  }

  private restoreView(): void {
    if (!this.readySnapshot() || (!this.returnView && !this.returnFocus)) return;
    cancelAnimationFrame(this.returnFrame);
    this.returnFrame = requestAnimationFrame(() => {
      const view = this.returnView;
      this.returnView = null;
      const focus = this.returnFocus ?? (!this.day() ? view?.focus : null);
      this.returnFocus = null;
      if (focus) {
        if (this.yearGrid) this.yearGrid.focusDate(focus, true);
        else this.host.nativeElement.querySelector<HTMLElement>(`[data-date="${focus}"]`)?.focus({ preventScroll: true });
      }
      if (view) window.scrollTo({ top: view.top, behavior: 'instant' });
    });
  }

  private bindPhone(): void {
    if (typeof matchMedia !== 'function') return;
    const query = matchMedia('(max-width: 640px)');
    this.phone.set(query.matches);
    const onChange = (event: MediaQueryListEvent) => this.phone.set(event.matches);
    query.addEventListener('change', onChange);
    this.destroyRef.onDestroy(() => query.removeEventListener('change', onChange));
  }
}
