import { ChangeDetectionStrategy, Component, ElementRef, OnDestroy, OnInit, ViewChild, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { catchError, defaultIfEmpty, filter, forkJoin, merge, of, Subject, switchMap, take, takeUntil } from 'rxjs';
import { dollarsFromCountedCents, todayIsoDate } from '@vivek/browser';
import {
  AppDatePipe, ConfirmService, MoneyPipe, SESSION_CONTEXT, ToastService,
  UiBadgeComponent, UiButtonComponent, UiDataTableComponent, UiEmptyStateComponent, UiPageHeaderComponent,
  type ConfirmState,
} from '@vivek/ui';
import { possiblyOverdueCommitments } from '../crypto/client-finance';
import { readLockEpoch } from '../crypto/dek-holder';
import { bindLockSnapshots } from '../crypto/lock-finance';
import { FixedExpensesComponent } from '../fixed-expenses/fixed-expenses.component';
import type { FixedExpense, Subscription, Transaction } from '../models/transaction.model';
import { FinanceService } from '../services/finance.service';
import { SubscriptionsComponent } from '../subscriptions/subscriptions.component';
import { countableCents, needsFixing } from '../utils/validators';

type Commitment =
  | { kind: 'bill'; record: FixedExpense }
  | { kind: 'subscription'; record: Subscription };

interface CommitmentRow {
  key: string;
  commitment: Commitment;
  date: string | null;
  overdue: string | undefined;
  needsFixing: boolean;
}

const frequencyLabels: Readonly<Record<string, string>> = {
  weekly: 'Weekly', biweekly: 'Every two weeks', monthly: 'Monthly', quarterly: 'Quarterly', annual: 'Annual',
};

@Component({
  selector: 'app-bills',
  standalone: true,
  imports: [
    AppDatePipe, MoneyPipe, FormsModule, UiBadgeComponent, UiButtonComponent, UiDataTableComponent,
    UiEmptyStateComponent, UiPageHeaderComponent, FixedExpensesComponent, SubscriptionsComponent,
  ],
  templateUrl: './bills.component.html',
  styleUrl: './bills.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BillsComponent implements OnInit, OnDestroy {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly host: ElementRef<HTMLElement> = inject(ElementRef);
  private readonly finance = inject(FinanceService);
  private readonly confirm = inject(ConfirmService);
  private readonly toast = inject(ToastService);
  private readonly session = inject(SESSION_CONTEXT, { optional: true });
  private readonly openedSession = this.finance.sessionToken;
  private readonly openedLock = readLockEpoch();
  private readonly releaseLock = bindLockSnapshots(() => this.invalidate());
  private readonly stop$ = new Subject<void>();
  private readonly reload$ = new Subject<void>();
  private confirmation: ConfirmState | null = null;

  @ViewChild(FixedExpensesComponent) private billEditor?: FixedExpensesComponent;
  @ViewChild(SubscriptionsComponent) private subscriptionEditor?: SubscriptionsComponent;

  private readonly bills = signal<FixedExpense[]>([]);
  private readonly subscriptions = signal<Subscription[]>([]);
  private readonly ledger = signal<Transaction[] | null>(null);
  readonly active = signal(true);
  readonly loading = signal(true);
  readonly commitmentsError = signal(false);
  readonly ledgerLoading = signal(true);
  readonly ledgerError = signal(false);
  readonly typeFilter = signal<'all' | 'bill' | 'subscription'>('all');
  readonly statusFilter = signal<'all' | 'active' | 'inactive'>('all');
  readonly dateOrder = signal<'soonest' | 'latest'>('soonest');
  readonly deleting = signal<string | null>(null);
  readonly deleteError = signal<string | null>(null);
  readonly frequencyLabels = frequencyLabels;
  readonly today = todayIsoDate();

  readonly rows = computed<CommitmentRow[]>(() => {
    const ledger = this.ledger();
    const bills = this.bills();
    const subscriptions = this.subscriptions();
    const overdue = ledger && !this.loading() && !this.commitmentsError()
      ? possiblyOverdueCommitments(this.today, ledger, bills, subscriptions) : null;
    const commitments: Commitment[] = [
      ...bills.map(record => ({ kind: 'bill' as const, record })),
      ...subscriptions.map(record => ({ kind: 'subscription' as const, record })),
    ];
    return commitments.map(commitment => {
      const key = commitment.kind + ':' + commitment.record.id;
      return {
        key, commitment, date: commitment.record.next_due_date, overdue: overdue?.get(key),
        needsFixing: needsFixing(commitment.record.amount, 'positive'),
      };
    });
  });

  readonly filteredRows = computed(() => {
    const kind = this.typeFilter();
    const status = this.statusFilter();
    const direction = this.dateOrder() === 'soonest' ? 1 : -1;
    return this.rows().filter(({ commitment }) =>
      (kind === 'all' || commitment.kind === kind) &&
      (status === 'all' || commitment.record.is_active === (status === 'active'))
    ).sort((a, b) => {
      const left = a.overdue ?? a.date;
      const right = b.overdue ?? b.date;
      if (left && right && left !== right) return direction * left.localeCompare(right);
      return Number(!left) - Number(!right) ||
        a.commitment.record.name.localeCompare(b.commitment.record.name) || a.key.localeCompare(b.key);
    });
  });

  readonly activeMonthlyTotal = computed(() => {
    const cents = this.rows().reduce((sum, row) => {
      if (!row.commitment.record.is_active || row.needsFixing) return sum;
      return sum + (countableCents(row.commitment.record.monthly_amount, 'positive') ?? 0);
    }, 0);
    const dollars = dollarsFromCountedCents(cents);
    return Number.isFinite(dollars) ? dollars : 0;
  });

  ngOnInit(): void {
    this.session?.cleared$?.pipe(takeUntil(this.stop$)).subscribe(() => this.invalidate());
    this.route.queryParamMap.pipe(takeUntil(this.stop$)).subscribe(params => {
      const kind = params.get('kind');
      const status = params.get('status');
      this.typeFilter.set(kind === 'bill' || kind === 'subscription' ? kind : 'all');
      this.statusFilter.set(status === 'active' || status === 'inactive' ? status : 'all');
      this.dateOrder.set(params.get('order') === 'latest' ? 'latest' : 'soonest');
    });
    this.finance.fixedExpenses$.pipe(takeUntil(this.stop$)).subscribe(rows => this.bills.set(rows));
    this.finance.subscriptions$.pipe(takeUntil(this.stop$)).subscribe(rows => this.subscriptions.set(rows));
    merge(of(undefined), this.reload$).pipe(
      switchMap(() => {
        this.loading.set(true);
        this.commitmentsError.set(false);
        return forkJoin([
          this.finance.getFixedExpenses().pipe(defaultIfEmpty(null), catchError(() => of(null))),
          this.finance.getSubscriptions().pipe(defaultIfEmpty(null), catchError(() => of(null))),
        ]);
      }),
      takeUntil(this.stop$),
    ).subscribe(([bills, subscriptions]) => {
      if (!this.isCurrent()) return;
      this.commitmentsError.set(bills === null || subscriptions === null);
      this.loading.set(false);
    });
    merge(
      of(undefined),
      this.reload$,
      this.finance.dataChanges$.pipe(filter(change => change.collections.includes('transactions'))),
    ).pipe(
      switchMap(() => {
        this.ledger.set(null);
        this.ledgerLoading.set(true);
        this.ledgerError.set(false);
        return this.finance.getAllTransactions().pipe(defaultIfEmpty(null), catchError(() => of(null)));
      }),
      takeUntil(this.stop$),
    ).subscribe(ledger => {
      if (!this.isCurrent()) return;
      this.ledger.set(ledger);
      this.ledgerLoading.set(false);
      this.ledgerError.set(ledger === null);
    });
  }

  ngOnDestroy(): void {
    this.releaseLock();
    this.invalidate();
    this.stop$.complete();
    this.reload$.complete();
  }

  private invalidate(): void {
    if (!this.active()) return;
    this.active.set(false);
    this.stop$.next();
    this.billEditor?.closeModal();
    this.subscriptionEditor?.closeModal();
    if (this.confirmation && this.currentConfirmation() === this.confirmation) this.confirm.close(false);
    this.confirmation = null;
    this.bills.set([]);
    this.subscriptions.set([]);
    this.ledger.set(null);
    this.deleting.set(null);
    this.deleteError.set(null);
  }

  private isCurrent(): boolean {
    return this.active() && this.openedLock === readLockEpoch() && this.openedSession === this.finance.sessionToken;
  }

  loadCommitments(): void {
    if (this.isCurrent()) this.reload$.next();
  }

  filterChanged(): void {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: {
        kind: this.typeFilter(),
        status: this.statusFilter(),
        order: this.dateOrder(),
      },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  showAllCommitments(): void {
    this.typeFilter.set('all');
    this.statusFilter.set('all');
    this.filterChanged();
    requestAnimationFrame(() => {
      if (this.isCurrent()) this.host.nativeElement.querySelector<HTMLElement>('select')?.focus();
    });
  }

  addBill(): void { if (this.isCurrent()) this.billEditor?.openAddModal(); }
  addSubscription(): void { if (this.isCurrent()) this.subscriptionEditor?.openAddModal(); }

  edit({ commitment }: CommitmentRow): void {
    if (!this.isCurrent()) return;
    if (commitment.kind === 'bill') this.billEditor?.openEditModal(commitment.record);
    else this.subscriptionEditor?.openEditModal(commitment.record);
  }

  private currentConfirmation(): ConfirmState | null {
    let current: ConfirmState | null = null;
    this.confirm.state$.pipe(take(1)).subscribe(state => { current = state; });
    return current;
  }

  async remove(key: string, event: MouseEvent): Promise<void> {
    if (!this.isCurrent() || this.deleting() || this.confirmation) return;
    const row = this.rows().find(item => item.key === key);
    if (!row) return;
    const control = event.currentTarget as HTMLElement | null;
    const { commitment } = row;
    const previous = this.currentConfirmation();
    const pending = this.confirm.ask(`Delete ${commitment.kind}?`, `Remove ${commitment.record.name}?`);
    const confirmation = this.currentConfirmation();
    if (confirmation !== previous) this.confirmation = confirmation;
    const accepted = await pending;
    if (this.confirmation === confirmation) this.confirmation = null;
    if (!accepted || !this.isCurrent()) return;

    this.deleting.set(key);
    this.deleteError.set(null);
    const id = commitment.record.id;
    const request = commitment.kind === 'bill' ? this.finance.deleteFixedExpense(id, true) : this.finance.deleteSubscription(id, true);
    request.pipe(takeUntil(this.stop$)).subscribe({
      next: () => {
        if (!this.isCurrent()) return;
        this.deleting.set(null);
        this.toast.success(commitment.kind === 'bill' ? 'Bill deleted' : 'Subscription deleted');
        requestAnimationFrame(() => {
          if (this.isCurrent() && document.activeElement === document.body) {
            this.host.nativeElement.querySelector('h1')?.focus({ preventScroll: true });
          }
        });
      },
      error: () => {
        if (!this.isCurrent()) return;
        this.deleting.set(null);
        this.deleteError.set(key);
        requestAnimationFrame(() => {
          if (this.isCurrent() && document.activeElement === document.body) control?.focus();
        });
      },
    });
  }
}
