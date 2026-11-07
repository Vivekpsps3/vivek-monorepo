import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnDestroy, OnInit, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { formatDate, formatDay, formatRelativeDay, todayIsoDate } from '@vivek/browser';
import { Subject, combineLatest, finalize, forkJoin, takeUntil } from 'rxjs';
import { ChartsComponent } from '../charts/charts.component';
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
import { SESSION_CONTEXT, UiButtonComponent, UiCardComponent, UiIconComponent, UiSkeletonComponent } from '@vivek/ui';
import {
  dueSoon as dueSoonItems,
  firstSteps as firstStepsFor,
  homeAsOfLine,
  type DueItem,
  type FirstStep,
} from '../utils/home-summary';
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
  showSkeleton = false;
  firstStepsHidden = false;

  private readonly session = inject(SESSION_CONTEXT, { optional: true });
  private skeletonTimer: ReturnType<typeof setTimeout> | null = null;
  private destroy$ = new Subject<void>();

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
    this.load();
    this.readFirstStepsHidden();
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

  get incomeOccurrences() {
    return this.cashflow?.income_occurrences ?? [];
  }

  get monthSpend(): number {
    return this.cashflow?.total_expenses ?? 0;
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
    // F6 seam: `|| this.guide.firstStepsRequested()` once FinanceGuideService lands on main.
    return !this.firstStepsHidden && this.firstStepsDoneCount < 4;
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
    // F6 seam: this.guide.clear() once FinanceGuideService lands on main.
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
