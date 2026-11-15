import {
ARTIFACT,
BIOMES,
DECOR,
DENSITY,
TRIP_BIOMES,
type ArtifactKind,
type Biome,
type DecorKind,
type MediaKind,
type TripBiome
} from './constants';

describe('worldgen constants', () => {

  it('matches the reference tables in array and key order', () => {
    const biomes: readonly Biome[] = BIOMES;
    const trips: readonly TripBiome[] = TRIP_BIOMES;
    const decor: Readonly<Record<Biome, readonly DecorKind[]>> = DECOR;
    const density: Readonly<Record<Biome, number>> = DENSITY;
    const artifact: Readonly<Record<MediaKind, ArtifactKind>> = ARTIFACT;

    expect(biomes).toEqual(['meadow', 'forest', 'snow', 'desert', 'jungle']);
    expect(trips).toEqual(['forest', 'snow', 'desert', 'jungle']);
    expect(decor).toEqual({
      meadow: ['flower', 'flower', 'rock', 'oak'],
      forest: ['oak', 'oak', 'pine', 'rock'],
      snow: ['pine', 'pine', 'rock', 'snowrock'],
      desert: ['cactus', 'cactus', 'rock', 'bones'],
      jungle: ['palm', 'palm', 'fern', 'flower'],
    });
    expect(density).toEqual({ meadow: 0.18, forest: 0.40, snow: 0.30, desert: 0.20, jungle: 0.45 });
    expect(artifact).toEqual({ book: 'tome', movie: 'reel', tv: 'scroll', game: 'gem' });

    // Object.keys is banned in this directory. JSON.stringify keeps insertion order.
    expect(JSON.stringify(decor)).toBe(
      '{"meadow":["flower","flower","rock","oak"],"forest":["oak","oak","pine","rock"],"snow":["pine","pine","rock","snowrock"],"desert":["cactus","cactus","rock","bones"],"jungle":["palm","palm","fern","flower"]}',
    );
    expect(JSON.stringify(density)).toBe('{"meadow":0.18,"forest":0.4,"snow":0.3,"desert":0.2,"jungle":0.45}');
    expect(JSON.stringify(artifact)).toBe('{"book":"tome","movie":"reel","tv":"scroll","game":"gem"}');
  });
});
