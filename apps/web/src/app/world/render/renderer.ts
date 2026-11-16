import { addDays } from '../engine';
import { BAND, CHUNK_H, CHUNK_W, GROUND, type Biome } from '../engine/constants';
import type { Chunk } from '../engine/types';
import { DISTRICT_TILES, PIER_TILES, presentLayoutLots, TOWN_NPCS } from '../town-layout';
import { buildingSprite, stage, townSpriteUrl, treasuryTier } from '../../town';
import type { TownHealthStages } from '../../town/health';
import { SpriteAtlas, worldSpriteUrl } from './atlas';

export interface SceneObject {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  sprite: string;
}

/** Paint and picking share these bounds, in chunk-local tiles and paint order. */
export function sceneObjects(chunk: Chunk): SceneObject[] {
  return [
    ...chunk.structures.map(item => ({
      id: `habit:${item.habit}`, x: item.x, y: surfaceAt(chunk, item.x) - 4,
      w: 4, h: 4, sprite: townSpriteUrl(item.sprite),
    })),
    ...chunk.props.map(item => ({
      id: item.k === 'concept' ? `concept:${item.id}` : item.k === 'artifact' ? `finished:${item.id}:${addDays(chunk.week, Math.floor(item.x / BAND))}` : `pile:${item.x}`,
      x: item.x, y: surfaceAt(chunk, item.x) - 2, w: 2, h: 2,
      sprite: worldSpriteUrl(item.k === 'concept' ? 'beacon' : item.k === 'artifact' ? item.kind : 'pile'),
    })),
  ];
}

export function hitObjects(objects: readonly SceneObject[], x: number, y: number, padding = 0): SceneObject[] {
  return objects.filter(item => x >= item.x - padding && x <= item.x + item.w + padding
    && y >= item.y - padding && y <= item.y + item.h + padding).reverse();
}

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
    meadow: { top: '#678b68', fill: '#b7a483' },
    forest: { top: '#4e7355', fill: '#a89b7c' },
    snow: { top: '#e7eef2', fill: '#c6d2d1' },
    desert: { top: '#e2c078', fill: '#c9ae79' },
    jungle: { top: '#1f7a46', fill: '#929975' },
  },
  dark: {
    meadow: { top: '#2f6e48', fill: '#494638' },
    forest: { top: '#244e34', fill: '#3d4537' },
    snow: { top: '#c5d0d8', fill: '#8e9aa3' },
    desert: { top: '#c9ae79', fill: '#8a6a32' },
    jungle: { top: '#19633a', fill: '#374936' },
  },
};

const SKY: Record<ThemeName, string> = { light: '#dcebe8', dark: '#192c34' };
const HILL: Record<ThemeName, string> = { light: '#b5cdc3', dark: '#304b48' };
const INK: Record<ThemeName, string> = { light: '#1c1916', dark: '#f4f1ea' };
const MISSING: Record<ThemeName, string> = { light: '#d7cdb8', dark: '#4a4338' };
const WATER: Record<ThemeName, string> = { light: '#3a7ca5', dark: '#1a3c52' };
const PLANK: Record<ThemeName, string> = { light: '#9a5f25', dark: '#6e4520' };
const SEAM = '#1c1916';
const ACTIVITY: Record<ThemeName, string> = { light: '#0f6e6a', dark: '#8fd0c8' };
const HORIZON: Record<ThemeName, string> = { light: 'rgba(237,243,238,.38)', dark: 'rgba(20,30,39,.38)' };

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

  // Restrained distant coast and clouds. Only presentation changes; chunk
  // heights, biome assignments and all generated object positions stay intact.
  ctx.fillStyle = theme === 'light' ? '#f6eed4' : '#ced8bf';
  ctx.fillRect(px(43, scale), px(3, scale), px(2, scale), px(2, scale));
  ctx.fillStyle = theme === 'light' ? '#f0f5ed' : '#3a5055';
  for (const [x, y, w] of [[5, 4, 7], [8, 3, 3], [29, 6, 8], [32, 5, 3]]) {
    ctx.fillRect(px(x, scale), px(y, scale), px(w, scale), px(1, scale));
  }
  for (let x = 0; x < CHUNK_W; x++) {
    const ridge = 10 + Math.floor(2 * Math.sin(x / 9) + Math.cos(x / 4));
    ctx.fillStyle = HILL[theme];
    ctx.fillRect(px(x, scale), px(ridge, scale), px(1, scale), px(CHUNK_H - ridge, scale));
  }

  const columns = Math.min(CHUNK_W, chunk.heights.length);
  for (let x = 0; x < columns; x++) {
    const surface = surfaceAt(chunk, x);
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
  for (const item of sceneObjects(chunk)) {
    blit(ctx, atlas, item.sprite, px(item.x, scale), px(item.y, scale), px(item.w, scale), px(item.h, scale), scale, theme);
  }
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

export function paintViewport(ctx: RenderContext, args: {
  scale: number;
  cameraX: number;
  viewportTiles: number;
  theme: ThemeName;
  bitmaps: readonly { originTile: number; source: CanvasImageSource }[];
  fogTiles: readonly { tile: number }[];
  chests: readonly { tile: number; visual: 'sealed' | 'gold' | 'none' }[];
  selectionTile: number | null;
  selectionObject?: SceneObject | null;
  futureTiles?: readonly { tile: number }[];
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

  // Activity is a small ground marker, never a veil over unrecorded life.
  ctx.fillStyle = ACTIVITY[theme];
  for (const { tile } of args.fogTiles) {
    if (fogBlocked(tile, args.districtOrigin) || !sees(tile, tile + 1, args.cameraX, viewEnd)) continue;
    ctx.fillRect(px(tile - args.cameraX, scale), height - px(1, scale), px(1, scale), Math.max(2, scale / 3));
  }
  ctx.fillStyle = HORIZON[theme];
  for (const { tile } of args.futureTiles ?? []) {
    if (sees(tile, tile + 1, args.cameraX, viewEnd)) {
      ctx.fillRect(px(tile - args.cameraX, scale), 0, px(1, scale), height);
    }
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
      px(GROUND - 2, scale),
      px(2, scale),
      px(2, scale),
      scale,
      theme,
    );
  }

  if (args.selectionObject) {
    const item = args.selectionObject;
    ctx.strokeStyle = INK[theme];
    ctx.strokeRect(px(item.x - args.cameraX, scale) - 3, px(item.y, scale) - 3,
      px(item.w, scale) + 6, px(item.h, scale) + 6);
  }

  if (args.selectionTile != null && Number.isFinite(args.selectionTile)) {
    const band = Math.floor(args.selectionTile / BAND) * BAND;
    if (sees(band, band + BAND, args.cameraX, viewEnd)) {
      ctx.strokeStyle = INK[theme];
      ctx.strokeRect(px(band - args.cameraX, scale), 0, px(BAND, scale), height);
    }
  }
}
