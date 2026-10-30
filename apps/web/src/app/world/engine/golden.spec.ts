import {
  addDays,
  chunkHash,
  fnv1a64,
  generateChunk,
  hex64,
  inputKey,
  mulberry32,
  normalizeWeek,
  rngInt,
  worldSeed,
  type ApiWeek,
  type Chunk,
} from './index';
import { HASHES, SPOT, V } from './testing/golden.fixtures';

const NAMES = ['G1_empty', 'G2_full', 'G3_overflow', 'G4_nolatlng'] as const;

describe('worldgen golden', () => {
  const s1 = worldSeed(1);
  const s2 = worldSeed(2);

  it('matches every G1–G4 input key and chunk hash', () => {
    expect(s1).toBe(984759769);
    expect(s2).toBe(984752576);
    for (const name of NAMES) {
      const input = normalizeWeek(V[name]);
      const hashes = HASHES[name];
      expect(inputKey(s1, input)).withContext(`${name} seed1 inputKey`).toBe(hashes.seed1.inputKey);
      expect(chunkHash(generateChunk(s1, input))).withContext(`${name} seed1 chunkHash`).toBe(hashes.seed1.chunkHash);
      expect(inputKey(s2, input)).withContext(`${name} seed2 inputKey`).toBe(hashes.seed2.inputKey);
      expect(chunkHash(generateChunk(s2, input))).withContext(`${name} seed2 chunkHash`).toBe(hashes.seed2.chunkHash);
    }
  });

  it('matches the seed-1 spot checks', () => {
    for (const name of NAMES) {
      const chunk = generateChunk(s1, normalizeWeek(V[name]));
      const spot = SPOT[name];
      expect(chunk.biomes).withContext(name).toEqual(spot.biomes);
      expect(chunk.lit).withContext(name).toEqual(spot.lit);
      expect(chunk.structures).withContext(name).toEqual(spot.structures);
      expect(chunk.props).withContext(name).toEqual(spot.props);
      expect(chunk.decor.length).withContext(name).toBe(spot.decor);
      expect(chunk.heights.join('')).withContext(name).toBe(spot.heights);
    }
  });

  it('repeats the same chunk hash for the same input', () => {
    const once = chunkHash(generateChunk(s1, normalizeWeek(V.G2_full)));
    const twice = chunkHash(generateChunk(s1, normalizeWeek(structuredClone(V.G2_full))));
    expect(twice).toBe(once);
  });

  it('ignores finished, habit, concept, and trip array order', () => {
    const base = structuredClone(V.G2_full);
    base.concepts.push({ id: 3, on: '2026-10-28' });
    expect(base.concepts.map((concept) => concept.on)).toEqual(['2026-10-28', '2026-10-28']);
    const shuffled = structuredClone(base);
    shuffled.finished.reverse();
    shuffled.habits.reverse();
    shuffled.concepts.reverse();
    shuffled.trips.reverse();
    const original = chunkHash(generateChunk(s1, normalizeWeek(base)));
    expect(chunkHash(generateChunk(s1, normalizeWeek(shuffled)))).toBe(original);
  });

  it('ignores a trip title', () => {
    const renamed = structuredClone(V.G2_full);
    renamed.trips[0].title = 'PDX!';
    const original = chunkHash(generateChunk(s1, normalizeWeek(V.G2_full)));
    expect(chunkHash(generateChunk(s1, normalizeWeek(renamed)))).toBe(original);
  });

  it('moves a concept into only the destination week', () => {
    const weeks = ['2026-10-19', '2026-10-26', '2026-11-02', '2026-11-09'] as const;
    const changed = new Set<string>(['2026-10-26', '2026-11-02']);

    function at(week: string, moved: boolean): ApiWeek {
      if (week === '2026-10-26') {
        if (!moved) return V.G2_full;
        const api = structuredClone(V.G2_full);
        api.concepts = [];
        return api;
      }
      if (moved && week === '2026-11-02') {
        return { week, trips: [], finished: [], habits: [], concepts: [{ id: 7, on: '2026-11-03' }] };
      }
      return { week, trips: [], finished: [], habits: [], concepts: [] };
    }

    for (const week of weeks) {
      const beforeIn = normalizeWeek(at(week, false));
      const afterIn = normalizeWeek(at(week, true));
      const beforeKey = inputKey(s1, beforeIn);
      const afterKey = inputKey(s1, afterIn);
      const beforeHash = chunkHash(generateChunk(s1, beforeIn));
      const afterHash = chunkHash(generateChunk(s1, afterIn));
      if (changed.has(week)) {
        expect(afterKey).withContext(`${week} inputKey`).not.toBe(beforeKey);
        expect(afterHash).withContext(`${week} chunkHash`).not.toBe(beforeHash);
      } else {
        expect(afterKey).withContext(`${week} inputKey`).toBe(beforeKey);
        expect(afterHash).withContext(`${week} chunkHash`).toBe(beforeHash);
      }
    }
  });

  it('keeps heights outside leveled footprints', () => {
    const g1 = generateChunk(s1, normalizeWeek(V.G1_empty));
    const g2 = generateChunk(s1, normalizeWeek(V.G2_full));
    const covered = new Array<boolean>(56).fill(false);
    for (const s of g2.structures) {
      for (let x = s.x; x < s.x + 4; x++) covered[x] = true;
    }
    for (const p of g2.props) {
      for (let x = p.x; x < p.x + 2; x++) covered[x] = true;
    }
    let compared = 0;
    for (let x = 0; x < 56; x++) {
      if (covered[x]) continue;
      compared++;
      expect(g1.heights[x]).withContext(`x ${x}`).toBe(g2.heights[x]);
    }
    expect(compared).toBeGreaterThan(0);
  });

  it('matches the 500-case reference digest', () => {
    const rng = mulberry32(20261029);
    const ri = (n: number) => rngInt(rng, n);
    const LABELS = ['Portland, Oregon, United States', 'Kyoto, Japan', 'Reykjavík, Iceland', ''];
    const KINDS = ['book', 'movie', 'tv', 'game'] as const;
    const STYLES = ['forge', 'garden', 'cottage'] as const;
    const hashes: string[] = [];
    for (let i = 0; i < 500; i++) {
      const week = addDays('2026-01-05', 7 * ri(200));
      const day = () => addDays(week, ri(7));
      const trips = Array.from({ length: ri(4) }, (_, j) => {
        const s = addDays(week, ri(10) - 3);
        return {
          id: j + 1,
          start: s,
          end: addDays(s, ri(6)),
          place: ri(3) === 0 ? null : {
            label: LABELS[ri(4)],
            lat_e2: ri(2) ? null : ri(18001) - 9000,
          },
        };
      });
      const finished = Array.from({ length: ri(13) }, (_, j) => ({
        entry_id: j + 1,
        kind: KINDS[ri(4)],
        on: day(),
      }));
      const habits = Array.from({ length: ri(10) }, (_, j) => ({
        habit_id: j + 1,
        style: STYLES[ri(3)],
        days: [...new Set(Array.from({ length: ri(8) }, day))].sort(),
      }));
      const concepts = Array.from({ length: ri(7) }, (_, j) => ({ id: j + 1, on: day() }));
      const seed = worldSeed(1 + ri(1000));
      const chunk = generateChunk(seed, normalizeWeek({ week, trips, finished, habits, concepts }));
      expect(boundsProblem(chunk)).withContext(`case ${i}`).toBeNull();
      hashes.push(chunkHash(chunk));
    }
    expect(hashes.length).toBe(500);
    expect(hex64(fnv1a64(hashes.join(',')))).toBe('2af3a486b05dc953');
  }, 60000);
});

function boundsProblem(chunk: Chunk): string | null {
  if (chunk.heights.length !== 56) return `heights ${chunk.heights.length}`;
  for (let x = 0; x < chunk.heights.length; x++) {
    const h = chunk.heights[x];
    if (h < 12 || h > 19) return `height ${x}=${h}`;
  }
  if (chunk.heights[0] !== 16 || chunk.heights[1] !== 16 || chunk.heights[54] !== 16 || chunk.heights[55] !== 16) {
    return 'edges';
  }
  for (let p = 0; p < chunk.props.length; p++) {
    const prop = chunk.props[p];
    if (prop.x + 2 > 54) return `prop bound ${prop.x}`;
    if (p > 0 && prop.x < chunk.props[p - 1].x) return `prop sort ${prop.x}`;
    if (p > 0 && chunk.props[p - 1].x + 2 > prop.x) return `prop overlap ${chunk.props[p - 1].x},${prop.x}`;
  }
  for (const s of chunk.structures) {
    if (s.x + 4 > 54) return `structure ${s.x}`;
  }
  for (const d of chunk.decor) {
    if (d.x < 2 || d.x > 53) return `decor ${d.x}`;
  }
  return null;
}
