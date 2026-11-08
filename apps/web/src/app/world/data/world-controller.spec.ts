import type { TownResponse } from '../../town/town.types';
import { WORLD_COPY, type WorldMeta, type WorldResponse, type WorldWeek } from '../world.types';
import { WorldController, worldEngineBridge, type BudgetLoadResult } from './world-controller';

const META: WorldMeta = {
  today: '2026-11-07',
  current_week: '2026-11-02',
  start_week: '2000-01-03',
  version: 1,
};

const town = {
  town: {
    name: 'Home',
    founded_on: '2020-01-06',
    today: '2026-11-07',
    tz: 'UTC',
    xp: 3,
    level: 1,
    level_xp_start: 0,
    next_level_xp: 20,
  },
  buildings: {
    library: { xp: 0, level: 1, level_xp_start: 0, next_level_xp: 10, stage: 1 as const, today_xp: 0, today_cap: 1, source: 'ok' as const },
    inn: { xp: 0, level: 1, level_xp_start: 0, next_level_xp: 10, stage: 1 as const, today_xp: 0, today_cap: 1, source: 'ok' as const },
  },
  lots: [],
  habits: [],
  archived: [],
  today: { done: 0, total: 0 },
  constants_version: 1,
} as TownResponse;

function world(weeks: WorldWeek[] = [], meta: WorldMeta = META): WorldResponse {
  return { meta, weeks };
}

function conceptWeek(week: string, id: number, name: string): WorldWeek {
  return { week, trips: [], finished: [], habits: [], concepts: [{ id, name, on: week }] };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

async function until(ready: () => boolean): Promise<void> {
  for (let i = 0; i < 30 && !ready(); i += 1) await Promise.resolve();
  expect(ready()).toBeTrue();
}

describe('WorldController', () => {
  const userId = 102102;
  let controller: WorldController | null = null;

  afterEach(() => {
    controller?.setFog(true);
    controller?.dispose();
    controller = null;
    localStorage.removeItem(`world.fog.v1.${userId}`);
  });

  function harness(opts?: {
    vault?: boolean;
    budget?: (signal: AbortSignal) => Promise<BudgetLoadResult>;
    respond?: (from: string | null, to: string | null) => Promise<WorldResponse>;
  }) {
    const requested: { from: string | null; to: string | null }[] = [];
    const loadBudget = jasmine.createSpy('loadBudget').and.callFake((signal: AbortSignal) => {
      return opts?.budget ? opts.budget(signal) : Promise.resolve({ status: 'locked' as const });
    });
    const api = {
      getWorld: (from: string | null, to: string | null) => {
        requested.push({ from, to });
        return opts?.respond ? opts.respond(from, to) : Promise.resolve(world());
      },
      getTown: () => Promise.resolve(town),
    };
    controller = new WorldController({
      api,
      seedUserId: userId,
      loadBudget,
      vaultPresent: () => opts?.vault !== false,
    });
    return { controller, requested, loadBudget };
  }

  it('does not issue a second older page while one is in flight', async () => {
    const page = deferred<WorldResponse>();
    const { controller: worldController, requested } = harness({
      respond: (from) => (from === null ? Promise.resolve(world()) : page.promise),
    });
    await worldController.loadInitial(new AbortController().signal);
    const oldest = worldController.snapshot().weeks[0]?.week ?? '';
    const first = worldController.pageOlder(new AbortController().signal);
    const second = worldController.pageOlder(new AbortController().signal);
    const pages = requested.filter((call) => call.from !== null);
    expect(pages.length).toBe(1);
    expect((pages[0]?.to ?? '') < oldest).toBeTrue();
    page.resolve(world());
    await Promise.all([first, second]);
    expect(requested.filter((call) => call.from !== null).length).toBe(1);
  });

  it('regenerates one chunk when a loaded week changes', async () => {
    let weeks = [conceptWeek(META.current_week, 1, 'Alpha')];
    const { controller: worldController } = harness({
      respond: () => Promise.resolve(world(weeks)),
    });
    await worldController.loadInitial(new AbortController().signal);
    const oldest = worldController.snapshot().chunks[0]!;
    const spy = spyOn(worldEngineBridge, 'generateChunk').and.callThrough();
    weeks = [conceptWeek(META.current_week, 2, 'Beta')];
    await worldController.refetchWeeks([META.current_week], new AbortController().signal);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.calls.mostRecent().args[1].week).toBe(META.current_week);
    const oldestAfter = worldController.snapshot().chunks[0]!;
    expect(oldestAfter.chunk).toBe(oldest.chunk);
    expect(oldestAfter.inputKey).toBe(oldest.inputKey);
    expect(worldController.snapshot().weeks.find((week) => week.week === META.current_week)?.concepts[0]?.name).toBe('Beta');
  });

  it('does not call getWorld again for a text edit', async () => {
    const { controller: worldController, requested } = harness();
    await worldController.loadInitial(new AbortController().signal);
    const spy = spyOn(worldEngineBridge, 'generateChunk').and.callThrough();
    await worldController.applyConceptEdit({ kind: 'text' }, new AbortController().signal);
    expect(requested).toEqual([{ from: null, to: null }]);
    expect(spy).not.toHaveBeenCalled();
  });

  it('refetches the two Mondays when a concept changes date', async () => {
    const { controller: worldController, requested } = harness();
    await worldController.loadInitial(new AbortController().signal);
    await worldController.applyConceptEdit(
      { kind: 'weeks', weeks: ['2026-10-06', '2026-10-21'] },
      new AbortController().signal,
    );
    const pages = requested.filter((call) => call.from !== null);
    expect(pages.map((call) => call.from).sort()).toEqual(['2026-10-05', '2026-10-19']);
    expect(pages.every((call) => call.from === call.to)).toBeTrue();
  });

  it('drops an in-flight budget when finance locks', async () => {
    const budget = deferred<BudgetLoadResult>();
    const { controller: worldController, loadBudget } = harness({
      budget: () => budget.promise,
    });
    const pending = worldController.loadInitial(new AbortController().signal);
    await until(() => loadBudget.calls.count() === 1);
    const budgetSignal = loadBudget.calls.mostRecent().args[0] as AbortSignal;
    let locked = false;
    worldController.subscribeLock(() => {
      locked = true;
    });
    worldController.clearFinance();
    expect(budgetSignal.aborted).toBeTrue();
    budget.resolve({
      status: 'ready',
      annualPlan: 515151.25,
      weeklyPlan: 616161.75,
      mode: 'manual',
      weeks: [{ weekStart: '2026-10-26', spend: 717171.5, weeklyPlan: 616161.75, kept: true }],
    });
    await pending;
    const snapshot = worldController.snapshot();
    const json = JSON.stringify(snapshot);
    expect(locked).toBeTrue();
    expect(snapshot.chests.retry).toBeFalse();
    expect(snapshot.chests.toolbar).toBeNull();
    expect(snapshot.chests.weeks.length).toBeGreaterThan(1);
    expect(snapshot.chests.weeks.every((week) => week.visual === 'none')).toBeTrue();
    expect(json).not.toContain('Within your spending plan');
    expect(json).not.toContain('515151.25');
    expect(json).not.toContain('616161.75');
    expect(json).not.toContain('717171.5');
  });

  it('does not call loadBudget when the vault is absent', async () => {
    const { controller: worldController, loadBudget } = harness({ vault: false });
    await worldController.loadInitial(new AbortController().signal);
    const snapshot = worldController.snapshot();
    expect(loadBudget).not.toHaveBeenCalled();
    expect(snapshot.townStatus).toBe('ready');
    expect(snapshot.chests.toolbar).toEqual({ href: WORLD_COPY.unlockHref, label: WORLD_COPY.unlock });
    expect(snapshot.chests.weeks.some((week) => week.visual === 'sealed')).toBeTrue();
    expect(snapshot.chests.weeks.find((week) => week.week === META.current_week)?.visual).toBe('none');
  });

  it('stores weekStart and kept without spend or plan amounts', async () => {
    const { controller: worldController, loadBudget } = harness({
      budget: async () => ({
        status: 'ready',
        annualPlan: 515151.25,
        weeklyPlan: 616161.75,
        mode: 'manual',
        weeks: [{ weekStart: '2026-10-26', spend: 717171.5, weeklyPlan: 616161.75, kept: true }],
      }),
    });
    await worldController.loadInitial(new AbortController().signal);
    const completed = worldController.snapshot().weeks.filter((week) => week.week < META.current_week).length;
    expect(loadBudget).toHaveBeenCalledWith(jasmine.any(AbortSignal), {
      today: META.today,
      weeks: Math.min(520, completed),
      includeCurrentWeek: false,
    });
    const snapshot = worldController.snapshot();
    const json = JSON.stringify(snapshot);
    expect(json).not.toContain('515151.25');
    expect(json).not.toContain('616161.75');
    expect(json).not.toContain('717171.5');
    expect(json).not.toContain('weeklyPlan');
    expect(json).not.toContain('annualPlan');
    expect(json).not.toMatch(/"spend"/);
    expect(snapshot.chests.weeks.some((week) => week.line === WORLD_COPY.withinPlan)).toBeTrue();
    expect(json).not.toMatch(/\b\d+\.\d{2}\b/);
  });

  it('maps an expired budget to the unavailable overlay', async () => {
    const { controller: worldController } = harness({
      budget: async () => ({ status: 'expired' }),
    });
    await worldController.loadInitial(new AbortController().signal);
    const snapshot = worldController.snapshot();
    expect(snapshot.chests.retry).toBeTrue();
    expect(snapshot.chests.toolbar).toBeNull();
    expect(snapshot.chests.weeks.every((week) => week.visual === 'none')).toBeTrue();
  });

  it('ignores a stale world response', async () => {
    const gates = [deferred<WorldResponse>(), deferred<WorldResponse>()];
    let calls = 0;
    const { controller: worldController } = harness({
      respond: () => gates[calls++]!.promise,
    });
    const signal = new AbortController().signal;
    const first = worldController.loadInitial(signal);
    const second = worldController.loadInitial(signal);
    expect(calls).toBe(2);
    gates[1]!.resolve(world([conceptWeek(META.current_week, 2, 'SECOND-MARKER')]));
    gates[0]!.resolve(world([conceptWeek(META.current_week, 1, 'FIRST-MARKER')]));
    await Promise.all([first, second]);
    const json = JSON.stringify(worldController.snapshot());
    expect(json).toContain('SECOND-MARKER');
    expect(json).not.toContain('FIRST-MARKER');
  });

  it('does not page while the camera is more than four chunks from the edge', async () => {
    const { controller: worldController, requested } = harness();
    await worldController.loadInitial(new AbortController().signal);
    worldController.cameraX = 4 * 56 + 1;
    await worldController.pageOlder(new AbortController().signal);
    expect(requested.filter((call) => call.from !== null)).toEqual([]);
  });

  it('keeps a distant concept week out of the loaded strip and moves start_week', async () => {
    const { controller: worldController } = harness({
      respond: (from) => Promise.resolve(from === '2020-01-06'
        ? world([conceptWeek('2020-01-06', 9, 'Far')], { ...META, start_week: '2020-01-06' })
        : world()),
    });
    await worldController.loadInitial(new AbortController().signal);
    const before = worldController.snapshot().weeks.map((item) => item.week);
    await worldController.refetchWeeks(['2020-01-06'], new AbortController().signal);
    const after = worldController.snapshot();
    expect(after.weeks.map((item) => item.week)).toEqual(before);
    expect(JSON.stringify(after)).not.toContain('Far');
    expect(after.meta?.start_week).toBe('2020-01-06');
  });

  it('adds a concept week that touches the loaded strip', async () => {
    const { controller: worldController } = harness({
      respond: (from) => Promise.resolve(from === '2026-05-04'
        ? world([conceptWeek('2026-05-04', 3, 'Edge')])
        : world()),
    });
    await worldController.loadInitial(new AbortController().signal);
    await worldController.refetchWeeks(['2026-05-04'], new AbortController().signal);
    const weeks = worldController.snapshot().weeks;
    expect(weeks[0]?.week).toBe('2026-05-04');
    expect(weeks[0]?.concepts[0]?.name).toBe('Edge');
    expect(weeks[1]?.week).toBe('2026-05-11');
  });

  it('does not rebuild chunks when fog changes', async () => {
    const { controller: worldController, requested } = harness();
    await worldController.loadInitial(new AbortController().signal);
    const chunks = worldController.snapshot().chunks.map((loaded) => loaded.chunk);
    const keys = worldController.snapshot().chunks.map((loaded) => loaded.inputKey);
    expect(worldController.fogEnabled).toBeTrue();
    worldController.setFog(false);
    const after = worldController.snapshot();
    expect(after.fog).toBeFalse();
    expect(after.chunks.map((loaded) => loaded.chunk)).toEqual(chunks);
    expect(after.chunks.map((loaded) => loaded.inputKey)).toEqual(keys);
    expect(requested.length).toBe(1);
  });
});
