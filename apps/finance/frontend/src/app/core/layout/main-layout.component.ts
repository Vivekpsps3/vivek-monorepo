import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnDestroy, OnInit, TemplateRef, ViewChild, inject } from '@angular/core';
import { NavigationEnd, Router, RouterLink, RouterOutlet } from '@angular/router';
import { ApiHealthService } from '../../services/api-health.service';
import { AuthUser } from '@vivek/auth';
import { SESSION_CONTEXT } from '@vivek/ui';
import { Subject, filter, takeUntil } from 'rxjs';
import { UiButtonComponent, UiCardComponent, UiDialogComponent, UiIconComponent, UiIconName } from '@vivek/ui';
import { ConfirmService } from '@vivek/ui';
import { VaultService } from '../../crypto/vault.service';
import { FinanceService } from '../../services/finance.service';
import { UserMenuContent } from '@vivek/ui';
import { ToastService } from '@vivek/ui';
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
  imports: [RouterOutlet, RouterLink, UiIconComponent, UiCardComponent, UiButtonComponent, UiDialogComponent],
  templateUrl: './main-layout.component.html',
  styleUrl: './main-layout.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MainLayoutComponent implements OnInit, OnDestroy {
  private health = inject(ApiHealthService);
  private cdr = inject(ChangeDetectorRef);
  private auth = inject(SESSION_CONTEXT);
  private router = inject(Router);
  private confirm = inject(ConfirmService);
  private finance = inject(FinanceService);
  private toast = inject(ToastService);
  private vault = inject(VaultService);
  private userMenu = inject(UserMenuContent);
  @ViewChild('userMenuActions', { static: true }) private userMenuActions!: TemplateRef<unknown>;
  private marketRefresh = inject(MarketRefreshCoordinatorService);
  private destroy$ = new Subject<void>();
  private routePath = '';
  private routeEnterTimer?: ReturnType<typeof setTimeout>;
  routeEntering = false;

  apiOffline = false;
  apiRetrying = false;
  user: AuthUser | null = null;
  isResettingData = false;
  showTutorial = false;
  marketState: MarketRefreshState = this.marketRefresh.currentState;
  readonly marketRefreshDisclosure = this.marketRefresh.disclosure;

  /** shortLabel is the 320px tab; the accessible name is label. */
  readonly navGroups: NavGroup[] = [
    {
      label: 'Home',
      shortLabel: 'Home',
      icon: 'dashboard',
      items: [{ path: '/finance/', label: 'Home', shortLabel: 'Home', icon: 'dashboard', exact: true }],
    },
    {
      label: 'What you have',
      shortLabel: 'Have',
      icon: 'scale',
      items: [
        { path: '/finance/have', label: 'What you have', shortLabel: 'Have', icon: 'scale', exact: false },
      ],
    },
    {
      label: 'Spending',
      shortLabel: 'Spend',
      icon: 'transactions',
      items: [
        { path: '/finance/spending', label: 'Spending', shortLabel: 'Spend', icon: 'transactions', exact: false },
      ],
    },
    {
      label: 'Recurring',
      shortLabel: 'Repeat',
      icon: 'wallet',
      items: [
        { path: '/finance/recurring', label: 'Recurring', shortLabel: 'Repeat', icon: 'wallet', exact: false },
      ],
    },
    {
      label: 'Planning',
      shortLabel: 'Plan',
      icon: 'trending',
      items: [
        { path: '/finance/planning', label: 'Planning', shortLabel: 'Plan', icon: 'trending', exact: false },
      ],
    },
  ];

  ngOnInit() {
    this.userMenu.template.set(this.userMenuActions);
    this.auth.user$.pipe(takeUntil(this.destroy$)).subscribe(user => {
      this.user = user;
      this.syncMarketSession();
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
      .subscribe(event => {
        const path = event.urlAfterRedirects.split('?')[0].split('#')[0];
        if (path !== this.routePath) {
          this.routePath = path;
          this.routeEntering = true;
          if (this.routeEnterTimer) clearTimeout(this.routeEnterTimer);
          this.routeEnterTimer = setTimeout(() => {
            this.routeEntering = false;
            this.cdr.markForCheck();
          }, 220);
          this.focusMainContent();
        }
        this.cdr.markForCheck();
      });
    this.refreshApiStatus();
  }

  ngOnDestroy(): void {
    if (this.userMenu.template() === this.userMenuActions) this.userMenu.template.set(null);
    if (this.routeEnterTimer) clearTimeout(this.routeEnterTimer);
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
    if (item.path === '/finance/have') {
      return url === '/finance/have' || url === '/finance/balance-sheet' || url === '/finance/portfolio';
    }
    if (item.path === '/finance/spending') {
      return url === '/finance/spending' || url === '/finance/transactions' || url === '/finance/calendar';
    }
    if (item.path === '/finance/recurring') {
      return url === '/finance/recurring' || url === '/finance/income' || url === '/finance/fixed-expenses' || url === '/finance/subscriptions';
    }
    if (item.path === '/finance/planning') {
      return url === '/finance/planning' || url === '/finance/investment-insights' || url === '/finance/stock-lab';
    }
    return item.exact ? url === item.path : url === item.path || url.startsWith(`${item.path}/`);
  }

  lockVault(): void {
    this.marketRefresh.broadcastLock();
    this.marketRefresh.endSession();
    this.finance.clearSessionState();
    this.vault.lock();
    void this.router.navigateByUrl('/finance/vault/unlock');
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
        this.router.navigate(['/finance/']);
        this.cdr.markForCheck();
      },
      error: () => {
        this.isResettingData = false;
        this.toast.error("Couldn't clear your data. Something went wrong.");
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
    this.health.checkWithRetries().pipe(takeUntil(this.destroy$)).subscribe(ok => {
      this.apiOffline = !ok;
      this.cdr.markForCheck();
    });
  }

  /** Re-checks the server only. It does not navigate or clear records already on screen. */
  retryConnection(): void {
    if (this.apiRetrying) return;
    this.apiRetrying = true;
    this.cdr.markForCheck();
    this.health.checkOnce().pipe(takeUntil(this.destroy$)).subscribe(ok => {
      this.apiOffline = !ok;
      this.apiRetrying = false;
      this.cdr.markForCheck();
    });
  }
}
