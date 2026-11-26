/** Memory Shelves. Seed 10 is the authored order. The score is turns, and nothing is timed. */

export const MEMORY_SYMBOLS = Object.freeze([
  'Lantern',
  'Ferry',
  'Shell',
  'Chart',
  'Bell',
  'Glass',
] as const);

export const MEMORY_SEED = 10;
export const MEMORY_COLUMNS = 4;
export const MEMORY_PLAY_PREFIX = 'town.memory-shelves.v1.';

export type MemorySymbol = (typeof MEMORY_SYMBOLS)[number];
export type MemoryFace = 'down' | 'up' | 'matched';
export type MemoryPhase = 'playing' | 'paused' | 'complete';

export interface MemoryTile {
  readonly index: number;
  readonly symbol: MemorySymbol;
  readonly face: MemoryFace;
}

export interface MemoryBoard {
  readonly seed: number;
  readonly tiles: readonly MemoryTile[];
  readonly moves: number;
  readonly open: readonly number[];
  readonly phase: MemoryPhase;
}

export interface MemoryPlay {
  readonly ownerId: number;
  readonly board: MemoryBoard | null;
  readonly lastMoves: number | null;
}

export interface MemoryStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
  readonly length: number;
  key(index: number): string | null;
}

const FACES: readonly MemoryFace[] = ['down', 'up', 'matched'];
const PHASES: readonly MemoryPhase[] = ['playing', 'paused', 'complete'];

function isSymbol(value: unknown): value is MemorySymbol {
  return typeof value === 'string' && (MEMORY_SYMBOLS as readonly string[]).includes(value);
}

function mix(length: number, seed: number): number[] {
  let state = seed >>> 0;
  if (state === 0) state = 1;
  const order = Array.from({ length }, (_, index) => index);
  for (let index = length - 1; index > 0; index -= 1) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    const swap = state % (index + 1);
    const current = order[index] ?? index;
    order[index] = order[swap] ?? swap;
    order[swap] = current;
  }
  return order;
}

export function dealMemory(seed: number = MEMORY_SEED): MemoryBoard {
  const faces: MemorySymbol[] = [];
  for (const symbol of MEMORY_SYMBOLS) faces.push(symbol, symbol);
  const order = mix(faces.length, seed);
  return {
    seed,
    tiles: order.map((slot, index) => ({
      index,
      symbol: faces[slot] ?? 'Lantern',
      face: 'down' as const,
    })),
    moves: 0,
    open: [],
    phase: 'playing',
  };
}

export function flipTile(board: MemoryBoard, index: number): MemoryBoard {
  if (board.phase !== 'playing') return board;
  const tile = board.tiles[index];
  if (!tile || tile.face !== 'down') return board;
  const tiles = board.tiles.map(item => ({ ...item }));
  let open = board.open.filter(id => tiles[id]?.face === 'up');
  if (open.length === 2) {
    for (const id of open) {
      const openTile = tiles[id];
      if (openTile) tiles[id] = { ...openTile, face: 'down' };
    }
    open = [];
  }
  const chosen = tiles[index];
  if (!chosen) return board;
  tiles[index] = { ...chosen, face: 'up' };
  open = [...open, index];
  let moves = board.moves;
  let phase: MemoryPhase = board.phase;
  if (open.length === 2) {
    moves += 1;
    const first = tiles[open[0] ?? -1];
    const second = tiles[open[1] ?? -1];
    if (first && second && first.symbol === second.symbol) {
      tiles[first.index] = { ...first, face: 'matched' };
      tiles[second.index] = { ...second, face: 'matched' };
      open = [];
      if (tiles.every(item => item.face === 'matched')) phase = 'complete';
    }
  }
  return { seed: board.seed, tiles, moves, open, phase };
}

export function pauseBoard(board: MemoryBoard): MemoryBoard {
  if (board.phase !== 'playing') return board;
  return { ...board, phase: 'paused' };
}

export function resumeBoard(board: MemoryBoard): MemoryBoard {
  if (board.phase !== 'paused') return board;
  return { ...board, phase: 'playing' };
}

export function restartBoard(board: MemoryBoard): MemoryBoard {
  return dealMemory(board.seed);
}

export function shelfLabel(tile: MemoryTile): string {
  const shelf = `Shelf ${tile.index + 1}`;
  if (tile.face === 'down') return `${shelf}, face down`;
  if (tile.face === 'matched') return `${shelf}, ${tile.symbol}, matched`;
  return `${shelf}, ${tile.symbol}`;
}

export function memoryStatus(board: MemoryBoard | null, lastMoves: number | null): string {
  if (!board) {
    if (lastMoves == null) return 'Turn two shelves. This game is not timed.';
    const noun = lastMoves === 1 ? 'move' : 'moves';
    return `Last game finished in ${lastMoves} ${noun}. This game is not timed.`;
  }
  const noun = board.moves === 1 ? 'move' : 'moves';
  if (board.phase === 'complete') return `All six pairs matched in ${board.moves} ${noun}.`;
  const moves = `${board.moves} ${noun}.`;
  const paired = board.tiles.filter(tile => tile.face === 'matched').length / 2;
  const progress = paired ? ` ${paired} of ${MEMORY_SYMBOLS.length} pairs matched.` : '';
  return `${board.phase === 'paused' ? 'Paused. ' : ''}${moves}${progress}`;
}

export function shelfStep(key: string, columns: number = MEMORY_COLUMNS): number | null {
  if (key === 'ArrowRight') return 1;
  if (key === 'ArrowLeft') return -1;
  if (key === 'ArrowDown') return columns;
  if (key === 'ArrowUp') return -columns;
  return null;
}

/** A match tone is optional. Reduced motion and sound-off finish the same turns. */
export function matchToneAllowed(sound: boolean, reduced: boolean): boolean {
  return sound && !reduced;
}

export function memoryPlayKey(ownerId: number): string {
  return `${MEMORY_PLAY_PREFIX}${ownerId}`;
}

export function memoryPlayStorage(): MemoryStorage | null {
  try {
    return typeof sessionStorage === 'undefined' ? null : sessionStorage;
  } catch {
    return null;
  }
}

function moveCount(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value > 1000) return null;
  return value;
}

function validBoard(value: unknown): MemoryBoard | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as {
    seed?: unknown;
    tiles?: unknown;
    moves?: unknown;
    open?: unknown;
    phase?: unknown;
  };
  if (record.seed !== MEMORY_SEED) return null;
  if (!Array.isArray(record.tiles) || record.tiles.length !== MEMORY_SYMBOLS.length * 2) return null;
  const moves = moveCount(record.moves);
  if (moves == null) return null;
  if (typeof record.phase !== 'string' || !PHASES.includes(record.phase as MemoryPhase)) return null;
  if (!Array.isArray(record.open) || record.open.length > 2) return null;
  const counts = new Map<string, number>();
  const tiles: MemoryTile[] = [];
  for (let index = 0; index < record.tiles.length; index += 1) {
    const tile = record.tiles[index] as { index?: unknown; symbol?: unknown; face?: unknown } | null;
    if (!tile || tile.index !== index || !isSymbol(tile.symbol)) return null;
    if (typeof tile.face !== 'string' || !FACES.includes(tile.face as MemoryFace)) return null;
    counts.set(tile.symbol, (counts.get(tile.symbol) ?? 0) + 1);
    tiles.push({ index, symbol: tile.symbol, face: tile.face as MemoryFace });
  }
  if (MEMORY_SYMBOLS.some(symbol => counts.get(symbol) !== 2)) return null;
  const open: number[] = [];
  for (const id of record.open) {
    if (typeof id !== 'number' || !Number.isInteger(id) || id < 0 || id >= tiles.length) return null;
    open.push(id);
  }
  const up = tiles.filter(tile => tile.face === 'up').map(tile => tile.index);
  if (up.length !== open.length || open.some(id => !up.includes(id))) return null;
  const phase = record.phase as MemoryPhase;
  const complete = tiles.every(tile => tile.face === 'matched');
  if (phase === 'complete' && (!complete || open.length !== 0)) return null;
  if (phase !== 'complete' && complete) return null;
  return { seed: MEMORY_SEED, tiles, moves, open, phase };
}

export function validMemoryPlay(value: unknown, ownerId: number): MemoryPlay | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as { ownerId?: unknown; board?: unknown; lastMoves?: unknown };
  if (record.ownerId !== ownerId) return null;
  const board = record.board == null ? null : validBoard(record.board);
  if (record.board != null && !board) return null;
  const lastMoves = record.lastMoves == null ? null : moveCount(record.lastMoves);
  if (record.lastMoves != null && lastMoves == null) return null;
  if (board?.phase === 'complete' && lastMoves !== board.moves) return null;
  return { ownerId, board, lastMoves };
}

export function readMemoryPlay(storage: MemoryStorage | null, ownerId: number): MemoryPlay | null {
  if (ownerId == null || !storage) return null;
  let raw: string | null = null;
  try {
    raw = storage.getItem(memoryPlayKey(ownerId));
  } catch {
    return null;
  }
  if (!raw) return null;
  try {
    return validMemoryPlay(JSON.parse(raw), ownerId);
  } catch {
    return null;
  }
}

export function writeMemoryPlay(storage: MemoryStorage | null, play: MemoryPlay): void {
  if (!storage || play.ownerId == null) return;
  storage.setItem(memoryPlayKey(play.ownerId), JSON.stringify(play));
}

export function clearMemoryPlay(storage: MemoryStorage | null): void {
  if (!storage) return;
  const keys: string[] = [];
  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index);
    if (key?.startsWith(MEMORY_PLAY_PREFIX)) keys.push(key);
  }
  for (const key of keys) storage.removeItem(key);
}
