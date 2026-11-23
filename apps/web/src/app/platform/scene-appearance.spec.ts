import {
  dayPartForHour,
  presentScene,
  readScenePreference,
  resolveSeason,
  scenePreferenceKey,
  seasonForMonth,
  writeScenePreference,
  type SeasonChoice,
} from './scene-appearance';

describe('scene appearance', () => {
  const edges: { month: number; season: ReturnType<typeof seasonForMonth> }[] = [
    { month: 1, season: 'winter' },
    { month: 2, season: 'winter' },
    { month: 3, season: 'spring' },
    { month: 5, season: 'spring' },
    { month: 6, season: 'summer' },
    { month: 8, season: 'summer' },
    { month: 9, season: 'autumn' },
    { month: 11, season: 'autumn' },
    { month: 12, season: 'winter' },
  ];

  for (const edge of edges) {
    it(`maps month ${edge.month} to ${edge.season}`, () => {
      expect(seasonForMonth(edge.month)).toBe(edge.season);
    });
  }

  it('keeps an explicit season across the month boundary and lets automatic follow it', () => {
    expect(resolveSeason('automatic', 5)).toBe('spring');
    expect(resolveSeason('automatic', 6)).toBe('summer');
    expect(resolveSeason('winter', 5)).toBe('winter');
    expect(resolveSeason('winter', 6)).toBe('winter');
    expect(resolveSeason('default', 7)).toBe('default');
    expect(seasonForMonth(0)).toBe('default');
  });

  it('treats local hours 6 through 17 as day', () => {
    expect(dayPartForHour(5)).toBe('night');
    expect(dayPartForHour(6)).toBe('day');
    expect(dayPartForHour(17)).toBe('day');
    expect(dayPartForHour(18)).toBe('night');
  });

  it('names authored day, night, weather, and idle copy without a server day', () => {
    const spring = presentScene('automatic', new Date(2026, 4, 31, 12));
    const summer = presentScene('automatic', new Date(2026, 5, 1, 5));
    const winter = presentScene('winter', new Date(2026, 5, 1, 12));
    expect(spring).toEqual(jasmine.objectContaining({
      choice: 'automatic', season: 'spring', dayPart: 'day', weather: 'rain',
      weatherLabel: 'Light rain', idleLabel: 'Blossoms along the garden path',
    }));
    expect(spring.label).toBe('Automatic, Spring. Day. Light rain. Blossoms along the garden path.');
    expect(summer.season).toBe('summer');
    expect(summer.dayPart).toBe('night');
    expect(summer.weatherLabel).toBe('Warm air');
    expect(winter.season).toBe('winter');
    expect(winter.label).toContain('Light snow');
    expect(winter.label).not.toContain('2026');
  });

  it('stores only the owner key and ignores a broken record', () => {
    const storage = new Map<string, string>();
    const memory = {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => { storage.set(key, value); },
    };
    expect(writeScenePreference(memory, 4, { season: 'autumn', sound: true })).toBeTrue();
    expect(scenePreferenceKey(4)).toBe('town.scene.v1.4');
    expect(Object.keys(JSON.parse(storage.get('town.scene.v1.4')!))).toEqual(['season', 'sound']);
    expect(readScenePreference(memory, 4)).toEqual({ season: 'autumn', sound: true });
    expect(readScenePreference(memory, 5)).toEqual({ season: 'automatic', sound: false });
    storage.set('town.scene.v1.5', '{');
    expect(readScenePreference(memory, 5).season).toBe('automatic');
    storage.set('town.scene.v1.5', JSON.stringify({ season: 'nope', sound: true }));
    expect(readScenePreference(memory, 5)).toEqual({ season: 'automatic', sound: true });
    storage.set('town.scene.v1.5', JSON.stringify({ season: 'spring', sound: 'yes' }));
    expect(readScenePreference(memory, 5)).toEqual({ season: 'spring', sound: false });
    expect(writeScenePreference(memory, 5, { season: 'nope' as SeasonChoice, sound: true })).toBeFalse();
    expect(writeScenePreference(null, 5, { season: 'spring', sound: false })).toBeFalse();
    expect(readScenePreference({ getItem: () => { throw new Error('blocked'); } }, 5).sound).toBeFalse();
  });

  it('keeps February 29 in winter and March 1 in spring', () => {
    expect(presentScene('automatic', new Date(2024, 1, 29, 12)).season).toBe('winter');
    expect(presentScene('automatic', new Date(2024, 2, 1, 12)).season).toBe('spring');
  });
});
