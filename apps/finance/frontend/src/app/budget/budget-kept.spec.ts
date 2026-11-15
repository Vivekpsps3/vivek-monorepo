import { HttpErrorResponse } from '@angular/common/http';
import { Injector } from '@angular/core';
import { fakeAsync,flushMicrotasks,tick } from '@angular/core/testing';
import { Observable,of,throwError } from 'rxjs';
import { DEK_STORE } from '../crypto/dek-store';
import type { PlanningInputsPreview,PlanningProfile,ProfilePayload } from '../models/planning.model';
import type { Transaction } from '../models/transaction.model';
import {
budgetKeptCryptoImports,
budgetKeptDays,
budgetKeptWeeks,
loadFinanceBudgetKept,
loadFinanceBudgetKeptDays,
type BudgetKeptDay,
type BudgetKeptDaysResult,
type BudgetKeptResult,
type BudgetKeptWeek
} from './budget-kept';
import { loadFinanceBudgetKeptDaysGuarded,loadFinanceBudgetKeptGuarded } from './budget-kept-import';

/** Synthetic ledger rows only. Annual 3650 is 70 per week, an exact 365 multiple. */
const PLAN = 3650;
const WEEKLY = 70;

type PlanInputs = Pick<PlanningInputsPreview, 'recurring_annual_spending' | 'implied_annual_spending'>;

function inputs(recurring: number | undefined, implied: number): PlanInputs {
  return { recurring_annual_spending: recurring, implied_annual_spending: implied };
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

/** Annual 1200 is exactly 100 per month, so pace arithmetic stays in whole dollars at month end. */
const PLAN_DAYS = 1200;

function dayRow(date: string, spend: number | null, pace: number, kept: boolean | null): BudgetKeptDay {
  return { date, spend, pace, kept };
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

  it('keeps a day exactly at the monthly pace and not one cent over', () => {
    const atPace = budgetKeptDays([
      tx({ id: 1, date: '2026-10-05', amount: 60, kind: 'purchase' }),
      tx({ id: 2, date: '2026-10-20', amount: 40, kind: 'purchase' }),
    ], PLAN_DAYS, ['2026-10-31']);
    expect(atPace).toEqual([dayRow('2026-10-31', 100, 100, true)]);

    const over = budgetKeptDays([
      tx({ id: 1, date: '2026-10-05', amount: 60, kind: 'purchase' }),
      tx({ id: 2, date: '2026-10-20', amount: 40, kind: 'purchase' }),
      tx({ id: 3, date: '2026-10-21', amount: 0.01, kind: 'purchase' }),
    ], PLAN_DAYS, ['2026-10-31']);
    expect(over).toEqual([dayRow('2026-10-31', 100.01, 100, false)]);
  });

  it('uses 29 days for leap February and 28 for a plain February', () => {
    const leap = budgetKeptDays([
      tx({ id: 1, date: '2024-02-01', amount: 100, kind: 'purchase' }),
    ], PLAN_DAYS, ['2024-02-28', '2024-02-29']);
    expect(leap[0].pace).toBeCloseTo(100 * 28 / 29, 10);
    expect(leap[0].kept).toBeFalse();
    expect(leap[1]).toEqual(dayRow('2024-02-29', 100, 100, true));

    const plain = budgetKeptDays([
      tx({ id: 1, date: '2026-02-01', amount: 100, kind: 'purchase' }),
    ], PLAN_DAYS, ['2026-02-28']);
    expect(plain).toEqual([dayRow('2026-02-28', 100, 100, true)]);
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

  // CI3 audit pin: budget-kept receives `today` as a civil date and does its
  // week arithmetic on date-only values (UTC is the neutral carrier, so the
  // host zone cannot move a day). The 2026-11-01 fall-back in
  // America/Los_Angeles and the year boundary must not shift a week start.
  it('keeps completed week starts on civil Mondays across the fall-back and the year boundary', async () => {
    const { injector } = unlock({
      profiles: [manual],
      txs: [tx({ id: 1, date: '2026-01-05', amount: 1, kind: 'purchase' })],
    });
    const afterFallback = await ask(injector, { today: '2026-11-04', weeks: 2 });
    const newYear = await ask(injector, { today: '2027-01-06', weeks: 2 });
    expect(afterFallback.status).toBe('ready');
    expect(newYear.status).toBe('ready');
    if (afterFallback.status !== 'ready' || newYear.status !== 'ready') return;
    expect(afterFallback.weeks.map(row => row.weekStart)).toEqual(['2026-10-19', '2026-10-26']);
    expect(newYear.weeks.map(row => row.weekStart)).toEqual(['2026-12-21', '2026-12-28']);
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

  it('returns expired for a 401 from initialization even while locked', async () => {
    for (const isUnlocked of [true, false]) {
      const { injector } = unlock({
        isUnlocked, whenReady: () => Promise.reject(new HttpErrorResponse({ status: 401 })),
      });
      expect(await ask(injector)).toEqual({ status: 'expired' });
    }
  });

  it('returns expired for a 401 from either planning read', async () => {
    for (const source of ['listProfiles', 'getInputs'] as const) {
      const { injector } = unlock({
        [source]: () => throwError(() => new HttpErrorResponse({ status: 401 })),
      });
      expect(await ask(injector)).toEqual({ status: 'expired' });
    }
  });

  it('returns cancelled for a 401 after abort during initialization or a read', async () => {
    for (const source of ['whenReady', 'getTransactions'] as const) {
      const ctrl = new AbortController();
      const { injector } = unlock({
        [source]: () => {
          ctrl.abort();
          return Promise.reject(new HttpErrorResponse({ status: 401 }));
        },
      });
      expect(await ask(injector, { signal: ctrl.signal })).toEqual({ status: 'cancelled' });
    }
  });

  it('returns expired for a 401 when the vault locks during the read', async () => {
    const { injector } = unlock({
      lockDuringTransactions: true,
      getTransactions: () => Promise.reject(new HttpErrorResponse({ status: 401 })),
    });
    expect(await ask(injector)).toEqual({ status: 'expired' });
  });

  it('maps Vault locked errors from initialization and reads to locked', async () => {
    for (const source of ['whenReady', 'getTransactions'] as const) {
      const { injector } = unlock({ [source]: () => Promise.reject(new Error('Vault locked')) });
      expect(await ask(injector)).toEqual({ status: 'locked' });
    }
  });

  it('accepts the largest timer deadline', async () => {
    expect(await ask(unlock({}).injector, { deadlineMs: 2 ** 31 - 1 })).toEqual({ status: 'no_plan' });
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

  it('throws RangeError synchronously when deadlineMs is NaN, infinite, or not positive', () => {
    const load = spyOn(budgetKeptCryptoImports, 'load');
    const injector = { get: () => { throw new Error('unread'); } } as unknown as Injector;
    for (const deadlineMs of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, 0, -1, 2 ** 31, Number.MAX_VALUE]) {
      expect(() => ask(injector, { deadlineMs })).toThrowError(RangeError, /deadlineMs/);
    }
    expect(load).not.toHaveBeenCalled();
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

describe('loadFinanceBudgetKeptDays', () => {
  const manualDays = profile({ id: 1, updated_at: '2026-08-01T00:00:00.000Z', mode: 'manual', annual: PLAN_DAYS });
  const planInputs = inputs(undefined, 0);

  afterEach(() => localStorage.removeItem(DEK_STORE));

  function unlock(options: {
    profiles?: PlanningProfile[];
    planInputs?: PlanInputs;
    txs?: Transaction[];
    getTransactions?: () => Promise<Transaction[]>;
    isUnlocked?: boolean;
    whenReady?: () => Promise<void>;
  }) {
    localStorage.setItem(DEK_STORE, 'synthetic-budget-kept-days');
    class VaultToken {}
    class PlanningToken {}
    class StoreToken {}
    const listProfiles = jasmine.createSpy('listProfiles').and.callFake(() => of(options.profiles ?? []));
    const getInputs = jasmine.createSpy('getInputs').and.callFake(() => of(options.planInputs ?? planInputs));
    const getTransactions = jasmine.createSpy('getTransactions').and.callFake(
      options.getTransactions ?? (() => Promise.resolve(options.txs ?? [])),
    );
    const vault = {
      whenReady: options.whenReady ?? (() => Promise.resolve()),
      get isUnlocked() {
        return options.isUnlocked ?? true;
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
    return { injector: { get } as unknown as Injector, listProfiles, getInputs, getTransactions, load, get };
  }

  function askDays(
    injector: Injector,
    extra: { from?: string; to?: string; deadlineMs?: number; signal?: AbortSignal } = {},
  ): Promise<BudgetKeptDaysResult> {
    return loadFinanceBudgetKeptDays(injector, extra.signal ?? new AbortController().signal, {
      from: extra.from ?? '2026-10-01',
      to: extra.to ?? '2026-10-03',
      deadlineMs: extra.deadlineMs ?? 1000,
    });
  }

  it('returns locked and does not import crypto or call the vault when the key is absent', async () => {
    localStorage.removeItem(DEK_STORE);
    const load = spyOn(budgetKeptCryptoImports, 'load');
    const get = jasmine.createSpy('get').and.throwError('vault should not be read');
    expect(await askDays({ get } as unknown as Injector)).toEqual({ status: 'locked' });
    expect(load).not.toHaveBeenCalled();
    expect(get).not.toHaveBeenCalled();
  });

  it('returns cancelled without importing crypto when the signal is already aborted', async () => {
    const load = spyOn(budgetKeptCryptoImports, 'load');
    const ctrl = new AbortController();
    ctrl.abort();
    const unread = { get: () => { throw new Error('unread'); } } as unknown as Injector;
    expect(await askDays(unread, { signal: ctrl.signal })).toEqual({ status: 'cancelled' });
    expect(load).not.toHaveBeenCalled();
  });

  it('ranks locked above no_plan above no_data above ready', async () => {
    const purchase = [tx({ id: 1, date: '2026-10-02', amount: 5, kind: 'purchase' })];
    expect(await askDays(unlock({ profiles: [], txs: [] }).injector)).toEqual({ status: 'no_plan' });
    expect(await askDays(unlock({ profiles: [manualDays], txs: [] }).injector)).toEqual({ status: 'no_data' });
    const ready = await askDays(unlock({ profiles: [manualDays], txs: purchase }).injector);
    expect(ready.status).toBe('ready');
  });

  it('returns unavailable when the read passes the deadline', async () => {
    const { injector } = unlock({
      profiles: [manualDays],
      getTransactions: () => new Promise(() => undefined),
    });
    expect(await askDays(injector, { deadlineMs: 30 })).toEqual({ status: 'unavailable' });
  });

  it('returns cancelled when the signal aborts during the read', async () => {
    let markStarted!: () => void;
    const started = new Promise<void>(resolve => { markStarted = resolve; });
    const { injector } = unlock({
      profiles: [manualDays],
      getTransactions: () => {
        markStarted();
        return new Promise(() => undefined);
      },
    });
    const ctrl = new AbortController();
    const pending = askDays(injector, { signal: ctrl.signal, deadlineMs: 5000 });
    await started;
    ctrl.abort();
    expect(await pending).toEqual({ status: 'cancelled' });
  });

  it('returns expired when the vault read is a 401', async () => {
    const { injector } = unlock({
      profiles: [manualDays],
      getTransactions: () => Promise.reject(new HttpErrorResponse({ status: 401 })),
    });
    expect(await askDays(injector)).toEqual({ status: 'expired' });
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

  // Deterministic clock: with real timers the elapsed assertions below are
  // wall-clock guesses, and any main-thread stall over ~150ms (GC, coverage,
  // a busy runner) breaks them. fakeAsync virtualizes the timers and a stubbed
  // performance.now advances with the fakes, so the deadline arithmetic is exact.
  it('returns unavailable within one deadline when the import uses most of the budget and the read exceeds the rest', fakeAsync(() => {
    const deadlineMs = 400;
    const importMs = 250;
    let seen: number | undefined;
    let now = 1_000;
    spyOn(performance, 'now').and.callFake(() => now);
    const started = performance.now();
    const load = () => new Promise<{ loadFinanceBudgetKept: (injector: Injector, signal: AbortSignal, callOpts: { deadlineMs?: number }) => Promise<BudgetKeptResult> }>(resolve => {
      setTimeout(() => {
        now = started + importMs;
        resolve({
          loadFinanceBudgetKept: (_injector, _signal, callOpts) => new Promise(settle => {
            seen = callOpts.deadlineMs;
            setTimeout(() => {
              now = started + importMs + (seen ?? 0);
              settle({ status: 'unavailable' });
            }, callOpts.deadlineMs);
          }),
        });
      }, importMs);
    });
    let result: BudgetKeptResult | undefined;
    void loadFinanceBudgetKeptGuarded(injector, new AbortController().signal, { ...opts, deadlineMs }, load)
      .then(settled => { result = settled; });
    tick(importMs);
    flushMicrotasks();
    tick(deadlineMs - importMs);
    flushMicrotasks();
    expect(result).toEqual({ status: 'unavailable' });
    const elapsed = performance.now() - started;
    expect(seen).toBeGreaterThan(0);
    expect(seen).toBeLessThan(deadlineMs);
    expect(elapsed).toBeGreaterThan(importMs);
    expect(elapsed).toBeLessThan(deadlineMs + 150);
  }));

  it('throws RangeError synchronously for a bad today, weeks, or deadline and does not import', () => {
    const load = jasmine.createSpy('load').and.returnValue(new Promise(() => undefined));
    const signal = new AbortController().signal;
    expect(() => loadFinanceBudgetKeptGuarded(injector, signal, { ...opts, today: 'not-a-date' }, load))
      .toThrowError(RangeError);
    expect(() => loadFinanceBudgetKeptGuarded(injector, signal, { ...opts, today: '2026-02-31' }, load))
      .toThrowError(RangeError);
    expect(() => loadFinanceBudgetKeptGuarded(injector, signal, { ...opts, today: '2026-10-14\n' }, load))
      .toThrowError(RangeError);
    expect(() => loadFinanceBudgetKeptGuarded(injector, signal, { ...opts, today: '2026-10-1' }, load))
      .toThrowError(RangeError);
    expect(() => loadFinanceBudgetKeptGuarded(injector, signal, { ...opts, weeks: 0 }, load))
      .toThrowError(RangeError);
    expect(() => loadFinanceBudgetKeptGuarded(injector, signal, { ...opts, weeks: 1.5 }, load))
      .toThrowError(RangeError);
    expect(() => loadFinanceBudgetKeptGuarded(injector, signal, { ...opts, weeks: 521 }, load))
      .toThrowError(RangeError);
    for (const deadlineMs of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, 0, -1, 2 ** 31, Number.MAX_VALUE]) {
      expect(() => loadFinanceBudgetKeptGuarded(injector, signal, { ...opts, deadlineMs }, load))
        .toThrowError(RangeError);
    }
    expect(load).not.toHaveBeenCalled();
  });

  it('accepts the largest timer deadline before importing', async () => {
    const read = jasmine.createSpy('read').and.resolveTo({ status: 'no_plan' });
    const load = () => Promise.resolve({ loadFinanceBudgetKept: read });
    expect(await loadFinanceBudgetKeptGuarded(injector, new AbortController().signal,
      { ...opts, deadlineMs: 2 ** 31 - 1 }, load)).toEqual({ status: 'no_plan' });
    expect(read).toHaveBeenCalled();
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

});

describe('loadFinanceBudgetKeptDaysGuarded', () => {
  const dayOpts = { from: '2026-10-01', to: '2026-10-03', deadlineMs: 1000 };
  const injector = { get: () => { throw new Error('unread'); } } as unknown as Injector;

  it('returns cancelled and does not import when the signal is already aborted', async () => {
    const load = jasmine.createSpy('load').and.returnValue(new Promise(() => undefined));
    const ctrl = new AbortController();
    ctrl.abort();
    expect(await loadFinanceBudgetKeptDaysGuarded(injector, ctrl.signal, dayOpts, load)).toEqual({ status: 'cancelled' });
    expect(load).not.toHaveBeenCalled();
  });

  it('throws RangeError synchronously for a bad range or deadline and does not import', () => {
    const load = jasmine.createSpy('load').and.returnValue(new Promise(() => undefined));
    const signal = new AbortController().signal;
    expect(() => loadFinanceBudgetKeptDaysGuarded(injector, signal, { ...dayOpts, from: 'not-a-date' }, load))
      .toThrowError(RangeError);
    expect(() => loadFinanceBudgetKeptDaysGuarded(injector, signal, { ...dayOpts, to: '2026-02-31' }, load))
      .toThrowError(RangeError);
    expect(() => loadFinanceBudgetKeptDaysGuarded(injector, signal, { ...dayOpts, from: '2026-10-03', to: '2026-10-01' }, load))
      .toThrowError(RangeError);
    expect(() => loadFinanceBudgetKeptDaysGuarded(injector, signal, { ...dayOpts, deadlineMs: Number.NaN }, load))
      .toThrowError(RangeError);
    expect(load).not.toHaveBeenCalled();
  });

});
