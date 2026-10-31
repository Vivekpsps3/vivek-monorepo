import { HttpErrorResponse } from '@angular/common/http';
import { Injector } from '@angular/core';
import { Observable, combineLatest, defer, firstValueFrom, from, takeUntil, timeout } from 'rxjs';
import { fromDollars } from '@vivek/browser';
import { transactionEffects } from '../crypto/client-finance';
import { financeVaultPresent } from '../crypto/dek-store';
import type { PlanningInputsPreview, PlanningProfile, ProfilePayload } from '../models/planning.model';
import { spendingModeInference } from '../planning/spending-mode';
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

/** Matches HUB_SUMMARY_DEADLINE_MS in apps/web/src/app/hub/hub-load.ts. Finance cannot import that module. */
const BUDGET_KEPT_DEFAULT_DEADLINE_MS = 8_000;

function requireDeadlineMs(deadlineMs: number | undefined, fallback: number): number {
  const value = deadlineMs ?? fallback;
  if (!Number.isFinite(value) || value <= 0) {
    throw new RangeError('deadlineMs must be a finite number greater than 0');
  }
  return value;
}

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

/** Monday of the ISO week that contains this calendar date. UTC so the host zone cannot move it. */
function isoMonday(iso: string): string | null {
  if (!ISO_DATE.test(iso)) return null;
  const [year, month, day] = iso.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7));
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

type PlanDecision =
  | { status: 'plan'; annualPlan: number; mode: SpendingPlanMode }
  | { status: 'no_plan' }
  | { status: 'unavailable' };

/** Missing or null mode is inferred. Any other string is unrecognized and is not guessed. */
function spendingModeOf(payload: ProfilePayload): SpendingPlanMode | 'unrecognized' {
  const mode = payload.spending_mode as unknown;
  if (mode == null) return spendingModeInference.inferMissing(payload);
  if (mode === 'manual' || mode === 'components' || mode === 'recurring') return mode;
  return 'unrecognized';
}

function amountForMode(payload: ProfilePayload, mode: SpendingPlanMode, inputs: PlanInputs): number | null | undefined {
  switch (mode) {
    case 'manual':
      return payload.annual_spending;
    case 'components':
      return componentSum(payload);
    case 'recurring':
      return inputs.recurring_annual_spending ?? inputs.implied_annual_spending;
  }
}

function decidePayload(payload: ProfilePayload, inputs: PlanInputs): PlanDecision {
  const mode = spendingModeOf(payload);
  if (mode === 'unrecognized') return { status: 'unavailable' };
  const plan = positivePlan(amountForMode(payload, mode, inputs), mode);
  if (!plan) return { status: 'no_plan' };
  return { status: 'plan', annualPlan: plan.annualPlan, mode: plan.mode };
}

function latestProfile(profiles: PlanningProfile[]): PlanningProfile | null {
  let latest: PlanningProfile | null = null;
  for (const profile of profiles) {
    if (!latest || laterProfile(profile, latest)) latest = profile;
  }
  return latest;
}

function decideLatestPlan(profiles: PlanningProfile[], inputs: PlanInputs): PlanDecision {
  const latest = latestProfile(profiles);
  if (!latest?.payload) return { status: 'no_plan' };
  return decidePayload(latest.payload, inputs);
}

/** Latest updated_at, then highest id. A missing mode is inferred. A non-positive number is null. */
export function resolveAnnualPlan(
  profiles: PlanningProfile[],
  inputs: PlanInputs,
): { annualPlan: number; mode: SpendingPlanMode } | null {
  const decision = decideLatestPlan(profiles, inputs);
  if (decision.status !== 'plan') return null;
  return { annualPlan: decision.annualPlan, mode: decision.mode };
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

function keptForSpend(spend: number, weeklyPlan: number): boolean | null {
  const spendCents = fromDollars(spend);
  const planCents = fromDollars(weeklyPlan);
  if (spendCents == null || planCents == null) return null;
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

/**
 * Vault, planning, and the encrypted store. Called only after financeVaultPresent()
 * is true, so a locked caller never imports vault crypto. Specs spy on this object.
 */
export const budgetKeptCryptoImports = {
  async load() {
    const [vault, planning, store] = await Promise.all([
      import('../crypto/vault.service'),
      import('../services/planning.service'),
      import('../crypto/encrypted-store.service'),
    ]);
    return {
      VaultService: vault.VaultService,
      PlanningService: planning.PlanningService,
      EncryptedStoreService: store.EncryptedStoreService,
    };
  },
};

interface BudgetKeptVault {
  whenReady(): Promise<void>;
  readonly isUnlocked: boolean;
}

interface BudgetKeptPlanning {
  listProfiles(): Observable<PlanningProfile[]>;
  getInputs(): Observable<PlanInputs>;
}

interface BudgetKeptStore {
  getTransactions(): Promise<Transaction[]>;
}

function abort$(signal: AbortSignal): Observable<void> {
  return new Observable(subscriber => {
    if (signal.aborted) {
      subscriber.next();
      subscriber.complete();
      return;
    }
    const onAbort = () => {
      subscriber.next();
      subscriber.complete();
    };
    signal.addEventListener('abort', onAbort, { once: true });
    return () => signal.removeEventListener('abort', onAbort);
  });
}

function mapLoadError(signal: AbortSignal, err: unknown): BudgetKeptResult {
  if (signal.aborted) return { status: 'cancelled' };
  if (err instanceof HttpErrorResponse && err.status === 401) return { status: 'expired' };
  return { status: 'unavailable' };
}

function injectService<T>(injector: Injector, token: object): T {
  return injector.get(token as never);
}

const BUDGET_KEPT_MIN_WEEKS = 1;
const BUDGET_KEPT_MAX_WEEKS = 520;

/** Caller bugs. `today` is a real YYYY-MM-DD. `weeks` is an integer from 1 to 520. */
function completedWeekStarts(today: string, weeks: number, includeCurrentWeek: boolean): string[] {
  if (!Number.isInteger(weeks) || weeks < BUDGET_KEPT_MIN_WEEKS || weeks > BUDGET_KEPT_MAX_WEEKS) {
    throw new RangeError(`weeks must be an integer from ${BUDGET_KEPT_MIN_WEEKS} to ${BUDGET_KEPT_MAX_WEEKS}`);
  }
  const current = isoMonday(today);
  if (!current) throw new RangeError('today must be a valid YYYY-MM-DD');
  const starts: string[] = [];
  for (let ago = weeks; ago >= 1; ago -= 1) {
    const start = shiftIsoDate(current, -7 * ago);
    if (!start) throw new RangeError('today must be a valid YYYY-MM-DD');
    starts.push(start);
  }
  if (includeCurrentWeek) starts.push(current);
  return starts;
}

function assembleBudgetKept(
  profiles: PlanningProfile[],
  inputs: PlanInputs,
  txs: Transaction[],
  weekStarts: string[],
): BudgetKeptResult {
  const decision = decideLatestPlan(profiles, inputs);
  if (decision.status !== 'plan') return { status: decision.status };
  if (txs.length === 0) return { status: 'no_data' };
  return {
    status: 'ready',
    annualPlan: decision.annualPlan,
    weeklyPlan: weeklyPlanFor(decision.annualPlan),
    mode: decision.mode,
    weeks: budgetKeptWeeks(txs, decision.annualPlan, weekStarts),
  };
}

async function openBudgetKeptVault(
  injector: Injector,
  signal: AbortSignal,
): Promise<BudgetKeptResult | { status: 'open'; vault: BudgetKeptVault; planning: BudgetKeptPlanning; store: BudgetKeptStore }> {
  try {
    const deps = await budgetKeptCryptoImports.load();
    if (signal.aborted) return { status: 'cancelled' };
    const vault = injectService<BudgetKeptVault>(injector, deps.VaultService);
    const planning = injectService<BudgetKeptPlanning>(injector, deps.PlanningService);
    const store = injectService<BudgetKeptStore>(injector, deps.EncryptedStoreService);
    await vault.whenReady();
    if (signal.aborted) return { status: 'cancelled' };
    if (!vault.isUnlocked) return { status: 'locked' };
    return { status: 'open', vault, planning, store };
  } catch (err) {
    return mapLoadError(signal, err);
  }
}

async function readBudgetKept(
  injector: Injector,
  signal: AbortSignal,
  weekStarts: string[],
): Promise<BudgetKeptResult> {
  const opened = await openBudgetKeptVault(injector, signal);
  if (opened.status !== 'open') return opened;
  const [profiles, inputs, txs] = await firstValueFrom(
    combineLatest([
      opened.planning.listProfiles(),
      opened.planning.getInputs(),
      defer(() => from(opened.store.getTransactions())),
    ]).pipe(takeUntil(abort$(signal))),
  );
  if (signal.aborted) return { status: 'cancelled' };
  // Unrecognized mode is unavailable, which beats a vault that locked during the read.
  if (decideLatestPlan(profiles, inputs).status === 'unavailable') return { status: 'unavailable' };
  if (!opened.vault.isUnlocked) return { status: 'locked' };
  return assembleBudgetKept(profiles, inputs, txs, weekStarts);
}

async function loadBudgetKeptBody(
  injector: Injector,
  signal: AbortSignal,
  weekStarts: string[],
  deadlineMs: number,
): Promise<BudgetKeptResult> {
  try {
    if (!financeVaultPresent()) return { status: 'locked' };
    return await firstValueFrom(
      defer(() => from(readBudgetKept(injector, signal, weekStarts))).pipe(
        takeUntil(abort$(signal)),
        timeout(deadlineMs),
      ),
    );
  } catch (err) {
    return mapLoadError(signal, err);
  }
}

/** Lazy, like loadFinanceHubSnapshot. Locked before any vault or network read. */
export function loadFinanceBudgetKept(
  injector: Injector,
  signal: AbortSignal,
  opts: {
    today: string;
    weeks: number;
    includeCurrentWeek?: boolean;
    deadlineMs?: number;
  },
): Promise<BudgetKeptResult> {
  if (signal.aborted) return Promise.resolve({ status: 'cancelled' });
  const weekStarts = completedWeekStarts(opts.today, opts.weeks, opts.includeCurrentWeek === true);
  const deadlineMs = requireDeadlineMs(opts.deadlineMs, BUDGET_KEPT_DEFAULT_DEADLINE_MS);
  return loadBudgetKeptBody(injector, signal, weekStarts, deadlineMs);
}
