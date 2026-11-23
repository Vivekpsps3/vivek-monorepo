import {
  MEMORY_SEED,
  MEMORY_SYMBOLS,
  clearMemoryPlay,
  dealMemory,
  flipTile,
  matchToneAllowed,
  memoryPlayKey,
  memoryStatus,
  pauseBoard,
  readMemoryPlay,
  restartBoard,
  resumeBoard,
  shelfLabel,
  shelfStep,
  validMemoryPlay,
  writeMemoryPlay,
  type MemoryBoard,
  type MemoryStorage,
} from './memory-shelves';

function box(): MemoryStorage {
  const items = new Map<string, string>();
  return {
    get length(): number { return items.size; },
    key(index: number): string | null { return [...items.keys()][index] ?? null; },
    getItem(key: string): string | null { return items.get(key) ?? null; },
    setItem(key: string, value: string): void { items.set(key, value); },
    removeItem(key: string): void { items.delete(key); },
  };
}

function pairs(board: MemoryBoard): number[][] {
  const groups = new Map<string, number[]>();
  for (const tile of board.tiles) {
    const list = groups.get(tile.symbol) ?? [];
    list.push(tile.index);
    groups.set(tile.symbol, list);
  }
  return [...groups.values()];
}

function finish(seed = MEMORY_SEED): MemoryBoard {
  let board = dealMemory(seed);
  for (const indexes of pairs(board)) {
    const [first, second] = indexes;
    if (first == null || second == null) throw new Error('pair');
    board = flipTile(board, first);
    board = flipTile(board, second);
  }
  return board;
}

describe('Memory Shelves', () => {
  it('deals six pairs from seed 10 and restarts the same order with no open tile', () => {
    const dealt = dealMemory();
    expect(dealt.seed).toBe(10);
    expect(dealt.tiles.map(tile => tile.symbol)).toEqual([
      'Bell', 'Ferry', 'Lantern', 'Lantern', 'Glass', 'Chart', 'Ferry', 'Glass', 'Chart', 'Shell', 'Shell', 'Bell',
    ]);
    expect(dealt.tiles.every(tile => tile.face === 'down')).toBeTrue();
    expect(dealt.moves).toBe(0);
    for (const symbol of MEMORY_SYMBOLS) {
      expect(dealt.tiles.filter(tile => tile.symbol === symbol).length).toBe(2);
    }
    expect(dealMemory(11).tiles.map(tile => tile.symbol)).not.toEqual(dealt.tiles.map(tile => tile.symbol));

    const done = finish();
    expect(done.phase).toBe('complete');
    expect(done.moves).toBe(6);
    expect(done.open).toEqual([]);
    expect(memoryStatus(done, done.moves)).toBe('All six pairs matched in 6 moves.');
    expect(flipTile(done, 0)).toBe(done);

    const again = restartBoard(done);
    expect(again.phase).toBe('playing');
    expect(again.moves).toBe(0);
    expect(again.open).toEqual([]);
    expect(again.tiles.every(tile => tile.face === 'down')).toBeTrue();
    expect(again.tiles.map(tile => tile.symbol)).toEqual(done.tiles.map(tile => tile.symbol));
    const reopened = flipTile(again, 2);
    expect(reopened.tiles[2]?.face).toBe('up');
    expect(reopened.tiles[2]?.symbol).toBe('Lantern');
    expect(reopened.moves).toBe(0);
  });

  it('counts a mismatch as one turn and keeps a paused pair', () => {
    let board = flipTile(dealMemory(), 0);
    board = flipTile(board, 1);
    expect(board.moves).toBe(1);
    expect(board.tiles[0]?.face).toBe('up');
    expect(board.tiles[1]?.face).toBe('up');
    expect(board.open).toEqual([0, 1]);
    board = flipTile(board, 2);
    expect(board.moves).toBe(1);
    expect(board.tiles[0]?.face).toBe('down');
    expect(board.tiles[1]?.face).toBe('down');
    expect(board.tiles[2]?.face).toBe('up');
    board = pauseBoard(board);
    expect(flipTile(board, 3)).toBe(board);
    expect(board.moves).toBe(1);
    board = resumeBoard(board);
    board = flipTile(board, 3);
    expect(board.tiles[2]?.face).toBe('matched');
    expect(board.tiles[3]?.face).toBe('matched');
    expect(board.moves).toBe(2);
    expect(board.open).toEqual([]);
    expect(shelfLabel(board.tiles[2]!)).toBe('Shelf 3, Lantern, matched');
    expect(shelfLabel(dealMemory().tiles[0]!)).toBe('Shelf 1, face down');
    expect(shelfStep('ArrowDown')).toBe(4);
    expect(shelfStep('ArrowLeft')).toBe(-1);
    expect(shelfStep('Enter')).toBeNull();
    expect(matchToneAllowed(false, false)).toBeFalse();
    expect(matchToneAllowed(true, true)).toBeFalse();
    expect(matchToneAllowed(true, false)).toBeTrue();
    expect(memoryStatus(null, null)).toContain('not timed');
    expect(memoryStatus(null, 6)).toBe('Last game finished in 6 moves. This game is not timed.');
  });

  it('stores one owner and drops a corrupt or foreign board', () => {
    const storage = box();
    let board = pauseBoard(flipTile(dealMemory(), 4));
    writeMemoryPlay(storage, { ownerId: 4, board, lastMoves: 8 });
    expect(readMemoryPlay(storage, 4)?.board?.tiles[4]?.face).toBe('up');
    expect(readMemoryPlay(storage, 4)?.lastMoves).toBe(8);
    expect(readMemoryPlay(storage, 5)).toBeNull();
    storage.setItem(memoryPlayKey(4), '{');
    expect(readMemoryPlay(storage, 4)).toBeNull();
    writeMemoryPlay(storage, { ownerId: 4, board: finish(), lastMoves: 5 });
    expect(readMemoryPlay(storage, 4)).toBeNull();
    writeMemoryPlay(storage, { ownerId: 9, board: null, lastMoves: 6 });
    expect(readMemoryPlay(storage, 9)).toEqual({ ownerId: 9, board: null, lastMoves: 6 });
    clearMemoryPlay(storage);
    expect(readMemoryPlay(storage, 9)).toBeNull();
    expect(validMemoryPlay({ ownerId: 4, board: { seed: 11 }, lastMoves: null }, 4)).toBeNull();
    board = dealMemory();
    expect(pauseBoard(board).phase).toBe('paused');
    expect(resumeBoard(board)).toBe(board);
  });
});
