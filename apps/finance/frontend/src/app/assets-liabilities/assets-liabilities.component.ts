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
import { ToastService } from '../services/toast.service';
import { ConfirmService } from '../services/confirm.service';
import { todayIsoDate } from '../utils/date.util';
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
} from '../shared/ui';
import { FormatCategoryPipe } from '../shared/pipes/format-category.pipe';
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
  saving = false;
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
    const value = this.assetForm.current_value;
    if (!this.assetForm.name.trim() || value == null || !Number.isFinite(Number(value)) || Number(value) < 0) {
      this.toastService.error('Name and a non-negative value are required.');
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

  assetDatesSummary(): string {
    return portfolioDateSummary(this.assets.map(row => row.as_of_date));
  }

  liabilityDatesSummary(): string {
    return portfolioDateSummary(this.liabilities.map(row => row.as_of_date));
  }

}
