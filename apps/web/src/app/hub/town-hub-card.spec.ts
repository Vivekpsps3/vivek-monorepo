import { townIsEmpty, townStreakText, type TownSummary } from './town-hub-card';

function summary(partial: Partial<TownSummary> = {}): TownSummary {
  return {
    name: 'Terraria-on-Sea',
    founded_on: '2026-09-30',
    level: 3,
    xp: 260,
    level_xp_start: 250,
    next_level_xp: 500,
    today_done: 1,
    today_total: 2,
    longest_streak: 3,
    longest_streak_unit: 'days',
    ...partial,
  };
}

describe('townIsEmpty', () => {
  it('is empty when the town has no active habits', () => {
    expect(townIsEmpty(summary({ today_done: 0, today_total: 0 }))).toBeTrue();
  });

  it('is ready when any habit is active, even if none is done today', () => {
    expect(townIsEmpty(summary({ today_done: 0, today_total: 2 }))).toBeFalse();
  });
});

describe('townStreakText', () => {
  it('phrases a daily streak like the town page', () => {
    expect(townStreakText(summary())).toBe('3-day streak');
  });

  it('phrases a weekly streak in weeks', () => {
    expect(townStreakText(summary({ longest_streak: 2, longest_streak_unit: 'weeks' })))
      .toBe('2-week streak');
  });

  it('omits the line when every streak is 0', () => {
    expect(townStreakText(summary({ longest_streak: 0, longest_streak_unit: null }))).toBeNull();
    expect(townStreakText(summary({ longest_streak: 0, longest_streak_unit: 'days' }))).toBeNull();
  });
});
