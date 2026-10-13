import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { EMPTY, catchError, debounceTime, filter, forkJoin, of, Subject, switchMap, takeUntil } from 'rxjs';
import { transactionEffects } from '../crypto/client-finance';
import { BankAccountRecord, ImportReceipt, Transaction } from '../models/transaction.model';
import { FinanceService } from '../services/finance.service';
import {
  buildSpendingReviewPeriods,
  compareSpending,
  findCoverageGaps,
  ReviewPeriod,
  SpendingComparisonRow,
  SpendingReviewDimension,
  SpendingReviewPeriods,
  spendingComparisonGroupKey,
  UNASSIGNED_ACCOUNT_FILTER,
} from '../utils/spending-review.util';

interface CoverageReport {
  account: BankAccountRecord;
  periods: Array<{ period: ReviewPeriod; gaps: Array<{ start: string; end: string }> }>;
}

interface DrilldownRow {
  transaction: Transaction;
  period: ReviewPeriod;
}

@Component({
  selector: 'app-spending-review',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <section class="spending-review" aria-labelledby="spending-review-title">
      <header class="review-header">
        <div>
          <p class="review-eyebrow">Recorded spending</p>
          <h2 id="spending-review-title">Spending Review</h2>
          <p class="review-intro">Compare categories or merchants across two months, then open a row to inspect its transactions.</p>
        </div>
        <div class="review-controls">
          <label>
            <span>Month</span>
            <input type="month" [ngModel]="month" (ngModelChange)="onMonthChange($event)" aria-label="Review month" />
          </label>
          <label>
            <span>Account</span>
            <select [(ngModel)]="accountKey" (ngModelChange)="onAccountChange()" aria-label="Filter by confirmed account">
              <option value="">All accounts</option>
              <option [value]="unassignedAccountFilter">Unassigned account</option>
              @for (account of confirmedAccounts; track account.account_key) {
                <option [value]="account.account_key">{{ account.display_name }}</option>
              }
            </select>
          </label>
        </div>
      </header>

      @if (loading) {
        <p class="review-status" role="status">Loading encrypted transaction and import records…</p>
      } @else if (loadError) {
        <p class="review-error" role="alert">{{ loadError }}</p>
        <button type="button" class="clear-selection" (click)="loadReview()">Try again</button>
      } @else if (!periods) {
        <p class="review-error" role="alert">Choose a valid month to compare spending.</p>
      } @else {
        <p class="period-caption">
          {{ formatPeriod(periods.current) }} compared with {{ formatPeriod(periods.previous) }}.
          @if (periods.partialCurrentMonth) {
            @if (periods.omittedCurrentDays > 0) {
              The latest {{ periods.omittedCurrentDays }} day(s) in the selected month are omitted so both periods include the same {{ periods.matchedElapsedDays }} calendar days.
            } @else {
              Both periods include the same {{ periods.matchedElapsedDays }} elapsed calendar days.
            }
          }
        </p>

        <section class="coverage-panel" aria-labelledby="coverage-heading">
          <div class="coverage-heading">
            <div>
              <h3 id="coverage-heading">Confirmed statement coverage</h3>
              <p>Gaps use completed import receipts with explicit coverage dates for each confirmed account. Transaction dates never imply coverage.</p>
            </div>
          </div>
          @if (coverageReports.length) {
            <div class="coverage-grid">
              @for (report of coverageReports; track report.account.account_key) {
                <article class="coverage-account">
                  <h4>{{ report.account.display_name }}</h4>
                  @for (entry of report.periods; track entry.period.start) {
                    <div class="coverage-period">
                      <strong>{{ entry.period.month === periods.current.month ? 'Selected month' : 'Prior month' }} · {{ formatPeriod(entry.period) }}</strong>
                      @if (entry.gaps.length) {
                        <span class="coverage-gap">Unconfirmed dates: {{ formatRanges(entry.gaps) }}</span>
                      } @else {
                        <span class="coverage-complete">Every date in this period has explicit coverage.</span>
                      }
                    </div>
                  }
                </article>
              }
            </div>
          } @else {
            <p class="coverage-empty">No confirmed bank accounts are available. This view still includes manual and imported transactions, with no statement coverage to report.</p>
          }
        </section>

        <div class="review-grid">
          <section class="comparison-panel" aria-labelledby="comparison-heading">
            <div class="comparison-heading">
              <div>
                <p class="review-eyebrow">Month over month</p>
                <h3 id="comparison-heading">{{ dimension === 'category' ? 'Categories' : 'Merchants' }}</h3>
              </div>
              <div class="dimension-switch" role="group" aria-label="Comparison grouping">
                <button type="button" [attr.aria-pressed]="dimension === 'category'" (click)="setDimension('category')">Categories</button>
                <button type="button" [attr.aria-pressed]="dimension === 'merchant'" (click)="setDimension('merchant')">Merchants</button>
              </div>
            </div>

            @if (comparisonRows.length) {
              <div class="comparison-table-wrap">
                <table class="comparison-table">
                  <thead>
                    <tr>
                      <th scope="col">{{ dimension === 'category' ? 'Category' : 'Merchant' }}</th>
                      <th scope="col">Selected</th>
                      <th scope="col">Prior</th>
                      <th scope="col">Change</th>
                    </tr>
                  </thead>
                  <tbody>
                    @for (row of comparisonRows; track row.key) {
                      <tr [class.is-selected]="selectedGroupKey === row.key">
                        <th scope="row"><button type="button" class="group-link" (click)="openDrilldown(row)">{{ row.label }}</button></th>
                        <td>{{ row.currentAmount | currency:'USD' }}</td>
                        <td>{{ row.previousAmount | currency:'USD' }}</td>
                        <td [class.change-up]="row.difference > 0" [class.change-down]="row.difference < 0">{{ formatChange(row.difference) }}</td>
                      </tr>
                    }
                  </tbody>
                </table>
              </div>
              <div class="comparison-mobile-list" aria-label="Monthly spending comparison">
                @for (row of comparisonRows; track row.key) {
                  <button type="button" class="comparison-mobile-card" [class.is-selected]="selectedGroupKey === row.key" (click)="openDrilldown(row)">
                    <span class="mobile-card-heading"><strong>{{ row.label }}</strong><span>{{ formatChange(row.difference) }}</span></span>
                    <span><small>Selected</small><strong>{{ row.currentAmount | currency:'USD' }}</strong></span>
                    <span><small>Prior</small><strong>{{ row.previousAmount | currency:'USD' }}</strong></span>
                    <span class="mobile-card-hint">{{ row.currentCount }} selected · {{ row.previousCount }} prior transaction(s) · View details</span>
                  </button>
                }
              </div>
            } @else {
              <p class="comparison-empty">No recorded spending appears in either period for this account filter.</p>
            }
          </section>

          <section class="drilldown-panel" aria-labelledby="drilldown-heading">
            @if (selectedRow; as row) {
              <div class="drilldown-heading">
                <div>
                  <p class="review-eyebrow">Transaction drilldown</p>
                  <h3 id="drilldown-heading">{{ row.label }}</h3>
                </div>
                <button type="button" class="clear-selection" (click)="clearSelection()" aria-label="Close transaction details">Close</button>
              </div>
              <div class="drilldown-totals">
                <span><small>Selected</small><strong>{{ row.currentAmount | currency:'USD' }}</strong></span>
                <span><small>Prior</small><strong>{{ row.previousAmount | currency:'USD' }}</strong></span>
                <span><small>Change</small><strong [class.change-up]="row.difference > 0" [class.change-down]="row.difference < 0">{{ formatChange(row.difference) }}</strong></span>
              </div>
              @if (drilldownRows.length) {
                <div class="drilldown-list">
                  @for (item of drilldownRows; track item.transaction.id) {
                    <article class="drilldown-transaction">
                      <div>
                        <strong>{{ item.transaction.merchant || item.transaction.category || 'Transaction' }}</strong>
                        <span>{{ item.transaction.date }} · {{ item.transaction.category || 'Uncategorized' }}</span>
                        <span class="source-description"><strong>Source:</strong> {{ item.transaction.description || 'No source description' }}</span>
                        <span>{{ item.transaction.account_display || 'Manual or unassigned account' }} · {{ transactionKindLabel(item.transaction) }}</span>
                      </div>
                      <div class="drilldown-actions">
                        <strong [class.change-down]="transactionEffects(item.transaction).spending < 0">{{ transactionEffects(item.transaction).spending | currency:'USD' }}</strong>
                        <button type="button" class="open-activity" (click)="openActivity(item.transaction)">Edit in Activity</button>
                      </div>
                    </article>
                  }
                </div>
              } @else {
                <p class="comparison-empty">No matching transactions remain in the selected periods.</p>
              }
            } @else {
              <div class="drilldown-placeholder">
                <p class="review-eyebrow">Transaction drilldown</p>
                <h3 id="drilldown-heading">Choose a row</h3>
                <p>Select a category or merchant to see the transactions behind both monthly totals.</p>
              </div>
            }
          </section>
        </div>
      }
    </section>
  `,
  styles: [`
    :host { display: block; min-width: 0; }
    .spending-review { display: flex; flex-direction: column; gap: var(--space-4); min-width: 0; }
    .review-header, .comparison-heading, .drilldown-heading, .mobile-card-heading { display: flex; align-items: flex-start; justify-content: space-between; gap: var(--space-4); }
    .review-header h2, .comparison-heading h3, .drilldown-heading h3, .drilldown-placeholder h3 { margin: 0; }
    .review-header h2 { font-size: clamp(1.35rem, 2.5vw, 1.75rem); }
    .review-intro, .period-caption, .coverage-heading p, .coverage-empty, .drilldown-placeholder p:last-child { color: var(--text-secondary); margin: var(--space-2) 0 0; }
    .review-eyebrow { color: var(--text-tertiary); font-size: var(--text-xs); font-weight: 700; letter-spacing: .06em; margin: 0 0 var(--space-1); text-transform: uppercase; }
    .review-controls { display: flex; gap: var(--space-3); flex-wrap: wrap; }
    .review-controls label { display: grid; gap: var(--space-1); min-width: 10rem; color: var(--text-secondary); font-size: var(--text-sm); }
    .review-controls input, .review-controls select { box-sizing: border-box; max-width: 100%; min-height: 2.5rem; padding: 0 var(--space-3); border: 1px solid var(--border); border-radius: var(--radius-md); background: var(--surface-1); color: var(--text); font: inherit; }
    .period-caption { margin-top: calc(-1 * var(--space-2)); font-size: var(--text-sm); }
    .review-status, .review-error { margin: 0; padding: var(--space-4); border-radius: var(--radius-lg); background: var(--surface-2); color: var(--text-secondary); }
    .review-error { color: var(--danger); }
    .coverage-panel, .comparison-panel, .drilldown-panel { min-width: 0; border: 1px solid var(--border-subtle); border-radius: var(--radius-lg); background: var(--card-bg); padding: var(--space-4); }
    .coverage-heading h3, .comparison-heading h3, .drilldown-heading h3 { font-size: var(--text-lg); }
    .coverage-heading p { font-size: var(--text-sm); max-width: 54rem; }
    .coverage-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 17rem), 1fr)); gap: var(--space-3); margin-top: var(--space-4); }
    .coverage-account { min-width: 0; border: 1px solid var(--border-subtle); border-radius: var(--radius-md); background: var(--surface-2); padding: var(--space-3); }
    .coverage-account h4 { margin: 0 0 var(--space-3); overflow-wrap: anywhere; }
    .coverage-period { display: grid; gap: var(--space-1); font-size: var(--text-sm); }
    .coverage-period + .coverage-period { border-top: 1px solid var(--border-subtle); margin-top: var(--space-3); padding-top: var(--space-3); }
    .coverage-period strong { font-size: var(--text-xs); color: var(--text-secondary); }
    .coverage-gap { color: var(--warning, #b45309); overflow-wrap: anywhere; }
    .coverage-complete { color: var(--success); }
    .review-grid { display: grid; grid-template-columns: minmax(0, 1.08fr) minmax(18rem, .92fr); gap: var(--space-4); align-items: start; }
    .comparison-heading { align-items: center; margin-bottom: var(--space-3); }
    .dimension-switch { display: flex; gap: var(--space-1); padding: var(--space-1); border-radius: var(--radius-md); background: var(--surface-2); }
    .dimension-switch button, .clear-selection { appearance: none; border: 1px solid transparent; border-radius: var(--radius-sm); padding: var(--space-2) var(--space-3); background: transparent; color: var(--text-secondary); font: inherit; font-size: var(--text-sm); cursor: pointer; }
    .dimension-switch button[aria-pressed="true"] { border-color: var(--border); background: var(--card-bg); color: var(--text); font-weight: 600; }
    .comparison-table-wrap { overflow-x: auto; }
    .comparison-table { width: 100%; border-collapse: collapse; font-variant-numeric: tabular-nums; }
    .comparison-table th, .comparison-table td { padding: var(--space-3) var(--space-2); border-bottom: 1px solid var(--border-subtle); text-align: right; white-space: nowrap; }
    .comparison-table thead th { color: var(--text-secondary); font-size: var(--text-xs); font-weight: 600; }
    .comparison-table th:first-child, .comparison-table tbody th { text-align: left; }
    .comparison-table tbody tr.is-selected { background: color-mix(in srgb, var(--accent-glow) 35%, transparent); }
    .group-link { max-width: 15rem; overflow: hidden; padding: 0; border: 0; background: transparent; color: var(--text); font: inherit; font-weight: 600; text-align: left; text-overflow: ellipsis; white-space: nowrap; cursor: pointer; }
    .change-up { color: var(--danger); }
    .change-down { color: var(--success); }
    .comparison-mobile-list { display: none; }
    .comparison-empty { margin: 0; padding: var(--space-4) 0; color: var(--text-secondary); }
    .drilldown-heading { align-items: center; }
    .clear-selection { border-color: var(--border); background: var(--surface-2); color: var(--text); }
    .drilldown-totals { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: var(--space-2); margin: var(--space-4) 0; }
    .drilldown-totals span { display: grid; gap: var(--space-1); min-width: 0; }
    .drilldown-totals small { color: var(--text-secondary); font-size: var(--text-xs); }
    .drilldown-totals strong { font-size: var(--text-sm); font-variant-numeric: tabular-nums; }
    .drilldown-list { display: grid; }
    .drilldown-transaction { display: flex; align-items: flex-start; justify-content: space-between; gap: var(--space-3); padding: var(--space-3) 0; border-top: 1px solid var(--border-subtle); }
    .drilldown-transaction > div { display: grid; min-width: 0; gap: var(--space-1); }
    .drilldown-transaction > div strong, .drilldown-transaction > div span { overflow-wrap: anywhere; }
    .drilldown-transaction > div span { color: var(--text-secondary); font-size: var(--text-xs); }
    .drilldown-transaction > div .source-description { color: var(--text); }
    .source-description strong { color: var(--text-secondary); font-weight: 500; }
    .drilldown-actions { display: grid; justify-items: end; gap: var(--space-2); flex: 0 0 auto; }
    .drilldown-transaction > strong { flex: 0 0 auto; font-variant-numeric: tabular-nums; }
    .open-activity { border: 1px solid var(--border); border-radius: var(--radius-sm); padding: var(--space-1) var(--space-2); background: var(--surface-2); color: var(--text-secondary); font: inherit; font-size: var(--text-xs); cursor: pointer; }
    .drilldown-placeholder { display: grid; min-height: 9rem; align-content: center; }
    @media (max-width: 800px) {
      .review-header { flex-direction: column; }
      .review-controls { width: 100%; }
      .review-controls label { flex: 1 1 9rem; min-width: 0; }
      .review-grid { grid-template-columns: minmax(0, 1fr); }
      .comparison-table-wrap { display: none; }
      .comparison-mobile-list { display: grid; gap: var(--space-2); }
      .comparison-mobile-card { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--space-2); min-width: 0; padding: var(--space-3); border: 1px solid var(--border-subtle); border-radius: var(--radius-md); background: var(--surface-1); color: var(--text); text-align: left; font: inherit; cursor: pointer; }
      .comparison-mobile-card.is-selected { border-color: var(--accent); }
      .mobile-card-heading, .mobile-card-hint { grid-column: 1 / -1; }
      .mobile-card-heading { align-items: center; overflow-wrap: anywhere; }
      .mobile-card-heading span { flex: 0 0 auto; font-variant-numeric: tabular-nums; }
      .comparison-mobile-card > span:not(.mobile-card-heading):not(.mobile-card-hint) { display: flex; justify-content: space-between; gap: var(--space-2); font-variant-numeric: tabular-nums; }
      .comparison-mobile-card small, .mobile-card-hint { color: var(--text-secondary); font-size: var(--text-xs); }
      .mobile-card-hint { padding-top: var(--space-1); }
      .drilldown-totals { grid-template-columns: 1fr 1fr; }
      .drilldown-totals span:last-child { grid-column: 1 / -1; }
    }
    @media (max-width: 420px) {
      .coverage-panel, .comparison-panel, .drilldown-panel { padding: var(--space-3); }
      .comparison-heading { align-items: flex-start; flex-direction: column; }
      .dimension-switch { width: 100%; }
      .dimension-switch button { flex: 1; }
      .drilldown-transaction { flex-direction: column; }
      .drilldown-actions { display: flex; width: 100%; align-items: center; justify-content: space-between; }
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SpendingReviewComponent implements OnInit, OnDestroy {
  readonly transactionEffects = transactionEffects;
  readonly unassignedAccountFilter = UNASSIGNED_ACCOUNT_FILTER;
  month = this.currentMonthKey();
  dimension: SpendingReviewDimension = 'category';
  accountKey = '';
  transactions: Transaction[] = [];
  confirmedAccounts: BankAccountRecord[] = [];
  importReceipts: ImportReceipt[] = [];
  loading = true;
  loadError = '';
  selectedGroupKey = '';

  private readonly destroy$ = new Subject<void>();
  private readonly reviewRefresh$ = new Subject<void>();

  constructor(
    private financeService: FinanceService,
    private cdr: ChangeDetectorRef,
    private route: ActivatedRoute,
    private router: Router,
  ) {}

  ngOnInit(): void {
    this.route.queryParamMap.pipe(takeUntil(this.destroy$)).subscribe(params => {
      const requestedMonth = params.get('month');
      if (requestedMonth && /^\d{4}-\d{2}$/.test(requestedMonth)) this.month = requestedMonth;
      this.accountKey = params.get('account') || '';
      const requestedDimension = params.get('dimension');
      this.dimension = requestedDimension === 'merchant' ? 'merchant' : 'category';
      this.selectedGroupKey = params.get('group') || '';
      this.cdr.markForCheck();
    });
    this.reviewRefresh$.pipe(
      switchMap(() => {
        this.loading = true;
        this.loadError = '';
        this.cdr.markForCheck();
        return forkJoin({
          transactions: this.financeService.getAllTransactions(),
          accounts: this.financeService.getBankAccounts(),
          receipts: this.financeService.getImportReceipts(),
        }).pipe(catchError(() => of(null)));
      }),
      takeUntil(this.destroy$),
    ).subscribe({
      next: result => {
        if (!result) {
          this.loading = false;
          this.loadError = 'Spending review could not load the encrypted finance records. Try refreshing the page.';
          this.cdr.markForCheck();
          return;
        }
        this.transactions = result.transactions;
        this.confirmedAccounts = result.accounts.filter(account => account.confirmed)
          .sort((a, b) => a.display_name.localeCompare(b.display_name));
        this.importReceipts = result.receipts;
        this.loading = false;
        this.cdr.markForCheck();
      },
    });
    (this.financeService.dataChanges$ || EMPTY).pipe(
      filter(change => change.collections.some((collection: string) =>
        ['transactions', 'bank_accounts', 'import_batches'].includes(collection))),
      debounceTime(60),
      takeUntil(this.destroy$),
    ).subscribe(() => this.loadReview());
    this.loadReview();
  }

  loadReview(): void {
    this.reviewRefresh$.next();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private currentMonthKey(): string {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  }

  get periods(): SpendingReviewPeriods | null {
    return buildSpendingReviewPeriods(this.month);
  }

  get comparisonRows(): SpendingComparisonRow[] {
    const periods = this.periods;
    return periods ? compareSpending(this.transactions, periods, this.dimension, this.accountKey) : [];
  }

  get selectedRow(): SpendingComparisonRow | undefined {
    return this.comparisonRows.find(row => row.key === this.selectedGroupKey);
  }

  get coverageReports(): CoverageReport[] {
    const periods = this.periods;
    if (!periods) return [];
    const accounts = this.accountKey
      ? this.confirmedAccounts.filter(account => account.account_key === this.accountKey)
      : this.confirmedAccounts;
    return accounts.map(account => ({
      account,
      periods: [periods.current, periods.previous].map(period => ({
        period,
        gaps: findCoverageGaps(account, period, this.importReceipts),
      })),
    }));
  }

  get drilldownRows(): DrilldownRow[] {
    const row = this.selectedRow;
    const periods = this.periods;
    if (!row || !periods) return [];
    return this.transactions
      .filter(transaction => (this.accountKey === UNASSIGNED_ACCOUNT_FILTER
        ? !transaction.bank_account_key
        : !this.accountKey || transaction.bank_account_key === this.accountKey)
        && spendingComparisonGroupKey(transaction, this.dimension) === row.key
        && transactionEffects(transaction).spending !== 0
        && (transaction.date >= periods.current.start && transaction.date <= periods.current.end
          || transaction.date >= periods.previous.start && transaction.date <= periods.previous.end))
      .sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id)
      .map(transaction => ({
        transaction,
        period: transaction.date >= periods.current.start && transaction.date <= periods.current.end ? periods.current : periods.previous,
      }));
  }

  onMonthChange(month: string): void {
    this.month = month;
    this.clearSelection();
    this.syncReviewQuery();
  }

  onAccountChange(): void {
    this.clearSelection();
    this.syncReviewQuery();
  }

  setDimension(dimension: SpendingReviewDimension): void {
    if (this.dimension === dimension) return;
    this.dimension = dimension;
    this.clearSelection();
    this.syncReviewQuery();
  }

  openDrilldown(row: SpendingComparisonRow): void {
    this.selectedGroupKey = row.key;
    this.syncReviewQuery();
    this.cdr.markForCheck();
  }

  clearSelection(): void {
    this.selectedGroupKey = '';
    this.syncReviewQuery();
    this.cdr.markForCheck();
  }

  openActivity(transaction: Transaction): void {
    const periods = this.periods;
    const row = this.selectedRow;
    if (!periods || !row) return;
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: {
        t: 'activity',
        v: 'spending',
        account: this.accountKey || transaction.bank_account_key || UNASSIGNED_ACCOUNT_FILTER,
        category: this.dimension === 'category' ? row.label : null,
        merchant: this.dimension === 'merchant' ? row.label : null,
        q: null,
        review: null,
        receipt: null,
        month: null,
        from: null,
        through: null,
        periodStart: periods.current.start,
        periodEnd: periods.current.end,
        priorStart: periods.previous.start,
        priorEnd: periods.previous.end,
        edit: transaction.id,
        date: null,
        add: null,
        group: null,
        dimension: null,
      },
      queryParamsHandling: 'merge',
    });
  }

  private syncReviewQuery(): void {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: {
        t: 'review',
        q: null,
        category: null,
        merchant: null,
        review: null,
        from: null,
        through: null,
        receipt: null,
        date: null,
        edit: null,
        add: null,
        periodStart: null,
        periodEnd: null,
        priorStart: null,
        priorEnd: null,
        month: this.month || null,
        account: this.accountKey || null,
        dimension: this.dimension,
        group: this.selectedGroupKey || null,
      },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  formatPeriod(period: ReviewPeriod): string {
    const [startYear, startMonth, startDay] = period.start.split('-').map(Number);
    const [endYear, endMonth, endDay] = period.end.split('-').map(Number);
    const start = new Date(startYear, startMonth - 1, startDay);
    const end = new Date(endYear, endMonth - 1, endDay);
    const startLabel = start.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    const endLabel = end.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
    return `${startLabel}–${endLabel}`;
  }

  formatRanges(ranges: Array<{ start: string; end: string }>): string {
    return ranges.map(range => range.start === range.end ? range.start : `${range.start}–${range.end}`).join(', ');
  }

  formatChange(amount: number): string {
    if (amount > 0) return `+${new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD' }).format(amount)}`;
    if (amount < 0) return `−${new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD' }).format(Math.abs(amount))}`;
    return new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD' }).format(0);
  }

  transactionKindLabel(transaction: Transaction): string {
    if (transaction.kind === 'refund') return 'Refund';
    if (transaction.kind === 'purchase') return 'Purchase';
    return transaction.type === 'income' ? 'Income' : 'Expense';
  }
}
