import { of, Subject, throwError } from 'rxjs';
import { PlanningComponent } from './planning.component';
import { DEFAULT_MC_ASSUMPTIONS, PlanningProfile } from '../models/planning.model';
import { lastThreeCompletedMonths } from '../utils/planning-spending.util';

function createComponent() {
  const planning = jasmine.createSpyObj('PlanningService', [
    'createProfile', 'updateProfile', 'createRun', 'getInputs', 'getSpendingSuggestionContext', 'listProfiles',
  ]);
  const toast = jasmine.createSpyObj('ToastService', ['success', 'error', 'info']);
  const component = new PlanningComponent(
    planning as any,
    { ask: jasmine.createSpy('ask').and.resolveTo(true) } as any,
    toast as any,
    { markForCheck: () => undefined } as any,
    { dataChanges$: new Subject<any>() } as any
  );
  return { component, planning, toast };
}

function suggestionContext(component: PlanningComponent, withCoverage: boolean): void {
  const period = lastThreeCompletedMonths();
  component.spendingAccounts = [{
    id: 1, bank_slug: 'chase', account_mask: '1111', account_key: 'checking-a', display_name: 'Checking', confirmed: true,
  }];
  component.selectedSpendingAccountKeys = ['checking-a'];
  component.selectedSpendingCategories = ['Food'];
  component.spendingTransactions = [{
    id: 11, date: period.start, type: 'expense', kind: 'purchase', amount: 100,
    category: 'Food', bank_account_key: 'checking-a', description: 'Groceries',
  } as any];
  component.spendingReceipts = withCoverage ? [{
    id: 22, bank_slugs: ['chase'], filenames: ['statement.csv'], status: 'complete', started_at: new Date().toISOString(),
    selected_row_count: 1, inserted_count: 1, unresolved: [], account_displays: ['Checking'],
    coverage: [{ account_display: 'Checking', account_key: 'checking-a', start_date: period.start, end_date: period.end, confirmed: true }],
  } as any] : [];
}

describe('PlanningComponent spending acceptance', () => {
  it('keeps legacy annual events in both cases and scopes new events to baseline or scenario', () => {
    const { component } = createComponent();
    const events = [
      { label: 'Legacy event', amount: -1000, recurring: false, inflation_adjusted: false },
      { label: 'Purchase', amount: -5000, recurring: false, inflation_adjusted: false, applies_to: 'scenario' as const },
      { label: 'Time off', amount: -2000, recurring: false, inflation_adjusted: false, applies_to: 'baseline' as const },
    ];

    expect(component.eventsForCase(events, 'baseline').map(event => event.label)).toEqual(['Legacy event', 'Time off']);
    expect(component.eventsForCase(events, 'scenario').map(event => event.label)).toEqual(['Legacy event', 'Purchase']);
  });

  it('starts car and time-off what-if templates at zero and scopes them to the scenario', () => {
    const { component } = createComponent();
    component.addScenarioTemplate('car-purchase');
    component.addScenarioTemplate('time-off');
    component.addEvent();

    expect(component.assumptions.annual_cashflow_events.map(event => event.amount)).toEqual([0, 0, 0]);
    expect(component.assumptions.annual_cashflow_events.slice(0, 2).map(event => event.applies_to)).toEqual(['scenario', 'scenario']);
  });

  it('uses the same live cashflow as planning: income less selected costs plus a legacy add-on, unless the total overrides it', () => {
    const { component } = createComponent();
    component.inputs = {
      avg_monthly_income: 5_000,
      implied_annual_spending: 40_000,
      net_worth_total: 0,
    } as any;
    component.useTxIncome = true;
    component.spendingMode = 'recurring';
    component.assumptions.extra_contributions.annual_contribution = 5_000;

    expect(component.effectiveNetCashflow()).toBe(25_000);
    component.useNetCashflowOverride = true;
    component.assumptions.net_annual_cashflow_override = 10_000;
    expect(component.effectiveNetCashflow()).toBe(10_000);
  });

  it('shows the same gross-asset allocation the simulation uses for debt, no-holding, and capped inputs', () => {
    const { component } = createComponent();
    component.inputs = { net_worth_total: -5_000, net_worth_portfolio: 10_000, net_worth_liabilities: 105_000 } as any;
    expect(component.inferredAllocation()).toBe(0.1);
    component.inputs = { net_worth_total: 100_000, net_worth_portfolio: 0, net_worth_liabilities: 0 } as any;
    expect(component.inferredAllocation()).toBe(0);
    component.inputs = { net_worth_total: 10_000, net_worth_portfolio: 150_000, net_worth_liabilities: 0 } as any;
    expect(component.inferredAllocation()).toBe(1);
  });

  it('saves live facts as null while retaining manual assumptions and legacy additional contributions', () => {
    const { component, planning } = createComponent();
    const saved: PlanningProfile = {
      id: 7,
      name: 'Retirement baseline',
      base_currency: 'USD',
      payload: structuredClone(DEFAULT_MC_ASSUMPTIONS),
      created_at: '',
      updated_at: '',
    };
    planning.createProfile.and.returnValue(of(saved));
    component.savedInputName = saved.name;
    component.spendingMode = 'manual';
    component.assumptions = {
      ...structuredClone(DEFAULT_MC_ASSUMPTIONS),
      annual_spending: 42_000,
      monthly_income: 5_000,
      portfolio_allocation: 0.6,
      start_net_worth: 123_000,
      net_annual_cashflow_override: 10_000,
      extra_contributions: { annual_contribution: 5_000 },
    };

    component.saveSavedInputs();

    const payload = planning.createProfile.calls.mostRecent().args[0].payload;
    expect(payload.monthly_income).toBeNull();
    expect(payload.portfolio_allocation).toBeNull();
    expect(payload.start_net_worth).toBeNull();
    expect(payload.net_annual_cashflow_override).toBeNull();
    expect(payload.annual_spending).toBe(42_000);
    expect(payload.extra_contributions.annual_contribution).toBe(5_000);
  });

  it('reopens a legacy additional-contribution profile without treating it as a total override', () => {
    const { component } = createComponent();
    component.inputs = {
      avg_monthly_income: 5_000,
      implied_annual_spending: 40_000,
      net_worth_total: 0,
    } as any;
    component.profiles = [{
      id: 9,
      name: 'Old plan',
      base_currency: 'USD',
      payload: { ...structuredClone(DEFAULT_MC_ASSUMPTIONS), extra_contributions: { annual_contribution: 5_000 } },
      created_at: '',
      updated_at: '',
    }];

    component.onProfileSelected('9');

    expect(component.useNetCashflowOverride).toBeFalse();
    expect(component.assumptions.extra_contributions.annual_contribution).toBe(5_000);
    expect(component.effectiveNetCashflow()).toBe(25_000);
  });

  it('refuses to persist an estimate without complete receipt coverage', async () => {
    const { component, planning } = createComponent();
    suggestionContext(component, false);

    await component.acceptSpendingSuggestion();

    expect(component.spendingSuggestion.canSuggest).toBeFalse();
    expect(planning.createProfile).not.toHaveBeenCalled();
    expect(planning.updateProfile).not.toHaveBeenCalled();
  });

  it('requires explicit acceptance and persists components plus coverage evidence without dropping a legacy total', async () => {
    const { component, planning, toast } = createComponent();
    suggestionContext(component, true);
    component.assumptions = {
      ...structuredClone(DEFAULT_MC_ASSUMPTIONS),
      annual_spending: 54_000,
      spending_components: { fixed_annual: 12_000, variable_annual: 0, irregular_annual: 2_000 },
    };
    const saved: PlanningProfile = {
      id: 1, name: 'Planning estimate', base_currency: 'USD', payload: component.assumptions,
      created_at: '', updated_at: '',
    };
    planning.createProfile.and.returnValue(of(saved));

    await component.acceptSpendingSuggestion();

    const payload = planning.createProfile.calls.mostRecent().args[0].payload;
    expect(payload.spending_mode).toBe('components');
    expect(payload.spending_components).toEqual({ fixed_annual: 12_000, variable_annual: 400, irregular_annual: 2_000 });
    expect(payload.annual_spending).toBe(54_000);
    expect(payload.spending_acceptance).toEqual(jasmine.objectContaining({
      period_start: component.spendingSuggestion.period.start,
      period_end: component.spendingSuggestion.period.end,
      account_keys: ['checking-a'],
      categories: ['Food'],
      receipt_ids: [22],
      annual_suggestion: 400,
    }));
    expect(toast.success).toHaveBeenCalled();
  });

  it('leaves the active assumptions unaccepted when encrypted profile persistence fails', async () => {
    const { component, planning } = createComponent();
    suggestionContext(component, true);
    component.spendingMode = 'manual';
    component.assumptions = {
      ...structuredClone(DEFAULT_MC_ASSUMPTIONS),
      annual_spending: 54_000,
      spending_mode: 'manual',
      spending_components: { fixed_annual: 12_000, variable_annual: 0, irregular_annual: 2_000 },
    };
    planning.createProfile.and.returnValue(throwError(() => new Error('vault write failed')));

    await component.acceptSpendingSuggestion();

    expect(component.spendingMode).toBe('manual');
    expect(component.assumptions.spending_mode).toBe('manual');
    expect(component.assumptions.spending_components?.variable_annual).toBe(0);
    expect(component.assumptions.spending_acceptance).toBeNull();
    expect(component.acceptingSpendingSuggestion).toBeFalse();
    expect(component.error).toBe("Couldn't save the spending estimate.");
    expect(component.error).not.toContain('vault write failed');
  });
});
