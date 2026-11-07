export const TOWN_SPRITE_IDS = Object.freeze([
  'library-1', 'library-2', 'library-3',
  'inn-1', 'inn-2', 'inn-3',
  'treasury-1', 'treasury-2', 'treasury-3',
  'forge-1', 'forge-2', 'forge-3',
  'garden-1', 'garden-2', 'garden-3',
  'cottage-1', 'cottage-2', 'cottage-3',
  'clinic-1', 'clinic-2', 'clinic-3',
  'gym-1', 'gym-2', 'gym-3',
  'treasury-locked', 'clinic-locked', 'gym-locked', 'lot-empty', 'lot-locked',
] as const);

export type TownSpriteId = typeof TOWN_SPRITE_IDS[number];

export function townSpriteUrl(id: TownSpriteId): string {
  return `/town/${id}.svg`;
}

export function buildingSprite(
  kind: 'library' | 'inn' | 'treasury' | 'forge' | 'garden' | 'cottage' | 'clinic' | 'gym',
  stage: 1 | 2 | 3,
): TownSpriteId {
  return `${kind}-${stage}`;
}
