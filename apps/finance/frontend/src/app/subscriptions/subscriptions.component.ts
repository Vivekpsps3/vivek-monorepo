import { ChangeDetectionStrategy, ChangeDetectorRef, Component, Input, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject, takeUntil } from 'rxjs';
import { ConfirmService } from '@vivek/ui';
import { FinanceService } from '../services/finance.service';
import { ToastService, UiFieldComponent, UiFieldControlDirective, failureCopy, successCopy } from '@vivek/ui';
import { FixedExpenseFrequency, Subscription, SubscriptionCreate } from '../models/transaction.model';
import { amountProblem, countableCents, dollarsFromCountedCents, needsFixing, todayIsoDate, toDollars, validateMoney, validateSubscription, type FieldIssue } from '@vivek/browser';
import {
  UiBadgeComponent,
  UiButtonComponent,
  UiCardComponent,
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
  selector: 'app-subscriptions',
  standalone: true,
  imports: [
    AppDatePipe,
    MoneyPipe,
    CommonModule,
    FormsModule,
    UiPageHeaderComponent,
    UiButtonComponent,
    UiCardComponent,
    UiEmptyStateComponent,
    UiIconComponent,
    UiSelectComponent,
    UiBadgeComponent,
    UiDialogComponent,
    UiFieldComponent,
    UiFieldControlDirective,
    InfoTipComponent,
  ],
  templateUrl: './subscriptions.component.html',
  styleUrl: './subscriptions.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SubscriptionsComponent implements OnInit, OnDestroy {
  @Input() embedded = false;
  @Input() editorOnly = false;
  subscriptions: Subscription[] = [];
  showModal = false;
  saving = false;
  saveError = '';
  fieldErrors: FieldIssue[] = [];
  formSubmitted = false;
  readonly amountProblem = amountProblem;
  readonly needsFixing = needsFixing;
  editingId: number | null = null;
  form: SubscriptionCreate = this.emptyForm();

  readonly frequencyOptions: UiSelectOption[] = [
    { value: 'monthly', label: 'Monthly' },
    { value: 'annual', label: 'Annual' },
    { value: 'quarterly', label: 'Quarterly' },
    { value: 'biweekly', label: 'Every two weeks' },
    { value: 'weekly', label: 'Weekly' },
  ];

  private destroy$ = new Subject<void>();

  constructor(
    private finance: FinanceService,
    private confirm: ConfirmService,
    private toast: ToastService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    this.finance.subscriptions$.pipe(takeUntil(this.destroy$)).subscribe(rows => {
      this.subscriptions = rows;
      this.cdr.markForCheck();
    });
    if (!this.editorOnly) this.finance.getSubscriptions().pipe(takeUntil(this.destroy$)).subscribe();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  get activeMonthlyTotal(): number {
    return countedTotal(this.subscriptions.filter(row => row.is_active).map(row => row.monthly_amount));
  }

  get activeAnnualTotal(): number {
    return countedTotal(this.subscriptions.filter(row => row.is_active).map(row => row.annual_amount));
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
    this.saveError = '';
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

  saveSubscription(): void {
    if (this.saving) return;
    const errors = validateSubscription({ name: this.form.name, amount: this.form.amount });
    this.fieldErrors = errors;
    this.formSubmitted = true;
    if (errors.length) {
      this.cdr.markForCheck();
      setTimeout(() => focusErrorSummary(document.getElementById('subscription-form')));
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
    req.pipe(takeUntil(this.destroy$)).subscribe({
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
        setTimeout(() => focusDialogAlert(document.getElementById('subscription-form')));
        this.cdr.markForCheck();
      },
    });
  }

  async deleteSubscription(row: Subscription): Promise<void> {
    const ok = await this.confirm.ask('Delete subscription?', `Remove ${row.name}?`, 'Delete', 'Cancel');
    if (!ok) return;
    this.finance.deleteSubscription(row.id, true).pipe(takeUntil(this.destroy$)).subscribe({
      next: () => this.toast.success('Subscription deleted'),
      error: () => this.toast.error(failureCopy('delete', 'this subscription'), {
        label: 'Try again',
        run: () => this.deleteSubscription(row),
      }),
    });
  }

  frequencyLabel(value: FixedExpenseFrequency): string {
    return this.frequencyOptions.find(option => option.value === value)?.label || value;
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

function countedTotal(values: unknown[]): number {
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
