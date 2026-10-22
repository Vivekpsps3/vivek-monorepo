import { ChangeDetectionStrategy, ChangeDetectorRef, Component, DestroyRef, OnInit, ViewChild, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { catchError, forkJoin, of } from 'rxjs';
import { IncomeComponent } from '../income/income.component';
import { CompensationReportComponent } from '../income/compensation-report.component';
import { FixedExpensesComponent } from '../fixed-expenses/fixed-expenses.component';
import { SubscriptionsComponent } from '../subscriptions/subscriptions.component';
import { FinanceService } from '../services/finance.service';
import { UiButtonComponent } from '@vivek/ui';
import { InfoTipComponent } from '../shared/info-tip.component';
import { FixedExpense, Subscription } from '../models/transaction.model';
import { countableCents, dollarsFromCountedCents, needsFixing } from '@vivek/browser';
import { UiBadgeComponent } from '@vivek/ui';
import { MoneyPipe } from '../shared/pipes/money.pipe';
import { AppDatePipe } from '../shared/pipes/app-date.pipe';

export interface CommitmentRow {
  id: number;
  kind: 'bill' | 'subscription';
  name: string;
  category: string;
  date: string | null;
  account: string | null;
  autopay: boolean | null;
  frequency: string;
  amount: number;
  monthlyAmount: number;
  active: boolean;
  needsFixing?: boolean;
  bill?: FixedExpense;
  subscription?: Subscription;
}

@Component({
  selector: 'app-recurring-hub',
  standalone: true,
  imports: [
    AppDatePipe,
    MoneyPipe, CommonModule, FormsModule, RouterLink, UiButtonComponent, UiBadgeComponent, IncomeComponent, CompensationReportComponent, FixedExpensesComponent, SubscriptionsComponent, InfoTipComponent],
  template: `
    <div class="page recurring-page">
      <h1>Recurring</h1>
      <nav class="hub-tabs" aria-label="Recurring">
        <a [routerLink]="[]" [queryParams]="{ t: 'pay' }" queryParamsHandling="merge" [class.on]="tab === 'pay'">Jobs &amp; pay</a>
        <a [routerLink]="[]" [queryParams]="{ t: 'spend' }" queryParamsHandling="merge" [class.on]="tab === 'spend'">Bills &amp; subscriptions</a>
      </nav>
      @if (tab === 'spend') {
        <section class="commitments" aria-labelledby="commitments-title">
          <header class="commitments__header">
            <div>
              <h2 id="commitments-title">Bills &amp; subscriptions <app-info-tip label="Bills and balances" text="Editing bills and subscriptions does not add a transaction or change your balances." /></h2>
            </div>
            <div class="commitments__actions">
              <ui-button variant="secondary" (clicked)="addBill()">Add bill</ui-button>
              <ui-button variant="primary" (clicked)="addSubscription()">Add subscription</ui-button>
            </div>
          </header>
          <div class="commitment-totals" aria-label="Bills and subscriptions totals">
            <div><span>Active monthly equivalent</span><strong class="money">{{ activeMonthlyTotal | money }}</strong></div>
            <div><span>Active annual equivalent</span><strong class="money">{{ activeAnnualTotal | money }}</strong></div>
            <div><span>Repeating</span><strong>{{ rows.length }}</strong></div>
          </div>
          <div class="commitment-filters" aria-label="Filter commitments">
            <label><span>Type</span><select name="commitment_type" [(ngModel)]="typeFilter" (ngModelChange)="filterChanged()"><option value="all">All types</option><option value="bill">Bills</option><option value="subscription">Subscriptions</option></select></label>
            <label><span>Status</span><select name="commitment_status" [(ngModel)]="statusFilter" (ngModelChange)="filterChanged()"><option value="all">Active and inactive</option><option value="active">Active</option><option value="inactive">Inactive</option></select></label>
            <label><span>Order</span><select name="commitment_order" [(ngModel)]="dateOrder" (ngModelChange)="filterChanged()"><option value="soonest">Next due first</option><option value="latest">Latest due first</option></select></label>
          </div>
          @if (loadError) {
            <div class="commitment-error" role="alert"><span>{{ loadError }}</span><ui-button variant="secondary" (clicked)="loadCommitments()">Retry</ui-button></div>
          }
          @if (loading && !loadError) {
            <p class="commitment-status" role="status">Loading bills and subscriptions…</p>
          } @else if (filteredRows.length) {
            <div class="commitment-table-wrap">
              <table class="commitment-table">
                <caption class="visually-hidden">Bills and subscriptions</caption>
                <thead><tr><th>Next due</th><th>Item</th><th>Account</th><th>Autopay</th><th>Frequency</th><th>Amount</th><th>Status</th><th><span class="visually-hidden">Actions</span></th></tr></thead>
                <tbody>
                  @for (item of filteredRows; track item.kind + ':' + item.id) {
                    <tr>
                      <td>{{ item.date | appDate }}</td>
                      <td><strong>{{ item.name }}</strong><small>{{ item.kind === 'bill' ? item.category : 'Subscription' }} · {{ item.kind === 'bill' ? 'Bill' : 'Subscription' }}</small></td>
                      <td>{{ item.account || 'Not recorded' }}</td>
                      <td>{{ item.autopay == null ? 'Not recorded' : item.autopay ? 'Autopay' : 'Manual' }}</td>
                      <td>{{ frequencyLabel(item.frequency) }}</td>
                      <td class="money">
                        @if (item.needsFixing) { <ui-badge variant="warning">Needs fixing</ui-badge> }
                        {{ item.amount | money }}<small>{{ item.monthlyAmount | money }} / month</small>
                      </td>
                      <td><span class="status-chip" [class.status-chip--inactive]="!item.active">{{ item.active ? 'Active' : 'Inactive' }}</span></td>
                      <td class="commitment-row-actions"><ui-button variant="ghost" size="sm" (clicked)="edit(item)">Edit</ui-button><ui-button variant="danger" size="sm" (clicked)="remove(item)">Delete</ui-button></td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
            <div class="commitment-cards">
              @for (item of filteredRows; track item.kind + ':' + item.id) {
                <article class="commitment-card">
                  <div class="commitment-card__heading"><div><strong>{{ item.name }}</strong><span>{{ item.kind === 'bill' ? item.category : 'Subscription' }} · {{ item.active ? 'Active' : 'Inactive' }}</span></div><strong class="money">{{ item.amount | money }}</strong></div>
                  <dl><div><dt>Next due</dt><dd>{{ item.date | appDate }}</dd></div><div><dt>Account</dt><dd>{{ item.account || 'Not recorded' }}</dd></div><div><dt>Autopay</dt><dd>{{ item.autopay == null ? 'Not recorded' : item.autopay ? 'Autopay' : 'Manual' }}</dd></div><div><dt>Frequency</dt><dd>{{ frequencyLabel(item.frequency) }}</dd></div></dl>
                  <div class="commitment-card__actions"><ui-button variant="secondary" (clicked)="edit(item)">Edit</ui-button><ui-button variant="danger" (clicked)="remove(item)">Delete</ui-button></div>
                </article>
              }
            </div>
          } @else if (rows.length) {
            <p class="commitment-empty">No items match these filters. Choose “All types” and “Active and inactive” to see every bill and subscription.</p>
          } @else if (!loadError) {
            <div class="commitment-empty"><strong>No bills or subscriptions yet.</strong></div>
          }
        </section>
        <app-fixed-expenses [embedded]="true" [editorOnly]="true" />
        <app-subscriptions [embedded]="true" [editorOnly]="true" />
      } @else {
        <app-income [embedded]="true" />
        <details class="compensation-history" [open]="historyOpen" (toggle)="historyToggled($event)">
          <summary>View compensation history <app-info-tip label="Compensation history" text="Estimated gross compensation by employer, from the same job records. This report is read-only." /></summary>
          <app-compensation-report />
        </details>
      }
    </div>
  `,
  styles: [`
    :host { display:block; min-width:0; max-width:100%; }
    .recurring-page { display:grid; gap:var(--space-5, 1.25rem); min-width:0; max-width:100%; }
    .recurring-page > * { min-width:0; max-width:100%; }
    .commitments { display:grid; gap:1rem; box-sizing:border-box; min-width:0; max-width:100%; padding:clamp(1rem,2vw,1.5rem); border:1px solid var(--border-subtle); border-radius:var(--radius-lg,1rem); background:var(--card-bg); }
    .commitments__header { display:flex; align-items:flex-start; justify-content:space-between; gap:1rem; min-width:0; }
    .commitments__header > div { min-width:0; }
    .commitments h2 { margin:0; font-size:1.25rem; }
    .commitments__header p, .compensation-history > p { margin:.35rem 0 0; color:var(--text-secondary); overflow-wrap:anywhere; }
    .commitments__actions, .commitment-card__actions { display:flex; flex-wrap:wrap; gap:.5rem; }
    .commitment-totals { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:.75rem; min-width:0; }
    .commitment-totals > div { display:grid; gap:.25rem; min-width:0; padding:.8rem; border-radius:.75rem; background:var(--surface-2); }
    .commitment-totals span, .commitment-table small, .commitment-card span { color:var(--text-secondary); font-size:.82rem; overflow-wrap:anywhere; }
    .commitment-totals strong, .commitment-card__heading .money { overflow-wrap:anywhere; }
    .commitment-filters { display:flex; flex-wrap:wrap; gap:.75rem; min-width:0; }
    .commitment-filters label { display:grid; gap:.3rem; flex:1 1 10rem; min-width:min(100%, 10rem); }
    .commitment-filters select { width:100%; min-width:0; box-sizing:border-box; min-height:2.5rem; padding:.4rem .65rem; border:1px solid var(--border); border-radius:.5rem; background:var(--card-bg); color:inherit; }
    .commitment-table-wrap { min-width:0; max-width:100%; overflow-x:auto; }
    .commitment-table { width:100%; border-collapse:collapse; }
    .commitment-table th,.commitment-table td { padding:.75rem .65rem; text-align:left; vertical-align:middle; border-bottom:1px solid var(--border-subtle); overflow-wrap:anywhere; }
    .commitment-table small { display:block; margin-top:.2rem; }
    .commitment-row-actions { white-space:nowrap; }
    .commitment-row-actions ui-button + ui-button { margin-left:.25rem; }
    .status-chip { display:inline-flex; padding:.2rem .55rem; border-radius:99px; background:color-mix(in srgb, var(--success) 16%, var(--card-bg)); color:var(--success); font-size:.78rem; }
    .status-chip--inactive { background:var(--surface-2); color:var(--text-secondary); }
    .commitment-empty,.commitment-status,.commitment-error { padding:1rem; border-radius:.7rem; background:var(--surface-2); overflow-wrap:anywhere; }
    .commitment-error { display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:1rem; background:color-mix(in srgb, var(--danger) 12%, var(--card-bg)); color:var(--danger); }
    .commitment-cards { display:none; }
    .compensation-history { box-sizing:border-box; min-width:0; max-width:100%; padding:1rem; border:1px solid var(--border-subtle); border-radius:.8rem; background:var(--card-bg); }
    .compensation-history summary { cursor:pointer; font-weight:650; min-height:44px; display:flex; align-items:center; }
    .visually-hidden { position:absolute; width:1px; height:1px; padding:0; margin:-1px; overflow:hidden; clip:rect(0,0,0,0); white-space:nowrap; border:0; }
    @media (max-width:768px) {
      .commitments__header, .commitment-error { display:grid; }
      .commitments__actions { display:grid; grid-template-columns:1fr; }
      .commitments__actions ::ng-deep .ui-btn,
      .commitment-card__actions ::ng-deep .ui-btn,
      .commitment-error ::ng-deep .ui-btn { width:100%; min-height:44px; }
      .commitment-totals, .commitment-filters { grid-template-columns:1fr; }
      .commitment-filters { display:grid; }
      .commitment-filters label { min-width:0; }
      .commitment-filters select { min-height:44px; }
      .commitment-table-wrap { display:none; }
      .commitment-cards { display:grid; gap:.75rem; }
      .commitment-card { box-sizing:border-box; min-width:0; padding:.85rem; border:1px solid var(--border-subtle); border-radius:.75rem; }
      .commitment-card__heading { display:flex; flex-wrap:wrap; justify-content:space-between; align-items:flex-start; gap:.75rem; }
      .commitment-card__heading div { display:grid; gap:.2rem; flex:1 1 8rem; min-width:0; }
      .commitment-card dl { display:grid; grid-template-columns:1fr; gap:.6rem; margin:.8rem 0; }
      .commitment-card dl div { min-width:0; }
      .commitment-card dt { color:var(--text-secondary); font-size:.75rem; }
      .commitment-card dd { margin:.15rem 0 0; overflow-wrap:anywhere; }
      .commitment-card__actions { display:grid; grid-template-columns:1fr; }
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RecurringHubComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private cdr = inject(ChangeDetectorRef);
  private destroyRef = inject(DestroyRef);
  private financeService = inject(FinanceService);

  @ViewChild(FixedExpensesComponent) private billEditor?: FixedExpensesComponent;
  @ViewChild(SubscriptionsComponent) private subscriptionEditor?: SubscriptionsComponent;

  tab = 'pay';
  historyOpen = false;
  loading = false;
  loadError = '';
  fixedExpenses: FixedExpense[] = [];
  subscriptions: Subscription[] = [];
  typeFilter: 'all' | 'bill' | 'subscription' = 'all';
  statusFilter: 'all' | 'active' | 'inactive' = 'all';
  dateOrder: 'soonest' | 'latest' = 'soonest';

  get rows(): CommitmentRow[] {
    return [
      ...this.fixedExpenses.map(bill => ({
        id: bill.id, kind: 'bill' as const, name: bill.name, category: bill.category,
        date: bill.next_due_date, account: bill.payment_account || null, autopay: bill.autopay,
        frequency: bill.frequency, amount: bill.amount, monthlyAmount: bill.monthly_amount,
        active: bill.is_active, needsFixing: needsFixing(bill.amount, 'positive'), bill,
      })),
      ...this.subscriptions.map(subscription => ({
        id: subscription.id, kind: 'subscription' as const, name: subscription.name, category: subscription.category,
        date: subscription.next_due_date, account: subscription.payment_account || null, autopay: null,
        frequency: subscription.frequency, amount: subscription.amount, monthlyAmount: subscription.monthly_amount,
        active: subscription.is_active, needsFixing: needsFixing(subscription.amount, 'positive'), subscription,
      })),
    ].sort((a, b) => {
      if (!a.date && b.date) return 1;
      if (a.date && !b.date) return -1;
      const dateCompare = (a.date || '').localeCompare(b.date || '') * (this.dateOrder === 'soonest' ? 1 : -1);
      return dateCompare || a.name.localeCompare(b.name) || a.kind.localeCompare(b.kind);
    });
  }

  get filteredRows(): CommitmentRow[] {
    return this.rows.filter(row =>
      (this.typeFilter === 'all' || row.kind === this.typeFilter) &&
      (this.statusFilter === 'all' || (this.statusFilter === 'active' ? row.active : !row.active))
    );
  }

  get activeMonthlyTotal(): number {
    let cents = 0;
    for (const row of this.rows) {
      if (!row.active || row.needsFixing) continue;
      const part = countableCents(row.monthlyAmount, 'positive');
      if (part == null) continue;
      cents += part;
    }
    const dollars = dollarsFromCountedCents(cents);
    return Number.isFinite(dollars) ? dollars : 0;
  }

  get activeAnnualTotal(): number { return this.activeMonthlyTotal * 12; }

  filterChanged(): void {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { kind: this.typeFilter, status: this.statusFilter, order: this.dateOrder },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  ngOnInit(): void {
    this.financeService.fixedExpenses$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(rows => { this.fixedExpenses = rows; this.cdr.markForCheck(); });
    this.financeService.subscriptions$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(rows => { this.subscriptions = rows; this.cdr.markForCheck(); });
    this.route.queryParamMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(params => {
      const requested = params.get('t');
      if (requested === 'compensation') {
        const queryParams: Record<string, string> = {};
        params.keys.forEach(key => { const value = params.get(key); if (value !== null) queryParams[key] = value; });
        queryParams['t'] = 'pay';
        queryParams['history'] = '1';
        void this.router.navigate(['/recurring'], { queryParams, replaceUrl: true });
        return;
      }
      this.tab = requested === 'spend' || requested === 'bills' || requested === 'subs' ? 'spend' : 'pay';
      this.historyOpen = this.tab === 'pay' && params.get('history') === '1';
      const kind = params.get('kind');
      const status = params.get('status');
      const order = params.get('order');
      if (kind === 'bill' || kind === 'subscription' || kind === 'all') this.typeFilter = kind;
      if (status === 'active' || status === 'inactive' || status === 'all') this.statusFilter = status;
      if (order === 'latest' || order === 'soonest') this.dateOrder = order;
      this.cdr.markForCheck();
    });
    this.loadCommitments();
  }

  loadCommitments(): void {
    this.loading = true;
    this.loadError = '';
    forkJoin({
      bills: this.financeService.getFixedExpenses().pipe(catchError(() => of(null))),
      subscriptions: this.financeService.getSubscriptions().pipe(catchError(() => of(null))),
    }).pipe(takeUntilDestroyed(this.destroyRef)).subscribe(({ bills, subscriptions }) => {
      this.loading = false;
      if (bills === null || subscriptions === null) this.loadError = 'Some recurring items could not be loaded. Retry to check your saved bills and subscriptions.';
      this.cdr.markForCheck();
    });
  }

  addBill(): void { this.billEditor?.openAddModal(); }
  addSubscription(): void { this.subscriptionEditor?.openAddModal(); }
  edit(row: CommitmentRow): void {
    if (row.bill) this.billEditor?.openEditModal(row.bill);
    if (row.subscription) this.subscriptionEditor?.openEditModal(row.subscription);
  }
  remove(row: CommitmentRow): void {
    if (row.bill) void this.billEditor?.deleteExpense(row.bill);
    if (row.subscription) void this.subscriptionEditor?.deleteSubscription(row.subscription);
  }
  frequencyLabel(value: string): string {
    return ({ weekly: 'Weekly', biweekly: 'Every two weeks', monthly: 'Monthly', quarterly: 'Quarterly', annual: 'Annual' } as Record<string, string>)[value] || value;
  }
  historyToggled(event: Event): void {
    const isOpen = (event.target as HTMLDetailsElement).open;
    this.historyOpen = isOpen;
    const queryParams = { history: isOpen ? '1' : null };
    void this.router.navigate([], { relativeTo: this.route, queryParams, queryParamsHandling: 'merge', replaceUrl: true });
  }
}
