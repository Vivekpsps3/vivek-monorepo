export interface PlayTable {
  id: "memory" | "rhythm";
  name: string;
}

export interface MemoryCard {
  index: number;
  symbol: string;
  face: "down" | "up" | "matched";
}

export interface MemoryBoard {
  cards: MemoryCard[];
  moves: number;
  open: number[];
}

export interface RhythmBoard {
  step: number;
  done: boolean;
  misses: number;
  last: "" | "hit" | "miss";
}

export interface ArcadeSession {
  ownerId: number;
  table: "memory" | "rhythm" | null;
  memory: MemoryBoard | null;
  rhythm: RhythmBoard | null;
  started: { memory: boolean; rhythm: boolean };
}

export const PLAY_TABLES: readonly PlayTable[];
export const MEMORY_SYMBOLS: readonly string[];
export const RHYTHM_LANES: readonly string[];
export const RHYTHM_PATTERN: readonly number[];
export const ARCADE_SEED: number;

export function dealMemory(seed: number): MemoryBoard;
export function flipMemory(board: MemoryBoard | null, index: number): MemoryBoard | null;
export function memoryComplete(board: MemoryBoard | null | undefined): boolean;
export function startRhythm(): RhythmBoard;
export function tapRhythm(board: RhythmBoard | null, lane: number): RhythmBoard | null;
export function rhythmPrompt(board: RhythmBoard | null | undefined): string;
export function beginTable(
  ownerId: number | null,
  tableId: string,
  previous: ArcadeSession | null,
): ArcadeSession | null;
export function closeTable(
  session: ArcadeSession | null,
  ownerId: number | null,
): ArcadeSession | null;
export function restartTable(
  session: ArcadeSession | null,
  ownerId: number | null,
  tableId: string,
): ArcadeSession | null;
export function playMemory(
  session: ArcadeSession | null,
  ownerId: number | null,
  index: number,
): ArcadeSession | null;
export function playRhythm(
  session: ArcadeSession | null,
  ownerId: number | null,
  lane: number,
): ArcadeSession | null;
export function tableUnopened(session: ArcadeSession | null, tableId: string): boolean;

export interface ArcadeStorage {
  length: number;
  key(index: number): string | null;
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export function readArcadePlay(
  storage: ArcadeStorage | null,
  ownerId: number | null,
): ArcadeSession | null;
export function writeArcadePlay(storage: ArcadeStorage | null, session: ArcadeSession | null): void;
export function clearArcadePlay(storage: ArcadeStorage | null): void;
