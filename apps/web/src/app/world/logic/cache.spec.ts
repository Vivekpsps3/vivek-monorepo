import { createBitmapCache } from './cache';

describe('bitmap cache', () => {
  function image(id: number): CanvasImageSource {
    return { id } as unknown as CanvasImageSource;
  }

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
