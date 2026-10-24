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
import { ToastService, UiFieldControlDirective, failureCopy, successCopy } from '@vivek/ui';
import {
  FixedExpense,
  FixedExpenseCreate,
  FixedExpenseFrequency,
} from '../models/transaction.model';
import { countableCents, dollarsFromCountedCents, needsFixing, todayIsoDate, toDollars, validateBill, validateMoney, type FieldIssue } from '@vivek/browser';
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
import { dialogSaveAlert, fieldMessage, focusDialogAlert, focusErrorSummary, focusField } from '../shared/form-validation';
import { MoneyPipe } from '../shared/pipes/money.pipe';
import { AppDatePipe } from '../shared/pipes/app-date.pipe';

@Component({
  selector: 'app-fixed-expenses',
  standalone: true,
  imports: [
    AppDatePipe,
    MoneyPipe,
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
    UiFieldControlDirective,
    UiFieldControlDirective,
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
  fieldErrors: FieldIssue[] = [];
  formSubmitted = false;
  readonly needsFixing = needsFixing;
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
    return countedBillTotal(this.expenses.filter(row => row.is_active).map(row => row.monthly_amount));
  }

  get activeAnnualTotal(): number {
    return countedBillTotal(this.expenses.filter(row => row.is_active).map(row => row.annual_amount));
  }

  fieldError(field: string): string | null {
    return this.formSubmitted ? fieldMessage(this.fieldErrors, field) : null;
  }

  focusNamed(field: string): void {
    focusField(document.getElementById('bill-form'), field);
  }

  revalidate(): void {
    if (!this.formSubmitted) return;
    this.fieldErrors = this.billIssues();
    this.cdr.markForCheck();
  }

  private billIssues(): FieldIssue[] {
    return validateBill({
      name: this.form.name,
      category: this.form.category,
      amount: this.form.amount,
      dueDay: this.form.due_day,
    });
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
    if (this.saving) return;
    const errors = this.billIssues();
    this.fieldErrors = errors;
    this.formSubmitted = true;
    if (errors.length) {
      this.cdr.markForCheck();
      setTimeout(() => focusErrorSummary(document.getElementById('bill-form')));
      return;
    }
    const parsed = validateMoney(this.form.amount, {
      allowZero: false,
      negativeMessage: 'Enter an amount above $0.',
      emptyMessage: 'Enter an amount above $0.',
    });
    if (!('cents' in parsed)) return;
    this.saving = true;
    this.saveError = '';
    const wasEditing = this.editingId !== null;
    const payload: FixedExpenseCreate = {
      ...this.form,
      name: this.form.name.trim(),
      category: this.form.category.trim(),
      amount: toDollars(parsed.cents),
      due_day: this.form.due_day || null,
      payment_account: this.form.payment_account?.trim() || null,
      notes: this.form.notes?.trim() || '',
    };
    const request =
      this.editingId !== null
        ? this.financeService.updateFixedExpense(this.editingId, payload, true)
        : this.financeService.addFixedExpense(payload, true);
    request.pipe(takeUntil(this.destroy$)).subscribe({
      next: () => {
        this.saving = false;
        this.closeModal();
        this.toastService.success(successCopy('Bill', wasEditing ? 'saved' : 'added'));
        this.cdr.markForCheck();
      },
      error: () => {
        this.saving = false;
        this.saveError = dialogSaveAlert();
        setTimeout(() => focusDialogAlert(document.getElementById('bill-form')));
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
    this.financeService.deleteFixedExpense(row.id, true).pipe(takeUntil(this.destroy$)).subscribe({
      next: () => this.toastService.success('Bill deleted'),
      error: () => this.toastService.error(failureCopy('delete', 'this bill'), {
        label: 'Try again',
        run: () => { void this.deleteExpense(row); },
      }),
    });
  }

  frequencyLabel(value: string): string {
    return this.frequencyOptions.find(option => option.value === value)?.label || value;
  }
}

function countedBillTotal(values: unknown[]): number {
  let cents = 0;
  for (const value of values) {
    if (needsFixing(value, 'positive')) continue;
    const part = countableCents(value, 'positive');
    if (part == null) continue;
    cents += part;
  }
  const dollars = dollarsFromCountedCents(cents);
  return Number.isFinite(dollars) ? dollars : 0;
}
