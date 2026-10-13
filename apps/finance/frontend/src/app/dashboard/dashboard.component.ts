import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnDestroy, OnInit } from '@angular/core';
import { RouterLink } from '@angular/router';
import { EMPTY, Subject, combineLatest, debounceTime, finalize, filter, forkJoin, takeUntil } from 'rxjs';
import { ChartsComponent } from '../charts/charts.component';
import {
  Asset,
  BankAccountRecord,
  CashflowSummary,
  FixedExpense,
  Holding,
  JobIncome,
  ImportReceipt,
  Liability,
  NetWorth,
  Subscription,
  Transaction,
} from '../models/transaction.model';
import { FinanceService } from '../services/finance.service';
import { UiButtonComponent, UiCardComponent, UiSkeletonComponent } from '../shared/ui';
import {
  assetReviewState,
  actualQuoteDate,
  hasUnvaluedPositions,
  holdingGain,
  holdingGainPercent,
  liabilityReviewState,
  positionReviewState,
  portfolioDateSummary,
  totalPortfolioValue,
} from '../utils/portfolio.util';
import { buildSpendingSuggestion } from '../utils/planning-spending.util';

interface ReviewQueueItem {
  id: string;
  category: string;
  title: string;
  detail: string;
  link: string;
  query?: Record<string, string>;
}

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [
    CommonModule,
    RouterLink,
    ChartsComponent,
    UiButtonComponent,
    UiCardComponent,
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
  importReceipts: ImportReceipt[] = [];
  bankAccounts: BankAccountRecord[] = [];
  allTransactions: Transaction[] = [];
  reviewItems: ReviewQueueItem[] = [];
  isLoading = true;
  error: string | null = null;
  holdingsOpen = true;

  private destroy$ = new Subject<void>();
  private reviewSourcesRequest = 0;

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
        this.refreshReviewItems();
        this.cdr.markForCheck();
      });
    (this.finance.dataChanges$ || EMPTY).pipe(
      filter(change => change.collections.some(collection =>
        ['transactions', 'bank_accounts', 'import_batches'].includes(collection))),
      debounceTime(60),
      takeUntil(this.destroy$),
    ).subscribe(() => this.refreshReviewSources());
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
    return this.cashflow?.observed_income ?? 0;
  }

  get monthSpend(): number {
    return this.cashflow?.observed_expenses ?? 0;
  }

  get repeatPay(): number {
    return this.cashflow?.scheduled_income ?? 0;
  }

  get repeatSpend(): number {
    return this.cashflow?.scheduled_expenses ?? 0;
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

  get netWorthCalculationTime(): string {
    return this.netWorth?.as_of || 'Time unknown';
  }

  get visibleReviewItems(): ReviewQueueItem[] {
    return this.reviewItems.slice(0, 8);
  }

  get remainingReviewItemCount(): number {
    return Math.max(0, this.reviewItems.length - this.visibleReviewItems.length);
  }

  get isStarterState(): boolean {
    return !this.assets.length && !this.liabilities.length && !this.holdings.length
      && !this.allTransactions.length && !this.fixedExpenses.length && !this.jobIncomes.length
      && !this.subscriptions.length && !this.importReceipts.length;
  }

  private refreshReviewItems(): void {
    const items: ReviewQueueItem[] = [
      ...this.assets
        .filter(row => assetReviewState(row) !== 'current')
        .map(row => {
          const state = assetReviewState(row);
          return {
            id: `asset-${row.id}`,
            category: 'Balance review',
            title: row.name,
            detail: state === 'unknown'
              ? 'Asset balance date unknown · confirm current balance'
              : `Asset balance as of ${row.as_of_date} · review due`,
            link: '/have',
            query: { t: 'assets' },
          };
        }),
      ...this.liabilities
        .filter(row => liabilityReviewState(row) !== 'current')
        .map(row => {
          const state = liabilityReviewState(row);
          return {
            id: `liability-${row.id}`,
            category: 'Balance review',
            title: row.name,
            detail: state === 'unknown'
              ? 'Debt balance date unknown · confirm current balance'
              : `Debt balance as of ${row.as_of_date} · review due`,
            link: '/have',
            query: { t: 'assets' },
          };
        }),
      ...this.holdings
        .filter(row => positionReviewState(row) !== 'current')
        .map(row => {
          const state = positionReviewState(row);
          return {
            id: `position-${row.id}`,
            category: 'Position review',
            title: row.symbol,
            detail: state === 'unknown'
              ? 'Position date unknown · confirm shares'
              : `Shares confirmed ${row.position_as_of} · review due`,
            link: '/have',
            query: { t: 'holdings' },
          };
        }),
      ...this.coverageReviewItems(),
      ...this.transactionReviewItems(),
      ...this.importReceiptReviewItems(),
      ...this.annualRenewalItems(),
    ];
    this.reviewItems = items;
  }

  private transactionReviewItems(): ReviewQueueItem[] {
    return this.allTransactions
      .filter(row => row.reviewed !== true)
      .sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id)
      .map(row => {
        const ambiguous = row.kind === 'ambiguous_credit';
        const account = row.bank_account_key || '__unassigned_account__';
        return {
          id: `${ambiguous ? 'credit' : 'transaction'}-${row.id}`,
          category: ambiguous ? 'Ambiguous credit' : 'Transaction review',
          title: row.merchant || row.category || row.description || 'Imported transaction',
          detail: `${row.date} · $${Number(row.amount || 0).toFixed(2)} · ${row.account_display || 'Unassigned account'}${row.review_reason ? ` · ${row.review_reason}` : ''}`,
          link: '/spending',
          query: {
            t: 'activity', v: 'all', review: 'needs', edit: String(row.id), date: row.date,
            account, category: row.category?.trim() || 'uncategorized',
          },
        };
      });
  }

  get topHoldings(): Holding[] {
    return [...this.holdings].sort((a, b) => (b.value ?? 0) - (a.value ?? 0)).slice(0, 6);
  }

  holdingValue(row: Holding): number {
    return row.value ?? 0;
  }

  holdingShare(row: Holding): number {
    const total = this.portfolioValue;
    return total > 0 ? ((row.value ?? 0) / total) * 100 : 0;
  }

  gain(row: Holding): number | null {
    return holdingGain(row);
  }

  gainPct(row: Holding): number | null {
    return holdingGainPercent(row);
  }

  abs(value: number): number {
    return Math.abs(value);
  }

  retryLoad(): void {
    this.load(true);
  }

  private load(force = false): void {
    const reviewSourcesRequest = ++this.reviewSourcesRequest;
    this.isLoading = true;
    this.error = null;
    this.cdr.markForCheck();
    forkJoin({
      dashboard: this.finance.loadDashboard(force),
      liabilities: this.finance.getLiabilities(),
      bankAccounts: this.finance.getBankAccounts(),
      importReceipts: this.finance.getImportReceipts(),
      allTransactions: this.finance.getAllTransactions(),
      jobIncomes: this.finance.getJobIncomes(),
    })
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => {
          this.isLoading = false;
          this.cdr.markForCheck();
        })
      )
      .subscribe({
        next: result => {
          this.liabilities = result.liabilities;
          if (reviewSourcesRequest === this.reviewSourcesRequest) {
            this.bankAccounts = result.bankAccounts;
            this.importReceipts = result.importReceipts;
            this.allTransactions = result.allTransactions;
          }
          this.jobIncomes = result.jobIncomes;
          this.refreshReviewItems();
          this.cdr.markForCheck();
        },
        error: (err: Error) => {
          const detail = err?.message ? ` ${err.message}` : '';
          this.error = `The app could not load Home.${detail}`;
          this.cdr.markForCheck();
        },
      });
  }

  private refreshReviewSources(): void {
    const request = ++this.reviewSourcesRequest;
    forkJoin({
      bankAccounts: this.finance.getBankAccounts(),
      importReceipts: this.finance.getImportReceipts(),
      allTransactions: this.finance.getAllTransactions(),
    }).pipe(takeUntil(this.destroy$)).subscribe({
      next: result => {
        if (request !== this.reviewSourcesRequest) return;
        this.bankAccounts = result.bankAccounts;
        this.importReceipts = result.importReceipts;
        this.allTransactions = result.allTransactions;
        this.refreshReviewItems();
        this.cdr.markForCheck();
      },
    });
  }

  private coverageReviewItems(): ReviewQueueItem[] {
    const confirmed = this.bankAccounts.filter(account => account.confirmed);
    if (!confirmed.length) return [];
    const coverage = buildSpendingSuggestion({
      transactions: this.allTransactions,
      receipts: this.importReceipts,
      accounts: this.bankAccounts,
      selectedAccountKeys: confirmed.map(account => account.account_key),
      selectedCategories: [],
      now: new Date(),
    });
    const accountNames = new Map(confirmed.map(account => [account.account_key, account.display_name]));
    return coverage.coverageGaps.map(gap => ({
      id: `coverage-${gap.accountKey}`,
      category: 'Statement coverage',
      title: accountNames.get(gap.accountKey) || 'Bank account',
      detail: `Statement coverage gap ${gap.from} to ${gap.through} in the last three completed months`,
      link: '/spending',
      query: { t: 'imports' },
    }));
  }

  private importReceiptReviewItems(): ReviewQueueItem[] {
    return this.importReceipts
      .filter(receipt => {
        if (receipt.status === 'withdrawn') return false;
        const unresolvedCount = this.unresolvedReceiptNotes(receipt).length;
        return receipt.status !== 'complete' || unresolvedCount > 0;
      })
      .map(receipt => {
      const unresolvedCount = this.unresolvedReceiptNotes(receipt).length;
        const state = receipt.status === 'undoing' ? 'undo in progress' : `${receipt.status} import`;
        return {
          id: `receipt-${receipt.id}`,
          category: 'Import review',
          title: receipt.filenames?.join(', ') || 'Bank CSV import',
          detail: unresolvedCount ? `${state} · ${unresolvedCount} unresolved row(s)` : state,
          link: '/spending',
          query: { t: 'imports' },
        };
      });
  }

  private unresolvedReceiptNotes(receipt: ImportReceipt) {
    return (receipt.unresolved || []).filter(note => {
      const match = note.reason.match(/^Unclassified credit from (\d{4}-\d{2}-\d{2}): (.*)$/);
      if (!match) return true;
      return false;
    });
  }

  private annualRenewalItems(): ReviewQueueItem[] {
    const today = todayIsoDate();
    const through = addDays(today, 30);
    const scheduled: Array<{ id: string; name: string; date: string }> = [
      ...this.fixedExpenses
        .filter(row => row.is_active && row.frequency === 'annual' && row.next_due_date)
        .map(row => ({ id: `fixed-${row.id}`, name: row.name, date: row.next_due_date! })),
      ...this.subscriptions
        .filter(row => row.is_active && row.frequency === 'annual' && row.next_due_date)
        .map(row => ({ id: `subscription-${row.id}`, name: row.name, date: row.next_due_date! })),
    ];
    return scheduled
      .filter(row => isIsoDate(row.date) && row.date >= today && row.date <= through)
      .sort((a, b) => a.date.localeCompare(b.date))
      .map(row => ({
        id: `renewal-${row.id}`,
        category: 'Annual renewal',
        title: row.name,
        detail: `Due ${row.date}`,
        link: '/recurring',
        query: { t: 'spend' },
      }));
  }
}

function todayIsoDate(): string {
  const today = new Date();
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
}

function addDays(isoDate: string, days: number): string {
  const date = new Date(`${isoDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
}

function isIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
