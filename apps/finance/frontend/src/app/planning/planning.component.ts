import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  EventEmitter,
  Component,
  Input,
  OnChanges,
  OnDestroy,
  OnInit,
  Output,
  SimpleChanges,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Subject, auditTime, finalize, forkJoin, takeUntil } from 'rxjs';
import { FinanceDataChange, FinanceService } from '../services/finance.service';
import { PlanningService } from '../services/planning.service';
import { ConfirmService } from '../services/confirm.service';
import { ToastService } from '../services/toast.service';
import {
  DEFAULT_MC_ASSUMPTIONS,
  MC_FAN_PATHS_PERSIST_MAX,
  MC_N_PATHS_MIN,
  MC_N_PATHS_MAX,
  MC_TOOL_ID,
  PLANNING_DISCLAIMER,
  PlanningCashflowEvent,
  PlanningCheckpoint,
  PlanningCheckpointResult,
  PlanningInputsPreview,
  PlanningToolId,
  PlanningProfile,
  PlanningProjectionRow,
  PlanningRun,
  ProfilePayload,
  SpendingComponents,
} from '../models/planning.model';
import { MonteCarloFanChartComponent, McChartData } from './monte-carlo-fan-chart.component';
import {
  UiButtonComponent,
  UiCardComponent,
  UiDataTableComponent,
  UiIconComponent,
  UiPageHeaderComponent,
  UiSkeletonComponent,
} from '../shared/ui';
import {
  EvidenceCard,
  evidenceKindLabel,
  planningEvidenceCards,
} from '../utils/evidence-labels.util';
import { BankAccountRecord, ImportReceipt, Transaction } from '../models/transaction.model';
import {
  buildSpendingSuggestion,
  lastThreeCompletedMonths,
  spendingCategories,
} from '../utils/planning-spending.util';
import { inferredPortfolioAllocation } from '../utils/planning-allocation.util';

@Component({
  selector: 'app-planning',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    RouterLink,
    UiPageHeaderComponent,
    UiCardComponent,
    UiButtonComponent,
    UiSkeletonComponent,
    UiIconComponent,
    UiDataTableComponent,
    MonteCarloFanChartComponent,
  ],
  templateUrl: './planning.component.html',
  styleUrl: './planning.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PlanningComponent implements OnInit, OnChanges, OnDestroy {
  @Input() embedded = false;
  @Input() tool: PlanningToolId = 'overview';
  @Output() toolChange = new EventEmitter<PlanningToolId>();
  readonly disclaimer = PLANNING_DISCLAIMER;
  readonly evidenceKindLabel = evidenceKindLabel;
  activeTool: PlanningToolId = 'overview';

  loading = true;
  running = false;
  error: string | null = null;

  inputs: PlanningInputsPreview | null = null;
  assumptions: ProfilePayload = structuredClone(DEFAULT_MC_ASSUMPTIONS);

  useTxSpending = true;
  spendingMode: 'recurring' | 'components' | 'manual' = 'recurring';
  useTxIncome = true;
  useNetCashflowOverride = false;
  useInferredAllocation = true;
  useLedgerStartingNetWorth = true;
  startingNetWorth: number | null = null;

  readonly mcNPathsMin = MC_N_PATHS_MIN;
  readonly mcNPathsMax = MC_N_PATHS_MAX;
  readonly mcFanPathsPersistMax = MC_FAN_PATHS_PERSIST_MAX;

  horizonYears = 30;
  nPaths = 500;
  seed = 1;

  get evidenceCards(): EvidenceCard[] {
    return planningEvidenceCards({
      usesLedgerNetWorth: this.useLedgerStartingNetWorth,
      usesRecurringSpending: this.useTxSpending,
      usesRecurringIncome: this.useTxIncome,
      horizonYears: this.horizonYears,
      nPaths: this.nPaths,
    });
  }

  fire = {
    withdrawalRate: 0.04,
    extraAnnualExpenses: 0,
    includeRecurringExpenses: true,
  };

  goal = {
    name: 'Savings goal',
    targetAmount: 100000,
    currentSaved: 0,
    years: 5,
    expectedReturn: 0.07,
  };

  debt = {
    name: 'Debt',
    balance: 0,
    apr: 0.08,
    minimumPayment: 250,
    extraPayment: 250,
  };

  lastRun: PlanningRun | null = null;
  baselineRun: PlanningRun | null = null;
  scenarioRun: PlanningRun | null = null;
  chartData: McChartData | null = null;
  runStale = false;
  runStaleMessage = '';
  sourceRefreshError: string | null = null;

  spendingTransactions: Transaction[] = [];
  spendingReceipts: ImportReceipt[] = [];
  spendingAccounts: BankAccountRecord[] = [];
  selectedSpendingAccountKeys: string[] = [];
  selectedSpendingCategories: string[] = [];
  excludedRecurringTransactionIds: number[] = [];
  acceptingSpendingSuggestion = false;

  profiles: PlanningProfile[] = [];
  selectedProfileId: number | null = null;
  savedInputName = '';
  savingProfile = false;
  selectedDebtLiabilityId: number | null = null;
  debtSourceMessage = '';

  private destroy$ = new Subject<void>();
  private inputRefreshRequest = 0;
  private financeChangeVersion = 0;

  constructor(
    private planning: PlanningService,
    private confirm: ConfirmService,
    private toast: ToastService,
    private cdr: ChangeDetectorRef,
    private finance: FinanceService,
  ) {}

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['tool']) this.activeTool = this.validTool(this.tool);
  }

  ngOnInit(): void {
    this.activeTool = this.validTool(this.tool);
    this.randomizeSeed();
    this.planning.listProfiles().pipe(takeUntil(this.destroy$)).subscribe({
      next: list => {
        this.profiles = list;
        this.cdr.markForCheck();
      },
    });
    this.planning
      .getInputs()
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => {
          this.loading = false;
          this.cdr.markForCheck();
        })
      )
      .subscribe({
        next: inp => {
          this.inputs = inp;
          this.assumptions.annual_spending = null;
          this.assumptions.spending_mode = 'recurring';
          this.assumptions.spending_components = this.defaultSpendingComponents(inp);
          this.spendingMode = 'recurring';
          this.assumptions.monthly_income = inp.avg_monthly_income || null;
          this.assumptions.portfolio_allocation = this.inferredAllocation();
          this.assumptions.checkpoints = this.defaultCheckpoints(inp);
          this.startingNetWorth = inp.net_worth_total;
        },
        error: err => {
          this.error = err?.message ?? 'Could not load planning inputs.';
        },
      });

    this.planning.getSpendingSuggestionContext().pipe(takeUntil(this.destroy$)).subscribe({
      next: context => {
        this.spendingTransactions = context.transactions;
        this.spendingReceipts = context.receipts;
        this.spendingAccounts = context.accounts.filter(account => account.confirmed);
        this.cdr.markForCheck();
      },
      error: () => {
        // Planning remains usable with manual inputs when no receipt history is available.
        this.spendingTransactions = [];
        this.spendingReceipts = [];
        this.spendingAccounts = [];
        this.cdr.markForCheck();
      },
    });

    this.finance.dataChanges$.pipe(
      auditTime(120),
      takeUntil(this.destroy$),
    ).subscribe(change => this.onFinanceDataChange(change));

  }

  private defaultSpendingComponents(inp: PlanningInputsPreview): SpendingComponents {
    return {
      fixed_annual: Number(inp.recurring_annual_spending ?? inp.implied_annual_spending) || 0,
      variable_annual: 0,
      irregular_annual: 0,
    };
  }

  get spendingPeriod() {
    return lastThreeCompletedMonths();
  }

  get availableSpendingCategories(): string[] {
    return spendingCategories(
      this.spendingTransactions,
      this.selectedSpendingAccountKeys,
      this.spendingPeriod
    );
  }

  get spendingSuggestion() {
    return buildSpendingSuggestion({
      transactions: this.spendingTransactions,
      receipts: this.spendingReceipts,
      accounts: this.spendingAccounts,
      selectedAccountKeys: this.selectedSpendingAccountKeys,
      selectedCategories: this.selectedSpendingCategories,
      excludedRecurringTransactionIds: this.excludedRecurringTransactionIds,
    });
  }

  get recurringExclusionCandidates(): Transaction[] {
    return buildSpendingSuggestion({
      transactions: this.spendingTransactions,
      receipts: this.spendingReceipts,
      accounts: this.spendingAccounts,
      selectedAccountKeys: this.selectedSpendingAccountKeys,
      selectedCategories: this.selectedSpendingCategories,
    }).eligibleTransactions;
  }

  get effectiveSpendingComponents(): SpendingComponents {
    const parts = this.assumptions.spending_components || this.defaultSpendingComponents(this.inputs || {
      recurring_annual_spending: 0, implied_annual_spending: 0,
    } as PlanningInputsPreview);
    return {
      fixed_annual: Number(parts.fixed_annual) || 0,
      variable_annual: Number(parts.variable_annual) || 0,
      irregular_annual: Number(parts.irregular_annual) || 0,
    };
  }

  get componentAnnualSpending(): number {
    const parts = this.effectiveSpendingComponents;
    return parts.fixed_annual + parts.variable_annual + parts.irregular_annual;
  }

  toggleSpendingAccount(key: string, checked: boolean): void {
    this.selectedSpendingAccountKeys = checked
      ? [...new Set([...this.selectedSpendingAccountKeys, key])]
      : this.selectedSpendingAccountKeys.filter(value => value !== key);
    this.selectedSpendingCategories = this.selectedSpendingCategories.filter(category =>
      this.availableSpendingCategories.includes(category)
    );
    this.cdr.markForCheck();
  }

  toggleSpendingCategory(category: string, checked: boolean): void {
    this.selectedSpendingCategories = checked
      ? [...new Set([...this.selectedSpendingCategories, category])]
      : this.selectedSpendingCategories.filter(value => value !== category);
    this.cdr.markForCheck();
  }

  toggleRecurringExclusion(id: number, checked: boolean): void {
    this.excludedRecurringTransactionIds = checked
      ? [...new Set([...this.excludedRecurringTransactionIds, id])]
      : this.excludedRecurringTransactionIds.filter(value => value !== id);
    this.cdr.markForCheck();
  }

  isSelected(values: number[] | string[], value: number | string): boolean {
    return (values as Array<number | string>).includes(value);
  }

  asPercent(value: number | null | undefined): number | null {
    return value == null || !Number.isFinite(Number(value)) ? null : Number(value) * 100;
  }

  fromPercent(value: number | string | null): number {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed / 100 : 0;
  }

  toggleAnnualEventScope(event: PlanningCashflowEvent, scope: 'baseline' | 'scenario' | 'both'): void {
    event.applies_to = scope;
  }

  eventsForCase(
    events: PlanningCashflowEvent[],
    scenario: 'baseline' | 'scenario'
  ): PlanningCashflowEvent[] {
    return events.filter(event => {
      const scope = event.applies_to || 'both';
      return scope === 'both' || scope === scenario;
    });
  }

  onSpendingModeChange(mode: 'recurring' | 'components' | 'manual'): void {
    const previousAmount = this.effectiveAnnualSpending();
    this.spendingMode = mode;
    this.assumptions.spending_mode = mode;
    this.useTxSpending = mode === 'recurring';
    if (mode === 'components' && !this.assumptions.spending_components) {
      this.assumptions.spending_components = this.defaultSpendingComponents(this.inputs || {
        recurring_annual_spending: 0, implied_annual_spending: 0,
      } as PlanningInputsPreview);
    }
    if (mode === 'manual' && this.assumptions.annual_spending == null) {
      this.assumptions.annual_spending = previousAmount;
    }
    this.cdr.markForCheck();
  }

  async acceptSpendingSuggestion(): Promise<void> {
    const suggestion = this.spendingSuggestion;
    if (!suggestion.canSuggest || suggestion.annualSuggestion == null) return;
    this.acceptingSpendingSuggestion = true;
    const acceptedPayload: ProfilePayload = {
      ...structuredClone(this.assumptions),
      spending_mode: 'components',
      spending_components: {
      ...this.effectiveSpendingComponents,
      variable_annual: suggestion.annualSuggestion,
      },
      spending_acceptance: {
        accepted_at: new Date().toISOString(),
        period_start: suggestion.period.start,
        period_end: suggestion.period.end,
        account_keys: [...this.selectedSpendingAccountKeys],
        categories: [...this.selectedSpendingCategories],
        excluded_recurring_transaction_ids: [...this.excludedRecurringTransactionIds],
        receipt_ids: suggestion.includedReceiptIds,
        annual_suggestion: suggestion.annualSuggestion,
      },
    };
    const normalizedAcceptedPayload = this.normalizedAssumptions('components', acceptedPayload);
    const current = this.profiles.find(profile => profile.id === this.selectedProfileId);
    const name = current?.name || this.savedInputName.trim() || `Planning estimate ${suggestion.period.end}`;
    const body = { name, payload: normalizedAcceptedPayload };
    const request = this.selectedProfileId != null
      ? this.planning.updateProfile(this.selectedProfileId, body)
      : this.planning.createProfile(body);
    request.pipe(takeUntil(this.destroy$), finalize(() => {
      this.acceptingSpendingSuggestion = false;
      this.cdr.markForCheck();
    })).subscribe({
      next: profile => {
        this.assumptions = normalizedAcceptedPayload;
        this.spendingMode = 'components';
        this.useTxSpending = false;
        if (this.selectedProfileId != null) {
          this.profiles = this.profiles.map(row => row.id === profile.id ? profile : row);
        } else {
          this.profiles = [...this.profiles, profile];
          this.selectedProfileId = profile.id;
        }
        this.savedInputName = profile.name;
        this.toast.success('Covered spending estimate accepted and saved.');
        this.cdr.markForCheck();
      },
      error: err => {
        this.error = err?.message ?? 'Could not save the accepted spending estimate.';
      },
    });
  }

  showSpendingFallbackBanner(): boolean {
    if (!this.useTxSpending) return false;
    const src = this.inputs?.annual_spending_source ?? '';
    return src === 'default_fallback_40000' || src.includes('default_fallback');
  }

  private validTool(tool: unknown): PlanningToolId {
    return tool === 'simulation' || tool === 'retirement-target' || tool === 'savings-goal' || tool === 'debt-payoff'
      ? tool
      : 'overview';
  }

  setTool(tool: PlanningToolId): void {
    this.activeTool = this.validTool(tool);
    this.toolChange.emit(this.activeTool);
    this.cdr.markForCheck();
  }

  showSpendingPlan(): boolean {
    return this.activeTool === 'overview' || this.activeTool === 'simulation' || this.activeTool === 'retirement-target';
  }

  showAdvancedEvidence(): boolean {
    return this.activeTool === 'overview' || this.activeTool === 'simulation' || this.activeTool === 'retirement-target';
  }

  showVariableCostWarning(): boolean {
    return this.spendingMode === 'recurring'
      || (this.spendingMode === 'components' && this.effectiveSpendingComponents.variable_annual <= 0);
  }

  private onFinanceDataChange(change: FinanceDataChange): void {
    const changed = new Set<string>(change.collections);
    const sourceInputsChanged = [
      'assets', 'liabilities', 'holdings', 'job_incomes', 'fixed_expenses', 'subscriptions',
    ].some(collection => changed.has(collection));
    const spendingHistoryChanged = [
      'transactions', 'bank_accounts', 'import_batches',
    ].some(collection => changed.has(collection));
    if (!sourceInputsChanged && !spendingHistoryChanged) return;
    this.financeChangeVersion += 1;

    if (this.lastRun) {
      this.runStale = true;
      this.runStaleMessage = change.source === 'remote'
        ? 'Your finance facts changed in another tab. These results still use the earlier facts.'
        : 'Your finance facts changed. These results still use the earlier facts.';
    }
    if (sourceInputsChanged || spendingHistoryChanged) this.refreshSourceFacts();
    if (spendingHistoryChanged) this.refreshSpendingHistory();
  }

  refreshSourceFacts(): void {
    const request = ++this.inputRefreshRequest;
    this.sourceRefreshError = null;
    this.planning.getInputs().pipe(takeUntil(this.destroy$)).subscribe({
      next: inputs => {
        if (request !== this.inputRefreshRequest) return;
        this.inputs = inputs;
        if (this.useLedgerStartingNetWorth) this.startingNetWorth = inputs.net_worth_total;
        if (this.selectedDebtLiabilityId != null) {
          const liability = inputs.liability_sources?.find(row => row.id === this.selectedDebtLiabilityId);
          if (liability) {
            this.debt.balance = liability.balance_owed;
            this.debtSourceMessage = `Using ${liability.name} from What you have · balance date ${liability.as_of_date || 'unknown'}.`;
          } else {
            this.selectedDebtLiabilityId = null;
            this.debtSourceMessage = 'The selected liability was removed. Its last balance is kept as a manual estimate.';
          }
        }
        this.cdr.markForCheck();
      },
      error: err => {
        if (request !== this.inputRefreshRequest) return;
        this.sourceRefreshError = err?.message ?? 'Could not refresh planning facts.';
        this.cdr.markForCheck();
      },
    });
  }

  private refreshSpendingHistory(): void {
    this.planning.getSpendingSuggestionContext().pipe(takeUntil(this.destroy$)).subscribe({
      next: context => {
        this.spendingTransactions = context.transactions;
        this.spendingReceipts = context.receipts;
        this.spendingAccounts = context.accounts.filter(account => account.confirmed);
        this.cdr.markForCheck();
      },
      error: () => {
        this.spendingTransactions = [];
        this.spendingReceipts = [];
        this.spendingAccounts = [];
        this.cdr.markForCheck();
      },
    });
  }

  selectDebtLiability(value: string): void {
    const id = value === '' ? null : Number.parseInt(value, 10);
    this.selectedDebtLiabilityId = Number.isFinite(id as number) ? id : null;
    const liability = this.inputs?.liability_sources?.find(row => row.id === this.selectedDebtLiabilityId);
    if (liability) {
      this.debt.name = liability.name;
      this.debt.balance = liability.balance_owed;
      this.debtSourceMessage = `Using ${liability.name} from What you have · balance date ${liability.as_of_date || 'unknown'}.`;
    } else {
      this.debt.name = 'Debt estimate';
      this.debt.balance = 0;
      this.debtSourceMessage = 'Enter an amount for a hypothetical debt. No real liability is selected.';
    }
    this.cdr.markForCheck();
  }

  fireNumber(): number {
    const withdrawalRate = Math.max(0.001, Number(this.fire.withdrawalRate || 0.04));
    return this.fireAnnualSpending() / withdrawalRate;
  }

  fireGap(): number {
    return Math.max(this.fireNumber() - Number(this.inputs?.net_worth_portfolio || 0), 0);
  }

  yearsToFire(): number | null {
    const gap = this.fireGap();
    if (gap <= 0) return 0;
    const annualSavings = Math.max(this.effectiveNetCashflow(), 0);
    if (annualSavings <= 0) return null;
    return Math.ceil(gap / annualSavings);
  }

  fireAnnualSpending(): number {
    const base = this.fire.includeRecurringExpenses
      ? this.effectiveAnnualSpending()
      : Math.max(0, this.effectiveAnnualSpending() - Number(
          this.spendingMode === 'components'
            ? this.effectiveSpendingComponents.fixed_annual
            : this.inputs?.recurring_annual_spending || 0
        ));
    return Math.max(0, base + Number(this.fire.extraAnnualExpenses || 0));
  }

  fireEstimateDescription(): string {
    return 'Straight-line estimate: portfolio gap divided by today’s annual cashflow. It assumes the cashflow stays constant and excludes investment growth, taxes, and future changes in spending.';
  }

  monthlyGoalContribution(): number {
    const target = Math.max(0, Number(this.goal.targetAmount || 0));
    const current = Math.max(0, Number(this.goal.currentSaved || 0));
    const years = Math.max(0.1, Number(this.goal.years || 0));
    const months = Math.max(1, Math.round(years * 12));
    const monthlyReturn = Math.max(-0.99, Number(this.goal.expectedReturn || 0)) / 12;
    const futureCurrent = current * Math.pow(1 + monthlyReturn, months);
    const gap = Math.max(0, target - futureCurrent);
    if (gap <= 0) return 0;
    if (monthlyReturn === 0) return Math.round(gap / months);
    return Math.round((gap * monthlyReturn) / (Math.pow(1 + monthlyReturn, months) - 1));
  }

  goalProjectedValue(): number {
    const contribution = this.monthlyGoalContribution();
    const current = Math.max(0, Number(this.goal.currentSaved || 0));
    const months = Math.max(1, Math.round(Math.max(0.1, Number(this.goal.years || 0)) * 12));
    const monthlyReturn = Math.max(-0.99, Number(this.goal.expectedReturn || 0)) / 12;
    if (monthlyReturn === 0) return current + contribution * months;
    return (
      current * Math.pow(1 + monthlyReturn, months) +
      contribution * ((Math.pow(1 + monthlyReturn, months) - 1) / monthlyReturn)
    );
  }

  debtMonthlyPayment(): number {
    return Number(this.debt.minimumPayment || 0) + Number(this.debt.extraPayment || 0);
  }

  debtPayoffMonths(): number | null {
    const balance = Number(this.debt.balance || 0);
    const payment = this.debtMonthlyPayment();
    const apr = Number(this.debt.apr || 0);
    if (payment <= 0 || balance <= 0) return null;
    const rate = apr / 12;
    let remaining = balance;
    let months = 0;
    while (remaining > 0 && months < 600) {
      remaining = remaining * (1 + rate) - payment;
      months += 1;
    }
    return months >= 600 ? null : months;
  }

  debtTotalInterest(): number | null {
    const balance = Number(this.debt.balance || 0);
    const payment = this.debtMonthlyPayment();
    const apr = Number(this.debt.apr || 0);
    const months = this.debtPayoffMonths();
    if (months == null || balance <= 0 || payment <= 0) return null;
    let remaining = balance;
    let interest = 0;
    const rate = apr / 12;
    for (let i = 0; i < months && remaining > 0; i += 1) {
      const charge = remaining * rate;
      interest += charge;
      remaining = Math.max(0, remaining + charge - payment);
    }
    return interest;
  }

  debtPayoffDate(): string {
    const months = this.debtPayoffMonths();
    if (months == null) return '-';
    const d = new Date();
    d.setMonth(d.getMonth() + months);
    return d.toLocaleDateString(undefined, { month: 'short', year: 'numeric' });
  }

  private applyRunResult(run: PlanningRun): void {
    this.lastRun = run;
    const art = run.result_artifacts;
    if (art.years && art.percentiles_by_year) {
      this.chartData = {
        years: art.years,
        percentiles: art.percentiles_by_year,
        fanPaths: art.fan_paths,
      };
    }
    if (run.horizon_years != null) this.horizonYears = run.horizon_years;
    if (run.n_paths != null) this.nPaths = run.n_paths;
    if (run.seed != null) this.seed = run.seed;
    this.cdr.markForCheck();
  }

  saveSavedInputs(): void {
    const name = this.savedInputName.trim();
    if (!name) return;
    this.savingProfile = true;
    const body = { name, payload: this.normalizedAssumptions() };
    const req =
      this.selectedProfileId != null
        ? this.planning.updateProfile(this.selectedProfileId, body)
        : this.planning.createProfile(body);
    req
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => {
          this.savingProfile = false;
          this.cdr.markForCheck();
        })
      )
      .subscribe({
        next: p => {
          if (this.selectedProfileId != null) {
            this.profiles = this.profiles.map(x => (x.id === p.id ? p : x));
          } else {
            this.profiles = [...this.profiles, p];
            this.selectedProfileId = p.id;
          }
          this.savedInputName = p.name;
          this.toast.success('Saved inputs updated.');
        },
        error: err => {
          this.error = err?.message ?? 'Could not save inputs.';
        },
      });
  }

  onProfileSelected(id: string): void {
    const pid = id === '' ? null : Number.parseInt(id, 10);
    this.selectedProfileId = Number.isFinite(pid as number) ? (pid as number) : null;
    const profile = this.profiles.find(p => p.id === this.selectedProfileId);
    if (!profile?.payload) {
      this.savedInputName = '';
      this.resetAssumptionTogglesToDefaults();
      this.cdr.markForCheck();
      return;
    }
    this.savedInputName = profile.name;
    this.assumptions = {
      ...structuredClone(DEFAULT_MC_ASSUMPTIONS),
      ...structuredClone(profile.payload),
      extra_contributions: {
        ...DEFAULT_MC_ASSUMPTIONS.extra_contributions,
        ...(profile.payload.extra_contributions || {}),
      },
      checkpoints: profile.payload.checkpoints || [],
      annual_cashflow_events: profile.payload.annual_cashflow_events || [],
      spending_components: profile.payload.spending_components || this.defaultSpendingComponents(this.inputs || {
        recurring_annual_spending: 0, implied_annual_spending: 0,
      } as PlanningInputsPreview),
    };
    this.syncTogglesFromProfile(profile.payload);
    this.cdr.markForCheck();
  }

  /** Align UI toggles with saved profile (matches server merge_profile / run overrides). */
  private syncTogglesFromProfile(payload: ProfilePayload): void {
    this.spendingMode = payload.spending_mode
      || (payload.spending_components ? 'components' : payload.annual_spending != null ? 'manual' : 'recurring');
    this.assumptions.spending_mode = this.spendingMode;
    this.useTxSpending = this.spendingMode === 'recurring';
    this.useTxIncome = payload.monthly_income == null;
    this.useNetCashflowOverride = payload.net_annual_cashflow_override != null;
    this.useInferredAllocation = payload.portfolio_allocation == null;
    this.useLedgerStartingNetWorth = payload.start_net_worth == null;
    if (!this.useLedgerStartingNetWorth && payload.start_net_worth != null) {
      this.startingNetWorth = payload.start_net_worth;
    } else if (this.inputs) {
      this.startingNetWorth = this.inputs.net_worth_total;
    }
  }

  private resetAssumptionTogglesToDefaults(): void {
    this.spendingMode = 'recurring';
    this.assumptions.spending_mode = 'recurring';
    this.assumptions.annual_spending = null;
    this.assumptions.spending_components = this.defaultSpendingComponents(this.inputs || {
      recurring_annual_spending: 0, implied_annual_spending: 0,
    } as PlanningInputsPreview);
    this.useTxSpending = true;
    this.useTxIncome = true;
    this.useNetCashflowOverride = false;
    this.useInferredAllocation = true;
    this.useLedgerStartingNetWorth = true;
    if (this.inputs) {
      this.startingNetWorth = this.inputs.net_worth_total;
    }
  }

  async deleteSelectedProfile(): Promise<void> {
    if (this.selectedProfileId == null) return;
    const profile = this.profiles.find(p => p.id === this.selectedProfileId);
    const ok = await this.confirm.ask(
      'Delete profile?',
      `Remove saved inputs "${profile?.name ?? 'preset'}"?`,
      'Delete',
      'Cancel'
    );
    if (!ok) return;
    const id = this.selectedProfileId;
    this.planning
      .deleteProfile(id)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.profiles = this.profiles.filter(p => p.id !== id);
          this.selectedProfileId = null;
          this.savedInputName = '';
          this.cdr.markForCheck();
        },
      });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  /** Shown in the annual spending field when “Use transaction spending” is on. */
  txImpliedAnnualSpending(): number | null {
    const v = this.inputs?.implied_annual_spending;
    return v == null || Number.isNaN(v) ? null : v;
  }

  /** Shown in the monthly income field when “Use transaction income” is on. */
  txImpliedMonthlyIncome(): number | null {
    const v = this.inputs?.avg_monthly_income;
    return v == null || Number.isNaN(v) ? null : v;
  }

  onAnnualSpendingInput(value: number | null): void {
    this.assumptions.annual_spending = value;
  }

  setSpendingComponent(key: keyof SpendingComponents, value: number | null): void {
    this.assumptions.spending_components = {
      ...this.effectiveSpendingComponents,
      [key]: Math.max(0, Number(value) || 0),
    };
    this.cdr.markForCheck();
  }

  onMonthlyIncomeInput(value: number | null): void {
    if (!this.useTxIncome) {
      this.assumptions.monthly_income = value;
    }
  }

  setUseTxIncome(useCurrent: boolean): void {
    if (!useCurrent && this.assumptions.monthly_income == null) {
      this.assumptions.monthly_income = this.inputs?.avg_monthly_income ?? 0;
    }
    this.useTxIncome = useCurrent;
  }

  setUseInferredAllocation(useInferred: boolean): void {
    if (!useInferred && this.assumptions.portfolio_allocation == null) {
      this.assumptions.portfolio_allocation = this.inferredAllocation();
    }
    this.useInferredAllocation = useInferred;
  }

  effectiveAnnualSpending(): number {
    if (this.spendingMode === 'recurring') return Number(this.inputs?.implied_annual_spending) || 0;
    if (this.spendingMode === 'components') return this.componentAnnualSpending;
    return Number(this.assumptions.annual_spending) || 0;
  }

  effectiveAnnualIncome(): number {
    if (this.useTxIncome) return (this.inputs?.avg_monthly_income ?? 0) * 12;
    return Number(this.assumptions.monthly_income ?? 0) * 12;
  }

  effectiveNetCashflow(): number {
    if (this.useNetCashflowOverride) {
      return Number(this.assumptions.net_annual_cashflow_override ?? 0);
    }
    return this.effectiveAnnualIncome()
      - this.effectiveAnnualSpending()
      + Number(this.assumptions.extra_contributions?.annual_contribution ?? 0);
  }

  effectiveCashflowDescription(): string {
    if (this.useNetCashflowOverride) return 'Manual total replaces income less spending and any legacy additional contribution';
    return Number(this.assumptions.extra_contributions?.annual_contribution ?? 0) !== 0
      ? 'Job income less selected spending, plus saved additional contribution'
      : 'Job income less selected spending';
  }

  private normalizedAssumptions(
    spendingMode = this.spendingMode,
    base: ProfilePayload = this.assumptions,
  ): ProfilePayload {
    return {
      ...structuredClone(base),
      spending_mode: spendingMode,
      spending_components: structuredClone(base.spending_components || this.effectiveSpendingComponents),
      monthly_income: this.useTxIncome ? null : base.monthly_income,
      net_annual_cashflow_override: this.useNetCashflowOverride
        ? Number(base.net_annual_cashflow_override ?? 0)
        : null,
      portfolio_allocation: this.useInferredAllocation ? null : base.portfolio_allocation,
      start_net_worth: this.useLedgerStartingNetWorth
        ? null
        : Number(this.startingNetWorth ?? this.inputs?.net_worth_total ?? 0),
      // Preserve old additional-contribution assumptions. A total override takes precedence at run time.
      extra_contributions: {
        annual_contribution: base.extra_contributions?.annual_contribution ?? null,
      },
    };
  }

  inferredAllocation(): number {
    const inp = this.inputs;
    if (!inp) return 0;
    return inferredPortfolioAllocation(inp.net_worth_total, inp.net_worth_portfolio, inp.net_worth_liabilities);
  }

  addCheckpoint(): void {
    this.assumptions.checkpoints = [
      ...this.assumptions.checkpoints,
      {
        label: `Goal ${this.assumptions.checkpoints.length + 1}`,
        year: Math.min(this.horizonYears, 10),
        target_date: null,
        target_net_worth: Math.max(0, (this.inputs?.net_worth_total ?? 0) * 1.5),
        min_success_probability: 0.7,
      },
    ];
  }

  removeCheckpoint(index: number): void {
    this.assumptions.checkpoints = this.assumptions.checkpoints.filter((_, i) => i !== index);
  }

  addEvent(): void {
    this.assumptions.annual_cashflow_events = [
      ...this.assumptions.annual_cashflow_events,
      {
        label: `Event ${this.assumptions.annual_cashflow_events.length + 1}`,
        amount: 0,
        year: 5,
        start_year: null,
        end_year: null,
        recurring: false,
        interval_years: 1,
        inflation_adjusted: true,
        applies_to: 'scenario',
      },
    ];
  }

  addScenarioTemplate(template: 'car-purchase' | 'time-off'): void {
    const timeOff = template === 'time-off';
    this.assumptions.annual_cashflow_events = [
      ...this.assumptions.annual_cashflow_events,
      {
        label: timeOff ? 'Time off' : 'Car purchase',
        amount: 0,
        year: 1,
        start_year: null,
        end_year: null,
        recurring: false,
        interval_years: 1,
        inflation_adjusted: true,
        applies_to: 'scenario',
      },
    ];
    this.cdr.markForCheck();
  }

  removeEvent(index: number): void {
    this.assumptions.annual_cashflow_events = this.assumptions.annual_cashflow_events.filter(
      (_, i) => i !== index
    );
  }

  runSimulation(): void {
    this.running = true;
    this.error = null;
    const runChangeVersion = this.financeChangeVersion;
    const normalized = this.normalizedAssumptions();
    const comparisonSeed = Number.isFinite(Number(this.seed)) ? Number(this.seed) : 1;
    this.seed = comparisonSeed;
    this.cdr.markForCheck();

    const overrides: Record<string, unknown> = {
      annual_income_growth: normalized.annual_income_growth,
      inflation_cpi: normalized.inflation_cpi,
      nominal_return_mean: normalized.nominal_return_mean,
      nominal_return_std: normalized.nominal_return_std,
      stable_return_mean: normalized.stable_return_mean,
      portfolio_allocation: normalized.portfolio_allocation,
      tax_drag: normalized.tax_drag,
      annual_fee_drag: normalized.annual_fee_drag,
      shock_probability: normalized.shock_probability,
      shock_mean_loss: normalized.shock_mean_loss,
      shock_loss_std: normalized.shock_loss_std,
      start_net_worth: normalized.start_net_worth,
      spending_mode: this.spendingMode,
      spending_components: normalized.spending_components,
      annual_spending: this.spendingMode === 'manual' ? normalized.annual_spending : null,
      monthly_income: normalized.monthly_income,
      net_annual_cashflow_override: normalized.net_annual_cashflow_override,
      extra_contributions: normalized.extra_contributions,
      checkpoints: this.cleanedCheckpoints(),
    };

    const events = this.cleanedEvents();
    const baselineEvents = this.eventsForCase(events, 'baseline');
    const scenarioEvents = this.eventsForCase(events, 'scenario');

    forkJoin({
      baseline: this.planning.createRun({
        tool_id: MC_TOOL_ID,
        profile_id: this.selectedProfileId,
        overrides: { ...overrides, annual_cashflow_events: baselineEvents },
        seed: comparisonSeed,
        n_paths: this.nPaths,
        horizon_years: this.horizonYears,
      }),
      scenario: this.planning.createRun({
        tool_id: MC_TOOL_ID,
        profile_id: this.selectedProfileId,
        overrides: { ...overrides, annual_cashflow_events: scenarioEvents },
        seed: comparisonSeed,
        n_paths: this.nPaths,
        horizon_years: this.horizonYears,
      }),
    })
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => {
          this.running = false;
          this.cdr.markForCheck();
        })
      )
      .subscribe({
        next: runs => {
          this.baselineRun = runs.baseline;
          this.scenarioRun = runs.scenario;
          this.applyRunResult(runs.scenario);
          this.runStale = this.financeChangeVersion !== runChangeVersion;
          this.runStaleMessage = this.runStale
            ? 'Your finance facts changed while this run was in progress. These results use the earlier facts.'
            : '';
          const p50 = runs.scenario.result_summary?.terminal_p50;
          const baselineP50 = runs.baseline.result_summary?.terminal_p50;
          const delta = p50 == null || baselineP50 == null ? null : p50 - baselineP50;
          const msg =
            p50 != null
              ? `Comparison complete — scenario median ${this.formatMoney(p50)}${delta == null ? '' : ` (${this.formatSignedMoney(delta)} vs baseline)`}.`
              : 'Simulation complete.';
          this.toast.success(msg);
        },
        error: err => {
          this.error = err?.message ?? 'Simulation failed.';
        },
      });
  }

  fanPathCaption(): string | null {
    const art = this.lastRun?.result_artifacts;
    const summary = this.lastRun?.result_summary;
    const simulated = art?.n_paths_simulated ?? summary?.n_paths;
    const displayed = art?.fan_paths?.length ?? art?.fan_paths_displayed;
    if (!simulated) return null;
    if (displayed != null && displayed < simulated) {
      return `Fan chart shows ${displayed.toLocaleString()} sample paths (evenly spaced from ${simulated.toLocaleString()} simulated). Percentiles use the full run.`;
    }
    return `Fan shows all ${simulated.toLocaleString()} simulated paths.`;
  }

  checkpointRows(): PlanningCheckpointResult[] {
    return this.lastRun?.result_artifacts.checkpoint_results ?? [];
  }

  projectionRows(): PlanningProjectionRow[] {
    return this.lastRun?.result_artifacts.projection_table ?? [];
  }

  formatMoney(n: number | undefined | null): string {
    if (n == null || Number.isNaN(n)) return '-';
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: 0,
    }).format(n);
  }

  formatSignedMoney(n: number | undefined | null): string {
    if (n == null || Number.isNaN(n)) return '-';
    const sign = n > 0 ? '+' : '';
    return `${sign}${this.formatMoney(n)}`;
  }

  formatPct(n: number | undefined | null, source: 'decimal' | 'percent' = 'decimal'): string {
    if (n == null || Number.isNaN(n)) return '-';
    const value = source === 'decimal' ? n * 100 : n;
    return `${value.toFixed(value >= 10 ? 0 : 1)}%`;
  }

  successVariant(): 'success' | 'warning' | 'danger' {
    const p = this.lastRun?.result_summary.success_rate_pct ?? 0;
    if (p >= 75) return 'success';
    if (p >= 45) return 'warning';
    return 'danger';
  }

  trackByIndex(index: number): number {
    return index;
  }

  randomizeSeed(): void {
    const max = 2_147_483_646;
    if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
      const buf = new Uint32Array(1);
      crypto.getRandomValues(buf);
      this.seed = (buf[0] % max) + 1;
    } else {
      this.seed = Math.floor(Math.random() * max) + 1;
    }
    this.cdr.markForCheck();
  }

  private defaultCheckpoints(inp: PlanningInputsPreview): PlanningCheckpoint[] {
    const spend = Math.max(1, inp.implied_annual_spending || 40000);
    return [
      {
        label: 'Five-year checkpoint',
        year: 5,
        target_date: null,
        target_net_worth: Math.max(0, inp.net_worth_total + inp.implied_annual_savings * 5),
        min_success_probability: 0.7,
      },
      {
        label: 'FI target',
        year: Math.min(20, this.horizonYears),
        target_date: null,
        target_net_worth: spend * 25,
        min_success_probability: 0.75,
      },
    ];
  }

  private cleanedCheckpoints(): PlanningCheckpoint[] {
    return this.assumptions.checkpoints
      .filter(cp => cp.label.trim())
      .map(cp => ({
        label: cp.label.trim(),
        year: cp.year === null || cp.year === undefined ? null : Number(cp.year),
        target_date: cp.target_date || null,
        target_net_worth:
          cp.target_net_worth === null || cp.target_net_worth === undefined
            ? null
            : Number(cp.target_net_worth),
        min_success_probability:
          cp.min_success_probability === null || cp.min_success_probability === undefined
            ? null
            : Number(cp.min_success_probability),
      }));
  }

  private cleanedEvents(): PlanningCashflowEvent[] {
    return this.assumptions.annual_cashflow_events
      .filter(ev => ev.label.trim() && Number.isFinite(Number(ev.amount)))
      .map(ev => ({
        label: ev.label.trim(),
        amount: Number(ev.amount),
        year: ev.year === null || ev.year === undefined ? null : Number(ev.year),
        start_year:
          ev.start_year === null || ev.start_year === undefined ? null : Number(ev.start_year),
        end_year: ev.end_year === null || ev.end_year === undefined ? null : Number(ev.end_year),
        recurring: Boolean(ev.recurring),
        interval_years: ev.recurring
          ? Math.min(80, Math.max(0.25, Number(ev.interval_years ?? 1)))
          : 1,
        inflation_adjusted: Boolean(ev.inflation_adjusted),
        applies_to: ev.applies_to || 'both',
      }));
  }
}
