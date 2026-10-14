import {
  computeCashflowSummary,
  computeNetWorth,
  enrichFixedExpense,
  enrichHolding,
  enrichJobIncome,
  enrichSubscription,
  monthlyCashflowSeries,
  nextDueDate,
} from './client-finance';
import {
  Asset,
  FixedExpense,
  Holding,
  JobIncome,
  Liability,
  Subscription,
  Transaction,
} from '../models/transaction.model';

describe('client-finance', () => {
  const asset = (value: number): Asset =>
    ({
      id: 1,
      name: 'Cash',
      category: 'cash',
      current_value: value,
      as_of_date: '2026-01-01',
    }) as Asset;

  const liability = (balance: number): Liability =>
    ({
      id: 1,
      name: 'Loan',
      category: 'other',
      balance_owed: balance,
      as_of_date: '2026-01-01',
    }) as Liability;

  const holding = (shares: number, price: number): Holding =>
    ({
      id: 1,
      symbol: 'VTI',
      shares,
      purchase_price: price,
      purchase_date: '2026-01-01',
      current_price: price,
    }) as Holding;

  it('computes net worth from assets, holdings, and liabilities', () => {
    const nw = computeNetWorth([asset(1000), asset(500)], [liability(200)], [holding(10, 20)]);
    expect(nw.other_assets).toBe(1500);
    expect(nw.portfolio).toBe(200);
    expect(nw.liabilities).toBe(200);
    expect(nw.total_assets).toBe(1700);
    expect(nw.total).toBe(1500);
    expect(nw.portfolio_sources).toEqual({ VTI: 'manual' });
  });

  it('falls back to purchase price when current price missing', () => {
    const h = {
      id: 2,
      symbol: 'VXUS',
      shares: 5,
      purchase_price: 40,
      purchase_date: '2026-01-01',
      price_source: 'import',
    } as Holding;
    const nw = computeNetWorth([], [], [h]);
    expect(nw.portfolio).toBe(200);
    expect(nw.portfolio_sources).toEqual({ VXUS: 'import' });
  });

  it('enriches holdings with market value', () => {
    const row = enrichHolding(holding(3, 10));
    expect(row.value).toBe(30);
    expect(row.current_price).toBe(10);
  });

  it('preserves exact imported market value when the reported price is rounded', () => {
    const row = enrichHolding({
      ...holding(3, 10),
      current_price: 33.33,
      market_value: 100,
      price_source: 'import_market_price',
    });
    expect(row.value).toBe(100);
    expect(computeNetWorth([], [], [row]).portfolio).toBe(100);
  });

  it('excludes staged and inactive holdings while retaining legacy active rows', () => {
    const staged = { ...holding(2, 50), lifecycle_status: 'staged', portfolio_stage_id: 8 } as Holding;
    const inactive = { ...holding(1, 25), lifecycle_status: 'inactive' } as Holding;
    const legacy = { ...holding(1, 10), lifecycle_status: undefined } as Holding;
    const nw = computeNetWorth([], [], [staged, inactive, legacy]);
    expect(nw.portfolio).toBe(10);
    expect(nw.portfolio_breakdown).toEqual({ VTI: 10 });
  });

  it('keeps a valid market value in net worth even when cost basis is unknown', () => {
    const row = {
      ...holding(2, 0),
      purchase_price: null,
      current_price: 50,
      value: 100,
      market_value: 100,
      cost_basis_status: 'unknown',
    } as unknown as Holding;
    expect(computeNetWorth([], [], [row]).portfolio).toBe(100);
  });

  it('does not turn zero cost basis into a market value when the import has no quote', () => {
    const row = enrichHolding({
      ...holding(2, 0),
      current_price: null as any,
      market_value: null,
      price_source: 'unavailable',
    });
    expect(row.value).toBeNull();
  });

  it('enriches fixed expenses and subscriptions to monthly amounts', () => {
    const fixed = enrichFixedExpense({
      id: 1,
      name: 'Rent',
      category: 'housing',
      amount: 1200,
      frequency: 'monthly',
      start_date: '2026-01-01',
      autopay: true,
      is_active: true,
      next_due_date: '2026-02-01',
      monthly_amount: 0,
      annual_amount: 0,
      created_at: '',
      updated_at: '',
    } as FixedExpense);
    expect(fixed.monthly_amount).toBe(1200);
    expect(fixed.annual_amount).toBe(14400);

    const annual = enrichFixedExpense({
      ...fixed,
      amount: 1200,
      frequency: 'annual',
    });
    expect(annual.monthly_amount).toBe(100);

    const sub = enrichSubscription({
      id: 1,
      name: 'Music',
      category: 'entertainment',
      amount: 12,
      frequency: 'monthly',
      next_bill_date: '2026-02-01',
      is_active: true,
      next_due_date: '2026-02-01',
      monthly_amount: 0,
      annual_amount: 0,
      created_at: '',
      updated_at: '',
    } as Subscription);
    expect(sub.monthly_amount).toBe(12);
  });

  it('enriches job income net estimates', () => {
    const row = enrichJobIncome({
      id: 1,
      employer: 'Acme',
      pay_frequency: 'monthly',
      base_pay: 5000,
      annual_bonus: 1200,
      annual_equity: 0,
      annual_other: 0,
      annual_taxes: 6000,
      annual_deductions: 1200,
      taxes_per_period: 0,
      deductions_per_period: 0,
      effective_date: '2026-01-01',
      is_active: true,
      pay_periods_per_year: 12,
      annual_base_pay: 0,
      annual_gross: 0,
      monthly_gross: 0,
      period_gross: 0,
      period_net: 0,
      annual_net: 0,
      monthly_net: 0,
      created_at: '',
      updated_at: '',
    } as JobIncome);
    expect(row.annual_base_pay).toBe(60000);
    expect(row.annual_gross).toBe(61200);
    expect(row.annual_net).toBe(54000);
    expect(row.monthly_net).toBe(4500);
  });

  it('computes cashflow summary for a period', () => {
    const txs: Transaction[] = [
      {
        id: 1,
        date: '2026-01-10',
        type: 'income',
        category: 'pay',
        amount: 1000,
      },
      {
        id: 2,
        date: '2026-01-12',
        type: 'expense',
        category: 'food',
        amount: 100,
      },
      {
        id: 3,
        date: '2025-12-01',
        type: 'expense',
        category: 'old',
        amount: 999,
      },
    ];
    const incomes = [
      enrichJobIncome({
        id: 1,
        employer: 'Acme',
        pay_frequency: 'monthly',
        base_pay: 3000,
        annual_bonus: 0,
        annual_equity: 0,
        annual_other: 0,
        annual_taxes: 0,
        annual_deductions: 0,
        taxes_per_period: 0,
        deductions_per_period: 0,
        effective_date: '2026-01-01',
        is_active: true,
        pay_periods_per_year: 12,
        annual_base_pay: 0,
        annual_gross: 0,
        monthly_gross: 0,
        period_gross: 0,
        period_net: 0,
        annual_net: 0,
        monthly_net: 0,
        created_at: '',
        updated_at: '',
      } as JobIncome),
    ];
    const fixed = [
      enrichFixedExpense({
        id: 1,
        name: 'Rent',
        category: 'housing',
        amount: 1000,
        frequency: 'monthly',
        start_date: '2026-01-01',
        autopay: true,
        is_active: true,
        next_due_date: '2026-02-01',
        monthly_amount: 0,
        annual_amount: 0,
        created_at: '',
        updated_at: '',
      } as FixedExpense),
    ];
    const subs = [
      enrichSubscription({
        id: 1,
        name: 'Cloud',
        category: 'software',
        amount: 20,
        frequency: 'monthly',
        next_bill_date: '2026-02-01',
        is_active: true,
        next_due_date: '2026-02-01',
        monthly_amount: 0,
        annual_amount: 0,
        created_at: '',
        updated_at: '',
      } as Subscription),
    ];

    const summary = computeCashflowSummary('2026-01-01', '2026-01-31', txs, incomes, fixed, subs);
    expect(summary.transaction_income).toBe(1000);
    expect(summary.transaction_expenses).toBe(100);
    expect(summary.planned_income).toBeCloseTo(3055.44, 2);
    expect(summary.fixed_expenses).toBe(1000);
    expect(summary.subscriptions).toBe(0);
    expect(summary.total_income).toBeCloseTo(4055.44, 2);
    expect(summary.total_expenses).toBe(1100);
    expect(summary.net_cashflow).toBeCloseTo(2955.44, 2);
    expect(summary.savings_rate).toBeCloseTo(72.87, 1);
    expect(summary.observed_income).toBe(1000);
    expect(summary.observed_expenses).toBe(100);
    expect(summary.observed_net_cashflow).toBe(900);
    expect(summary.scheduled_income).toBeCloseTo(3055.44, 2);
    expect(summary.scheduled_expenses).toBe(1000);
    expect(summary.scheduled_net_cashflow).toBeCloseTo(2055.44, 2);
    expect(summary.combined_outlook_net_cashflow).toBeCloseTo(2955.44, 2);
    // $1,000 posted against ~$3,055 of job pay is other income, so both stay.
    // $100 of food does not match the $1,000 rent bill, so the bill stays too.
    expect(summary.possible_income_overlap).toBe(false);
    expect(summary.possible_expense_overlap).toBe(false);
    expect(summary.counted_occurrences.map(row => ({ name: row.name, amount: row.amount, date: row.date }))).toEqual([
      { name: 'Rent', amount: 1000, date: '2026-01-01' },
    ]);
  });

  it('counts matching pay and bills once', () => {
    const txs: Transaction[] = [
      { id: 1, date: '2026-01-15', type: 'income', category: 'pay', amount: 3000 },
      { id: 2, date: '2026-01-03', type: 'expense', category: 'housing', amount: 1000 },
      { id: 3, date: '2026-01-12', type: 'expense', category: 'food', amount: 40 },
    ];
    const incomes = [
      enrichJobIncome({
        id: 1, employer: 'Acme', pay_frequency: 'monthly', base_pay: 3000,
        annual_bonus: 0, annual_equity: 0, annual_other: 0, annual_taxes: 0, annual_deductions: 0,
        taxes_per_period: 0, deductions_per_period: 0, effective_date: '2026-01-01', is_active: true,
        pay_periods_per_year: 12, annual_base_pay: 0, annual_gross: 0, monthly_gross: 0,
        period_gross: 0, period_net: 0, annual_net: 0, monthly_net: 0, created_at: '', updated_at: '',
      } as JobIncome),
    ];
    const fixed = [
      enrichFixedExpense({
        id: 1, name: 'Rent', category: 'housing', amount: 1000, frequency: 'monthly',
        start_date: '2026-01-01', autopay: true, is_active: true, next_due_date: '2026-02-01',
        monthly_amount: 0, annual_amount: 0, created_at: '', updated_at: '',
      } as FixedExpense),
    ];
    const summary = computeCashflowSummary('2026-01-01', '2026-01-31', txs, incomes, fixed, []);
    expect(summary.possible_income_overlap).toBe(true);
    expect(summary.possible_expense_overlap).toBe(true);
    expect(summary.total_income).toBeCloseTo(3055.44, 2);
    expect(summary.total_expenses).toBe(1040);
    expect(summary.counted_occurrences).toEqual([]);
    expect(summary.net_cashflow).toBeCloseTo(2015.44, 2);
  });

  it('flags no income overlap when only one plane has income', () => {
    const incomes = [
      enrichJobIncome({
        id: 1,
        employer: 'Acme',
        title: 'Eng',
        base_pay: 120_000,
        pay_frequency: 'annual',
        hours_per_week: 40,
        annual_bonus: 0,
        annual_equity: 0,
        annual_other: 0,
        annual_taxes: 0,
        annual_deductions: 0,
        taxes_per_period: 0,
        deductions_per_period: 0,
        effective_date: '2026-01-01',
        is_active: true,
        pay_periods_per_year: 1,
        annual_base_pay: 0,
        annual_gross: 0,
        monthly_gross: 0,
        period_gross: 0,
        period_net: 0,
        annual_net: 0,
        monthly_net: 0,
        created_at: '',
        updated_at: '',
      } as JobIncome),
    ];
    const summary = computeCashflowSummary('2026-01-01', '2026-01-31', [], incomes, [], []);
    expect(summary.observed_income).toBe(0);
    expect(summary.scheduled_income).toBeGreaterThan(0);
    expect(summary.possible_income_overlap).toBe(false);
    expect(summary.possible_expense_overlap).toBe(false);
    expect(summary.total_income).toBe(summary.scheduled_income);
  });

  it('counts only active recurring records occurring inside their effective date range', () => {
    const fixed = [
      { id: 1, name: 'Weekly', category: 'home', amount: 10, frequency: 'weekly', start_date: '2026-01-01', end_date: '2026-01-15', is_active: true },
      { id: 2, name: 'Inactive', category: 'home', amount: 100, frequency: 'monthly', start_date: '2026-01-01', is_active: false },
    ] as FixedExpense[];
    const subs = [{ id: 3, name: 'Quarterly', category: 'software', amount: 30, frequency: 'quarterly', next_bill_date: '2025-10-31', is_active: true }] as Subscription[];

    const summary = computeCashflowSummary('2026-01-01', '2026-03-31', [], [], fixed, subs);

    expect(summary.fixed_expenses).toBe(30);
    expect(summary.subscriptions).toBe(30);
    expect(summary.fixed_occurrences.map(row => row.date)).toEqual(['2026-01-01', '2026-01-08', '2026-01-15']);
    expect(summary.subscription_occurrences.map(row => row.date)).toEqual(['2026-01-31']);
  });

  it('keeps monthly and quarterly bill dates anchored when short months are clamped', () => {
    const fixed = [
      { id: 1, name: 'Monthly', category: 'home', amount: 10, frequency: 'monthly', start_date: '2026-01-01', due_day: 31, is_active: true },
      { id: 2, name: 'Quarterly', category: 'home', amount: 20, frequency: 'quarterly', start_date: '2026-01-01', due_day: 31, is_active: true },
    ] as FixedExpense[];

    const summary = computeCashflowSummary('2026-01-01', '2026-10-31', [], [], fixed, []);

    expect(summary.fixed_occurrences.filter(row => row.name === 'Monthly').map(row => row.date)).toEqual([
      '2026-01-31', '2026-02-28', '2026-03-31', '2026-04-30', '2026-05-31',
      '2026-06-30', '2026-07-31', '2026-08-31', '2026-09-30', '2026-10-31',
    ]);
    expect(summary.fixed_occurrences.filter(row => row.name === 'Quarterly').map(row => row.date)).toEqual([
      '2026-01-31', '2026-04-30', '2026-07-31', '2026-10-31',
    ]);
  });

  it('keeps annual subscription dates anchored through leap-year clamping', () => {
    const subscriptions = [{
      id: 1,
      name: 'Annual',
      category: 'software',
      amount: 30,
      frequency: 'annual',
      next_bill_date: '2024-02-29',
      is_active: true,
    }] as Subscription[];

    const summary = computeCashflowSummary('2024-01-01', '2032-12-31', [], [], [], subscriptions);

    expect(summary.subscription_occurrences.map(row => row.date)).toEqual([
      '2024-02-29', '2025-02-28', '2026-02-28', '2027-02-28', '2028-02-29',
      '2029-02-28', '2030-02-28', '2031-02-28', '2032-02-29',
    ]);
  });

  it('returns the same nullable next due date for bills and subscriptions', () => {
    expect(nextDueDate('2026-01-01', 'monthly', 31, '2026-02-28', '2026-03-01')).toBeNull();
    expect(nextDueDate('2026-01-31', 'monthly', null, '2026-02-28', '2026-03-01')).toBeNull();
    expect(nextDueDate('2026-01-01', 'monthly', 31, '2026-03-31', '2026-02-01')).toBe('2026-02-28');
    expect(nextDueDate('2026-01-31', 'monthly', null, '2026-03-31', '2026-02-01')).toBe('2026-02-28');
  });

  it('returns to the anchored day after a short month and preserves leap-year anchors', () => {
    expect(nextDueDate('2026-01-31', 'monthly', null, null, '2026-02-28')).toBe('2026-02-28');
    expect(nextDueDate('2026-01-31', 'monthly', null, null, '2026-03-01')).toBe('2026-03-31');
    expect(nextDueDate('2024-02-29', 'annual', null, null, '2025-03-01')).toBe('2026-02-28');
    expect(nextDueDate('2024-02-29', 'annual', null, null, '2028-02-28')).toBe('2028-02-29');
  });

  it('uses the due day within the recurrence month while respecting the start cutoff', () => {
    expect(nextDueDate('2026-01-01', 'quarterly', 31, null, '2026-02-01')).toBe('2026-04-30');
    expect(nextDueDate('2026-01-20', 'quarterly', 15, null, '2026-01-20')).toBe('2026-04-15');
    expect(nextDueDate('2026-01-01', 'quarterly', 15, '2026-04-15', '2026-04-15')).toBe('2026-04-15');
    expect(nextDueDate('2026-01-01', 'quarterly', 15, '2026-04-14', '2026-04-15')).toBeNull();
  });

  it('keeps weekly and biweekly schedules aligned to their original start date', () => {
    expect(nextDueDate('2026-01-01', 'weekly', null, null, '2026-01-02')).toBe('2026-01-08');
    expect(nextDueDate('2026-01-01', 'biweekly', null, null, '2026-01-15')).toBe('2026-01-15');
  });

  it('calculates far-future monthly occurrences from the anchor without date drift', () => {
    expect(nextDueDate('2000-01-31', 'monthly', 31, null, '2050-01-30')).toBe('2050-01-31');
    expect(nextDueDate('2000-01-31', 'monthly', 31, null, '2050-02-28')).toBe('2050-02-28');
    expect(nextDueDate('2000-01-31', 'monthly', 31, null, '2050-03-01')).toBe('2050-03-31');
  });

  it('returns null for invalid start, target, or end dates', () => {
    expect(nextDueDate('2026-02-30', 'monthly', 31, null, '2026-03-01')).toBeNull();
    expect(nextDueDate('2026-01-01', 'monthly', 31, null, '2026-02-30')).toBeNull();
    expect(nextDueDate('2026-01-01', 'monthly', 31, '2026-02-30', '2026-02-01')).toBeNull();
  });

  it('does not publish next due dates for inactive fixed expenses or subscriptions', () => {
    const fixed = enrichFixedExpense({
      id: 10, name: 'Stopped bill', category: 'home', amount: 50, frequency: 'monthly',
      start_date: '2026-01-01', due_day: 15, is_active: false, next_due_date: '2026-02-15',
      monthly_amount: 0, annual_amount: 0, created_at: '', updated_at: '',
    } as FixedExpense);
    const sub = enrichSubscription({
      id: 11, name: 'Stopped subscription', category: 'software', amount: 5, frequency: 'monthly',
      next_bill_date: '2026-01-01', is_active: false, next_due_date: '2026-02-01',
      monthly_amount: 0, annual_amount: 0, created_at: '', updated_at: '',
    } as Subscription);
    expect(fixed.next_due_date).toBeNull();
    expect(sub.next_due_date).toBeNull();
  });

  it('includes active job income in monthly cashflow when there are no pay transactions', () => {
    const incomes = [
      enrichJobIncome({
        id: 1,
        employer: 'Acme',
        title: 'Eng',
        base_pay: 120_000,
        pay_frequency: 'annual',
        hours_per_week: 40,
        annual_bonus: 0,
        annual_equity: 0,
        annual_other: 0,
        annual_taxes: 0,
        annual_deductions: 0,
        taxes_per_period: 0,
        deductions_per_period: 0,
        effective_date: '2026-01-01',
        is_active: true,
        pay_periods_per_year: 1,
        annual_base_pay: 0,
        annual_gross: 0,
        monthly_gross: 0,
        period_gross: 0,
        period_net: 0,
        annual_net: 0,
        monthly_net: 0,
        created_at: '',
        updated_at: '',
      } as JobIncome),
    ];
    const rows = monthlyCashflowSeries(['2026-01', '2026-02'], [], incomes, [], [], 'scheduled');
    expect(rows).toHaveSize(2);
    expect(rows[0].income).toBeCloseTo(10_184.8, 1);
    expect(rows[1].income).toBeCloseTo(9_199.18, 1);
    expect(rows[0].income).toBeGreaterThan(rows[1].income);
  });
});
