import { readFogEnabled,writeFogEnabled } from './fog';

describe('fog preference', () => {

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
