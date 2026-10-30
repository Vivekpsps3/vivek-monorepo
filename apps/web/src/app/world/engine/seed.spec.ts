import { worldSeed } from './seed';

describe('worldSeed', () => {
  it('folds the versioned user key for users 1 and 2', () => {
    expect(worldSeed(1)).toBe(984759769);
    expect(worldSeed(2)).toBe(984752576);
  });
});
