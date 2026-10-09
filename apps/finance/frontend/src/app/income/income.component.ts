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
import { ConfirmService } from '../services/confirm.service';
import { ToastService } from '../services/toast.service';
import { IncomePayFrequency, JobIncome, JobIncomeCreate } from '../models/transaction.model';
import { annualBasePayAt, isCurrentJob, jobHistoryError } from '../utils/job-compensation.util';
import { todayIsoDate } from '../utils/date.util';
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
} from '../shared/ui';

@Component({
  selector: 'app-income',
  standalone: true,
  imports: [
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
  styleUrl: './income.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class IncomeComponent implements OnInit, OnDestroy {
  @Input() embedded = false;
  @Input() compensationTracking = false;
  isCurrentJob = isCurrentJob;
  incomes: JobIncome[] = [];
  showModal = false;
  saving = false;
  editingId: number | null = null;
  form: JobIncomeCreate = this.emptyForm();
  taxEstimator = {
    state: 'average',
    filingStatus: 'single',
    preTaxDeductionsPerPeriod: 0,
  };

  readonly payFrequencyOptions: UiSelectOption[] = [
    { value: 'annual', label: 'Annual salary' },
    { value: 'monthly', label: 'Monthly' },
    { value: 'semimonthly', label: 'Twice monthly' },
    { value: 'biweekly', label: 'Every two weeks' },
    { value: 'weekly', label: 'Weekly' },
    { value: 'hourly', label: 'Hourly' },
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

  constructor(
    private financeService: FinanceService,
    private confirmService: ConfirmService,
    private toastService: ToastService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    this.financeService.jobIncomes$.pipe(takeUntil(this.destroy$)).subscribe(rows => {
      this.incomes = rows;
      this.cdr.markForCheck();
    });
    this.financeService.getJobIncomes().pipe(takeUntil(this.destroy$)).subscribe();
  }

  ngOnDestroy(): void {
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

  get activeMonthlyTotal(): number {
    return this.activeAnnualNet / 12;
  }

  get formAnnualBase(): number {
    const base = Number(this.form.base_pay || 0);
    if (this.form.pay_frequency === 'monthly') return base * 12;
    if (this.form.pay_frequency === 'semimonthly') return base * 24;
    if (this.form.pay_frequency === 'biweekly') return base * 26;
    if (this.form.pay_frequency === 'weekly') return base * 52;
    if (this.form.pay_frequency === 'hourly') return base * Number(this.form.hours_per_week || 0) * 52;
    return base;
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
    return this.formPeriodAdjustments * this.payPeriodsPerYear;
  }

  get formAnnualNet(): number {
    return Math.max(this.formAnnualGross - this.formAnnualAdjustments, 0);
  }

  get formPeriodGross(): number {
    return this.formAnnualGross / this.payPeriodsPerYear;
  }

  get formPeriodAdjustments(): number {
    return Number(this.form.taxes_per_period || 0) + Number(this.form.deductions_per_period || 0);
  }

  get formPeriodNet(): number {
    return Math.max(this.formPeriodGross - this.formPeriodAdjustments, 0);
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

  get basePayLabel(): string {
    if (this.form.pay_frequency === 'hourly') return 'Hourly rate';
    if (this.form.pay_frequency === 'annual') return 'Annual base pay';
    return 'Base pay per period';
  }

  get payPeriodLabel(): string {
    if (this.form.pay_frequency === 'annual') return 'annual';
    if (this.form.pay_frequency === 'monthly') return 'monthly';
    if (this.form.pay_frequency === 'semimonthly') return 'twice-monthly';
    if (this.form.pay_frequency === 'biweekly') return 'biweekly';
    return 'weekly';
  }

  get payPeriodsPerYear(): number {
    return this.periodsPerYear(this.form.pay_frequency);
  }

  private emptyForm(): JobIncomeCreate {
    return {
      employer: '',
      role_title: '',
      pay_frequency: 'annual',
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
      is_active: true,
      notes: '',
    };
  }

  openAddModal(): void {
    this.editingId = null;
    this.form = this.emptyForm();
    this.taxEstimator = { state: 'average', filingStatus: 'single', preTaxDeductionsPerPeriod: 0 };
    this.showModal = true;
  }

  openEditModal(row: JobIncome): void {
    this.editingId = row.id;
    this.form = {
      employer: row.employer,
      role_title: row.role_title || '',
      pay_frequency: row.pay_frequency as IncomePayFrequency,
      base_pay: row.base_pay,
      hours_per_week: row.hours_per_week ?? null,
      annual_bonus: row.annual_bonus,
      annual_equity: row.annual_equity,
      annual_other: row.annual_other,
      annual_taxes: row.annual_taxes,
      annual_deductions: row.annual_deductions,
      taxes_per_period: row.taxes_per_period,
      deductions_per_period: row.deductions_per_period,
      effective_date: row.effective_date,
      end_date: row.end_date || null,
      promotions: (row.promotions || []).map(item => ({ ...item })),
      compensation_payments: (row.compensation_payments || []).map(item => ({ ...item })),
      is_active: row.is_active,
      notes: row.notes || '',
    };
    this.showModal = true;
  }

  addPromotion(): void {
    this.form.promotions!.push({ date: '', annual_base_pay: annualBasePayAt(this.form), role_title: '' });
  }

  addCompensationPayment(): void {
    this.form.compensation_payments!.push({ date: '', kind: 'bonus', amount: 0, label: '' });
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
    this.form = this.emptyForm();
  }

  saveIncome(): void {
    if (!this.form.employer.trim()) {
      this.toastService.error('Employer is required.');
      return;
    }
    if (this.form.base_pay < 0) {
      this.toastService.error('Base pay must be non-negative.');
      return;
    }
    if (this.form.pay_frequency === 'hourly' && !this.form.hours_per_week) {
      this.toastService.error('Hours per week is required for hourly income.');
      return;
    }

    const historyError = jobHistoryError(this.form);
    if (historyError) {
      this.toastService.error(historyError);
      return;
    }
    const wasEditing = this.editingId !== null;
    this.saving = true;
    const payload: JobIncomeCreate = {
      ...this.form,
      employer: this.form.employer.trim(),
      end_date: this.form.end_date || null,
      promotions: [...(this.form.promotions || [])]
        .map(item => ({ ...item, annual_base_pay: this.roundMoney(item.annual_base_pay), role_title: item.role_title?.trim() || '' }))
        .sort((a, b) => a.date.localeCompare(b.date)),
      compensation_payments: [...(this.form.compensation_payments || [])]
        .map(item => ({ ...item, amount: this.roundMoney(item.amount), label: item.label?.trim() || '' }))
        .sort((a, b) => a.date.localeCompare(b.date)),
      role_title: this.form.role_title?.trim() || '',
      notes: this.form.notes?.trim() || '',
      base_pay: this.roundMoney(this.form.base_pay),
      hours_per_week: this.form.pay_frequency === 'hourly' ? this.form.hours_per_week : null,
      annual_bonus: this.roundMoney(this.form.annual_bonus || 0),
      annual_equity: this.roundMoney(this.form.annual_equity || 0),
      annual_other: this.roundMoney(this.form.annual_other || 0),
      taxes_per_period: this.roundMoney(this.form.taxes_per_period || 0),
      deductions_per_period: this.roundMoney(this.form.deductions_per_period || 0),
      annual_taxes: this.roundMoney((this.form.taxes_per_period || 0) * this.payPeriodsPerYear),
      annual_deductions: this.roundMoney((this.form.deductions_per_period || 0) * this.payPeriodsPerYear),
    };
    const request =
      this.editingId !== null
        ? this.financeService.updateJobIncome(this.editingId, payload)
        : this.financeService.addJobIncome(payload);

    request.pipe(takeUntil(this.destroy$)).subscribe({
      next: () => {
        this.saving = false;
        this.closeModal();
        this.toastService.success(wasEditing ? 'Income updated' : 'Income added');
        this.cdr.markForCheck();
      },
      error: () => {
        this.saving = false;
        this.cdr.markForCheck();
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
    this.financeService.deleteJobIncome(row.id).pipe(takeUntil(this.destroy$)).subscribe({
      next: () => this.toastService.success('Income deleted'),
    });
  }

  payFrequencyLabel(value: string): string {
    return this.payFrequencyOptions.find(option => option.value === value)?.label || value;
  }

  private roundMoney(value: number): number {
    return Math.round((value || 0) * 100) / 100;
  }

  private periodsPerYear(frequency: IncomePayFrequency): number {
    if (frequency === 'monthly') return 12;
    if (frequency === 'semimonthly') return 24;
    if (frequency === 'biweekly') return 26;
    if (frequency === 'weekly' || frequency === 'hourly') return 52;
    return 1;
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
