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
import { forkJoin, Observable, Subject, takeUntil } from 'rxjs';
import { FinanceService } from '../services/finance.service';
import {
  Asset,
  AssetCreate,
  Liability,
  LiabilityCreate,
  NetWorth,
} from '../models/transaction.model';
import { ToastService } from '../services/toast.service';
import { ConfirmService } from '../services/confirm.service';
import { todayIsoDate } from '../utils/date.util';
import {
  UiButtonComponent,
  UiBadgeComponent,
  UiCardComponent,
  UiEmptyStateComponent,
  UiPageHeaderComponent,
  UiSelectComponent,
  UiSelectOption,
  UiDataTableComponent,
  UiDialogComponent,
  UiIconComponent,
} from '../shared/ui';
import { FormatCategoryPipe } from '../shared/pipes/format-category.pipe';
import {
  assetReviewIntervalDays,
  assetReviewState,
  liabilityReviewIntervalDays,
  liabilityReviewState,
  portfolioDateSummary,
  ReviewState,
} from '../utils/portfolio.util';

interface BalanceReviewRow {
  key: string;
  kind: 'asset' | 'liability';
  id: number;
  name: string;
  amount: number;
  originalAmount: number;
  asOfDate: string;
  intervalDays: number;
  intervalInput: number | null;
  initialIntervalInput: number | null;
  confirmedUnchanged: boolean;
  amountChanged: boolean;
}

@Component({
  selector: 'app-assets-liabilities',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    UiPageHeaderComponent,
    UiButtonComponent,
    UiBadgeComponent,
    UiCardComponent,
    UiEmptyStateComponent,
    UiSelectComponent,
    UiDataTableComponent,
    UiDialogComponent,
    UiIconComponent,
    FormatCategoryPipe,
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
  showBalanceReview = false;
  saving = false;
  balanceReviewRows: BalanceReviewRow[] = [];
  balanceReviewDate = todayIsoDate();
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
    this.showBalanceReview = false;
  }

  saveAsset() {
    if (this.saving) return;
    const value = this.assetForm.current_value;
    if (!this.assetForm.name.trim() || value == null || !Number.isFinite(Number(value)) || Number(value) < 0) {
      this.toastService.error('Name and a non-negative value are required.');
      return;
    }
    if (!this.validOptionalInterval(this.assetForm.review_interval_days)) {
      this.toastService.error('Review interval must be a positive whole number of days.');
      return;
    }
    this.saving = true;
    const payload = {
      ...this.assetForm,
      name: this.assetForm.name.trim(),
      current_value: Math.round(Number(value) * 100) / 100,
    };
    const req =
      this.editingAssetId !== null
        ? this.financeService.updateAsset(this.editingAssetId, payload)
        : this.financeService.addAsset(payload);
    req.pipe(takeUntil(this.destroy$)).subscribe({
      next: () => {
        this.saving = false;
        this.closeModals();
        this.toastService.success(this.editingAssetId ? 'Asset updated' : 'Asset added');
        this.cdr.markForCheck();
      },
      error: () => {
        this.saving = false;
        this.toastService.error('Could not save this asset. Please try again.');
        this.cdr.markForCheck();
      },
    });
  }

  saveLiability() {
    if (this.saving) return;
    const balance = this.liabilityForm.balance_owed;
    if (!this.liabilityForm.name.trim() || balance == null || !Number.isFinite(Number(balance)) || Number(balance) < 0) {
      this.toastService.error('Name and a non-negative balance are required.');
      return;
    }
    if (!this.validOptionalInterval(this.liabilityForm.review_interval_days)) {
      this.toastService.error('Review interval must be a positive whole number of days.');
      return;
    }
    this.saving = true;
    const payload = {
      ...this.liabilityForm,
      name: this.liabilityForm.name.trim(),
      balance_owed: Math.round(Number(balance) * 100) / 100,
    };
    const req =
      this.editingLiabilityId !== null
        ? this.financeService.updateLiability(this.editingLiabilityId, payload)
        : this.financeService.addLiability(payload);
    req.pipe(takeUntil(this.destroy$)).subscribe({
      next: () => {
        this.saving = false;
        this.closeModals();
        this.toastService.success(
          this.editingLiabilityId ? 'Liability updated' : 'Liability added'
        );
        this.cdr.markForCheck();
      },
      error: () => {
        this.saving = false;
        this.toastService.error('Could not save this liability. Please try again.');
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

  openBalanceReview() {
    this.balanceReviewDate = todayIsoDate();
    this.balanceReviewRows = [
      ...this.assets.map(row => ({
        key: `asset-${row.id}`,
        kind: 'asset' as const,
        id: row.id,
        name: row.name,
        amount: row.current_value,
        originalAmount: row.current_value,
        asOfDate: row.as_of_date,
        intervalDays: assetReviewIntervalDays(row),
        intervalInput: row.review_interval_days ?? null,
        initialIntervalInput: row.review_interval_days ?? null,
        confirmedUnchanged: false,
        amountChanged: false,
      })),
      ...this.liabilities.map(row => ({
        key: `liability-${row.id}`,
        kind: 'liability' as const,
        id: row.id,
        name: row.name,
        amount: row.balance_owed,
        originalAmount: row.balance_owed,
        asOfDate: row.as_of_date,
        intervalDays: liabilityReviewIntervalDays(row),
        intervalInput: row.review_interval_days ?? null,
        initialIntervalInput: row.review_interval_days ?? null,
        confirmedUnchanged: false,
        amountChanged: false,
      })),
    ];
    this.showBalanceReview = true;
  }

  reviewState(row: BalanceReviewRow): ReviewState {
    const source = row.kind === 'asset'
      ? this.assets.find(item => item.id === row.id)
      : this.liabilities.find(item => item.id === row.id);
    if (!source) return 'unknown';
    const effectiveInterval = this.reviewIntervalForRow(row);
    const age = this.daysSince(row.asOfDate);
    if (age == null || age < 0 || effectiveInterval <= 0) return 'unknown';
    return age >= effectiveInterval ? 'due' : 'current';
  }

  updateReviewAmount(row: BalanceReviewRow) {
    row.amountChanged = Number(row.amount) !== Number(row.originalAmount);
    if (row.amountChanged) row.confirmedUnchanged = false;
  }

  toggleUnchangedConfirmation(row: BalanceReviewRow) {
    if (!row.amountChanged) row.confirmedUnchanged = !row.confirmedUnchanged;
  }

  reviewIntervalChanged(row: BalanceReviewRow) {
    row.intervalDays = this.reviewIntervalForRow(row);
  }

  saveBalanceReview() {
    if (this.saving) return;
    const invalidInterval = this.balanceReviewRows.some(row => {
      const raw = row.intervalInput;
      return raw != null && (!Number.isInteger(Number(raw)) || Number(raw) <= 0);
    });
    if (invalidInterval) {
      this.toastService.error('Review intervals must be positive whole numbers of days.');
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(this.balanceReviewDate)) {
      this.toastService.error('Choose a valid review date.');
      return;
    }
    if (this.balanceReviewRows.some(row => row.amountChanged && (row.amount == null || String(row.amount).trim() === '' || !Number.isFinite(Number(row.amount)) || Number(row.amount) < 0))) {
      this.toastService.error('Balances must be non-negative numbers.');
      return;
    }
    const requests = this.balanceReviewRows.flatMap<Observable<unknown>>(row => {
      const amountChanged = row.amountChanged;
      const confirmed = row.confirmedUnchanged && !amountChanged;
      const intervalChanged = row.intervalInput !== row.initialIntervalInput;
      if (!amountChanged && !confirmed && !intervalChanged) return [];

      const interval = row.intervalInput == null ? null : Number(row.intervalInput);
      const intervalPatch = intervalChanged && (interval == null || Number.isInteger(interval) && interval > 0)
        ? { review_interval_days: interval }
        : {};
      const datePatch = amountChanged || confirmed ? { as_of_date: this.balanceReviewDate } : {};
      if (row.kind === 'asset') {
        return [this.financeService.updateAsset(row.id, {
          ...(amountChanged ? { current_value: Math.round(Number(row.amount) * 100) / 100 } : {}),
          ...datePatch,
          ...intervalPatch,
        })];
      }
      return [this.financeService.updateLiability(row.id, {
        ...(amountChanged ? { balance_owed: Math.round(Number(row.amount) * 100) / 100 } : {}),
        ...datePatch,
        ...intervalPatch,
      })];
    });
    if (!requests.length) {
      return;
    }
    this.saving = true;
    forkJoin(requests).pipe(takeUntil(this.destroy$)).subscribe({
      next: () => {
        this.saving = false;
        this.showBalanceReview = false;
        this.toastService.success(`Reviewed ${requests.length} balance(s)`);
        this.cdr.markForCheck();
      },
      error: () => {
        this.saving = false;
        this.toastService.error('Could not save every reviewed balance. Please review the list and retry.');
        this.cdr.markForCheck();
      },
    });
  }

  assetState(row: Asset): ReviewState {
    return assetReviewState(row);
  }

  liabilityState(row: Liability): ReviewState {
    return liabilityReviewState(row);
  }

  assetInterval(row: Asset): number {
    return assetReviewIntervalDays(row);
  }

  liabilityInterval(row: Liability): number {
    return liabilityReviewIntervalDays(row);
  }

  assetDatesSummary(): string {
    return portfolioDateSummary(this.assets.map(row => row.as_of_date));
  }

  liabilityDatesSummary(): string {
    return portfolioDateSummary(this.liabilities.map(row => row.as_of_date));
  }

  private reviewIntervalForRow(row: BalanceReviewRow): number {
    const override = row.intervalInput == null ? null : Number(row.intervalInput);
    return override != null && Number.isInteger(override) && override > 0
      ? override
      : row.kind === 'liability' || ['cash', 'checking', 'savings'].includes(String(this.assets.find(item => item.id === row.id)?.category || '').toLowerCase())
        ? 30
        : 180;
  }

  private validOptionalInterval(value: number | null | undefined): boolean {
    return value == null || value === ('' as any) || Number.isInteger(Number(value)) && Number(value) > 0;
  }

  private daysSince(date: string | null | undefined): number | null {
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
    const parsed = new Date(date + 'T00:00:00Z');
    const today = new Date(this.balanceReviewDate + 'T00:00:00Z');
    if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date || Number.isNaN(today.getTime())) return null;
    return Math.floor((today.getTime() - parsed.getTime()) / 86_400_000);
  }
}
