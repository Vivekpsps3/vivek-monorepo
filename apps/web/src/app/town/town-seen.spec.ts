import { applySeen, detectLevelUps, seenKey, type SeenLevels } from './town-seen';
import type { Building, TownResponse } from './town.types';

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

function habit(id: number, level: number, style: 'forge' | 'garden' | 'cottage', slot: number): TownResponse['habits'][number] {
  return { id, level, building_style: style, slot, name: 'Habit' } as TownResponse['habits'][number];
}

describe('town seen levels', () => {
  const current = town({ level: 3, library: building(4), inn: building(2) });

  it('writes the current levels silently when the key is missing or unparsable', () => {
    const blank = memory();
    expect(applySeen(blank, 7, current).toast).toBeNull();
    expect(JSON.parse(blank.getItem(seenKey(7))!)).toEqual({ town: 3, b: { library: 4, inn: 2 } });
    const broken = memory();
    broken.setItem(seenKey(7), '{');
    expect(applySeen(broken, 7, current).toast).toBeNull();
    expect(JSON.parse(broken.getItem(seenKey(7))!).town).toBe(3);
    broken.setItem(seenKey(7), JSON.stringify({ town: '3' }));
    expect(applySeen(broken, 7, current).toast).toBeNull();
  });

  it('toasts one building, or town then buildings in lot order', () => {
    const seen: SeenLevels = { town: 3, b: { library: 2, inn: 2 } };
    expect(detectLevelUps(seen, current).toast).toBe('Library reached Lv 4.');
    const several = town({
      level: 4,
      library: building(4),
      habits: [habit(15, 2, 'garden', 1), habit(12, 2, 'forge', 0)],
    });
    expect(detectLevelUps({ town: 3, b: { library: 4, inn: 1, h12: 1, h15: 1 } }, several).toast)
      .toBe('Level up! Terraria-on-Sea Lv 4 · Forge Lv 2 · Garden Lv 2');
  });

  it('adds the lot suffix, swaps only a stage change, and lowers downs silently', () => {
    const up = detectLevelUps({ town: 2, b: { library: 1, inn: 1 } }, town({ level: 3, library: building(2) }));
    expect(up.toast).toBe('Level up! Terraria-on-Sea Lv 3 · Library Lv 2 · New lot unlocked');
    expect(up.swaps).toEqual([{ key: 'library', from: 'library-1' }]);
    const sameStage = detectLevelUps({ town: 3, b: { library: 2, inn: 1 } }, town({ library: building(3) }));
    expect(sameStage.toast).toBe('Library reached Lv 3.');
    expect(sameStage.swaps).toEqual([]);
    const down = detectLevelUps({ town: 5, b: { library: 4, inn: 2, treasury: 3 } }, town({ level: 4, library: building(3) }));
    expect(down.toast).toBeNull();
    expect(down.next.town).toBe(4);
    expect(down.next.b['library']).toBe(3);
    expect(down.next.b['treasury']).toBe(3);
  });

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
