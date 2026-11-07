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

  it('exports all nine core lots with fixed or slot kind, order, privacy and unlock levels', () => {
    const lots = constants.TOWN_LOTS;
    expect(lots.map(lot => lot.id)).toEqual([
      'library', 'inn', 'treasury', 'slot-0', 'slot-1', 'slot-2', 'slot-3', 'slot-4', 'slot-5',
    ]);
    expect(lots.map(lot => lot.kind)).toEqual([
      'fixed', 'fixed', 'fixed', 'slot', 'slot', 'slot', 'slot', 'slot', 'slot',
    ]);
    expect(lots.slice(0, 3).map(lot => lot.unlockLevel)).toEqual([null, null, null]);
    expect(lots.slice(3).map(lot => lot.unlockLevel)).toEqual([...constants.LOT_UNLOCK_LV]);
    expect(lots.map(lot => lot.privacy)).toEqual([
      'server', 'server', 'vault', 'server', 'server', 'server', 'server', 'server', 'server',
    ]);
    // Building type is not a lot property. The §20.2 shape is id, kind, unlockLevel, privacy.
    expect(lots.map(lot => Object.keys(lot).sort())).toEqual(
      lots.map(() => ['id', 'kind', 'privacy', 'unlockLevel']),
    );
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
