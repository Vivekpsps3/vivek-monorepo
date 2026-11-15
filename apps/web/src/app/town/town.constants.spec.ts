import * as constants from './town.constants';

describe('Town constants', () => {

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

});
