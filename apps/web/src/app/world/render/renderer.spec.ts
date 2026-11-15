import { buildingSprite,townSpriteUrl } from '../../town';
import { CHUNK_H,CHUNK_W,GROUND } from '../engine/constants';
import type { Chunk } from '../engine/types';
import { SpriteAtlas,worldSpriteUrl } from './atlas';
import {
districtPaint,
renderChunkBitmap,
type BitmapCanvas,
type DistrictSpec,
type RenderContext
} from './renderer';

interface Op {
  op: 'fill' | 'text' | 'image' | 'stroke';
  x: number;
  y: number;
  w: number;
  h: number;
  style: string;
  text?: string;
  url?: string;
  font?: string;
}

class RecordingContext implements RenderContext {
  ops: Op[] = [];
  fillStyle = '';
  font = '';
  strokeStyle = '';
  imageSmoothingEnabled?: boolean;

  fillRect(x: number, y: number, w: number, h: number): void {
    this.ops.push({ op: 'fill', x, y, w, h, style: this.fillStyle });
  }

  fillText(text: string, x: number, y: number): void {
    this.ops.push({ op: 'text', text, x, y, w: 0, h: 0, style: this.fillStyle, font: this.font });
  }

  drawImage(image: CanvasImageSource, x: number, y: number, w: number, h: number): void {
    const marked = image as { url?: string };
    const url = typeof marked.url === 'string' ? marked.url : 'bitmap';
    this.ops.push({ op: 'image', url, x, y, w, h, style: '' });
  }

  strokeRect(x: number, y: number, w: number, h: number): void {
    this.ops.push({ op: 'stroke', x, y, w, h, style: this.strokeStyle });
  }
}

class Marker {
  constructor(readonly url: string) {}
}

function canvasOf(ctx: RecordingContext | null, smoothing = false): BitmapCanvas & { ctx: RecordingContext | null } {
  const canvas = {
    width: 0,
    height: 0,
    ctx,
    getContext(): RenderContext | null {
      return ctx;
    },
  };
  if (ctx && smoothing) ctx.imageSmoothingEnabled = true;
  return canvas;
}

function chunk(partial: Partial<Chunk> = {}): Chunk {
  return {
    v: 1,
    week: '2026-10-26',
    heights: Array.from({ length: CHUNK_W }, () => GROUND),
    biomes: ['meadow', 'forest', 'snow', 'desert', 'jungle', 'meadow', 'forest'],
    trips: [null, null, null, null, null, null, null],
    lit: [true, false, false, false, false, false, false],
    structures: [],
    structuresOverflow: 0,
    props: [],
    decor: [],
    chest: { x: 54 },
    ...partial,
  };
}

function atlasOf(urls: readonly string[]): Promise<SpriteAtlas> {
  const atlas = new SpriteAtlas(async src => new Marker(src) as unknown as CanvasImageSource);
  return atlas.ensure(urls).then(() => atlas);
}

function spec(partial: Partial<DistrictSpec> = {}): DistrictSpec {
  return {
    founded: true,
    townFailed: false,
    level: 4,
    weeksKept: 4,
    vaultUnlocked: true,
    health: { state: 'ready', clinic: 2, gym: 1 },
    occupiedSlots: ['library', 'inn', 'treasury', 'slot-0'],
    ...partial,
  };
}

describe('renderChunkBitmap', () => {
  const urls = [
    worldSpriteUrl('oak'),
    worldSpriteUrl('beacon'),
    worldSpriteUrl('tome'),
    worldSpriteUrl('reel'),
    worldSpriteUrl('scroll'),
    worldSpriteUrl('gem'),
    worldSpriteUrl('pile'),
    townSpriteUrl(buildingSprite('forge', 1)),
  ];

  function sample(): Chunk {
    return chunk({
      structures: [{ x: 2, sprite: 'forge-1', habit: 12 }],
      props: [
        { x: 10, k: 'concept', id: 7 },
        { x: 12, k: 'artifact', kind: 'tome', id: 9 },
        { x: 14, k: 'artifact', kind: 'reel', id: 3 },
        { x: 16, k: 'artifact', kind: 'scroll', id: 4 },
        { x: 18, k: 'artifact', kind: 'gem', id: 5 },
        { x: 20, k: 'pile', n: 4 },
      ],
      decor: [{ x: 30, kind: 'oak' }],
    });
  }

  async function draw(theme: 'light' | 'dark' = 'light'): Promise<Op[]> {
    const ctx = new RecordingContext();
    const canvas = canvasOf(ctx, true);
    renderChunkBitmap(canvas, sample(), await atlasOf(urls), 2, theme);
    return ctx.ops;
  }

  it('sizes the bitmap to the chunk and draws hills, ground, sprites, and the week', async () => {
    const ctx = new RecordingContext();
    const canvas = canvasOf(ctx, true);
    const source = sample();
    const before = structuredClone(source);
    renderChunkBitmap(canvas, source, await atlasOf(urls), 2, 'light');
    expect(source).toEqual(before);
    expect(canvas.width).toBe(CHUNK_W * 2);
    expect(canvas.height).toBe(CHUNK_H * 2);
    expect(ctx.imageSmoothingEnabled).toBeFalse();
    expect(ctx.ops[0]).toEqual(jasmine.objectContaining({ op: 'fill', x: 0, y: 0, w: CHUNK_W * 2, h: CHUNK_H * 2 }));
    const ground = ctx.ops.filter(op => op.op === 'fill' && op.y === GROUND * 2 && op.h === 2 && op.w === 2);
    expect(ground.length).toBe(CHUNK_W);
    const images = ctx.ops.filter(op => op.op === 'image').map(op => op.url);
    expect(images).toEqual([
      worldSpriteUrl('oak'),
      townSpriteUrl('forge-1'),
      worldSpriteUrl('beacon'),
      worldSpriteUrl('tome'),
      worldSpriteUrl('reel'),
      worldSpriteUrl('scroll'),
      worldSpriteUrl('gem'),
      worldSpriteUrl('pile'),
    ]);
    expect(images).not.toContain(worldSpriteUrl('forge-1'));
    expect(images.some(url => url?.includes('chest'))).toBeFalse();
    const texts = ctx.ops.filter(op => op.op === 'text');
    expect(texts.map(op => op.text)).toEqual(['2026-10-26']);
    expect(texts[0].font).toContain('sans-serif');
    expect(ctx.ops.filter(op => op.op === 'text' && op.text === '4')).toEqual([]);
  });

  it('uses a different ground palette for dark theme', async () => {
    expect(await draw('light')).not.toEqual(await draw('dark'));
  });

});

describe('districtPaint', () => {

  it('locks the treasury and health lots without inventing habit houses', () => {
    const paint = districtPaint(spec({
      vaultUnlocked: false,
      health: { state: 'locked' },
      occupiedSlots: ['library'],
    }));
    expect(paint.lots.map(lot => lot.id)).toEqual(['library', 'clinic', 'gym']);
    expect(paint.lots.find(lot => lot.id === 'treasury')).toBeUndefined();
    expect(paint.lots.find(lot => lot.id === 'clinic')?.spriteUrl).toBe(townSpriteUrl('clinic-locked'));
    expect(paint.lots.find(lot => lot.id === 'gym')?.spriteUrl).toBe(townSpriteUrl('gym-locked'));
  });

});
