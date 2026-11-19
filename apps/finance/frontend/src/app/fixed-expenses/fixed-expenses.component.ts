import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  OnDestroy,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Subject, takeUntil } from 'rxjs';
import { FinanceService } from '../services/finance.service';
import { ToastService, UiFieldComponent, UiFieldControlDirective, successCopy } from '@vivek/ui';
import {
  FixedExpense,
  FixedExpenseCreate,
  FixedExpenseFrequency,
} from '../models/transaction.model';
import { todayIsoDate, toDollars } from '@vivek/browser';
import { validateBill, validateMoney, type FieldIssue } from '../utils/validators';
import {
  UiButtonComponent,
  UiSelectComponent,
  UiSelectOption,
  UiDialogComponent,
} from '@vivek/ui';
import { dialogSaveAlert, fieldMessage, focusDialogAlert, focusErrorSummary, focusField } from '../shared/form-validation';

@Component({
  selector: 'app-fixed-expenses',
  standalone: true,
  imports: [FormsModule, UiButtonComponent, UiSelectComponent, UiDialogComponent, UiFieldComponent, UiFieldControlDirective],
  templateUrl: './fixed-expenses.component.html',
  styleUrls: ['./fixed-expenses.component.css', '../shared/recurring-editor.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FixedExpensesComponent implements OnDestroy {
  showModal = false;
  saving = false;
  saveError = '';
  fieldErrors: FieldIssue[] = [];
  formSubmitted = false;
  editingId: number | null = null;
  moreOptionsOpen = false;
  form: FixedExpenseCreate = this.emptyForm();

  readonly frequencyOptions: UiSelectOption[] = [
    { value: 'monthly', label: 'Monthly' },
    { value: 'annual', label: 'Annual' },
    { value: 'quarterly', label: 'Quarterly' },
    { value: 'biweekly', label: 'Every two weeks' },
    { value: 'weekly', label: 'Weekly' },
  ];

  readonly categoryOptions = ['Rent', 'Utilities', 'Insurance', 'Subscriptions', 'Debt', 'Other'];

  private readonly dismiss$ = new Subject<void>();

  constructor(
    private financeService: FinanceService,
    private toastService: ToastService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnDestroy(): void {
    this.dismiss$.next();
    this.dismiss$.complete();
    this.showModal = false;
    this.form = this.emptyForm();
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
    this.clearValidation();
    this.moreOptionsOpen = false;
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
    this.clearValidation();
    this.moreOptionsOpen = billHasOptions(row);
    this.showModal = true;
    this.cdr.markForCheck();
  }

  onMoreToggle(event: Event): void {
    if (event.target !== event.currentTarget) return;
    this.moreOptionsOpen = (event.currentTarget as HTMLDetailsElement).open;
    this.cdr.markForCheck();
  }

  cancel(): void {
    if (!this.saving) this.closeModal();
  }

  closeModal(): void {
    this.dismiss$.next();
    this.saving = false;
    this.showModal = false;
    this.editingId = null;
    this.form = this.emptyForm();
    this.moreOptionsOpen = false;
    this.clearValidation();
    this.cdr.markForCheck();
  }

  private clearValidation(): void {
    this.saveError = '';
    this.fieldErrors = [];
    this.formSubmitted = false;
  }

  saveExpense(): void {
    if (this.saving || !this.showModal) return;
    const draft = this.form;
    const errors = this.billIssues();
    this.fieldErrors = errors;
    this.formSubmitted = true;
    if (errors.length) {
      if (errors.some(error => error.field === 'dueDay')) this.moreOptionsOpen = true;
      this.cdr.markForCheck();
      setTimeout(() => { if (this.form === draft && this.showModal) focusErrorSummary(document.getElementById('bill-form')); });
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
    request.pipe(takeUntil(this.dismiss$)).subscribe({
      next: () => {
        this.saving = false;
        this.closeModal();
        this.toastService.success(successCopy('Bill', wasEditing ? 'saved' : 'added'));
        this.cdr.markForCheck();
      },
      error: () => {
        this.saving = false;
        this.saveError = dialogSaveAlert();
        setTimeout(() => { if (this.form === draft && this.showModal) focusDialogAlert(document.getElementById('bill-form')); });
        this.cdr.markForCheck();
      },
    });
  }
}

function billHasOptions(row: FixedExpense): boolean {
  return Boolean(row.due_day || row.end_date || row.payment_account?.trim() || row.notes?.trim() || row.autopay);
}
