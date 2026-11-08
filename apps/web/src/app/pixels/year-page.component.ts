import { ChangeDetectionStrategy, Component, DestroyRef, ViewChild, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { todayIsoDate } from '@vivek/browser';
import { UiStateComponent, type HubCardState } from '@vivek/ui';
import { DayDetailComponent } from './day-detail.component';
import { PixelsLegendComponent } from './pixels-legend.component';
import { PixelsDataService } from './pixels-data.service';
import { clampYearDay, yearOf } from './pixels-dates';
import { sourceNotices, withoutFinance, yearScreenState, yearStats } from './pixels-model';
import { PixelsPreferences } from './pixels-preferences';
import type { PixelsSnapshot } from './pixels.types';
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
  private readonly destroyRef = inject(DestroyRef);
  protected readonly preferences = inject(PixelsPreferences);

  readonly today = todayIsoDate();
  readonly year = signal(yearOf(this.today));
  readonly day = signal<string | null>(null);
  readonly notice = signal<string | null>(null);
  readonly phone = signal(false);
  private readonly phase = signal<HubCardState>('loading');
  readonly snapshot = signal<PixelsSnapshot | null>(null);

  private requestId = 0;
  private loadedYear: number | null = null;
  private correcting = false;

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
    this.route.queryParamMap.pipe(takeUntilDestroyed()).subscribe(params => {
      this.onQuery(params.get('year'), params.get('day'));
    });
    this.data.financeCleared$.pipe(takeUntilDestroyed()).subscribe(() => {
      this.snapshot.update(current => current ? withoutFinance(current, this.today) : current);
      this.loadedYear = null;
      this.load(true);
    });
    this.data.userChanged$.pipe(takeUntilDestroyed()).subscribe(() => {
      this.snapshot.set(null);
      this.phase.set('loading');
      this.loadedYear = null;
      this.load(true);
    });
    this.bindPhone();
  }

  shiftYear(delta: number): void {
    const next = this.year() + delta;
    if (next < 1 || next > 9999) return;
    this.correcting = false;
    this.notice.set(null);
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { year: String(next), day: null },
    });
  }

  selectDay(date: string): void {
    this.day.set(date);
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { year: String(this.year()), day: date },
    });
  }

  clearDay(): void {
    const date = this.day();
    this.day.set(null);
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { year: String(this.year()), day: null },
    });
    if (date) this.yearGrid?.focusDate(date);
  }

  reload(): void {
    this.load(true);
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
    if (year !== this.year()) {
      this.snapshot.set(null);
      this.phase.set('loading');
      this.loadedYear = null;
    }
    this.year.set(year);
    this.day.set(day);
    this.load();
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
        return;
      }
      this.phase.set(result.status);
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
