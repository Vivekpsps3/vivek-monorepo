import { buildingSprite, TOWN_SPRITE_IDS, townSpriteUrl } from './town-sprites';

describe('Town sprites', () => {
  it('exposes exactly 29 unique stable IDs', () => {
    const buildings = ['library', 'inn', 'treasury', 'forge', 'garden', 'cottage', 'clinic', 'gym'];
    const expected = buildings.flatMap(kind => [1, 2, 3].map(stage => `${kind}-${stage}`));
    expected.push('treasury-locked', 'clinic-locked', 'gym-locked', 'lot-empty', 'lot-locked');
    expect(TOWN_SPRITE_IDS.length).toBe(29);
    expect(new Set(TOWN_SPRITE_IDS).size).toBe(29);
    expect<readonly string[]>(TOWN_SPRITE_IDS).toEqual(expected);
    expect(Object.isFrozen(TOWN_SPRITE_IDS)).toBeTrue();
  });

  it('resolves each ID to a local static SVG', () => {
    expect(townSpriteUrl('lot-empty')).toBe('/town/lot-empty.svg');
    for (const id of TOWN_SPRITE_IDS) expect(townSpriteUrl(id)).toBe(`/town/${id}.svg`);
  });

  it('maps every building and stage to a declared ID', () => {
    expect(buildingSprite('forge', 2)).toBe('forge-2');
    for (const kind of ['library', 'inn', 'treasury', 'forge', 'garden', 'cottage', 'clinic', 'gym'] as const) {
      for (const stage of [1, 2, 3] as const) {
        expect(TOWN_SPRITE_IDS).toContain(buildingSprite(kind, stage));
        expect(buildingSprite(kind, stage)).toBe(`${kind}-${stage}`);
      }
    }
  });
});
