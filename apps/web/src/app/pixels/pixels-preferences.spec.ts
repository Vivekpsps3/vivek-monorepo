import { readColorBy, readViewMode, writeColorBy, writeViewMode } from './pixels-preferences';

describe('pixels preferences', () => {
  it('persists activity or app, and grid or table, and defaults the rest', () => {
    const stored = new Map<string, string>();
    const storage = {
      getItem: (key: string) => stored.get(key) ?? null,
      setItem: (key: string, value: string) => stored.set(key, value),
    };
    expect(readColorBy(storage)).toBe('activity');
    expect(readViewMode(storage)).toBe('grid');
    writeColorBy('app', storage);
    writeViewMode('table', storage);
    expect(readColorBy(storage)).toBe('app');
    expect(readViewMode(storage)).toBe('table');
    stored.set('pixels.colorBy', 'nope');
    expect(readColorBy(storage)).toBe('activity');
  });
});
