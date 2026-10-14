import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnDestroy, OnInit, inject } from '@angular/core';
import { NavigationEnd, Router, RouterLink, RouterOutlet } from '@angular/router';
import { ApiHealthService } from '../../services/api-health.service';
import { AuthUser } from '../../auth/auth.models';
import { AuthService } from '../../auth/auth.service';
import { Subject, filter, takeUntil } from 'rxjs';
import { UiButtonComponent, UiCardComponent, UiIconComponent, UiIconName } from '../../shared/ui';
import { ConfirmService } from '../../services/confirm.service';
import { VaultService } from '../../crypto/vault.service';
import { FinanceService } from '../../services/finance.service';
import { Theme, ThemeService } from '../../services/theme.service';
import { ToastService } from '../../services/toast.service';
import { MarketRefreshCoordinatorService, MarketRefreshState } from '../../services/market-refresh-coordinator.service';

export interface NavItem {
  path: string;
  label: string;
  shortLabel: string;
  icon: UiIconName;
  exact: boolean;
}

interface NavGroup {
  label: string;
  shortLabel: string;
  icon: UiIconName;
  adminOnly?: boolean;
  items: NavItem[];
}

@Component({
  selector: 'app-main-layout',
  standalone: true,
  imports: [RouterOutlet, RouterLink, UiIconComponent, UiCardComponent, UiButtonComponent],
  templateUrl: './main-layout.component.html',
  styleUrl: './main-layout.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MainLayoutComponent implements OnInit, OnDestroy {
  private health = inject(ApiHealthService);
  private cdr = inject(ChangeDetectorRef);
  private auth = inject(AuthService);
  private router = inject(Router);
  private confirm = inject(ConfirmService);
  private finance = inject(FinanceService);
  private toast = inject(ToastService);
  private vault = inject(VaultService);
  private themeService = inject(ThemeService);
  private marketRefresh = inject(MarketRefreshCoordinatorService);
  private destroy$ = new Subject<void>();

  apiOffline = false;
  theme: Theme = this.themeService.current;
  user: AuthUser | null = null;
  isResettingData = false;
  showTutorial = false;
  marketState: MarketRefreshState = this.marketRefresh.currentState;
  readonly marketRefreshDisclosure = this.marketRefresh.disclosure;

  readonly navGroups: NavGroup[] = [
    {
      label: 'Home',
      shortLabel: 'Home',
      icon: 'dashboard',
      items: [{ path: '/', label: 'Home', shortLabel: 'Home', icon: 'dashboard', exact: true }],
    },
    {
      label: 'What you have',
      shortLabel: 'Have',
      icon: 'scale',
      items: [
        { path: '/have', label: 'What you have', shortLabel: 'Have', icon: 'scale', exact: false },
      ],
    },
    {
      label: 'Spending',
      shortLabel: 'Spend',
      icon: 'transactions',
      items: [
        { path: '/spending', label: 'Spending', shortLabel: 'Spend', icon: 'transactions', exact: false },
      ],
    },
    {
      label: 'Recurring',
      shortLabel: 'Repeat',
      icon: 'wallet',
      items: [
        { path: '/recurring', label: 'Recurring', shortLabel: 'Repeat', icon: 'wallet', exact: false },
      ],
    },
    {
      label: 'Planning',
      shortLabel: 'Plan',
      icon: 'trending',
      items: [
        { path: '/planning', label: 'Planning', shortLabel: 'Plan', icon: 'trending', exact: false },
      ],
    },
  ];

  ngOnInit() {
    this.auth.user$.pipe(takeUntil(this.destroy$)).subscribe(user => {
      this.user = user;
      this.syncMarketSession();
      this.cdr.markForCheck();
    });
    this.themeService.theme$.pipe(takeUntil(this.destroy$)).subscribe(theme => {
      this.theme = theme;
      this.cdr.markForCheck();
    });
    this.vault.unlocked$.pipe(takeUntil(this.destroy$)).subscribe(() => this.syncMarketSession());
    this.marketRefresh.status$.pipe(takeUntil(this.destroy$)).subscribe(state => {
      this.marketState = state;
      this.cdr.markForCheck();
    });
    this.router.events
      .pipe(filter((event): event is NavigationEnd => event instanceof NavigationEnd))
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => {
        this.cdr.markForCheck();
        this.focusMainContent();
      });
    this.refreshApiStatus();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private syncMarketSession(): void {
    if (this.user && this.vault.isUnlocked) {
      this.marketRefresh.startForSession(this.user.id, this.finance.sessionToken);
    } else {
      this.marketRefresh.endSession();
    }
  }

  private focusMainContent(): void {
    queueMicrotask(() => {
      const main = document.getElementById('main-content');
      if (!main) return;
      const heading = main.querySelector<HTMLElement>('h1, h2, .ui-page-header h1, .ui-page-header h2');
      const target = heading ?? main;
      if (!target.hasAttribute('tabindex')) {
        target.tabIndex = -1;
      }
      target.focus({ preventScroll: true });
    });
  }

  get isAdmin(): boolean {
    return this.user?.role === 'admin';
  }

  get visibleNavGroups(): NavGroup[] {
    return this.navGroups.filter(group => !group.adminOnly || this.isAdmin);
  }

  get activeNavGroup(): NavGroup {
    return this.visibleNavGroups.find(group => group.items.some(item => this.isActiveItem(item))) ?? this.visibleNavGroups[0];
  }

  isActiveGroup(group: NavGroup): boolean {
    return group.items.some(item => this.isActiveItem(item));
  }

  isActiveItem(item: NavItem): boolean {
    const url = this.router.url.split('?')[0].split('#')[0];
    if (item.path === '/have') {
      return url === '/have' || url === '/balance-sheet' || url === '/portfolio';
    }
    if (item.path === '/spending') {
      return url === '/spending' || url === '/transactions' || url === '/calendar';
    }
    if (item.path === '/recurring') {
      return url === '/recurring' || url === '/income' || url === '/fixed-expenses' || url === '/subscriptions';
    }
    if (item.path === '/planning') {
      return url === '/planning' || url === '/investment-insights' || url === '/stock-lab';
    }
    return item.exact ? url === item.path : url === item.path || url.startsWith(`${item.path}/`);
  }

  setTheme(theme: Theme): void {
    this.themeService.set(theme);
  }

  lockVault(): void {
    this.marketRefresh.broadcastLock();
    this.marketRefresh.endSession();
    this.finance.clearSessionState();
    this.vault.lock();
    void this.router.navigateByUrl('/vault/unlock');
  }

  logout(): void {
    this.marketRefresh.broadcastSignOut();
    this.marketRefresh.endSession();
    this.auth.logout();
  }

  retryMarketRefresh(): void {
    void this.marketRefresh.refreshNow();
  }

  get marketNoticeVisible(): boolean {
    return this.marketState.phase === 'partial' || this.marketState.phase === 'failed';
  }

  get marketRefreshMessage(): string {
    if (!this.marketNoticeVisible) return '';
    return 'Some prices could not be refreshed. Saved prices remain available.';
  }

  async clearMyData(): Promise<void> {
    const confirmed = await this.confirm.ask(
      'Clear your data?',
      'This removes your finance records. Your account stays. You still need your passphrase to open the vault.',
      'Clear my data'
    );
    if (!confirmed) return;
    this.isResettingData = true;
    this.cdr.markForCheck();
    this.finance.resetMyData().subscribe({
      next: () => {
        this.isResettingData = false;
        this.toast.success('Your data is clear.');
        this.router.navigate(['/']);
        this.cdr.markForCheck();
      },
      error: err => {
        this.isResettingData = false;
        this.toast.error(err?.error?.detail || 'The app could not clear your data.');
        this.cdr.markForCheck();
      },
    });
  }

  openTutorial(): void {
    this.showTutorial = true;
    this.cdr.markForCheck();
  }

  closeTutorial(): void {
    this.showTutorial = false;
    this.cdr.markForCheck();
  }

  refreshApiStatus(): void {
    this.health.checkWithRetries().subscribe(ok => {
      this.apiOffline = !ok;
      this.cdr.markForCheck();
    });
  }
}
