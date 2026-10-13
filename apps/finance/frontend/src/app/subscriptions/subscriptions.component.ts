import { ChangeDetectionStrategy, ChangeDetectorRef, Component, Input, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject, takeUntil } from 'rxjs';
import { ConfirmService } from '../services/confirm.service';
import { FinanceService } from '../services/finance.service';
import { ToastService } from '../services/toast.service';
import { FixedExpenseFrequency, Subscription, SubscriptionCreate } from '../models/transaction.model';
import { todayIsoDate } from '../utils/date.util';
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
} from '../shared/ui';

@Component({
  selector: 'app-subscriptions',
  standalone: true,
  imports: [
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
    return this.subscriptions.filter(row => row.is_active).reduce((sum, row) => sum + row.monthly_amount, 0);
  }

  get activeAnnualTotal(): number {
    return this.subscriptions.filter(row => row.is_active).reduce((sum, row) => sum + row.annual_amount, 0);
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
    if (!this.form.name.trim()) {
      this.toast.error('Subscription name is required.');
      return;
    }
    const payload: SubscriptionCreate = {
      ...this.form,
      name: this.form.name.trim(),
      category: this.form.category.trim() || 'Subscriptions',
      amount: Math.round((this.form.amount || 0) * 100) / 100,
      payment_account: this.form.payment_account?.trim() || null,
      notes: this.form.notes?.trim() || '',
    };
    this.saving = true;
    this.saveError = '';
    const wasEditing = this.editingId !== null;
    const req =
      this.editingId !== null
        ? this.finance.updateSubscription(this.editingId, payload)
        : this.finance.addSubscription(payload);
    req.pipe(takeUntil(this.destroy$)).subscribe({
      next: () => {
        this.saving = false;
        this.closeModal();
        this.toast.success(wasEditing ? 'Subscription updated' : 'Subscription added');
        this.cdr.markForCheck();
      },
      error: () => {
        this.saving = false;
        this.saveError = 'This subscription could not be saved. Your details are still here; check your vault and try again.';
        this.cdr.markForCheck();
      },
    });
  }

  async deleteSubscription(row: Subscription): Promise<void> {
    const ok = await this.confirm.ask('Delete subscription?', `Remove ${row.name}?`, 'Delete', 'Cancel');
    if (!ok) return;
    this.finance.deleteSubscription(row.id).pipe(takeUntil(this.destroy$)).subscribe({
      next: () => this.toast.success('Subscription deleted'),
      error: () => this.toast.error('This subscription could not be deleted. Try again.'),
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
