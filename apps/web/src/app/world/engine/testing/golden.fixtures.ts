import type { Biome } from '../constants';
import type { ApiWeek, Prop, Structure } from '../types';

export const V: {
  G1_empty: ApiWeek;
  G2_full: ApiWeek;
  G3_overflow: ApiWeek;
  G4_nolatlng: ApiWeek;
} = {
  G1_empty: { week: '2026-10-26', trips: [], finished: [], habits: [], concepts: [] },
  G2_full: {
    week: '2026-10-26',
    trips: [{ id: 41, start: '2026-10-24', end: '2026-10-29', place: { label: 'Portland, Oregon, United States', lat_e2: 4552 } }],
    finished: [{ entry_id: 9, kind: 'book', on: '2026-10-27' }, { entry_id: 3, kind: 'movie', on: '2026-10-27' }],
    habits: [
      { habit_id: 12, style: 'forge', days: ['2026-10-26', '2026-10-27', '2026-10-28', '2026-10-29', '2026-10-30'] },
      { habit_id: 15, style: 'garden', days: ['2026-10-26', '2026-10-28'] },
    ],
    concepts: [{ id: 7, on: '2026-10-28' }],
  },
  G3_overflow: {
    week: '2026-11-02',
    trips: [],
    habits: [],
    concepts: [{ id: 1, on: '2026-11-08' }, { id: 2, on: '2026-11-08' }],
    finished: [
      { entry_id: 5, kind: 'tv', on: '2026-11-08' },
      { entry_id: 6, kind: 'game', on: '2026-11-08' },
      { entry_id: 4, kind: 'book', on: '2026-11-08' },
    ],
  },
  G4_nolatlng: {
    week: '2025-07-07',
    trips: [
      { id: 8, start: '2025-07-08', end: '2025-07-10', place: { label: 'Kyoto, Japan', lat_e2: null } },
      { id: 9, start: '2025-07-10', end: '2025-07-13', place: null },
    ],
    finished: [],
    habits: [],
    concepts: [],
  },
};

export const HASHES = {
  G1_empty: {
    seed1: { inputKey: '4438d297c68fae3c', chunkHash: 'b4b380d9f9545ecf' },
    seed2: { inputKey: '625f91d04ad3344f', chunkHash: 'de0739fc578e6571' },
  },
  G2_full: {
    seed1: { inputKey: '118295419718c153', chunkHash: '6a3789f903e7f4c5' },
    seed2: { inputKey: '9ca8b7e893d40950', chunkHash: '32d49b4100d24051' },
  },
  G3_overflow: {
    seed1: { inputKey: '35cd064b21726b31', chunkHash: '9b3e2928140e9907' },
    seed2: { inputKey: '75e16f746893de34', chunkHash: '122e12acc1b547c5' },
  },
  G4_nolatlng: {
    seed1: { inputKey: '2b3d1a0e1faf7e4b', chunkHash: '54c2eaaa82dc8248' },
    seed2: { inputKey: '59fa2bb4b3236c48', chunkHash: '466b43d5d89726e6' },
  },
};

export interface SeedSpot {
  decor: number;
  biomes: Biome[];
  lit: boolean[];
  structures: Structure[];
  props: Prop[];
  heights: string;
}

const meadow: Biome[] = ['meadow', 'meadow', 'meadow', 'meadow', 'meadow', 'meadow', 'meadow'];

export const SPOT: {
  G1_empty: SeedSpot;
  G2_full: SeedSpot;
  G3_overflow: SeedSpot;
  G4_nolatlng: SeedSpot;
} = {
  G1_empty: {
    decor: 6,
    biomes: meadow,
    lit: [false, false, false, false, false, false, false],
    structures: [],
    props: [],
    heights: '1616161615151515151515151615151515161616151414141413131313131312121212121312121212131314141415151414151616161616',
  },
  G2_full: {
    decor: 7,
    biomes: ['forest', 'forest', 'forest', 'forest', 'meadow', 'meadow', 'meadow'],
    lit: [true, true, true, true, true, false, false],
    structures: [
      { x: 2, sprite: 'forge-2', habit: 12 },
      { x: 10, sprite: 'garden-1', habit: 15 },
    ],
    props: [
      { x: 8, k: 'artifact', kind: 'reel', id: 3 },
      { x: 10, k: 'artifact', kind: 'tome', id: 9 },
      { x: 16, k: 'concept', id: 7 },
    ],
    heights: '1616161616161515151515151515151515151616151414141413131313131312121212121312121212131314141415151414151616161616',
  },
  G3_overflow: {
    decor: 8,
    biomes: meadow,
    lit: [false, false, false, false, false, false, true],
    structures: [],
    props: [
      { x: 48, k: 'concept', id: 1 },
      { x: 50, k: 'concept', id: 2 },
      { x: 52, k: 'pile', n: 3 },
    ],
    heights: '1616151514141414141414141413131312131213131415151515151515141414131415161717171718191918181817161616161616161616',
  },
  G4_nolatlng: {
    decor: 13,
    biomes: ['meadow', 'forest', 'forest', 'forest', 'snow', 'snow', 'snow'],
    lit: [false, true, true, true, true, true, true],
    structures: [],
    props: [],
    heights: '1616171716171818191919191919191818191818191919191919191918181819191817171817171717171717161616161615161616161616',
  },
};
