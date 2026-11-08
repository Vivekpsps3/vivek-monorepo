import { DISTRICT_TILES, GUIDE_SPAWN_X, PIER_TILES } from '../town-layout';
import {
  applyCamera,
  bandAt,
  inertiaFactor,
  isTap,
  panDurationMs,
  prefersReducedMotion,
  scaleForWidth,
  shouldScheduleFrame,
  snapWeek,
  tileOfDay,
  type CameraLayout,
  type CameraModel,
} from './camera';

const WEEKS = ['2026-10-26', '2026-11-02'];

function layout(viewportTiles: number, weekCount = WEEKS.length): CameraLayout {
  return {
    weekCount,
    viewportTiles,
    startWeek: '2026-01-05',
    currentWeek: '2026-11-02',
    weeks: WEEKS.slice(0, weekCount),
  };
}

function total(weekCount: number): number {
  return weekCount * 56 + DISTRICT_TILES + PIER_TILES;
}

describe('camera scale, motion, and taps', () => {
  it('picks scale 2 below 1024 and scale 3 at 1024', () => {
    expect(scaleForWidth(1023)).toBe(2);
    expect(scaleForWidth(1024)).toBe(3);
    expect(scaleForWidth(0)).toBe(2);
    expect(scaleForWidth(1600)).toBe(3);
  });

  it('reads prefers-reduced-motion and falls back to the supplied matcher', () => {
    expect(prefersReducedMotion(() => true)).toBeTrue();
    expect(prefersReducedMotion(() => false)).toBeFalse();
    const seen: string[] = [];
    prefersReducedMotion((query) => {
      seen.push(query);
      return false;
    });
    expect(seen).toEqual(['(prefers-reduced-motion: reduce)']);
  });

  it('uses matchMedia when no matcher is passed', () => {
    const original = window.matchMedia.bind(window);
    window.matchMedia = ((query: string) => ({
      matches: query === '(prefers-reduced-motion: reduce)',
      media: query,
      onchange: null,
      addListener() { /* legacy */ },
      removeListener() { /* legacy */ },
      addEventListener() { /* unused */ },
      removeEventListener() { /* unused */ },
      dispatchEvent() { return false; },
    })) as typeof window.matchMedia;
    expect(prefersReducedMotion()).toBeTrue();
    window.matchMedia = original;
  });

  it('drops pan time and inertia when motion is reduced', () => {
    expect(panDurationMs(true)).toBe(0);
    expect(panDurationMs(false)).toBe(200);
    expect(inertiaFactor(true)).toBe(0);
    expect(inertiaFactor(false)).toBe(0.92);
  });

  it('treats a move under 6px as a tap', () => {
    expect(isTap(5)).toBeTrue();
    expect(isTap(5.9)).toBeTrue();
    expect(isTap(6)).toBeFalse();
    expect(isTap(0)).toBeTrue();
  });

  it('schedules a frame only while moving or dragging', () => {
    expect(shouldScheduleFrame(false, false)).toBeFalse();
    expect(shouldScheduleFrame(true, false)).toBeTrue();
    expect(shouldScheduleFrame(false, true)).toBeTrue();
    expect(shouldScheduleFrame(true, true)).toBeTrue();
  });
});

describe('snapWeek', () => {
  const start = '2026-01-05';
  const current = '2026-11-02';

  it('snaps to the UTC Monday and clamps into the loaded span', () => {
    expect(snapWeek('2026-10-12', start, current)).toBe('2026-10-12');
    expect(snapWeek('2026-11-04', start, current)).toBe('2026-11-02');
    expect(snapWeek('2026-11-01', start, current)).toBe('2026-10-26');
    expect(snapWeek('2020-01-01', start, current)).toBe(start);
    expect(snapWeek('2027-06-15', start, current)).toBe(current);
  });
});

describe('applyCamera', () => {
  const model: CameraModel = { x: 10, reduced: true };

  it('maps a day to its band origin', () => {
    expect(tileOfDay(0, 0)).toBe(0);
    expect(tileOfDay(1, 3)).toBe(56 + 24);
    expect(tileOfDay(2, 6)).toBe(112 + 48);
  });

  it('centers home and end, then clamps into the strip', () => {
    const narrow = layout(4);
    const home = applyCamera(model, { type: 'home' }, narrow);
    expect(home.x).toBe(2);
    expect(home.x + 4 / 2).toBe(4);
    expect(home.reduced).toBeTrue();

    const wideHome = applyCamera(model, { type: 'home' }, layout(40));
    expect(wideHome.x).toBe(0);

    const end = applyCamera(model, { type: 'end' }, narrow);
    const guide = narrow.weekCount * 56 + GUIDE_SPAWN_X;
    expect(end.x).toBe(guide - 2);
    expect(end.x + 2).toBe(guide);

    const clampedEnd = applyCamera(model, { type: 'end' }, layout(200, 1));
    expect(clampedEnd.x).toBe(Math.max(0, total(1) - 200));
  });

  it('steps a day, a week, and four weeks, and clamps drags', () => {
    const view = layout(4, 10);
    const max = total(10) - 4;
    expect(applyCamera(model, { type: 'band', delta: 1 }, view).x).toBe(18);
    expect(applyCamera(model, { type: 'band', delta: -1 }, view).x).toBe(2);
    expect(applyCamera({ x: 2, reduced: false }, { type: 'band', delta: -1 }, view).x).toBe(0);

    expect(applyCamera(model, { type: 'week', delta: 1 }, view).x).toBe(66);
    expect(applyCamera(model, { type: 'week', delta: -1 }, view).x).toBe(0);
    expect(applyCamera({ x: 0, reduced: false }, { type: 'week', delta: 4 }, view).x).toBe(224);
    expect(applyCamera({ x: 224, reduced: false }, { type: 'week', delta: -4 }, view).x).toBe(0);
    expect(applyCamera({ x: max - 10, reduced: false }, { type: 'week', delta: 4 }, view).x).toBe(max);

    expect(applyCamera(model, { type: 'drag', dxTiles: 2.5 }, view).x).toBe(12.5);
    expect(applyCamera(model, { type: 'drag', dxTiles: -40 }, view).x).toBe(0);
    expect(applyCamera(model, { type: 'drag', dxTiles: 10_000 }, view).x).toBe(max);
  });

  it('jumps to a snapped day and leaves select-center in place', () => {
    const view = layout(4);
    const jump = applyCamera(model, { type: 'jump', week: '2026-11-04' }, view);
    expect(jump.x + 2).toBe(56 + 4);
    const wednesday = applyCamera(model, { type: 'jump', week: '2026-11-02', day: 3 }, view);
    expect(wednesday.x + 2).toBe(56 + 24 + 4);

    const before = applyCamera(model, { type: 'jump', week: '2019-01-01', day: 0 }, view);
    expect(before.x + 2).toBe(4);

    const selected = applyCamera(model, { type: 'select-center' }, view);
    expect(selected).toEqual({ x: 10, reduced: true });
    const overflow = applyCamera({ x: 9999, reduced: false }, { type: 'select-center' }, view);
    expect(overflow.x).toBe(total(2) - 4);
  });
});

describe('bandAt', () => {
  it('names the week and day under the viewport center', () => {
    expect(bandAt(0, 8, WEEKS)).toEqual({ week: '2026-10-26', day: 0, inTown: false });
    expect(bandAt(20, 16, WEEKS)).toEqual({ week: '2026-10-26', day: 3, inTown: false });
    expect(bandAt(52, 8, WEEKS)).toEqual({ week: '2026-11-02', day: 0, inTown: false });
  });

  it('reports town for the district and the sea, using the last loaded week', () => {
    expect(bandAt(112, 8, WEEKS)).toEqual({ week: '2026-11-02', day: 6, inTown: true });
    const seaCenter = WEEKS.length * 56 + DISTRICT_TILES + 2;
    expect(bandAt(seaCenter - 5, 10, WEEKS)).toEqual({ week: '2026-11-02', day: 6, inTown: true });
    expect(bandAt(0, 8, [])).toEqual({ week: '', day: 6, inTown: true });
  });

  it('calls a wide viewport parked at the right edge Town', () => {
    const weeks = Array.from({ length: 26 }, (_, index) => `2020-01-${String(index).padStart(2, '0')}`);
    const viewport = 416;
    const end = total(weeks.length) - viewport;
    expect(bandAt(end, viewport, weeks)).toEqual({ week: weeks[25], day: 6, inTown: true });
    expect(bandAt(end - 8, viewport, weeks).inTown).toBeFalse();
    expect(bandAt(0, viewport, weeks).inTown).toBeFalse();
  });
});
