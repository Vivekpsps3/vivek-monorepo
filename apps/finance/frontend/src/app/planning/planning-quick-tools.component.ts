import { ChangeDetectionStrategy, ChangeDetectorRef, Component, Input, OnChanges, OnDestroy, OnInit, SimpleChanges, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { UiCardComponent } from '@vivek/ui';
import { bindLockSnapshots } from '../crypto/lock-finance';
import { PROJECTED_RESULT_NOTE } from './planning-copy';
import {
  clearPlanningDrafts,
  readDebtDraft,
  readRetirementDraft,
  readSavingsDraft,
  retainPlanningDraftsUntilLock,
  writeDebtDraft,
  writeRetirementDraft,
  writeSavingsDraft,
} from './planning-session';
import { formatEstimate, formatStoredMoney } from '../shared/stored-money';
import { PlanningInputsPreview, PlanningToolId, SpendingComponents } from '../models/planning.model';
import {
  addCalendarMonths,
  calculateDebtPayoffMonths,
  calculateDebtTotalInterest,
  calculateFireTarget,
  calculateGoalProjectedValue,
  calculateMonthlyGoalContribution,
} from './planning-tools.util';
import { AppDatePipe } from '@vivek/ui';

@Component({
  selector: 'app-planning-quick-tools',
  standalone: true,
  imports: [
    AppDatePipe, CommonModule, FormsModule, RouterLink, UiCardComponent],
  templateUrl: './planning-quick-tools.component.html',
  styleUrl: './planning-quick-tools.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PlanningQuickToolsComponent implements OnChanges, OnInit, OnDestroy {
  @Input() activeTool: PlanningToolId = 'overview';
  @Input() inputs: PlanningInputsPreview | null = null;
  @Input() annualSpending = 0;
  @Input() annualCashflow = 0;
  @Input() spendingMode: 'recurring' | 'components' | 'manual' = 'recurring';
  @Input() spendingComponents: SpendingComponents = { fixed_annual: 0, variable_annual: 0, irregular_annual: 0 };
  /** False when yearly spending was never recorded or entered. Zero is still a result. */
  @Input() showRetirementResults = true;
  @Input() retirementBasisNote = '';

  readonly projectedNote = PROJECTED_RESULT_NOTE;
  fire = { withdrawalRate: 0.04, extraAnnualExpenses: 0, includeRecurringExpenses: true };
  goal = { name: 'Savings goal', targetAmount: 100000, currentSaved: 0, years: 5, expectedReturn: 0.07 };
  debt = { name: 'Debt', balance: 0, apr: 0.08, minimumPayment: 250, extraPayment: 250 };
  selectedDebtLiabilityId: number | null = null;
  debtSourceMessage = '';
  private draftsClosed = false;
  private releaseDraftLock: (() => void) | null = null;
  private readonly cdr = inject(ChangeDetectorRef);

  ngOnInit(): void {
    retainPlanningDraftsUntilLock();
    this.releaseDraftLock = bindLockSnapshots(() => this.onLock());
    const retirement = readRetirementDraft();
    if (retirement) this.fire = retirement;
    const savings = readSavingsDraft();
    if (savings) this.goal = savings;
    const debt = readDebtDraft();
    if (debt) {
      this.debt = {
        name: debt.name,
        balance: debt.balance,
        apr: debt.apr,
        minimumPayment: debt.minimumPayment,
        extraPayment: debt.extraPayment,
      };
      this.selectedDebtLiabilityId = debt.liabilityId;
    }
  }

  ngOnDestroy(): void {
    this.draftsClosed = true;
    this.releaseDraftLock?.();
    this.releaseDraftLock = null;
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['inputs'] && this.selectedDebtLiabilityId != null) {
      const liability = this.inputs?.liability_sources?.find(row => row.id === this.selectedDebtLiabilityId);
      if (liability) {
        this.debt.balance = liability.balance_owed;
        this.debtSourceMessage = `Using ${liability.name} from Net worth · balance date ${liability.as_of_date || 'unknown'}.`;
        this.rememberDebt();
      } else {
        this.selectedDebtLiabilityId = null;
        this.debtSourceMessage = 'The selected liability was removed. Its last balance is kept as a manual estimate.';
        this.rememberDebt();
      }
    }
  }

  patchFire(patch: Partial<PlanningQuickToolsComponent['fire']>): void {
    this.fire = { ...this.fire, ...patch };
    this.rememberRetirement();
  }

  patchGoal(patch: Partial<PlanningQuickToolsComponent['goal']>): void {
    this.goal = { ...this.goal, ...patch };
    this.rememberSavings();
  }

  patchDebt(patch: Partial<PlanningQuickToolsComponent['debt']>): void {
    this.debt = { ...this.debt, ...patch };
    this.rememberDebt();
  }

  asPercent(value: number | null | undefined): number | null {
    return value == null || !Number.isFinite(Number(value)) ? null : Number(value) * 100;
  }

  fromPercent(value: number | string | null): number {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed / 100 : 0;
  }

  numberOrZero(value: number | string | null): number {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  formatMoney(value: number | null | undefined): string {
    return formatEstimate(value);
  }

  formatActual(value: number | null | undefined): string {
    return formatStoredMoney(value);
  }

  effectiveAnnualSpending(): number {
    return Number(this.annualSpending) || 0;
  }

  fireAnnualSpending(): number {
    const recurringSpending = this.spendingMode === 'components'
      ? this.spendingComponents.fixed_annual
      : Number(this.inputs?.recurring_annual_spending) || 0;
    const base = this.fire.includeRecurringExpenses
      ? this.effectiveAnnualSpending()
      : Math.max(0, this.effectiveAnnualSpending() - recurringSpending);
    return Math.max(0, base + Number(this.fire.extraAnnualExpenses || 0));
  }

  fireNumber(): number {
    return calculateFireTarget(this.fireAnnualSpending(), this.fire.withdrawalRate);
  }

  fireGap(): number {
    return Math.max(this.fireNumber() - Number(this.inputs?.net_worth_portfolio || 0), 0);
  }

  yearsToFire(): number | null {
    const gap = this.fireGap();
    if (gap <= 0) return 0;
    const annualSavings = Math.max(Number(this.annualCashflow) || 0, 0);
    return annualSavings <= 0 ? null : Math.ceil(gap / annualSavings);
  }

  fireEstimateDescription(): string {
    return 'Straight-line estimate: portfolio gap divided by today’s annual cashflow. It assumes the cashflow stays constant and excludes investment growth, taxes, and future changes in spending.';
  }

  monthlyGoalContribution(): number {
    return calculateMonthlyGoalContribution(this.goal);
  }

  goalProjectedValue(): number {
    return calculateGoalProjectedValue(this.goal);
  }

  debtMonthlyPayment(): number {
    return Number(this.debt.minimumPayment || 0) + Number(this.debt.extraPayment || 0);
  }

  debtPayoffMonths(): number | null {
    return calculateDebtPayoffMonths({
      balance: this.debt.balance,
      monthlyPayment: this.debtMonthlyPayment(),
      apr: this.debt.apr,
    });
  }

  debtTotalInterest(): number | null {
    return calculateDebtTotalInterest({
      balance: this.debt.balance,
      monthlyPayment: this.debtMonthlyPayment(),
      apr: this.debt.apr,
    });
  }

  debtPayoffDate(): string {
    const months = this.debtPayoffMonths();
    if (months == null) return '-';
    return addCalendarMonths(new Date(), months).toLocaleDateString(undefined, { month: 'short', year: 'numeric' });
  }

  selectDebtLiability(value: string): void {
    const id = value === '' ? null : Number.parseInt(value, 10);
    this.selectedDebtLiabilityId = Number.isFinite(id as number) ? id : null;
    const liability = this.inputs?.liability_sources?.find(row => row.id === this.selectedDebtLiabilityId);
    if (liability) {
      this.debt.name = liability.name;
      this.debt.balance = liability.balance_owed;
      this.debtSourceMessage = `Using ${liability.name} from Net worth · balance date ${liability.as_of_date || 'unknown'}.`;
    } else {
      this.debt.name = 'Debt estimate';
      this.debt.balance = 0;
      this.debtSourceMessage = 'Enter an amount for a hypothetical debt. No real liability is selected.';
    }
    this.rememberDebt();
  }

  private onLock(): void {
    this.draftsClosed = true;
    clearPlanningDrafts();
    this.fire = { withdrawalRate: 0.04, extraAnnualExpenses: 0, includeRecurringExpenses: true };
    this.goal = { name: 'Savings goal', targetAmount: 100000, currentSaved: 0, years: 5, expectedReturn: 0.07 };
    this.debt = { name: 'Debt', balance: 0, apr: 0.08, minimumPayment: 250, extraPayment: 250 };
    this.selectedDebtLiabilityId = null;
    this.debtSourceMessage = '';
    this.cdr.markForCheck();
  }

  private rememberRetirement(): void {
    if (this.draftsClosed) return;
    writeRetirementDraft(this.fire);
  }

  private rememberSavings(): void {
    if (this.draftsClosed) return;
    writeSavingsDraft(this.goal);
  }

  private rememberDebt(): void {
    if (this.draftsClosed) return;
    writeDebtDraft({ ...this.debt, liabilityId: this.selectedDebtLiabilityId });
  }
}
