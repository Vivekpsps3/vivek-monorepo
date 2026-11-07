import { ChangeDetectionStrategy, ChangeDetectorRef, Component, Injector, OnDestroy, OnInit, TemplateRef, ViewChild, inject } from '@angular/core';
import { NavigationEnd, Router, RouterLink, RouterOutlet } from '@angular/router';
import { ApiHealthService } from '../../services/api-health.service';
import { AuthUser } from '@vivek/auth';
import { SESSION_CONTEXT } from '@vivek/ui';
import { Subject, filter, takeUntil, firstValueFrom } from 'rxjs';
import { UiButtonComponent, UiCardComponent, UiDialogComponent, UiIconComponent, UiIconName, UiSectionNavComponent } from '@vivek/ui';
import { ConfirmService } from '@vivek/ui';
import { VaultService } from '../../crypto/vault.service';
import { FinanceLockService } from '../finance-lock.service';
import { FinanceGuideService } from '../finance-guide.service';
import { FinanceService } from '../../services/finance.service';
import { UserMenuContent } from '@vivek/ui';
import { ToastService } from '@vivek/ui';
import { MarketRefreshCoordinatorService, MarketRefreshState } from '../../services/market-refresh-coordinator.service';

export interface NavItem {
  path: string;
  label: string;
  icon: UiIconName;
  exact: boolean;
}

interface NavGroup {
  label: string;
  icon: UiIconName;
  adminOnly?: boolean;
  items: NavItem[];
}

@Component({
  selector: 'app-main-layout',
  standalone: true,
  imports: [RouterOutlet, RouterLink, UiIconComponent, UiCardComponent, UiButtonComponent, UiDialogComponent, UiSectionNavComponent],
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
  private lock = inject(FinanceLockService);
  private guide = inject(FinanceGuideService);
  private readonly injector = inject(Injector);
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

  /** One label set at every width (D3): Home, Net worth, Spending, Recurring, Planning. */
  readonly navGroups: NavGroup[] = [
    {
      label: 'Home',
      icon: 'dashboard',
      items: [{ path: '/finance/', label: 'Home', icon: 'dashboard', exact: true }],
    },
    {
      label: 'Net worth',
      icon: 'scale',
      items: [
        { path: '/finance/have', label: 'Net worth', icon: 'scale', exact: false },
      ],
    },
    {
      label: 'Spending',
      icon: 'transactions',
      items: [
        { path: '/finance/spending', label: 'Spending', icon: 'transactions', exact: false },
      ],
    },
    {
      label: 'Recurring',
      icon: 'wallet',
      items: [
        { path: '/finance/recurring', label: 'Recurring', icon: 'wallet', exact: false },
      ],
    },
    {
      label: 'Planning',
      icon: 'trending',
      items: [
        { path: '/finance/planning', label: 'Planning', icon: 'trending', exact: false },
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
      const heading = main.querySelector<HTMLElement>('h1');
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
    // Legacy paths redirect in app.routes.ts before render, so plain
    // prefix matching is enough here.
    const url = this.router.url.split('?')[0].split('#')[0];
    return item.exact ? url === item.path || url === '/finance' : url === item.path || url.startsWith(`${item.path}/`);
  }

  get sectionNavItems(): { label: string; link: string; exact?: boolean }[] {
    return this.visibleNavGroups.map(g => ({ label: g.label, link: g.items[0].path, exact: g.items[0].exact }));
  }

  lockVault(): void {
    void this.lock.lockNow();
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
    this.isResettingData = true;
    this.cdr.markForCheck();
    try {
      const cleared = await this.confirm.confirmAction({
        title: 'Clear all Finance data?',
        // PLAN ruling: wipe copy includes Town health records.
        message: 'This permanently deletes every balance, holding, transaction, job, bill and plan in your vault, plus your Town health records. Your account and passphrase stay. This can\'t be undone.',
        phrase: 'CLEAR MY DATA',
        confirmLabel: 'Clear data',
        busyLabel: 'Clearing…',
        // K2's option is named errorMessage (F2's text said failureMessage).
        errorMessage: 'Couldn\'t clear your data. Nothing was deleted. Try again.',
        run: () => firstValueFrom(this.finance.resetMyData()).then(() => undefined),
      });
      if (!cleared) return;
      this.toast.success('Finance data cleared.');
      await this.router.navigate(['/finance/']);
    } finally {
      this.isResettingData = false;
      this.cdr.markForCheck();
    }
  }

  openTutorial(): void {
    this.showTutorial = true;
    this.cdr.markForCheck();
  }

  closeTutorial(): void {
    this.showTutorial = false;
    this.cdr.markForCheck();
  }

  showPriceDetails = false;

  openPriceDetails(): void {
    this.showPriceDetails = true;
    this.cdr.markForCheck();
  }

  closePriceDetails(): void {
    this.showPriceDetails = false;
    this.cdr.markForCheck();
  }

  showFirstStepsOnHome(): void {
    this.guide.requestFirstSteps();
    this.closeTutorial();
    void this.router.navigateByUrl('/finance');
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
