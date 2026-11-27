import { bindLockSnapshots } from '../crypto/lock-finance';

const KEY = 'finance-planning-drafts';

export interface RetirementDraft {
  withdrawalRate: number;
  extraAnnualExpenses: number;
  includeRecurringExpenses: boolean;
}

export interface SavingsDraft {
  name: string;
  targetAmount: number;
  currentSaved: number;
  years: number;
  expectedReturn: number;
}

export interface DebtDraft {
  name: string;
  balance: number;
  apr: number;
  minimumPayment: number;
  extraPayment: number;
  liabilityId: number | null;
}

export interface SimulationDraft {
  horizonYears: number;
  nPaths: number;
  seed: number;
  spendingMode: 'recurring' | 'components' | 'manual';
  annualSpending: number | null;
}

/** Same-session spending basis. Null annual spending is unset; zero is entered. */
export interface SpendingSelection {
  spendingMode: 'recurring' | 'components' | 'manual';
  annualSpending: number | null;
  componentsChosen: boolean;
  fixedAnnual: number;
  variableAnnual: number;
  irregularAnnual: number;
}

export interface ProjectionDraft {
  annualGrowthRate: number;
  withdrawalRate: number;
  inflationRate: number;
  monthlyContribution: number;
  monthlyContributionIncrease: number;
  projectionYears: number;
}

export interface ResearchDraft {
  primarySymbol: string;
  period: '1y' | '2y' | '5y' | '10y' | 'max';
  name: string;
  projectionYears: number;
  budget: number;
}

type Store = Record<string, unknown>;

function browserStorage(): Storage | null {
  try {
    return typeof sessionStorage === 'undefined' ? null : sessionStorage;
  } catch {
    return null;
  }
}

function readStore(): Store {
  const store = browserStorage();
  if (!store) return {};
  try {
    const parsed = JSON.parse(store.getItem(KEY) ?? '');
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    return parsed as Store;
  } catch {
    return {};
  }
}

function writeStore(next: Store): void {
  const store = browserStorage();
  if (!store) return;
  try {
    store.setItem(KEY, JSON.stringify(next));
  } catch {
    /* a private draft is best-effort */
  }
}

export function clearPlanningDrafts(): void {
  const store = browserStorage();
  if (!store) return;
  try {
    store.removeItem(KEY);
  } catch {
    /* already gone */
  }
}

let retained = false;

/** Drop same-session drafts on lock, including after the user leaves Planning. */
export function retainPlanningDraftsUntilLock(): void {
  if (retained) return;
  retained = true;
  bindLockSnapshots(() => {
    clearPlanningDrafts();
  });
}

function finite(value: unknown, min: number, max: number): number | null {
  if (typeof value !== 'number' && typeof value !== 'string') return null;
  if (typeof value === 'string' && value.trim() === '') return null;
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n) || n < min || n > max) return null;
  return n;
}

function flag(value: unknown): boolean | null {
  return typeof value === 'boolean' ? value : null;
}

function text(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null;
  return value.trim().slice(0, max);
}

function record(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function retirementDraft(value: unknown): RetirementDraft | null {
  const row = record(value);
  if (!row) return null;
  const withdrawalRate = finite(row['withdrawalRate'], 0, 0.5);
  const extraAnnualExpenses = finite(row['extraAnnualExpenses'], -1e8, 1e8);
  const includeRecurringExpenses = flag(row['includeRecurringExpenses']);
  if (withdrawalRate == null || extraAnnualExpenses == null || includeRecurringExpenses == null) return null;
  return { withdrawalRate, extraAnnualExpenses, includeRecurringExpenses };
}

function savingsDraft(value: unknown): SavingsDraft | null {
  const row = record(value);
  if (!row) return null;
  const name = text(row['name'], 80);
  const targetAmount = finite(row['targetAmount'], 0, 1e12);
  const currentSaved = finite(row['currentSaved'], 0, 1e12);
  const years = finite(row['years'], 0.1, 80);
  const expectedReturn = finite(row['expectedReturn'], -0.5, 0.5);
  if (name == null || targetAmount == null || currentSaved == null || years == null || expectedReturn == null) return null;
  return { name, targetAmount, currentSaved, years, expectedReturn };
}

function debtDraft(value: unknown): DebtDraft | null {
  const row = record(value);
  if (!row) return null;
  const name = text(row['name'], 80);
  const balance = finite(row['balance'], 0, 1e12);
  const apr = finite(row['apr'], 0, 1);
  const minimumPayment = finite(row['minimumPayment'], 0, 1e9);
  const extraPayment = finite(row['extraPayment'], 0, 1e9);
  const liability = row['liabilityId'];
  const liabilityId = liability == null ? null : finite(liability, 1, 1e12);
  if (
    name == null || balance == null || apr == null || minimumPayment == null || extraPayment == null
    || (liability != null && (liabilityId == null || !Number.isInteger(liabilityId)))
  ) return null;
  return { name, balance, apr, minimumPayment, extraPayment, liabilityId };
}

function spendingSelection(value: unknown): SpendingSelection | null {
  const row = record(value);
  if (!row) return null;
  const mode = row['spendingMode'];
  const spendingMode = mode === 'recurring' || mode === 'components' || mode === 'manual' ? mode : null;
  const annual = row['annualSpending'];
  const annualSpending = annual == null ? null : finite(annual, 0, 1e12);
  const fixedAnnual = finite(row['fixedAnnual'], 0, 1e12);
  const variableAnnual = finite(row['variableAnnual'], 0, 1e12);
  const irregularAnnual = finite(row['irregularAnnual'], 0, 1e12);
  if (
    spendingMode == null || fixedAnnual == null || variableAnnual == null || irregularAnnual == null
    || (annual != null && annualSpending == null)
  ) return null;
  return {
    spendingMode,
    annualSpending,
    componentsChosen: row['componentsChosen'] === true,
    fixedAnnual,
    variableAnnual,
    irregularAnnual,
  };
}

function simulationDraft(value: unknown): SimulationDraft | null {
  const row = record(value);
  if (!row) return null;
  const horizonYears = finite(row['horizonYears'], 1, 80);
  const nPaths = finite(row['nPaths'], 100, 5000);
  const seed = finite(row['seed'], 1, 2147483646);
  const mode = row['spendingMode'];
  const spendingMode = mode === 'recurring' || mode === 'components' || mode === 'manual' ? mode : null;
  const annual = row['annualSpending'];
  const annualSpending = annual == null ? null : finite(annual, 0, 1e12);
  if (
    horizonYears == null || nPaths == null || seed == null || spendingMode == null
    || (annual != null && annualSpending == null)
  ) return null;
  return { horizonYears, nPaths, seed, spendingMode, annualSpending };
}

function projectionDraft(value: unknown): ProjectionDraft | null {
  const row = record(value);
  if (!row) return null;
  const annualGrowthRate = finite(row['annualGrowthRate'], -20, 30);
  const withdrawalRate = finite(row['withdrawalRate'], 0, 12);
  const inflationRate = finite(row['inflationRate'], 0, 15);
  const monthlyContribution = finite(row['monthlyContribution'], 0, 1_000_000);
  const monthlyContributionIncrease = finite(row['monthlyContributionIncrease'], 0, 1_000_000);
  const projectionYears = finite(row['projectionYears'], 1, 60);
  if (
    annualGrowthRate == null || withdrawalRate == null || inflationRate == null
    || monthlyContribution == null || monthlyContributionIncrease == null || projectionYears == null
  ) return null;
  return {
    annualGrowthRate,
    withdrawalRate,
    inflationRate,
    monthlyContribution,
    monthlyContributionIncrease,
    projectionYears,
  };
}

function researchDraft(value: unknown): ResearchDraft | null {
  const row = record(value);
  if (!row) return null;
  const symbol = typeof row['primarySymbol'] === 'string' ? row['primarySymbol'].trim().toUpperCase() : '';
  const primarySymbol = /^[A-Z0-9.-]{1,10}$/.test(symbol) ? symbol : null;
  const period = row['period'];
  const allowed = period === '1y' || period === '2y' || period === '5y' || period === '10y' || period === 'max'
    ? period
    : null;
  const name = text(row['name'], 80);
  const projectionYears = finite(row['projectionYears'], 1, 80);
  const budget = finite(row['budget'], 0, 1e12);
  if (primarySymbol == null || allowed == null || name == null || projectionYears == null || budget == null) return null;
  return { primarySymbol, period: allowed, name, projectionYears, budget };
}

function writeSection(key: string, value: unknown): void {
  if (value == null) return;
  const store = readStore();
  store[key] = value;
  writeStore(store);
}

export function readRetirementDraft(): RetirementDraft | null {
  return retirementDraft(readStore()['retirement']);
}

export function writeRetirementDraft(value: unknown): void {
  writeSection('retirement', retirementDraft(value));
}

export function readSavingsDraft(): SavingsDraft | null {
  return savingsDraft(readStore()['savings']);
}

export function writeSavingsDraft(value: unknown): void {
  writeSection('savings', savingsDraft(value));
}

export function readDebtDraft(): DebtDraft | null {
  return debtDraft(readStore()['debt']);
}

export function writeDebtDraft(value: unknown): void {
  writeSection('debt', debtDraft(value));
}

export function readSimulationDraft(): SimulationDraft | null {
  return simulationDraft(readStore()['simulation']);
}

export function writeSimulationDraft(value: unknown): void {
  writeSection('simulation', simulationDraft(value));
}

export function readSpendingSelection(): SpendingSelection | null {
  return spendingSelection(readStore()['spending']);
}

export function writeSpendingSelection(value: unknown): void {
  writeSection('spending', spendingSelection(value));
}

export function readProjectionDraft(): ProjectionDraft | null {
  return projectionDraft(readStore()['projection']);
}

export function writeProjectionDraft(value: unknown): void {
  writeSection('projection', projectionDraft(value));
}

export function readResearchDraft(): ResearchDraft | null {
  return researchDraft(readStore()['research']);
}

export function writeResearchDraft(value: unknown): void {
  writeSection('research', researchDraft(value));
}
