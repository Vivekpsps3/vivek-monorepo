import { treasuryUnlocked } from './town-levels';

describe('Town level math', () => {
  it('shows the treasury tier as the level and the stage of that tier', () => {
    expect(treasuryUnlocked(0)).toEqual({ level: 1, stage: 1 });
    expect(treasuryUnlocked(2)).toEqual({ level: 3, stage: 2 });
    expect(treasuryUnlocked(4)).toEqual({ level: 4, stage: 3 });
    expect(treasuryUnlocked(8)).toEqual({ level: 5, stage: 3 });
    expect(treasuryUnlocked(-4)).toEqual({ level: 1, stage: 1 });
  });
});
