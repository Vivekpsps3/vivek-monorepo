import { Injectable } from '@angular/core';
import { Observable, from } from 'rxjs';
import { isCurrentJob } from '../utils/job-compensation.util';
import { EncryptedStoreService } from '../crypto/encrypted-store.service';
import { BankAccountRecord, ImportReceipt, Transaction } from '../models/transaction.model';
import {
  MC_FAN_PATHS_PERSIST_MAX,
  MC_N_PATHS_MAX,
  MC_N_PATHS_MIN,
  PLANNING_DISCLAIMER,
  PlanningLiabilitySource,
  PlanningInputsPreview,
  PlanningProfile,
  PlanningProfileCreate,
  PlanningRun,
  PlanningRunCreate,
  DEFAULT_MC_ASSUMPTIONS,
  ProfilePayload,
} from '../models/planning.model';
import { inferredPortfolioAllocation } from '../utils/planning-allocation.util';

@Injectable({ providedIn: 'root' })
export class PlanningService {
  constructor(private encStore: EncryptedStoreService) {}

  getInputs(): Observable<PlanningInputsPreview> {
    return from(this.clientInputs());
  }

  getSpendingSuggestionContext(): Observable<{
    transactions: Transaction[];
    receipts: ImportReceipt[];
    accounts: BankAccountRecord[];
  }> {
    return from(Promise.all([
      this.encStore.getTransactions(),
      this.encStore.getImportReceipts(),
      this.encStore.getBankAccounts(),
    ]).then(([transactions, receipts, accounts]) => ({ transactions, receipts, accounts })));
  }

  listProfiles(): Observable<PlanningProfile[]> {
    return from(
      this.encStore.listPlanningProfiles().then(rows =>
        rows.map(row => ({
          id: row.id,
          name: row.name,
          base_currency: row.base_currency || 'USD',
          payload: typeof row.payload_json === 'string' ? JSON.parse(row.payload_json) : row.payload || row,
          created_at: row.created_at,
          updated_at: row.updated_at,
        }))
      )
    );
  }

  createProfile(body: PlanningProfileCreate): Observable<PlanningProfile> {
    return from(
      (async () => {
        const now = new Date().toISOString();
        const row = await this.encStore.savePlanningProfile({
          name: body.name,
          base_currency: (body as any).base_currency || 'USD',
          payload_json: JSON.stringify((body as any).payload || body),
          created_at: now,
          updated_at: now,
        });
        return {
          id: row.id,
          name: row.name,
          base_currency: row.base_currency,
          payload: (body as any).payload || (body as any),
          created_at: now,
          updated_at: now,
        } as PlanningProfile;
      })()
    );
  }

  updateProfile(id: number, body: Partial<PlanningProfileCreate>): Observable<PlanningProfile> {
    return from(
      (async () => {
        const now = new Date().toISOString();
        const row = await this.encStore.savePlanningProfile(
          {
            name: (body as any).name || 'Profile',
            base_currency: (body as any).base_currency || 'USD',
            payload_json: JSON.stringify((body as any).payload || body),
            updated_at: now,
          },
          id
        );
        return {
          id: row.id,
          name: row.name,
          base_currency: row.base_currency,
          payload: (body as any).payload || {},
          created_at: row.created_at || now,
          updated_at: now,
        } as PlanningProfile;
      })()
    );
  }

  deleteProfile(id: number): Observable<void> {
    return from(this.encStore.deletePlanningProfile(id));
  }

  createRun(body: PlanningRunCreate): Observable<PlanningRun> {
    return from(this.clientMonteCarlo(body));
  }

  private async clientInputs(): Promise<PlanningInputsPreview> {
    const [nw, incomes, fixed, subs, txs, assets, liabilities, holdings] = await Promise.all([
      this.encStore.getNetWorth(),
      this.encStore.getJobIncomes(),
      this.encStore.getFixedExpenses(),
      this.encStore.getSubscriptions(),
      this.encStore.getTransactions(),
      this.encStore.getAssets(),
      this.encStore.getLiabilities(),
      this.encStore.getHoldings(),
    ]);
    const activeIncomes = incomes.filter(row => isCurrentJob(row));
    const activeFixed = fixed.filter(row => row.is_active);
    const activeSubs = subs.filter(row => row.is_active);
    const monthlyIncome = activeIncomes.reduce((s, j) => s + (Number(j.monthly_net) || 0), 0);
    const annualFixed = activeFixed.reduce((s, f) => s + (Number(f.annual_amount) || 0), 0);
    const annualSubs = activeSubs.reduce((s, f) => s + (Number(f.annual_amount) || 0), 0);
    const monthlyExpense = (annualFixed + annualSubs) / 12;
    const implied_annual_spending = annualFixed + annualSubs;
    const implied_annual_savings = monthlyIncome * 12 - implied_annual_spending;
    const activeIncomeCount = activeIncomes.length;
    const activeFixedCount = activeFixed.length;
    const activeSubCount = activeSubs.length;
    const currentHoldings = holdings.filter(row => row.lifecycle_status !== 'inactive' && row.lifecycle_status !== 'staged');
    const oldestBalanceAsOf = oldestIsoDate([
      ...assets.map(row => row.as_of_date),
      ...liabilities.map(row => row.as_of_date),
    ]);
    const oldestPortfolioQuoteDate = oldestIsoDate(currentHoldings.map(row => row.quote_date));
    const oldestPortfolioPositionDate = oldestIsoDate(currentHoldings.map(row => row.position_as_of));
    const undatedAssetBalances = assets.filter(row => !isIsoDate(row.as_of_date)).length;
    const undatedLiabilityBalances = liabilities.filter(row => !isIsoDate(row.as_of_date)).length;
    const undatedPortfolioQuotes = currentHoldings.filter(row => !isIsoDate(row.quote_date)).length;
    const undatedPortfolioPositions = currentHoldings.filter(row => !isIsoDate(row.position_as_of)).length;
    const undatedPortfolioValues = currentHoldings.filter(row =>
      !isIsoDate(row.quote_date) && !isIsoDate(row.position_as_of)
    ).length;
    // Hash balance-sheet + recurring schedules (spend source), not transaction-derived spend.
    const snapshot_hash = [
      'client',
      `nw:${nw.total.toFixed(2)}`,
      `portfolio:${nw.portfolio.toFixed(2)}`,
      `liabilities:${nw.liabilities.toFixed(2)}`,
      `balance-date:${oldestBalanceAsOf ?? 'unknown'}:${undatedAssetBalances}:${undatedLiabilityBalances}`,
      `portfolio-dates:${oldestPortfolioQuoteDate ?? 'unknown'}:${oldestPortfolioPositionDate ?? 'unknown'}:${undatedPortfolioQuotes}:${undatedPortfolioPositions}`,
      `inc:${monthlyIncome.toFixed(2)}x${activeIncomeCount}`,
      `spend:${implied_annual_spending.toFixed(2)}f${activeFixedCount}s${activeSubCount}`,
      `txcount:${txs.length}`,
    ].join('|');
    return {
      disclaimer: PLANNING_DISCLAIMER,
      as_of: new Date().toISOString().slice(0, 10),
      snapshot_hash,
      net_worth_total: nw.total,
      net_worth_portfolio: nw.portfolio,
      net_worth_liabilities: nw.liabilities,
      avg_monthly_income: monthlyIncome,
      avg_monthly_expense: monthlyExpense,
      implied_annual_spending,
      implied_annual_savings,
      transaction_count: txs.length,
      recurring_annual_spending: implied_annual_spending,
      annual_fixed_expenses: annualFixed,
      annual_subscriptions: annualSubs,
      annual_spending_source: 'active-recurring-schedules',
      net_worth_source: 'balance-sheet',
      annual_income_source: 'active-job-income',
      transaction_role: 'count-only-not-used-for-spend',
      oldest_balance_as_of: oldestBalanceAsOf,
      undated_asset_balances: undatedAssetBalances,
      undated_liability_balances: undatedLiabilityBalances,
      oldest_portfolio_quote_date: oldestPortfolioQuoteDate,
      oldest_portfolio_position_date: oldestPortfolioPositionDate,
      undated_portfolio_quotes: undatedPortfolioQuotes,
      undated_portfolio_positions: undatedPortfolioPositions,
      undated_portfolio_values: undatedPortfolioValues,
      liability_sources: liabilities.map((row): PlanningLiabilitySource => ({
        id: row.id,
        name: row.name,
        category: row.category,
        balance_owed: Number(row.balance_owed) || 0,
        as_of_date: isIsoDate(row.as_of_date) ? row.as_of_date : null,
      })),
    };
  }

  private async clientMonteCarlo(body: PlanningRunCreate): Promise<PlanningRun> {
    const startedAt = new Date().toISOString();
    const inputs = await this.clientInputs();
    const nPaths = Math.min(Math.max((body as any).n_paths ?? 500, MC_N_PATHS_MIN), MC_N_PATHS_MAX);
    const horizonYears = Math.min(Math.max((body as any).horizon_years ?? 30, 1), 60);
    const seed = (body as any).seed ?? 42;
    const overrides = (body.overrides || {}) as Partial<ProfilePayload>;
    const profile: ProfilePayload = {
      ...DEFAULT_MC_ASSUMPTIONS,
      ...overrides,
      extra_contributions: { ...DEFAULT_MC_ASSUMPTIONS.extra_contributions, ...(overrides.extra_contributions || {}) },
      checkpoints: overrides.checkpoints ?? DEFAULT_MC_ASSUMPTIONS.checkpoints,
      annual_cashflow_events: overrides.annual_cashflow_events ?? DEFAULT_MC_ASSUMPTIONS.annual_cashflow_events,
    };
    // An older/manual override may supply annual_spending without the newer mode field.
    // Preserve that explicit contract instead of inheriting the default recurring mode.
    const spendingMode = overrides.spending_mode
      ?? (overrides.annual_spending != null ? 'manual' : profile.spending_mode);
    let state = seed >>> 0;
    const rand = () => {
      state = (1664525 * state + 1013904223) >>> 0;
      return state / 0xffffffff;
    };
    const start = profile.start_net_worth ?? (Number(inputs.net_worth_total) || 0);
    const spendingComponents = profile.spending_components;
    const componentTotal = spendingComponents
      ? [spendingComponents.fixed_annual, spendingComponents.variable_annual, spendingComponents.irregular_annual]
          .reduce((sum, amount) => sum + (Number(amount) || 0), 0)
      : null;
    const legacyManualSpending = profile.spending_mode == null && profile.annual_spending != null;
    const annualSpending = spendingMode === 'components' && componentTotal != null
      ? componentTotal
      : spendingMode === 'manual' || legacyManualSpending
        ? Number(profile.annual_spending) || 0
        : spendingMode === 'recurring'
          ? Number(inputs.implied_annual_spending) || 0
          : profile.annual_spending ?? (Number(inputs.implied_annual_spending) || 0);
    const annualIncome = profile.monthly_income != null ? profile.monthly_income * 12 : inputs.avg_monthly_income * 12;
    const netCashflowOverride = profile.net_annual_cashflow_override;
    const legacyAdditionalContribution = profile.extra_contributions?.annual_contribution ?? 0;
    const annualContribution = netCashflowOverride == null ? legacyAdditionalContribution : 0;
    const currentAnnualNetCashflow = netCashflowOverride == null
      ? annualIncome - annualSpending + legacyAdditionalContribution
      : netCashflowOverride;
    const allocation = profile.portfolio_allocation ?? inferredPortfolioAllocation(
      inputs.net_worth_total,
      inputs.net_worth_portfolio,
      inputs.net_worth_liabilities,
    );
    const paths: number[][] = [];
    for (let p = 0; p < nPaths; p += 1) {
      const series = [start];
      let value = start;
      for (let y = 1; y <= horizonYears; y += 1) {
        const u1 = Math.max(rand(), 1e-12);
        const u2 = rand();
        const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
        const shock = rand() < profile.shock_probability
          ? Math.max(0, profile.shock_mean_loss + profile.shock_loss_std * z)
          : 0;
        const growthReturn = profile.nominal_return_mean + profile.nominal_return_std * z - shock - profile.tax_drag - profile.annual_fee_drag;
        const stableReturn = profile.stable_return_mean;
        const year = y - 1;
        const events = profile.annual_cashflow_events.reduce((sum, event) => {
          const startYear = event.start_year ?? event.year ?? 1;
          const endYear = event.end_year ?? horizonYears;
          const interval = event.interval_years || 1;
          const happens = event.recurring
            ? year + 1 >= startYear && year + 1 <= endYear && Math.abs(((year + 1 - startYear) / interval) - Math.round((year + 1 - startYear) / interval)) < 1e-9
            : event.year === year + 1;
          return happens ? sum + event.amount * (event.inflation_adjusted ? (1 + profile.inflation_cpi) ** year : 1) : sum;
        }, 0);
        const calculatedCashflow = annualIncome * (1 + profile.annual_income_growth) ** year
          - annualSpending * (1 + profile.inflation_cpi) ** year
          + legacyAdditionalContribution;
        const cashflow = (netCashflowOverride == null ? calculatedCashflow : netCashflowOverride) + events;
        value = Math.max(value * (allocation * (1 + growthReturn) + (1 - allocation) * (1 + stableReturn)) + cashflow, 0);
        series.push(value);
      }
      paths.push(series);
    }
    const percentilesByYear: Record<string, number[]> = {};
    for (const pct of [5, 10, 25, 50, 75, 90, 95]) {
      const values = [];
      for (let y = 0; y <= horizonYears; y += 1) {
        const col = paths.map(p => p[y]).sort((a, b) => a - b);
        const idx = Math.min(col.length - 1, Math.floor((pct / 100) * (col.length - 1)));
        values.push(col[idx]);
      }
      percentilesByYear[`p${pct}`] = values;
    }
    const years = Array.from({ length: horizonYears + 1 }, (_, i) => i);
    const fanStep = Math.max(1, Math.ceil(paths.length / MC_FAN_PATHS_PERSIST_MAX));
    const fanPaths = paths.filter((_, index) => index % fanStep === 0).slice(0, MC_FAN_PATHS_PERSIST_MAX);
    const terminal = (key: string) => percentilesByYear[key]?.at(-1) ?? start;
    const checkpointResults = profile.checkpoints.map(checkpoint => {
      const year = Math.min(horizonYears, Math.max(0, checkpoint.year ?? 0));
      const target = checkpoint.target_net_worth ?? null;
      const p50 = percentilesByYear['p50'][year];
      const success = target == null ? null : paths.filter(path => path[year] >= target).length / paths.length * 100;
      return {
        label: checkpoint.label,
        year,
        target_date: checkpoint.target_date ?? null,
        target_net_worth: target,
        p10: percentilesByYear['p10'][year],
        p50,
        p90: percentilesByYear['p90'][year],
        success_probability_pct: success,
        gap_to_goal_p50: target == null ? null : p50 - target,
        on_track: checkpoint.min_success_probability == null || success == null
          ? null
          : success >= checkpoint.min_success_probability * 100,
      };
    });
    return {
      id: null,
      tool_id: (body as any).tool_id || 'mc_net_worth_paths',
      status: 'completed',
      input_snapshot_hash: inputs.snapshot_hash,
      as_of: inputs.as_of,
      seed,
      n_paths: nPaths,
      horizon_years: horizonYears,
      disclaimer: PLANNING_DISCLAIMER,
      result_summary: {
        start_net_worth: start,
        starting_growth_allocation: allocation,
        annual_spending_start: annualSpending,
        spend_assumption_source: spendingMode === 'components'
          ? 'planning-spending-components'
          : spendingMode === 'manual' || legacyManualSpending
            ? 'manual-profile'
            : inputs.annual_spending_source,
        annual_income_start: annualIncome,
        net_cashflow_source: netCashflowOverride == null
          ? profile.monthly_income != null
            ? 'manual-income-and-selected-spending'
            : 'active-job-income-and-selected-spending'
          : 'manual-total-annual-cashflow',
        annual_contribution_start: annualContribution,
        net_annual_cashflow_start: currentAnnualNetCashflow,
        cashflow_override_source: netCashflowOverride == null ? null : 'manual-total-annual-cashflow',
        terminal_p5: terminal('p5'),
        terminal_p10: terminal('p10'),
        terminal_p25: terminal('p25'),
        terminal_p50: terminal('p50'),
        terminal_p75: terminal('p75'),
        terminal_p90: terminal('p90'),
        terminal_p95: terminal('p95'),
        seed,
        n_paths: nPaths,
        horizon_years: horizonYears,
      },
      result_artifacts: {
        years,
        percentiles_by_year: percentilesByYear,
        fan_paths: fanPaths,
        fan_paths_displayed: fanPaths.length,
        n_paths_simulated: nPaths,
        checkpoint_results: checkpointResults,
      },
      started_at: startedAt,
      finished_at: new Date().toISOString(),
    };
  }
}

function isIsoDate(value: string | null | undefined): value is string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(parsed.getTime())
    && parsed.toISOString().slice(0, 10) === value
    && value <= new Date().toISOString().slice(0, 10);
}

function oldestIsoDate(values: Array<string | null | undefined>): string | null {
  return values.filter(isIsoDate).sort()[0] ?? null;
}
