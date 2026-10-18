import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnDestroy, OnInit } from '@angular/core';
import { RouterLink } from '@angular/router';
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
import { UiButtonComponent, UiCardComponent, UiIconComponent, UiSkeletonComponent } from '@vivek/ui';
import {
  actualQuoteDate,
  hasUnvaluedPositions,
  portfolioDateSummary,
  totalPortfolioValue,
} from '../utils/portfolio.util';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [
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
