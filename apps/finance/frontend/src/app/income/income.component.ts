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
import { firstValueFrom, from, Subject, takeUntil } from 'rxjs';
import { FinanceService } from '../services/finance.service';
import { ConfirmService } from '@vivek/ui';
import { ToastService, failureCopy, successCopy } from '@vivek/ui';
import { JobIncome, JobIncomeCreate, JobStockGrant, JobStockPurchase, JobStockValuation, PaydayFrequency } from '../models/transaction.model';
import {
  annualBasePayAt,
  isCurrentJob,
  isValidIsoDate,
  jobHistoryError,
  latestStockValuationOnOrBefore,
  estimatedPaycheckNet,
  hasPaydaySchedule,
  paydayDatesBetween,
  replaceStockValuation,
  stockGrantSnapshot,
  stockPurchaseSnapshot,
  stockSnapshotAt,
} from '../utils/job-compensation.util';
import { formatDate, todayIsoDate, toDollars } from '@vivek/browser';
import { validateJob, validateMoney, type FieldIssue } from '../utils/validators';
import { formatEstimate } from '../shared/stored-money';
import { dialogSaveAlert, focusDialogAlert, focusErrorSummary } from '../shared/form-validation';
import {
  centsPaySnapshot,
  convertBasePayUnit,
  editorPayFromRecord,
  savedPayFromEditor,
  storedPayFrequencyLabel,
  type BasePayUnit,
  type EditorPay,
} from './pay-schedule';
import { MarketRefreshCoordinatorService } from '../services/market-refresh-coordinator.service';
import { MoneyPipe } from '@vivek/ui';
import { AppDatePipe } from '@vivek/ui';
import { AppDateRangePipe } from '@vivek/ui';

interface StockPriceDraft {
  date: string;
  price: number | string | null;
}

interface StockQuoteStatus {
  state: 'loading' | 'updated' | 'stale' | 'unavailable' | 'error';
  message: string;
}
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

@Component({
  selector: 'app-income',
  standalone: true,
  imports: [
    AppDateRangePipe,
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
  ],
  templateUrl: './income.component.html',
  styleUrls: ['./income.component.css', '../shared/recurring-editor.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class IncomeComponent implements OnInit, OnDestroy {
  @Input() embedded = false;
  @Input() compensationTracking = false;
  isCurrentJob = isCurrentJob;
  stockSnapshotAt = stockSnapshotAt;
  stockGrantSnapshot = stockGrantSnapshot;
  stockPurchaseSnapshot = stockPurchaseSnapshot;
  today = todayIsoDate;
  incomes: JobIncome[] = [];
  stockPriceDrafts: Record<number, StockPriceDraft> = {};
  stockPriceErrors: Record<number, string> = {};
  manualPriceNotice: Record<number, string> = {};
  stockQuoteStatuses: Record<string, StockQuoteStatus> = {};
  private savingStockPriceIds = new Set<number>();
  showModal = false;
  saving = false;
  jobSaveError = '';
  fieldErrors: FieldIssue[] = [];
  formSubmitted = false;
  editingId: number | null = null;
  form: JobIncomeCreate = this.emptyForm();
  moreOptionsOpen = false;
  taxOptionsOpen = false;
  historyOptionsOpen = false;
  taxEstimator = {
    state: 'average',
    filingStatus: 'single',
    preTaxDeductionsPerPeriod: 0,
  };

  readonly paydayFrequencyOptions: UiSelectOption[] = [
    { value: '', label: 'Not set' },
    { value: 'weekly', label: 'Weekly' },
    { value: 'biweekly', label: 'Every two weeks' },
    { value: 'semimonthly', label: 'Twice a month' },
    { value: 'monthly', label: 'Monthly' },
  ];

  readonly filingStatusOptions: UiSelectOption[] = [
    { value: 'single', label: 'Single' },
    { value: 'married_joint', label: 'Married filing jointly' },
    { value: 'head_of_household', label: 'Head of household' },
  ];

  readonly stateTaxOptions: UiSelectOption[] = [
    { value: 'average', label: 'U.S. average estimate' },
    { value: 'none', label: 'No state income tax' },
    { value: 'low', label: 'Lower-tax state' },
    { value: 'medium', label: 'Middle-tax state' },
    { value: 'high', label: 'Higher-tax state' },
  ];

  private destroy$ = new Subject<void>();
  private refreshingStockSymbols = new Set<string>();
  private jobUpdateQueues = new Map<number, Promise<unknown>>();
  private editingJobSnapshot: JobIncome | null = null;
  private destroyed = false;

  constructor(
    private financeService: FinanceService,
    private marketRefresh: MarketRefreshCoordinatorService,
    private confirmService: ConfirmService,
    private toastService: ToastService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    this.financeService.jobIncomes$.pipe(takeUntil(this.destroy$)).subscribe(rows => {
      this.incomes = rows;
      this.ensureStockPriceDrafts(rows);
      this.cdr.markForCheck();
    });
    this.financeService.getJobIncomes().pipe(takeUntil(this.destroy$)).subscribe();
  }

  ngOnDestroy(): void {
    this.destroyed = true;
    this.destroy$.next();
    this.destroy$.complete();
  }

  get activeAnnualTotal(): number {
    return this.incomes
      .filter(row => isCurrentJob(row))
      .reduce((sum, row) => sum + row.annual_gross, 0);
  }

  get activeAnnualNet(): number {
    return this.incomes
      .filter(row => isCurrentJob(row))
      .reduce((sum, row) => sum + row.annual_net, 0);
  }

  get activeAnnualAdjustments(): number {
    return this.incomes
      .filter(row => isCurrentJob(row))
      .reduce((sum, row) => sum + row.annual_taxes + row.annual_deductions, 0);
  }

  get activeHasTaxes(): boolean {
    return this.activeAnnualAdjustments > 0;
  }

  get activeMonthlyGross(): number {
    return this.activeAnnualTotal / 12;
  }

  /** F18 (REC-03): open the first current job without taxes, More options and taxes open. */
  addTaxes(): void {
    const row = this.incomes.find(
      candidate => isCurrentJob(candidate) && candidate.annual_taxes + candidate.annual_deductions === 0,
    );
    if (!row) return;
    this.openEditModal(row);
    this.moreOptionsOpen = true;
    this.taxOptionsOpen = true;
    this.cdr.markForCheck();
  }

  get editorPay(): EditorPay {
    return {
      unit: this.basePayUnit,
      basePay: this.form.base_pay,
      hoursPerWeek: this.form.hours_per_week ?? null,
      taxesPerPeriod: this.form.taxes_per_period,
      deductionsPerPeriod: this.form.deductions_per_period,
    };
  }

  get basePayUnit(): BasePayUnit {
    return this.form.pay_frequency === 'hourly' ? 'hourly' : 'annual';
  }

  get formAnnualBase(): number {
    return toDollars(centsPaySnapshot(this.snapshotInput()).annualBaseCents);
  }

  get formAnnualGross(): number {
    return (
      this.formAnnualBase +
      Number(this.form.annual_bonus || 0) +
      Number(this.form.annual_equity || 0) +
      Number(this.form.annual_other || 0)
    );
  }

  get formAnnualAdjustments(): number {
    const snapshot = centsPaySnapshot(this.snapshotInput());
    return toDollars(snapshot.annualTaxCents + snapshot.annualDeductionCents);
  }

  get formAnnualNet(): number {
    return Math.max(this.formAnnualGross - this.formAnnualAdjustments, 0);
  }

  get formPaycheck(): number | null {
    const paycheck = centsPaySnapshot(this.snapshotInput()).paycheckCents;
    return paycheck == null ? null : toDollars(paycheck);
  }

  get estimatedTaxesPerPeriod(): number {
    const taxableAnnual = Math.max(
      this.formAnnualGross - Number(this.taxEstimator.preTaxDeductionsPerPeriod || 0) * this.payPeriodsPerYear,
      0
    );
    const federalEffective = this.estimatedFederalEffectiveRate(taxableAnnual, this.taxEstimator.filingStatus);
    const ficaRate = 0.0765;
    const stateRate = this.estimatedStateRate(this.taxEstimator.state);
    return this.roundMoney((taxableAnnual * (federalEffective + ficaRate + stateRate)) / this.payPeriodsPerYear);
  }

  get estimatedTaxRateLabel(): string {
    if (!this.formAnnualGross) return '0.0%';
    const annualEstimate = this.estimatedTaxesPerPeriod * this.payPeriodsPerYear;
    return `${((annualEstimate / this.formAnnualGross) * 100).toFixed(1)}%`;
  }

  get withholdingPeriodLabel(): string {
    return this.basePayUnit === 'hourly' ? 'weekly' : 'annual';
  }

  get payPeriodsPerYear(): number {
    return this.basePayUnit === 'hourly' ? 52 : 1;
  }

  private emptyForm(): JobIncomeCreate {
    return {
      employer: '',
      role_title: '',
      pay_frequency: 'annual',
      payday_frequency: null,
      first_pay_date: null,
      second_pay_day: null,
      base_pay: 0,
      hours_per_week: null,
      annual_bonus: 0,
      annual_equity: 0,
      annual_other: 0,
      annual_taxes: 0,
      annual_deductions: 0,
      taxes_per_period: 0,
      deductions_per_period: 0,
      effective_date: todayIsoDate(),
      end_date: null,
      promotions: [],
      compensation_payments: [],
      stock_symbol: '',
      stock_grants: [],
      stock_purchases: [],
      stock_valuations: [],
      is_active: true,
      notes: '',
    };
  }

  openAddModal(): void {
    this.editingId = null;
    this.editingJobSnapshot = null;
    this.jobSaveError = '';
    this.fieldErrors = [];
    this.formSubmitted = false;
    this.form = this.emptyForm();
    this.moreOptionsOpen = false;
    this.taxOptionsOpen = false;
    this.historyOptionsOpen = false;
    this.taxEstimator = { state: 'average', filingStatus: 'single', preTaxDeductionsPerPeriod: 0 };
    this.showModal = true;
  }

  openEditModal(row: JobIncome): void {
    this.jobSaveError = '';
    this.fieldErrors = [];
    this.formSubmitted = false;
    this.editingId = row.id;
    this.editingJobSnapshot = {
      ...row,
      promotions: (row.promotions || []).map(item => ({ ...item })),
      compensation_payments: (row.compensation_payments || []).map(item => ({ ...item })),
      stock_grants: (row.stock_grants || []).map(item => ({ ...item, sales: (item.sales || []).map(sale => ({ ...sale })) })),
      stock_purchases: (row.stock_purchases || []).map(item => ({ ...item, sales: (item.sales || []).map(sale => ({ ...sale })) })),
      stock_valuations: (row.stock_valuations || []).map(item => ({ ...item })),
    };
    const pay = editorPayFromRecord(row);
    this.form = {
      employer: row.employer,
      role_title: row.role_title || '',
      pay_frequency: pay.unit,
      payday_frequency: row.payday_frequency || null,
      first_pay_date: row.first_pay_date || null,
      second_pay_day: row.second_pay_day ?? null,
      base_pay: pay.basePay,
      hours_per_week: pay.hoursPerWeek,
      annual_bonus: row.annual_bonus,
      annual_equity: row.annual_equity,
      annual_other: row.annual_other,
      annual_taxes: row.annual_taxes,
      annual_deductions: row.annual_deductions,
      taxes_per_period: pay.taxesPerPeriod,
      deductions_per_period: pay.deductionsPerPeriod,
      effective_date: row.effective_date,
      end_date: row.end_date || null,
      promotions: (row.promotions || []).map(item => ({ ...item })),
      compensation_payments: (row.compensation_payments || []).map(item => ({ ...item })),
      stock_symbol: row.stock_symbol || '',
      stock_grants: (row.stock_grants || []).map(item => ({ ...item, sales: (item.sales || []).map(sale => ({ ...sale })) })),
      stock_purchases: (row.stock_purchases || []).map(item => ({ ...item, sales: (item.sales || []).map(sale => ({ ...sale })) })),
      stock_valuations: (row.stock_valuations || []).map(item => ({ ...item })),
      is_active: row.is_active,
      notes: row.notes || '',
    };
    this.syncOptionSections();
    this.showModal = true;
  }

  setBasePayUnit(unit: string): void {
    const next: BasePayUnit = unit === 'hourly' ? 'hourly' : 'annual';
    if (next === this.basePayUnit) return;
    const converted = convertBasePayUnit(this.editorPay, next);
    this.applyEditorPay(converted);
    this.cdr.markForCheck();
  }

  onEditorSectionToggle(event: Event, section: 'more' | 'tax' | 'history'): void {
    if (event.target !== event.currentTarget) return;
    const open = (event.currentTarget as HTMLDetailsElement).open;
    if (section === 'more') this.moreOptionsOpen = open;
    if (section === 'tax') this.taxOptionsOpen = open;
    if (section === 'history') this.historyOptionsOpen = open;
    this.cdr.markForCheck();
  }

  addPromotion(): void {
    this.form.promotions!.push({ date: '', annual_base_pay: annualBasePayAt(this.form), role_title: '' });
  }

  addCompensationPayment(): void {
    this.form.compensation_payments!.push({ date: '', kind: 'bonus', amount: 0, label: '' });
  }

  addStockGrant(): void {
    this.form.stock_grants!.push({ date: '', origin: 'equity', label: '', quantity: 0, price_at_grant: 0, sales: [] });
  }

  addStockPurchase(): void {
    this.form.stock_purchases!.push({ date: '', label: '', quantity: 0, price_paid_per_share: 0, market_price_at_purchase: null, sales: [] });
  }

  addStockSale(grant: JobStockGrant): void {
    grant.sales = grant.sales || [];
    grant.sales.push({ date: '', shares: 0, cash_proceeds: 0 });
  }

  addStockPurchaseSale(purchase: JobStockPurchase): void {
    purchase.sales = purchase.sales || [];
    purchase.sales.push({ date: '', shares: 0, cash_proceeds: 0 });
  }

  stockPriceDraft(row: JobIncome): StockPriceDraft {
    if (!this.stockPriceDrafts[row.id]) this.stockPriceDrafts[row.id] = this.newStockPriceDraft(row);
    return this.stockPriceDrafts[row.id];
  }

  paydaySummary(row: JobIncome): string {
    if (!row.is_active) return 'Inactive job · no projected paychecks';
    if (!hasPaydaySchedule(row)) return 'Pay dates not set · monthly income is an estimate';
    const today = todayIsoDate();
    const from = [today, row.first_pay_date!, row.effective_date].sort().at(-1)!;
    const horizon = new Date(Date.parse(`${from}T00:00:00Z`) + 370 * 86_400_000).toISOString().slice(0, 10);
    const next = paydayDatesBetween(row, from, horizon)[0];
    return next
      ? `Next paycheck ${formatDate(next)} · ${formatEstimate(estimatedPaycheckNet(row, next))} net`
      : 'No upcoming paycheck date before this job ends';
  }

  paydayScheduleChanged(): void {
    if (!this.form.payday_frequency) {
      this.form.first_pay_date = null;
      this.form.second_pay_day = null;
    } else if (this.form.payday_frequency !== 'semimonthly') {
      this.form.second_pay_day = null;
    }
    this.cdr.markForCheck();
  }

  setPaydayFrequency(value: string): void {
    this.form.payday_frequency = value ? value as PaydayFrequency : null;
    this.paydayScheduleChanged();
  }

  latestStockPrice(row: JobIncome, cutoff = todayIsoDate()): JobStockValuation | undefined {
    return latestStockValuationOnOrBefore(row.stock_valuations || [], cutoff, row.effective_date, row.stock_symbol);
  }

  stockQuoteStatus(row: JobIncome): string {
    const symbol = this.normalizeStockSymbol(row.stock_symbol || '');
    const status = symbol ? this.stockQuoteStatuses[symbol] : undefined;
    const latest = this.latestStockPrice(row);
    if (status?.state === 'loading') {
      return latest
        ? `Refreshing market quote. Last saved price was $${Number(latest.price_per_share).toFixed(4)} on ${latest.date}.`
        : 'Refreshing market quote. Until a dated price is available, grant and purchase prices are used.';
    }
    if (status?.state === 'updated' || status?.state === 'stale' || status?.state === 'unavailable' || status?.state === 'error') {
      return status.message;
    }
    if (latest) {
      return `Last saved price: $${Number(latest.price_per_share).toFixed(4)} per share on ${latest.date} (${this.priceSourceLabel(latest.source)}).`;
    }
    return 'No saved price yet. Grant price and ESPP purchase price are used as the valuation fallback.';
  }

  saveStockPrice(row: JobIncome): void {
    if (this.savingStockPriceIds.has(row.id)) return;
    const draft = this.stockPriceDraft(row);
    const rawPrice = String(draft.price ?? '').trim();
    const price = Number(rawPrice);
    const latest = this.incomes.find(item => item.id === row.id) || row;
    if (!isValidIsoDate(draft.date) || draft.date < latest.effective_date) {
      this.stockPriceErrors[row.id] = 'Share price date must be valid and on or after the job start date.';
      this.cdr.markForCheck();
      return;
    }
    if (!rawPrice || !Number.isFinite(price) || price < 0) {
      this.stockPriceErrors[row.id] = 'Enter a non-negative share price.';
      this.cdr.markForCheck();
      return;
    }
    delete this.stockPriceErrors[row.id];
    const valuation: JobStockValuation = { date: draft.date, price_per_share: price, source: 'manual', price_as_of: null };
    this.savingStockPriceIds.add(row.id);
    this.cdr.markForCheck();
    void this.enqueueJobIncomeUpdate(row.id, current => ({
      stock_valuations: replaceStockValuation(current.stock_valuations || [], valuation),
    }), row, true).then(saved => {
      if (!saved || this.destroyed) return;
      delete this.manualPriceNotice[row.id];
      const symbol = this.normalizeStockSymbol(saved.stock_symbol || row.stock_symbol || '');
      if (symbol) this.stockQuoteStatuses[symbol] = {
          state: 'updated',
          message: `Saved manual price $${price.toFixed(4)} per share as of ${draft.date}. This replaces the prior manual price.`,
      };
      this.toastService.success('Current manual share price saved');
      this.cdr.markForCheck();
    }).catch(() => {
      if (!this.destroyed) {
        const symbol = this.normalizeStockSymbol(latest.stock_symbol || '');
        const saved = this.latestStockPrice(latest);
        const message = saved
          ? `Manual price could not be saved. Showing the last saved ${this.priceSourceLabel(saved.source)} price from ${saved.date}.`
          : 'Manual price could not be saved. Grant and ESPP purchase prices remain the valuation fallback.';
        if (symbol) this.stockQuoteStatuses[symbol] = { state: 'error', message };
        else this.manualPriceNotice[row.id] = message;
        this.toastService.error(failureCopy('save', 'this share price', 'Try again.'));
      }
    }).finally(() => {
      this.savingStockPriceIds.delete(row.id);
      if (!this.destroyed) this.cdr.markForCheck();
    });
  }

  refreshStockTicker(symbol: string): void {
    void this.fetchAndSaveStockQuote(symbol);
  }

  isStockTickerRefreshing(symbol: string): boolean {
    return this.refreshingStockSymbols.has(this.normalizeStockSymbol(symbol));
  }

  isStockPriceSaving(rowId: number): boolean {
    return this.savingStockPriceIds.has(rowId);
  }

  private ensureStockPriceDrafts(rows: JobIncome[]): void {
    for (const row of rows) {
      if (!this.stockPriceDrafts[row.id]) this.stockPriceDrafts[row.id] = this.newStockPriceDraft(row);
    }
  }

  private newStockPriceDraft(row: JobIncome): StockPriceDraft {
    const latest = this.latestStockPrice(row);
    return { date: todayIsoDate(), price: latest ? String(latest.price_per_share) : '' };
  }

  private async fetchAndSaveStockQuote(rawSymbol: string): Promise<void> {
    const symbol = this.normalizeStockSymbol(rawSymbol);
    if (this.destroyed || !symbol || this.refreshingStockSymbols.has(symbol)) return;
    const jobs = this.incomes.filter(row => this.normalizeStockSymbol(row.stock_symbol || '') === symbol);
    if (!jobs.length) return;

    this.refreshingStockSymbols.add(symbol);
    this.stockQuoteStatuses[symbol] = { state: 'loading', message: '' };
    this.cdr.markForCheck();
    try {
      const result = await this.marketRefresh.refreshSymbol(symbol);
      if (this.destroyed) return;
      if (result.error) {
        this.markQuoteUnavailable(symbol, result.error);
        return;
      }
      if (result.failedRecords.length) {
        const latest = this.incomes.find(row => this.normalizeStockSymbol(row.stock_symbol || '') === symbol);
        const saved = latest ? this.latestStockPrice(latest) : undefined;
        this.markQuoteUnavailable(symbol, saved
          ? `Some quote records could not be saved. Showing the last saved ${this.priceSourceLabel(saved.source)} price from ${saved.date}.`
          : 'Some quote records could not be saved; existing valuation fallbacks remain.');
        return;
      }
      const latest = this.incomes.find(row => this.normalizeStockSymbol(row.stock_symbol || '') === symbol);
      const saved = latest ? this.latestStockPrice(latest) : undefined;
      if (!result.employerValuationsUpdated || !saved) {
        this.markQuoteUnavailable(symbol, 'No employer valuation was changed. Any existing dated price remains available.');
        return;
      }
      this.stockQuoteStatuses[symbol] = {
        state: 'updated',
        message: `Market quote saved at $${Number(saved.price_per_share).toFixed(4)} per share for ${saved.date} (${this.priceSourceLabel(saved.source)}). Historical snapshots use only prices dated on or before their selected date.`,
      };
    } catch {
      if (!this.destroyed) this.markQuoteUnavailable(symbol, 'Market quote refresh failed.');
    } finally {
      this.refreshingStockSymbols.delete(symbol);
      if (!this.destroyed) this.cdr.markForCheck();
    }
  }

  private async enqueueJobIncomeUpdate(
    id: number,
    buildBody: (latest: JobIncome) => Partial<JobIncomeCreate> | null,
    fallback?: JobIncome,
    silent = false,
  ): Promise<JobIncome | null> {
    const previous = this.jobUpdateQueues.get(id) || Promise.resolve(null);
    const pending = previous.catch(() => null).then(async () => {
      if (this.destroyed) return null;
      const latest = this.incomes.find(row => row.id === id) || fallback;
      if (!latest) return null;
      const body = buildBody(latest);
      if (!body || this.destroyed) return null;
      return await firstValueFrom(this.financeService.updateJobIncome(id, body, silent));
    });
    this.jobUpdateQueues.set(id, pending);
    try {
      return await pending;
    } finally {
      if (this.jobUpdateQueues.get(id) === pending) this.jobUpdateQueues.delete(id);
    }
  }

  private markQuoteUnavailable(symbol: string, reason: string): void {
    const latest = this.incomes
      .filter(row => this.normalizeStockSymbol(row.stock_symbol || '') === symbol)
      .map(row => this.latestStockPrice(row))
      .filter((price): price is JobStockValuation => Boolean(price))
      .sort((a, b) => b.date.localeCompare(a.date))[0];
    this.stockQuoteStatuses[symbol] = latest
      ? { state: 'stale', message: `${reason} Showing the last saved ${this.priceSourceLabel(latest.source)} price from ${latest.date}; it may be stale.` }
      : { state: 'unavailable', message: `${reason} No dated price is saved; grant and ESPP purchase prices remain the fallback.` };
  }

  private normalizeStockSymbol(symbol: string): string {
    return symbol.trim().toUpperCase();
  }

  private priceSourceLabel(source?: string | null): string {
    if (!source || source === 'manual') return 'manual price';
    return source.replaceAll('_', ' ');
  }

  jobStatus(row: JobIncome): string {
    if (row.end_date && row.end_date < todayIsoDate()) return 'ended';
    if (!row.is_active) return 'inactive';
    return row.effective_date > todayIsoDate() ? 'upcoming' : 'active';
  }

  applyEstimatedTaxes(): void {
    this.form.taxes_per_period = this.estimatedTaxesPerPeriod;
    this.cdr.markForCheck();
  }

  copyPreTaxToDeductions(): void {
    this.form.deductions_per_period = this.roundMoney(Number(this.taxEstimator.preTaxDeductionsPerPeriod || 0));
    this.cdr.markForCheck();
  }

  closeModal(): void {
    this.showModal = false;
    this.editingId = null;
    this.editingJobSnapshot = null;
    this.jobSaveError = '';
    this.fieldErrors = [];
    this.formSubmitted = false;
    this.moreOptionsOpen = false;
    this.taxOptionsOpen = false;
    this.historyOptionsOpen = false;
    this.form = this.emptyForm();
  }

  revalidate(): void {
    if (!this.formSubmitted) return;
    this.fieldErrors = this.jobIssues();
    this.cdr.markForCheck();
  }

  fieldError(field: string): string | null {
    return this.formSubmitted ? this.fieldErrors.find(error => error.field === field)?.message ?? null : null;
  }

  focusNamed(field: string): void {
    document.getElementById('job-form')?.querySelector<HTMLElement>(`[data-field="${field}"]`)?.focus();
  }

  saveIncome(): void {
    const jobIssues = this.jobIssues();
    this.fieldErrors = jobIssues;
    this.formSubmitted = true;
    if (jobIssues.length) {
      this.revealSectionsForErrors(jobIssues);
      this.jobSaveError = '';
      this.cdr.markForCheck();
      setTimeout(() => focusErrorSummary(document.getElementById('job-form')));
      return;
    }
    const pay = validateMoney(this.form.base_pay, {
      allowZero: false,
      negativeMessage: 'Enter yearly pay above $0.',
      emptyMessage: 'Enter yearly pay above $0.',
    });
    if ('cents' in pay) this.form.base_pay = toDollars(pay.cents);
    const savedPay = savedPayFromEditor(this.editorPay);
    const wasEditing = this.editingId !== null;
    this.saving = true;
    const payload: JobIncomeCreate = {
      ...this.form,
      employer: this.form.employer.trim(),
      end_date: this.form.end_date || null,
      payday_frequency: this.form.payday_frequency || null,
      first_pay_date: this.form.first_pay_date || null,
      second_pay_day: this.form.payday_frequency === 'semimonthly' && this.form.second_pay_day != null
        ? Number(this.form.second_pay_day)
        : null,
      stock_symbol: this.normalizeStockSymbol(this.form.stock_symbol || '') || null,
      promotions: [...(this.form.promotions || [])]
        .map(item => ({ ...item, annual_base_pay: this.roundMoney(item.annual_base_pay), role_title: item.role_title?.trim() || '' }))
        .sort((a, b) => a.date.localeCompare(b.date)),
      compensation_payments: [...(this.form.compensation_payments || [])]
        .map(item => ({ ...item, amount: this.roundMoney(item.amount), label: item.label?.trim() || '' }))
        .sort((a, b) => a.date.localeCompare(b.date)),
      stock_grants: [...(this.form.stock_grants || [])]
        .map(item => ({
          ...item,
          label: item.label?.trim() || '',
          quantity: Number(item.quantity),
          price_at_grant: Number(item.price_at_grant),
          sales: [...(item.sales || [])]
            .map(sale => ({ ...sale, shares: Number(sale.shares), cash_proceeds: this.roundMoney(sale.cash_proceeds) }))
            .sort((a, b) => a.date.localeCompare(b.date)),
        }))
        .sort((a, b) => a.date.localeCompare(b.date)),
      stock_purchases: [...(this.form.stock_purchases || [])]
        .map(item => ({
          ...item,
          label: item.label?.trim() || '',
          quantity: Number(item.quantity),
          price_paid_per_share: Number(item.price_paid_per_share),
          market_price_at_purchase: item.market_price_at_purchase == null || String(item.market_price_at_purchase).trim() === ''
            ? null
            : Number(item.market_price_at_purchase),
          sales: [...(item.sales || [])]
            .map(sale => ({ ...sale, shares: Number(sale.shares), cash_proceeds: this.roundMoney(sale.cash_proceeds) }))
            .sort((a, b) => a.date.localeCompare(b.date)),
        }))
        .sort((a, b) => a.date.localeCompare(b.date)),
      role_title: this.form.role_title?.trim() || '',
      notes: this.form.notes?.trim() || '',
      pay_frequency: savedPay.pay_frequency,
      base_pay: savedPay.base_pay,
      hours_per_week: savedPay.hours_per_week,
      annual_bonus: this.roundMoney(this.form.annual_bonus || 0),
      annual_equity: this.roundMoney(this.form.annual_equity || 0),
      annual_other: this.roundMoney(this.form.annual_other || 0),
      taxes_per_period: savedPay.taxes_per_period,
      deductions_per_period: savedPay.deductions_per_period,
      annual_taxes: savedPay.annual_taxes,
      annual_deductions: savedPay.annual_deductions,
    };
    this.jobSaveError = '';
    const saveId = this.editingId;
    const request =
      saveId !== null
        ? from(this.enqueueJobIncomeUpdate(saveId, latest => ({
            ...payload,
            stock_valuations: [...(latest.stock_valuations || [])],
          }), this.editingJobSnapshot || undefined, true))
        : this.financeService.addJobIncome(payload, true);

    request.pipe(takeUntil(this.destroy$)).subscribe({
      next: saved => {
        this.saving = false;
        if (!saved) {
          this.jobSaveError = dialogSaveAlert();
          this.cdr.markForCheck();
          setTimeout(() => focusDialogAlert(document.getElementById('job-form')));
          return;
        }
        this.closeModal();
        this.toastService.success(successCopy('Job', wasEditing ? 'saved' : 'added'));
        if (saved?.stock_symbol) this.refreshStockTicker(saved.stock_symbol);
        this.cdr.markForCheck();
      },
      error: () => {
        this.saving = false;
        this.jobSaveError = dialogSaveAlert();
        this.cdr.markForCheck();
        setTimeout(() => focusDialogAlert(document.getElementById('job-form')));
      },
    });
  }

  async deleteIncome(row: JobIncome): Promise<void> {
    const ok = await this.confirmService.ask(
      'Delete income?',
      `Remove ${row.employer} from your income schema?`,
      'Delete',
      'Cancel'
    );
    if (!ok) return;
    this.financeService.deleteJobIncome(row.id, true).pipe(takeUntil(this.destroy$)).subscribe({
      next: () => this.toastService.success('Job deleted'),
      error: () => this.toastService.error(failureCopy('delete', 'this job'), {
        label: 'Try again',
        run: () => { void this.deleteIncome(row); },
      }),
    });
  }

  payFrequencyLabel(value: string): string {
    return storedPayFrequencyLabel(value);
  }

  private snapshotInput() {
    return {
      pay_frequency: this.basePayUnit,
      base_pay: this.form.base_pay,
      hours_per_week: this.form.hours_per_week,
      taxes_per_period: this.form.taxes_per_period,
      deductions_per_period: this.form.deductions_per_period,
      payday_frequency: this.form.payday_frequency,
    };
  }

  private applyEditorPay(pay: EditorPay): void {
    this.form.pay_frequency = pay.unit;
    this.form.base_pay = pay.basePay;
    this.form.hours_per_week = pay.hoursPerWeek;
    this.form.taxes_per_period = pay.taxesPerPeriod;
    this.form.deductions_per_period = pay.deductionsPerPeriod;
  }

  private jobIssues(): FieldIssue[] {
    const jobIssues = validateJob({
      employer: this.form.employer,
      basePay: this.form.base_pay,
      payFrequency: this.form.pay_frequency,
      hoursPerWeek: this.form.hours_per_week,
      paydayFrequency: this.form.payday_frequency,
      nextPayday: this.form.first_pay_date,
      taxes: this.form.taxes_per_period,
      deductions: this.form.deductions_per_period,
    });
    const historyError = jobHistoryError(this.form);
    if (historyError) jobIssues.push({ field: 'endDate', label: 'End date', message: historyError });
    return jobIssues;
  }

  private revealSectionsForErrors(errors: FieldIssue[]): void {
    const fields = new Set(errors.map(error => error.field));
    if (fields.has('endDate') || fields.has('taxes') || fields.has('deductions')) this.moreOptionsOpen = true;
    if (fields.has('taxes') || fields.has('deductions')) this.taxOptionsOpen = true;
  }

  private syncOptionSections(): void {
    const role = this.form.role_title?.trim();
    const notes = this.form.notes?.trim();
    const taxes = Number(this.form.taxes_per_period) || Number(this.form.deductions_per_period)
      || Number(this.form.annual_bonus) || Number(this.form.annual_equity) || Number(this.form.annual_other);
    const history = (this.form.promotions || []).length
      || (this.form.compensation_payments || []).length
      || (this.form.stock_grants || []).length
      || (this.form.stock_purchases || []).length
      || (this.form.stock_valuations || []).length
      || this.form.stock_symbol?.trim();
    this.taxOptionsOpen = Boolean(taxes);
    this.historyOptionsOpen = Boolean(history);
    this.moreOptionsOpen = Boolean(role || notes || this.form.end_date || taxes || history);
  }

  private roundMoney(value: number): number {
    return Math.round((value || 0) * 100) / 100;
  }

  private estimatedFederalEffectiveRate(annualIncome: number, filingStatus: string): number {
    const single = annualIncome < 50000 ? 0.10 : annualIncome < 100000 ? 0.15 : annualIncome < 200000 ? 0.19 : 0.23;
    if (filingStatus === 'married_joint') return Math.max(single - 0.035, 0.08);
    if (filingStatus === 'head_of_household') return Math.max(single - 0.015, 0.09);
    return single;
  }

  private estimatedStateRate(bucket: string): number {
    if (bucket === 'none') return 0;
    if (bucket === 'low') return 0.025;
    if (bucket === 'medium') return 0.045;
    if (bucket === 'high') return 0.07;
    return 0.04;
  }
}
