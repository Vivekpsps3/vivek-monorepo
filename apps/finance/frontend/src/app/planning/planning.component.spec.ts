import { ChangeDetectorRef } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { of, Subject, throwError } from 'rxjs';
import { ConfirmService, ToastService, failureCopy } from '@vivek/ui';
import { PlanningComponent } from './planning.component';
import { DEFAULT_MC_ASSUMPTIONS, PlanningInputsPreview, PlanningProfile } from '../models/planning.model';
import { FinanceService, type FinanceDataChange } from '../services/finance.service';
import { PlanningService } from '../services/planning.service';
import { spendingModeInference } from './spending-mode';
import { lastThreeCompletedMonths } from '../utils/planning-spending.util';

function createComponent() {
  const planning = jasmine.createSpyObj('PlanningService', [
    'createProfile', 'updateProfile', 'deleteProfile', 'createRun', 'getInputs', 'getSpendingSuggestionContext', 'listProfiles',
  ]);
  planning.deleteProfile.and.returnValue(of(undefined));
  const toast = jasmine.createSpyObj('ToastService', ['success', 'error', 'info']);
  const cdr = jasmine.createSpyObj('ChangeDetectorRef', ['markForCheck']);
  const component = TestBed.runInInjectionContext(() => new PlanningComponent(
    planning as any,
    { ask: jasmine.createSpy('ask').and.resolveTo(true) } as any,
    toast as any,
    cdr,
    { dataChanges$: new Subject<any>() } as any
  ));
  return { component, planning, toast, cdr };
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

  it('infers missing and empty spending modes through the shared helper', () => {
    const infer = spyOn(spendingModeInference, 'inferMissing').and.callThrough();
    const { component } = createComponent();
    const parts = { fixed_annual: 1, variable_annual: 2, irregular_annual: 3 };
    const withoutMode = (extra: Record<string, unknown>) => {
      const payload = structuredClone(DEFAULT_MC_ASSUMPTIONS);
      delete payload.spending_mode;
      return Object.assign(payload, extra);
    };
    const rows = [
      [1, withoutMode({ spending_components: parts, annual_spending: 9 }), 'components'],
      [2, withoutMode({ spending_components: undefined, annual_spending: 9 }), 'manual'],
      [3, withoutMode({ spending_components: undefined, annual_spending: null }), 'recurring'],
      [4, withoutMode({ spending_mode: '', spending_components: parts, annual_spending: 9 }), 'components'],
      [5, withoutMode({ spending_mode: '', spending_components: undefined, annual_spending: 9 }), 'manual'],
      [6, withoutMode({ spending_mode: '', spending_components: undefined, annual_spending: null }), 'recurring'],
    ] as const;
    component.profiles = rows.map(([id, payload]) => ({
      id, name: 'p', base_currency: 'USD', payload, created_at: '', updated_at: '',
    }));
    for (const [id, , mode] of rows) {
      component.onProfileSelected(String(id));
      expect(component.spendingMode).toBe(mode);
      expect(component.assumptions.spending_mode).toBe(mode);
    }
    expect(infer).toHaveBeenCalledTimes(6);
  });

  it('keeps the saved profile and shows the delete error when delete returns 503', async () => {
    const { component, planning, toast, cdr } = createComponent();
    const profile: PlanningProfile = {
      id: 4,
      name: 'Probe profile',
      base_currency: 'USD',
      payload: structuredClone(DEFAULT_MC_ASSUMPTIONS),
      created_at: '',
      updated_at: '',
    };
    planning.deleteProfile.and.returnValue(throwError(() => ({ status: 503 })));
    component.profiles = [profile];
    component.selectedProfileId = profile.id;
    component.savedInputName = profile.name;

    await component.deleteSelectedProfile();

    expect(component.savedInputsError).toBe(failureCopy('delete', 'these saved inputs'));
    expect(component.error).toBeNull();
    expect(component.profiles).toEqual([profile]);
    expect(component.selectedProfileId).toBe(profile.id);
    expect(toast.error).not.toHaveBeenCalled();
    expect(cdr.markForCheck).toHaveBeenCalled();
  });

  it('routes a failed save to the Saved inputs card error, not the page error', () => {
    const { component, planning } = createComponent();
    planning.createProfile.and.returnValue(throwError(() => ({ status: 503 })));
    component.savedInputName = 'Baseline';

    component.saveSavedInputs();

    expect(component.savedInputsError).toBe(failureCopy('save', 'these inputs'));
    expect(component.error).toBeNull();
  });

  it('clears a stale card error after a later successful save', () => {
    const { component, planning } = createComponent();
    const saved: PlanningProfile = {
      id: 7, name: 'Baseline', base_currency: 'USD',
      payload: structuredClone(DEFAULT_MC_ASSUMPTIONS), created_at: '', updated_at: '',
    };
    planning.createProfile.and.returnValue(throwError(() => ({ status: 503 })));
    component.savedInputName = 'Baseline';
    component.saveSavedInputs();
    expect(component.savedInputsError).toBe(failureCopy('save', 'these inputs'));

    planning.createProfile.and.returnValue(of(saved));
    component.saveSavedInputs();

    expect(component.savedInputsError).toBeNull();
    expect(component.profiles).toEqual([saved]);
  });

  it('clears a stale save error after a later successful delete', async () => {
    const { component, planning } = createComponent();
    const profile: PlanningProfile = {
      id: 4, name: 'Probe profile', base_currency: 'USD',
      payload: structuredClone(DEFAULT_MC_ASSUMPTIONS), created_at: '', updated_at: '',
    };
    planning.createProfile.and.returnValue(throwError(() => ({ status: 503 })));
    component.savedInputName = 'Probe profile';
    component.saveSavedInputs();
    expect(component.savedInputsError).toBe(failureCopy('save', 'these inputs'));

    component.profiles = [profile];
    component.selectedProfileId = profile.id;
    await component.deleteSelectedProfile();

    expect(component.savedInputsError).toBeNull();
    expect(component.profiles).toEqual([]);
  });

  it('shows a profiles load failure in the Saved inputs card error', () => {
    const { component, planning } = createComponent();
    planning.listProfiles.and.returnValue(throwError(() => ({ status: 503 })));
    planning.getInputs.and.returnValue(of({
      net_worth_total: 0, avg_monthly_income: 0, recurring_annual_spending: 0,
      implied_annual_spending: 0,
    }));
    planning.getSpendingSuggestionContext.and.returnValue(of({
      transactions: [], receipts: [], accounts: [],
    }));

    component.ngOnInit();

    expect(component.savedInputsError).toBe(failureCopy('load', 'your saved inputs'));
    expect(component.error).toBeNull();
  });
});

describe('empty states (F10)', () => {
  const inputsPreview = (overrides: Partial<PlanningInputsPreview>): PlanningInputsPreview => ({
    disclaimer: '', as_of: '', snapshot_hash: '',
    net_worth_total: 0, net_worth_portfolio: 0, net_worth_liabilities: 0,
    avg_monthly_income: 0, avg_monthly_expense: 0,
    implied_annual_spending: 0, implied_annual_savings: 0,
    transaction_count: 0, recurring_annual_spending: 0,
    ...overrides,
  });

  it('hasPlanningInputs truth table', () => {
    const { component } = createComponent();
    component.inputs = null;
    expect(component.hasPlanningInputs).toBeFalse();
    component.inputs = inputsPreview({});
    expect(component.hasPlanningInputs).toBeFalse();
    component.inputs = inputsPreview({ net_worth_portfolio: 250 });
    expect(component.hasPlanningInputs).toBeTrue();
    component.inputs = inputsPreview({ recurring_annual_spending: -5 });
    expect(component.hasPlanningInputs).toBeTrue();
  });

  it('goToEmptyAction routes (pay is the canonical default tab)', () => {
    const planning = jasmine.createSpyObj<PlanningService>('PlanningService', ['createProfile', 'updateProfile', 'deleteProfile', 'createRun', 'getInputs', 'getSpendingSuggestionContext', 'listProfiles']);
    const router = jasmine.createSpyObj<Router>('Router', ['navigate']);
    router.navigate.and.resolveTo(true);
    TestBed.configureTestingModule({ providers: [{ provide: Router, useValue: router }] });
    const component = TestBed.runInInjectionContext(() => new PlanningComponent(
      planning,
      { ask: jasmine.createSpy('ask').and.resolveTo(true) } as unknown as ConfirmService,
      jasmine.createSpyObj<ToastService>('ToastService', ['success', 'error', 'info']),
      jasmine.createSpyObj<ChangeDetectorRef>('ChangeDetectorRef', ['markForCheck']),
      { dataChanges$: new Subject<FinanceDataChange>() } as unknown as FinanceService,
    ));
    component.goToEmptyAction('balance');
    expect(router.navigate).toHaveBeenCalledWith(['/finance/have']);
    component.goToEmptyAction('pay');
    expect(router.navigate).toHaveBeenCalledWith(['/finance/recurring']);
  });
});
