import type { TownResponse } from '../../town/town.types';
import { addDays, generateChunk, inputKey, normalizeWeek, worldSeed } from '../engine';
import {
  chestOverlay,
  createChunkCache,
  engineWeek,
  initialRange,
  nextOlderRange,
  oneInFlight,
  readFogEnabled,
  shouldPage,
  snapWeek,
  weeksToRegenerate,
  writeFogEnabled,
  type BudgetView,
  type ConceptEdit,
} from '../logic';
import type { ChestOverlay, LoadedChunk, WorldMeta, WorldResponse, WorldWeek } from '../world.types';
import { WorldApiError, WorldRequestAborted, type WorldApi } from './world-api';

/** Specs spy on `generateChunk`. Chunk builds go through this object. */
export const worldEngineBridge = { generateChunk };

export interface BudgetLoadWeek {
  weekStart: string;
  kept: boolean | null;
  spend?: number | null;
  weeklyPlan?: number;
}

/** Shape of loadFinanceBudgetKept. The controller stores none of the money fields. */
export type BudgetLoadResult =
  | { status: 'locked' | 'no_plan' | 'no_data' | 'unavailable' | 'expired' | 'cancelled' }
  | {
      status: 'ready';
      weeks: readonly BudgetLoadWeek[];
      annualPlan?: number;
      weeklyPlan?: number;
      mode?: string;
    };

export interface BudgetLoadOptions {
  today: string;
  weeks: number;
  includeCurrentWeek: false;
}

export interface WorldReadApi {
  getWorld(from: string | null, to: string | null, signal: AbortSignal): Promise<WorldResponse>;
  getTown(signal: AbortSignal): Promise<TownResponse>;
}

export interface WorldControllerDeps {
  api: WorldReadApi;
  seedUserId: number | (() => number);
  loadBudget: (signal: AbortSignal, opts: BudgetLoadOptions) => Promise<BudgetLoadResult>;
  vaultPresent: () => boolean;
  matchMedia?: (query: string) => { matches: boolean };
}

export type TownLoadStatus = 'idle' | 'loading' | 'ready' | 'unavailable';

export interface WorldSnapshot {
  meta: WorldMeta | null;
  weeks: WorldWeek[];
  chunks: LoadedChunk[];
  chests: ChestOverlay;
  fog: boolean;
  error: string | null;
  loading: boolean;
  townStatus: TownLoadStatus;
}

const EMPTY_CHESTS: ChestOverlay = { weeks: [], toolbar: null, retry: false };

function asDay(value: string): string {
  return value.slice(0, 10);
}

function normalizeMeta(meta: WorldMeta): WorldMeta {
  return {
    today: asDay(meta.today),
    current_week: asDay(meta.current_week),
    start_week: asDay(meta.start_week),
    version: meta.version,
  };
}

function blankWeek(week: string): WorldWeek {
  return { week, trips: [], finished: [], habits: [], concepts: [] };
}

function storedWeek(week: WorldWeek, monday: string): WorldWeek {
  const stored: WorldWeek = {
    week: monday,
    trips: week.trips ?? [],
    finished: week.finished ?? [],
    habits: week.habits ?? [],
    concepts: week.concepts ?? [],
  };
  if (week.finished_more) stored.finished_more = week.finished_more;
  return stored;
}

function eachMonday(from: string, to: string): string[] {
  const days: string[] = [];
  let cursor = from;
  while (cursor <= to) {
    days.push(cursor);
    const next = addDays(cursor, 7);
    if (next <= cursor) break;
    cursor = next;
  }
  return days;
}

function contiguousRuns(mondays: readonly string[]): { from: string; to: string }[] {
  const runs: { from: string; to: string }[] = [];
  for (const day of mondays) {
    const last = runs.at(-1);
    if (last && addDays(last.to, 7) === day) last.to = day;
    else runs.push({ from: day, to: day });
  }
  return runs;
}

function keptOnly(weeks: readonly BudgetLoadWeek[]): { weekStart: string; kept: boolean | null }[] {
  return weeks.map((week) => ({
    weekStart: week.weekStart,
    kept: week.kept === true ? true : week.kept === false ? false : null,
  }));
}

function toBudgetView(result: BudgetLoadResult): BudgetView | null {
  switch (result.status) {
    case 'cancelled':
      return null;
    case 'locked':
      return { status: 'locked' };
    case 'no_plan':
      return { status: 'no_plan' };
    case 'no_data':
      return { status: 'no_data' };
    case 'expired':
    case 'unavailable':
      return { status: 'unavailable' };
    case 'ready':
      return { status: 'ready', weeks: keptOnly(result.weeks) };
  }
}

/**
 * Loaded weeks, chunk cache, and the Finance chest overlay.
 * Paging, chest copy, and fog persistence come from ../logic.
 */
export class WorldController {
  /** Viewport left edge in tiles. The oldest loaded week is tile 0. */
  cameraX = 0;

  private readonly cache = createChunkCache();
  private readonly weeks = new Map<string, WorldWeek>();
  private readonly chunkByWeek = new Map<string, LoadedChunk>();
  private readonly lockListeners = new Set<() => void>();
  private meta: WorldMeta | null = null;
  private townBody: TownResponse | null = null;
  private townStatus: TownLoadStatus = 'idle';
  private error: string | null = null;
  private loading = false;
  private busy = false;
  private generation = 0;
  private budgetEpoch = 0;
  private budgetView: BudgetView = { status: 'cleared' };
  private chests: ChestOverlay = EMPTY_CHESTS;
  private budgetAbort: AbortController | null = null;
  private worldAbort = new AbortController();
  private notifying = false;

  constructor(private readonly deps: WorldControllerDeps) {}

  get fogEnabled(): boolean {
    return readFogEnabled(this.userId(), this.browserStorage());
  }

  /** Persists the lit-map preference. Does not rebuild chunks or hashes. */
  setFog(enabled: boolean): void {
    writeFogEnabled(this.userId(), enabled, this.browserStorage());
  }

  get town(): TownResponse | null {
    return this.townBody;
  }

  subscribeLock(onLock: () => void): () => void {
    this.lockListeners.add(onLock);
    return () => this.lockListeners.delete(onLock);
  }

  /** Drop Finance immediately. An in-flight budget result cannot publish afterwards. */
  clearFinance(): void {
    this.budgetEpoch += 1;
    this.budgetAbort?.abort();
    this.budgetAbort = null;
    this.budgetView = { status: 'cleared' };
    this.publishChests(false);
    this.emitLock();
  }

  dispose(): void {
    this.generation += 1;
    this.budgetEpoch += 1;
    this.worldAbort.abort();
    this.budgetAbort?.abort();
    this.budgetAbort = null;
    this.busy = false;
    this.loading = false;
  }

  snapshot(): WorldSnapshot {
    const keys = this.orderedKeys();
    return {
      meta: this.meta,
      weeks: keys.map((key) => this.weeks.get(key)!),
      chunks: keys.map((key) => this.chunkByWeek.get(key)!),
      chests: this.chests,
      fog: this.fogEnabled,
      error: this.error,
      loading: this.loading,
      townStatus: this.townStatus,
    };
  }

  async loadInitial(signal: AbortSignal): Promise<void> {
    const gen = this.begin();
    const linked = this.link(signal);
    this.townStatus = 'loading';
    const townTask = this.loadTown(gen, linked.signal);
    try {
      const response = await this.deps.api.getWorld(null, null, linked.signal);
      if (!this.alive(gen, linked.signal)) return;
      const meta = normalizeMeta(response.meta);
      const range = initialRange(meta.current_week, meta.start_week);
      this.install(response, meta, range.from, range.to, 'replace');
      this.error = null;
      await this.refreshBudget(linked.signal);
    } catch (error) {
      this.fail(gen, linked.signal, error);
    } finally {
      linked.done();
      await townTask;
      this.end(gen);
    }
  }

  /**
   * One older page. A second call while this request is in flight does nothing.
   * Pass force when the list asks for older weeks away from the left edge.
   */
  async pageOlder(signal: AbortSignal, force = false): Promise<void> {
    if (!oneInFlight(this.busy)) return;
    if (!this.meta) return;
    const oldest = this.oldest();
    if (!oldest || oldest <= this.meta.start_week) return;
    if (!force && !shouldPage(this.cameraX, 0)) return;
    const range = nextOlderRange(oldest, this.meta.start_week);
    if (!range) return;
    const gen = this.begin();
    const linked = this.link(signal);
    try {
      const response = await this.deps.api.getWorld(range.from, range.to, linked.signal);
      if (!this.alive(gen, linked.signal)) return;
      this.install(response, normalizeMeta(response.meta), range.from, range.to, 'merge');
      this.error = null;
      await this.refreshBudget(linked.signal);
    } catch (error) {
      this.fail(gen, linked.signal, error);
    } finally {
      linked.done();
      this.end(gen);
    }
  }

  async refetchWeeks(mondays: readonly string[], signal: AbortSignal): Promise<void> {
    if (!this.meta || mondays.length === 0) return;
    const keys = [...new Set(mondays.map((day) => this.mondayOf(day)))].sort();
    if (keys.length === 0) return;
    const gen = this.begin();
    const linked = this.link(signal);
    try {
      for (const run of contiguousRuns(keys)) {
        if (!this.alive(gen, linked.signal)) return;
        const response = await this.deps.api.getWorld(run.from, run.to, linked.signal);
        if (!this.alive(gen, linked.signal)) return;
        this.replaceKeys(response, eachMonday(run.from, run.to));
      }
      this.error = null;
    } catch (error) {
      this.fail(gen, linked.signal, error);
    } finally {
      linked.done();
      this.end(gen);
    }
  }

  /** Text and archive edits do not call getWorld. A date move refetches those weeks. */
  async applyConceptEdit(edit: ConceptEdit, signal: AbortSignal): Promise<void> {
    const weeks = weeksToRegenerate(edit);
    if (weeks.length === 0) return;
    await this.refetchWeeks(weeks, signal);
  }

  /** Chest retry. Does not refetch world weeks. */
  async reloadBudget(signal: AbortSignal): Promise<void> {
    const linked = this.link(signal);
    try {
      await this.refreshBudget(linked.signal);
    } finally {
      linked.done();
    }
  }

  private async loadTown(gen: number, signal: AbortSignal): Promise<void> {
    try {
      const town = await this.deps.api.getTown(signal);
      if (!this.alive(gen, signal)) return;
      this.townBody = town;
      this.townStatus = 'ready';
    } catch (error) {
      if (!this.alive(gen, signal) || error instanceof WorldRequestAborted) return;
      this.townBody = null;
      this.townStatus = 'unavailable';
    }
  }

  private install(
    response: WorldResponse,
    meta: WorldMeta,
    from: string,
    to: string,
    mode: 'replace' | 'merge',
  ): void {
    this.meta = meta;
    if (mode === 'replace') {
      this.weeks.clear();
      this.chunkByWeek.clear();
    }
    const byWeek = new Map(response.weeks.map((week) => [asDay(week.week), week]));
    for (const monday of eachMonday(from, to)) {
      const found = byWeek.get(monday);
      const week = found ? storedWeek(found, monday) : blankWeek(monday);
      this.weeks.set(monday, week);
      this.chunkByWeek.set(monday, this.makeChunk(week));
    }
  }

  private replaceKeys(response: WorldResponse, mondays: readonly string[]): void {
    this.meta = normalizeMeta(response.meta);
    const byWeek = new Map(response.weeks.map((week) => [asDay(week.week), week]));
    const pending = new Set(mondays.map((day) => asDay(day)));
    let progressed = true;
    while (pending.size > 0 && progressed) {
      progressed = false;
      for (const monday of [...pending].sort()) {
        if (!this.touchesLoaded(monday)) continue;
        pending.delete(monday);
        const found = byWeek.get(monday);
        const week = found ? storedWeek(found, monday) : blankWeek(monday);
        this.weeks.set(monday, week);
        this.chunkByWeek.set(monday, this.makeChunk(week));
        progressed = true;
      }
    }
  }

  /** A refetch may replace a loaded week or grow the strip by a touching week. A distant week would open a hole. */
  private touchesLoaded(monday: string): boolean {
    if (this.weeks.size === 0 || this.weeks.has(monday)) return true;
    return this.weeks.has(addDays(monday, 7)) || this.weeks.has(addDays(monday, -7));
  }

  private makeChunk(week: WorldWeek): LoadedChunk {
    const input = normalizeWeek(engineWeek(week));
    const seed = worldSeed(this.userId());
    const key = inputKey(seed, input);
    let chunk = this.cache.chunkFor(key);
    if (!chunk) {
      chunk = worldEngineBridge.generateChunk(seed, input);
      this.cache.remember(key, chunk);
    }
    return { input, inputKey: key, chunk, week };
  }

  private async refreshBudget(signal: AbortSignal): Promise<void> {
    if (!this.meta) return;
    if (!this.deps.vaultPresent()) {
      this.budgetView = { status: 'locked' };
      this.publishChests(false);
      return;
    }
    const weeks = Math.min(520, this.completedCount());
    if (weeks < 1) {
      this.budgetView = { status: 'ready', weeks: [] };
      this.publishChests(false);
      return;
    }
    this.budgetAbort?.abort();
    const ctrl = new AbortController();
    this.budgetAbort = ctrl;
    const epoch = this.budgetEpoch;
    const onAbort = () => ctrl.abort();
    if (signal.aborted) ctrl.abort();
    else signal.addEventListener('abort', onAbort, { once: true });
    const today = this.meta.today;
    this.budgetView = { status: 'loading' };
    this.publishChests(true);
    let result: BudgetLoadResult;
    try {
      result = await this.deps.loadBudget(ctrl.signal, { today, weeks, includeCurrentWeek: false });
    } catch {
      result = ctrl.signal.aborted ? { status: 'cancelled' } : { status: 'unavailable' };
    } finally {
      signal.removeEventListener('abort', onAbort);
    }
    if (epoch !== this.budgetEpoch || ctrl.signal.aborted) return;
    const view = toBudgetView(result);
    if (!view || !this.meta) return;
    this.budgetView = view;
    this.publishChests(false);
  }

  private publishChests(keepPrevious: boolean): void {
    if (!this.meta) {
      this.chests = EMPTY_CHESTS;
      return;
    }
    this.chests = chestOverlay(
      this.budgetView,
      this.orderedKeys(),
      this.meta.current_week,
      keepPrevious ? this.chests : undefined,
    );
  }

  private completedCount(): number {
    const current = this.meta?.current_week;
    if (!current) return 0;
    let count = 0;
    for (const week of this.weeks.keys()) if (week < current) count += 1;
    return count;
  }

  private mondayOf(iso: string): string {
    const day = asDay(iso);
    if (!this.meta) return day;
    return snapWeek(day, this.meta.start_week, this.meta.current_week);
  }

  private orderedKeys(): string[] {
    return [...this.weeks.keys()].sort();
  }

  private oldest(): string | null {
    return this.orderedKeys()[0] ?? null;
  }

  private userId(): number {
    const value = typeof this.deps.seedUserId === 'function' ? this.deps.seedUserId() : this.deps.seedUserId;
    return Number.isFinite(value) ? value : 0;
  }

  private browserStorage(): Storage | null {
    try {
      return typeof localStorage === 'undefined' ? null : localStorage;
    } catch {
      return null;
    }
  }

  private begin(): number {
    this.generation += 1;
    this.busy = true;
    this.loading = true;
    return this.generation;
  }

  private end(gen: number): void {
    if (gen !== this.generation) return;
    this.busy = false;
    this.loading = false;
  }

  private alive(gen: number, signal: AbortSignal): boolean {
    return gen === this.generation && !signal.aborted;
  }

  private fail(gen: number, signal: AbortSignal, error: unknown): void {
    if (!this.alive(gen, signal) || error instanceof WorldRequestAborted) return;
    this.error = error instanceof WorldApiError ? error.message : 'World is unavailable right now.';
  }

  private link(signal: AbortSignal): { signal: AbortSignal; done: () => void } {
    const ctrl = new AbortController();
    const parent = this.worldAbort.signal;
    const abort = () => ctrl.abort();
    if (signal.aborted || parent.aborted) {
      ctrl.abort();
      return { signal: ctrl.signal, done: () => undefined };
    }
    signal.addEventListener('abort', abort, { once: true });
    parent.addEventListener('abort', abort, { once: true });
    return {
      signal: ctrl.signal,
      done: () => {
        signal.removeEventListener('abort', abort);
        parent.removeEventListener('abort', abort);
      },
    };
  }

  private emitLock(): void {
    if (this.notifying) return;
    this.notifying = true;
    try {
      for (const listener of [...this.lockListeners]) listener();
    } finally {
      this.notifying = false;
    }
  }
}

export type { WorldApi };
