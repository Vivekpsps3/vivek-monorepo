import { commitmentFacts, computeCashflowSummary, monthEnd } from '../crypto/client-finance';
import type { FixedExpense, JobIncome, Subscription, Transaction } from '../models/transaction.model';
import { PLANNING_DESTINATIONS } from '../planning/planning-destinations';
import { PROJECTED_RESULT_NOTE } from '../planning/planning-copy';

export const STUDY_ACTUAL_LABEL = 'Actual';
export const STUDY_PROJECTED_LABEL = 'Projected';
export const STUDY_PROJECTED_NOTE = PROJECTED_RESULT_NOTE;

/** Same initial run the simulation editor starts from, until that editor saves a draft. */
export const STUDY_SIMULATION_DEFAULTS = Object.freeze({
  horizonYears: 30,
  nPaths: 500,
  seed: 1,
});

export interface StudyBill {
  key: string;
  kind: 'bill' | 'subscription';
  id: number;
  name: string;
  date: string;
  opened: boolean;
  projected: number | null;
  actual: number | null;
}

export interface StudyPayDrawer {
  id: number;
  name: string;
  opened: boolean;
  actual: number | null;
  projected: number | null;
}

export interface StudyModel {
  id: string;
  label: string;
  detail: string;
  path: string;
  opened: boolean;
}

export interface PlanningStudyProjection {
  month: string;
  bills: StudyBill[];
  pay: StudyPayDrawer[];
  models: StudyModel[];
  openedBill: StudyBill | null;
  openedPay: StudyPayDrawer | null;
  openedModel: StudyModel | null;
  actualBalance: number | null;
  projectedBalance: number | null;
}

export interface StudyQuery {
  month: string;
  bill: string | null;
  pay: number | null;
  model: string | null;
}

const MONTH = /^\d{4}-\d{2}$/;
const BILL_KEY = /^(bill|subscription):\d{1,16}:\d{4}-\d{2}-\d{2}$/;

export function studyMonth(value: string | null | undefined, fallback: string): string {
  return value && MONTH.test(value) ? value : fallback;
}

export function readStudyQuery(get: (name: string) => string | null, fallbackMonth: string): StudyQuery {
  const bill = get('bill');
  const pay = get('pay');
  const model = get('model');
  const knownModel = PLANNING_DESTINATIONS.some(row => row.id === model) ? model : null;
  return {
    month: studyMonth(get('month'), fallbackMonth),
    bill: bill && BILL_KEY.test(bill) ? bill : null,
    pay: pay && /^\d{1,16}$/.test(pay) ? Number(pay) : null,
    model: knownModel,
  };
}

export function writeStudyQuery(query: StudyQuery, defaultMonth: string): Record<string, string | null> {
  return {
    t: 'study',
    month: query.month === defaultMonth ? null : query.month,
    bill: query.bill,
    pay: query.pay == null ? null : String(query.pay),
    model: query.model,
  };
}

function paycheckJobId(id: string): number | null {
  const match = /^paycheck:(\d+):/.exec(id);
  if (!match) return null;
  const jobId = Number(match[1]);
  return Number.isInteger(jobId) ? jobId : null;
}

/**
 * Bill calendar, pay drawer, and planning models from published records.
 * Amounts stay null until that object is opened. Net worth and the simulation
 * median are copied from the caller. This does not price a scenario or post a record.
 */
export function projectPlanningStudy(input: {
  month: string;
  bills: readonly FixedExpense[];
  subscriptions: readonly Subscription[];
  transactions: readonly Transaction[];
  jobs: readonly JobIncome[];
  netWorth: number | null;
  openedBillKey: string | null;
  openedPayId: number | null;
  openedModelId: string | null;
  projectedMedian: number | null;
  vaultOpen: boolean;
}): PlanningStudyProjection {
  const month = studyMonth(input.month, input.month);
  const models = PLANNING_DESTINATIONS.map(model => ({
    id: model.id,
    label: model.label,
    detail: model.detail,
    path: model.path,
    opened: false,
  }));
  const empty: PlanningStudyProjection = {
    month,
    bills: [],
    pay: [],
    models,
    openedBill: null,
    openedPay: null,
    openedModel: null,
    actualBalance: null,
    projectedBalance: null,
  };
  if (!input.vaultOpen || !MONTH.test(month)) return empty;

  const start = `${month}-01`;
  const end = monthEnd(month);
  const facts = commitmentFacts(start, end, [...input.transactions], input.bills, input.subscriptions);
  const openedBillKey = facts.some(row => row.key === input.openedBillKey) ? input.openedBillKey : null;
  const bills = facts.map(row => {
    const opened = openedBillKey === row.key;
    return {
      key: row.key,
      kind: row.kind,
      id: row.id,
      name: row.name,
      date: row.date,
      opened,
      projected: opened ? row.projected : null,
      actual: opened ? row.actual : null,
    };
  });
  const summary = computeCashflowSummary(start, end, [...input.transactions], [...input.jobs], [...input.bills], [...input.subscriptions]);
  const openedPayId = openedBillKey == null && input.jobs.some(job => job.id === input.openedPayId)
    ? input.openedPayId
    : null;
  const pay = [...input.jobs]
    .map(job => {
      const opened = openedPayId === job.id;
      const projectedRows = summary.income_occurrences.filter(row =>
        row.kind === 'paycheck' && paycheckJobId(row.id) === job.id);
      return {
        id: job.id,
        name: job.employer?.trim() || 'Job',
        opened,
        actual: opened ? summary.observed_income : null,
        projected: opened && projectedRows.length
          ? projectedRows.reduce((sum, row) => sum + row.amount, 0)
          : null,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name) || a.id - b.id);
  const openedModelId = openedBillKey == null && openedPayId == null && models.some(model => model.id === input.openedModelId)
    ? input.openedModelId
    : null;
  const openedModels = models.map(model => ({ ...model, opened: model.id === openedModelId }));
  const simulationOpen = openedModelId === 'simulation';
  return {
    month,
    bills,
    pay,
    models: openedModels,
    openedBill: bills.find(bill => bill.opened) ?? null,
    openedPay: pay.find(drawer => drawer.opened) ?? null,
    openedModel: openedModels.find(model => model.opened) ?? null,
    actualBalance: simulationOpen ? input.netWorth : null,
    projectedBalance: simulationOpen ? input.projectedMedian : null,
  };
}
