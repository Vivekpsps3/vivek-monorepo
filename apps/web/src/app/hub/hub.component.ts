import type { PortfolioAccount, PositionHighlight } from '../../../../finance/frontend/src/public-api';
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, DestroyRef, Injector, OnInit, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { UiStateComponent } from '@vivek/ui';
import { todayIsoDate } from '@vivek/browser';
import { SessionService as AuthService } from '../platform/session.service';
import { DEK_STORE, financeVaultPresent, lockFinance } from '../../../../finance/frontend/src/public-api';
import { NetWorth } from '../../../../finance/frontend/src/public-api';
import { AppDatePipe } from '@vivek/ui';
import { MoneyPipe } from '@vivek/ui';
import {
  MEDIA_SUMMARY_URL,
  TRAVEL_SUMMARY_URL,
  fetchHubSummary,
  settleHubCard,
  type HubCardState,
} from './hub-load';
import {
  journalKindLabel,
  mediaReleaseLabel,
} from './hub-summary';
interface TravelTrip {
  id: number;
  title: string;
  destination?: string | null;
  origin_label?: string | null;
  start_date: string;
  end_date: string;
  phase: string;
  days_until: number;
  next_action: string;
  href?: string;
}

interface MediaItem {
  id: number;
  kind: string;
  title: string;
  creator?: string | null;
  status?: string;
  progress_label?: string | null;
  rating?: number | null;
  review_excerpt?: string | null;
  release_on?: string | null;
  precision?: string | null;
  when?: string | null;
}

interface MediaSummary {
  currently: MediaItem[];
  recent_reviews: MediaItem[];
  upcoming: MediaItem[];
  next_episodes: Array<{ entry_id?: number; show_title: string; season: number; episode: number; title?: string | null; state?: string }>;
}

interface FinanceView {
  status: 'locked' | 'ready' | 'unavailable' | 'expired' | 'cancelled';
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
    AppDatePipe,
    MoneyPipe,
    RouterLink,
    UiStateComponent,
  ],
  templateUrl: './hub.component.html',
  styleUrl: './hub.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HubComponent implements OnInit {
  private readonly auth = inject(AuthService);
  private readonly injector = inject(Injector);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly destroyRef = inject(DestroyRef);

  name = 'Your library of days';
  readonly today = new Date();

  financeState: HubCardState = 'locked';
  netWorth: NetWorth | null = null;
  financeUpdatedAt: number | null = null;
  accounts: PortfolioAccount[] = [];
  positions: PositionHighlight[] = [];
  freshness = '';
  cashOverlap = false;
  financePending = false;

  travelState: HubCardState = 'loading';
  trip: TravelTrip | null = null;
  travelPending = false;
  travelUpdatedAt: number | null = null;
  mediaState: HubCardState = 'loading';
  media: MediaSummary | null = null;
  mediaPending = false;
  mediaUpdatedAt: number | null = null;

  private generation = 0;
  private financeGeneration = 0;
  private userId: number | null | undefined = undefined;
  private travelCtrl: AbortController | null = null;
  private mediaCtrl: AbortController | null = null;
  private financeCtrl: AbortController | null = null;

  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  ngOnInit(): void {
    this.watchVaultLock();
    this.route.queryParamMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(params => {
      if (params.get('settings') === 'account') {
        void this.router.navigateByUrl('/settings/account', { replaceUrl: true });
      }
    });
    this.destroyRef.onDestroy(() => this.cancelSummaries());
    this.auth.user$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(user => {
      this.name = user?.display_name || user?.username || 'Your library of days';
      const nextId = user?.id ?? null;
      if (this.userId !== undefined && this.userId !== nextId) {
        this.cancelSummaries();
        this.clearCards();
        if (user) {
          void this.loadTravel();
          void this.loadMedia();
          void this.loadFinance();
        } else {
          this.travelState = 'empty';
          this.mediaState = 'empty';
          this.financeState = 'locked';
        }
      }
      this.userId = nextId;
      this.cdr.markForCheck();
    });
    void this.loadTravel();
    void this.loadMedia();
    void this.loadFinance();
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

  get headingToday(): string {
    return todayIsoDate();
  }

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
    this.financeCtrl?.abort();
  }

  private clearCards(): void {
    this.trip = null;
    this.media = null;
    this.travelPending = false;
    this.mediaPending = false;
    this.financePending = false;
    this.clearFinanceNumbers();
    this.travelState = 'loading';
    this.mediaState = 'loading';
    this.financeState = 'loading';
  }

  private clearFinanceNumbers(): void {
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
    if (!this.trip) this.travelState = 'loading';
    this.cdr.markForCheck();
    try {
      const result = await fetchHubSummary<{ next_trip?: TravelTrip | null }>(TRAVEL_SUMMARY_URL, ctrl.signal);
      if (generation !== this.generation || ctrl.signal.aborted) return;
      const settled = settleHubCard(
        this.trip,
        result.status === 'ok' ? { status: 'ok', body: result.body.next_trip ?? null } : result,
        trip => trip == null,
      );
      if (!settled) return;
      if (settled.state === 'ready' || settled.state === 'empty') this.travelUpdatedAt = Date.now();
      this.travelState = settled.state;
      this.trip = settled.data;
    } finally {
      if (this.travelCtrl === ctrl) this.travelPending = false;
      this.cdr.markForCheck();
    }
  }

  private async loadMedia(): Promise<void> {
    const generation = this.generation;
    this.mediaCtrl?.abort();
    const ctrl = new AbortController();
    this.mediaCtrl = ctrl;
    if (!this.media) this.mediaState = 'loading';
    this.cdr.markForCheck();
    try {
      const result = await fetchHubSummary<MediaSummary>(MEDIA_SUMMARY_URL, ctrl.signal);
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

  private watchVaultLock(): void {
    const onStorage = (event: StorageEvent) => {
      if (event.key === DEK_STORE && event.newValue === null) this.applyExternalLock();
    };
    window.addEventListener('storage', onStorage);
    let channel: BroadcastChannel | null = null;
    if (typeof BroadcastChannel !== 'undefined') {
      channel = new BroadcastChannel('finance-vault-sync-v1');
      channel.onmessage = (event: MessageEvent<unknown>) => {
        if (this.isRemoteLock(event.data)) this.applyExternalLock();
      };
    }
    this.destroyRef.onDestroy(() => {
      window.removeEventListener('storage', onStorage);
      channel?.close();
    });
  }

  private isRemoteLock(value: unknown): boolean {
    const userId = this.auth.currentUser?.id;
    if (userId == null || !value || typeof value !== 'object') return false;
    const message = value as { version?: unknown; userId?: unknown; kind?: unknown };
    return message.version === 1 && message.userId === userId && message.kind === 'lock';
  }

  private applyExternalLock(): void {
    // lockFinance broadcasts, and this tab's channel hears that echo. The card is already clear.
    if (this.financeGeneration > 0 && this.financeState === 'locked') return;
    this.financeGeneration += 1;
    this.financeCtrl?.abort();
    this.clearFinanceNumbers();
    this.financePending = false;
    this.financeState = 'locked';
    this.cdr.markForCheck();
    void lockFinance(this.injector);
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
      const counts = result.snapshot.counts;
      if (counts != null && counts.accounts + counts.holdings + counts.debts === 0) {
        this.clearFinanceNumbers();
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
    if (this.netWorth) {
      this.financeState = 'stale';
      return;
    }
    this.clearFinanceNumbers();
    this.financeState = 'unavailable';
  }
}

function mediaIsEmpty(media: MediaSummary): boolean {
  return !media.currently.length && !media.upcoming.length && !media.recent_reviews.length && !media.next_episodes.length;
}
