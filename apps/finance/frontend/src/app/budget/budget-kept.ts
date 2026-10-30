import { fromDollars } from '@vivek/browser';
import { transactionEffects } from '../crypto/client-finance';
import type { PlanningInputsPreview, PlanningProfile, ProfilePayload } from '../models/planning.model';
import type { Transaction } from '../models/transaction.model';

export interface BudgetKeptWeek {
  weekStart: string;
  spend: number | null;
  weeklyPlan: number;
  kept: boolean | null;
}

export type BudgetKeptResult =
  | { status: 'locked' }
  | { status: 'no_plan' }
  | { status: 'no_data' }
  | {
      status: 'ready';
      annualPlan: number;
      weeklyPlan: number;
      mode: 'manual' | 'components' | 'recurring';
      weeks: BudgetKeptWeek[];
    }
  | { status: 'unavailable' }
  | { status: 'expired' }
  | { status: 'cancelled' };

type SpendingPlanMode = 'manual' | 'components' | 'recurring';
type PlanInputs = Pick<PlanningInputsPreview, 'recurring_annual_spending' | 'implied_annual_spending'>;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function weeklyPlanFor(annualPlan: number): number {
  return annualPlan * 7 / 365;
}

function shiftIsoDate(iso: string, days: number): string | null {
  if (!ISO_DATE.test(iso)) return null;
  const [year, month, day] = iso.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function positivePlan(
  value: number | null | undefined,
  mode: SpendingPlanMode,
): { annualPlan: number; mode: SpendingPlanMode } | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return null;
  return { annualPlan: value, mode };
}

function componentSum(payload: ProfilePayload): number | null {
  const parts = payload.spending_components;
  if (!parts) return null;
  return parts.fixed_annual + parts.variable_annual + parts.irregular_annual;
}

function stamp(profile: PlanningProfile): string {
  return typeof profile.updated_at === 'string' ? profile.updated_at : '';
}

function laterProfile(candidate: PlanningProfile, current: PlanningProfile): boolean {
  const candidateStamp = stamp(candidate);
  const currentStamp = stamp(current);
  if (candidateStamp !== currentStamp) return candidateStamp > currentStamp;
  return candidate.id > current.id;
}

function planForPayload(payload: ProfilePayload, inputs: PlanInputs): { annualPlan: number; mode: SpendingPlanMode } | null {
  const mode: string | undefined = payload.spending_mode;
  switch (mode) {
    case undefined:
    case 'manual':
      return positivePlan(payload.annual_spending, 'manual');
    case 'components':
      return positivePlan(componentSum(payload), 'components');
    case 'recurring':
      return positivePlan(inputs.recurring_annual_spending ?? inputs.implied_annual_spending, 'recurring');
    default:
      return null;
  }
}

/** Latest updated_at, then highest id. Missing mode is manual. Null, non-finite, or <= 0 is not a plan. */
export function resolveAnnualPlan(
  profiles: PlanningProfile[],
  inputs: PlanInputs,
): { annualPlan: number; mode: SpendingPlanMode } | null {
  let latest: PlanningProfile | null = null;
  for (const profile of profiles) {
    if (!latest || laterProfile(profile, latest)) latest = profile;
  }
  if (!latest?.payload) return null;
  return planForPayload(latest.payload, inputs);
}

/** Minimum YYYY-MM-DD over every record, including excluded, transfer, and payment rows. */
export function firstTransactionDate(txs: Transaction[]): string | null {
  let first: string | null = null;
  for (const tx of txs) {
    const date = tx?.date;
    if (typeof date !== 'string' || !ISO_DATE.test(date)) continue;
    if (first == null || date < first) first = date;
  }
  return first;
}

function keptForSpend(spend: number, weeklyPlan: number): boolean {
  const spendCents = fromDollars(spend);
  const planCents = fromDollars(weeklyPlan);
  if (spendCents == null || planCents == null) return false;
  return spendCents <= planCents;
}

/** One row per weekStart, oldest to newest as given. Empty txs leave every week unknown. */
export function budgetKeptWeeks(
  txs: Transaction[],
  annualPlan: number,
  weekStarts: string[],
): BudgetKeptWeek[] {
  const weeklyPlan = weeklyPlanFor(annualPlan);
  const first = firstTransactionDate(txs);
  return weekStarts.map(weekStart => {
    const sunday = shiftIsoDate(weekStart, 6);
    if (!sunday || first == null || sunday < first) {
      return { weekStart, spend: null, weeklyPlan, kept: null };
    }
    let spend = 0;
    for (const tx of txs) {
      if (typeof tx?.date !== 'string' || tx.date < weekStart || tx.date > sunday) continue;
      spend += transactionEffects(tx).spending;
    }
    return { weekStart, spend, weeklyPlan, kept: keptForSpend(spend, weeklyPlan) };
  });
}
