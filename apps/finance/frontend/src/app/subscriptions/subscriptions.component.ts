import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnDestroy } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Subject, takeUntil } from 'rxjs';
import { FinanceService } from '../services/finance.service';
import { ToastService, UiFieldComponent, UiFieldControlDirective, successCopy } from '@vivek/ui';
import { Subscription, SubscriptionCreate } from '../models/transaction.model';
import { todayIsoDate, toDollars } from '@vivek/browser';
import { validateMoney, validateSubscription, type FieldIssue } from '../utils/validators';
import {
  UiButtonComponent,
  UiSelectComponent,
  UiSelectOption,
  UiDialogComponent,
} from '@vivek/ui';
import { dialogSaveAlert, fieldMessage, focusDialogAlert, focusErrorSummary, focusField } from '../shared/form-validation';

@Component({
  selector: 'app-subscriptions',
  standalone: true,
  imports: [FormsModule, UiButtonComponent, UiSelectComponent, UiDialogComponent, UiFieldComponent, UiFieldControlDirective],
  templateUrl: './subscriptions.component.html',
  styleUrls: ['./subscriptions.component.css', '../shared/recurring-editor.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SubscriptionsComponent implements OnDestroy {
  showModal = false;
  saving = false;
  saveError = '';
  fieldErrors: FieldIssue[] = [];
  formSubmitted = false;
  editingId: number | null = null;
  moreOptionsOpen = false;
  form: SubscriptionCreate = this.emptyForm();

  readonly frequencyOptions: UiSelectOption[] = [
    { value: 'monthly', label: 'Monthly' },
    { value: 'annual', label: 'Annual' },
    { value: 'quarterly', label: 'Quarterly' },
    { value: 'biweekly', label: 'Every two weeks' },
    { value: 'weekly', label: 'Weekly' },
  ];

  private readonly dismiss$ = new Subject<void>();

  constructor(
    private finance: FinanceService,
    private toast: ToastService,
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
    focusField(document.getElementById('subscription-form'), field);
  }

  revalidate(): void {
    if (!this.formSubmitted) return;
    this.fieldErrors = validateSubscription({ name: this.form.name, amount: this.form.amount });
    this.cdr.markForCheck();
  }

  openAddModal(): void {
    this.editingId = null;
    this.form = this.emptyForm();
    this.clearValidation();
    this.moreOptionsOpen = false;
    this.showModal = true;
    this.cdr.markForCheck();
  }

  openEditModal(row: Subscription): void {
    this.editingId = row.id;
    this.form = {
      name: row.name,
      category: row.category,
      amount: row.amount,
      frequency: row.frequency,
      next_bill_date: row.next_bill_date,
      end_date: row.end_date || null,
      payment_account: row.payment_account || '',
      is_active: row.is_active,
      notes: row.notes || '',
    };
    this.clearValidation();
    this.moreOptionsOpen = subscriptionHasOptions(row);
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

  saveSubscription(): void {
    if (this.saving || !this.showModal) return;
    const draft = this.form;
    const errors = validateSubscription({ name: this.form.name, amount: this.form.amount });
    this.fieldErrors = errors;
    this.formSubmitted = true;
    if (errors.length) {
      this.cdr.markForCheck();
      setTimeout(() => { if (this.form === draft && this.showModal) focusErrorSummary(document.getElementById('subscription-form')); });
      return;
    }
    const parsed = validateMoney(this.form.amount, {
      allowZero: false,
      negativeMessage: 'Enter an amount above $0.',
      emptyMessage: 'Enter an amount above $0.',
    });
    if (!('cents' in parsed)) return;
    const payload: SubscriptionCreate = {
      ...this.form,
      name: this.form.name.trim(),
      category: this.form.category.trim() || 'Subscriptions',
      amount: toDollars(parsed.cents),
      payment_account: this.form.payment_account?.trim() || null,
      notes: this.form.notes?.trim() || '',
    };
    this.saving = true;
    this.saveError = '';
    const wasEditing = this.editingId !== null;
    const req =
      this.editingId !== null
        ? this.finance.updateSubscription(this.editingId, payload, true)
        : this.finance.addSubscription(payload, true);
    req.pipe(takeUntil(this.dismiss$)).subscribe({
      next: () => {
        this.saving = false;
        this.closeModal();
        this.toast.success(successCopy('Subscription', wasEditing ? 'saved' : 'added'));
        this.cdr.markForCheck();
      },
      error: () => {
        this.saving = false;
        this.saveError = dialogSaveAlert();
        this.cdr.markForCheck();
        setTimeout(() => { if (this.form === draft && this.showModal) focusDialogAlert(document.getElementById('subscription-form')); });
      },
    });
  }

  private emptyForm(): SubscriptionCreate {
    return {
      name: '',
      category: 'Subscriptions',
      amount: 0,
      frequency: 'monthly',
      next_bill_date: todayIsoDate(),
      end_date: null,
      payment_account: '',
      is_active: true,
      notes: '',
    };
  }
}

function subscriptionHasOptions(row: { end_date?: string | null; payment_account?: string | null; notes?: string | null; category?: string | null }): boolean {
  return Boolean(row.end_date || row.payment_account?.trim() || row.notes?.trim() || (row.category && row.category !== 'Subscriptions'));
}
