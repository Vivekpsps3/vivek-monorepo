import { canonical } from './canonical';
import {
  BAND,
  CHEST_X,
  CHUNK_W,
  DECOR,
  DENSITY,
  GROUND,
  H_MAX,
  H_MIN,
  WORLDGEN_VERSION,
} from './constants';
import { fnv1a64, hex64, seed32 } from './fnv1a64';
import { mulberry32, rngInt } from './mulberry32';
import type { Chunk, Decor, HabitSpriteId, Prop, Structure, WeekInput } from './types';

export function generateChunk(seed: number, input: WeekInput): Chunk {
  const week = input.week;
  const biomes = input.days.map((d) => d.biome);
  const tr = mulberry32(seed32(fnv1a64(`terrain|v${WORLDGEN_VERSION}|${seed}|${week}`)));
  const h = new Array<number>(CHUNK_W).fill(GROUND);
  for (let x = 2; x <= 49; x++) {
    const delta = [-1, 0, 0, 0, 1][rngInt(tr, 5)];
    h[x] = Math.min(H_MAX, Math.max(H_MIN, h[x - 1] + delta));
  }
  for (let x = 50; x <= 53; x++) h[x] = h[x - 1] + Math.sign(GROUND - h[x - 1]);
  const occupied = new Array<boolean>(CHUNK_W).fill(false);
  const level = (x0: number, w: number): void => {
    for (let i = x0; i < x0 + w; i++) {
      h[i] = h[x0];
      occupied[i] = true;
    }
  };
  const structures: Structure[] = [];
  const usedBands = new Set<number>();
  let structuresOverflow = 0;
  for (const hb of input.habits) {
    let placed = false;
    for (let i = 0; i < 7; i++) {
      const b = (hb.first + i) % 7;
      if (usedBands.has(b)) continue;
      usedBands.add(b);
      const stage: 1 | 2 | 3 = hb.n <= 2 ? 1 : hb.n <= 5 ? 2 : 3;
      const sprite: HabitSpriteId = `${hb.style}-${stage}`;
      structures.push({ x: b * BAND + 2, sprite, habit: hb.id });
      level(b * BAND + 2, 4);
      placed = true;
      break;
    }
    if (!placed) structuresOverflow++;
  }
  const props: Prop[] = [];
  for (let d = 0; d < 7; d++) {
    const slots = d === 6 ? [48, 50, 52] : [0, 2, 4, 6].map((o) => d * BAND + o);
    const items = input.days[d].items;
    const fits = items.length <= slots.length;
    const shown = fits ? items : items.slice(0, slots.length - 1);
    shown.forEach((it, i) => {
      props.push({ x: slots[i], ...it });
    });
    if (!fits) props.push({ x: slots[slots.length - 1], k: 'pile', n: items.length - shown.length });
  }
  for (const p of props) level(p.x, 2);
  level(CHEST_X, 2);
  const dr = mulberry32(seed32(fnv1a64(`decor|v${WORLDGEN_VERSION}|${seed}|${week}|${biomes.join(',')}`)));
  const decor: Decor[] = [];
  let last = -99;
  for (let x = 2; x <= 53; x++) {
    const r = dr();
    const b = biomes[Math.floor(x / BAND)];
    if (!occupied[x] && x - last >= 3 && r < DENSITY[b]) {
      decor.push({ x, kind: DECOR[b][rngInt(dr, DECOR[b].length)] });
      last = x;
    }
  }
  props.sort((a, b) => a.x - b.x);
  return {
    v: WORLDGEN_VERSION,
    week,
    heights: h,
    biomes,
    trips: input.days.map((d) => d.trip),
    lit: input.days.map((d) => d.lit),
    structures,
    structuresOverflow,
    props,
    decor,
    chest: { x: CHEST_X },
  };
}

export const chunkHash = (chunk: Chunk): string => hex64(fnv1a64(canonical(chunk)));
