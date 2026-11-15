import { computeCashflowSummary,enrichJobIncome } from '../crypto/client-finance';
import { JobIncome } from '../models/transaction.model';
import {
compensationByEmployer,
jobCompensationBetween,
stockCompensationBetween,
stockPurchaseSnapshot,
stockSnapshotAt
} from './job-compensation.util';

const job = (overrides: Partial<JobIncome> = {}): JobIncome => ({
  employer: 'Acme', pay_frequency: 'annual', base_pay: 36525,
  annual_bonus: 0, annual_equity: 0, annual_other: 0,
  annual_taxes: 3652.5, annual_deductions: 0,
  effective_date: '2026-01-01', is_active: true,
  ...overrides,
} as JobIncome);

describe('job compensation history', () => {

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

  it('counts leap days and returns no pay for reversed ranges', () => {
    const row = job({ effective_date: '2024-02-01' });
    expect(jobCompensationBetween(row, '2024-02-28', '2024-03-01').base).toBe(300);
    expect(jobCompensationBetween(row, '2026-02-01', '2026-01-01').gross).toBe(0);
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

});
