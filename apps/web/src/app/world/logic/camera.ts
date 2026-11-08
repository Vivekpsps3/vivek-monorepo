import { BAND, CHUNK_W } from '../engine/constants';
import { DISTRICT_TILES, GUIDE_SPAWN_X, PIER_TILES } from '../town-layout';
import type { CameraCommand } from '../world.types';
import { isoMonday } from './paging';

const REDUCED_QUERY = '(prefers-reduced-motion: reduce)';

export interface CameraModel {
  x: number;
  reduced: boolean;
}

export interface CameraLayout {
  weekCount: number;
  viewportTiles: number;
  startWeek: string;
  currentWeek: string;
  /** Loaded weeks, oldest first. Index 0 is tile 0. */
  weeks: readonly string[];
}

export function scaleForWidth(cssWidth: number): 2 | 3 {
  return cssWidth < 1024 ? 2 : 3;
}

export function prefersReducedMotion(match?: (query: string) => boolean): boolean {
  try {
    if (match) return match(REDUCED_QUERY);
    if (typeof matchMedia !== 'function') return false;
    return matchMedia(REDUCED_QUERY).matches;
  } catch {
    return false;
  }
}

export function panDurationMs(reduced: boolean): number {
  return reduced ? 0 : 200;
}

export function inertiaFactor(reduced: boolean): number {
  return reduced ? 0 : 0.92;
}

export function isTap(distancePx: number): boolean {
  return distancePx < 6;
}

export function shouldScheduleFrame(moving: boolean, dragging: boolean): boolean {
  return moving || dragging;
}

export function snapWeek(iso: string, startWeek: string, currentWeek: string): string {
  const monday = isoMonday(iso);
  if (monday < startWeek) return startWeek;
  if (monday > currentWeek) return currentWeek;
  return monday;
}

export function tileOfDay(weekIndex: number, day: number): number {
  return weekIndex * CHUNK_W + day * BAND;
}

function totalTiles(weekCount: number): number {
  return weekCount * CHUNK_W + DISTRICT_TILES + PIER_TILES;
}

function clampX(x: number, viewportTiles: number, tiles: number): number {
  const max = Math.max(0, tiles - viewportTiles);
  return Math.min(max, Math.max(0, x));
}

/** Viewport center sits on the middle of that day's 8-tile band. */
function centerOnDay(weekIndex: number, day: number, viewportTiles: number, tiles: number): number {
  return clampX(tileOfDay(weekIndex, day) + BAND / 2 - viewportTiles / 2, viewportTiles, tiles);
}

function clampDay(day: number | undefined): number {
  if (day === undefined || !Number.isFinite(day)) return 0;
  const whole = Math.trunc(day);
  if (whole < 0) return 0;
  if (whole > 6) return 6;
  return whole;
}

function weekIndexFor(weeks: readonly string[], snapped: string): number {
  const exact = weeks.indexOf(snapped);
  if (exact >= 0) return exact;
  if (weeks.length === 0) return 0;
  const target = Date.parse(`${snapped}T00:00:00Z`);
  let best = 0;
  let bestGap = Number.POSITIVE_INFINITY;
  for (let index = 0; index < weeks.length; index += 1) {
    const gap = Math.abs(Date.parse(`${weeks[index]}T00:00:00Z`) - target);
    if (gap < bestGap) {
      best = index;
      bestGap = gap;
    }
  }
  return best;
}

export function applyCamera(model: CameraModel, command: CameraCommand, layout: CameraLayout): CameraModel {
  const tiles = totalTiles(layout.weekCount);
  const reduced = model.reduced;
  switch (command.type) {
    case 'band':
      return { x: clampX(model.x + command.delta * BAND, layout.viewportTiles, tiles), reduced };
    case 'week':
      return { x: clampX(model.x + command.delta * CHUNK_W, layout.viewportTiles, tiles), reduced };
    case 'home':
      return { x: centerOnDay(0, 0, layout.viewportTiles, tiles), reduced };
    case 'end':
      return {
        x: clampX(layout.weekCount * CHUNK_W + GUIDE_SPAWN_X - layout.viewportTiles / 2, layout.viewportTiles, tiles),
        reduced,
      };
    case 'jump': {
      const snapped = snapWeek(command.week, layout.startWeek, layout.currentWeek);
      const index = weekIndexFor(layout.weeks, snapped);
      return { x: centerOnDay(index, clampDay(command.day), layout.viewportTiles, tiles), reduced };
    }
    case 'drag':
      return { x: clampX(model.x + command.dxTiles, layout.viewportTiles, tiles), reduced };
    case 'select-center':
      return { x: clampX(model.x, layout.viewportTiles, tiles), reduced };
    default: {
      const unexpected: never = command;
      return unexpected;
    }
  }
}

export function bandAt(
  x: number,
  viewportTiles: number,
  weeks: readonly string[],
): { week: string; day: number; inTown: boolean } {
  const center = x + viewportTiles / 2;
  const loadedTiles = weeks.length * CHUNK_W;
  // A desktop viewport is wider than the district, so the clamp stops before
  // the center can enter Town. End still parks on that clamp with Town in view.
  const mapTiles = loadedTiles + DISTRICT_TILES + PIER_TILES;
  const maxX = Math.max(0, mapTiles - viewportTiles);
  const atEnd = maxX > 0 && x >= maxX - 0.01;
  const townInView = x + viewportTiles > loadedTiles;
  if (weeks.length === 0 || center >= loadedTiles || (atEnd && townInView)) {
    return { week: weeks.length > 0 ? weeks[weeks.length - 1] : '', day: 6, inTown: true };
  }
  const safe = center < 0 ? 0 : center;
  const weekIndex = Math.min(weeks.length - 1, Math.floor(safe / CHUNK_W));
  const day = Math.min(6, Math.floor((safe - weekIndex * CHUNK_W) / BAND));
  return { week: weeks[weekIndex] ?? '', day, inTown: false };
}
