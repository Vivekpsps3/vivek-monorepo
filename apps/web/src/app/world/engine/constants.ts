export const WORLDGEN_VERSION = 1;
export const CHUNK_W = 56;
export const CHUNK_H = 24;
export const BAND = 8;
export const GROUND = 16;
export const H_MIN = 12;
export const H_MAX = 19;
export const CHEST_X = 54;

export const BIOMES = ['meadow', 'forest', 'snow', 'desert', 'jungle'] as const;
export type Biome = (typeof BIOMES)[number];

export const TRIP_BIOMES = ['forest', 'snow', 'desert', 'jungle'] as const;
export type TripBiome = (typeof TRIP_BIOMES)[number];

export const DECOR = {
  meadow: ['flower', 'flower', 'rock', 'oak'],
  forest: ['oak', 'oak', 'pine', 'rock'],
  snow: ['pine', 'pine', 'rock', 'snowrock'],
  desert: ['cactus', 'cactus', 'rock', 'bones'],
  jungle: ['palm', 'palm', 'fern', 'flower'],
} as const;
export type DecorKind = (typeof DECOR)[Biome][number];

export const DENSITY = { meadow: 0.18, forest: 0.40, snow: 0.30, desert: 0.20, jungle: 0.45 } as const;

export const ARTIFACT = { book: 'tome', movie: 'reel', tv: 'scroll', game: 'gem' } as const;
export type MediaKind = keyof typeof ARTIFACT;
export type ArtifactKind = (typeof ARTIFACT)[MediaKind];
