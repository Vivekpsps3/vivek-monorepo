import * as constants from './town.constants';
import * as town from './index';

describe('Town constants', () => {
  it('freezes every exported object and its nested values', () => {
    function expectFrozen(value: unknown): void {
      if (value !== null && typeof value === 'object') {
        expect(Object.isFrozen(value)).toBeTrue();
        Object.values(value).forEach(expectFrozen);
      }
    }
    Object.values(constants).forEach(expectFrozen);
  });

  it('exports all nine core lots with the specified order, privacy and slot unlock levels', () => {
    // Keep this acceptance check failing until the unspecified lot metadata is settled.
    const lots = Reflect.get(constants, 'TOWN_LOTS') as readonly {
      id: string; kind: string; unlockLevel: number | null; privacy: 'server' | 'vault';
    }[] | undefined;
    expect(lots).toBeDefined();
    if (!lots) throw new Error('TOWN_LOTS contract requires a ruling on kind and fixed unlockLevel');
    expect(lots.map(lot => lot.id)).toEqual([
      'library', 'inn', 'treasury', 'slot-0', 'slot-1', 'slot-2', 'slot-3', 'slot-4', 'slot-5',
    ]);
    expect(lots.slice(3).map(lot => lot.unlockLevel)).toEqual([...constants.LOT_UNLOCK_LV]);
    expect(lots.map(lot => lot.privacy)).toEqual([
      'server', 'server', 'vault', 'server', 'server', 'server', 'server', 'server', 'server',
    ]);
  });

  it('keeps the fixed lots and habit slot defaults in their specified order', () => {
    expect(constants.FIXED_LOTS).toEqual(['library', 'inn', 'treasury']);
    expect(constants.LOT_UNLOCK_LV).toEqual([1, 1, 3, 5, 7, 9]);
    expect(constants.SLOT_DEFAULT_STYLE).toEqual([
      'forge', 'garden', 'cottage', 'cottage', 'cottage', 'cottage',
    ]);
  });
});


describe('Town Worldgen barrel', () => {
  it('exports exactly the section 20 runtime contract', () => {
    expect(Object.keys(town).sort()).toEqual([
      'TOWN_NAME', 'XP', 'DAILY_CAP', 'BUILDING_LV', 'TOWN_LV', 'LOT_UNLOCK_LV',
      'TREASURY_WEEKS', 'MEDIA_FINISHED_KINDS', 'HABIT_NAME_MAX', 'HABIT_TOTAL_MAX',
      'CHECKIN_WINDOW', 'SLOT_DEFAULT_STYLE', 'FIXED_LOTS', 'TOWN_LOTS', 'TOWN_CONSTANTS_VERSION',
      'TOWN_SPRITE_IDS', 'townSpriteUrl', 'buildingSprite',
      'level', 'stage', 'levelProgress', 'treasuryTier',
    ].sort());
  });
});
