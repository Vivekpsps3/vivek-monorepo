import { mulberry32 } from './mulberry32';

describe('mulberry32', () => {

  it('stays inside [0, 1) for the reference seeds', () => {
    for (const seed of [0, 1, 42, 4294967295]) {
      const rng = mulberry32(seed);
      for (let i = 0; i < 32; i++) {
        const x = rng();
        expect(x).toBeGreaterThanOrEqual(0);
        expect(x).toBeLessThan(1);
      }
    }
  });
});
