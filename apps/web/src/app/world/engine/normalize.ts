import { canonical } from './canonical';
import { ARTIFACT, TRIP_BIOMES, WORLDGEN_VERSION, type Biome } from './constants';
import { fnv1a64, hex64 } from './fnv1a64';
import type { ApiTrip, ApiWeek, DayInput, HabitInput, Item, WeekInput } from './types';

const toMs = (d: string): number => Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10));

export const addDays = (d: string, n: number): string =>
  new Date(toMs(d) + n * 86400000).toISOString().slice(0, 10);

export const dayIndex = (weekStart: string, d: string): number =>
  Math.round((toMs(d) - toMs(weekStart)) / 86400000);

export function biomeFor(trip: ApiTrip): Biome {
  const p = trip.place;
  if (p && p.lat_e2 !== null && p.lat_e2 !== undefined) {
    const a = Math.abs(p.lat_e2);
    return a >= 5500 ? 'snow' : a >= 3500 ? 'forest' : a >= 1500 ? 'desert' : 'jungle';
  }
  const key = p && p.label ? 'place|' + p.label.normalize('NFC').trim().toLowerCase() : 'trip|' + trip.id;
  return TRIP_BIOMES[Number(fnv1a64(key) % 4n)];
}

export function normalizeWeek(api: ApiWeek): WeekInput {
  const week = api.week;
  const days: DayInput[] = [];
  for (let d = 0; d < 7; d++) {
    const date = addDays(week, d);
    const covering = (api.trips || []).filter((t) => t.start <= date && date <= t.end)
      .sort((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : a.id - b.id));
    const trip = covering[0] || null;
    const items: Item[] = [];
    for (const c of [...(api.concepts || [])].filter((c) => c.on === date).sort((a, b) => a.id - b.id)) {
      items.push({ k: 'concept', id: c.id });
    }
    for (const f of [...(api.finished || [])].filter((f) => f.on === date).sort((a, b) => a.entry_id - b.entry_id)) {
      items.push({ k: 'artifact', kind: ARTIFACT[f.kind], id: f.entry_id });
    }
    const habitDay = (api.habits || []).some((h) => h.days.includes(date));
    days.push({
      biome: trip ? biomeFor(trip) : 'meadow',
      trip: trip ? trip.id : null,
      items,
      lit: !!trip || items.length > 0 || habitDay,
    });
  }
  const habits: HabitInput[] = (api.habits || []).filter((h) => h.days.length > 0)
    .map((h) => ({
      id: h.habit_id,
      style: h.style,
      n: h.days.length,
      first: Math.min(...h.days.map((x) => dayIndex(week, x))),
    }))
    .sort((a, b) => a.id - b.id);
  return { v: WORLDGEN_VERSION, week, days, habits };
}

export const inputKey = (seed: number, input: WeekInput): string =>
  hex64(fnv1a64(seed + '|' + canonical(input)));
