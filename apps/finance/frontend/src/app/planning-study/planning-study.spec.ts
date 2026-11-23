import type { FixedExpense, JobIncome, Subscription, Transaction } from '../models/transaction.model';
import { projectPlanningStudy as publishedStudy } from '../../public-api';
import {
  projectPlanningStudy,
  readStudyQuery,
  writeStudyQuery,
  type PlanningStudyProjection,
} from './planning-study';

function bill(patch: Partial<FixedExpense> & Pick<FixedExpense, 'id' | 'name' | 'amount'>): FixedExpense {
  return {
    category: 'Rent',
    frequency: 'monthly',
    start_date: '2026-01-05',
    due_day: 5,
    autopay: true,
    is_active: true,
    next_due_date: null,
    monthly_amount: 0,
    annual_amount: 0,
    created_at: '',
    updated_at: '',
    ...patch,
  };
}

function subscription(patch: Partial<Subscription> & Pick<Subscription, 'id' | 'name' | 'amount'>): Subscription {
  return {
    category: 'Subscriptions',
    frequency: 'quarterly',
    next_bill_date: '2026-10-17',
    is_active: true,
    next_due_date: null,
    monthly_amount: 0,
    annual_amount: 0,
    created_at: '',
    updated_at: '',
    ...patch,
  };
}

function job(patch: Partial<JobIncome> & Pick<JobIncome, 'id' | 'employer' | 'base_pay'>): JobIncome {
  return {
    pay_frequency: 'annual',
    payday_frequency: 'monthly',
    first_pay_date: '2026-10-01',
    effective_date: '2026-01-01',
    is_active: true,
    annual_bonus: 0,
    annual_equity: 0,
    annual_other: 0,
    annual_taxes: 0,
    annual_deductions: 0,
    taxes_per_period: 0,
    deductions_per_period: 0,
    pay_periods_per_year: 1,
    annual_base_pay: patch.base_pay,
    annual_gross: patch.base_pay,
    monthly_gross: 0,
    period_gross: 0,
    period_net: 0,
    annual_net: patch.base_pay,
    monthly_net: 0,
    created_at: '',
    updated_at: '',
    ...patch,
  };
}

function view(patch: Partial<Parameters<typeof projectPlanningStudy>[0]> = {}): PlanningStudyProjection {
  return projectPlanningStudy({
    month: '2026-10',
    bills: [bill({ id: 80, name: 'Harbor rent', amount: 1200 })],
    subscriptions: [subscription({ id: 80, name: 'Maritime archives', amount: 90 })],
    transactions: [{ id: 82, date: '2026-10-06', type: 'expense', amount: 1200 } as Transaction],
    jobs: [job({ id: 1, employer: 'Northwind', base_pay: 60000 })],
    netWorth: 1250,
    openedBillKey: null,
    openedPayId: null,
    openedModelId: null,
    projectedMedian: 4000,
    vaultOpen: true,
    ...patch,
  });
}

describe('projectPlanningStudy', () => {
  it('publishes the same projection the Finance API exports', () => {
    expect(publishedStudy).toBe(projectPlanningStudy);
  });

  it('keeps amounts hidden until a bill, job, or simulation is opened', () => {
    const closed = view();
    expect(closed.bills.every(row => row.actual === null && row.projected === null)).toBe(true);
    expect(closed.pay.every(row => row.actual === null && row.projected === null)).toBe(true);
    expect(closed.actualBalance).toBeNull();
    expect(closed.projectedBalance).toBeNull();
    expect(closed.models.map(model => model.id)).toEqual([
      'retirement', 'simulation', 'savings', 'debt', 'projection', 'research',
    ]);

    const openedBill = view({ openedBillKey: 'bill:80:2026-10-05', openedPayId: 1, openedModelId: 'simulation' });
    expect(openedBill.openedBill).toEqual(jasmine.objectContaining({
      name: 'Harbor rent', actual: 1200, projected: 1200,
    }));
    expect(openedBill.openedPay).toBeNull();
    expect(openedBill.openedModel).toBeNull();
    expect(openedBill.actualBalance).toBeNull();
    expect(openedBill.bills.find(row => row.key === 'subscription:80:2026-10-17')).toEqual(jasmine.objectContaining({
      actual: null, projected: null,
    }));

    const openedPay = view({ openedPayId: 1 });
    expect(openedPay.openedPay).toEqual(jasmine.objectContaining({ name: 'Northwind', actual: 0, projected: 5000 }));

    const openedModel = view({ openedModelId: 'simulation' });
    expect(openedModel.openedModel?.id).toBe('simulation');
    expect(openedModel.actualBalance).toBe(1250);
    expect(openedModel.projectedBalance).toBe(4000);
    expect(openedModel.openedPay).toBeNull();
    const payBeatsModel = view({ openedPayId: 1, openedModelId: 'simulation' });
    expect(payBeatsModel.openedPay?.id).toBe(1);
    expect(payBeatsModel.openedModel).toBeNull();
    expect(payBeatsModel.actualBalance).toBeNull();
  });

  it('matches a paycheck by its job id when one id is a prefix of another', () => {
    const study = view({
      jobs: [
        job({ id: 1, employer: 'Northwind', base_pay: 12000 }),
        job({ id: 11, employer: 'Pier', base_pay: 24000 }),
      ],
      openedPayId: 1,
    });
    expect(study.pay.map(row => [row.id, row.projected])).toEqual([[1, 1000], [11, null]]);
    expect(study.openedPay).toEqual(jasmine.objectContaining({ id: 1, projected: 1000 }));
    const other = view({
      jobs: [
        job({ id: 1, employer: 'Northwind', base_pay: 12000 }),
        job({ id: 11, employer: 'Pier', base_pay: 24000 }),
      ],
      openedPayId: 11,
    });
    expect(other.openedPay?.projected).toBe(2000);
  });

  it('drops private rows when the vault is locked and ignores an unknown selection', () => {
    const locked = view({ vaultOpen: false, openedBillKey: 'bill:80:2026-10-05', openedModelId: 'simulation' });
    expect(locked.bills).toEqual([]);
    expect(locked.pay).toEqual([]);
    expect(locked.actualBalance).toBeNull();
    expect(locked.projectedBalance).toBeNull();
    expect(locked.models.every(model => model.opened === false)).toBe(true);

    const unknown = view({ openedBillKey: 'bill:99:2026-10-05', openedModelId: 'missing' });
    expect(unknown.openedBill).toBeNull();
    expect(unknown.openedModel).toBeNull();
  });

  it('reads and writes one study selection', () => {
    const params = new Map([['month', '2026-09'], ['bill', 'bill:80:2026-10-05'], ['pay', '11'], ['model', 'simulation']]);
    expect(readStudyQuery(name => params.get(name) ?? null, '2026-10')).toEqual({
      month: '2026-09', bill: 'bill:80:2026-10-05', pay: 11, model: 'simulation',
    });
    expect(readStudyQuery(() => 'nope', '2026-10')).toEqual({
      month: '2026-10', bill: null, pay: null, model: null,
    });
    expect(writeStudyQuery({
      month: '2026-10', bill: null, pay: 11, model: null,
    }, '2026-10')).toEqual({ t: 'study', month: null, bill: null, pay: '11', model: null });
  });
});
