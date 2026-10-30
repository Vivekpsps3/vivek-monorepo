import type { Injector } from '@angular/core';
import type { BudgetKeptResult } from './budget-kept';

/**
 * Matches HUB_SUMMARY_DEADLINE_MS in apps/web/src/app/hub/hub-load.ts.
 * Finance cannot import that module. Same default as loadFinanceBudgetKept.
 */
const BUDGET_KEPT_IMPORT_DEADLINE_MS = 8_000;

interface BudgetKeptModule {
  loadFinanceBudgetKept(
    injector: Injector,
    signal: AbortSignal,
    opts: {
      today: string;
      weeks: number;
      includeCurrentWeek?: boolean;
      deadlineMs?: number;
    },
  ): Promise<BudgetKeptResult>;
}

/** The chunk missed the shared deadline. The caller maps this to unavailable. */
class BudgetKeptImportDeadlineError extends Error {
  constructor() {
    super('budget-kept import missed its deadline');
    this.name = 'BudgetKeptImportDeadlineError';
  }
}

function defaultLoad(): Promise<BudgetKeptModule> {
  return import('./budget-kept');
}

function withSignalAndDeadline<T>(work: Promise<T>, signal: AbortSignal, deadlineMs: number): Promise<T> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (settle: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal.removeEventListener('abort', onAbort);
      settle();
    };
    const onAbort = () => finish(() => reject(new Error('aborted')));
    const timer = setTimeout(() => finish(() => reject(new BudgetKeptImportDeadlineError())), deadlineMs);
    if (signal.aborted) {
      finish(() => reject(new Error('aborted')));
      return;
    }
    signal.addEventListener('abort', onAbort, { once: true });
    work.then(
      (value) => finish(() => resolve(value)),
      (err) => finish(() => reject(err)),
    );
  });
}

/**
 * Loads the budget-kept chunk and runs it under one deadline.
 * Abort is cancelled. A missed deadline, a rejected import, or a budget
 * used up by the import is unavailable. RangeError still propagates.
 * `load` is the chunk importer; tests pass a fake.
 */
export async function loadFinanceBudgetKeptGuarded(
  injector: Injector,
  signal: AbortSignal,
  opts: {
    today: string;
    weeks: number;
    includeCurrentWeek?: boolean;
    deadlineMs?: number;
  },
  load: () => Promise<BudgetKeptModule> = defaultLoad,
): Promise<BudgetKeptResult> {
  if (signal.aborted) return { status: 'cancelled' };
  const deadlineMs = opts.deadlineMs ?? BUDGET_KEPT_IMPORT_DEADLINE_MS;
  const started = performance.now();
  let loaded: BudgetKeptModule;
  try {
    loaded = await withSignalAndDeadline(load(), signal, deadlineMs);
  } catch (err) {
    if (err instanceof RangeError) throw err;
    if (signal.aborted) return { status: 'cancelled' };
    // BudgetKeptImportDeadlineError and a rejected chunk are both unavailable. expired is only a 401.
    return { status: 'unavailable' };
  }
  const remaining = deadlineMs - (performance.now() - started);
  if (remaining <= 0) return { status: 'unavailable' };
  return loaded.loadFinanceBudgetKept(injector, signal, { ...opts, deadlineMs: remaining });
}
