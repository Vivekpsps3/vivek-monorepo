/** Monte Carlo planning API (speculative only). */

export const PLANNING_DISCLAIMER =
  'Educational simulation only. Not tax, legal, or investment advice. Does not change your ledger or net worth.';

export const MC_TOOL_ID = 'mc_net_worth_paths' as const;

export const MC_N_PATHS_MIN = 100;
export const MC_N_PATHS_MAX = 5000;
export const MC_FAN_PATHS_PERSIST_MAX = 500;

export type PlanningToolId =
  | 'overview'
  | 'simulation'
  | 'retirement-target'
  | 'savings-goal'
  | 'debt-payoff';

export interface PlanningLiabilitySource {
  id: number;
  name: string;
  category: string;
  balance_owed: number;
  as_of_date: string | null;
}

export interface ProfilePayload {
  annual_income_growth: number;
  inflation_cpi: number;
  nominal_return_mean: number;
  nominal_return_std: number;
  stable_return_mean: number;
  portfolio_allocation?: number | null;
  tax_drag: number;
  annual_fee_drag: number;
  shock_probability: number;
  shock_mean_loss: number;
  shock_loss_std: number;
  start_net_worth?: number | null;
  annual_spending?: number | null;
  /** Full current annual net cashflow. Replaces income less spending when supplied. */
  net_annual_cashflow_override?: number | null;
  /** Additive spending model; legacy profiles may still contain only annual_spending. */
  spending_mode?: 'recurring' | 'components' | 'manual';
  spending_components?: SpendingComponents;
  spending_acceptance?: SpendingAcceptanceEvidence | null;
  monthly_income?: number | null;
  extra_contributions: { annual_contribution?: number | null };
  checkpoints: PlanningCheckpoint[];
  annual_cashflow_events: PlanningCashflowEvent[];
}

export interface SpendingComponents {
  fixed_annual: number;
  variable_annual: number;
  irregular_annual: number;
}

export interface SpendingAcceptanceEvidence {
  accepted_at: string;
  period_start: string;
  period_end: string;
  account_keys: string[];
  categories: string[];
  excluded_recurring_transaction_ids: number[];
  receipt_ids: number[];
  annual_suggestion: number;
}

export const DEFAULT_MC_ASSUMPTIONS: ProfilePayload = {
  annual_income_growth: 0.03,
  inflation_cpi: 0.025,
  nominal_return_mean: 0.07,
  nominal_return_std: 0.15,
  stable_return_mean: 0.02,
  portfolio_allocation: null,
  tax_drag: 0,
  annual_fee_drag: 0,
  shock_probability: 0.08,
  shock_mean_loss: 0.22,
  shock_loss_std: 0.08,
  annual_spending: null,
  spending_mode: 'recurring',
  spending_components: { fixed_annual: 0, variable_annual: 0, irregular_annual: 0 },
  spending_acceptance: null,
  monthly_income: null,
  extra_contributions: { annual_contribution: null },
  checkpoints: [],
  annual_cashflow_events: [],
};

export interface PlanningCheckpoint {
  label: string;
  year?: number | null;
  target_date?: string | null;
  target_net_worth?: number | null;
  min_success_probability?: number | null;
}

export interface PlanningCashflowEvent {
  label: string;
  amount: number;
  year?: number | null;
  start_year?: number | null;
  end_year?: number | null;
  recurring: boolean;
  /** Years between occurrences when recurring (0.5 = twice per year). */
  interval_years?: number;
  inflation_adjusted: boolean;
  /** Legacy events without a scope apply to both comparison cases. */
  applies_to?: 'baseline' | 'scenario' | 'both';
}

export interface PlanningInputsPreview {
  disclaimer: string;
  as_of: string;
  snapshot_hash: string;
  net_worth_total: number;
  net_worth_portfolio: number;
  net_worth_liabilities: number;
  avg_monthly_income: number;
  avg_monthly_expense: number;
  implied_annual_spending: number;
  implied_annual_savings: number;
  transaction_count: number;
  recurring_annual_spending?: number;
  annual_fixed_expenses?: number;
  annual_subscriptions?: number;
  annual_spending_source?: string;
  /** Balance sheet live total (assets + portfolio − liabilities), not transaction rollup. */
  net_worth_source?: string;
  /** Active job-income schedules; not imported paystubs. */
  annual_income_source?: string;
  /** Count only — transactions do not drive spending assumptions. */
  transaction_role?: string;
  /** Earliest valid past date among current asset and liability balance entries. */
  oldest_balance_as_of?: string | null;
  undated_asset_balances?: number;
  undated_liability_balances?: number;
  /** Earliest valid past quote date among holdings used in net worth. */
  oldest_portfolio_quote_date?: string | null;
  /** Earliest valid past position date among holdings used in net worth. */
  oldest_portfolio_position_date?: string | null;
  undated_portfolio_quotes?: number;
  undated_portfolio_positions?: number;
  undated_portfolio_values?: number;
  /** Current liabilities, offered only as explicit sources for the one-debt calculator. */
  liability_sources?: PlanningLiabilitySource[];
}

export interface PlanningProfile {
  id: number;
  name: string;
  base_currency: string;
  payload: ProfilePayload;
  created_at: string;
  updated_at: string;
  disclaimer?: string;
}

export interface PlanningProfileCreate {
  name: string;
  base_currency?: string;
  payload?: ProfilePayload;
}

export interface PlanningRunCreate {
  tool_id: string;
  profile_id?: number | null;
  overrides?: Record<string, unknown>;
  seed?: number;
  n_paths?: number;
  horizon_years?: number;
}

export interface PlanningRun {
  id?: number | null;
  tool_id: string;
  status: string;
  disclaimer: string;
  input_snapshot_hash: string;
  as_of: string;
  seed?: number | null;
  n_paths?: number | null;
  horizon_years?: number | null;
  result_summary: McResultSummary;
  result_artifacts: McResultArtifacts;
  started_at: string;
  finished_at?: string | null;
}

export interface McResultSummary {
  start_net_worth?: number;
  ledger_net_worth?: number;
  start_net_worth_source?: string;
  starting_growth_allocation?: number;
  annual_spending_start?: number;
  annual_income_start?: number;
  spend_assumption_source?: string;
  annual_contribution_start?: number;
  net_cashflow_source?: string;
  net_annual_cashflow_start?: number | null;
  cashflow_override_source?: string | null;
  success_rate_pct?: number;
  pct_depleted_before_horizon?: number;
  median_depletion_year?: number | null;
  chance_ending_above_start_pct?: number;
  terminal_p5?: number;
  terminal_p10?: number;
  terminal_p25?: number;
  terminal_p50?: number;
  terminal_p75?: number;
  terminal_p90?: number;
  terminal_p95?: number;
  checkpoint_count?: number;
  event_count?: number;
  narrative?: string[];
  seed?: number;
  n_paths?: number;
  horizon_years?: number;
}

export interface McResultArtifacts {
  years?: number[];
  percentiles_by_year?: Record<string, number[]>;
  fan_paths?: number[][];
  /** How many paths are drawn in the fan (≤ n_paths simulated). */
  fan_paths_displayed?: number;
  n_paths_simulated?: number;
  checkpoint_results?: PlanningCheckpointResult[];
  projection_table?: PlanningProjectionRow[];
  annual_event_cashflow?: number[];
}

export interface PlanningCheckpointResult {
  label: string;
  year: number;
  target_date?: string | null;
  target_net_worth?: number | null;
  p10: number;
  p50: number;
  p90: number;
  success_probability_pct?: number | null;
  gap_to_goal_p50?: number | null;
  on_track?: boolean | null;
}

export interface PlanningProjectionRow {
  year: number;
  label: string;
  p10: number;
  p50: number;
  p90: number;
  target_net_worth?: number | null;
  success_probability_pct?: number | null;
  gap_to_goal_p50?: number | null;
}
