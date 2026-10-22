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
import { FinanceService } from '../services/finance.service';
import {
  Asset,
  AssetCreate,
  Liability,
  LiabilityCreate,
  NetWorth,
} from '../models/transaction.model';
import { ConfirmService, ToastService, UiBadgeComponent, UiFieldComponent, UiFieldControlDirective, failureCopy, successCopy } from '@vivek/ui';
import { amountProblem, excludedAmountNote, todayIsoDate, toDollars, validateAsset, validateDebt, validateMoney, type FieldIssue } from '@vivek/browser';
import {
  UiButtonComponent,
  UiCardComponent,
  UiEmptyStateComponent,
  UiPageHeaderComponent,
  UiSelectComponent,
  UiSelectOption,
  UiDataTableComponent,
  UiDialogComponent,
  UiIconComponent,
} from '@vivek/ui';
import { FormatCategoryPipe } from '../shared/pipes/format-category.pipe';
import { MoneyPipe } from '../shared/pipes/money.pipe';
import { AppDatePipe } from '../shared/pipes/app-date.pipe';
import { errorSummary, fieldMessage, focusField, focusFirstInvalid } from '../shared/form-validation';
import { InfoTipComponent } from '../shared/info-tip.component';
import { portfolioDateSummary } from '../utils/portfolio.util';

@Component({
  selector: 'app-assets-liabilities',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    UiPageHeaderComponent,
    UiButtonComponent,
    UiCardComponent,
    UiEmptyStateComponent,
    UiSelectComponent,
    UiDataTableComponent,
    UiDialogComponent,
    UiIconComponent,
    UiBadgeComponent,
    UiFieldComponent,
    UiFieldControlDirective,
    FormatCategoryPipe,
    MoneyPipe,
    AppDatePipe,
    InfoTipComponent,
  ],
  templateUrl: './assets-liabilities.component.html',
  styleUrl: './assets-liabilities.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AssetsLiabilitiesComponent implements OnInit, OnDestroy {
  @Input() embedded = false;
  assets: Asset[] = [];
  liabilities: Liability[] = [];
  netWorth: NetWorth | null = null;
  showAssetModal = false;
  showLiabilityModal = false;
  saving = false;
  assetErrors: FieldIssue[] = [];
  liabilityErrors: FieldIssue[] = [];
  assetSubmitted = false;
  liabilitySubmitted = false;
  readonly amountProblem = amountProblem;
  readonly errorSummary = errorSummary;
  editingAssetId: number | null = null;
  editingLiabilityId: number | null = null;
  assetForm: AssetCreate = this.emptyAsset();
  liabilityForm: LiabilityCreate = this.emptyLiability();

  readonly assetCategoryOptions: UiSelectOption[] = [
    { value: 'cash', label: 'Cash' },
    { value: 'checking', label: 'Checking' },
    { value: 'savings', label: 'Savings' },
    { value: 'real_estate', label: 'Real estate' },
    { value: 'vehicle', label: 'Vehicle' },
    { value: 'other', label: 'Other' },
  ];

  readonly liabilityCategoryOptions: UiSelectOption[] = [
    { value: 'mortgage', label: 'Mortgage' },
    { value: 'auto_loan', label: 'Auto loan' },
    { value: 'student_loan', label: 'Student loan' },
    { value: 'credit_card', label: 'Credit card' },
    { value: 'personal_loan', label: 'Personal loan' },
    { value: 'other', label: 'Other' },
  ];

  private destroy$ = new Subject<void>();

  constructor(
    private financeService: FinanceService,
    private toastService: ToastService,
    private confirmService: ConfirmService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit() {
    this.financeService.assets$.pipe(takeUntil(this.destroy$)).subscribe(data => {
      this.assets = data;
      this.cdr.markForCheck();
    });
    this.financeService.liabilities$.pipe(takeUntil(this.destroy$)).subscribe(data => {
      this.liabilities = data;
      this.cdr.markForCheck();
    });
    this.financeService.netWorth$.pipe(takeUntil(this.destroy$)).subscribe(nw => {
      this.netWorth = nw;
      this.cdr.markForCheck();
    });
    this.financeService.getAssets().pipe(takeUntil(this.destroy$)).subscribe();
    this.financeService.getLiabilities().pipe(takeUntil(this.destroy$)).subscribe();
    this.financeService.getNetWorth().pipe(takeUntil(this.destroy$)).subscribe();
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private emptyAsset(): AssetCreate {
    return {
      name: '',
      category: 'checking',
      current_value: 0,
      as_of_date: todayIsoDate(),
      review_interval_days: null,
      notes: '',
    };
  }

  private emptyLiability(): LiabilityCreate {
    return {
      name: '',
      category: 'credit_card',
      balance_owed: 0,
      as_of_date: todayIsoDate(),
      review_interval_days: null,
      notes: '',
    };
  }

  openAddAsset() {
    this.editingAssetId = null;
    this.assetForm = this.emptyAsset();
    this.showAssetModal = true;
  }

  openEditAsset(row: Asset) {
    this.editingAssetId = row.id;
    this.assetForm = {
      name: row.name,
      category: row.category,
      current_value: row.current_value,
      as_of_date: row.as_of_date,
      review_interval_days: row.review_interval_days ?? null,
      notes: row.notes || '',
    };
    this.showAssetModal = true;
  }

  openAddLiability() {
    this.editingLiabilityId = null;
    this.liabilityForm = this.emptyLiability();
    this.showLiabilityModal = true;
  }

  openEditLiability(row: Liability) {
    this.editingLiabilityId = row.id;
    this.liabilityForm = {
      name: row.name,
      category: row.category,
      balance_owed: row.balance_owed,
      as_of_date: row.as_of_date,
      review_interval_days: row.review_interval_days ?? null,
      notes: row.notes || '',
    };
    this.showLiabilityModal = true;
  }

  closeModals() {
    this.showAssetModal = false;
    this.showLiabilityModal = false;
  }

  saveAsset() {
    if (this.saving) return;
    const errors = validateAsset({ name: this.assetForm.name, value: this.assetForm.current_value });
    this.assetErrors = errors;
    this.assetSubmitted = true;
    if (errors.length) {
      this.cdr.markForCheck();
      setTimeout(() => focusFirstInvalid(document.getElementById('asset-form')));
      return;
    }
    const parsed = validateMoney(this.assetForm.current_value, {
      allowZero: true,
      negativeMessage: 'Enter a value of $0 or more.',
      emptyMessage: 'Enter a value of $0 or more.',
    });
    if (!('cents' in parsed)) return;
    this.saving = true;
    const payload = {
      ...this.assetForm,
      name: this.assetForm.name.trim(),
      current_value: toDollars(parsed.cents),
    };
    const req =
      this.editingAssetId !== null
        ? this.financeService.updateAsset(this.editingAssetId, payload)
        : this.financeService.addAsset(payload);
    req.pipe(takeUntil(this.destroy$)).subscribe({
      next: () => {
        this.saving = false;
        this.closeModals();
        this.toastService.success(successCopy('Asset', this.editingAssetId ? 'saved' : 'added'));
        this.cdr.markForCheck();
      },
      error: () => {
        this.saving = false;
        this.toastService.error(failureCopy('save', 'this asset', 'Try again.'), {
          label: 'Try again',
          run: () => this.saveAsset(),
        });
        this.cdr.markForCheck();
      },
    });
  }

  saveLiability() {
    if (this.saving) return;
    const errors = validateDebt({ name: this.liabilityForm.name, amount: this.liabilityForm.balance_owed });
    this.liabilityErrors = errors;
    this.liabilitySubmitted = true;
    if (errors.length) {
      this.cdr.markForCheck();
      setTimeout(() => focusFirstInvalid(document.getElementById('liability-form')));
      return;
    }
    const parsed = validateMoney(this.liabilityForm.balance_owed, {
      allowZero: true,
      negativeMessage: 'Enter what you owe as a positive amount.',
      emptyMessage: 'Enter what you owe as a positive amount.',
    });
    if (!('cents' in parsed)) return;
    this.saving = true;
    const payload = {
      ...this.liabilityForm,
      name: this.liabilityForm.name.trim(),
      balance_owed: toDollars(parsed.cents),
    };
    const req =
      this.editingLiabilityId !== null
        ? this.financeService.updateLiability(this.editingLiabilityId, payload)
        : this.financeService.addLiability(payload);
    req.pipe(takeUntil(this.destroy$)).subscribe({
      next: () => {
        this.saving = false;
        this.closeModals();
        this.toastService.success(successCopy('Debt', this.editingLiabilityId ? 'saved' : 'added'));
        this.cdr.markForCheck();
      },
      error: () => {
        this.saving = false;
        this.toastService.error(failureCopy('save', 'this debt', 'Try again.'), {
          label: 'Try again',
          run: () => this.saveLiability(),
        });
        this.cdr.markForCheck();
      },
    });
  }

  async deleteAsset(row: Asset) {
    const ok = await this.confirmService.ask(
      'Delete asset?',
      `Remove ${row.name} from your balance sheet?`,
      'Delete',
      'Cancel'
    );
    if (!ok) return;
    this.financeService.deleteAsset(row.id).pipe(takeUntil(this.destroy$)).subscribe({
      next: () => this.toastService.success('Asset deleted'),
    });
  }

  async deleteLiability(row: Liability) {
    const ok = await this.confirmService.ask(
      'Delete liability?',
      `Remove ${row.name} from your balance sheet?`,
      'Delete',
      'Cancel'
    );
    if (!ok) return;
    this.financeService.deleteLiability(row.id).pipe(takeUntil(this.destroy$)).subscribe({
      next: () => this.toastService.success('Liability deleted'),
    });
  }

  assetFieldError(field: string): string | null {
    return this.assetSubmitted ? fieldMessage(this.assetErrors, field) : null;
  }

  liabilityFieldError(field: string): string | null {
    return this.liabilitySubmitted ? fieldMessage(this.liabilityErrors, field) : null;
  }

  focusNamed(rootId: string, field: string): void {
    focusField(document.getElementById(rootId), field);
  }

  revalidateAsset(): void {
    if (!this.assetSubmitted) return;
    this.assetErrors = validateAsset({ name: this.assetForm.name, value: this.assetForm.current_value });
    this.cdr.markForCheck();
  }

  revalidateLiability(): void {
    if (!this.liabilitySubmitted) return;
    this.liabilityErrors = validateDebt({ name: this.liabilityForm.name, amount: this.liabilityForm.balance_owed });
    this.cdr.markForCheck();
  }

  excludedNote(): string | null {
    return excludedAmountNote(this.netWorth?.excluded_invalid_amounts ?? 0);
  }

  assetDatesSummary(): string {
    return portfolioDateSummary(this.assets.map(row => row.as_of_date));
  }

  liabilityDatesSummary(): string {
    return portfolioDateSummary(this.liabilities.map(row => row.as_of_date));
  }

}
