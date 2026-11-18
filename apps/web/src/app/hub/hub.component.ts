import type { PortfolioAccount, PositionHighlight } from '../../../../finance/frontend/src/public-api';
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, DestroyRef, ElementRef, Injector, OnInit, ViewChild, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, NavigationEnd, Router, RouterLink } from '@angular/router';
import { UiStateComponent } from '@vivek/ui';
import { formatDateRange, todayIsoDate } from '@vivek/browser';
import { SessionService as AuthService } from '../platform/session.service';
import { bindLockNotices, financeVaultPresent, lockFinance } from '../../../../finance/frontend/src/public-api';
import { NetWorth } from '../../../../finance/frontend/src/public-api';
import { MoneyPipe, UiPageHeaderComponent, UiButtonComponent } from '@vivek/ui';
import {
  decodeTownSummary,
  decodeTravelSummary,
  type MediaItem,
  type MediaSummary,
  type MediaHubSummary,
  type TravelSummary,
  type TravelTrip,
} from './hub-decode';
import {
  fetchHubMedia,
  travelSummaryUrl,
  fetchHubSummary,
  settleHubCard,
  townSummaryUrl,
  type HubCardState,
} from './hub-load';
import { townIsEmpty, townStreakText, type TownSummary } from './town-hub-card';
import {
  adjacentHubStripDate,
  hubStripLabel,
  hubStripRows,
  hubStripSummary,
  hubStripTabDate,
  hubStripWindow,
  isHubStripKey,
  type HubStripCell,
} from './pixels-hub-card';
import { PixelsDataService } from '../pixels/pixels-data.service';
import { withoutFinance, yearStats } from '../pixels/pixels-model';
import {
  journalKindLabel,
  mediaReleaseLabel,
} from './hub-summary';
import { HubDestinationsComponent } from './hub-destinations.component';
import { QuickAddComponent } from './quick-add.component';
import { UpNextComponent } from './up-next/up-next.component';
import { hubGreeting, shiftDay, upNextRows, type AgendaSource } from './up-next/up-next';
import { NextEpisodeButtonComponent, NextEpisodeUndoService, type NextResult } from '../../../../media/frontend/src/public-api';

interface FinanceView {
  status: 'locked' | 'ready' | 'unavailable' | 'expired' | 'cancelled';
  billsDueThisWeek?: number;
  snapshot?: {
    netWorth: NetWorth;
    accounts: PortfolioAccount[];
    positions: PositionHighlight[];
    freshness: string;
    cashOverlap: boolean;
    counts?: { accounts: number; holdings: number; debts: number };
  };
}

@Component({
  selector: 'app-hub',
  standalone: true,
  imports: [
    MoneyPipe,
    UiButtonComponent,
    UpNextComponent,
    QuickAddComponent,
    HubDestinationsComponent,
    NextEpisodeButtonComponent,
    RouterLink,
    UiPageHeaderComponent,
    UiStateComponent,
  ],
  templateUrl: './hub.component.html',
  styleUrls: ['./hub.component.css', '../pixels/pixels.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HubComponent implements OnInit {
  @ViewChild(QuickAddComponent) private quickAdd?: QuickAddComponent;
  onWorkspaceShortcut(event: KeyboardEvent): void { this.quickAdd?.onWorkspaceShortcut(event); }

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly auth = inject(AuthService);
  private readonly injector = inject(Injector);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly destroyRef = inject(DestroyRef);
  private readonly episodeUndo = inject(NextEpisodeUndoService);
  private readonly pixelsData = inject(PixelsDataService);

  name = '';
  billsDueThisWeek: number | null = null;
  readonly today = new Date();
  expanded = false;
  windowStart = todayIsoDate();
  windowEnd = shiftDay(this.windowStart, 13);
  agendaSources: readonly AgendaSource[] = ['travel', 'media'];
  private viewInitialized = false;

  changeAgendaWindow(start: string): void {
    void this.router.navigate(['/hub/agenda'], { queryParams: { date: start, sources: this.agendaSources.join(',') } });
  }

  changeAgendaSources(sources: readonly AgendaSource[]): void {
    this.agendaSources = sources;
    if (this.expanded) void this.router.navigate(['/hub/agenda'], { queryParams: { sources: sources.join(',') }, queryParamsHandling: 'merge' });
  }

  private syncAgenda(): void {
    const expanded = this.router.url.split('?')[0] === '/hub/agenda';
    const params = this.route.snapshot?.queryParamMap;
    const date = params?.get('date');
    const valid = date && Number(date.slice(0, 4)) >= 1000 && Number(date.slice(0, 4)) <= 3000 && /^\d{4}-\d{2}-\d{2}$/.test(date) && !Number.isNaN(Date.parse(date))
      && new Date(date + 'T12:00:00Z').toISOString().slice(0, 10) === date;
    const start = expanded ? `${(valid ? date : todayIsoDate()).slice(0, 7)}-01` : todayIsoDate();
    const nextMonth = new Date(start + 'T12:00:00');
    nextMonth.setMonth(nextMonth.getMonth() + 1);
    const end = expanded ? shiftDay(`${nextMonth.getFullYear()}-${String(nextMonth.getMonth() + 1).padStart(2, '0')}-01`, -1) : shiftDay(start, 13);
    const changed = start !== this.windowStart || end !== this.windowEnd;
    this.expanded = expanded;
    this.windowStart = start;
    this.windowEnd = end;
    const selected = params?.get('sources');
    this.agendaSources = selected == null ? ['travel', 'media'] : (['travel', 'media'] as const).filter(source => selected.split(',').includes(source));
    if (changed && this.viewInitialized) {
      this.travelCtrl?.abort();
      this.travel = null;
      void this.loadTravel();
      void this.loadMedia(true);
    }
    this.cdr.markForCheck();
  }

  financeState: HubCardState = 'locked';
  netWorth: NetWorth | null = null;
  financeUpdatedAt: number | null = null;
  accounts: PortfolioAccount[] = [];
  positions: PositionHighlight[] = [];
  freshness = '';
  cashOverlap = false;
  financePending = false;

  travelState: HubCardState = 'loading';
  travel: TravelSummary | null = null;
  get trip(): TravelTrip | null { return this.travel?.next_trip ?? null; }
  travelPending = false;
  travelUpdatedAt: number | null = null;
  mediaState: HubCardState = 'loading';
  media: MediaHubSummary | null = null;
  mediaPending = false;
  mediaUpdatedAt: number | null = null;
  townState: HubCardState = 'loading';
  town: TownSummary | null = null;
  townPending = false;
  townUpdatedAt: number | null = null;
  pixelsState: HubCardState = 'loading';
  pixels: Parameters<typeof withoutFinance>[0] | null = null;
  pixelsPending = false;
  pixelsUpdatedAt: number | null = null;

  /** The one strip cell in the tab order. Arrows move it; Enter and click open that date. */
  private stripRoving: string | null = null;
  private generation = 0;
  private pixelsLoad = 0;
  private pixelsClearGeneration = 0;
  private financeGeneration = 0;
  userId: number | null | undefined = undefined;
  private travelCtrl: AbortController | null = null;
  private mediaCtrl: AbortController | null = null;
  private townCtrl: AbortController | null = null;
  private financeCtrl: AbortController | null = null;

  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  constructor() {
    this.destroyRef.onDestroy(bindLockNotices(notice => this.applyExternalLock(notice.tabId)));
  }

  ngOnInit(): void {
    this.syncAgenda();
    this.router.events.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(event => {
      if (event instanceof NavigationEnd) this.syncAgenda();
    });
    this.episodeUndo.restored$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => this.onMediaNextReload());
    this.pixelsData.financeCleared$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => this.onPixelsFinanceCleared());
    this.route.queryParamMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(params => {
      if (params.get('settings') === 'account') {
        void this.router.navigateByUrl('/settings/account', { replaceUrl: true });
      }
    });
    this.destroyRef.onDestroy(() => this.cancelSummaries());
    this.auth.user$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(user => {
      this.name = hubGreeting(user?.display_name?.trim() || user?.username || '', this.today.getHours());
      const nextId = user?.id ?? null;
      if (this.userId !== undefined && this.userId !== nextId) {
        this.cancelSummaries();
        this.clearCards();
        this.userId = nextId;
        if (user) {
          void this.loadTravel();
          void this.loadMedia();
          void this.loadTown();
          void this.loadFinance();
          void this.loadPixels();
        } else {
          this.travelState = 'empty';
          this.mediaState = 'empty';
          this.townState = 'empty';
          this.financeState = 'locked';
          this.pixelsState = 'empty';
        }
      }
      this.userId = nextId;
      this.cdr.markForCheck();
    });
    void this.loadTravel();
    void this.loadMedia();
    void this.loadTown();
    void this.loadFinance();
    void this.loadPixels();
    this.viewInitialized = true;
  }

  fidelityAccounts(): PortfolioAccount[] {
    return this.accounts.filter(account => account.fidelity);
  }

  otherAccounts(): PortfolioAccount[] {
    return this.accounts.filter(account => !account.fidelity);
  }

  tripWhen(trip: TravelTrip): string {
    if (trip.phase === 'in_progress') return 'Underway';
    if (trip.days_until <= 0) return 'Leaves today';
    if (trip.days_until === 1) return 'Tomorrow';
    return `In ${trip.days_until} days`;
  }

  tripPlace(trip: TravelTrip): string {
    return trip.destination || trip.title;
  }

  readonly formatRange = formatDateRange;

  formatDay(iso: string | null | undefined): string {
    if (!iso) return 'No date';
    const [year, month, day] = iso.split('-').map(Number);
    if (!year || !month || !day) return iso;
    return new Date(year, month - 1, day).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  }

  mediaWhen(item: MediaItem): string {
    return mediaReleaseLabel(item) ?? (item.release_on ? this.formatDay(item.release_on) : 'Upcoming');
  }

  retryTravel(): void {
    if (this.travelPending) return;
    this.travelPending = true;
    void this.loadTravel();
  }

  retryMedia(): void {
    if (this.mediaPending) return;
    this.mediaPending = true;
    void this.loadMedia();
  }

  get nextEpisode(): MediaSummary['next_episodes'][number] | undefined {
    return this.media?.next_episodes.find(row => row.state === 'next') ?? this.media?.next_episodes[0];
  }

  onMediaNextDone(result: NextResult, item: MediaSummary['next_episodes'][number]): void {
    const media = this.media;
    if (!media) return;
    const next = result.next;
    const next_episodes = next
      ? media.next_episodes.map(row =>
          row.entry_id === item.entry_id
            ? {
                ...row,
                episode_id: next.id,
                season: next.season_number,
                episode: next.episode_number,
                title: next.title,
                air_date: next.air_date,
                state: next.released ? 'next' : 'upcoming',
              }
            : row,
        )
      : media.next_episodes.filter(row => row.entry_id !== item.entry_id);
    this.media = { ...media, next_episodes };
    this.onMediaNextReload();
    this.cdr.markForCheck();
    const generation = this.generation;
    requestAnimationFrame(() => {
      if (generation !== this.generation || this.expanded) return;
      const rowLink = this.host.nativeElement.querySelector<HTMLElement>(
        `.next-episode-row a[href="/media/item/${item.entry_id}"]`,
      );
      const heading = this.host.nativeElement.querySelector<HTMLElement>('.media-open');
      (rowLink ?? heading)?.focus();
    });
  }

  onMediaNextReload(): void {
    this.mediaPending = true;
    void this.loadMedia();
  }

  retryTown(): void {
    if (this.townPending) return;
    this.townPending = true;
    void this.loadTown();
  }

  retryPixels(): void {
    if (this.pixelsPending) return;
    this.pixelsPending = true;
    void this.loadPixels();
  }

  pixelRows(): HubStripCell[][] {
    return this.pixels ? hubStripRows(this.pixels.days) : [];
  }

  pixelsSummary(): { activeLine: string; runLine: string } | null {
    if (!this.pixels) return null;
    return hubStripSummary(yearStats(this.pixels.days, this.pixels.financeStatus));
  }

  stripLabel(cell: HubStripCell): string {
    return hubStripLabel(cell);
  }

  stripTabDate(): string {
    return hubStripTabDate(this.stripRoving, this.stripDates(), todayIsoDate());
  }

  onStripKey(event: KeyboardEvent): void {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    const date = target.getAttribute('data-date');
    if (!date) return;
    if (event.key === 'Enter' || event.key === ' ') {
      const cell = this.pixelRows().flat().find(item => item.date === date);
      if (!cell) return;
      event.preventDefault();
      this.openPixelDay(cell);
      return;
    }
    if (!isHubStripKey(event.key)) return;
    event.preventDefault();
    const next = adjacentHubStripDate(date, event.key, this.stripDates());
    if (!next || next === date) return;
    this.stripRoving = next;
    this.cdr.markForCheck();
    const node = this.host.nativeElement.querySelector(`[data-date="${next}"]`);
    if (node instanceof HTMLElement) node.focus();
  }

  /** Past, today, and future cells open that date. Pointer and keyboard share this path. */
  openPixelDay(cell: HubStripCell): void {
    this.stripRoving = cell.date;
    void this.router.navigate(['/pixels'], {
      queryParams: { year: cell.date.slice(0, 4), day: cell.date },
    });
  }

  private stripDates(): readonly string[] {
    return this.pixelRows().flatMap(row => row.map(cell => cell.date)).sort();
  }

  townStreak(summary: TownSummary): string | null {
    return townStreakText(summary);
  }

  retryFinance(): void {
    if (this.financePending) return;
    this.financePending = true;
    void this.loadFinance();
  }

  kindLabel(kind: string): string {
    return journalKindLabel(kind);
  }

  private cancelSummaries(): void {
    this.generation += 1;
    this.travelCtrl?.abort();
    this.mediaCtrl?.abort();
    this.townCtrl?.abort();
    this.financeCtrl?.abort();
  }

  private clearCards(): void {
    this.travel = null;
    this.media = null;
    this.town = null;
    this.pixels = null;
    this.travelPending = false;
    this.mediaPending = false;
    this.townPending = false;
    this.pixelsPending = false;
    this.financePending = false;
    this.travelUpdatedAt = null;
    this.mediaUpdatedAt = null;
    this.financeUpdatedAt = null;
    this.townUpdatedAt = null;
    this.pixelsUpdatedAt = null;
    this.stripRoving = null;
    this.clearFinanceNumbers();
    this.travelState = 'loading';
    this.mediaState = 'loading';
    this.townState = 'loading';
    this.pixelsState = 'loading';
    this.financeState = 'loading';
  }

  private clearFinanceNumbers(): void {
    this.billsDueThisWeek = null;
    this.netWorth = null;
    this.accounts = [];
    this.positions = [];
    this.freshness = '';
    this.cashOverlap = false;
  }

  private async loadTravel(): Promise<void> {
    const generation = this.generation;
    this.travelCtrl?.abort();
    const ctrl = new AbortController();
    this.travelCtrl = ctrl;
    if (!this.travel) this.travelState = 'loading';
    this.cdr.markForCheck();
    try {
      const result = await fetchHubSummary(travelSummaryUrl(this.expanded ? this.windowStart : undefined, this.expanded ? this.windowEnd : undefined), ctrl.signal, decodeTravelSummary);
      if (generation !== this.generation || ctrl.signal.aborted) return;
      const settled = settleHubCard(
        this.travel,
        result,
        travel => travel.next_trip == null && travel.up_next.length === 0,
      );
      if (!settled) return;
      if (settled.state === 'ready' || settled.state === 'empty') this.travelUpdatedAt = Date.now();
      this.travelState = settled.state;
      this.travel = settled.data;
    } finally {
      if (this.travelCtrl === ctrl) this.travelPending = false;
      this.cdr.markForCheck();
    }
  }

  private async loadMedia(navigation = false): Promise<void> {
    const generation = this.generation;
    this.mediaCtrl?.abort();
    const ctrl = new AbortController();
    this.mediaCtrl = ctrl;
    if (!this.media) this.mediaState = 'loading';
    this.cdr.markForCheck();
    try {
      const previous = navigation && (this.mediaState === 'ready' || this.mediaState === 'empty') ? this.media ?? undefined : undefined;
      if (navigation) { this.media = null; this.mediaState = 'loading'; }
      const result = await fetchHubMedia(this.windowStart, ctrl.signal, undefined, this.windowEnd, previous);
      if (generation !== this.generation || ctrl.signal.aborted) return;
      const settled = settleHubCard(this.media, result, mediaIsEmpty);
      if (!settled) return;
      if (settled.state === 'ready' || settled.state === 'empty') this.mediaUpdatedAt = Date.now();
      this.mediaState = settled.state;
      this.media = settled.data;
    } finally {
      if (this.mediaCtrl === ctrl) this.mediaPending = false;
      this.cdr.markForCheck();
    }
  }

  private async loadTown(): Promise<void> {
    const generation = this.generation;
    this.townCtrl?.abort();
    const ctrl = new AbortController();
    this.townCtrl = ctrl;
    if (!this.town) this.townState = 'loading';
    this.cdr.markForCheck();
    try {
      const result = await fetchHubSummary(townSummaryUrl(), ctrl.signal, decodeTownSummary);
      if (generation !== this.generation || ctrl.signal.aborted) return;
      const settled = settleHubCard(this.town, result, townIsEmpty);
      if (!settled) return;
      if (settled.state === 'ready' || settled.state === 'empty') this.townUpdatedAt = Date.now();
      this.townState = settled.state;
      this.town = settled.data;
    } finally {
      if (this.townCtrl === ctrl) this.townPending = false;
      this.cdr.markForCheck();
    }
  }

  private onPixelsFinanceCleared(): void {
    this.pixelsClearGeneration += 1;
    if (!this.pixels) return;
    this.pixels = withoutFinance(this.pixels, todayIsoDate());
    this.cdr.markForCheck();
  }

  private async loadPixels(): Promise<void> {
    const generation = this.generation;
    const load = ++this.pixelsLoad;
    const clearGeneration = this.pixelsClearGeneration;
    if (!this.pixels) this.pixelsState = 'loading';
    this.cdr.markForCheck();
    const current = () => generation === this.generation && load === this.pixelsLoad;
    try {
      const today = todayIsoDate();
      const range = hubStripWindow(today);
      const result = await this.pixelsData.load({
        from: range.start,
        to: range.end,
        profile: false,
        includeTrips: false,
        today,
      });
      if (!current()) return;
      if (result.status === 'dropped') return;
      if (result.status === 'expired') {
        this.pixels = null;
        this.pixelsState = 'expired';
        return;
      }
      if (result.status === 'unavailable') {
        if (this.pixels && yearStats(this.pixels.days, this.pixels.financeStatus).active > 0) {
          this.pixelsState = 'stale';
          return;
        }
        this.pixels = null;
        this.pixelsState = 'unavailable';
        return;
      }
      const snapshot = clearGeneration === this.pixelsClearGeneration ? result.snapshot : withoutFinance(result.snapshot, today);
      this.pixels = snapshot;
      this.pixelsUpdatedAt = Date.now();
      this.pixelsState = 'ready';
    } finally {
      if (load === this.pixelsLoad) this.pixelsPending = false;
      this.cdr.markForCheck();
    }
  }

  private applyExternalLock(originTabId?: string): void {
    // A second notice after the card is locked must not lock again.
    if (this.financeGeneration > 0 && this.financeState === 'locked') return;
    this.financeGeneration += 1;
    this.financeCtrl?.abort();
    this.clearFinanceNumbers();
    this.financePending = false;
    this.financeState = 'locked';
    this.cdr.detectChanges();
    void lockFinance(this.injector, originTabId);
  }

  private async loadFinance(): Promise<void> {
    const generation = this.generation;
    const financeGeneration = this.financeGeneration;
    this.financeCtrl?.abort();
    const ctrl = new AbortController();
    this.financeCtrl = ctrl;
    const dropped = () => generation !== this.generation || financeGeneration !== this.financeGeneration || ctrl.signal.aborted;
    try {
      if (!financeVaultPresent()) {
        if (dropped()) return;
        this.clearFinanceNumbers();
        this.financeState = 'locked';
        return;
      }
      if (!this.netWorth) this.financeState = 'loading';
      this.cdr.markForCheck();
      const { loadFinanceHubSnapshot } = await import('../../../../finance/frontend/src/public-api');
      if (dropped()) return;
      const result = await loadFinanceHubSnapshot(this.injector, ctrl.signal);
      if (dropped()) return;
      this.applyFinance(result);
    } catch {
      if (dropped()) return;
      this.applyFinance({ status: 'unavailable' });
    } finally {
      if (this.financeCtrl === ctrl) this.financePending = false;
      this.cdr.markForCheck();
    }
  }

  private applyFinance(result: FinanceView): void {
    if (result.status === 'cancelled') return;
    if (result.status === 'ready' && result.snapshot) {
      const billCount = result.billsDueThisWeek;
      this.billsDueThisWeek = typeof billCount === 'number' && Number.isSafeInteger(billCount) && billCount >= 0 ? billCount : null;
      const counts = result.snapshot.counts;
      if (counts != null && counts.accounts + counts.holdings + counts.debts === 0) {
        const count = this.billsDueThisWeek;
        this.clearFinanceNumbers();
        this.billsDueThisWeek = count;
        this.financeUpdatedAt = Date.now();
        this.financeState = 'empty';
        return;
      }
      this.netWorth = result.snapshot.netWorth;
      this.accounts = result.snapshot.accounts;
      this.positions = result.snapshot.positions;
      this.freshness = result.snapshot.freshness;
      this.cashOverlap = result.snapshot.cashOverlap;
      this.financeUpdatedAt = Date.now();
      this.financeState = 'ready';
      return;
    }
    if (result.status === 'locked') {
      this.clearFinanceNumbers();
      this.financeState = 'locked';
      return;
    }
    if (result.status === 'expired') {
      this.clearFinanceNumbers();
      this.financeState = 'expired';
      return;
    }
    if (this.netWorth || this.billsDueThisWeek !== null) {
      this.financeState = 'stale';
      return;
    }
    this.clearFinanceNumbers();
    this.financeState = 'unavailable';
  }
}

function mediaIsEmpty(media: MediaHubSummary): boolean {
  return !media.currently.length && !media.upcoming.length && !media.recent_reviews.length
    && !media.next_episodes.length && upNextRows([], media.calendars, todayIsoDate()).length === 0;
}
