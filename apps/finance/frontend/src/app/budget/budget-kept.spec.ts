import type { PlanningInputsPreview, PlanningProfile, ProfilePayload } from '../models/planning.model';
import type { Transaction } from '../models/transaction.model';
import {
  budgetKeptWeeks,
  firstTransactionDate,
  resolveAnnualPlan,
  type BudgetKeptWeek,
} from './budget-kept';

/** Synthetic ledger rows only. Annual 3650 is 70 per week, an exact 365 multiple. */
const PLAN = 3650;
const WEEKLY = 70;

type PlanInputs = Pick<PlanningInputsPreview, 'recurring_annual_spending' | 'implied_annual_spending'>;

function inputs(recurring: number | undefined, implied: number): PlanInputs {
  return { recurring_annual_spending: recurring, implied_annual_spending: implied };
}

function nullRecurring(implied: number): PlanInputs {
  return { recurring_annual_spending: null, implied_annual_spending: implied } as unknown as PlanInputs;
}

function profile(row: {
  id: number;
  updated_at: string;
  mode?: 'manual' | 'components' | 'recurring';
  annual?: number | null;
  components?: ProfilePayload['spending_components'];
}): PlanningProfile {
  const payload = {
    annual_spending: row.annual ?? null,
    spending_components: row.components,
  } as ProfilePayload;
  if (row.mode) payload.spending_mode = row.mode;
  return {
    id: row.id,
    name: 'Synthetic',
    base_currency: 'USD',
    payload,
    created_at: row.updated_at,
    updated_at: row.updated_at,
  };
}

function tx(row: Partial<Transaction> & Pick<Transaction, 'id' | 'date' | 'amount'>): Transaction {
  return { type: 'expense', category: 'food', ...row };
}

function week(weekStart: string, spend: number | null, kept: boolean | null, weeklyPlan = WEEKLY): BudgetKeptWeek {
  return { weekStart, spend, weeklyPlan, kept };
}

/** ISO week number of a Monday, used to pin 2026-12-28 as week 53. */
function isoWeekOfMonday(monday: string): number {
  const thursday = new Date(`${monday}T00:00:00Z`);
  thursday.setUTCDate(thursday.getUTCDate() + 3);
  const year = thursday.getUTCFullYear();
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const week1 = new Date(jan4);
  week1.setUTCDate(jan4.getUTCDate() - ((jan4.getUTCDay() + 6) % 7));
  return (Date.parse(`${monday}T00:00:00Z`) - week1.getTime()) / 86_400_000 / 7 + 1;
}

describe('budget kept pure core', () => {
  const at = '2026-08-01T00:00:00.000Z';

  it('resolves manual, components, and recurring plans from the latest profile', () => {
    const older = profile({ id: 9, updated_at: '2026-01-01T00:00:00.000Z', mode: 'manual', annual: 100 });
    const manual = profile({ id: 2, updated_at: '2026-06-01T00:00:00.000Z', mode: 'manual', annual: PLAN });
    expect(resolveAnnualPlan([older, manual], inputs(1, 1))).toEqual({ annualPlan: PLAN, mode: 'manual' });

    const components = profile({
      id: 3,
      updated_at: at,
      mode: 'components',
      components: { fixed_annual: 1000, variable_annual: 2000, irregular_annual: 650 },
    });
    expect(resolveAnnualPlan([components], inputs(1, 1))).toEqual({ annualPlan: PLAN, mode: 'components' });
    expect(resolveAnnualPlan([
      profile({ id: 4, updated_at: at, mode: 'components', components: { fixed_annual: -100, variable_annual: 80, irregular_annual: 30 } }),
    ], inputs(1, 1))).toEqual({ annualPlan: 10, mode: 'components' });

    const recurring = profile({ id: 5, updated_at: at, mode: 'recurring', annual: 99999 });
    expect(resolveAnnualPlan([recurring], inputs(4800, 100))).toEqual({ annualPlan: 4800, mode: 'recurring' });
    expect(resolveAnnualPlan([], inputs(4800, 100))).toBeNull();
  });

  it('treats a legacy profile with no spending_mode as manual', () => {
    const legacy = profile({ id: 1, updated_at: at, annual: 1800 });
    expect(legacy.payload.spending_mode).toBeUndefined();
    expect(resolveAnnualPlan([legacy], inputs(9999, 9999))).toEqual({ annualPlan: 1800, mode: 'manual' });
  });

  it('breaks an updated_at tie by the highest profile id', () => {
    const low = profile({ id: 3, updated_at: at, mode: 'manual', annual: 111 });
    const high = profile({ id: 8, updated_at: at, mode: 'manual', annual: 2222 });
    expect(resolveAnnualPlan([low, high], inputs(undefined, 0))).toEqual({ annualPlan: 2222, mode: 'manual' });
    expect(resolveAnnualPlan([high, low], inputs(undefined, 0))).toEqual({ annualPlan: 2222, mode: 'manual' });
  });

  it('falls back to implied annual spending when recurring_annual_spending is null', () => {
    const recurring = profile({ id: 1, updated_at: at, mode: 'recurring' });
    expect(resolveAnnualPlan([recurring], nullRecurring(2100))).toEqual({ annualPlan: 2100, mode: 'recurring' });
    expect(resolveAnnualPlan([recurring], inputs(undefined, 2100))).toEqual({ annualPlan: 2100, mode: 'recurring' });
    expect(resolveAnnualPlan([recurring], inputs(0, 2100))).toBeNull();
  });

  it('returns null for a plan of 0, null, negative, or non-finite', () => {
    const manual = (annual: number | null) => [profile({ id: 1, updated_at: at, mode: 'manual', annual })];
    expect(resolveAnnualPlan(manual(0), inputs(undefined, 0))).toBeNull();
    expect(resolveAnnualPlan(manual(null), inputs(undefined, 50))).toBeNull();
    expect(resolveAnnualPlan(manual(-20), inputs(undefined, 50))).toBeNull();
    expect(resolveAnnualPlan(manual(Number.NaN), inputs(undefined, 50))).toBeNull();
    expect(resolveAnnualPlan(manual(Number.POSITIVE_INFINITY), inputs(undefined, 50))).toBeNull();
    expect(resolveAnnualPlan([
      profile({ id: 2, updated_at: at, mode: 'components' }),
    ], inputs(undefined, 50))).toBeNull();
    expect(resolveAnnualPlan([
      profile({ id: 3, updated_at: at, mode: 'components', components: { fixed_annual: 0, variable_annual: 0, irregular_annual: 0 } }),
    ], inputs(undefined, 50))).toBeNull();
    expect(resolveAnnualPlan([
      profile({ id: 4, updated_at: at, mode: 'recurring' }),
    ], inputs(undefined, Number.NaN))).toBeNull();
  });

  it('counts a week exactly at the plan as kept and one cent over as not kept', () => {
    const weeks = budgetKeptWeeks([
      tx({ id: 1, date: '2026-10-06', amount: 70, kind: 'purchase' }),
      tx({ id: 2, date: '2026-10-13', amount: 70.01, kind: 'purchase' }),
    ], PLAN, ['2026-10-05', '2026-10-12']);
    expect(weeks[0]).toEqual(week('2026-10-05', 70, true));
    expect(weeks[1]).toEqual(week('2026-10-12', 70.01, false));
  });

  it('lowers spend by a refund and ignores transfers, payments, credits, and excluded rows', () => {
    const weeks = budgetKeptWeeks([
      tx({ id: 1, date: '2026-10-06', amount: 90, kind: 'purchase' }),
      tx({ id: 2, date: '2026-10-07', amount: 20, type: 'expense', kind: 'refund' }),
      tx({ id: 3, date: '2026-10-07', amount: 400, type: 'expense', kind: 'transfer' }),
      tx({ id: 4, date: '2026-10-08', amount: 80, type: 'expense', kind: 'payment' }),
      tx({ id: 5, date: '2026-10-08', amount: 15, kind: 'ambiguous_credit' }),
      tx({ id: 6, date: '2026-10-08', amount: 500, type: 'income' }),
      tx({ id: 7, date: '2026-10-09', amount: -40, kind: 'purchase' }),
      tx({ id: 8, date: '2026-10-13', amount: 40, type: 'expense' }),
    ], PLAN, ['2026-10-05', '2026-10-12']);
    expect(weeks[0]).toEqual(week('2026-10-05', 70, true));
    expect(weeks[1]).toEqual(week('2026-10-12', 40, true));
  });

  it('assigns Sunday to the previous Monday and keeps 2026-12-28 through 2027-01-03 in ISO week 53', () => {
    expect(isoWeekOfMonday('2026-12-28')).toBe(53);
    expect(isoWeekOfMonday('2027-01-04')).toBe(1);
    const weeks = budgetKeptWeeks([
      tx({ id: 1, date: '2026-10-11', amount: 3, kind: 'purchase' }),
      tx({ id: 2, date: '2026-10-12', amount: 4, kind: 'purchase' }),
      tx({ id: 3, date: '2026-12-28', amount: 1, kind: 'purchase' }),
      tx({ id: 4, date: '2027-01-03', amount: 2, kind: 'purchase' }),
      tx({ id: 5, date: '2027-01-04', amount: 8, kind: 'purchase' }),
    ], PLAN, ['2026-10-05', '2026-10-12', '2026-12-28', '2027-01-04']);
    expect(weeks.map(row => [row.weekStart, row.spend])).toEqual([
      ['2026-10-05', 3],
      ['2026-10-12', 4],
      ['2026-12-28', 3],
      ['2027-01-04', 8],
    ]);
  });

  it('marks the week of 2026-10-05 unknown when the first transaction is Wed 2026-10-14', () => {
    const weeks = budgetKeptWeeks([
      tx({ id: 1, date: '2026-10-14', amount: 10, kind: 'purchase' }),
    ], PLAN, ['2026-10-05', '2026-10-12', '2026-10-19']);
    expect(weeks).toEqual([
      week('2026-10-05', null, null),
      week('2026-10-12', 10, true),
      week('2026-10-19', 0, true),
    ]);
  });

  it('marks every week unknown when there are no transactions', () => {
    expect(firstTransactionDate([])).toBeNull();
    expect(budgetKeptWeeks([], PLAN, ['2026-10-05', '2026-10-12'])).toEqual([
      week('2026-10-05', null, null),
      week('2026-10-12', null, null),
    ]);
  });

  it('lets an excluded row dated before every other row set the first transaction date', () => {
    const excluded = tx({ id: 1, date: '2026-09-30', amount: -12, kind: 'purchase' });
    const later = tx({ id: 2, date: '2026-10-20', amount: 10, kind: 'purchase' });
    expect(firstTransactionDate([later, excluded])).toBe('2026-09-30');
    expect(budgetKeptWeeks([later, excluded], PLAN, ['2026-09-21', '2026-09-28'])).toEqual([
      week('2026-09-21', null, null),
      week('2026-09-28', 0, true),
    ]);
  });
});
