import { TOWN_LOTS } from '../town';
import type { TownLayoutLot, TownNpc } from './world.types';

/** Tiles of the Town district drawn at End, then the pier and sea. */
export const DISTRICT_TILES = 136;
export const PIER_TILES = 24;

/**
 * Declarative district. A lot is drawn only when its id is in TOWN_LOTS,
 * or when it is clinic/gym (Health stage sprites). Missing ids are omitted.
 * Do not append lots that are not in this table.
 */
export const TOWN_LAYOUT: readonly TownLayoutLot[] = Object.freeze([
  Object.freeze({ id: 'library', x: 8, w: 4 }),
  Object.freeze({ id: 'inn', x: 20, w: 4 }),
  Object.freeze({ id: 'treasury', x: 32, w: 4 }),
  Object.freeze({ id: 'clinic', x: 48, w: 4 }),
  Object.freeze({ id: 'gym', x: 60, w: 4 }),
  Object.freeze({ id: 'slot-0', x: 76, w: 4 }),
  Object.freeze({ id: 'slot-1', x: 84, w: 4 }),
  Object.freeze({ id: 'slot-2', x: 92, w: 4 }),
  Object.freeze({ id: 'slot-3', x: 100, w: 4 }),
  Object.freeze({ id: 'slot-4', x: 108, w: 4 }),
  Object.freeze({ id: 'slot-5', x: 116, w: 4 }),
]);

/** Founding set. Guide is the camera spawn (center of the 136-tile district). */
export const TOWN_NPCS: readonly TownNpc[] = Object.freeze([
  Object.freeze({ id: 'guide', label: 'Guide', x: 68, when: 'always' }),
  Object.freeze({ id: 'vivekbot', label: 'VivekBot', x: 16, when: 'founded' }),
  Object.freeze({ id: 'terrarian', label: 'Terrarian', x: 88, when: 'founded' }),
  Object.freeze({ id: 'manager', label: 'Manager', x: 36, when: 'founded' }),
]);

export const GUIDE_SPAWN_X = 68;

const LAYOUT_IDS = new Set(TOWN_LAYOUT.map(lot => lot.id));
const HEALTH_LOTS = new Set(['clinic', 'gym']);

/** Lots the district may draw: public Town lots, plus Clinic and Gym. */
export function presentLayoutLots(): readonly TownLayoutLot[] {
  return TOWN_LAYOUT.filter(lot => {
    if (HEALTH_LOTS.has(lot.id)) return true;
    return TOWN_LOTS.some(townLot => townLot.id === lot.id);
  });
}

export function layoutHasUnknownLot(): boolean {
  return TOWN_LAYOUT.some(lot => !LAYOUT_IDS.has(lot.id));
}
