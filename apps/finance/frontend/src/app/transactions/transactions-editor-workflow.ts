import { ChangeDetectorRef, Injectable, OnDestroy } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { Subject, takeUntil } from 'rxjs';
import { FinanceService } from '../services/finance.service';
import { ToastService } from '@vivek/ui';
import { Transaction, TransactionCreate } from '../models/transaction.model';
import { todayIsoDate } from '@vivek/browser';

@Injectable()
export class TransactionsEditorWorkflow implements OnDestroy {
  showModal = false;
  newTx: TransactionCreate = this.emptyTx();
  editingTxId: number | null = null;
  editingImported = false;
  saving = false;
  transactionSaveError = '';
  private readonly destroy$ = new Subject<void>();

  constructor(
    private financeService: FinanceService,
    private toastService: ToastService,
    private cdr: ChangeDetectorRef,
    private route: ActivatedRoute,
    private router: Router,
  ) {}

  private emptyTx(): TransactionCreate {
    return { date: todayIsoDate(), type: 'expense', category: '', amount: 0, description: '' };
  }

  openAddModal(selectedCalendarDate: string | null): void {
    this.editingTxId = null;
    this.editingImported = false;
    this.newTx = { ...this.emptyTx(), ...(selectedCalendarDate ? { date: selectedCalendarDate } : {}) };
    this.showModal = true;
  }

  saveTransaction(): void {
    if (this.saving) return;
    if (!this.newTx.category?.trim() || this.newTx.amount <= 0) {
      this.toastService.error('Category and a positive amount are required.');
      return;
    }

    this.saving = true;
    this.transactionSaveError = '';
    const payload: TransactionCreate = {
      ...this.newTx,
      category: this.newTx.category.trim(),
      amount: Math.round(this.newTx.amount * 100) / 100,
    };
    const request = this.editingTxId !== null
      ? this.financeService.updateTransaction(this.editingTxId, payload)
      : this.financeService.addTransaction(payload);

    request.pipe(takeUntil(this.destroy$)).subscribe({
      next: () => {
        this.saving = false;
        const wasEditing = this.editingTxId !== null;
        this.closeModal();
        this.toastService.success(wasEditing ? 'Transaction updated' : 'Transaction added');
        this.cdr.markForCheck();
      },
      error: () => {
        this.saving = false;
        this.transactionSaveError = 'Could not save this transaction. Your changes are still here; try again.';
        this.toastService.error('Could not save transaction. Your changes are still here; try again.');
        this.cdr.markForCheck();
      },
    });
  }

  openTransactionEditor(tx: Transaction): void {
    this.editingTxId = tx.id;
    this.editingImported = tx.source === 'import';
    this.transactionSaveError = '';
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
