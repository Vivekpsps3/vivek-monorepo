import { JobIncome, JobIncomeCreate } from '../models/transaction.model';
import {
  annualBasePayAt,
  compensationByEmployer,
  initialAnnualBasePay,
  isCurrentJob,
  jobCompensationBetween,
  jobHistoryError,
  latestStockValuationOnOrBefore,
  replaceStockValuation,
  stockCompensationBetween,
  stockGrantSnapshot,
  stockPortfolioValueAt,
  stockPurchaseSnapshot,
  stockSalesProceedsBetween,
  stockSnapshotAt,
} from './job-compensation.util';
import { computeCashflowSummary, enrichJobIncome } from '../crypto/client-finance';

const job = (overrides: Partial<JobIncome> = {}): JobIncome => ({
  employer: 'Acme', pay_frequency: 'annual', base_pay: 36525,
  annual_bonus: 0, annual_equity: 0, annual_other: 0,
  annual_taxes: 3652.5, annual_deductions: 0,
  effective_date: '2026-01-01', is_active: true,
  ...overrides,
} as JobIncome);

describe('job compensation history', () => {
  it('preserves legacy job pay when there is no history', () => {
    const row = job();
    expect(initialAnnualBasePay(row)).toBe(36525);
    expect(jobCompensationBetween(row, '2026-01-01', '2026-01-31').gross).toBe(3100);
    expect(jobCompensationBetween(row, '2026-01-01', '2026-01-31').net).toBe(2790);
    expect(enrichJobIncome(row).annual_base_pay).toBe(36525);
  });

  it('converts each pay frequency and respects recorded hourly hours', () => {
    for (const [frequency, factor] of [['annual', 1], ['monthly', 12], ['semimonthly', 24], ['biweekly', 26], ['weekly', 52], ['hourly', 1040]] as const) {
      expect(initialAnnualBasePay(job({ base_pay: 10, pay_frequency: frequency, hours_per_week: 20 }))).toBe(10 * factor);
    }
    expect(initialAnnualBasePay(job({ base_pay: 10, pay_frequency: 'hourly', hours_per_week: 0 }))).toBe(0);
  });

  it('counts inclusive start and end dates and no pay outside employment', () => {
    const row = job({ effective_date: '2026-01-10', end_date: '2026-01-20' });
    expect(jobCompensationBetween(row, '2026-01-01', '2026-01-31').base).toBe(1100);
    expect(jobCompensationBetween(row, '2026-01-20', '2026-01-20').base).toBe(100);
    expect(jobCompensationBetween(row, '2025-12-01', '2025-12-31').gross).toBe(0);
    expect(jobCompensationBetween(row, '2026-02-01', '2026-02-28').gross).toBe(0);
  });

  it('applies unordered promotions once, on their exact effective dates', () => {
    const row = job({ promotions: [
      { date: '2026-01-21', annual_base_pay: 109575 },
      { date: '2026-01-11', annual_base_pay: 73050 },
    ] });
    expect(jobCompensationBetween(row, '2026-01-01', '2026-01-31').base).toBe(6300);
    expect(jobCompensationBetween(row, '2026-01-11', '2026-01-20').base).toBe(2000);
    expect(annualBasePayAt(row, '2026-01-10')).toBe(36525);
    expect(annualBasePayAt(row, '2026-01-11')).toBe(73050);
    expect(row.promotions![0].date).toBe('2026-01-21');
    expect(row.base_pay).toBe(36525);
  });

  it('keeps future promotions out of current estimates', () => {
    const row = job({ promotions: [{ date: '9999-01-01', annual_base_pay: 73050 }] });
    expect(enrichJobIncome(row).annual_base_pay).toBe(36525);
  });

  it('adds dated payments once, including a final bonus after a job ends', () => {
    const row = job({ end_date: '2026-01-10', annual_bonus: 3652.5, annual_equity: 7305, annual_other: 365.25,
      compensation_payments: [
        { date: '2026-01-10', kind: 'bonus', amount: 500 },
        { date: '2026-01-31', kind: 'equity', amount: 2000 },
        { date: '2026-02-01', kind: 'bonus', amount: 1000 },
      ] });
    const totals = jobCompensationBetween(row, '2026-01-01', '2026-01-31');
    expect(totals.base).toBe(1000);
    expect(totals.bonus).toBe(600);
    expect(totals.equity).toBe(2200);
    expect(totals.other).toBe(10);
    expect(totals.gross).toBe(3810);
    expect(totals.net).toBe(3710);
    expect(jobCompensationBetween(row, '2026-02-01', '2026-02-28').gross).toBe(1000);
  });

  it('combines employers across inactive jobs, preserving different employers', () => {
    const rows = compensationByEmployer([
      job({ is_active: false, end_date: '2026-01-10' }),
      job({ employer: ' ACME ', effective_date: '2026-01-11' }),
      job({ employer: 'Beta', base_pay: 73050 }),
    ], '2026-01-01', '2026-01-31');
    expect(rows.map(row => row.employer)).toEqual(['Beta', 'Acme']);
    expect(rows[1].jobs).toBe(2);
    expect(rows[1].gross).toBe(3100);
  });

  it('uses dated history for scheduled cashflow and excludes disabled jobs', () => {
    const row = job({ end_date: '2026-01-20', promotions: [{ date: '2026-01-11', annual_base_pay: 73050 }],
      compensation_payments: [{ date: '2026-01-31', kind: 'bonus', amount: 500 }] });
    const summary = computeCashflowSummary('2026-01-01', '2026-01-31', [], [row, job({ is_active: false })], [], []);
    expect(summary.scheduled_income).toBe(3300);
    expect(computeCashflowSummary('2026-02-01', '2026-02-28', [], [row], [], []).scheduled_income).toBe(0);
  });

  it('counts leap days and returns no pay for reversed ranges', () => {
    const row = job({ effective_date: '2024-02-01' });
    expect(jobCompensationBetween(row, '2024-02-28', '2024-03-01').base).toBe(300);
    expect(jobCompensationBetween(row, '2026-02-01', '2026-01-01').gross).toBe(0);
  });

  it('limits current pay to enabled jobs within employment dates', () => {
    expect(isCurrentJob(job(), '2026-01-01')).toBeTrue();
    expect(isCurrentJob(job({ effective_date: '2026-02-01' }), '2026-01-01')).toBeFalse();
    expect(isCurrentJob(job({ end_date: '2026-01-01' }), '2026-01-01')).toBeTrue();
    expect(isCurrentJob(job({ end_date: '2026-01-01' }), '2026-01-02')).toBeFalse();
    expect(isCurrentJob(job({ is_active: false }), '2026-01-01')).toBeFalse();
  });

  it('validates date ordering, real calendar dates, and duplicate promotions', () => {
    const check = (changes: Partial<JobIncomeCreate>) => jobHistoryError({ ...job(), ...changes } as JobIncomeCreate);
    expect(check({})).toBeNull();
    expect(check({ end_date: '2025-12-31' })).toContain('End date');
    expect(check({ effective_date: '2026-02-30' })).toContain('start date');
    expect(check({ promotions: [{ date: '2026-01-01', annual_base_pay: 10 }] })).toContain('Promotion dates');
    expect(check({ end_date: '2026-01-10', promotions: [{ date: '2026-01-11', annual_base_pay: 10 }] })).toContain('Promotion dates');
    expect(check({ promotions: [{ date: '2026-02-01', annual_base_pay: 10 }, { date: '2026-02-01', annual_base_pay: 20 }] })).toContain('one promotion');
    expect(check({ promotions: [{ date: '2026-02-01', annual_base_pay: -1 }] })).toContain('non-negative');
    expect(check({ compensation_payments: [{ date: '', kind: 'bonus', amount: 1 }] })).toContain('Payment dates');
    expect(check({ compensation_payments: [{ date: '2026-02-01', kind: 'bonus', amount: NaN }] })).toContain('non-negative');
    expect(check({ end_date: '2026-01-10', compensation_payments: [{ date: '2026-02-01', kind: 'bonus', amount: 1 }] })).toBeNull();
  });

  it('tracks the sample grant as fixed sale proceeds plus the remaining shares at a dated valuation', () => {
    const row = job({
      stock_grants: [{
        date: '2026-01-01', origin: 'bonus', label: 'Bonus paid in stock', quantity: 200, price_at_grant: 100,
        sales: [{ date: '2026-09-01', shares: 100, cash_proceeds: 15000 }],
      }],
      stock_valuations: [{ date: '2026-11-01', price_per_share: 200 }],
    });
    expect(stockGrantSnapshot(row.stock_grants![0], row.stock_valuations, '2026-11-01')).toEqual({
      realizedProceeds: 15000, sharesSold: 100, remainingShares: 100,
      valuationPrice: 200, valuationDate: '2026-11-01', hasDatedValuation: true, remainingValue: 20000, totalValue: 35000,
    });
    expect(stockPortfolioValueAt(row, '2026-11-01')).toBe(35000);
    expect(stockCompensationBetween(row, '2026-01-01', '2026-11-01')).toBe(35000);
  });

  it('attributes grant value to the grant year and only incremental value changes to later years', () => {
    const row = job({
      effective_date: '2025-01-01',
      stock_grants: [{ date: '2025-01-01', origin: 'equity', quantity: 1000, price_at_grant: 100, sales: [] }],
      stock_valuations: [
        { date: '2025-12-31', price_per_share: 100 },
        { date: '2026-12-31', price_per_share: 200 },
      ],
    });
    expect(stockCompensationBetween(row, '2025-01-01', '2025-12-31')).toBe(100000);
    expect(stockCompensationBetween(row, '2026-01-01', '2026-12-31')).toBe(100000);
    expect(compensationByEmployer([row], '2026-01-01', '2026-12-31')[0].gross).toBeCloseTo(100000 + jobCompensationBetween(row, '2026-01-01', '2026-12-31').gross);
  });

  it('counts a $100,000 grant that grows to $200,000 in one year as $200,000 total stock compensation', () => {
    const row = job({
      stock_grants: [{ date: '2026-01-01', origin: 'equity', quantity: 1000, price_at_grant: 100 }],
      stock_valuations: [{ date: '2026-12-31', price_per_share: 200 }],
    });
    expect(stockCompensationBetween(row, '2026-01-01', '2026-12-31')).toBe(200000);
    expect(compensationByEmployer([row], '2026-01-01', '2026-12-31')[0].stock_compensation).toBe(200000);
  });

  it('ignores future grants, sales, and valuations for historical cutoff snapshots', () => {
    const row = job({
      stock_grants: [{
        date: '2026-01-01', origin: 'equity', quantity: 10, price_at_grant: 100,
        sales: [{ date: '2026-12-01', shares: 5, cash_proceeds: 900 }],
      }, { date: '2026-07-01', origin: 'bonus', quantity: 2, price_at_grant: 500 }],
      stock_valuations: [{ date: '2026-12-01', price_per_share: 300 }],
    });
    expect(stockSnapshotAt(row, '2026-06-30')).toEqual({ realizedProceeds: 0, remainingShares: 10, remainingValue: 1000, totalValue: 1000, employeeContributions: 0 });
    expect(stockSnapshotAt(row, '2026-12-01')).toEqual({ realizedProceeds: 900, remainingShares: 7, remainingValue: 2100, totalValue: 3000, employeeContributions: 0 });
    expect(stockGrantSnapshot({ date: '2026-07-01', origin: 'equity', quantity: 1, price_at_grant: 500 }, [{ date: '2026-06-01', price_per_share: 0 }], '2026-07-01').valuationPrice).toBe(500);
  });

  it('subtracts ESPP employee contributions while counting purchase-date market value as compensation', () => {
    const row = job({
      stock_symbol: 'MSFT',
      stock_purchases: [{
        date: '2026-01-15', quantity: 10, price_paid_per_share: 80, market_price_at_purchase: 100,
        sales: [{ date: '2026-02-15', shares: 5, cash_proceeds: 550 }],
      }],
      stock_valuations: [
        { date: '2026-01-14', price_per_share: 100, source: 'live_eod', symbol: 'MSFT', observed_date: '2026-01-15' },
        { date: '2026-02-20', price_per_share: 120, source: 'live_eod', symbol: 'MSFT', observed_date: '2026-02-20' },
      ],
    });

    expect(stockSnapshotAt(row, '2026-01-14').totalValue).toBe(0);
    expect(stockSnapshotAt(row, '2026-01-15')).toEqual({
      realizedProceeds: 0, remainingShares: 10, remainingValue: 1000, totalValue: 1000, employeeContributions: 800,
    });
    expect(stockCompensationBetween(row, '2026-01-15', '2026-01-31')).toBe(200);
    expect(stockSnapshotAt(row, '2026-02-28')).toEqual({
      realizedProceeds: 550, remainingShares: 5, remainingValue: 600, totalValue: 1150, employeeContributions: 800,
    });
    expect(stockCompensationBetween(row, '2026-02-01', '2026-02-28')).toBe(150);
    expect(stockSalesProceedsBetween(row, '2026-02-01', '2026-02-28')).toBe(550);
    expect(computeCashflowSummary('2026-02-15', '2026-02-15', [], [{ ...row, is_active: false }], [], []).planned_income).toBe(550);
  });

  it('uses legacy ESPP paid basis as valuation fallback and never subtracts grant basis', () => {
    const row = job({
      stock_grants: [{ date: '2026-01-01', origin: 'equity', quantity: 10, price_at_grant: 100 }],
      stock_purchases: [{ date: '2026-01-01', quantity: 10, price_paid_per_share: 80 }],
    });
    expect(stockPurchaseSnapshot(row.stock_purchases![0], [], '2026-12-31').valuationPrice).toBe(80);
    expect(stockCompensationBetween(row, '2026-01-01', '2026-12-31')).toBe(1000);
    expect(stockSnapshotAt(row, '2026-12-31').employeeContributions).toBe(800);
  });

  it('uses a quote observed today for a new lot while keeping its actual market date for history', () => {
    const row = job({
      stock_symbol: 'MSFT',
      stock_purchases: [{ date: '2026-10-09', quantity: 10, price_paid_per_share: 80 }],
      stock_valuations: [{
        date: '2026-10-08', price_per_share: 100, source: 'live_eod', symbol: 'MSFT',
        price_as_of: '2026-10-09T12:00:00Z', observed_date: '2026-10-09',
      }],
    });
    expect(stockSnapshotAt(row, '2026-10-08').totalValue).toBe(0);
    expect(stockSnapshotAt(row, '2026-10-09').remainingValue).toBe(1000);
    expect(stockCompensationBetween(row, '2026-10-09', '2026-10-09')).toBe(200);
    expect(stockSnapshotAt({ ...row, stock_symbol: 'AAPL' }, '2026-10-09').remainingValue).toBe(800);
  });

  it('accepts a prior trading-day quote for a job starting today but waits for future lots to be acquired', () => {
    const quote = {
      date: '2026-10-08', price_per_share: 100, source: 'live_eod', symbol: 'MSFT',
      price_as_of: '2026-10-09T12:00:00Z', observed_date: '2026-10-09',
    };
    const startsToday = job({
      effective_date: '2026-10-09', stock_symbol: 'MSFT',
      stock_grants: [{ date: '2026-10-09', origin: 'equity', quantity: 10, price_at_grant: 80 }],
      stock_valuations: [quote],
    });
    expect(jobHistoryError(startsToday as JobIncomeCreate)).toBeNull();
    expect(stockSnapshotAt(startsToday, '2026-10-08').totalValue).toBe(0);
    expect(stockSnapshotAt(startsToday, '2026-10-09').remainingValue).toBe(1000);

    const startsLater = job({
      effective_date: '2026-10-20', stock_symbol: 'MSFT',
      stock_grants: [{ date: '2026-10-20', origin: 'equity', quantity: 10, price_at_grant: 80 }],
      stock_valuations: [quote],
    });
    expect(jobHistoryError(startsLater as JobIncomeCreate)).toBeNull();
    expect(stockSnapshotAt(startsLater, '2026-10-19').totalValue).toBe(0);
    expect(stockSnapshotAt(startsLater, '2026-10-20').remainingValue).toBe(800);
  });

  it('ignores invalid or future marks and replaces same-day values without losing other dates', () => {
    const marks = [
      { date: '2026-02-01', price_per_share: 20 },
      { date: '2026-03-01', price_per_share: Number.NaN },
      { date: '2026-12-01', price_per_share: 50 },
      { date: '2026-02-01', price_per_share: 30 },
    ];
    const replaced = replaceStockValuation(marks, { date: '2026-02-01', price_per_share: 25, source: 'manual' });
    expect(replaced.filter(mark => mark.date === '2026-02-01')).toEqual([{ date: '2026-02-01', price_per_share: 25, source: 'manual' }]);
    expect(latestStockValuationOnOrBefore(replaced, '2026-06-01')?.price_per_share).toBe(25);
    expect(latestStockValuationOnOrBefore(replaced, '2026-11-30')?.price_per_share).toBe(25);
  });

  it('keeps later grants at their own grant price until a later shared valuation', () => {
    const row = job({
      stock_grants: [
        { date: '2026-01-01', origin: 'equity', quantity: 100, price_at_grant: 10 },
        { date: '2026-06-01', origin: 'bonus', quantity: 1, price_at_grant: 500 },
      ],
      stock_valuations: [{ date: '2026-03-01', price_per_share: 20 }],
    });
    const value = stockSnapshotAt(row, '2026-06-01');
    expect(value.remainingValue).toBe(2500);
    expect(value.totalValue).toBe(2500);
  });

  it('keeps realized proceeds fixed when later valuations move up or down', () => {
    const row = job({
      stock_grants: [{
        date: '2026-01-01', origin: 'equity', quantity: 100, price_at_grant: 100,
        sales: [{ date: '2026-02-01', shares: 50, cash_proceeds: 22500 }],
      }],
      stock_valuations: [{ date: '2026-03-01', price_per_share: 50 }, { date: '2026-04-01', price_per_share: 0 }],
    });
    expect(stockSnapshotAt(row, '2026-03-01').totalValue).toBe(25000);
    expect(stockSnapshotAt(row, '2026-04-01').totalValue).toBe(22500);
    expect(stockSalesProceedsBetween(row, '2026-02-01', '2026-02-28')).toBe(22500);
    expect(stockSnapshotAt(row, '2026-04-01').realizedProceeds).toBe(22500);
  });

  it('keeps the requested 775-share grant and two locked sale proceeds isolated from a later quote', () => {
    const row = job({
      stock_symbol: 'MSFT',
      stock_grants: [{
        date: '2026-04-24', origin: 'equity', quantity: 775, price_at_grant: 42.40,
        sales: [
          { date: '2026-08-07', shares: 25, cash_proceeds: 3249.73 },
          { date: '2026-08-07', shares: 50, cash_proceeds: 6303.37 },
        ],
      }],
      stock_valuations: [{
        date: '2026-10-08', price_per_share: 150, source: 'live_eod', symbol: 'MSFT',
        price_as_of: '2026-10-09T12:00:00Z', observed_date: '2026-10-09',
      }],
    });

    const historical = stockSnapshotAt(row, '2026-08-07');
    expect(historical.remainingShares).toBe(700);
    expect(historical.remainingValue).toBe(29680);
    expect(historical.realizedProceeds).toBe(9553.10);
    expect(historical.totalValue).toBe(39233.10);

    const current = stockSnapshotAt(row, '2026-10-09');
    expect(current.remainingShares).toBe(700);
    expect(current.remainingValue).toBe(105000);
    expect(current.realizedProceeds).toBe(9553.10);
    expect(current.totalValue).toBe(114553.10);
  });

  it('allows multiple same-day sales up to the grant and rejects chronological overselling', () => {
    const valid: JobIncomeCreate = {
      ...job(), stock_grants: [{ date: '2026-01-01', origin: 'equity', quantity: 10, price_at_grant: 100,
        sales: [
          { date: '2026-02-01', shares: 4, cash_proceeds: 400 },
          { date: '2026-02-01', shares: 6, cash_proceeds: 600 },
        ],
      }],
      stock_valuations: [{ date: '2026-02-01', price_per_share: 0 }],
    } as JobIncomeCreate;
    expect(jobHistoryError(valid)).toBeNull();
    expect(jobHistoryError({ ...valid, stock_grants: [{ ...valid.stock_grants![0], sales: [
      { date: '2026-02-01', shares: 6, cash_proceeds: 1 },
      { date: '2026-03-01', shares: 5, cash_proceeds: 1 },
    ] }] })).toContain('cannot exceed');
    expect(jobHistoryError({ ...valid, stock_grants: [{ ...valid.stock_grants![0], quantity: 9 }] })).toContain('cannot exceed');
    expect(jobHistoryError({ ...valid, stock_grants: [{ ...valid.stock_grants![0], sales: [
      { date: '2025-12-31', shares: 1, cash_proceeds: 1 },
    ] }] })).toContain('on or after the grant');
  });

  it('adds sale cash to dated cashflow, but never adds stock grant value or unrealized growth to recurring income', () => {
    const row = job({
      is_active: false,
      annual_bonus: 0,
      annual_equity: 0,
      stock_grants: [{
        date: '2026-01-01', origin: 'equity', quantity: 100, price_at_grant: 100,
        sales: [{ date: '2026-02-01', shares: 10, cash_proceeds: 1500 }],
      }],
      stock_valuations: [{ date: '2026-03-01', price_per_share: 200 }],
    });
    const beforeSale = computeCashflowSummary('2026-01-01', '2026-01-31', [], [row], [], []);
    const salePeriod = computeCashflowSummary('2026-02-01', '2026-02-28', [], [row], [], []);
    const afterGrowth = computeCashflowSummary('2026-03-01', '2026-03-31', [], [row], [], []);
    expect(beforeSale.planned_income).toBe(0);
    expect(salePeriod.planned_income).toBe(1500);
    expect(afterGrowth.planned_income).toBe(0);
    expect(enrichJobIncome(row).annual_gross).toBe(36525);
  });

  it('allows grants after employment ends and rejects invalid price/quantity values', () => {
    const check = (changes: Partial<JobIncomeCreate>) => jobHistoryError({ ...job(), ...changes } as JobIncomeCreate);
    const future = new Date();
    future.setFullYear(future.getFullYear() + 1);
    const futureDate = future.toISOString().slice(0, 10);
    expect(check({ end_date: '2026-01-31', stock_grants: [{ date: '2026-02-01', origin: 'bonus', quantity: 1, price_at_grant: 10 }] })).toBeNull();
    expect(check({ stock_grants: [{ date: '2026-02-01', origin: 'equity', quantity: 0, price_at_grant: 10 }] })).toContain('positive');
    expect(check({ stock_valuations: [{ date: '2026-02-01', price_per_share: -1 }] })).toContain('non-negative');
    expect(check({ effective_date: '2026-10-09', stock_symbol: 'MSFT', stock_valuations: [{
      date: '2026-10-08', price_per_share: 100, source: 'live_eod', symbol: 'MSFT',
      price_as_of: '2026-10-09T12:00:00Z', observed_date: '2026-10-09',
    }] })).toBeNull();
    expect(check({ effective_date: '2026-10-15', stock_symbol: 'MSFT', stock_valuations: [{
      date: '2026-10-08', price_per_share: 100, source: 'live_eod', symbol: 'MSFT',
      price_as_of: '2026-10-09T12:00:00Z', observed_date: '2026-10-09',
    }] })).toBeNull();
    expect(check({ effective_date: '2026-10-09', stock_valuations: [{ date: '2026-10-08', price_per_share: 100 }] })).toContain('on or after the job start');
    expect(check({ effective_date: '2026-10-09', stock_symbol: 'MSFT', stock_valuations: [{
      date: '2026-10-10', price_per_share: 100, source: 'live_eod', symbol: 'MSFT', observed_date: '2026-10-09',
    }] })).toContain('cannot be in the future');
    expect(check({ effective_date: '2026-10-09', stock_symbol: 'MSFT', stock_valuations: [{
      date: '2026-10-08', price_per_share: 100, source: 'live_eod', symbol: 'MSFT', observed_date: futureDate,
    }] })).toContain('cannot be in the future');
    expect(check({ stock_grants: [{ date: '2026-02-01', origin: 'equity', quantity: 1, price_at_grant: 0 }] })).toContain('positive');
    expect(check({ stock_grants: [{ date: '2026-02-01', origin: 'equity', quantity: 1, price_at_grant: 10, sales: [{ date: '2026-02-02', shares: 1, cash_proceeds: NaN }] }] })).toContain('non-negative');
    expect(check({ stock_grants: [{ date: '2026-02-01', origin: 'equity', quantity: 1, price_at_grant: 10, sales: [{ date: '2026-02-02', shares: 1, cash_proceeds: Infinity }] }] })).toContain('non-negative');
    expect(check({ stock_grants: [{ date: '2026-02-01', origin: 'equity', quantity: 1, price_at_grant: 10, sales: [{ date: '2026-02-02', shares: NaN, cash_proceeds: 1 }] }] })).toContain('positive');
    expect(check({ stock_valuations: [{ date: '2026-02-01', price_per_share: NaN }] })).toContain('non-negative');
    expect(check({ stock_valuations: [{ date: '2026-02-01', price_per_share: Infinity }] })).toContain('non-negative');
    expect(check({ stock_valuations: [{ date: '2026-02-01', price_per_share: 10 }, { date: '2026-02-01', price_per_share: 20 }] })).toContain('one stock valuation');
    expect(check({ stock_symbol: 'TOO-LONG-TICKER' })).toContain('ticker');
    expect(check({ stock_purchases: [{ date: '2026-02-01', quantity: 1, price_paid_per_share: 10, market_price_at_purchase: -1 }] })).toContain('market price');
    expect(check({ stock_purchases: [{ date: '2026-02-01', quantity: 0, price_paid_per_share: 10 }] })).toContain('positive');
    expect(check({ stock_purchases: [{ date: '2026-02-01', quantity: 1, price_paid_per_share: 10, sales: [{ date: '2026-02-02', shares: 2, cash_proceeds: 1 }] }] })).toContain('cannot exceed');
  });
});
