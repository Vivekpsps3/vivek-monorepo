// Server values are authoritative; these literals are checked by the parity test.
export const TOWN_NAME = Object.freeze('Terraria-on-Sea' as const);
export const XP = Object.freeze({
  manual: 10, mediaEpisode: 5, mediaFinished: 10,
  travelReminder: 5, tripDone: 30, streak7: 10,
} as const);
export const DAILY_CAP = Object.freeze({ library: 10, inn: 15 } as const);
export const BUILDING_LV = Object.freeze([0, 50, 150, 400, 1000] as const);
export const TOWN_LV = Object.freeze([0, 100, 250, 500, 900, 1400, 2000, 2800, 3800, 5000] as const);
export const LOT_UNLOCK_LV = Object.freeze([1, 1, 3, 5, 7, 9] as const);
export const TREASURY_WEEKS = Object.freeze([0, 1, 2, 4, 8] as const);
export const MEDIA_FINISHED_KINDS = Object.freeze(['movie', 'tv', 'book', 'game'] as const);
export const HABIT_NAME_MAX = Object.freeze(40 as const);
export const HABIT_TOTAL_MAX = Object.freeze(200 as const);
export const CHECKIN_WINDOW = Object.freeze([-1, 1] as const);
export const SLOT_DEFAULT_STYLE = Object.freeze([
  'forge', 'garden', 'cottage', 'cottage', 'cottage', 'cottage',
] as const);
export const FIXED_LOTS = Object.freeze(['library', 'inn', 'treasury'] as const);
// Core lots only. Treasury is vault; every other lot uses the §20.2 privacy default 'server'.
// Building type is not a lot property. Fixed lots always exist, so unlockLevel is null.
export const TOWN_LOTS = Object.freeze([
  Object.freeze({ id: 'library', kind: 'fixed', unlockLevel: null, privacy: 'server' } as const),
  Object.freeze({ id: 'inn', kind: 'fixed', unlockLevel: null, privacy: 'server' } as const),
  Object.freeze({ id: 'treasury', kind: 'fixed', unlockLevel: null, privacy: 'vault' } as const),
  Object.freeze({ id: 'slot-0', kind: 'slot', unlockLevel: LOT_UNLOCK_LV[0], privacy: 'server' } as const),
  Object.freeze({ id: 'slot-1', kind: 'slot', unlockLevel: LOT_UNLOCK_LV[1], privacy: 'server' } as const),
  Object.freeze({ id: 'slot-2', kind: 'slot', unlockLevel: LOT_UNLOCK_LV[2], privacy: 'server' } as const),
  Object.freeze({ id: 'slot-3', kind: 'slot', unlockLevel: LOT_UNLOCK_LV[3], privacy: 'server' } as const),
  Object.freeze({ id: 'slot-4', kind: 'slot', unlockLevel: LOT_UNLOCK_LV[4], privacy: 'server' } as const),
  Object.freeze({ id: 'slot-5', kind: 'slot', unlockLevel: LOT_UNLOCK_LV[5], privacy: 'server' } as const),
] as const);
export const TOWN_CONSTANTS_VERSION = Object.freeze(1 as const);
