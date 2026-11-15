import { SpriteAtlas,worldSpriteUrl } from './atlas';

describe('SpriteAtlas', () => {

  it('loads through Image when no loader is injected', async () => {
    const original = window.Image;
    class FakeImage {
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      src = '';
      decode(): Promise<void> {
        return Promise.resolve();
      }
    }
    const images: FakeImage[] = [];
    const Replacement = function Replacement(): FakeImage {
      const image = new FakeImage();
      images.push(image);
      return image;
    };
    window.Image = Replacement as unknown as typeof Image;
    try {
      const atlas = new SpriteAtlas();
      const pending = atlas.ensure([worldSpriteUrl('pine')]);
      images[0].onload?.();
      await pending;
      expect(atlas.sprite('pine')).toBe(images[0] as unknown as CanvasImageSource);
      const failing = new SpriteAtlas();
      const again = failing.ensure([worldSpriteUrl('bones')]);
      images[1].onerror?.();
      await again;
      expect(failing.failed(worldSpriteUrl('bones'))).toBeTrue();
    } finally {
      window.Image = original;
    }
  });
});
