import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  Input,
  OnDestroy,
  OnInit,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject, takeUntil } from 'rxjs';
import { ConfirmService } from '@vivek/ui';
import { FinanceService } from '../services/finance.service';
import { ToastService } from '@vivek/ui';
import {
  FixedExpense,
  FixedExpenseCreate,
  FixedExpenseFrequency,
} from '../models/transaction.model';
import { todayIsoDate } from '@vivek/browser';
import {
  UiBadgeComponent,
  UiButtonComponent,
  UiCardComponent,
  UiDataTableComponent,
  UiEmptyStateComponent,
  UiIconComponent,
  UiPageHeaderComponent,
  UiSelectComponent,
  UiSelectOption,
  UiDialogComponent,
} from '@vivek/ui';
import { InfoTipComponent } from '../shared/info-tip.component';

@Component({
  selector: 'app-fixed-expenses',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    UiPageHeaderComponent,
    UiButtonComponent,
    UiCardComponent,
    UiDataTableComponent,
    UiEmptyStateComponent,
    UiIconComponent,
    UiSelectComponent,
    UiBadgeComponent,
    UiDialogComponent,
    InfoTipComponent,
  ],
  templateUrl: './fixed-expenses.component.html',
  styleUrl: './fixed-expenses.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FixedExpensesComponent implements OnInit, OnDestroy {
  @Input() embedded = false;
  @Input() editorOnly = false;
  expenses: FixedExpense[] = [];
  showModal = false;
  saving = false;
  saveError = '';
  editingId: number | null = null;
  form: FixedExpenseCreate = this.emptyForm();

  readonly frequencyOptions: UiSelectOption[] = [
    { value: 'monthly', label: 'Monthly' },
    { value: 'annual', label: 'Annual' },
    { value: 'quarterly', label: 'Quarterly' },
    { value: 'biweekly', label: 'Every two weeks' },
    { value: 'weekly', label: 'Weekly' },
  ];

  readonly categoryOptions = ['Rent', 'Utilities', 'Insurance', 'Subscriptions', 'Debt', 'Other'];

  private destroy$ = new Subject<void>();

  constructor(
    private financeService: FinanceService,
    private confirmService: ConfirmService,
    private toastService: ToastService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    this.financeService.fixedExpenses$.pipe(takeUntil(this.destroy$)).subscribe(rows => {
      this.expenses = rows;
      this.cdr.markForCheck();
    });
    if (!this.editorOnly) this.financeService.getFixedExpenses().pipe(takeUntil(this.destroy$)).subscribe();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  get activeMonthlyTotal(): number {
    return this.expenses
      .filter(row => row.is_active)
      .reduce((sum, row) => sum + row.monthly_amount, 0);
  }

  get activeAnnualTotal(): number {
    return this.expenses
      .filter(row => row.is_active)
      .reduce((sum, row) => sum + row.annual_amount, 0);
  }

  private emptyForm(): FixedExpenseCreate {
    return {
      name: '',
      category: 'Rent',
      amount: 0,
      frequency: 'monthly',
      start_date: todayIsoDate(),
      end_date: null,
      due_day: null,
      autopay: false,
      payment_account: '',
      is_active: true,
      notes: '',
    };
  }

  openAddModal(): void {
    this.editingId = null;
    this.form = this.emptyForm();
    this.saveError = '';
    this.showModal = true;
    this.cdr.markForCheck();
  }

  openEditModal(row: FixedExpense): void {
    this.editingId = row.id;
    this.form = {
      name: row.name,
      category: row.category,
      amount: row.amount,
      frequency: row.frequency as FixedExpenseFrequency,
      start_date: row.start_date,
      end_date: row.end_date || null,
      due_day: row.due_day || null,
      autopay: row.autopay,
      payment_account: row.payment_account || '',
      is_active: row.is_active,
      notes: row.notes || '',
    };
    this.saveError = '';
    this.showModal = true;
    this.cdr.markForCheck();
  }

  closeModal(): void {
    this.showModal = false;
    this.editingId = null;
    this.form = this.emptyForm();
    this.saveError = '';
    this.cdr.markForCheck();
  }

  saveExpense(): void {
    if (!this.form.name.trim() || !this.form.category.trim()) {
      this.toastService.error('Name and category are required.');
      return;
    }
    if (this.form.amount < 0) {
      this.toastService.error('Amount must be non-negative.');
      return;
    }
    this.saving = true;
    this.saveError = '';
    const wasEditing = this.editingId !== null;
    const payload: FixedExpenseCreate = {
      ...this.form,
      name: this.form.name.trim(),
      category: this.form.category.trim(),
      amount: Math.round((this.form.amount || 0) * 100) / 100,
      due_day: this.form.due_day || null,
      payment_account: this.form.payment_account?.trim() || null,
      notes: this.form.notes?.trim() || '',
    };
    const request =
      this.editingId !== null
        ? this.financeService.updateFixedExpense(this.editingId, payload)
        : this.financeService.addFixedExpense(payload);
    request.pipe(takeUntil(this.destroy$)).subscribe({
      next: () => {
        this.saving = false;
        this.closeModal();
        this.toastService.success(wasEditing ? 'Bill updated' : 'Bill added');
        this.cdr.markForCheck();
      },
      error: () => {
        this.saving = false;
        this.saveError = 'This bill could not be saved. Your details are still here; check your vault and try again.';
        this.cdr.markForCheck();
      },
    });
  }

  async deleteExpense(row: FixedExpense): Promise<void> {
    const ok = await this.confirmService.ask(
      'Delete fixed expense?',
      `Remove ${row.name} from bills?`,
      'Delete',
      'Cancel'
    );
    if (!ok) return;
    this.financeService.deleteFixedExpense(row.id).pipe(takeUntil(this.destroy$)).subscribe({
      next: () => this.toastService.success('Fixed expense deleted'),
      error: () => this.toastService.error('This bill could not be deleted. Try again.'),
    });
  }

  frequencyLabel(value: string): string {
    return this.frequencyOptions.find(option => option.value === value)?.label || value;
  }
}
