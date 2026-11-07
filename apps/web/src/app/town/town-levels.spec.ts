import { BUILDING_LV, TOWN_LV } from './town.constants';
import { level, levelProgress, stage, treasuryTier } from './town-levels';

describe('Town level math', () => {
  for (const [name, table] of [['building', BUILDING_LV], ['town', TOWN_LV]] as const) {
    table.forEach((threshold, index) => {
      it(`${name}: level ${index + 1} starts at ${threshold}`, () => {
        expect(level(threshold, table)).toBe(index + 1);
        expect(levelProgress(threshold, table)).toEqual({
          level: index + 1, start: threshold, next: table[index + 1] ?? null,
        });
      });
      if (index > 0) {
        it(`${name}: ${threshold - 1} remains level ${index}`, () => {
          expect(level(threshold - 1, table)).toBe(index);
          expect(levelProgress(threshold - 1, table)).toEqual({
            level: index, start: table[index - 1], next: threshold,
          });
        });
      }
    });
    it(`${name}: stays at max with no next threshold`, () => {
      expect(levelProgress(table[table.length - 1] + 10000, table)).toEqual({
        level: table.length, start: table[table.length - 1], next: null,
      });
    });
  }

  it('matches the specified 340 XP example', () => {
    expect(levelProgress(340, TOWN_LV)).toEqual({ level: 3, start: 250, next: 500 });
  });

  it('rejects XP below every threshold, like the server', () => {
    expect(() => level(-1, BUILDING_LV)).toThrowError(RangeError);
    expect(() => level(0, [])).toThrowError(RangeError);
  });

  for (const [lv, expected] of [[1, 1], [2, 2], [3, 2], [4, 3], [5, 3], [10, 3]] as const) {
    it(`maps level ${lv} to sprite stage ${expected}`, () => {
      expect(stage(lv)).toBe(expected);
    });
  }

  for (const [weeks, tier] of [[0, 1], [1, 2], [2, 3], [3, 3], [4, 4], [7, 4], [8, 5], [52, 5]]) {
    it(`maps ${weeks} kept weeks to treasury tier ${tier}`, () => {
      expect(treasuryTier(weeks)).toBe(tier);
    });
  }
});
