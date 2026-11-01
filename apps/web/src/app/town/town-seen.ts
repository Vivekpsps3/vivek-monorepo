import { LOT_UNLOCK_LV, TOWN_NAME } from './town.constants';
import { stage } from './town-levels';
import { buildingSprite, type TownSpriteId } from './town-sprites';
import type { TownResponse } from './town.types';

/** Treasury, clinic and gym stay for later lanes. Habit keys that disappeared are dropped. */
const PRESERVED_KEYS = ['treasury', 'clinic', 'gym'] as const;
const STYLE_NAME = { forge: 'Forge', garden: 'Garden', cottage: 'Cottage' } as const;

export interface SeenLevels {
  town: number;
  b: Record<string, number>;
}

export interface SpriteSwap {
  key: string;
  from: TownSpriteId;
}

export interface SeenOutcome {
  toast: string | null;
  swaps: SpriteSwap[];
  next: SeenLevels;
  write: boolean;
}

interface BuildingNow {
  key: string;
  name: string;
  level: number;
  kind: 'library' | 'inn' | 'forge' | 'garden' | 'cottage';
}

export function seenKey(userId: number): string {
  return `town.seen.v1.${userId}`;
}

export function readSeen(storage: Storage, userId: number): SeenLevels | null {
  const raw = storage.getItem(seenKey(userId));
  if (raw == null) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<SeenLevels> | null;
    if (!parsed || typeof parsed.town !== 'number' || !parsed.b || typeof parsed.b !== 'object' || Array.isArray(parsed.b)) return null;
    return { town: parsed.town, b: parsed.b };
  } catch {
    return null;
  }
}

function buildings(town: TownResponse): BuildingNow[] {
  const habits = [...town.habits].sort((a, b) => (a.slot ?? 0) - (b.slot ?? 0));
  return [
    { key: 'library', name: 'Library', level: town.buildings.library.level, kind: 'library' },
    { key: 'inn', name: 'Inn', level: town.buildings.inn.level, kind: 'inn' },
    ...habits.map(habit => ({
      key: `h${habit.id}`,
      name: STYLE_NAME[habit.building_style],
      level: habit.level,
      kind: habit.building_style,
    })),
  ];
}

function nextLevels(seen: SeenLevels | null, town: TownResponse, views: BuildingNow[]): SeenLevels {
  const next: SeenLevels = { town: town.town.level, b: {} };
  for (const view of views) next.b[view.key] = view.level;
  if (!seen) return next;
  for (const key of PRESERVED_KEYS) {
    const level = seen.b[key];
    if (typeof level === 'number') next.b[key] = level;
  }
  return next;
}

/** Pure level-up step. `write: false` means the caller must leave storage untouched. */
export function detectLevelUps(seen: SeenLevels | null, town: TownResponse): SeenOutcome {
  const views = buildings(town);
  const next = nextLevels(seen, town, views);
  const blocked = town.buildings.library.source === 'unavailable' || town.buildings.inn.source === 'unavailable';
  if (blocked) return { toast: null, swaps: [], next, write: false };
  if (!seen) return { toast: null, swaps: [], next, write: true };

  const ups: { name: string; level: number; town: boolean }[] = [];
  if (town.town.level > seen.town) ups.push({ name: TOWN_NAME, level: town.town.level, town: true });
  const swaps: SpriteSwap[] = [];
  for (const view of views) {
    const previous = seen.b[view.key];
    if (typeof previous !== 'number' || view.level <= previous) continue;
    ups.push({ name: view.name, level: view.level, town: false });
    if (stage(view.level) !== stage(previous)) {
      swaps.push({ key: view.key, from: buildingSprite(view.kind, stage(previous)) });
    }
  }
  let toast: string | null = null;
  if (ups.length === 1 && ups[0].town) toast = `${TOWN_NAME} reached Lv ${ups[0].level}!`;
  else if (ups.length === 1) toast = `${ups[0].name} reached Lv ${ups[0].level}.`;
  else if (ups.length > 1) toast = `Level up! ${ups.map(up => `${up.name} Lv ${up.level}`).join(' · ')}`;
  const unlocked = seen.town < town.town.level && LOT_UNLOCK_LV.some(level => level > seen.town && level <= town.town.level);
  if (toast && unlocked) toast += ' · New lot unlocked';
  return { toast, swaps, next, write: true };
}

export function applySeen(storage: Storage, userId: number, town: TownResponse): SeenOutcome {
  const outcome = detectLevelUps(readSeen(storage, userId), town);
  if (outcome.write) storage.setItem(seenKey(userId), JSON.stringify(outcome.next));
  return outcome;
}
