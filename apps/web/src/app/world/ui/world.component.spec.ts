import { ComponentFixture,TestBed } from '@angular/core/testing';
import { provideRouter,Router } from '@angular/router';
import { SESSION_CONTEXT } from '@vivek/ui';
import { Subject } from 'rxjs';
import { financeTabId } from '../../../../../finance/frontend/src/public-api';
import { SessionService } from '../../platform/session.service';
import type { TownResponse } from '../../town/town.types';
import { WorldApi } from '../data/world-api';
import { WorldController } from '../data/world-controller';
import { SpriteAtlas } from '../render/atlas';
import { WORLD_COPY,type ChestOverlay,type LoadedChunk,type WorldWeek } from '../world.types';
import { WORLD_CONTROLLER,WorldComponent,type ExplorerController,type WorldView } from './world.component';

function mondayWeeksBack(weeksBack: number): string {
  const date = new Date(Date.UTC(2026, 9, 26));
  date.setUTCDate(date.getUTCDate() - weeksBack * 7);
  return date.toISOString().slice(0, 10);
}

function week(iso: string, extras: Partial<WorldWeek> = {}): WorldWeek {
  return { week: iso, trips: [], finished: [], habits: [], concepts: [], ...extras };
}

function loaded(iso: string, source: WorldWeek): LoadedChunk {
  return {
    inputKey: `in-${iso}`,
    input: {} as LoadedChunk['input'],
    week: source,
    chunk: {
      v: 1,
      week: iso,
      heights: Array.from({ length: 56 }, () => 0),
      biomes: [],
      trips: [],
      lit: [true, true, true, true, true, true, true],
      structures: [],
      structuresOverflow: 0,
      props: [],
      decor: [],
      chest: { x: 54 },
    },
  };
}

function townFixture(): TownResponse {
  const building = {
    stage: 1 as const,
    xp: 0,
    level: 1,
    level_xp_start: 0,
    next_level_xp: 10,
    today_xp: 0,
    today_cap: 1,
    source: 'ok' as const,
  };
  return {
    town: {
      name: 'Town',
      founded_on: '2026-01-01',
      today: '2026-10-29',
      tz: 'America/Los_Angeles',
      xp: 0,
      level: 1,
      level_xp_start: 0,
      next_level_xp: 10,
    },
    buildings: { library: building, inn: { ...building } },
    lots: [{ slot: 0, unlock_level: 1, state: 'occupied', habit_id: 1 }],
    habits: [{
      id: 1,
      name: 'Walk',
      slot: 0,
      building_style: 'cottage',
      cadence: { per_week: 3, kind: 'weekly', pending: null },
      created_on: '2026-01-01',
      archived_on: null,
      stage: 1,
      streak: { unit: 'days', current: 14, best: 14, best_days: 14, best_weeks: 2, rest_day_available: null, rest_used_on: null },
      week: null,
      checked_today: false,
      checked_yesterday: false,
      can_check_yesterday: false,
      last7: [],
      xp: 0,
      level: 1,
      level_xp_start: 0,
      next_level_xp: 10,
    }],
    archived: [],
    today: { done: 0, total: 1 },
    constants_version: 1,
  };
}

describe('WorldComponent', () => {
  let fixture: ComponentFixture<WorldComponent>;
  let controller: ExplorerController & { town: TownResponse };

  function installMatchMedia(reduced: boolean): void {
    spyOn(window, 'matchMedia').and.callFake((query: string) => ({
      matches: reduced && query.includes('prefers-reduced-motion'),
      media: query,
      onchange: null,
      addListener: () => undefined,
      removeListener: () => undefined,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      dispatchEvent: () => false,
    }) as unknown as MediaQueryList);
  }

  async function setup(options?: { reduced?: boolean; weeks?: number }): Promise<void> {
    localStorage.clear();
    installMatchMedia(options?.reduced === true);
    spyOn(SpriteAtlas.prototype, 'ensure').and.resolveTo(undefined);
    spyOn(window, 'cancelAnimationFrame').and.stub();

    const count = options?.weeks ?? 4;
    const dates = Array.from({ length: count }, (_, index) => mondayWeeksBack(count - 1 - index));
    const tripWeek = dates.includes('2026-10-19') ? '2026-10-19' : dates[0];
    const weeks = dates.map(iso => week(iso, iso === tripWeek ? {
      trips: [{ id: 1, title: 'Coast', start: iso, end: iso, place: null }],
    } : {}));
    const chests: ChestOverlay = {
      weeks: [{ week: tripWeek, visual: 'gold', line: WORLD_COPY.withinPlan }],
      toolbar: null,
      retry: false,
    };
    const view: WorldView = {
      meta: { today: '2026-10-29', current_week: dates[dates.length - 1], start_week: dates[0], version: 1 },
      weeks,
      chunks: weeks.map(item => loaded(item.week, item)),
      chests,
      fog: true,
      error: null,
      loading: false,
      townStatus: 'ready',
    };
    const town = townFixture();
    controller = {
      town,
      loadInitial: jasmine.createSpy('loadInitial').and.callFake(async () => undefined),
      pageOlder: jasmine.createSpy('pageOlder').and.resolveTo(undefined),
      refetchWeeks: jasmine.createSpy('refetchWeeks').and.resolveTo(undefined),
      applyConceptEdit: jasmine.createSpy('applyConceptEdit').and.resolveTo(undefined),
      clearFinance: jasmine.createSpy('clearFinance'),
      dispose: jasmine.createSpy('dispose'),
      setFog: jasmine.createSpy('setFog'),
      reloadBudget: jasmine.createSpy('reloadBudget').and.resolveTo(undefined),
      snapshot: () => view,
    };
    const session = { currentUser: { id: 7 }, cleared$: new Subject<void>() };

    await TestBed.configureTestingModule({
      imports: [WorldComponent],
      providers: [
        provideRouter([]),
        { provide: WORLD_CONTROLLER, useValue: controller },
        { provide: SessionService, useValue: session },
        {
          provide: WorldApi,
          useValue: {
            timezone: () => 'America/Los_Angeles',
            getTown: () => Promise.resolve(town),
            getWorld: () => Promise.resolve({ meta: view.meta, weeks }),
            listConcepts: () => Promise.resolve([]),
            createConcept: () => Promise.resolve(null),
            patchConcept: () => Promise.resolve(null),
            deleteConcept: () => Promise.resolve(),
          },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(WorldComponent);
    fixture.nativeElement.style.display = 'block';
    fixture.nativeElement.style.width = '780px';
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  afterEach(() => {
    fixture?.destroy();
  });





  it('keeps the injected controller across the World URL and disposes it once on leave', async () => {
    const realDispose = spyOn(WorldController.prototype, 'dispose').and.callThrough();
    await setup();
    expect(controller.loadInitial).toHaveBeenCalledTimes(1);
    const router = TestBed.inject(Router);
    await router.navigateByUrl('/town/world?week=2026-10-26').catch(() => undefined);
    expect(controller.dispose).not.toHaveBeenCalled();
    expect(realDispose).not.toHaveBeenCalled();
    await router.navigateByUrl('/hub').catch(() => undefined);
    expect(controller.dispose).toHaveBeenCalledTimes(1);
    expect(realDispose).not.toHaveBeenCalled();
  });

});

describe('World production controller ownership', () => {
  const stageTypes = ['pointerdown', 'pointermove', 'pointerup', 'pointercancel', 'wheel'];

  afterEach(() => {
    TestBed.resetTestingModule();
  });

  it('opens a new controller on each visit and releases the previous listeners', async () => {
    const owners: WorldController[] = [];
    const disposed: WorldController[] = [];
    const cleared: WorldController[] = [];
    const originalDispose = WorldController.prototype.dispose;
    const originalClear = WorldController.prototype.clearFinance;
    spyOn(WorldController.prototype, 'loadInitial').and.callFake(function (this: WorldController) {
      owners.push(this);
      return Promise.resolve();
    });
    spyOn(WorldController.prototype, 'dispose').and.callFake(function (this: WorldController) {
      disposed.push(this);
      return originalDispose.call(this);
    });
    spyOn(WorldController.prototype, 'clearFinance').and.callFake(function (this: WorldController) {
      cleared.push(this);
      return originalClear.call(this);
    });
    spyOn(SpriteAtlas.prototype, 'ensure').and.resolveTo(undefined);
    spyOn(window, 'matchMedia').and.callFake((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => undefined,
      removeListener: () => undefined,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      dispatchEvent: () => false,
    }) as unknown as MediaQueryList);

    let storageAdds = 0;
    let storageRemoves = 0;
    const windowAdd = window.addEventListener.bind(window);
    const windowRemove = window.removeEventListener.bind(window);
    spyOn(window, 'addEventListener').and.callFake((
      type: string,
      listener: EventListenerOrEventListenerObject,
      options?: boolean | AddEventListenerOptions,
    ) => {
      if (type === 'storage') storageAdds += 1;
      windowAdd(type, listener, options);
    });
    spyOn(window, 'removeEventListener').and.callFake((
      type: string,
      listener: EventListenerOrEventListenerObject,
      options?: boolean | EventListenerOptions,
    ) => {
      if (type === 'storage') storageRemoves += 1;
      windowRemove(type, listener, options);
    });

    const stageAdded: string[] = [];
    const stageRemoved: string[] = [];
    const elementAdd = HTMLElement.prototype.addEventListener;
    const elementRemove = HTMLElement.prototype.removeEventListener;
    spyOn(HTMLElement.prototype, 'addEventListener').and.callFake(function (
      this: HTMLElement,
      type: string,
      listener: EventListenerOrEventListenerObject,
      options?: boolean | AddEventListenerOptions,
    ) {
      if (this.classList.contains('world-stage') && stageTypes.includes(type)) stageAdded.push(type);
      return elementAdd.call(this, type, listener, options);
    });
    spyOn(HTMLElement.prototype, 'removeEventListener').and.callFake(function (
      this: HTMLElement,
      type: string,
      listener: EventListenerOrEventListenerObject,
      options?: boolean | EventListenerOptions,
    ) {
      if (this.classList.contains('world-stage') && stageTypes.includes(type)) stageRemoved.push(type);
      return elementRemove.call(this, type, listener, options);
    });

    const session = { currentUser: { id: 7 }, cleared$: new Subject<void>() };
    await TestBed.configureTestingModule({
      imports: [WorldComponent],
      providers: [
        provideRouter([]),
        { provide: SessionService, useValue: session },
        { provide: SESSION_CONTEXT, useValue: session },
        {
          provide: WorldApi,
          useValue: {
            timezone: () => 'America/Los_Angeles',
            getTown: () => Promise.resolve(townFixture()),
            getWorld: () => Promise.resolve({ meta: null, weeks: [] }),
            listConcepts: () => Promise.resolve([]),
            createConcept: () => Promise.resolve(null),
            patchConcept: () => Promise.resolve(null),
            deleteConcept: () => Promise.resolve(),
          },
        },
      ],
    }).compileComponents();

    const open = async (): Promise<ComponentFixture<WorldComponent>> => {
      const next = TestBed.createComponent(WorldComponent);
      next.nativeElement.style.display = 'block';
      next.nativeElement.style.width = '780px';
      next.detectChanges();
      await next.whenStable();
      next.detectChanges();
      return next;
    };

    const router = TestBed.inject(Router);
    let first: ComponentFixture<WorldComponent> | undefined;
    let second: ComponentFixture<WorldComponent> | undefined;
    try {
      first = await open();
      expect(owners.length).toBe(1);
      expect(stageAdded).toEqual(stageTypes);
      // The vault storage listener is process-wide. This visit adds it only
      // when no earlier root subscriber still holds it.
      const installed = storageAdds;
      expect(installed).toBeLessThanOrEqual(1);
      expect(disposed).toEqual([]);

      await router.navigateByUrl('/town/world?week=2026-10-12').catch(() => undefined);
      expect(disposed).toEqual([]);
      expect(owners.length).toBe(1);

      await router.navigateByUrl('/hub').catch(() => undefined);
      expect(disposed).toEqual([owners[0]]);
      expect(stageRemoved).toEqual(stageTypes);

      first.destroy();
      first = undefined;
      expect(disposed).toEqual([owners[0]]);
      expect(storageRemoves).toBe(installed);

      session.cleared$.next();
      window.dispatchEvent(new StorageEvent('storage', { key: 'finance-vault-lock', newValue: '1' }));
      expect(cleared).toEqual([]);

      second = await open();
      expect(owners.length).toBe(2);
      expect(owners[0]).not.toBe(owners[1]);
      expect(storageAdds - storageRemoves).toBe(installed);
      expect(stageAdded).toEqual([...stageTypes, ...stageTypes]);
      expect(disposed).toEqual([owners[0]]);

      session.cleared$.next();
      expect(cleared).toEqual([owners[1]]);

      const channel = new BroadcastChannel('finance-vault-sync-v1');
      channel.postMessage({ version: 1, userId: 9, kind: 'lock', tabId: 'other' });
      channel.postMessage({ version: 1, kind: 'lock' });
      channel.postMessage({ version: 1, userId: 7, kind: 'lock', tabId: financeTabId() });
      await new Promise(resolve => setTimeout(resolve, 30));
      expect(cleared).toEqual([owners[1]]);
      channel.postMessage({ version: 1, userId: 7, kind: 'lock', tabId: 'other-tab' });
      channel.postMessage({ version: 1, userId: 7, kind: 'lock', tabId: 'other-tab-2' });
      channel.postMessage({ version: 1, userId: 7, kind: 'signout', tabId: financeTabId() });
      await new Promise(resolve => setTimeout(resolve, 30));
      channel.close();
      expect(cleared).toEqual([owners[1]]);
      expect(second.componentInstance.view()).toBeNull();

      second.destroy();
      second = undefined;
      expect(disposed).toEqual([owners[0], owners[1]]);
      expect(storageAdds).toBe(storageRemoves);
      expect(stageRemoved).toEqual(stageAdded);

      session.cleared$.next();
      window.dispatchEvent(new StorageEvent('storage', { key: 'finance-vault-lock', newValue: '1' }));
      expect(cleared).toEqual([owners[1]]);
    } finally {
      first?.destroy();
      second?.destroy();
    }
  });
});
