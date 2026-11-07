import type { Injector } from '@angular/core';
import type { BudgetKeptDaysResult, BudgetKeptResult } from './budget-kept';

/**
 * Matches HUB_SUMMARY_DEADLINE_MS in apps/web/src/app/hub/hub-load.ts.
 * Finance cannot import that module. Same default as loadFinanceBudgetKept.
 */
const BUDGET_KEPT_IMPORT_DEADLINE_MS = 8_000;
const BUDGET_KEPT_MIN_WEEKS = 1;
const BUDGET_KEPT_MAX_WEEKS = 520;
// JS $ without the m flag matches only at the end of input, not before a trailing newline.
const ISO_DATE = /^\d{4}-\d{2}-\d{2}(?![\s\S])/;

/** Same caller bugs as the core, checked here so the chunk is not loaded first. */
function requireBudgetKeptWindow(today: string, weeks: number): void {
  if (!Number.isInteger(weeks) || weeks < BUDGET_KEPT_MIN_WEEKS || weeks > BUDGET_KEPT_MAX_WEEKS) {
    throw new RangeError(`weeks must be an integer from ${BUDGET_KEPT_MIN_WEEKS} to ${BUDGET_KEPT_MAX_WEEKS}`);
  }
  if (!ISO_DATE.test(today)) throw new RangeError('today must be a valid YYYY-MM-DD');
  const [year, month, day] = today.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    throw new RangeError('today must be a valid YYYY-MM-DD');
  }
}

function requireDeadlineMs(deadlineMs: number | undefined, fallback: number): number {
  const value = deadlineMs ?? fallback;
  if (!Number.isFinite(value) || value <= 0 || value > 2 ** 31 - 1) {
    throw new RangeError('deadlineMs must be a finite number greater than 0 and at most 2147483647');
  }
  return value;
}

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

interface BudgetKeptDaysModule {
  loadFinanceBudgetKeptDays(
    injector: Injector,
    signal: AbortSignal,
    opts: {
      from: string;
      to: string;
      deadlineMs?: number;
    },
  ): Promise<BudgetKeptDaysResult>;
}

/** The chunk missed the shared deadline. The caller maps this to unavailable. */
class BudgetKeptImportDeadlineError extends Error {
  constructor() {
    super('budget-kept import missed its deadline');
    this.name = 'BudgetKeptImportDeadlineError';
  }
}

function defaultLoad(): Promise<BudgetKeptModule & BudgetKeptDaysModule> {
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

async function runBudgetKeptImport(
  injector: Injector,
  signal: AbortSignal,
  opts: {
    today: string;
    weeks: number;
    includeCurrentWeek?: boolean;
  },
  deadlineMs: number,
  load: () => Promise<BudgetKeptModule>,
): Promise<BudgetKeptResult> {
  const started = performance.now();
  let loaded: BudgetKeptModule;
  try {
    loaded = await withSignalAndDeadline(load(), signal, deadlineMs);
  } catch {
    if (signal.aborted) return { status: 'cancelled' };
    // A rejected chunk, including RangeError, is unavailable. expired is only a 401.
    return { status: 'unavailable' };
  }
  const remaining = deadlineMs - (performance.now() - started);
  if (remaining <= 0) return { status: 'unavailable' };
  return loaded.loadFinanceBudgetKept(injector, signal, { ...opts, deadlineMs: remaining });
}

/**
 * Loads the budget-kept chunk and runs it under one deadline.
 * Abort is cancelled. A missed deadline, a rejected import (including
 * RangeError), or a budget used up by the import is unavailable.
 * A bad today, weeks, or deadline throws before the import. RangeError from the loaded module still propagates.
 * `load` is the chunk importer; tests pass a fake.
 */
export function loadFinanceBudgetKeptGuarded(
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
  if (signal.aborted) return Promise.resolve({ status: 'cancelled' });
  requireBudgetKeptWindow(opts.today, opts.weeks);
  const deadlineMs = requireDeadlineMs(opts.deadlineMs, BUDGET_KEPT_IMPORT_DEADLINE_MS);
  return runBudgetKeptImport(injector, signal, opts, deadlineMs, load);
}

const BUDGET_KEPT_MAX_DAYS = 3640;

function isRealIsoDate(iso: string): boolean {
  if (!ISO_DATE.test(iso)) return false;
  const [year, month, day] = iso.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function daySpan(from: string, to: string): number {
  return (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000 + 1;
}

/** Same caller bugs as the core days facade, checked here so the chunk is not loaded first. */
function requireBudgetKeptDayRange(from: string, to: string): void {
  if (!isRealIsoDate(from) || !isRealIsoDate(to)) {
    throw new RangeError('from and to must be valid YYYY-MM-DD dates');
  }
  if (from > to) throw new RangeError('from must not be after to');
  if (daySpan(from, to) > BUDGET_KEPT_MAX_DAYS) {
    throw new RangeError(`range must span at most ${BUDGET_KEPT_MAX_DAYS} days`);
  }
}

async function runBudgetKeptDaysImport(
  injector: Injector,
  signal: AbortSignal,
  opts: {
    from: string;
    to: string;
  },
  deadlineMs: number,
  load: () => Promise<BudgetKeptDaysModule>,
): Promise<BudgetKeptDaysResult> {
  const started = performance.now();
  let loaded: BudgetKeptDaysModule;
  try {
    loaded = await withSignalAndDeadline(load(), signal, deadlineMs);
  } catch {
    if (signal.aborted) return { status: 'cancelled' };
    // A rejected chunk, including RangeError, is unavailable. expired is only a 401.
    return { status: 'unavailable' };
  }
  const remaining = deadlineMs - (performance.now() - started);
  if (remaining <= 0) return { status: 'unavailable' };
  return loaded.loadFinanceBudgetKeptDays(injector, signal, { ...opts, deadlineMs: remaining });
}

/**
 * Days companion to loadFinanceBudgetKeptGuarded, under the same rules:
 * one shared deadline, abort is cancelled, import failures are unavailable,
 * and a bad range or deadline throws before the import.
 */
export function loadFinanceBudgetKeptDaysGuarded(
  injector: Injector,
  signal: AbortSignal,
  opts: {
    from: string;
    to: string;
    deadlineMs?: number;
  },
  load: () => Promise<BudgetKeptDaysModule> = defaultLoad,
): Promise<BudgetKeptDaysResult> {
  if (signal.aborted) return Promise.resolve({ status: 'cancelled' });
  requireBudgetKeptDayRange(opts.from, opts.to);
  const deadlineMs = requireDeadlineMs(opts.deadlineMs, BUDGET_KEPT_IMPORT_DEADLINE_MS);
  return runBudgetKeptDaysImport(injector, signal, opts, deadlineMs, load);
}
