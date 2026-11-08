import type { Chunk } from '../engine/types';

const BITMAP_CAP = 24;
const FRAME_NEW_CAP = 2;

export interface ChunkCache {
  chunkFor(inputKey: string): Chunk | undefined;
  remember(inputKey: string, chunk: Chunk): void;
}

export function createChunkCache(): ChunkCache {
  const chunks = new Map<string, Chunk>();
  return {
    chunkFor(inputKey) {
      return chunks.get(inputKey);
    },
    remember(inputKey, chunk) {
      chunks.set(inputKey, chunk);
    },
  };
}

export interface BitmapCache {
  get(key: string): CanvasImageSource | undefined;
  put(key: string, bitmap: CanvasImageSource, frameBudget: { left: number }): boolean;
  resetFrame(): void;
}

export function bitmapKey(inputKey: string, scale: number, theme: string): string {
  return `${inputKey}|${scale}|${theme}`;
}

export function createBitmapCache(): BitmapCache {
  const bitmaps = new Map<string, CanvasImageSource>();
  let storedThisFrame = 0;

  const remember = (key: string, bitmap: CanvasImageSource): void => {
    bitmaps.delete(key);
    bitmaps.set(key, bitmap);
    while (bitmaps.size > BITMAP_CAP) {
      const oldest = bitmaps.keys().next().value;
      if (oldest === undefined) break;
      bitmaps.delete(oldest);
    }
  };

  return {
    get(key) {
      const bitmap = bitmaps.get(key);
      if (bitmap === undefined) return undefined;
      remember(key, bitmap);
      return bitmap;
    },
    put(key, bitmap, frameBudget) {
      const existing = bitmaps.has(key);
      if (!existing && storedThisFrame >= FRAME_NEW_CAP) {
        frameBudget.left = 0;
        return false;
      }
      remember(key, bitmap);
      if (!existing) storedThisFrame += 1;
      frameBudget.left = Math.max(0, FRAME_NEW_CAP - storedThisFrame);
      return true;
    },
    resetFrame() {
      storedThisFrame = 0;
    },
  };
}
