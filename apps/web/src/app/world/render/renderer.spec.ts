import { buildingSprite, stage, townSpriteUrl, treasuryTier } from '../../town';
import { CHUNK_H, CHUNK_W, GROUND } from '../engine/constants';
import type { Chunk } from '../engine/types';
import { DISTRICT_TILES, PIER_TILES, presentLayoutLots, TOWN_NPCS } from '../town-layout';
import { SpriteAtlas, worldSpriteUrl } from './atlas';
import {
  districtPaint,
  paintViewport,
  renderChunkBitmap,
  type BitmapCanvas,
  type DistrictSpec,
  type RenderContext,
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

  it('renders the same operations twice', async () => {
    const first = await draw();
    const second = await draw();
    expect(first).toEqual(second);
    expect(canvasOf(new RecordingContext()).width).toBe(0);
  });

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

  it('draws an M and does not throw when a sprite is missing', async () => {
    const ctx = new RecordingContext();
    const canvas = canvasOf(ctx);
    const atlas = new SpriteAtlas(async () => {
      throw new Error('absent');
    });
    await atlas.ensure([worldSpriteUrl('pine')]);
    const source = chunk({ decor: [{ x: 8, kind: 'pine' }], structures: [{ x: 4, sprite: 'garden-2', habit: 1 }] });
    expect(() => renderChunkBitmap(canvas, source, atlas, 2, 'dark')).not.toThrow();
    const marks = ctx.ops.filter(op => op.op === 'text' && op.text === 'M');
    expect(marks.length).toBe(2);
    expect(marks.every(op => op.w === 0)).toBeTrue();
    const squares = ctx.ops.filter(op => op.op === 'fill' && op.w === 2 && op.h === 2 && op.y === (GROUND - 1) * 2);
    expect(squares.length).toBeGreaterThanOrEqual(2);
    expect(ctx.ops.some(op => op.op === 'image')).toBeFalse();
  });

  it('does nothing when the context is null or the scale is not usable', async () => {
    const atlas = await atlasOf([]);
    const blank = canvasOf(null);
    expect(() => renderChunkBitmap(blank, chunk(), atlas, 2, 'light')).not.toThrow();
    expect(blank.width).toBe(CHUNK_W * 2);
    const skipped = canvasOf(new RecordingContext());
    renderChunkBitmap(skipped, chunk(), atlas, 0, 'light');
    expect(skipped.width).toBe(0);
    expect(skipped.ctx?.ops).toEqual([]);
  });
});

describe('districtPaint', () => {
  it('paints occupied layout lots, health stages, and founded npcs', () => {
    const paint = districtPaint(spec());
    const present = presentLayoutLots().map(lot => lot.id);
    expect(paint.lots.map(lot => lot.id)).toEqual(['library', 'inn', 'treasury', 'clinic', 'gym', 'slot-0']);
    for (const lot of paint.lots) expect(present).toContain(lot.id);
    expect(paint.lots.find(lot => lot.id === 'library')?.spriteUrl).toBe(
      townSpriteUrl(buildingSprite('library', stage(4))),
    );
    expect(paint.lots.find(lot => lot.id === 'inn')?.spriteUrl).toBe(
      townSpriteUrl(buildingSprite('inn', stage(4))),
    );
    expect(paint.lots.find(lot => lot.id === 'treasury')?.spriteUrl).toBe(
      townSpriteUrl(buildingSprite('treasury', stage(treasuryTier(4)))),
    );
    expect(paint.lots.find(lot => lot.id === 'clinic')?.spriteUrl).toBe(
      townSpriteUrl(buildingSprite('clinic', 2)),
    );
    expect(paint.lots.find(lot => lot.id === 'gym')?.spriteUrl).toBe(
      townSpriteUrl(buildingSprite('gym', 1)),
    );
    expect(paint.lots.find(lot => lot.id === 'slot-0')?.spriteUrl).toBe(townSpriteUrl('lot-empty'));
    expect(paint.npcs.map(npc => npc.id)).toEqual(['guide', 'vivekbot', 'terrarian', 'manager']);
    for (const npc of paint.npcs) {
      const source = TOWN_NPCS.find(item => item.id === npc.id);
      expect(source).toBeDefined();
      if (!source) continue;
      expect(npc.label).toBe(source.label);
      expect(npc.x).toBe(source.x);
      expect(npc.spriteUrl).toBe(worldSpriteUrl(npc.id));
    }
  });

  it('lets weeks kept choose the treasury stage', () => {
    const low = districtPaint(spec({ level: 1, weeksKept: 0, occupiedSlots: ['library', 'treasury'] }));
    const high = districtPaint(spec({ level: 1, weeksKept: 8, occupiedSlots: ['library', 'treasury'] }));
    expect(low.lots.find(lot => lot.id === 'library')?.spriteUrl).toBe(
      high.lots.find(lot => lot.id === 'library')?.spriteUrl,
    );
    expect(high.lots.find(lot => lot.id === 'treasury')?.spriteUrl).toBe(
      townSpriteUrl(buildingSprite('treasury', stage(treasuryTier(8)))),
    );
    expect(high.lots.find(lot => lot.id === 'treasury')?.spriteUrl).not.toBe(
      low.lots.find(lot => lot.id === 'treasury')?.spriteUrl,
    );
  });

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

  it('omits an id that is not occupied and an id presentLayoutLots does not return', () => {
    const paint = districtPaint(spec({
      health: { state: 'unavailable' },
      occupiedSlots: ['inn', 'slot-2', 'not-a-layout-lot'],
    }));
    const present = new Set(presentLayoutLots().map(lot => lot.id));
    expect(paint.lots.map(lot => lot.id)).toEqual(['inn', 'slot-2']);
    expect(paint.lots.map(lot => lot.id)).not.toContain('not-a-layout-lot');
    expect(paint.lots.map(lot => lot.id)).not.toContain('slot-0');
    expect(paint.lots.map(lot => lot.id)).not.toContain('clinic');
    expect(paint.lots.map(lot => lot.id)).not.toContain('library');
    for (const lot of paint.lots) expect(present.has(lot.id)).toBeTrue();
    expect(present.has('clinic')).toBeTrue();
  });

  it('keeps only the Guide when Town failed', () => {
    const paint = districtPaint(spec({ townFailed: true, founded: true }));
    expect(paint.lots).toEqual([]);
    expect(paint.npcs.map(npc => npc.id)).toEqual(['guide']);
    expect(paint.npcs[0].spriteUrl).toBe(worldSpriteUrl('guide'));
    const unfounded = districtPaint(spec({ founded: false }));
    expect(unfounded.npcs.map(npc => npc.id)).toEqual(['guide']);
    expect(unfounded.lots.length).toBeGreaterThan(1);
  });
});

describe('paintViewport', () => {
  const scale = 2;

  async function paint(partial: Partial<Parameters<typeof paintViewport>[1]> = {}): Promise<Op[]> {
    const ctx = new RecordingContext();
    const atlas = await atlasOf([
      worldSpriteUrl('chest-sealed'),
      worldSpriteUrl('chest-gold'),
      worldSpriteUrl('guide'),
      townSpriteUrl('lot-empty'),
      townSpriteUrl(buildingSprite('library', 1)),
    ]);
    paintViewport(ctx, {
      scale,
      cameraX: 0,
      viewportTiles: 20,
      theme: 'light',
      bitmaps: [{ originTile: 56, source: new Marker('week') as unknown as CanvasImageSource }],
      fogTiles: [],
      chests: [],
      selectionTile: null,
      district: null,
      districtOrigin: 0,
      showPier: false,
      atlas,
      ...partial,
    });
    return ctx.ops;
  }

  it('draws windowed bitmaps, the day-band outline, chests, and the same frame twice', async () => {
    const args = {
      bitmaps: [{ originTile: 56, source: new Marker('week') as unknown as CanvasImageSource }],
      chests: [
        { tile: 4, visual: 'sealed' as const },
        { tile: 6, visual: 'gold' as const },
        { tile: 8, visual: 'none' as const },
      ],
      selectionTile: 10,
      fogTiles: [{ tile: 2 }],
    };
    const first = await paint(args);
    const second = await paint(args);
    expect(first).toEqual(second);
    expect(first).toContain(jasmine.objectContaining({
      op: 'image', url: 'week', x: (56 - 0) * scale, y: 0, w: CHUNK_W * scale, h: CHUNK_H * scale,
    }));
    expect(first.filter(op => op.op === 'image').map(op => op.url)).toEqual([
      'week',
      worldSpriteUrl('chest-sealed'),
      worldSpriteUrl('chest-gold'),
    ]);
    expect(first).toContain(jasmine.objectContaining({
      op: 'stroke', x: 8 * scale, y: 0, w: 8 * scale, h: CHUNK_H * scale,
    }));
    expect(first.filter(op => op.op === 'text').map(op => op.text).join('')).not.toMatch(/\d{2,}/);
  });

  it('veils fog tiles with a one-pixel edge and skips district and sea tiles', async () => {
    const districtOrigin = 404;
    const cameraX = 400;
    const ops = await paint({
      cameraX,
      viewportTiles: 12,
      districtOrigin,
      theme: 'dark',
      fogTiles: [{ tile: 402 }, { tile: 406 }, { tile: districtOrigin + DISTRICT_TILES }],
    });
    const fog = ops.filter(op => op.op === 'fill' && op.style === 'rgba(10,14,20,.62)');
    expect(fog.map(op => op.x)).toEqual([(402 - cameraX) * scale]);
    expect(ops.some(op => op.op === 'fill' && op.w === 1 && op.h === 1 && op.style === 'rgba(10,14,20,.9)')).toBeTrue();
    const light = await paint({
      cameraX,
      viewportTiles: 12,
      districtOrigin,
      theme: 'light',
      fogTiles: [{ tile: 402 }, { tile: 406 }],
    });
    expect(light.filter(op => op.op === 'fill' && op.style === 'rgba(28,25,22,.45)').map(op => op.x)).toEqual([
      (402 - cameraX) * scale,
    ]);
    const shore = await paint({
      cameraX: DISTRICT_TILES - 1,
      viewportTiles: 6,
      districtOrigin: 0,
      theme: 'light',
      fogTiles: [{ tile: DISTRICT_TILES - 1 }, { tile: DISTRICT_TILES }],
    });
    expect(shore.some(op => op.style === 'rgba(28,25,22,.45)')).toBeFalse();
    const pier = await paint({
      cameraX: DISTRICT_TILES - 2,
      viewportTiles: 8,
      districtOrigin: 0,
      showPier: true,
      theme: 'light',
    });
    expect(pier.some(op => op.op === 'fill' && op.style === '#3a7ca5')).toBeTrue();
    expect(pier.some(op => op.op === 'fill' && op.style === '#9a5f25')).toBeTrue();
    const dry = await paint({ cameraX: 0, viewportTiles: 8, showPier: true, theme: 'light' });
    expect(dry.some(op => op.style === '#3a7ca5')).toBeFalse();
    expect(PIER_TILES).toBe(24);
  });

  it('draws district lots and npcs only when the district meets the viewport', async () => {
    const district = districtPaint(spec({
      founded: false,
      health: { state: 'unavailable' },
      occupiedSlots: ['library'],
      level: 1,
      vaultUnlocked: false,
    }));
    const hidden = await paint({ district, districtOrigin: 400, cameraX: 0, viewportTiles: 10 });
    expect(hidden.some(op => op.op === 'image' && op.url !== 'week')).toBeFalse();
    const shown = await paint({ district, districtOrigin: 0, cameraX: 0, viewportTiles: 80 });
    const images = shown.filter(op => op.op === 'image').map(op => op.url);
    expect(images).toContain(townSpriteUrl(buildingSprite('library', stage(1))));
    expect(images).toContain(worldSpriteUrl('guide'));
    expect(images).not.toContain(worldSpriteUrl('vivekbot'));
  });

  it('draws an M for a missing chest sprite and ignores a null lot sprite', async () => {
    const ctx = new RecordingContext();
    const atlas = new SpriteAtlas(async () => {
      throw new Error('no chest');
    });
    await atlas.ensure([worldSpriteUrl('chest-sealed')]);
    expect(() => paintViewport(ctx, {
      scale,
      cameraX: 0,
      viewportTiles: 10,
      theme: 'light',
      bitmaps: [],
      fogTiles: [],
      chests: [{ tile: 3, visual: 'sealed' }],
      selectionTile: null,
      district: { lots: [{ id: 'library', x: 8, spriteUrl: null }], npcs: [] },
      districtOrigin: 0,
      showPier: false,
      atlas,
    })).not.toThrow();
    expect(ctx.ops.filter(op => op.op === 'text' && op.text === 'M').length).toBe(1);
    expect(ctx.ops.some(op => op.op === 'image')).toBeFalse();
  });
});
