import { SpriteAtlas, worldSpriteUrl } from './atlas';

describe('worldSpriteUrl', () => {
  it('builds a same-origin world path from one segment', () => {
    expect(worldSpriteUrl('flower')).toBe('/world/flower.svg');
    expect(worldSpriteUrl('chest-sealed')).toBe('/world/chest-sealed.svg');
    expect(worldSpriteUrl('chest-gold')).toBe('/world/chest-gold.svg');
  });

  it('rejects a slash or dot-dot segment', () => {
    for (const id of ['a/b', '..', '../x', 'foo/../bar', '', '.', 'a..b', 'foo.svg', 'a\\b']) {
      expect(() => worldSpriteUrl(id)).toThrow();
    }
  });
});

describe('SpriteAtlas', () => {
  function marker(url: string): CanvasImageSource {
    return { url } as unknown as CanvasImageSource;
  }

  it('loads each url once and resolves an id or a url', async () => {
    const seen: string[] = [];
    let release: () => void = () => undefined;
    const gate = new Promise<void>(resolve => {
      release = resolve;
    });
    const atlas = new SpriteAtlas(async src => {
      seen.push(src);
      await gate;
      return marker(src);
    });
    const url = worldSpriteUrl('flower');
    const first = atlas.ensure([url, url]);
    const second = atlas.ensure([url]);
    release();
    await Promise.all([first, second]);
    await atlas.ensure([url]);
    expect(seen).toEqual([url]);
    expect(atlas.sprite('flower')).toEqual(marker(url));
    expect(atlas.sprite(url)).toEqual(marker(url));
    expect(atlas.failed(url)).toBeFalse();
    expect(atlas.sprite('missing')).toBeNull();
  });

  it('records a failed load without throwing', async () => {
    const atlas = new SpriteAtlas(async () => {
      throw new Error('missing file');
    });
    const url = worldSpriteUrl('rock');
    await expectAsync(atlas.ensure([url])).toBeResolved();
    expect(atlas.failed(url)).toBeTrue();
    expect(atlas.failed('rock')).toBeTrue();
    expect(atlas.sprite(url)).toBeNull();
  });

  it('treats an empty image as a failure', async () => {
    const atlas = new SpriteAtlas(async () => null as unknown as CanvasImageSource);
    const url = worldSpriteUrl('oak');
    await atlas.ensure([url]);
    expect(atlas.failed(url)).toBeTrue();
    expect(atlas.sprite(url)).toBeNull();
  });

  it('refuses another origin and dot-dot paths without calling the loader', async () => {
    let calls = 0;
    const atlas = new SpriteAtlas(async src => {
      calls += 1;
      return marker(src);
    });
    const foreign = 'https://evil.example/flower.svg';
    const escape = '/world/../secret.svg';
    await atlas.ensure([foreign, escape, '//evil.example/flower.svg']);
    expect(calls).toBe(0);
    expect(atlas.failed(foreign)).toBeTrue();
    expect(atlas.failed(escape)).toBeTrue();
    expect(atlas.sprite(foreign)).toBeNull();
  });

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
