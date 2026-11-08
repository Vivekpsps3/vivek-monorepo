import { BAND, CHUNK_H, CHUNK_W, GROUND, type Biome } from '../engine/constants';
import type { Chunk, Prop } from '../engine/types';
import { DISTRICT_TILES, PIER_TILES, presentLayoutLots, TOWN_NPCS } from '../town-layout';
import { buildingSprite, stage, townSpriteUrl, treasuryTier } from '../../town';
import type { TownHealthStages } from '../../town/health';
import { SpriteAtlas, worldSpriteUrl } from './atlas';

export interface RenderContext {
  fillRect(x: number, y: number, w: number, h: number): void;
  fillText(text: string, x: number, y: number): void;
  drawImage(image: CanvasImageSource, x: number, y: number, w: number, h: number): void;
  strokeRect(x: number, y: number, w: number, h: number): void;
  fillStyle: string;
  font: string;
  strokeStyle: string;
  imageSmoothingEnabled?: boolean;
}

export interface BitmapCanvas {
  width: number;
  height: number;
  getContext(kind: '2d'): RenderContext | null;
}

export interface DistrictSpec {
  founded: boolean;
  townFailed: boolean;
  level: number;
  weeksKept: number;
  vaultUnlocked: boolean;
  health: TownHealthStages;
  /** Lot ids that exist. An id absent here is omitted. Clinic and gym follow `health`. */
  occupiedSlots: readonly string[];
}

export interface DistrictLotPaint {
  id: string;
  x: number;
  spriteUrl: string | null;
}

export interface DistrictNpcPaint {
  id: string;
  label: string;
  x: number;
  spriteUrl: string;
}

type ThemeName = 'light' | 'dark';

interface GroundInk {
  top: string;
  fill: string;
}

const GROUND_INK: Record<ThemeName, Record<Biome, GroundInk>> = {
  light: {
    meadow: { top: '#3d8a5a', fill: '#4e3b2a' },
    forest: { top: '#2f6b45', fill: '#3a2e22' },
    snow: { top: '#e7eef2', fill: '#b7c3cc' },
    desert: { top: '#e2c078', fill: '#c4a15a' },
    jungle: { top: '#1f7a46', fill: '#3d4a28' },
  },
  dark: {
    meadow: { top: '#2f6e48', fill: '#3a2c20' },
    forest: { top: '#244e34', fill: '#2c241c' },
    snow: { top: '#c5d0d8', fill: '#8e9aa3' },
    desert: { top: '#c4a15a', fill: '#8a6a32' },
    jungle: { top: '#19633a', fill: '#2c381e' },
  },
};

const SKY: Record<ThemeName, string> = { light: '#c5dff5', dark: '#121a24' };
const HILL: Record<ThemeName, string> = { light: '#9aafc4', dark: '#2a3a4c' };
const INK: Record<ThemeName, string> = { light: '#1c1916', dark: '#f4f1ea' };
const MISSING: Record<ThemeName, string> = { light: '#d7cdb8', dark: '#4a4338' };
const WATER: Record<ThemeName, string> = { light: '#3a7ca5', dark: '#1a3c52' };
const PLANK: Record<ThemeName, string> = { light: '#9a5f25', dark: '#6e4520' };
const SEAM = '#1c1916';
const FOG: Record<ThemeName, string> = {
  light: 'rgba(28,25,22,.45)',
  dark: 'rgba(10,14,20,.62)',
};
const FOG_DITHER: Record<ThemeName, string> = {
  light: 'rgba(28,25,22,.85)',
  dark: 'rgba(10,14,20,.9)',
};
const HILL_RISE = 5;

function px(tile: number, scale: number): number {
  return Math.round(tile * scale);
}

function fontOf(scale: number): string {
  return `${Math.max(1, Math.round(scale))}px ui-sans-serif, system-ui, sans-serif`;
}

function surfaceAt(chunk: Chunk, x: number): number {
  const raw = chunk.heights[x];
  if (typeof raw !== 'number' || !Number.isFinite(raw)) return GROUND;
  return Math.max(0, Math.min(CHUNK_H, Math.round(raw)));
}

function biomeAt(chunk: Chunk, x: number): Biome {
  const biome = chunk.biomes[Math.floor(x / BAND)];
  if (biome === 'meadow' || biome === 'forest' || biome === 'snow' || biome === 'desert' || biome === 'jungle') {
    return biome;
  }
  return 'meadow';
}

function placed(atlas: SpriteAtlas, url: string): CanvasImageSource | null {
  try {
    return atlas.sprite(url);
  } catch {
    return null;
  }
}

function markMissing(ctx: RenderContext, dx: number, dy: number, scale: number, theme: ThemeName): void {
  const size = Math.max(1, Math.round(scale));
  ctx.fillStyle = MISSING[theme];
  ctx.fillRect(dx, dy, size, size);
  ctx.fillStyle = INK[theme];
  ctx.font = fontOf(scale);
  ctx.fillText('M', dx, dy + size);
}

function blit(
  ctx: RenderContext,
  atlas: SpriteAtlas,
  url: string,
  dx: number,
  dy: number,
  dw: number,
  dh: number,
  scale: number,
  theme: ThemeName,
): void {
  const image = placed(atlas, url);
  if (image) {
    ctx.drawImage(image, dx, dy, dw, dh);
    return;
  }
  markMissing(ctx, dx, dy + dh - Math.max(1, Math.round(scale)), scale, theme);
}

function propUrl(prop: Prop): string {
  if (prop.k === 'concept') return worldSpriteUrl('beacon');
  if (prop.k === 'artifact') return worldSpriteUrl(prop.kind);
  return worldSpriteUrl('pile');
}

export function renderChunkBitmap(
  canvas: BitmapCanvas,
  chunk: Chunk,
  atlas: SpriteAtlas,
  scale: number,
  theme: ThemeName,
): void {
  if (!(scale > 0) || !Number.isFinite(scale)) return;
  const width = px(CHUNK_W, scale);
  const height = px(CHUNK_H, scale);
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  if (ctx.imageSmoothingEnabled !== undefined) ctx.imageSmoothingEnabled = false;

  const ink = GROUND_INK[theme];
  ctx.fillStyle = SKY[theme];
  ctx.fillRect(0, 0, width, height);

  const columns = Math.min(CHUNK_W, chunk.heights.length);
  for (let x = 0; x < columns; x++) {
    const surface = surfaceAt(chunk, x);
    const hillTop = Math.max(0, surface - HILL_RISE);
    if (hillTop < surface) {
      ctx.fillStyle = HILL[theme];
      ctx.fillRect(px(x, scale), px(hillTop, scale), px(1, scale), px(surface - hillTop, scale));
    }
    if (surface >= CHUNK_H) continue;
    const colors = ink[biomeAt(chunk, x)];
    ctx.fillStyle = colors.top;
    ctx.fillRect(px(x, scale), px(surface, scale), px(1, scale), px(1, scale));
    const dirt = CHUNK_H - surface - 1;
    if (dirt > 0) {
      ctx.fillStyle = colors.fill;
      ctx.fillRect(px(x, scale), px(surface + 1, scale), px(1, scale), px(dirt, scale));
    }
  }

  for (const decor of chunk.decor) blitSprite(ctx, atlas, worldSpriteUrl(decor.kind), decor.x, surfaceAt(chunk, decor.x), 2, 3, scale, theme);
  for (const structure of chunk.structures) {
    blitSprite(ctx, atlas, townSpriteUrl(structure.sprite), structure.x, surfaceAt(chunk, structure.x), 4, 4, scale, theme);
  }
  for (const prop of chunk.props) blitSprite(ctx, atlas, propUrl(prop), prop.x, surfaceAt(chunk, prop.x), 2, 2, scale, theme);

  ctx.fillStyle = INK[theme];
  ctx.font = fontOf(scale);
  ctx.fillText(chunk.week, 1, Math.max(1, Math.round(scale)));
}

function blitSprite(
  ctx: RenderContext,
  atlas: SpriteAtlas,
  url: string,
  tileX: number,
  surface: number,
  tilesWide: number,
  tilesTall: number,
  scale: number,
  theme: ThemeName,
): void {
  if (!Number.isFinite(tileX)) return;
  blit(
    ctx,
    atlas,
    url,
    px(tileX, scale),
    px(surface - tilesTall, scale),
    px(tilesWide, scale),
    px(tilesTall, scale),
    scale,
    theme,
  );
}

function keptWeeks(weeksKept: number): number {
  if (!Number.isFinite(weeksKept) || weeksKept <= 0) return 0;
  return Math.floor(weeksKept);
}

function healthSprite(spec: DistrictSpec, kind: 'clinic' | 'gym'): string | null {
  const health = spec.health;
  if (health.state === 'unavailable') return null;
  if (health.state === 'locked') return townSpriteUrl(kind === 'clinic' ? 'clinic-locked' : 'gym-locked');
  return townSpriteUrl(buildingSprite(kind, kind === 'clinic' ? health.clinic : health.gym));
}

function occupiedSprite(spec: DistrictSpec, id: string): string {
  if (id === 'library' || id === 'inn') return townSpriteUrl(buildingSprite(id, stage(spec.level)));
  if (id === 'treasury') {
    if (!spec.vaultUnlocked) return townSpriteUrl('treasury-locked');
    return townSpriteUrl(buildingSprite('treasury', stage(treasuryTier(keptWeeks(spec.weeksKept)))));
  }
  return townSpriteUrl('lot-empty');
}

function guideNpc(): DistrictNpcPaint {
  const guide = TOWN_NPCS.find(npc => npc.id === 'guide') ?? TOWN_NPCS[0];
  return { id: guide.id, label: guide.label, x: guide.x, spriteUrl: worldSpriteUrl(guide.id) };
}

export function districtPaint(spec: DistrictSpec): { lots: DistrictLotPaint[]; npcs: DistrictNpcPaint[] } {
  if (spec.townFailed) return { lots: [], npcs: [guideNpc()] };
  const occupied = new Set(spec.occupiedSlots);
  const lots: DistrictLotPaint[] = [];
  for (const lot of presentLayoutLots()) {
    if (lot.id === 'clinic' || lot.id === 'gym') {
      const spriteUrl = healthSprite(spec, lot.id);
      if (spriteUrl == null) continue;
      lots.push({ id: lot.id, x: lot.x, spriteUrl });
      continue;
    }
    if (!occupied.has(lot.id)) continue;
    lots.push({ id: lot.id, x: lot.x, spriteUrl: occupiedSprite(spec, lot.id) });
  }
  const npcs = TOWN_NPCS
    .filter(npc => npc.when === 'always' || spec.founded)
    .map(npc => ({ id: npc.id, label: npc.label, x: npc.x, spriteUrl: worldSpriteUrl(npc.id) }));
  return { lots, npcs };
}

function sees(start: number, end: number, viewStart: number, viewEnd: number): boolean {
  return start < viewEnd && end > viewStart;
}

function fogBlocked(tile: number, districtOrigin: number): boolean {
  const districtEnd = districtOrigin + DISTRICT_TILES;
  const seaEnd = districtEnd + PIER_TILES;
  return (tile >= districtOrigin && tile < districtEnd) || (tile >= districtEnd && tile < seaEnd);
}

function ditherEdge(ctx: RenderContext, x: number, height: number, color: string): void {
  ctx.fillStyle = color;
  const edge = Math.round(x);
  for (let y = 0; y < height; y += 2) ctx.fillRect(edge, y, 1, 1);
}

export function paintViewport(ctx: RenderContext, args: {
  scale: number;
  cameraX: number;
  viewportTiles: number;
  theme: ThemeName;
  bitmaps: readonly { originTile: number; source: CanvasImageSource }[];
  fogTiles: readonly { tile: number }[];
  chests: readonly { tile: number; visual: 'sealed' | 'gold' | 'none' }[];
  selectionTile: number | null;
  district: ReturnType<typeof districtPaint> | null;
  districtOrigin: number;
  showPier: boolean;
  atlas: SpriteAtlas;
}): void {
  const { scale, theme, atlas } = args;
  if (!(scale > 0) || !Number.isFinite(scale) || !ctx) return;
  if (ctx.imageSmoothingEnabled !== undefined) ctx.imageSmoothingEnabled = false;
  const viewEnd = args.cameraX + args.viewportTiles;
  const height = px(CHUNK_H, scale);
  ctx.fillStyle = SKY[theme];
  ctx.fillRect(0, 0, px(args.viewportTiles, scale), height);

  for (const bitmap of args.bitmaps) {
    ctx.drawImage(bitmap.source, px(bitmap.originTile - args.cameraX, scale), 0, px(CHUNK_W, scale), height);
  }

  const seaStart = args.districtOrigin + DISTRICT_TILES;
  const seaEnd = seaStart + PIER_TILES;
  if (args.showPier && sees(seaStart, seaEnd, args.cameraX, viewEnd)) {
    for (let tile = seaStart; tile < seaEnd; tile++) {
      if (!sees(tile, tile + 1, args.cameraX, viewEnd)) continue;
      const x = px(tile - args.cameraX, scale);
      ctx.fillStyle = WATER[theme];
      ctx.fillRect(x, px(GROUND, scale), px(1, scale), px(CHUNK_H - GROUND, scale));
      ctx.fillStyle = PLANK[theme];
      ctx.fillRect(x, px(GROUND - 1, scale), px(1, scale), px(1, scale));
      ctx.fillStyle = SEAM;
      ctx.fillRect(x, px(GROUND - 1, scale), px(1, scale), 1);
      if ((tile - seaStart) % 2 === 0) ctx.fillRect(x, px(GROUND - 1, scale), 1, px(1, scale));
    }
  }

  const districtEnd = args.districtOrigin + DISTRICT_TILES;
  if (args.district && sees(args.districtOrigin, districtEnd, args.cameraX, viewEnd)) {
    for (const lot of args.district.lots) {
      if (lot.spriteUrl == null) continue;
      const worldX = args.districtOrigin + lot.x;
      if (!sees(worldX, worldX + 4, args.cameraX, viewEnd)) continue;
      blit(ctx, atlas, lot.spriteUrl, px(worldX - args.cameraX, scale), px(GROUND - 4, scale), px(4, scale), px(4, scale), scale, theme);
    }
    for (const npc of args.district.npcs) {
      const worldX = args.districtOrigin + npc.x;
      if (!sees(worldX, worldX + 2, args.cameraX, viewEnd)) continue;
      blit(ctx, atlas, npc.spriteUrl, px(worldX - args.cameraX, scale), px(GROUND - 2, scale), px(2, scale), px(2, scale), scale, theme);
    }
  }

  const fogTiles = new Set(args.fogTiles.map(entry => entry.tile));
  for (const tile of fogTiles) {
    if (fogBlocked(tile, args.districtOrigin)) continue;
    if (!sees(tile, tile + 1, args.cameraX, viewEnd)) continue;
    const x = px(tile - args.cameraX, scale);
    ctx.fillStyle = FOG[theme];
    ctx.fillRect(x, 0, px(1, scale), height);
    const veil = (neighbor: number): boolean => fogTiles.has(neighbor) && !fogBlocked(neighbor, args.districtOrigin);
    if (!veil(tile - 1)) ditherEdge(ctx, x, height, FOG_DITHER[theme]);
    if (!veil(tile + 1)) ditherEdge(ctx, x + scale - 1, height, FOG_DITHER[theme]);
  }

  for (const chest of args.chests) {
    if (chest.visual === 'none') continue;
    if (!sees(chest.tile, chest.tile + 1, args.cameraX, viewEnd)) continue;
    const id = chest.visual === 'gold' ? 'chest-gold' : 'chest-sealed';
    blit(
      ctx,
      atlas,
      worldSpriteUrl(id),
      px(chest.tile - args.cameraX, scale),
      px(GROUND - 1, scale),
      px(1, scale),
      px(1, scale),
      scale,
      theme,
    );
  }

  if (args.selectionTile != null && Number.isFinite(args.selectionTile)) {
    const band = Math.floor(args.selectionTile / BAND) * BAND;
    if (sees(band, band + BAND, args.cameraX, viewEnd)) {
      ctx.strokeStyle = INK[theme];
      ctx.strokeRect(px(band - args.cameraX, scale), 0, px(BAND, scale), height);
    }
  }
}
