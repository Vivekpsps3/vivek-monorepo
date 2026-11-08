import type { Chunk } from '../engine/types';
import { bitmapKey, createBitmapCache, createChunkCache } from './cache';

describe('chunk cache', () => {
  it('remembers chunks in memory with no cap and no web storage', () => {
    const localBefore = localStorage.length;
    const sessionBefore = sessionStorage.length;
    const cache = createChunkCache();
    const first = { week: 'a' } as Chunk;
    const second = { week: 'b' } as Chunk;
    expect(cache.chunkFor('missing')).toBeUndefined();
    cache.remember('k', first);
    expect(cache.chunkFor('k')).toBe(first);
    cache.remember('k', second);
    expect(cache.chunkFor('k')).toBe(second);
    for (let index = 0; index < 30; index += 1) cache.remember(`n${index}`, { week: String(index) } as Chunk);
    expect(cache.chunkFor('n0')?.week).toBe('0');
    expect(cache.chunkFor('n29')?.week).toBe('29');
    expect(localStorage.length).toBe(localBefore);
    expect(sessionStorage.length).toBe(sessionBefore);
  });
});

describe('bitmap cache', () => {
  function image(id: number): CanvasImageSource {
    return { id } as unknown as CanvasImageSource;
  }

  it('builds a key from input, scale, and theme', () => {
    expect(bitmapKey('abc', 2, 'dark')).toBe('abc|2|dark');
    expect(bitmapKey('abc', 3, 'light')).not.toBe(bitmapKey('abc', 2, 'light'));
  });

  it('refuses a third new bitmap in the same frame', () => {
    const cache = createBitmapCache();
    const budget = { left: 2 };
    expect(cache.put('a', image(1), budget)).toBeTrue();
    expect(cache.put('b', image(2), budget)).toBeTrue();
    expect(cache.put('c', image(3), budget)).toBeFalse();
    expect(cache.get('c')).toBeUndefined();
    expect(budget.left).toBe(0);

    const replacement = image(9);
    expect(cache.put('a', replacement, budget)).toBeTrue();
    expect(cache.get('a')).toBe(replacement);
    expect(cache.put('d', image(4), budget)).toBeFalse();

    cache.resetFrame();
    const next = { left: 2 };
    expect(cache.put('c', image(3), next)).toBeTrue();
    expect(cache.get('c')).toBeDefined();
  });

  it('keeps 24 bitmaps and evicts the least recently used', () => {
    const cache = createBitmapCache();
    const stored: CanvasImageSource[] = [];
    const budget = { left: 2 };
    for (let index = 0; index < 24; index += 1) {
      if (index % 2 === 0) {
        cache.resetFrame();
        budget.left = 2;
      }
      const bitmap = image(index);
      stored.push(bitmap);
      expect(cache.put(`k${index}`, bitmap, budget)).toBeTrue();
    }
    expect(cache.get('k0')).toBe(stored[0]);
    cache.resetFrame();
    expect(cache.put('k24', image(24), { left: 2 })).toBeTrue();
    expect(cache.get('k0')).toBe(stored[0]);
    expect(cache.get('k1')).toBeUndefined();
    expect(cache.get('k23')).toBe(stored[23]);
    expect(cache.get('k24')).toBeDefined();
  });
});
