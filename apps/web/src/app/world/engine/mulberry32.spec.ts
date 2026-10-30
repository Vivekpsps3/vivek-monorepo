import { mulberry32, rngInt } from './mulberry32';

function firstUint32s(seed: number, n: number): number[] {
  const rng = mulberry32(seed);
  const out: number[] = [];
  for (let i = 0; i < n; i++) out.push(Math.floor(rng() * 2 ** 32));
  return out;
}

describe('mulberry32', () => {
  it('matches the first three outputs of seed 1', () => {
    expect(firstUint32s(1, 3)).toEqual([2693262067, 11749833, 2265367787]);
  });

  it('matches the first three outputs of seed 0', () => {
    expect(firstUint32s(0, 3)).toEqual([1144304738, 1416247, 958946056]);
  });

  it('matches the first three outputs of seed 42', () => {
    expect(firstUint32s(42, 3)).toEqual([2581720956, 1925393290, 3661312704]);
  });

  it('matches the first three outputs of seed 2^32-1', () => {
    expect(firstUint32s(4294967295, 3)).toEqual([3850105811, 813802916, 3073704848]);
  });

  it('draws rngInt from the seed-1 stream', () => {
    const rng = mulberry32(1);
    expect([rngInt(rng, 5), rngInt(rng, 5), rngInt(rng, 5), rngInt(rng, 5), rngInt(rng, 5)]).toEqual([
      3, 0, 2, 4, 4,
    ]);
  });

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
