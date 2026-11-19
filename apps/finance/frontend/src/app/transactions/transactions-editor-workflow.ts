import { HttpClient } from '@angular/common/http';
import { ChangeDetectorRef, Injectable, OnDestroy, inject } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { defer, of, share, Subject, takeUntil } from 'rxjs';
import { FinanceService } from '../services/finance.service';
import { ReturnContext, ToastService, silentErrorToast, successCopy } from '@vivek/ui';
import { financeCalendarPath } from '../core/layout/finance-navigation';
import { Transaction, TransactionCreate } from '../models/transaction.model';
import { todayIsoDate, toDollars } from '@vivek/browser';
import { validateMoney, validateTransaction, type FieldIssue } from '../utils/validators';
import { dialogSaveAlert, fieldMessage, focusDialogAlert, focusErrorSummary } from '../shared/form-validation';
import {
  TRIP_LIST_UNAVAILABLE,
  normalizeTripId,
  tripTagChoices,
  type TripTagChoice,
  type TripTagHome,
} from './trip-tag';

@Injectable()
export class TransactionsEditorWorkflow implements OnDestroy {
  showModal = false;
  newTx: TransactionCreate = this.emptyTx();
  editingTxId: number | null = null;
  editingImported = false;
  saving = false;
  transactionSaveError = '';
  fieldErrors: FieldIssue[] = [];
  formSubmitted = false;
  tripChoices: TripTagChoice[] = tripTagChoices(null, null);
  tripListNote = '';
  private tripLoad = 0;
  private readonly http = inject(HttpClient, { optional: true });
  // Filters and the editor can join one in-flight Travel read. Reopening retries
  // unavailability without caching an owner's trip names beyond this Activity view.
  readonly tripHome$ = defer(() => this.http
    ? this.http.get<TripTagHome>('/travel/api/home', { context: silentErrorToast() })
    : of(null)).pipe(share());
  private originalAmount: number | null = null;
  private amountDirty = false;
  private readonly destroy$ = new Subject<void>();
  private readonly dismissed$ = new Subject<void>();
  private readonly context = inject(ReturnContext);

  constructor(
    private financeService: FinanceService,
    private toastService: ToastService,
    private cdr: ChangeDetectorRef,
    private route: ActivatedRoute,
    private router: Router,
  ) {}

  private emptyTx(): TransactionCreate {
    return {
      date: todayIsoDate(),
      type: 'expense',
      category: '',
      amount: '' as unknown as number,
      description: '',
      trip_id: null,
    };
  }

  openAddModal(selectedCalendarDate: string | null): void {
    this.editingTxId = null;
    this.editingImported = false;
    this.originalAmount = null;
    this.amountDirty = false;
    this.transactionSaveError = '';
    this.fieldErrors = [];
    this.formSubmitted = false;
    this.newTx = { ...this.emptyTx(), ...(selectedCalendarDate ? { date: selectedCalendarDate } : {}) };
    this.showModal = true;
    this.loadTripChoices();
  }

  onAmountChange(value: number | string): void {
    this.newTx.amount = value as unknown as number;
    this.amountDirty = true;
  }

  fieldError(field: string): string | null {
    return this.formSubmitted ? fieldMessage(this.fieldErrors, field) : null;
  }

  saveTransaction(): void {
    if (this.saving) return;
    const preserveAmount = !this.amountDirty && this.originalAmount != null;
    const errors = validateTransaction({
      amount: preserveAmount ? '1.00' : this.newTx.amount,
      date: this.newTx.date,
      category: this.newTx.category,
    });
    this.fieldErrors = errors;
    this.formSubmitted = true;
    this.transactionSaveError = '';
    if (errors.length) {
      this.cdr.markForCheck();
      this.focusFeedback(focusErrorSummary);
      return;
    }
    let amount = this.originalAmount ?? 0;
    if (!preserveAmount) {
      const parsed = validateMoney(this.newTx.amount, {
        allowZero: false,
        negativeMessage: 'Enter an amount above $0. Choose Refund or Income for money coming in.',
        emptyMessage: 'Enter an amount above $0. Choose Refund or Income for money coming in.',
      });
      if (!('cents' in parsed)) return;
      amount = toDollars(parsed.cents);
    }

    this.saving = true;
    const payload: TransactionCreate = {
      ...this.newTx,
      category: this.newTx.category.trim(),
      amount,
      trip_id: normalizeTripId(this.newTx.trip_id),
    };
    const request = this.editingTxId !== null
      ? this.financeService.updateTransaction(this.editingTxId, payload, true)
      : this.financeService.addTransaction(payload, true);

    request.pipe(takeUntil(this.dismissed$), takeUntil(this.destroy$)).subscribe({
      next: () => {
        this.saving = false;
        const wasEditing = this.editingTxId !== null;
        this.closeModal();
        this.toastService.success(successCopy('Transaction', wasEditing ? 'saved' : 'added'));
        this.cdr.markForCheck();
      },
      error: () => {
        this.saving = false;
        this.transactionSaveError = dialogSaveAlert();
        this.cdr.markForCheck();
        this.focusFeedback(focusDialogAlert);
      },
    });
  }

  openTransactionEditor(tx: Transaction): void {
    this.editingTxId = tx.id;
    this.editingImported = tx.source === 'import';
    this.transactionSaveError = '';
    this.originalAmount = tx.amount;
    this.amountDirty = false;
    this.fieldErrors = [];
    this.formSubmitted = false;
    this.newTx = {
      date: tx.date,
      type: tx.type,
      category: tx.category,
      amount: tx.amount,
      description: tx.description || '',
      merchant: tx.merchant || null,
      kind: tx.kind || (tx.type === 'income' ? 'income' : 'purchase'),
      trip_id: normalizeTripId(tx.trip_id),
      ...(tx.reviewed !== undefined ? { reviewed: tx.reviewed } : {}),
    };
    this.loadTripChoices();
    this.showModal = true;
    this.cdr.markForCheck();
  }

  closeModal(): void {
    const wasOpen = this.showModal;
    this.dismiss();
    if (wasOpen && this.context.back(financeCalendarPath)) return;
    const params = this.route.snapshot.queryParamMap;
    if (params.get('add') === '1' || params.has('edit')) {
      void this.router.navigate([], {
        relativeTo: this.route,
        queryParams: { add: null, edit: null },
        queryParamsHandling: 'merge',
        replaceUrl: true,
      });
    }
    this.cdr.markForCheck();
  }

  dismiss(): void {
    this.dismissed$.next();
    this.tripLoad += 1;
    this.showModal = false;
    this.saving = false;
    this.editingTxId = null;
    this.editingImported = false;
    this.transactionSaveError = '';
    this.originalAmount = null;
    this.fieldErrors = [];
    this.formSubmitted = false;
    this.tripChoices = tripTagChoices(null, null);
    this.tripListNote = '';
    this.newTx = this.emptyTx();
    this.cdr.markForCheck();
  }

  private focusFeedback(focus: (root: HTMLElement | null) => void): void {
    const draft = this.newTx;
    setTimeout(() => {
      if (this.showModal && this.newTx === draft) focus(document.getElementById('transaction-form'));
    });
  }

  private loadTripChoices(): void {
    const request = ++this.tripLoad;
    this.tripListNote = '';
    this.tripHome$.pipe(takeUntil(this.dismissed$), takeUntil(this.destroy$)).subscribe({
      next: home => {
        if (request !== this.tripLoad) return;
        this.applyTripHome(home, this.newTx.trip_id, home === null);
      },
      error: () => {
        if (request !== this.tripLoad) return;
        this.applyTripHome(null, this.newTx.trip_id, true);
      },
    });
  }

  private applyTripHome(home: TripTagHome | null, selected: unknown, failed: boolean): void {
    this.tripChoices = tripTagChoices(home, selected);
    this.tripListNote = failed ? TRIP_LIST_UNAVAILABLE : '';
    this.cdr.markForCheck();
  }

  ngOnDestroy(): void {
    this.dismiss();
    this.dismissed$.complete();
    this.destroy$.next();
    this.destroy$.complete();
  }
}
