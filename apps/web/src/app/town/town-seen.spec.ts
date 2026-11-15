import { applySeen,seenKey } from './town-seen';
import type { Building,TownResponse } from './town.types';

function memory(): Storage {
  const data = new Map<string, string>();
  return {
    get length() { return data.size; },
    clear: () => data.clear(),
    getItem: key => data.get(key) ?? null,
    key: index => [...data.keys()][index] ?? null,
    removeItem: key => { data.delete(key); },
    setItem: (key, value) => { data.set(key, value); },
  };
}

function building(level = 1, source: Building['source'] = 'ok'): Building {
  return { xp: 0, level, stage: 1, level_xp_start: 0, next_level_xp: 50, today_xp: 0, today_cap: 10, source };
}

function town(patch?: {
  level?: number;
  library?: Building;
  inn?: Building;
  habits?: TownResponse['habits'];
}): TownResponse {
  return {
    town: { name: 'Terraria-on-Sea', founded_on: '2026-10-05', today: '2026-10-29', tz: 'America/Los_Angeles', xp: 340, level: patch?.level ?? 3, level_xp_start: 250, next_level_xp: 500 },
    buildings: { library: patch?.library ?? building(), inn: patch?.inn ?? building() },
    lots: [], habits: patch?.habits ?? [], archived: [], today: { done: 0, total: 0 }, constants_version: 1,
  } as TownResponse;
}

describe('town seen levels', () => {
  const current = town({ level: 3, library: building(4), inn: building(2) });

  it('skips the write when a source is unavailable and drops deleted habit keys', () => {
    const storage = memory();
    storage.setItem(seenKey(7), JSON.stringify({ town: 3, b: { library: 1, inn: 1, h99: 4, treasury: 2 } }));
    const blocked = applySeen(storage, 7, town({ library: building(1, 'unavailable') }));
    expect(blocked.toast).toBeNull();
    expect(blocked.write).toBeFalse();
    expect(storage.getItem(seenKey(7))).toContain('h99');
    const dropped = applySeen(memory(), 7, current);
    memory();
    const box = memory();
    box.setItem(seenKey(3), JSON.stringify({ town: 3, b: { library: 4, inn: 2, h99: 4 } }));
    const outcome = applySeen(box, 3, current);
    expect(outcome.toast).toBeNull();
    expect(outcome.next.b['h99']).toBeUndefined();
    expect(outcome.next.b['library']).toBe(4);
    expect(dropped.toast).toBeNull();
  });
});
