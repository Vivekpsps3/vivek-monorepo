import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  Input,
  OnDestroy,
  OnInit,
} from '@angular/core';
import { CommonModule, KeyValuePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject, takeUntil } from 'rxjs';
import { FinanceService } from '../services/finance.service';
import {
  Holding,
  HoldingCreate,
  MarketPriceQuote,
  NetWorth,
  FidelityPreviewResult,
  FidelityCommitResult,
} from '../models/transaction.model';
import { ToastService } from '@vivek/ui';
import { MarketRefreshCoordinatorService } from '../services/market-refresh-coordinator.service';
import { ConfirmService } from '@vivek/ui';
import { downloadCsv, formatDate, formatMoney, fromDollars, plural, todayIsoDate, unitPriceToNumber, validateHolding, validateUnitPrice, type FieldIssue } from '@vivek/browser';
import { failureCopy, successCopy } from '@vivek/ui';
import { dialogSaveAlert, focusDialogAlert, focusFirstInvalid } from '../shared/form-validation';
import {
  holdingGain,
  holdingGainPercent,
  hasUnvaluedPositions,
  actualQuoteDate,
  portfolioDateSummary,
  quoteFreshness,
  quoteFreshnessLabel,
  totalPortfolioGain,
  totalPortfolioValue,
} from '../utils/portfolio.util';
import {
  FidelityAccountReplacementPreview,
  FidelityStageRecord,
  replacementPreviewForAccounts,
} from '../utils/fidelity-import.util';
import {
  UiBadgeComponent,
  UiBadgeVariant,
  UiButtonComponent,
  UiCardComponent,
  UiEmptyStateComponent,
  UiPageHeaderComponent,
  UiDataTableComponent,
  UiDialogComponent,
} from '@vivek/ui';
import { InfoTipComponent } from '../shared/info-tip.component';
import { MoneyPipe } from '../shared/pipes/money.pipe';
import { PluralPipe } from '../shared/pipes/plural.pipe';

@Component({
  selector: 'app-portfolio',
  standalone: true,
  imports: [
    PluralPipe,
    MoneyPipe,
    CommonModule,
    KeyValuePipe,
    FormsModule,
    UiPageHeaderComponent,
    UiButtonComponent,
    UiCardComponent,
    UiBadgeComponent,
    UiEmptyStateComponent,
    UiDataTableComponent,
    UiDialogComponent,
    InfoTipComponent,
  ],
  templateUrl: './portfolio.component.html',
  styleUrl: './portfolio.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PortfolioComponent implements OnInit, OnDestroy {
  @Input() embedded = false;
  holdings: Holding[] = [];
  filteredHoldings: Holding[] = [];
  netWorth: NetWorth | null = null;
  searchTerm = '';
  showModal = false;
  saving = false;
  loading = false;
  refreshingPrices = false;
  holdingsLoadError: string | null = null;
  checkingPrice = false;
  priceCheck: MarketPriceQuote | null = null;
  priceCheckError = '';

  // Fidelity import state (modeled on Transactions import)
  showFidelityImportModal = false;
  fidelityImportStep: 'upload' | 'preview' = 'upload';
  fidelityImportFile: File | null = null;
  fidelityImportError = '';
  fidelityImportPreview: FidelityPreviewResult | null = null;
  fidelityImportParsing = false;
  fidelityImportCommitting = false;
  selectedFidelityAccounts = new Set<string>();  // use account_mask for selected replaces
  fidelityAccountReplacements: FidelityAccountReplacementPreview[] = [];
  knownBrokerageAccounts: Array<{ id: number; broker_slug: string; broker_name: string; account_mask: string; account_name?: string; nickname?: string | null; label?: string | null }> = [];
  resumableFidelityStages: FidelityStageRecord[] = [];
  editingId: number | null = null;
  newHolding: HoldingCreate = this.emptyHolding();

  // Nickname editing
  editingNicknameFor: number | null = null;
  nicknameDraft: string = '';

  private destroy$ = new Subject<void>();
  private destroyed = false;

  constructor(
    private financeService: FinanceService,
    private marketRefresh: MarketRefreshCoordinatorService,
    private toastService: ToastService,
    private confirmService: ConfirmService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit() {
    this.loading = true;
    this.marketRefresh.status$.pipe(takeUntil(this.destroy$)).subscribe(state => {
      this.refreshingPrices = state.phase === 'refreshing';
      this.cdr.markForCheck();
    });
    this.financeService.isLoading$.pipe(takeUntil(this.destroy$)).subscribe();
    this.financeService.holdings$.pipe(takeUntil(this.destroy$)).subscribe(data => {
      this.holdings = data;
      this.applyFilter();
      this.cdr.markForCheck();
    });
    this.financeService.netWorth$.pipe(takeUntil(this.destroy$)).subscribe(data => {
      this.netWorth = data;
      this.cdr.markForCheck();
    });
    this.financeService.getHoldings().pipe(takeUntil(this.destroy$)).subscribe({
      next: () => {
        this.loading = false;
        this.holdingsLoadError = null;
        this.cdr.markForCheck();
      },
      error: error => {
        this.loading = false;
        this.holdingsLoadError = error?.message || 'The app could not load holdings. Try again.';
        this.cdr.markForCheck();
      },
    });
    this.financeService.getNetWorth().pipe(takeUntil(this.destroy$)).subscribe();
    this.loadResumableFidelityStages();
  }

  ngOnDestroy() {
    this.destroyed = true;
    this.destroy$.next();
    this.destroy$.complete();
  }

  private emptyHolding(): HoldingCreate {
    return {
      symbol: '',
      shares: 0,
      purchase_price: 0,
      purchase_date: todayIsoDate(),
    };
  }

  openAddModal() {
    this.editingId = null;
    this.originalPurchasePrice = undefined;
    this.purchasePriceDirty = false;
    this.holdingSaveError = '';
    this.newHolding = this.emptyHolding();
    this.priceCheck = null;
    this.showModal = true;
    this.cdr.markForCheck();
  }

  refreshAllPrices() {
    this.refreshingPrices = true;
    void this.marketRefresh.refreshNow().then(result => {
        if (!this.destroyed) {
        this.refreshingPrices = false;
        if (result.phase === 'complete') this.toastService.success(
          `Updated ${plural(result.updatedHoldings, 'holding price')} and ${plural(result.updatedEmployerValuations, 'employer valuation')}`
        );
        else this.toastService.error('Some prices could not be refreshed. Saved prices remain available; see the refresh details above.');
        this.cdr.markForCheck();
        }
      }).catch(() => {
        if (this.destroyed) return;
        this.refreshingPrices = false;
        this.toastService.error('Prices could not be refreshed. Saved prices remain available.');
        this.cdr.markForCheck();
      });
  }

  refreshHoldingPrice(h: Holding) {
    void this.marketRefresh.refreshSymbol(h.symbol).then(result => {
      if (result.error || result.failedRecords.length) {
        this.toastService.error(`${h.symbol} quote could not be fully saved. Its prior price remains available.`);
      } else {
        this.toastService.success(`${h.symbol} price refreshed`);
      }
      this.cdr.markForCheck();
    }).catch(() => this.toastService.error(`${h.symbol} price could not be refreshed. Its prior price remains available.`));
  }

  retryLoadHoldings(): void {
    this.holdingsLoadError = null;
    this.loading = true;
    this.cdr.markForCheck();
    this.financeService.getHoldings().pipe(takeUntil(this.destroy$)).subscribe({
      next: () => {
        this.loading = false;
        this.holdingsLoadError = null;
        this.cdr.markForCheck();
      },
      error: error => {
        this.loading = false;
        this.holdingsLoadError = error?.message || 'The app could not load holdings. Try again.';
        this.cdr.markForCheck();
      },
    });
  }

  checkSharePrice() {
    const symbol = this.newHolding.symbol.trim().toUpperCase();
    if (!symbol) {
      this.priceCheckError = 'Enter a symbol to check price.';
      this.cdr.markForCheck();
      return;
    }
    this.priceCheckError = '';
    this.checkingPrice = true;
    this.priceCheck = null;
    this.financeService.lookupSharePrice(symbol, true).pipe(takeUntil(this.destroy$)).subscribe({
      next: quote => {
        this.checkingPrice = false;
        this.priceCheck = quote;
        const quoteDate = quote.quote_date || '';
        const parsedDate = /^\d{4}-\d{2}-\d{2}$/.test(quoteDate) ? new Date(`${quoteDate}T00:00:00Z`) : null;
        const validDate = !!parsedDate && !Number.isNaN(parsedDate.getTime())
          && parsedDate.toISOString().slice(0, 10) === quoteDate
          && quoteDate <= new Date().toISOString().slice(0, 10);
        const usable = quote.valid
          && quote.symbol?.trim().toUpperCase() === symbol
          && Number.isFinite(quote.price)
          && quote.price > 0
          && validDate;
        if (!usable) {
          this.toastService.error('Market service returned an invalid quote. Your saved prices and cost basis remain unchanged.');
          this.cdr.markForCheck();
          return;
        }
        if (this.newHolding.purchase_price == null || this.newHolding.purchase_price <= 0) {
          this.newHolding.purchase_price = quote.price;
        }
        this.cdr.markForCheck();
      },
      error: () => {
        this.checkingPrice = false;
      },
    });
  }

  formatPriceTime(iso: string | null | undefined): string {
    if (!iso) return '—';
    return new Date(iso).toLocaleString();
  }

  holdingErrors: FieldIssue[] = [];
  holdingSubmitted = false;
  holdingSaveError = '';
  private originalPurchasePrice: number | null | undefined = undefined;
  private purchasePriceDirty = false;

  holdingFieldError(field: string): string | null {
    return this.holdingSubmitted ? this.holdingErrors.find(error => error.field === field)?.message ?? null : null;
  }

  markPurchasePriceDirty(): void {
    this.purchasePriceDirty = true;
  }

  addOrUpdateHolding() {
    if (this.saving) return;
    const keepStoredPrice = this.editingId !== null && !this.purchasePriceDirty;
    const issues = validateHolding({
      symbol: this.newHolding.symbol,
      shares: this.newHolding.shares,
      costBasis: keepStoredPrice ? null : this.newHolding.purchase_price,
      purchaseDate: this.newHolding.purchase_date,
      requirePurchaseDate: this.editingId === null,
    });
    this.holdingErrors = issues;
    this.holdingSubmitted = true;
    if (issues.length) {
      this.cdr.markForCheck();
      setTimeout(() => focusFirstInvalid(document.querySelector('.holding-form')));
      return;
    }
    const symbol = this.newHolding.symbol.trim().toUpperCase();
    if (!keepStoredPrice) {
      const priceError = validateUnitPrice(this.newHolding.purchase_price);
      if (priceError) {
        this.holdingErrors = [...issues, { field: 'costBasis', label: 'Cost basis', message: priceError }];
        this.cdr.markForCheck();
        setTimeout(() => focusFirstInvalid(document.querySelector('.holding-form')));
        return;
      }
    }

    this.saving = true;
    this.holdingSaveError = '';
    const payload: HoldingCreate = {
      ...this.newHolding,
      symbol,
      purchase_price: keepStoredPrice
        ? this.originalPurchasePrice ?? null
        : unitPriceToNumber(this.newHolding.purchase_price),
    };
    if (this.editingId !== null && !payload.purchase_date) delete (payload as Partial<HoldingCreate>).purchase_date;

    const req =
      this.editingId !== null
        ? this.financeService.updateHolding(this.editingId, payload, true)
        : this.financeService.addHolding(payload, true);

    req.pipe(takeUntil(this.destroy$)).subscribe({
      next: () => {
        this.saving = false;
        const wasEditing = this.editingId !== null;
        this.closeModal();
        this.toastService.success(successCopy('Holding', wasEditing ? 'saved' : 'added'));
        this.cdr.markForCheck();
      },
      error: () => {
        this.saving = false;
        this.holdingSaveError = dialogSaveAlert();
        this.cdr.markForCheck();
        setTimeout(() => focusDialogAlert(document.querySelector('.holding-form')));
      },
    });
  }

  editHolding(h: Holding) {
    this.editingId = h.id;
    const purchaseDate = h.purchase_date ? String(h.purchase_date).split('T')[0] : '';
    this.originalPurchasePrice = h.purchase_price;
    this.purchasePriceDirty = false;
    this.holdingSaveError = '';
    this.newHolding = {
      symbol: h.symbol,
      shares: h.shares,
      purchase_price: h.purchase_price,
      purchase_date: purchaseDate,
    };
    this.showModal = true;
    this.cdr.markForCheck();
  }

  closeModal() {
    this.showModal = false;
    this.editingId = null;
    this.holdingSaveError = '';
    this.newHolding = this.emptyHolding();
    this.priceCheck = null;
  }

  canSave(): boolean {
    const s = (this.newHolding?.symbol || '').trim();
    return s.length > 0 &&
           (this.newHolding?.shares || 0) > 0 &&
           (this.editingId !== null || (this.newHolding?.purchase_price != null && this.newHolding.purchase_price > 0 && !!this.newHolding?.purchase_date));
  }

  getTotalValue = () => totalPortfolioValue(this.holdings);
  getTotalGain = () => totalPortfolioGain(this.holdings);
  getGain = (h: Holding) => holdingGain(h);
  getGainPercent = (h: Holding) => holdingGainPercent(h);

  gainIsPositive(h: Holding): boolean { const value = this.getGain(h); return value != null && value >= 0; }
  gainIsNegative(h: Holding): boolean { const value = this.getGain(h); return value != null && value < 0; }
  gainDisplay(h: Holding): string {
    const value = this.getGain(h);
    return value == null ? 'Unavailable' : formatMoney(fromDollars(value), { sign: 'always' });
  }
  gainPercentIsPositive(h: Holding): boolean { const value = this.getGainPercent(h); return value != null && value >= 0; }
  gainPercentIsNegative(h: Holding): boolean { const value = this.getGainPercent(h); return value != null && value < 0; }
  gainPercentDisplay(h: Holding): string {
    const value = this.getGainPercent(h);
    return value == null ? 'Unavailable' : `${value.toFixed(1)}%`;
  }
  totalGainIsPositive(): boolean { const value = this.getTotalGain(); return value != null && value >= 0; }
  totalGainIsNegative(): boolean { const value = this.getTotalGain(); return value != null && value < 0; }
  totalGainDisplay(): string {
    const value = this.getTotalGain();
    return value == null ? 'Unavailable' : formatMoney(fromDollars(value), { sign: 'always' });
  }

  /** Grouped view for better account breakdown.
   *  Fidelity gets special treatment with sub-accounts.
   */
  get accountGroups() {
    const brokerageSubs: { [key: string]: Holding[] } = {};
    const manual: Holding[] = [];

    for (const h of this.filteredHoldings) {
      if (h.brokerage_account_id != null) {
        // Key by account id so nicknames don't accidentally merge different accounts
        const key = `ba-${h.brokerage_account_id}`;
        if (!brokerageSubs[key]) brokerageSubs[key] = [];
        brokerageSubs[key].push(h);
      } else {
        manual.push(h);
      }
    }

    const fidelityGroups = Object.keys(brokerageSubs).map(key => {
      const hs = brokerageSubs[key];
      const first = hs[0];
      const label = first?.account_display || 'Brokerage Account';
      return {
        label,
        holdings: hs,
        totalValue: hs.reduce((sum, h) => sum + (h.value || 0), 0),
        unvaluedCount: hs.filter(h => h.value == null || !Number.isFinite(Number(h.value))).length,
        brokerageAccountId: first?.brokerage_account_id || null,
      };
    }).sort((a, b) => a.label.localeCompare(b.label));

    return {
      fidelity: fidelityGroups,
      fidelityTotal: fidelityGroups.reduce((s, g) => s + g.totalValue, 0),
      fidelityHasUnvalued: fidelityGroups.some(g => g.unvaluedCount > 0),
      manual,
      manualTotal: manual.reduce((s, h) => s + (h.value || 0), 0),
      manualUnvaluedCount: manual.filter(h => h.value == null || !Number.isFinite(Number(h.value))).length,
    };
  }

  priceSourceBadgeVariant(h: Holding): UiBadgeVariant {
    const state = quoteFreshness(h);
    if (state === 'Live') return 'success';
    if (state === 'Cached') return 'default';
    if (state === 'Unavailable') return 'danger';
    if (state === 'Unknown') return 'default';
    return 'warning';
  }

  priceFreshness(h: Holding): string {
    return quoteFreshnessLabel(h);
  }

  priceSourceHint(h: Holding): string | null {
    const src = h.price_source ?? '';
    if (src === 'provisional_cost_basis' || src === 'fallback_purchase') return 'Provisional value from cost basis; refresh the quote.';
    if (src === 'non_ticker') return 'Symbol is not a market ticker (e.g. CUSIP or sweep).';
    if (src === 'error' || src === 'unavailable') return 'No market value is available for this position.';
    return null;
  }

  dateLabel(value: string | null | undefined): string {
    return formatDate(value, 'table');
  }

  positionDateSummary(): string {
    return portfolioDateSummary(this.holdings.map(h => (h as Holding & { position_as_of?: string | null }).position_as_of));
  }

  quoteDateSummary(): string {
    return portfolioDateSummary(this.holdings.map(h => this.quoteDate(h)));
  }

  quoteDate(h: Holding): string | null {
    return actualQuoteDate(h);
  }

  quoteDateLabel(h: Holding): string {
    return this.dateLabel(this.quoteDate(h));
  }

  get hasMissingValues(): boolean {
    return hasUnvaluedPositions(this.holdings);
  }

  get missingValueCount(): number {
    return this.holdings.filter(h => h.value == null || !Number.isFinite(Number(h.value))).length;
  }

  get provisionalPositionCount(): number {
    return this.holdings.filter(h => h.price_source === 'provisional_cost_basis' || h.price_source === 'fallback_purchase').length;
  }

  loadResumableFidelityStages() {
    this.financeService.getHoldingImportStages().pipe(takeUntil(this.destroy$)).subscribe({
      next: stages => {
        this.resumableFidelityStages = stages.filter(stage => ['staged', 'verified', 'interrupted'].includes(stage.status));
        this.cdr.markForCheck();
      },
      error: () => {
        this.resumableFidelityStages = [];
        this.cdr.markForCheck();
      },
    });
  }

  resumeFidelityStage(stage: FidelityStageRecord) {
    this.fidelityImportCommitting = true;
    this.financeService.resumeFidelityImportStage(stage.id).pipe(takeUntil(this.destroy$)).subscribe({
      next: result => {
        this.fidelityImportCommitting = false;
        this.toastService.success(`Activated ${plural(result.inserted, 'Fidelity position')}`);
        this.loadResumableFidelityStages();
        this.cdr.markForCheck();
      },
      error: () => {
        this.fidelityImportCommitting = false;
        this.toastService.error('Fidelity import is still staged. Resume it after resolving the issue.');
        this.loadResumableFidelityStages();
        this.cdr.markForCheck();
      },
    });
  }

  applyFilter() {
    if (!this.searchTerm) {
      this.filteredHoldings = this.holdings;
    } else {
      const term = this.searchTerm.toLowerCase();
      this.filteredHoldings = this.holdings.filter(h => h.symbol.toLowerCase().includes(term));
    }
  }

  onSearchChange() {
    this.applyFilter();
  }

  async deleteHolding(h: Holding) {
    const ok = await this.confirmService.ask(
      'Delete holding?',
      `Remove ${h.symbol} from your portfolio? You can undo right after.`,
      'Delete',
      'Cancel'
    );
    if (!ok) return;

    const backup: HoldingCreate = {
      symbol: h.symbol,
      shares: h.shares,
      purchase_price: h.purchase_price,
      purchase_date: h.purchase_date,
    };

    this.removeHolding(h, backup);
  }

  private removeHolding(h: Holding, backup: HoldingCreate): void {
    this.financeService.deleteHolding(h.id, true).pipe(takeUntil(this.destroy$)).subscribe({
      next: () => {
        this.toastService.success('Holding deleted', () => this.restoreHolding(backup));
      },
      error: () => {
        this.toastService.error(failureCopy('delete', 'this holding'), {
          label: 'Try again',
          run: () => this.removeHolding(h, backup),
        });
      },
    });
  }

  private restoreHolding(backup: HoldingCreate): void {
    this.financeService.addHolding(backup, true).pipe(takeUntil(this.destroy$)).subscribe({
      error: () => {
        this.toastService.error(failureCopy('restore', 'this holding'), {
          label: 'Try again',
          run: () => this.restoreHolding(backup),
        });
      },
    });
  }

  exportToCsv() {
    downloadCsv(
      'holdings.csv',
      ['Symbol', 'Shares', 'Cost Basis', 'Current Price', 'Market Value', 'Gain', 'Price Source', 'Position As Of', 'Quote Date'],
      this.filteredHoldings.map(h => [
        h.symbol,
        h.shares,
        h.purchase_price ?? 'Unknown',
        h.current_price ?? 'Unknown',
        h.value ?? 'Unavailable',
        this.getGain(h) ?? 'Unavailable',
        h.price_source ?? '',
        this.dateLabel((h as Holding & { position_as_of?: string | null }).position_as_of),
        this.quoteDateLabel(h),
      ])
    );
  }

  trackByHoldingId(_: number, h: Holding) {
    return h.id;
  }

  startEditNickname(accountId: number | null | undefined, currentLabel: string) {
    if (!accountId) return;
    this.editingNicknameFor = accountId;
    this.nicknameDraft = currentLabel || '';
    this.cdr.markForCheck();
  }

  cancelEditNickname() {
    this.editingNicknameFor = null;
    this.nicknameDraft = '';
    this.cdr.markForCheck();
  }

  saveNickname() {
    if (!this.editingNicknameFor) return;
    const id = this.editingNicknameFor;
    this.financeService.setAccountNickname(id, this.nicknameDraft.trim() || null).subscribe({
      next: () => {
        this.editingNicknameFor = null;
        this.nicknameDraft = '';
        this.cdr.markForCheck();
      },
    });
  }

  // Fidelity import (replaces positions for accounts in CSV)
  openFidelityImportModal() {
    this.showFidelityImportModal = true;
    this.fidelityImportStep = 'upload';
    this.fidelityImportFile = null;
    this.fidelityImportPreview = null;
    this.selectedFidelityAccounts.clear();
    this.cdr.markForCheck();
    this.financeService.getBrokerageImports().pipe(takeUntil(this.destroy$)).subscribe({
      next: (opts) => {
        // auto select fidelity if present
        if (opts.length) {
          // no selected slug needed, we hard use 'fidelity' route
        }
        this.cdr.markForCheck();
      },
    });
  }

  closeFidelityImportModal() {
    this.showFidelityImportModal = false;
    this.fidelityImportFile = null;
    this.fidelityImportPreview = null;
    this.fidelityImportError = '';
    this.selectedFidelityAccounts.clear();
  }

  onFidelityFileSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    this.fidelityImportFile = file;
    this.cdr.markForCheck();
  }

  runFidelityPreview() {
    if (!this.fidelityImportFile) {
      this.fidelityImportError = 'Choose a Fidelity CSV file first.';
      this.cdr.markForCheck();
      return;
    }
    this.fidelityImportError = '';
    this.fidelityImportParsing = true;
    this.financeService
      .previewFidelityImport(this.fidelityImportFile)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (preview) => {
          this.fidelityImportParsing = false;
          this.fidelityImportPreview = preview;
          this.fidelityAccountReplacements = [];
          this.fidelityImportStep = 'preview';
          this.selectedFidelityAccounts.clear();
          // select all for replace
          for (const row of preview.rows) {
            this.selectedFidelityAccounts.add(row.account_mask);
          }
          this.financeService.getBrokerageAccounts().pipe(takeUntil(this.destroy$)).subscribe({
            next: accounts => {
              this.knownBrokerageAccounts = accounts;
              this.fidelityAccountReplacements = replacementPreviewForAccounts(
                preview.rows,
                this.holdings,
                this.selectedFidelityAccounts,
                accounts,
              );
              this.cdr.markForCheck();
            },
            error: () => this.cdr.markForCheck(),
          });
          this.cdr.markForCheck();
        },
        error: () => {
          this.fidelityImportParsing = false;
          this.fidelityImportError = "Couldn't read this file. Try again.";
          this.cdr.markForCheck();
        },
      });
  }

  async commitFidelityImport() {
    if (!this.fidelityImportPreview || !this.fidelityImportFile) return;
    const selectedMasks = Array.from(this.selectedFidelityAccounts);
    if (!selectedMasks.length) {
      this.fidelityImportError = 'No accounts selected to replace.';
      this.cdr.markForCheck();
      return;
    }
    const rowsToSend = this.fidelityImportPreview.rows.filter(r =>
      this.selectedFidelityAccounts.has(r.account_mask)
    );
    if (!rowsToSend.length) {
      this.fidelityImportError = 'Select accounts to import.';
      this.cdr.markForCheck();
      return;
    }
    this.fidelityImportError = '';

    const accountLabels = this.fidelityImportPreview.accounts.filter(a => {
      const mask = this.extractMaskFromDisplay(a);
      return this.selectedFidelityAccounts.has(mask);
    });
    const accountList = accountLabels.length
      ? accountLabels.map(a => `• ${a}`).join('\n')
      : selectedMasks.map(m => `• ···${m}`).join('\n');

    const ok = await this.confirmService.ask(
      'Replace Fidelity holdings?',
      `The selected Fidelity accounts will switch to the verified CSV positions. Existing positions stay active until the staged replacement is verified.\n\nAccounts:\n${accountList}\n\n${plural(rowsToSend.length, 'position row')} will be imported.`,
      'Confirm Replace',
      'Cancel'
    );
    if (!ok) return;

    this.fidelityImportCommitting = true;
    this.cdr.markForCheck();
    this.financeService
      .commitFidelityImport(this.fidelityImportPreview.filename, rowsToSend, selectedMasks)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (res: FidelityCommitResult) => {
          this.fidelityImportCommitting = false;
          this.closeFidelityImportModal();
          this.toastService.success(
            `Replaced ${res.holdings_replaced} holdings, inserted ${res.inserted} for ${plural(res.accounts_replaced, 'account')}`
          );
          this.loadResumableFidelityStages();
          this.cdr.markForCheck();
        },
        error: () => {
          this.fidelityImportCommitting = false;
          this.toastService.error('Replacement is staged and can be resumed after the interruption.');
          this.loadResumableFidelityStages();
          this.cdr.markForCheck();
        },
      });
  }

  isFidelityAccountSelected(mask: string): boolean {
    return this.selectedFidelityAccounts.has(mask);
  }

  toggleFidelityAccount(mask: string) {
    if (this.selectedFidelityAccounts.has(mask)) {
      this.selectedFidelityAccounts.delete(mask);
    } else {
      this.selectedFidelityAccounts.add(mask);
    }
    if (this.fidelityImportPreview) {
      this.fidelityAccountReplacements = replacementPreviewForAccounts(
        this.fidelityImportPreview.rows,
        this.holdings,
        this.selectedFidelityAccounts,
        this.knownBrokerageAccounts,
      );
    }
    this.cdr.markForCheck();
  }

  // Helpers for modal using display string (simple parse for demo)
  isFidelityAccountSelectedForDisplay(display: string): boolean {
    const mask = this.extractMaskFromDisplay(display);
    return this.selectedFidelityAccounts.has(mask);
  }

  toggleFidelityAccountFromDisplay(display: string) {
    const mask = this.extractMaskFromDisplay(display);
    this.toggleFidelityAccount(mask);
  }

  private extractMaskFromDisplay(display: string): string {
    // "Fidelity ···Z21741448 (Individual)" -> "Z21741448"
    const m = display.match(/···([^ (]+)/);
    return m ? m[1] : display;
  }
}
