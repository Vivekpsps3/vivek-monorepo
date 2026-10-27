import { ChangeDetectorRef, Injectable, OnDestroy } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { Subject, takeUntil } from 'rxjs';
import { FinanceService } from '../services/finance.service';
import { ToastService, successCopy } from '@vivek/ui';
import { Transaction, TransactionCreate } from '../models/transaction.model';
import { todayIsoDate, toDollars } from '@vivek/browser';
import { validateMoney, validateTransaction, type FieldIssue } from '../utils/validators';
import { dialogSaveAlert, fieldMessage, focusDialogAlert, focusErrorSummary } from '../shared/form-validation';

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
  private originalAmount: number | null = null;
  private amountDirty = false;
  private readonly destroy$ = new Subject<void>();

  constructor(
    private financeService: FinanceService,
    private toastService: ToastService,
    private cdr: ChangeDetectorRef,
    private route: ActivatedRoute,
    private router: Router,
  ) {}

  private emptyTx(): TransactionCreate {
    return { date: todayIsoDate(), type: 'expense', category: '', amount: '' as unknown as number, description: '' };
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
      setTimeout(() => focusErrorSummary(document.getElementById('transaction-form')));
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
    };
    const request = this.editingTxId !== null
      ? this.financeService.updateTransaction(this.editingTxId, payload, true)
      : this.financeService.addTransaction(payload, true);

    request.pipe(takeUntil(this.destroy$)).subscribe({
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
        setTimeout(() => focusDialogAlert(document.getElementById('transaction-form')));
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
      ...(tx.reviewed !== undefined ? { reviewed: tx.reviewed } : {}),
    };
    this.showModal = true;
    this.cdr.markForCheck();
  }

  closeModal(): void {
    this.showModal = false;
    this.editingTxId = null;
    this.editingImported = false;
    this.transactionSaveError = '';
    this.newTx = this.emptyTx();
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

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }
}
