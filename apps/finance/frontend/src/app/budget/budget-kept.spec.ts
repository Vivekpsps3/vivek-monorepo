import { HttpErrorResponse } from '@angular/common/http';
import { Injector } from '@angular/core';
import { Observable, of, throwError } from 'rxjs';
import { DEK_STORE } from '../crypto/dek-store';
import type { PlanningInputsPreview, PlanningProfile, ProfilePayload } from '../models/planning.model';
import { spendingModeInference } from '../planning/spending-mode';
import type { Transaction } from '../models/transaction.model';
import { loadFinanceBudgetKeptGuarded } from './budget-kept-import';
import {
  budgetKeptCryptoImports,
  budgetKeptWeeks,
  firstTransactionDate,
  loadFinanceBudgetKept,
  resolveAnnualPlan,
  type BudgetKeptResult,
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

  it('infers a missing spending mode through the shared helper', () => {
    const infer = spyOn(spendingModeInference, 'inferMissing').and.callThrough();
    const parts = { fixed_annual: 1000, variable_annual: 2000, irregular_annual: 650 };
    expect(resolveAnnualPlan([
      profile({ id: 1, updated_at: at, annual: 1, components: parts }),
    ], inputs(9, 9))).toEqual({ annualPlan: PLAN, mode: 'components' });
    expect(resolveAnnualPlan([
      profile({ id: 2, updated_at: at, annual: 1800 }),
    ], inputs(9, 9))).toEqual({ annualPlan: 1800, mode: 'manual' });
    expect(resolveAnnualPlan([
      profile({ id: 3, updated_at: at }),
    ], inputs(4800, 100))).toEqual({ annualPlan: 4800, mode: 'recurring' });
    expect(infer.calls.all().map(call => call.returnValue)).toEqual(['components', 'manual', 'recurring']);
  });

  it('treats a missing or null spending_mode as manual', () => {
    const legacy = profile({ id: 1, updated_at: at, annual: 1800 });
    expect(legacy.payload.spending_mode).toBeUndefined();
    expect(resolveAnnualPlan([legacy], inputs(9999, 9999))).toEqual({ annualPlan: 1800, mode: 'manual' });
    const explicitNull = profile({ id: 2, updated_at: at, annual: 1800 });
    explicitNull.payload.spending_mode = null as unknown as ProfilePayload['spending_mode'];
    expect(resolveAnnualPlan([explicitNull], inputs(9999, 9999))).toEqual({ annualPlan: 1800, mode: 'manual' });
  });

  it('does not resolve an unrecognized spending_mode to a plan', () => {
    const row = profile({ id: 1, updated_at: at, annual: PLAN, mode: 'manual' });
    row.payload.spending_mode = 'seasonal' as ProfilePayload['spending_mode'];
    expect(resolveAnnualPlan([row], inputs(1, 1))).toBeNull();
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

  it('returns null kept when cents conversion fails', () => {
    const tiny = budgetKeptWeeks([
      tx({ id: 1, date: '2026-10-06', amount: 1, kind: 'purchase' }),
    ], 1e-6, ['2026-10-05']);
    expect(tiny[0].spend).toBe(1);
    expect(tiny[0].kept).toBeNull();
    const amount = 999_999_999_999.99;
    const huge = budgetKeptWeeks([
      tx({ id: 1, date: '2026-10-06', amount, kind: 'purchase' }),
      tx({ id: 2, date: '2026-10-07', amount, kind: 'purchase' }),
    ], PLAN, ['2026-10-05']);
    expect(huge[0].spend).not.toBeNull();
    expect(huge[0].kept).toBeNull();
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

describe('loadFinanceBudgetKept', () => {
  const today = '2026-10-14';
  const manual = profile({ id: 1, updated_at: '2026-08-01T00:00:00.000Z', mode: 'manual', annual: PLAN });
  const planInputs = inputs(undefined, 0);

  afterEach(() => localStorage.removeItem(DEK_STORE));

  function unlock(options: {
    profiles?: PlanningProfile[];
    planInputs?: PlanInputs;
    txs?: Transaction[];
    listProfiles?: () => Observable<PlanningProfile[]>;
    getInputs?: () => Observable<PlanInputs>;
    getTransactions?: () => Promise<Transaction[]>;
    isUnlocked?: boolean;
    whenReady?: () => Promise<void>;
    lockDuringTransactions?: boolean;
  }) {
    localStorage.setItem(DEK_STORE, 'synthetic-budget-kept');
    class VaultToken {}
    class PlanningToken {}
    class StoreToken {}
    const listProfiles = jasmine.createSpy('listProfiles').and.callFake(
      options.listProfiles ?? (() => of(options.profiles ?? [])),
    );
    const getInputs = jasmine.createSpy('getInputs').and.callFake(
      options.getInputs ?? (() => of(options.planInputs ?? planInputs)),
    );
    let unlocked = options.isUnlocked ?? true;
    const getTransactions = jasmine.createSpy('getTransactions').and.callFake(() => {
      if (options.lockDuringTransactions) unlocked = false;
      const read = options.getTransactions ?? (() => Promise.resolve(options.txs ?? []));
      return read();
    });
    const vault = {
      whenReady: options.whenReady ?? (() => Promise.resolve()),
      get isUnlocked() {
        return unlocked;
      },
    };
    const modules = {
      VaultService: VaultToken,
      PlanningService: PlanningToken,
      EncryptedStoreService: StoreToken,
    } as unknown as Awaited<ReturnType<typeof budgetKeptCryptoImports.load>>;
    const load = jasmine.isSpy(budgetKeptCryptoImports.load)
      ? budgetKeptCryptoImports.load as jasmine.Spy
      : spyOn(budgetKeptCryptoImports, 'load');
    load.and.resolveTo(modules);
    const get = jasmine.createSpy('get').and.callFake((token: unknown) => {
      if (token === VaultToken) return vault;
      if (token === PlanningToken) return { listProfiles, getInputs };
      if (token === StoreToken) return { getTransactions };
      throw new Error('unexpected token');
    });
    return {
      injector: { get } as unknown as Injector,
      listProfiles,
      getInputs,
      getTransactions,
      load,
      get,
    };
  }

  function ask(
    injector: Injector,
    extra: { weeks?: number; includeCurrentWeek?: boolean; deadlineMs?: number; signal?: AbortSignal; today?: string } = {},
  ): Promise<BudgetKeptResult> {
    return loadFinanceBudgetKept(injector, extra.signal ?? new AbortController().signal, {
      today: extra.today ?? today,
      weeks: extra.weeks ?? 1,
      includeCurrentWeek: extra.includeCurrentWeek,
      deadlineMs: extra.deadlineMs ?? 1000,
    });
  }

  it('returns locked and does not import crypto or call the vault when the key is absent', async () => {
    localStorage.removeItem(DEK_STORE);
    const load = spyOn(budgetKeptCryptoImports, 'load');
    const get = jasmine.createSpy('get').and.throwError('vault should not be read');
    const result = await ask({ get } as unknown as Injector);
    expect(result).toEqual({ status: 'locked' });
    expect(load).not.toHaveBeenCalled();
    expect(get).not.toHaveBeenCalled();
  });

  it('returns cancelled without importing crypto when the signal is already aborted', async () => {
    localStorage.removeItem(DEK_STORE);
    const load = spyOn(budgetKeptCryptoImports, 'load');
    const ctrl = new AbortController();
    ctrl.abort();
    const unread = { get: () => { throw new Error('unread'); } } as unknown as Injector;
    expect(await ask(unread, { signal: ctrl.signal })).toEqual({ status: 'cancelled' });
    localStorage.setItem(DEK_STORE, 'synthetic-budget-kept');
    expect(await ask(unread, { signal: ctrl.signal })).toEqual({ status: 'cancelled' });
    expect(load).not.toHaveBeenCalled();
  });

  it('returns no_plan when there is no profile and no transactions', async () => {
    const { injector, getTransactions } = unlock({ profiles: [], txs: [] });
    expect(await ask(injector)).toEqual({ status: 'no_plan' });
    expect(getTransactions).toHaveBeenCalled();
  });

  it('returns no_plan for a plan of 0 or null even when transactions exist', async () => {
    const purchase = [tx({ id: 1, date: '2026-09-01', amount: 10, kind: 'purchase' })];
    const zero = unlock({ profiles: [profile({ id: 1, updated_at: '2026-08-01T00:00:00.000Z', mode: 'manual', annual: 0 })], txs: purchase });
    expect(await ask(zero.injector)).toEqual({ status: 'no_plan' });
    const missing = unlock({ profiles: [profile({ id: 2, updated_at: '2026-08-01T00:00:00.000Z', mode: 'manual', annual: null })], txs: purchase });
    expect(await ask(missing.injector)).toEqual({ status: 'no_plan' });
  });

  it('returns no_data when a plan exists and the vault has zero transactions', async () => {
    const { injector } = unlock({ profiles: [manual], txs: [] });
    expect(await ask(injector)).toEqual({ status: 'no_data' });
  });

  it('ranks locked above no_plan above no_data above ready', async () => {
    localStorage.removeItem(DEK_STORE);
    const load = spyOn(budgetKeptCryptoImports, 'load');
    const get = jasmine.createSpy('get');
    expect(await ask({ get } as unknown as Injector)).toEqual({ status: 'locked' });
    expect(load).not.toHaveBeenCalled();
    expect(get).not.toHaveBeenCalled();

    const purchase = [tx({ id: 1, date: '2026-09-01', amount: 4, kind: 'purchase' })];
    expect(await ask(unlock({ profiles: [], txs: [] }).injector)).toEqual({ status: 'no_plan' });
    expect(await ask(unlock({ profiles: [manual], txs: [] }).injector)).toEqual({ status: 'no_data' });
    const ready = await ask(unlock({ profiles: [manual], txs: purchase }).injector, { weeks: 1 });
    expect(ready.status).toBe('ready');
    if (ready.status !== 'ready') return;
    expect(ready.mode).toBe('manual');
    expect(ready.weeks[0].weekStart).toBe('2026-10-05');
  });

  it('counts completed ISO weeks ending with the week before today', async () => {
    const { injector } = unlock({
      profiles: [manual],
      txs: [tx({ id: 1, date: '2026-01-05', amount: 1, kind: 'purchase' })],
    });
    const october = await ask(injector, { today: '2026-10-14', weeks: 3 });
    const sunday = await ask(injector, { today: '2027-01-03', weeks: 1 });
    const nextYear = await ask(injector, { today: '2027-01-04', weeks: 1 });
    expect(october.status).toBe('ready');
    expect(sunday.status).toBe('ready');
    expect(nextYear.status).toBe('ready');
    if (october.status !== 'ready' || sunday.status !== 'ready' || nextYear.status !== 'ready') return;
    expect(october.weeks.map(row => row.weekStart)).toEqual(['2026-09-21', '2026-09-28', '2026-10-05']);
    expect(sunday.weeks.map(row => row.weekStart)).toEqual(['2026-12-21']);
    expect(nextYear.weeks.map(row => row.weekStart)).toEqual(['2026-12-28']);
    expect(isoWeekOfMonday('2026-12-28')).toBe(53);
    expect(october.weeklyPlan).toBe(WEEKLY);
    expect(Object.keys(october).sort()).toEqual(['annualPlan', 'mode', 'status', 'weeklyPlan', 'weeks']);
    expect(Object.keys(october.weeks[0]).sort()).toEqual(['kept', 'spend', 'weekStart', 'weeklyPlan']);
  });

  it('appends the in-progress week when includeCurrentWeek is set', async () => {
    const purchase = tx({ id: 1, date: '2026-10-14', amount: 12, kind: 'purchase' });
    const older = tx({ id: 2, date: '2026-09-01', amount: 1, kind: 'purchase' });
    const { injector } = unlock({ profiles: [manual], txs: [older, purchase] });
    const closed = await ask(injector, { weeks: 1 });
    const open = await ask(injector, { weeks: 1, includeCurrentWeek: true });
    expect(closed.status).toBe('ready');
    expect(open.status).toBe('ready');
    if (closed.status !== 'ready' || open.status !== 'ready') return;
    expect(closed.weeks).toEqual([week('2026-10-05', 0, true)]);
    expect(open.weeks).toEqual([
      week('2026-10-05', 0, true),
      week('2026-10-12', 12, true),
    ]);
  });

  it('returns ready with unknown completed weeks when the first transaction is in the current week', async () => {
    const { injector } = unlock({
      profiles: [manual],
      txs: [tx({ id: 1, date: '2026-10-14', amount: 12, kind: 'purchase' })],
    });
    const result = await ask(injector, { weeks: 1 });
    expect(result).toEqual({
      status: 'ready',
      annualPlan: PLAN,
      weeklyPlan: WEEKLY,
      mode: 'manual',
      weeks: [week('2026-10-05', null, null)],
    });
  });

  it('returns unavailable when the read passes the deadline', async () => {
    const { injector } = unlock({
      profiles: [manual],
      getTransactions: () => new Promise(() => undefined),
    });
    expect(await ask(injector, { deadlineMs: 30 })).toEqual({ status: 'unavailable' });
  });

  it('returns cancelled when the signal aborts during the read', async () => {
    let markStarted!: () => void;
    const started = new Promise<void>(resolve => { markStarted = resolve; });
    const { injector } = unlock({
      profiles: [manual],
      getTransactions: () => {
        markStarted();
        return new Promise(() => undefined);
      },
    });
    const ctrl = new AbortController();
    const pending = ask(injector, { signal: ctrl.signal, deadlineMs: 5000 });
    await started;
    ctrl.abort();
    expect(await pending).toEqual({ status: 'cancelled' });
  });

  it('returns expired when the vault read is a 401', async () => {
    const { injector } = unlock({
      profiles: [manual],
      getTransactions: () => Promise.reject(new HttpErrorResponse({ status: 401 })),
    });
    expect(await ask(injector)).toEqual({ status: 'expired' });
  });

  it('returns unavailable for 403, 404, and 429, and for a plain 401 object', async () => {
    for (const status of [403, 404, 429]) {
      const { injector } = unlock({
        getTransactions: () => Promise.reject(new HttpErrorResponse({ status })),
      });
      expect(await ask(injector)).toEqual({ status: 'unavailable' });
    }
    const plain = unlock({
      getTransactions: () => Promise.reject({ status: 401 }),
    });
    expect(await ask(plain.injector)).toEqual({ status: 'unavailable' });
  });

  it('returns locked when the vault locks during the read and the plan is valid', async () => {
    const { injector, getTransactions } = unlock({
      profiles: [manual],
      txs: [tx({ id: 1, date: '2026-09-01', amount: 10, kind: 'purchase' })],
      lockDuringTransactions: true,
    });
    expect(await ask(injector)).toEqual({ status: 'locked' });
    expect(getTransactions).toHaveBeenCalled();
  });

  it('returns unavailable when the vault read fails', async () => {
    const failed = unlock({
      listProfiles: () => throwError(() => new HttpErrorResponse({ status: 503 })),
    });
    expect(await ask(failed.injector)).toEqual({ status: 'unavailable' });
    const boot = unlock({ whenReady: () => Promise.reject(new Error('boot')) });
    expect(await ask(boot.injector)).toEqual({ status: 'unavailable' });
    expect(boot.listProfiles).not.toHaveBeenCalled();
  });

  it('returns locked without reading profiles when the saved key does not unlock', async () => {
    const { injector, listProfiles, getTransactions, load } = unlock({
      profiles: [manual],
      txs: [tx({ id: 1, date: '2026-09-01', amount: 5, kind: 'purchase' })],
      isUnlocked: false,
    });
    expect(await ask(injector)).toEqual({ status: 'locked' });
    expect(load).toHaveBeenCalled();
    expect(listProfiles).not.toHaveBeenCalled();
    expect(getTransactions).not.toHaveBeenCalled();
  });

  it('returns unavailable for an unrecognized spending_mode and ranks that below locked', async () => {
    localStorage.removeItem(DEK_STORE);
    const load = spyOn(budgetKeptCryptoImports, 'load');
    const get = jasmine.createSpy('get');
    expect(await ask({ get } as unknown as Injector)).toEqual({ status: 'locked' });
    expect(load).not.toHaveBeenCalled();
    expect(get).not.toHaveBeenCalled();

    const newer = profile({ id: 2, updated_at: '2026-08-01T00:00:00.000Z', annual: PLAN, mode: 'manual' });
    newer.payload.spending_mode = 'seasonal' as ProfilePayload['spending_mode'];
    const older = profile({ id: 1, updated_at: '2026-01-01T00:00:00.000Z', mode: 'manual', annual: PLAN });
    const purchase = [tx({ id: 1, date: '2026-09-01', amount: 10, kind: 'purchase' })];
    expect(await ask(unlock({ profiles: [older, newer], txs: [] }).injector)).toEqual({ status: 'unavailable' });
    expect(await ask(unlock({ profiles: [older, newer], txs: purchase }).injector)).toEqual({ status: 'unavailable' });
  });

  it('throws RangeError synchronously when today or weeks is outside the allowed window', () => {
    const load = spyOn(budgetKeptCryptoImports, 'load');
    const injector = { get: () => { throw new Error('unread'); } } as unknown as Injector;
    expect(() => ask(injector, { weeks: 0 })).toThrowError(RangeError, /weeks/);
    expect(() => ask(injector, { weeks: -1 })).toThrowError(RangeError, /weeks/);
    expect(() => ask(injector, { weeks: 1.5 })).toThrowError(RangeError, /weeks/);
    expect(() => ask(injector, { weeks: 521 })).toThrowError(RangeError, /weeks/);
    expect(() => ask(injector, { today: '2026-02-31' })).toThrowError(RangeError, /today/);
    expect(() => ask(injector, { today: 'not-a-date' })).toThrowError(RangeError, /today/);
    expect(load).not.toHaveBeenCalled();
  });

  it('throws RangeError when today is not a YYYY-MM-DD string', () => {
    const load = spyOn(budgetKeptCryptoImports, 'load');
    const injector = { get: () => { throw new Error('unread'); } } as unknown as Injector;
    for (const today of ['2026-10-1', '2026-1-14', '2026-10-14 ', ' 2026-10-14']) {
      expect(() => ask(injector, { today })).toThrowError(RangeError, /today/);
    }
    expect(load).not.toHaveBeenCalled();
  });

  it('throws RangeError synchronously when deadlineMs is NaN, infinite, or not positive', () => {
    const load = spyOn(budgetKeptCryptoImports, 'load');
    const injector = { get: () => { throw new Error('unread'); } } as unknown as Injector;
    for (const deadlineMs of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, 0, -1]) {
      expect(() => ask(injector, { deadlineMs })).toThrowError(RangeError, /deadlineMs/);
    }
    expect(load).not.toHaveBeenCalled();
  });

  it('returns unavailable when listProfiles or getTransactions throws RangeError', async () => {
    const profiles = unlock({
      listProfiles: () => throwError(() => new RangeError('profiles')),
    });
    expect(await ask(profiles.injector)).toEqual({ status: 'unavailable' });
    const transactions = unlock({
      profiles: [manual],
      getTransactions: () => Promise.reject(new RangeError('transactions')),
    });
    expect(await ask(transactions.injector)).toEqual({ status: 'unavailable' });
  });

  it('accepts the upper bound of 520 completed weeks', async () => {
    const { injector } = unlock({
      profiles: [manual],
      txs: [tx({ id: 1, date: '2026-01-05', amount: 1, kind: 'purchase' })],
    });
    const result = await ask(injector, { weeks: 520 });
    expect(result.status).toBe('ready');
    if (result.status !== 'ready') return;
    expect(result.weeks.length).toBe(520);
    expect(result.weeks[result.weeks.length - 1].weekStart).toBe('2026-10-05');
  });

  it('returns expired instead of no_plan when the vault read is a 401', async () => {
    const { injector } = unlock({
      profiles: [],
      txs: [],
      getTransactions: () => Promise.reject(new HttpErrorResponse({ status: 401 })),
    });
    expect(await ask(injector)).toEqual({ status: 'expired' });
  });

  it('returns cancelled when the signal aborts during vault initialization', async () => {
    let markStarted!: () => void;
    const started = new Promise<void>(resolve => { markStarted = resolve; });
    const { injector } = unlock({
      profiles: [manual],
      whenReady: () => {
        markStarted();
        return new Promise(() => undefined);
      },
    });
    const ctrl = new AbortController();
    const pending = ask(injector, { signal: ctrl.signal, deadlineMs: 5000 });
    await started;
    ctrl.abort();
    expect(await pending).toEqual({ status: 'cancelled' });
  });

  it('returns unavailable when vault initialization passes the deadline', async () => {
    const { injector } = unlock({
      profiles: [manual],
      whenReady: () => new Promise(() => undefined),
    });
    expect(await ask(injector, { deadlineMs: 30 })).toEqual({ status: 'unavailable' });
  });

  it('loads the vault, planning, and encrypted store through the lazy import', async () => {
    const deps = await budgetKeptCryptoImports.load();
    expect(deps.VaultService.name).toBe('VaultService');
    expect(deps.PlanningService.name).toBe('PlanningService');
    expect(deps.EncryptedStoreService.name).toBe('EncryptedStoreService');
  });

  it('returns unavailable when the vault locks during the read and the spending mode is unrecognized', async () => {
    const newer = profile({ id: 2, updated_at: '2026-08-01T00:00:00.000Z', annual: PLAN, mode: 'manual' });
    newer.payload.spending_mode = 'seasonal' as ProfilePayload['spending_mode'];
    const { injector, getTransactions } = unlock({
      profiles: [newer],
      txs: [tx({ id: 1, date: '2026-09-01', amount: 10, kind: 'purchase' })],
      lockDuringTransactions: true,
    });
    expect(await ask(injector)).toEqual({ status: 'unavailable' });
    expect(getTransactions).toHaveBeenCalled();
  });
});

describe('loadFinanceBudgetKeptGuarded', () => {
  const opts = { today: '2026-10-14', weeks: 1, deadlineMs: 1000 };
  const injector = { get: () => { throw new Error('unread'); } } as unknown as Injector;

  function hangingImport(): Promise<never> {
    return new Promise(() => undefined);
  }

  it('returns cancelled and does not import when the signal is already aborted', async () => {
    const load = jasmine.createSpy('load').and.returnValue(hangingImport());
    const ctrl = new AbortController();
    ctrl.abort();
    expect(await loadFinanceBudgetKeptGuarded(injector, ctrl.signal, opts, load)).toEqual({ status: 'cancelled' });
    expect(load).not.toHaveBeenCalled();
  });

  it('returns cancelled when the signal aborts during the import', async () => {
    let markStarted!: () => void;
    const started = new Promise<void>(resolve => { markStarted = resolve; });
    const load = jasmine.createSpy('load').and.callFake(() => {
      markStarted();
      return hangingImport();
    });
    const ctrl = new AbortController();
    const pending = loadFinanceBudgetKeptGuarded(injector, ctrl.signal, { ...opts, deadlineMs: 5000 }, load);
    await started;
    ctrl.abort();
    expect(await pending).toEqual({ status: 'cancelled' });
  });

  it('returns unavailable when the import passes the deadline', async () => {
    const load = jasmine.createSpy('load').and.returnValue(hangingImport());
    expect(await loadFinanceBudgetKeptGuarded(injector, new AbortController().signal, { ...opts, deadlineMs: 30 }, load))
      .toEqual({ status: 'unavailable' });
  });

  it('returns unavailable within one deadline when the import uses most of the budget and the read exceeds the rest', async () => {
    const deadlineMs = 400;
    const importMs = 250;
    let seen: number | undefined;
    const started = performance.now();
    const load = () => new Promise<{ loadFinanceBudgetKept: (injector: Injector, signal: AbortSignal, callOpts: { deadlineMs?: number }) => Promise<BudgetKeptResult> }>(resolve => {
      setTimeout(() => resolve({
        loadFinanceBudgetKept: (_injector, _signal, callOpts) => new Promise(settle => {
          seen = callOpts.deadlineMs;
          setTimeout(() => settle({ status: 'unavailable' }), callOpts.deadlineMs);
        }),
      }), importMs);
    });
    expect(await loadFinanceBudgetKeptGuarded(injector, new AbortController().signal, { ...opts, deadlineMs }, load))
      .toEqual({ status: 'unavailable' });
    const elapsed = performance.now() - started;
    expect(seen).toBeGreaterThan(0);
    expect(seen).toBeLessThan(deadlineMs);
    expect(elapsed).toBeGreaterThan(importMs);
    expect(elapsed).toBeLessThan(deadlineMs + 150);
  });

  it('throws RangeError synchronously for a bad today, weeks, or deadline and does not import', () => {
    const load = jasmine.createSpy('load').and.returnValue(new Promise(() => undefined));
    const signal = new AbortController().signal;
    expect(() => loadFinanceBudgetKeptGuarded(injector, signal, { ...opts, today: 'not-a-date' }, load))
      .toThrowError(RangeError);
    expect(() => loadFinanceBudgetKeptGuarded(injector, signal, { ...opts, today: '2026-02-31' }, load))
      .toThrowError(RangeError);
    expect(() => loadFinanceBudgetKeptGuarded(injector, signal, { ...opts, today: '2026-10-1' }, load))
      .toThrowError(RangeError);
    expect(() => loadFinanceBudgetKeptGuarded(injector, signal, { ...opts, weeks: 0 }, load))
      .toThrowError(RangeError);
    expect(() => loadFinanceBudgetKeptGuarded(injector, signal, { ...opts, weeks: 1.5 }, load))
      .toThrowError(RangeError);
    expect(() => loadFinanceBudgetKeptGuarded(injector, signal, { ...opts, weeks: 521 }, load))
      .toThrowError(RangeError);
    for (const deadlineMs of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, 0, -1]) {
      expect(() => loadFinanceBudgetKeptGuarded(injector, signal, { ...opts, deadlineMs }, load))
        .toThrowError(RangeError);
    }
    expect(load).not.toHaveBeenCalled();
  });

  it('returns unavailable without calling the module when the import uses the whole deadline', async () => {
    const read = jasmine.createSpy('loadFinanceBudgetKept').and.resolveTo({ status: 'ready' });
    const load = () => Promise.resolve({ loadFinanceBudgetKept: read });
    let ticks = 0;
    spyOn(performance, 'now').and.callFake(() => {
      ticks += 1;
      return ticks * 1_000;
    });
    expect(await loadFinanceBudgetKeptGuarded(injector, new AbortController().signal, { ...opts, deadlineMs: 50 }, load))
      .toEqual({ status: 'unavailable' });
    expect(read).not.toHaveBeenCalled();
  });

  it('returns unavailable when the import fails', async () => {
    const load = jasmine.createSpy('load').and.rejectWith(new Error('chunk failed'));
    expect(await loadFinanceBudgetKeptGuarded(injector, new AbortController().signal, opts, load))
      .toEqual({ status: 'unavailable' });
  });

  it('returns unavailable when the import throws RangeError', async () => {
    const load = jasmine.createSpy('load').and.rejectWith(new RangeError('chunk'));
    expect(await loadFinanceBudgetKeptGuarded(injector, new AbortController().signal, opts, load))
      .toEqual({ status: 'unavailable' });
  });

  it('propagates RangeError from the loaded module', async () => {
    const load = jasmine.createSpy('load').and.resolveTo({
      loadFinanceBudgetKept: () => { throw new RangeError('weeks must be an integer from 1 to 520'); },
    });
    await expectAsync(loadFinanceBudgetKeptGuarded(injector, new AbortController().signal, opts, load))
      .toBeRejectedWithError(RangeError, /weeks/);
  });

  it('returns the loaded module result when the import succeeds', async () => {
    const load = jasmine.createSpy('load').and.resolveTo({
      loadFinanceBudgetKept: () => Promise.resolve({ status: 'no_plan' }),
    });
    expect(await loadFinanceBudgetKeptGuarded(injector, new AbortController().signal, opts, load))
      .toEqual({ status: 'no_plan' });
    expect(load).toHaveBeenCalled();
  });
});
