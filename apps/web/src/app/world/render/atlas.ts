export type SpriteLoader = (src: string) => Promise<CanvasImageSource>;

const WORLD_ROOT = '/world';
const SPRITE_ID = /^[A-Za-z0-9][A-Za-z0-9_-]*$/;

function spriteFile(root: string, id: string): string {
  if (!SPRITE_ID.test(id) || id.includes('..')) {
    throw new Error('sprite id must be a single path segment');
  }
  return `${root}/${id}.svg`;
}

/** Same-origin world sprite. `id` is one path segment, never a path. */
export function worldSpriteUrl(id: string): string {
  return spriteFile(WORLD_ROOT, id);
}

function loadImage(src: string): Promise<CanvasImageSource> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(trimSprite(image));
    image.onerror = () => reject(new Error('sprite failed to load'));
    image.src = src;
  });
}

/** Existing art has generous transparent gutters. Keep its aspect and baseline
 * while using the assigned scene footprint, instead of painting a tiny mark. */
function trimSprite(image: HTMLImageElement): CanvasImageSource {
  if (!image.naturalWidth || !image.naturalHeight) return image;
  const canvas = document.createElement('canvas');
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  const context = canvas.getContext('2d');
  if (!context) return image;
  context.drawImage(image, 0, 0);
  const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
  let left = canvas.width, right = -1, top = canvas.height, bottom = -1;
  for (let y = 0; y < canvas.height; y++) {
    for (let x = 0; x < canvas.width; x++) {
      if (data[(y * canvas.width + x) * 4 + 3] === 0) continue;
      left = Math.min(left, x); right = Math.max(right, x);
      top = Math.min(top, y); bottom = Math.max(bottom, y);
    }
  }
  if (right < left || bottom < top) return image;
  const width = right - left + 1, height = bottom - top + 1;
  const side = Math.max(width, height);
  canvas.width = side;
  canvas.height = side;
  context.imageSmoothingEnabled = false;
  context.drawImage(image, left, top, width, height, Math.floor((side - width) / 2), side - height, width, height);
  return canvas;
}

function isSameOrigin(src: string): boolean {
  if (src.includes('\\') || src.includes('..')) return false;
  if (src.startsWith('/') && !src.startsWith('//')) return true;
  const origin = typeof location === 'undefined' ? '' : location.origin;
  if (!origin) return false;
  try {
    return new URL(src, origin).origin === origin;
  } catch {
    return false;
  }
}

function resolveKey(idOrUrl: string): string | null {
  if (idOrUrl.startsWith('/') || idOrUrl.startsWith('//') || idOrUrl.includes('://')) return idOrUrl;
  try {
    return worldSpriteUrl(idOrUrl);
  } catch {
    return null;
  }
}

/**
 * Loads each sprite URL once. Town and world art share this cache;
 * callers pass `townSpriteUrl(...)` for structures and `worldSpriteUrl(...)` for world art.
 */
export class SpriteAtlas {
  private readonly images = new Map<string, CanvasImageSource>();
  private readonly failures = new Set<string>();
  private readonly pending = new Map<string, Promise<void>>();

  constructor(private readonly load: SpriteLoader = loadImage) {}

  sprite(idOrUrl: string): CanvasImageSource | null {
    const url = resolveKey(idOrUrl);
    if (url == null) return null;
    return this.images.get(url) ?? null;
  }

  failed(url: string): boolean {
    const key = resolveKey(url) ?? url;
    return this.failures.has(key);
  }

  ensure(urls: readonly string[]): Promise<void> {
    return Promise.all(urls.map(url => this.loadOne(url))).then(() => undefined);
  }

  private loadOne(url: string): Promise<void> {
    if (this.images.has(url) || this.failures.has(url)) return Promise.resolve();
    const inflight = this.pending.get(url);
    if (inflight) return inflight;
    if (!isSameOrigin(url)) {
      this.failures.add(url);
      return Promise.resolve();
    }
    const task = this.load(url).then(
      image => {
        if (image == null) this.failures.add(url);
        else this.images.set(url, image);
      },
      () => {
        this.failures.add(url);
      },
    ).finally(() => {
      this.pending.delete(url);
    });
    this.pending.set(url, task);
    return task;
  }
}
