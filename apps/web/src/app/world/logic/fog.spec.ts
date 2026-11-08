import { fogMask, fogStorageKey, litSummary, readFogEnabled, writeFogEnabled } from './fog';

describe('fog preference', () => {
  it('keys storage per user and defaults to on', () => {
    expect(fogStorageKey(7)).toBe('world.fog.v1.7');
    expect(readFogEnabled(7)).toBeTrue();
    expect(readFogEnabled(7, null)).toBeTrue();
    expect(readFogEnabled(7, { getItem: () => null })).toBeTrue();
    expect(readFogEnabled(7, { getItem: () => '' })).toBeTrue();
    expect(readFogEnabled(7, {
      getItem() {
        throw new Error('blocked');
      },
    })).toBeTrue();
  });

  it('round-trips the flag through the provided storage', () => {
    const data = new Map<string, string>();
    const storage = {
      getItem: (key: string) => data.get(key) ?? null,
      setItem: (key: string, value: string) => {
        data.set(key, value);
      },
    };
    writeFogEnabled(4, false, storage);
    expect(readFogEnabled(4, storage)).toBeFalse();
    expect(readFogEnabled(5, storage)).toBeTrue();
    writeFogEnabled(4, true, storage);
    expect(readFogEnabled(4, storage)).toBeTrue();
    expect(data.get('world.fog.v1.4')).toBe('1');
    writeFogEnabled(4, false, null);
    expect(readFogEnabled(4, storage)).toBeTrue();
  });
});

describe('fogMask', () => {
  const week = '2026-10-26';

  it('fogs unlit days and future days of the current week', () => {
    const lit = [true, true, true, true, false, true, true];
    expect(fogMask(lit, week, week, '2026-10-28')).toEqual([
      false, false, false, true, true, true, true,
    ]);
    expect(fogMask(lit, week, '2026-11-02', '2026-11-04')).toEqual([
      false, false, false, false, true, false, false,
    ]);
    expect(fogMask([], week, '2026-11-02', '2026-11-04').every((fog) => fog)).toBeTrue();
  });

  it('returns seven day flags and does not invent district tiles', () => {
    expect(fogMask([true, true, true, true, true, true, true, true], week, week, '2026-11-01').length).toBe(7);
  });
});

describe('litSummary', () => {
  it('counts loaded weeks only and marks a partial history', () => {
    const summary = litSummary([
      { week: '2026-10-26', lit: [true, true, false, false, false, false, false] },
      { week: '2026-10-19', lit: [true, false, false, false, false, false, false] },
    ], '2026-01-05', false);
    expect(summary).toEqual({ lit: 3, total: 14, since: '2026-10-19', partial: true });
    expect(litSummary([], '2026-01-05', true)).toEqual({
      lit: 0, total: 0, since: '2026-01-05', partial: false,
    });
  });
});
