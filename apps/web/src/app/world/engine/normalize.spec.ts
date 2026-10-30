import { addDays, biomeFor, dayIndex, inputKey, normalizeWeek } from './normalize';
import { worldSeed } from './seed';
import type { ApiTrip, ApiWeek } from './types';

describe('normalize', () => {
  it('adds days in UTC, including the leap day', () => {
    expect(addDays('2026-10-26', 6)).toBe('2026-11-01');
    expect(addDays('2024-02-28', 1)).toBe('2024-02-29');
    expect(dayIndex('2026-10-26', '2026-10-29')).toBe(3);
  });

  it('maps latitude thresholds and a missing place', () => {
    const at = (lat_e2: number): ApiTrip => ({
      id: 1, start: '2026-10-26', end: '2026-10-26', place: { label: 'X', lat_e2 },
    });
    expect(biomeFor(at(5500))).toBe('snow');
    expect(biomeFor(at(3500))).toBe('forest');
    expect(biomeFor(at(1500))).toBe('desert');
    expect(biomeFor(at(1499))).toBe('jungle');
    expect(biomeFor(at(-5600))).toBe('snow');
    const noPlace: ApiTrip = { id: 9, start: '2026-10-26', end: '2026-10-26', place: null };
    expect(biomeFor(noPlace)).toBe('snow');
    expect(biomeFor({ ...noPlace, place: { label: '', lat_e2: null } })).toBe('snow');
  });

  it('matches the G1–G4 input keys', () => {
    const s1 = worldSeed(1);
    const s2 = worldSeed(2);
    const cases: { api: ApiWeek; seed1: string; seed2: string }[] = [
      {
        api: { week: '2026-10-26', trips: [], finished: [], habits: [], concepts: [] },
        seed1: '4438d297c68fae3c',
        seed2: '625f91d04ad3344f',
      },
      {
        api: {
          week: '2026-10-26',
          trips: [{ id: 41, start: '2026-10-24', end: '2026-10-29', place: { label: 'Portland, Oregon, United States', lat_e2: 4552 } }],
          finished: [{ entry_id: 9, kind: 'book', on: '2026-10-27' }, { entry_id: 3, kind: 'movie', on: '2026-10-27' }],
          habits: [
            { habit_id: 12, style: 'forge', days: ['2026-10-26', '2026-10-27', '2026-10-28', '2026-10-29', '2026-10-30'] },
            { habit_id: 15, style: 'garden', days: ['2026-10-26', '2026-10-28'] },
          ],
          concepts: [{ id: 7, on: '2026-10-28' }],
        },
        seed1: '118295419718c153',
        seed2: '9ca8b7e893d40950',
      },
      {
        api: {
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
        seed1: '35cd064b21726b31',
        seed2: '75e16f746893de34',
      },
      {
        api: {
          week: '2025-07-07',
          trips: [
            { id: 8, start: '2025-07-08', end: '2025-07-10', place: { label: 'Kyoto, Japan', lat_e2: null } },
            { id: 9, start: '2025-07-10', end: '2025-07-13', place: null },
          ],
          finished: [],
          habits: [],
          concepts: [],
        },
        seed1: '2b3d1a0e1faf7e4b',
        seed2: '59fa2bb4b3236c48',
      },
    ];
    for (const c of cases) {
      expect(inputKey(s1, normalizeWeek(c.api))).toBe(c.seed1);
      expect(inputKey(s2, normalizeWeek(c.api))).toBe(c.seed2);
    }
  });
});
