import { BUILDING_LV, DAILY_CAP, LOT_UNLOCK_LV, TOWN_CONSTANTS_VERSION, TOWN_LV, TREASURY_WEEKS, XP } from './town.constants';
import { habitProgressLine, HALL_RULES_VERSION, hallProgressLine, hallRules } from './hall-rules';

describe('Hall rules', () => {
  it('prints the canonical tables and the API progress fields', () => {
    const text = hallRules().map(rule => `${rule.label} ${rule.text}`).join('\n');
    expect(HALL_RULES_VERSION).toBe(TOWN_CONSTANTS_VERSION);
    expect(text).toContain(`${XP.manual} XP`);
    expect(text).toContain(`${XP.mediaEpisode} XP, capped at ${DAILY_CAP.library} Library XP`);
    expect(text).toContain(`${XP.tripDone} XP, inside the Inn cap`);
    expect(text).toContain(`capped at ${DAILY_CAP.inn} Inn XP`);
    for (const [index, xp] of TOWN_LV.entries()) expect(text).toContain(`Level ${index + 1} starts at ${xp} XP`);
    for (const [index, xp] of BUILDING_LV.entries()) expect(text).toContain(`Level ${index + 1} starts at ${xp} XP`);
    for (const [slot, level] of LOT_UNLOCK_LV.entries()) expect(text).toContain(`Lot ${slot + 1} at town level ${level}`);
    expect(text).toContain(`Kept budget weeks: ${TREASURY_WEEKS.join(', ')}`);
    expect(text).toContain('Balances stay in Finance and are not shown here.');
    expect(text).toContain('The Hall does not list them.');
    expect(text).not.toMatch(/\$\d|kg|mmHg|bpm/);

    expect(hallProgressLine({ level: 9, xp: 1, next_level_xp: 100 })).toBe('Level 9 · 1 / 100 XP');
    expect(hallProgressLine({ level: 10, xp: 5000, next_level_xp: null })).toBe('Level 10 · 5000 XP · Max');
    expect(habitProgressLine({ name: 'Walk 30 minutes', level: 4, xp: 3 })).toBe('Walk 30 minutes · Level 4 · 3 XP');
  });
});
