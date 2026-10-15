import {
  DEFAULT_MC_ASSUMPTIONS,
  PlanningCashflowEvent,
  PlanningCheckpoint,
  PlanningInputsPreview,
  ProfilePayload,
  SpendingComponents,
} from '../models/planning.model';

export interface PlanningAssumptionSelection {
  spendingMode: 'recurring' | 'components' | 'manual';
  base: ProfilePayload;
  useTransactionIncome: boolean;
  useCashflowOverride: boolean;
  useInferredAllocation: boolean;
  useLedgerNetWorth: boolean;
  startingNetWorth: number | null;
  currentNetWorth: number | null | undefined;
  effectiveSpendingComponents: SpendingComponents;
}

export function normalizePlanningAssumptions(selection: PlanningAssumptionSelection): ProfilePayload {
  const { base } = selection;
  return {
    ...structuredClone(base),
    spending_mode: selection.spendingMode,
    spending_components: structuredClone(base.spending_components || selection.effectiveSpendingComponents),
    monthly_income: selection.useTransactionIncome ? null : base.monthly_income,
    net_annual_cashflow_override: selection.useCashflowOverride
      ? Number(base.net_annual_cashflow_override ?? 0)
      : null,
    portfolio_allocation: selection.useInferredAllocation ? null : base.portfolio_allocation,
    start_net_worth: selection.useLedgerNetWorth
      ? null
      : Number(selection.startingNetWorth ?? selection.currentNetWorth ?? 0),
    // Preserve legacy additional contributions. A total override takes precedence at run time.
    extra_contributions: {
      annual_contribution: base.extra_contributions?.annual_contribution ?? null,
    },
  };
}

export function restorePlanningProfilePayload(
  payload: ProfilePayload,
  inputs: Pick<PlanningInputsPreview, 'recurring_annual_spending' | 'implied_annual_spending'> | null,
): ProfilePayload {
  const defaultComponents: SpendingComponents = {
    fixed_annual: Number(inputs?.recurring_annual_spending ?? inputs?.implied_annual_spending) || 0,
    variable_annual: 0,
    irregular_annual: 0,
  };
  return {
    ...structuredClone(DEFAULT_MC_ASSUMPTIONS),
    ...structuredClone(payload),
    extra_contributions: {
      ...DEFAULT_MC_ASSUMPTIONS.extra_contributions,
      ...(payload.extra_contributions || {}),
    },
    checkpoints: payload.checkpoints || [],
    annual_cashflow_events: payload.annual_cashflow_events || [],
    spending_components: payload.spending_components || defaultComponents,
  };
}

export function cleanPlanningCheckpoints(checkpoints: PlanningCheckpoint[]): PlanningCheckpoint[] {
  return checkpoints
    .filter(checkpoint => checkpoint.label.trim())
    .map(checkpoint => ({
      label: checkpoint.label.trim(),
      year: checkpoint.year === null || checkpoint.year === undefined ? null : Number(checkpoint.year),
      target_date: checkpoint.target_date || null,
      target_net_worth: checkpoint.target_net_worth === null || checkpoint.target_net_worth === undefined
        ? null
        : Number(checkpoint.target_net_worth),
      min_success_probability: checkpoint.min_success_probability === null || checkpoint.min_success_probability === undefined
        ? null
        : Number(checkpoint.min_success_probability),
    }));
}

export function cleanPlanningEvents(events: PlanningCashflowEvent[]): PlanningCashflowEvent[] {
  return events
    .filter(event => event.label.trim() && Number.isFinite(Number(event.amount)))
    .map(event => ({
      label: event.label.trim(),
      amount: Number(event.amount),
      year: event.year === null || event.year === undefined ? null : Number(event.year),
      start_year: event.start_year === null || event.start_year === undefined ? null : Number(event.start_year),
      end_year: event.end_year === null || event.end_year === undefined ? null : Number(event.end_year),
      recurring: Boolean(event.recurring),
      interval_years: event.recurring
        ? Math.min(80, Math.max(0.25, Number(event.interval_years ?? 1)))
        : 1,
      inflation_adjusted: Boolean(event.inflation_adjusted),
      applies_to: event.applies_to || 'both',
    }));
}
