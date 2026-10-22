import { TestBed } from '@angular/core/testing';
import { PlanningService } from './planning.service';
import { MC_TOOL_ID } from '../models/planning.model';
import { EncryptedStoreService } from '../crypto/encrypted-store.service';
import { MoneyPipe } from '../shared/pipes/money.pipe';
import { formatStoredMoney } from '../shared/stored-money';

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
      'getImportReceipts',
      'getBankAccounts',
      'getAssets',
      'getLiabilities',
      'getHoldings',
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
    encStore.getAssets.and.resolveTo([] as any);
    encStore.getLiabilities.and.resolveTo([] as any);
    encStore.getHoldings.and.resolveTo([] as any);
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

  it('uses recorded past balance, quote, and position dates and reports undated or future records separately', done => {
    encStore.getNetWorth.and.resolveTo({ total: 100_000, portfolio: 30_000, liabilities: 10_000 } as any);
    encStore.getJobIncomes.and.resolveTo([]);
    encStore.getFixedExpenses.and.resolveTo([]);
    encStore.getSubscriptions.and.resolveTo([]);
    encStore.getTransactions.and.resolveTo([]);
    encStore.getAssets.and.resolveTo([
      { id: 1, as_of_date: '2020-01-01' },
      { id: 2, as_of_date: '9999-01-01' },
    ] as any);
    encStore.getLiabilities.and.resolveTo([{ id: 1, as_of_date: null }] as any);
    encStore.getHoldings.and.resolveTo([
      { id: 1, lifecycle_status: 'active', quote_date: '2021-01-01', position_as_of: '9999-01-01', price_as_of: '2026-10-12' },
      { id: 2, lifecycle_status: 'active', quote_date: '9999-01-01', position_as_of: null, price_as_of: '2026-10-12' },
    ] as any);

    service.getInputs().subscribe({
      next: inputs => {
        expect(inputs.oldest_balance_as_of).toBe('2020-01-01');
        expect(inputs.undated_asset_balances).toBe(1);
        expect(inputs.undated_liability_balances).toBe(1);
        expect(inputs.oldest_portfolio_quote_date).toBe('2021-01-01');
        expect(inputs.undated_portfolio_quotes).toBe(1);
        expect(inputs.undated_portfolio_positions).toBe(2);
        expect(inputs.undated_portfolio_values).toBe(1);
        expect(inputs.snapshot_hash).toContain('portfolio-dates:');
        done();
      },
      error: done.fail,
    });
  });

  it('prints the same net worth as Home and drops a negative subscription', done => {
    encStore.getNetWorth.and.resolveTo({
      other_assets: 234.5,
      portfolio: 1000,
      liabilities: 0,
      total_assets: 1234.5,
      total: 1234.5,
    });
    encStore.getJobIncomes.and.resolveTo([]);
    encStore.getFixedExpenses.and.resolveTo([]);
    encStore.getSubscriptions.and.resolveTo([
      {
        id: 1,
        name: 'Legacy',
        category: 'Other',
        amount: -40,
        frequency: 'monthly',
        next_bill_date: '2026-01-01',
        is_active: true,
        next_due_date: '2026-01-01',
        monthly_amount: -40,
        annual_amount: -480,
        created_at: '2026-01-01T00:00:00.000Z',
        updated_at: '2026-01-01T00:00:00.000Z',
      },
      {
        id: 2,
        name: 'Kept',
        category: 'Other',
        amount: 15.99,
        frequency: 'monthly',
        next_bill_date: '2026-01-01',
        is_active: true,
        next_due_date: '2026-01-01',
        monthly_amount: 15.99,
        annual_amount: 191.88,
        created_at: '2026-01-01T00:00:00.000Z',
        updated_at: '2026-01-01T00:00:00.000Z',
      },
    ]);
    encStore.getTransactions.and.resolveTo([]);
    service.getInputs().subscribe({
      next: inputs => {
        expect(inputs.annual_subscriptions).toBe(191.88);
        expect(inputs.annual_subscriptions).not.toBe(480);
        expect(formatStoredMoney(inputs.net_worth_total)).toBe(new MoneyPipe().transform(inputs.net_worth_total));
        expect(formatStoredMoney(inputs.net_worth_total)).toBe('$1,234.50');
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
          expect(run.result_summary.starting_growth_allocation).toBeCloseTo(1 / 3);
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
          expect(run.result_summary.spend_assumption_source).toBe('manual-profile');
        expect(run.result_summary.terminal_p50).toBe(240_000);
        done();
      },
      error: done.fail,
    });
  });

  it('composes fixed, variable, and irregular annual spending components', done => {
    encStore.getNetWorth.and.resolveTo({ total: 100_000, portfolio: 0, liabilities: 0 } as any);
    encStore.getJobIncomes.and.resolveTo([]);
    encStore.getFixedExpenses.and.resolveTo([]);
    encStore.getSubscriptions.and.resolveTo([]);
    encStore.getTransactions.and.resolveTo([]);

    service.createRun({
      tool_id: MC_TOOL_ID,
      seed: 0,
      n_paths: 100,
      horizon_years: 1,
      overrides: {
        start_net_worth: 100_000,
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
        spending_mode: 'components',
        spending_components: { fixed_annual: 40_000, variable_annual: 20_000, irregular_annual: 10_000 },
      },
    }).subscribe({
      next: run => {
        expect(run.result_summary.annual_spending_start).toBe(70_000);
        expect(run.result_summary.spend_assumption_source).toBe('planning-spending-components');
        expect(run.result_summary.terminal_p50).toBe(30_000);
        done();
      },
      error: done.fail,
    });
  });

  it('uses an explicit total cashflow override instead of income minus spending or legacy add-ons', done => {
    encStore.getNetWorth.and.resolveTo({ total: 0, portfolio: 0, liabilities: 0 } as any);
    encStore.getJobIncomes.and.resolveTo([{ id: 1, monthly_net: 5_000, is_active: true } as any]);
    encStore.getFixedExpenses.and.resolveTo([{ id: 1, annual_amount: 40_000, is_active: true } as any]);
    encStore.getSubscriptions.and.resolveTo([]);
    encStore.getTransactions.and.resolveTo([]);

    service.createRun({
      tool_id: MC_TOOL_ID,
      seed: 0,
      n_paths: 100,
      horizon_years: 1,
      overrides: {
        start_net_worth: 0,
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
        net_annual_cashflow_override: 10_000,
        extra_contributions: { annual_contribution: 5_000 },
      },
    }).subscribe({
      next: run => {
        expect(run.result_summary.annual_income_start).toBe(60_000);
        expect(run.result_summary.annual_spending_start).toBe(40_000);
        expect(run.result_summary.annual_contribution_start).toBe(0);
        expect(run.result_summary.net_annual_cashflow_start).toBe(10_000);
        expect(run.result_summary.terminal_p50).toBe(10_000);
        done();
      },
      error: done.fail,
    });
  });

  it('keeps a legacy additional contribution additive when no total override is supplied', done => {
    encStore.getNetWorth.and.resolveTo({ total: 0, portfolio: 0, liabilities: 0 } as any);
    encStore.getJobIncomes.and.resolveTo([{ id: 1, monthly_net: 5_000, is_active: true } as any]);
    encStore.getFixedExpenses.and.resolveTo([{ id: 1, annual_amount: 40_000, is_active: true } as any]);
    encStore.getSubscriptions.and.resolveTo([]);
    encStore.getTransactions.and.resolveTo([]);

    service.createRun({
      tool_id: MC_TOOL_ID,
      seed: 0,
      n_paths: 100,
      horizon_years: 1,
      overrides: {
        start_net_worth: 0,
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
        expect(run.result_summary.annual_contribution_start).toBe(5_000);
        expect(run.result_summary.net_annual_cashflow_start).toBe(25_000);
        expect(run.result_summary.terminal_p50).toBe(25_000);
        done();
      },
      error: done.fail,
    });
  });

  it('loads the full encrypted receipt and account context for the suggestion utility', done => {
    const transactions = [{ id: 1 } as any];
    const receipts = [{ id: 2, status: 'complete' } as any];
    const accounts = [{ id: 3, account_key: 'acct-a', confirmed: true } as any];
    encStore.getTransactions.and.resolveTo(transactions);
    encStore.getImportReceipts.and.resolveTo(receipts);
    encStore.getBankAccounts.and.resolveTo(accounts);

    service.getSpendingSuggestionContext().subscribe({
      next: context => {
        expect(context).toEqual({ transactions, receipts, accounts });
        done();
      },
      error: done.fail,
    });
  });
});
