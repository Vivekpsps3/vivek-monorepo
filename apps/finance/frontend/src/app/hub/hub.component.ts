import { ChangeDetectionStrategy, ChangeDetectorRef, Component, DestroyRef, OnInit, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { combineLatest, take } from 'rxjs';
import { AuthService } from '../auth/auth.service';
import { VaultService } from '../crypto/vault.service';
import { Asset, Holding, Liability, NetWorth } from '../models/transaction.model';
import { FinanceService } from '../services/finance.service';
import { ThemeService } from '../services/theme.service';
import {
  PortfolioAccount,
  PositionHighlight,
  financeSnapshot,
  hasManualCashAndBrokerage,
  largestPositions,
  journalKindLabel,
  mediaReleaseLabel,
  portfolioAccounts,
  priceFreshnessSummary,
} from './hub-summary';
import { todayIsoDate } from '@vivek/browser';
import { MoneyPipe } from '../shared/pipes/money.pipe';
import { AppDatePipe } from '../shared/pipes/app-date.pipe';

type LoadState = 'loading' | 'ready' | 'unavailable';

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

@Component({
  selector: 'app-hub',
  standalone: true,
  imports: [
    AppDatePipe,
    MoneyPipe, RouterLink],
  templateUrl: './hub.component.html',
  styleUrl: './hub.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HubComponent implements OnInit {
  private readonly auth = inject(AuthService);
  private readonly vault = inject(VaultService);
  private readonly finance = inject(FinanceService);
  private readonly themeService = inject(ThemeService);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly destroyRef = inject(DestroyRef);

  name = 'Your library of days';
  admin = false;
  readonly today = new Date();
  choice = this.themeService.current;
  vaultLocked = !this.vault.isUnlocked;
  financeState: 'locked' | 'loading' | 'ready' | 'error' = this.vaultLocked ? 'locked' : 'loading';
  netWorth: NetWorth | null = null;
  accounts: PortfolioAccount[] = [];
  positions: PositionHighlight[] = [];
  freshness = '';
  cashOverlap = false;

  private financeRequestStarted = false;
  travelState: LoadState = 'loading';
  trip: TravelTrip | null = null;
  mediaState: LoadState = 'loading';
  media: MediaSummary | null = null;

  ngOnInit(): void {
    this.auth.user$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(user => {
      this.name = user?.display_name || user?.username || 'Your library of days';
      this.admin = user?.role === 'admin';
      this.cdr.markForCheck();
    });
    this.themeService.choice$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(choice => {
      this.choice = choice;
      this.cdr.markForCheck();
    });
    this.vault.unlocked$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
      this.vaultLocked = !this.vault.isUnlocked;
      if (this.vaultLocked) {
        this.financeState = 'locked';
        this.financeRequestStarted = false;
        this.netWorth = null;
        this.cdr.markForCheck();
        return;
      }
      this.loadFinance();
    });
    void this.loadTravel();
    void this.loadMedia();
  }

  setTheme(choice: 'system' | 'light' | 'dark'): void {
    this.themeService.set(choice);
  }

  signOut(): void {
    this.auth.logout();
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

  private loadFinance(): void {
    if (this.financeRequestStarted) return;
    this.financeRequestStarted = true;
    this.financeState = 'loading';
    this.finance.loadDashboard().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: () => {
        combineLatest([this.finance.assets$, this.finance.liabilities$, this.finance.holdings$])
          .pipe(take(1))
          .subscribe(([assets, liabilities, holdings]) => this.publishFinance(assets, liabilities, holdings));
      },
      error: () => {
        this.financeState = 'error';
        this.financeRequestStarted = false;
        this.cdr.markForCheck();
      },
    });
  }

  private publishFinance(assets: Asset[], liabilities: Liability[], holdings: Holding[]): void {
    if (!this.vault.isUnlocked) return;
    this.netWorth = financeSnapshot(assets, liabilities, holdings);
    this.accounts = portfolioAccounts(holdings);
    this.positions = largestPositions(holdings);
    this.freshness = priceFreshnessSummary(holdings);
    this.cashOverlap = hasManualCashAndBrokerage(assets, holdings);
    this.financeState = 'ready';
    this.cdr.markForCheck();
  }

  private async loadTravel(): Promise<void> {
    try {
      const response = await fetch('/travel/api/summary', { credentials: 'same-origin', headers: { accept: 'application/json' } });
      if (!response.ok) throw new Error(String(response.status));
      const body = await response.json() as { next_trip?: TravelTrip | null };
      this.trip = body.next_trip ?? null;
      this.travelState = 'ready';
    } catch {
      this.travelState = 'unavailable';
      this.trip = null;
    }
    this.cdr.markForCheck();
  }

  retryMedia(): void {
    this.mediaState = 'loading';
    this.cdr.markForCheck();
    void this.loadMedia();
  }

  kindLabel(kind: string): string {
    return journalKindLabel(kind);
  }

  private async loadMedia(): Promise<void> {
    try {
      const response = await fetch('/media/api/summary', { credentials: 'same-origin', headers: { accept: 'application/json' } });
      if (!response.ok) throw new Error(String(response.status));
      const body = await response.json() as MediaSummary;
      this.media = {
        currently: body.currently ?? [],
        recent_reviews: body.recent_reviews ?? [],
        upcoming: body.upcoming ?? [],
        next_episodes: body.next_episodes ?? [],
      };
      this.mediaState = 'ready';
    } catch {
      this.mediaState = 'unavailable';
      this.media = null;
    }
    this.cdr.markForCheck();
  }
}
