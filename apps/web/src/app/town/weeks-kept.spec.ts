import { weeksKeptRun } from './weeks-kept';

describe('weeksKeptRun', () => {
  it('uses the longest Town story run and converts day streaks by sevens', () => {
    expect(weeksKeptRun([])).toBe(0);
    expect(weeksKeptRun([
      { streak: { unit: 'days', current: 13 } },
      { streak: { unit: 'weeks', current: 4 } },
      { streak: { unit: 'days', current: 0 } },
    ])).toBe(4);
  });
});
