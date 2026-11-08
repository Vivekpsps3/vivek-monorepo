import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Subject } from 'rxjs';
import { SpriteAtlas } from '../render/atlas';
import { WORLD_COPY, type ChestOverlay, type LoadedChunk, type WorldWeek } from '../world.types';
import { SessionService } from '../../platform/session.service';
import type { TownResponse } from '../../town/town.types';
import { WorldApi } from '../data/world-api';
import { cameraApi, renderApi, WORLD_CONTROLLER, WorldComponent, type ExplorerController, type WorldView } from './world.component';

const NEWEST = '2026-10-26';

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
  let frames: FrameRequestCallback[];
  let rafSpy: jasmine.Spy;
  let renderSpy: jasmine.Spy;
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
    frames = [];
    rafSpy = spyOn(window, 'requestAnimationFrame').and.callFake((callback: FrameRequestCallback) => {
      frames.push(callback);
      return frames.length;
    });
    spyOn(window, 'cancelAnimationFrame').and.stub();
    renderSpy = spyOn(renderApi, 'renderChunkBitmap').and.callFake(() => undefined);

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

  function region(): HTMLElement {
    const found = fixture.nativeElement.querySelector('[role="region"][aria-label="World"]');
    if (!(found instanceof HTMLElement)) throw new Error('missing world region');
    return found;
  }

  function press(key: string, shiftKey = false): void {
    region().dispatchEvent(new KeyboardEvent('keydown', { key, shiftKey, bubbles: true, cancelable: true }));
  }

  function pointer(type: string, x: number): void {
    region().dispatchEvent(new PointerEvent(type, {
      clientX: x,
      clientY: 24,
      pointerId: 1,
      button: 0,
      bubbles: true,
      cancelable: true,
    }));
  }

  it('sends keyboard deltas to the camera', async () => {
    const apply = spyOn(cameraApi, 'apply').and.callThrough();
    await setup();
    apply.calls.reset();
    press('ArrowRight');
    press('ArrowLeft');
    press('ArrowRight', true);
    press('ArrowLeft', true);
    press('PageDown');
    press('PageUp');
    press('Home');
    press('End');
    press('Enter');
    press(' ');
    expect(apply.calls.allArgs().map(args => args[1])).toEqual([
      { type: 'band', delta: 1 },
      { type: 'band', delta: -1 },
      { type: 'week', delta: 1 },
      { type: 'week', delta: -1 },
      { type: 'week', delta: 4 },
      { type: 'week', delta: -4 },
      { type: 'home' },
      { type: 'end' },
      { type: 'select-center' },
      { type: 'select-center' },
    ]);
  });

  it('opens on the list under reduced motion and does not coast', async () => {
    await setup({ reduced: true });
    expect(fixture.nativeElement.dataset['view']).toBe('list');
    expect(fixture.nativeElement.textContent).toContain(WORLD_COPY.reducedMotionNote);
    rafSpy.calls.reset();
    pointer('pointerdown', 10);
    pointer('pointermove', 80);
    const scheduled = rafSpy.calls.count();
    expect(scheduled).toBeGreaterThan(0);
    pointer('pointerup', 80);
    expect(rafSpy.calls.count()).toBe(scheduled);
    while (frames.length) frames.shift()?.(performance.now());
    expect(rafSpy.calls.count()).toBe(scheduled);
  });

  it('does not schedule a frame while idle', async () => {
    await setup();
    rafSpy.calls.reset();
    frames.length = 0;
    fixture.detectChanges();
    expect(rafSpy).not.toHaveBeenCalled();
    expect(frames).toEqual([]);
  });

  it('toggles fog without refetching weeks', async () => {
    await setup();
    const button = [...fixture.nativeElement.querySelectorAll('button')].find(candidate =>
      candidate.textContent?.includes(WORLD_COPY.litMap));
    expect(button).toBeTruthy();
    button.click();
    fixture.detectChanges();
    expect(controller.refetchWeeks).not.toHaveBeenCalled();
    expect(controller.applyConceptEdit).not.toHaveBeenCalled();
    expect(controller.loadInitial).toHaveBeenCalledTimes(1);
    expect(controller.setFog).toHaveBeenCalledWith(false);
  });

  it('does not print money in the budget line', async () => {
    await setup();
    const nodes = fixture.nativeElement.querySelectorAll('[data-budget]');
    expect(nodes.length).toBeGreaterThan(0);
    for (const node of nodes) {
      expect(node.textContent ?? '').not.toMatch(/\$\d|\b\d+\.\d{2}\b/);
      expect(node.textContent).toContain(WORLD_COPY.withinPlan);
    }
  });

  it('creates at most two chunk bitmaps in any drag frame', async () => {
    // Deterministic stand-in for the 3s / 104-week drag. A 16.7ms p95 trace
    // needs a dedicated Chromium run; this asserts the per-frame create cap.
    await setup({ weeks: 104 });
    while (frames.length) frames.shift()?.(performance.now());
    renderSpy.calls.reset();
    const perFrame: number[] = [];
    const drain = () => {
      let guard = 0;
      while (frames.length && guard < 20) {
        guard += 1;
        const before = renderSpy.calls.count();
        frames.shift()?.(performance.now());
        perFrame.push(renderSpy.calls.count() - before);
      }
    };
    pointer('pointerdown', 0);
    pointer('pointermove', 40);
    drain();
    pointer('pointermove', 900);
    drain();
    pointer('pointermove', 1800);
    drain();
    pointer('pointerup', 1800);
    drain();
    expect(perFrame.length).toBeGreaterThan(0);
    expect(perFrame.every(count => count <= 2)).toBeTrue();
    expect(perFrame.reduce((sum, count) => sum + count, 0)).toBeGreaterThan(2);
    expect(mondayWeeksBack(0)).toBe(NEWEST);
  });
});
