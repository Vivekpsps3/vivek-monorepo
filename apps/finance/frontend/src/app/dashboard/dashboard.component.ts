import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnDestroy, OnInit, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { formatDate, formatDay, formatRelativeDay, todayIsoDate } from '@vivek/browser';
import { Subject, combineLatest, finalize, forkJoin, takeUntil } from 'rxjs';
import { SESSION_CONTEXT } from '@vivek/ui';
import { ChartsComponent } from '../charts/charts.component';
import { FinancePricePrefsService, automaticPriceNotice } from '../core/finance-price-prefs.service';
import {
  Asset,
  CashflowSummary,
  FixedExpense,
  Holding,
  JobIncome,
  Liability,
  NetWorth,
  Subscription,
  Transaction,
} from '../models/transaction.model';
import { FinanceService } from '../services/finance.service';
import {
  dueSoon as dueSoonItems,
  firstSteps as firstStepsFor,
  homeAsOfLine,
  type DueItem,
  type FirstStep,
} from '../utils/home-summary';
import { MarketRefreshCoordinatorService } from '../services/market-refresh-coordinator.service';
import { monthlyCashflowSeries } from '../crypto/client-finance';
import { monthDelta, type MonthDelta } from '../utils/category-spend';
import { FinanceGuideService } from '../core/finance-guide.service';
import { UiButtonComponent, UiCardComponent, UiIconComponent, UiPageHeaderComponent, UiSkeletonComponent } from '@vivek/ui';
import {
  actualQuoteDate,
  hasUnvaluedPositions,
  portfolioDateSummary,
  totalPortfolioValue,
} from '../utils/portfolio.util';
import { MoneyPipe } from '@vivek/ui';
import { AppDatePipe } from '@vivek/ui';
import { incomeRowSubtitle, incomeRowTitle } from '../utils/income-row-copy';
import { PluralPipe } from '../shared/pipes/plural.pipe';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [
    PluralPipe,
    AppDatePipe,
    MoneyPipe,
    CommonModule,
    RouterLink,
    ChartsComponent,
    UiButtonComponent,
    UiCardComponent,
    UiIconComponent,
    UiPageHeaderComponent,
    UiSkeletonComponent,
  ],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DashboardComponent implements OnInit, OnDestroy {
  netWorth: NetWorth | null = null;
  cashflow: CashflowSummary | null = null;
  holdings: Holding[] = [];
  transactions: Transaction[] = [];
  assets: Asset[] = [];
  liabilities: Liability[] = [];
  fixedExpenses: FixedExpense[] = [];
  jobIncomes: JobIncome[] = [];
  subscriptions: Subscription[] = [];
  isLoading = true;
  error: string | null = null;
  showSkeleton = false;
  firstStepsHidden = false;
  /** One-time ticker-privacy notice, shown after the first automatic check. */
  priceNoticeVisible = false;
  noticeSymbols: readonly string[] = [];

  protected readonly guide = inject(FinanceGuideService);

  private skeletonTimer: ReturnType<typeof setTimeout> | null = null;
  private destroy$ = new Subject<void>();
  private readonly marketRefresh = inject(MarketRefreshCoordinatorService, { optional: true });
  private readonly pricePrefs = inject(FinancePricePrefsService, { optional: true });
  private readonly session = inject(SESSION_CONTEXT, { optional: true });

  constructor(
    private finance: FinanceService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    combineLatest([
      this.finance.netWorth$,
      this.finance.cashflowSummary$,
      this.finance.holdings$,
      this.finance.dashboardTransactions$,
      this.finance.assets$,
      this.finance.liabilities$,
      this.finance.fixedExpenses$,
      this.finance.jobIncomes$,
      this.finance.subscriptions$,
    ])
      .pipe(takeUntil(this.destroy$))
      .subscribe(([netWorth, cashflow, holdings, transactions, assets, liabilities, fixedExpenses, jobIncomes, subscriptions]) => {
        this.netWorth = netWorth;
        this.cashflow = cashflow;
        this.holdings = holdings;
        this.transactions = transactions;
        this.assets = assets;
        this.liabilities = liabilities;
        this.fixedExpenses = fixedExpenses;
        this.jobIncomes = jobIncomes;
        this.subscriptions = subscriptions;
        this.cdr.markForCheck();
      });
    this.pricePrefs?.changes$.pipe(takeUntil(this.destroy$)).subscribe(() => this.cdr.markForCheck());
    this.marketRefresh?.firstAutoCheck$?.pipe(takeUntil(this.destroy$)).subscribe(symbols => {
      this.revealPriceNotice(symbols);
    });
    if (this.marketRefresh?.automaticCheckAnnounced) this.revealPriceNotice(this.marketRefresh.disclosedSymbols);
    this.load();
    this.readFirstStepsHidden();
  }

  /** True when this user turned automatic price checks off. Reads the shared preference. */
  get autoPricesOff(): boolean {
    const userId = this.session?.currentUser?.id;
    return userId != null && !!this.pricePrefs && !this.pricePrefs.autoCheck(userId);
  }

  get priceNoticeCopy(): string {
    return automaticPriceNotice(this.noticeSymbols);
  }

  dismissPriceNotice(): void {
    const userId = this.session?.currentUser?.id;
    if (userId != null) this.pricePrefs?.markNoticeSeen(userId);
    this.priceNoticeVisible = false;
    this.cdr.markForCheck();
  }

  turnOffAutomaticChecks(): void {
    const userId = this.session?.currentUser?.id;
    if (userId != null) {
      this.pricePrefs?.setAutoCheck(userId, false);
      this.pricePrefs?.markNoticeSeen(userId);
    }
    this.priceNoticeVisible = false;
    this.cdr.markForCheck();
  }

  private revealPriceNotice(symbols: readonly string[]): void {
    this.noticeSymbols = [...symbols];
    const id = this.session?.currentUser?.id;
    if (id != null && this.pricePrefs && !this.pricePrefs.noticeSeen(id)) this.priceNoticeVisible = true;
    this.cdr.markForCheck();
  }

  refreshPrices(): void {
    void this.marketRefresh?.refreshNow();
  }

  ngOnDestroy(): void {
    if (this.skeletonTimer) {
      clearTimeout(this.skeletonTimer);
      this.skeletonTimer = null;
    }
    this.destroy$.next();
    this.destroy$.complete();
  }

  get have(): number {
    return this.netWorth?.total ?? 0;
  }

  get monthPay(): number {
    return this.cashflow?.total_income ?? 0;
  }

  /** Current month key, e.g. '2026-11'. */
  get currentMonth(): string {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  }

  /** F18: Home rows read "<Employer> paycheck" with a cadence subtitle. */
  get incomeRows() {
    return this.incomeOccurrences.map(row => ({
      ...row,
      title: incomeRowTitle(row),
      subtitle: [row.date ? formatDate(row.date, 'table') : 'No date', incomeRowSubtitle(row)].join(' · '),
    }));
  }

  get monthName(): string {
    const now = new Date();
    return now.toLocaleString('en-US', { month: 'long' });
  }

  /** Posted spend this month (recorded view; scheduled bills excluded). */
  get monthSpend(): number {
    return monthlyCashflowSeries([this.currentMonth], this.transactions, this.jobIncomes, this.fixedExpenses, this.subscriptions, 'recorded')[0]?.expense ?? 0;
  }

  /** Scheduled spend still to come this month, reported separately. */
  get monthScheduled(): number {
    return monthlyCashflowSeries([this.currentMonth], this.transactions, this.jobIncomes, this.fixedExpenses, this.subscriptions, 'scheduled')[0]?.expense ?? 0;
  }

  /** Like-for-like delta against the same window last month. */
  get spendDelta(): MonthDelta {
    return monthDelta(this.transactions, this.currentMonth);
  }

  get incomeOccurrences() {
    return this.cashflow?.income_occurrences ?? [];
  }

  get monthNet(): number {
    return this.cashflow?.net_cashflow ?? 0;
  }

  get portfolioValue(): number {
    return totalPortfolioValue(this.holdings);
  }

  get balanceSourceDates(): string {
    return portfolioDateSummary([
      ...this.assets.map(row => row.as_of_date),
      ...this.liabilities.map(row => row.as_of_date),
    ]);
  }

  get positionSourceDates(): string {
    return portfolioDateSummary(this.holdings.map(row => row.position_as_of));
  }

  get quoteSourceDates(): string {
    return portfolioDateSummary(this.holdings.map(actualQuoteDate));
  }

  get unvaluedPositionCount(): number {
    return this.holdings.filter(row => row.value == null || !Number.isFinite(Number(row.value))).length;
  }

  get provisionalPositionCount(): number {
    return this.holdings.filter(row => row.price_source === 'provisional_cost_basis' || row.price_source === 'fallback_purchase').length;
  }

  get portfolioValueIncomplete(): boolean {
    return hasUnvaluedPositions(this.holdings);
  }

  get isStarterState(): boolean {
    return !this.assets.length && !this.liabilities.length && !this.holdings.length
      && !this.transactions.length && !this.fixedExpenses.length && !this.jobIncomes.length
      && !this.subscriptions.length;
  }

  get hasBalances(): boolean {
    return this.assets.length + this.liabilities.length + this.holdings.length > 0;
  }

  get hasMonthActivity(): boolean {
    // F8 seam: add `|| this.monthScheduled !== 0` once F8's getter lands on main.
    return this.monthPay !== 0 || this.monthSpend !== 0;
  }

  get asOfLine(): string {
    return homeAsOfLine(this.assets, this.liabilities, this.holdings);
  }

  get hasRecurring(): boolean {
    return this.fixedExpenses.length + this.subscriptions.length > 0;
  }

  get dueSoon(): DueItem[] {
    return dueSoonItems(todayIsoDate(), 14, this.transactions, this.fixedExpenses, this.subscriptions);
  }

  get dueSoonTotal(): number {
    return this.dueSoon.reduce((sum, row) => sum + row.amount, 0);
  }

  get firstSteps(): FirstStep[] {
    return firstStepsFor({
      assets: this.assets.length,
      liabilities: this.liabilities.length,
      holdings: this.holdings.length,
      transactions: this.transactions.length,
      jobIncomes: this.jobIncomes.length,
      fixed: this.fixedExpenses.length,
      subs: this.subscriptions.length,
    });
  }

  get firstStepsDoneCount(): number {
    return this.firstSteps.filter(step => step.done).length;
  }

  get showFirstSteps(): boolean {
    if (this.isStarterState) return true;
    return this.guide.firstStepsRequested() || (!this.firstStepsHidden && this.firstStepsDoneCount < 4);
  }

  get today(): string {
    return todayIsoDate();
  }

  get monthOnlyName(): string {
    return formatDate(this.today, 'month').split(' ')[0];
  }

  hideFirstSteps(): void {
    this.firstStepsHidden = true;
    try {
      localStorage.setItem(this.firstStepsStorageKey, '1');
    } catch {
      // Private mode: hide for this page session only.
    }
    this.guide.clear();
    this.cdr.markForCheck();
  }

  dueLabel(iso: string): string {
    const relative = formatRelativeDay(iso);
    return relative === 'Today' || relative === 'Tomorrow' ? relative : formatDay(iso);
  }

  stepLink(id: FirstStep['id']): { path: string; params: Record<string, string> | null } {
    switch (id) {
      case 'balance':
        return { path: '/finance/have', params: null };
      case 'holdings':
        return { path: '/finance/have', params: { t: 'holdings' } };
      case 'activity':
        return { path: '/finance/spending', params: { add: '1' } };
      case 'recurring':
        return { path: '/finance/recurring', params: null };
    }
  }

  private get firstStepsStorageKey(): string {
    const id = this.session?.currentUser?.id;
    return `finance-home-first-steps-hidden:${id ?? 'signed-out'}`;
  }

  private readFirstStepsHidden(): void {
    try {
      this.firstStepsHidden = localStorage.getItem(this.firstStepsStorageKey) === '1';
    } catch {
      this.firstStepsHidden = false;
    }
  }

  retryLoad(): void {
    this.load(true);
  }

  private load(force = false): void {
    this.isLoading = true;
    this.error = null;
    this.showSkeleton = false;
    if (this.skeletonTimer) clearTimeout(this.skeletonTimer);
    this.skeletonTimer = setTimeout(() => {
      this.showSkeleton = true;
      this.cdr.markForCheck();
    }, 150);
    this.cdr.markForCheck();
    forkJoin({
      dashboard: this.finance.loadDashboard(force),
      liabilities: this.finance.getLiabilities(),
    })
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => {
          if (this.skeletonTimer) {
            clearTimeout(this.skeletonTimer);
            this.skeletonTimer = null;
          }
          this.isLoading = false;
          this.cdr.markForCheck();
        })
      )
      .subscribe({
        next: () => this.cdr.markForCheck(),
        error: () => {
          this.error = 'load-failed';
          this.cdr.markForCheck();
        },
      });
  }
}
