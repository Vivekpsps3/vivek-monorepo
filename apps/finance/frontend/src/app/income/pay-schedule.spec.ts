import { toDollars } from '@vivek/browser';
import { JobIncome } from '../models/transaction.model';
import { estimatedPaycheckNet } from '../utils/job-compensation.util';
import {
centsPaySnapshot,
editorPayFromRecord,
savedPayFromEditor,
type LegacyPayInput,
} from './pay-schedule';

describe('legacy pay schedule cents policy', () => {
  const cadences = ['monthly', 'weekly', 'biweekly', 'semimonthly'] as const;

  function roundTrip(row: LegacyPayInput) {
    const before = centsPaySnapshot(row);
    const saved = savedPayFromEditor(editorPayFromRecord(row));
    const after = centsPaySnapshot({ ...row, ...saved });
    return { before, saved, after };
  }

  it('keeps annual pay, withholding, and paycheck cents for every legacy cadence', () => {
    for (const pay_frequency of cadences) {
      const row: LegacyPayInput = {
        pay_frequency,
        base_pay: 100.01,
        taxes_per_period: 10.01,
        deductions_per_period: 0.01,
        annual_taxes: 1,
        annual_deductions: 1,
        payday_frequency: 'biweekly',
      };
      const { before, saved, after } = roundTrip(row);
      expect(saved.pay_frequency).withContext(pay_frequency).toBe('annual');
      expect(saved.hours_per_week).withContext(pay_frequency).toBeNull();
      expect(after).withContext(pay_frequency).toEqual(before);
      const live = estimatedPaycheckNet({ ...baseJob(), ...row, ...saved } as JobIncome, '2026-10-16');
      expect(live).withContext(pay_frequency).toBe(toDollars(before.paycheckCents!));
      expect(estimatedPaycheckNet({ ...baseJob(), ...row } as JobIncome, '2026-10-16'))
        .withContext(pay_frequency)
        .toBe(live);
    }
  });

  it('normalizes fractional cents with the shared half-away helper', () => {
    for (const pay_frequency of cadences) {
      const row: LegacyPayInput = {
        pay_frequency,
        base_pay: 1.005,
        taxes_per_period: 0.005,
        deductions_per_period: 0.015,
        payday_frequency: pay_frequency === 'semimonthly' ? 'semimonthly' : 'weekly',
      };
      const { before, saved, after } = roundTrip(row);
      expect(after).withContext(pay_frequency).toEqual(before);
      expect(before.annualBaseCents).withContext(pay_frequency).toBe(101 * periods(pay_frequency));
      expect(saved.base_pay).withContext(pay_frequency).toBe(toDollars(before.annualBaseCents));
      expect(estimatedPaycheckNet({ ...baseJob(), ...saved, payday_frequency: row.payday_frequency } as JobIncome, '2026-10-16'))
        .toBe(toDollars(before.paycheckCents!));
    }
  });

});

function periods(frequency: string): number {
  if (frequency === 'monthly') return 12;
  if (frequency === 'semimonthly') return 24;
  if (frequency === 'biweekly') return 26;
  return 52;
}

function baseJob(): Partial<JobIncome> {
  return {
    employer: 'Acme',
    effective_date: '2026-01-01',
    is_active: true,
    annual_bonus: 0,
    annual_equity: 0,
    annual_other: 0,
    promotions: [],
    compensation_payments: [],
  };
}
