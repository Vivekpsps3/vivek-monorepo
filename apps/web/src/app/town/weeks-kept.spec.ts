import { treasuryFromBudget } from './weeks-kept';

describe('treasuryFromBudget', () => {
  const today = '2026-10-29';

  it('maps plan, data, lock, and outage without using a habit streak', () => {
    expect(treasuryFromBudget({ status: 'locked' }, today)).toEqual({ status: 'locked' });
    expect(treasuryFromBudget({ status: 'no_plan' }, today)).toEqual({ status: 'no_plan' });
    expect(treasuryFromBudget({ status: 'no_data' }, today)).toEqual({ status: 'no_data' });
    expect(treasuryFromBudget({ status: 'unavailable' }, today)).toEqual({ status: 'unavailable' });
    expect(treasuryFromBudget({ status: 'expired' }, today)).toEqual({ status: 'unavailable' });
    expect(treasuryFromBudget({ status: 'cancelled' }, today)).toBeNull();
    expect(treasuryFromBudget({
      status: 'ready',
      weeks: [{ weekStart: '2026-10-19', kept: true }, { weekStart: '2026-10-12', kept: false }],
    }, today)).toEqual({ status: 'ready', run: 1, saturated: false, tier: 2, stage: 2 });
    expect(treasuryFromBudget({
      status: 'ready',
      weeks: [{ weekStart: '2026-10-19', kept: true }, { weekStart: '2026-10-19', kept: true }],
    }, today)).toEqual({ status: 'unavailable' });
  });

});
