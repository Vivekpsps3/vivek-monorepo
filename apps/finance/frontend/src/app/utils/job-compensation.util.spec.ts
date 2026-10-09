import { JobIncome, JobIncomeCreate } from '../models/transaction.model';
import { annualBasePayAt, compensationByEmployer, initialAnnualBasePay, isCurrentJob, jobCompensationBetween, jobHistoryError } from './job-compensation.util';
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
});
