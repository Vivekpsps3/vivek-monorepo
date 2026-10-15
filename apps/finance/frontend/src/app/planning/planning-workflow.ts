import { Observable, forkJoin } from 'rxjs';
import { PlanningService } from '../services/planning.service';
import {
  MC_TOOL_ID,
  PlanningCashflowEvent,
  PlanningCheckpoint,
  PlanningProfile,
  PlanningRun,
  ProfilePayload,
} from '../models/planning.model';

export interface PlanningComparisonRequest {
  profileId: number | null;
  assumptions: ProfilePayload;
  spendingMode: 'recurring' | 'components' | 'manual';
  checkpoints: PlanningCheckpoint[];
  events: PlanningCashflowEvent[];
  seed: number;
  nPaths: number;
  horizonYears: number;
}

export class PlanningWorkflow {
  constructor(private readonly planning: PlanningService) {}

  listProfiles(): Observable<PlanningProfile[]> {
    return this.planning.listProfiles();
  }

  loadInputs() {
    return this.planning.getInputs();
  }

  loadSpendingContext() {
    return this.planning.getSpendingSuggestionContext();
  }

  saveProfile(id: number | null, body: { name: string; payload: ProfilePayload }): Observable<PlanningProfile> {
    return id == null ? this.planning.createProfile(body) : this.planning.updateProfile(id, body);
  }

  deleteProfile(id: number): Observable<void> {
    return this.planning.deleteProfile(id);
  }

  runComparison(request: PlanningComparisonRequest): Observable<{ baseline: PlanningRun; scenario: PlanningRun }> {
    const { assumptions, events, profileId, seed, nPaths, horizonYears } = request;
    const overrides: Record<string, unknown> = {
      annual_income_growth: assumptions.annual_income_growth,
      inflation_cpi: assumptions.inflation_cpi,
      nominal_return_mean: assumptions.nominal_return_mean,
      nominal_return_std: assumptions.nominal_return_std,
      stable_return_mean: assumptions.stable_return_mean,
      portfolio_allocation: assumptions.portfolio_allocation,
      tax_drag: assumptions.tax_drag,
      annual_fee_drag: assumptions.annual_fee_drag,
      shock_probability: assumptions.shock_probability,
      shock_mean_loss: assumptions.shock_mean_loss,
      shock_loss_std: assumptions.shock_loss_std,
      start_net_worth: assumptions.start_net_worth,
      spending_mode: request.spendingMode,
      spending_components: assumptions.spending_components,
      annual_spending: request.spendingMode === 'manual' ? assumptions.annual_spending : null,
      monthly_income: assumptions.monthly_income,
      net_annual_cashflow_override: assumptions.net_annual_cashflow_override,
      extra_contributions: assumptions.extra_contributions,
      checkpoints: request.checkpoints,
    };
    const baselineEvents = events.filter(event => (event.applies_to || 'both') !== 'scenario');
    const scenarioEvents = events.filter(event => (event.applies_to || 'both') !== 'baseline');

    return forkJoin({
      baseline: this.planning.createRun({
        tool_id: MC_TOOL_ID,
        profile_id: profileId,
        overrides: { ...overrides, annual_cashflow_events: baselineEvents },
        seed,
        n_paths: nPaths,
        horizon_years: horizonYears,
      }),
      scenario: this.planning.createRun({
        tool_id: MC_TOOL_ID,
        profile_id: profileId,
        overrides: { ...overrides, annual_cashflow_events: scenarioEvents },
        seed,
        n_paths: nPaths,
        horizon_years: horizonYears,
      }),
    });
  }
}
