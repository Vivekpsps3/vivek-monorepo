import { townStreakText,type TownSummary } from './town-hub-card';

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

describe('townStreakText', () => {

  it('phrases a weekly streak in weeks', () => {
    expect(townStreakText(summary({ longest_streak: 2, longest_streak_unit: 'weeks' })))
      .toBe('2-week streak');
  });

});
