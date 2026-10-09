import { TestBed } from '@angular/core/testing';
import { PlanningService } from './planning.service';
import { MC_TOOL_ID } from '../models/planning.model';
import { EncryptedStoreService } from '../crypto/encrypted-store.service';

describe('PlanningService', () => {
  let service: PlanningService;
  let encStore: jasmine.SpyObj<EncryptedStoreService>;

  beforeEach(() => {
    encStore = jasmine.createSpyObj<EncryptedStoreService>('EncryptedStoreService', [
      'getNetWorth',
      'getJobIncomes',
      'getFixedExpenses',
      'getSubscriptions',
      'getTransactions',
      'listPlanningProfiles',
      'savePlanningProfile',
      'deletePlanningProfile',
    ]);
    TestBed.configureTestingModule({
      providers: [
        PlanningService,
        { provide: EncryptedStoreService, useValue: encStore },
      ],
    });
    service = TestBed.inject(PlanningService);
  });

  it('excludes ended, future, and disabled jobs from current planning income', done => {
    encStore.getNetWorth.and.resolveTo({ total: 0, portfolio: 0, liabilities: 0 } as any);
    encStore.getJobIncomes.and.resolveTo([
      { monthly_net: 1000, is_active: true, effective_date: '2000-01-01' },
      { monthly_net: 2000, is_active: true, effective_date: '2000-01-01', end_date: '2001-01-01' },
      { monthly_net: 3000, is_active: true, effective_date: '9999-01-01' },
      { monthly_net: 4000, is_active: false, effective_date: '2000-01-01' },
    ] as any);
    encStore.getFixedExpenses.and.resolveTo([]);
    encStore.getSubscriptions.and.resolveTo([]);
    encStore.getTransactions.and.resolveTo([]);
    service.getInputs().subscribe({
      next: inputs => {
        expect(inputs.avg_monthly_income).toBe(1000);
        done();
      },
      error: done.fail,
    });
  });

  it('client Monte Carlo returns the run shape' , done => {
    encStore.getNetWorth.and.resolveTo({
      other_assets: 100_000,
      portfolio: 50_000,
      liabilities: 25_000,
      total_assets: 150_000,
      total: 125_000,
      as_of: '2026-01-01T00:00:00.000Z',
    });
    encStore.getJobIncomes.and.resolveTo([{ id: 1, monthly_net: 8_000, is_active: true } as any]);
    encStore.getFixedExpenses.and.resolveTo([{ id: 1, annual_amount: 36_000, is_active: true } as any]);
    encStore.getSubscriptions.and.resolveTo([{ id: 1, annual_amount: 1_200, is_active: true } as any]);
    encStore.getTransactions.and.resolveTo([]);

    service
      .createRun({ tool_id: MC_TOOL_ID, n_paths: 100, horizon_years: 3, seed: 7 })
      .subscribe({
        next: run => {
          expect(run.id).toBeNull();
          expect(run.input_snapshot_hash).toContain('client|nw:');
          expect(run.input_snapshot_hash).toContain('spend:');
          expect(run.result_summary.spend_assumption_source).toBe('active-recurring-schedules');
          expect(run.as_of).toMatch(/^\d{4}-\d{2}-\d{2}$/);
          expect(run.result_artifacts.years).toEqual([0, 1, 2, 3]);
          expect(run.result_artifacts.percentiles_by_year?.['p50'].length).toBe(4);
          expect(run.result_summary.terminal_p50).toBe(
            run.result_artifacts.percentiles_by_year?.['p50'][3]
          );
          done();
        },
        error: done.fail,
      });
  });

  it('applies run overrides and preserves seed zero', done => {
    encStore.getNetWorth.and.resolveTo({ total: 100_000, portfolio: 0, liabilities: 0 } as any);
    encStore.getJobIncomes.and.resolveTo([{ id: 1, monthly_net: 5_000, is_active: true } as any]);
    encStore.getFixedExpenses.and.resolveTo([{ id: 1, annual_amount: 12_000, is_active: true } as any]);
    encStore.getSubscriptions.and.resolveTo([]);
    encStore.getTransactions.and.resolveTo([]);

    service.createRun({
      tool_id: MC_TOOL_ID,
      seed: 0,
      n_paths: 100,
      horizon_years: 2,
      overrides: {
        start_net_worth: 250_000,
        annual_spending: 10_000,
        monthly_income: 0,
        annual_income_growth: 0,
        inflation_cpi: 0,
        nominal_return_mean: 0,
        nominal_return_std: 0,
        stable_return_mean: 0,
        portfolio_allocation: 0,
        tax_drag: 0,
        annual_fee_drag: 0,
        shock_probability: 0,
        shock_mean_loss: 0,
        shock_loss_std: 0,
        extra_contributions: { annual_contribution: 5_000 },
      },
    }).subscribe({
      next: run => {
        expect(run.seed).toBe(0);
        expect(run.result_summary.start_net_worth).toBe(250_000);
        expect(run.result_summary.annual_contribution_start).toBe(5_000);
        expect(run.result_summary.terminal_p50).toBe(240_000);
        done();
      },
      error: done.fail,
    });
  });
});
