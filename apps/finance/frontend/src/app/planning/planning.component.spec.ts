import { TestBed } from '@angular/core/testing';
import { failureCopy } from '@vivek/ui';
import { of,Subject,throwError } from 'rxjs';
import { PlanningWorkflow } from './planning-workflow';
import { DEFAULT_MC_ASSUMPTIONS,PlanningProfile } from '../models/planning.model';
import { lastThreeCompletedMonths } from '../utils/planning-spending.util';
import { PlanningComponent } from './planning.component';

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

});

describe('PlanningComponent late results', () => {
  function fakeRun(horizon: number, seed: number) {
    return {
      tool_id: 'retirement',
      status: 'completed',
      disclaimer: '',
      input_snapshot_hash: 'abc',
      as_of: '2026-10-15',
      seed,
      n_paths: 500,
      horizon_years: horizon,
      result_summary: { terminal_p50: 10 },
      result_artifacts: {},
      started_at: '2026-10-15T00:00:00Z',
    };
  }

  it('drops a comparison that arrives after the horizon changed', () => {
    const pending = new Subject<{ baseline: ReturnType<typeof fakeRun>; scenario: ReturnType<typeof fakeRun> }>();
    spyOn(PlanningWorkflow.prototype, 'runComparison').and.returnValue(pending);
    const { component, toast } = createComponent();
    component.horizonYears = 30;
    component.seed = 4;
    component.runSimulation();
    component.horizonYears = 12;
    pending.next({ baseline: fakeRun(30, 4), scenario: fakeRun(30, 4) });
    pending.complete();

    expect(component.lastRun).toBeNull();
    expect(component.horizonYears).toBe(12);
    expect(component.running).toBeFalse();
    expect(toast.success).not.toHaveBeenCalled();
  });

  it('keeps a comparison that still matches the inputs', () => {
    const pending = new Subject<{ baseline: ReturnType<typeof fakeRun>; scenario: ReturnType<typeof fakeRun> }>();
    spyOn(PlanningWorkflow.prototype, 'runComparison').and.returnValue(pending);
    const { component, toast } = createComponent();
    component.horizonYears = 30;
    component.nPaths = 500;
    component.seed = 4;
    component.runSimulation();
    pending.next({ baseline: fakeRun(30, 4), scenario: fakeRun(30, 4) });
    pending.complete();

    expect(component.lastRun?.result_summary.terminal_p50).toBe(10);
    expect(component.horizonYears).toBe(30);
    expect(toast.success).toHaveBeenCalled();
  });
});
