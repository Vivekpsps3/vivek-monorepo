import { DISTRICT_TILES,GUIDE_SPAWN_X,PIER_TILES } from '../town-layout';
import {
applyCamera,
type CameraLayout,
type CameraModel
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

describe('applyCamera', () => {
  const model: CameraModel = { x: 10, reduced: true };

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

});
