import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, Inject, OnDestroy, OnInit, Optional } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Subject, combineLatest, finalize, forkJoin, takeUntil } from 'rxjs';
import { SESSION_CONTEXT, type SessionPort } from '@vivek/ui';
import { ChartsComponent } from '../charts/charts.component';
import { FinancePricePrefsService } from '../core/finance-price-prefs.service';
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
import { MarketRefreshCoordinatorService } from '../services/market-refresh-coordinator.service';
import { monthlyCashflowSeries } from '../crypto/client-finance';
import { monthDelta, type MonthDelta } from '../utils/category-spend';
import { UiButtonComponent, UiCardComponent, UiIconComponent, UiSkeletonComponent } from '@vivek/ui';
import {
  actualQuoteDate,
  hasUnvaluedPositions,
  portfolioDateSummary,
  totalPortfolioValue,
} from '../utils/portfolio.util';
import { MoneyPipe } from '@vivek/ui';
import { AppDatePipe } from '@vivek/ui';
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
  /** One-time ticker-privacy notice, shown after the first automatic check. */
  priceNoticeVisible = false;
  /** True when the user turned automatic price checks off. */
  autoPricesOff = false;

  private destroy$ = new Subject<void>();

  constructor(
    private finance: FinanceService,
    private cdr: ChangeDetectorRef,
    @Optional() private marketRefresh: MarketRefreshCoordinatorService | null = null,
    @Optional() private pricePrefs: FinancePricePrefsService | null = null,
    @Optional() @Inject(SESSION_CONTEXT) private session: SessionPort | null = null
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
    const userId = this.session?.currentUser?.id;
    if (userId != null && this.pricePrefs) this.autoPricesOff = !this.pricePrefs.autoCheck(userId);
    this.marketRefresh?.firstAutoCheck$.pipe(takeUntil(this.destroy$)).subscribe(() => {
      const id = this.session?.currentUser?.id;
      if (id != null && this.pricePrefs && !this.pricePrefs.noticeSeen(id)) {
        this.priceNoticeVisible = true;
        this.cdr.markForCheck();
      }
    });
    this.load();
  }

  dismissPriceNotice(): void {
    const userId = this.session?.currentUser?.id;
    if (userId != null) this.pricePrefs?.markNoticeSeen(userId);
    this.priceNoticeVisible = false;
    this.cdr.markForCheck();
  }

  refreshPrices(): void {
    void this.marketRefresh?.refreshNow();
  }

  ngOnDestroy(): void {
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

  retryLoad(): void {
    this.load(true);
  }

  private load(force = false): void {
    this.isLoading = true;
    this.error = null;
    this.cdr.markForCheck();
    forkJoin({
      dashboard: this.finance.loadDashboard(force),
      liabilities: this.finance.getLiabilities(),
    })
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => {
          this.isLoading = false;
          this.cdr.markForCheck();
        })
      )
      .subscribe({
        next: () => this.cdr.markForCheck(),
        error: (err: Error) => {
          const detail = err?.message ? ` ${err.message}` : '';
          this.error = `The app could not load Home.${detail}`;
          this.cdr.markForCheck();
        },
      });
  }
}
