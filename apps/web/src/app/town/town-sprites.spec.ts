import { TOWN_SPRITE_IDS } from './town-sprites';

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

});
