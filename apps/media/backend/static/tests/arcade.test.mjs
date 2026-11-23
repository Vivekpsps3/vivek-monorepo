import assert from "node:assert/strict";
import test from "node:test";
import {
  ARCADE_SEED,
  MEMORY_SYMBOLS,
  RHYTHM_PATTERN,
  beginTable,
  clearArcadePlay,
  closeTable,
  dealMemory,
  memoryComplete,
  playMemory,
  playRhythm,
  readArcadePlay,
  restartTable,
  tableUnopened,
  writeArcadePlay,
} from "../../../frontend/src/arcade.mjs";

class MemoryStorage {
  constructor() {
    this.map = new Map();
  }

  get length() {
    return this.map.size;
  }

  key(index) {
    return [...this.map.keys()][index] ?? null;
  }

  getItem(key) {
    return this.map.has(key) ? this.map.get(key) : null;
  }

  setItem(key, value) {
    this.map.set(String(key), String(value));
  }

  removeItem(key) {
    this.map.delete(key);
  }
}

function matchSymbol(session, ownerId, symbol) {
  const remaining = () =>
    session.memory.cards
      .filter((card) => card.symbol === symbol && card.face === "down")
      .map((card) => card.index);
  let indexes = remaining();
  if (session.memory.open.length === 2) {
    session = playMemory(session, ownerId, indexes[0]);
    indexes = remaining();
  }
  session = playMemory(session, ownerId, indexes[0]);
  indexes = remaining();
  session = playMemory(session, ownerId, indexes[0]);
  return session;
}

test("memory shelves deals six pairs and keeps a mismatch visible", () => {
  const board = dealMemory(ARCADE_SEED);
  assert.equal(board.cards.length, 12);
  assert.equal(board.moves, 0);
  for (const symbol of MEMORY_SYMBOLS) {
    assert.equal(board.cards.filter((card) => card.symbol === symbol).length, 2);
  }
  assert.deepEqual(dealMemory(ARCADE_SEED), board);
  assert.notDeepEqual(
    dealMemory(ARCADE_SEED + 1).cards.map((card) => card.symbol),
    board.cards.map((card) => card.symbol),
  );
  let session = beginTable(1, "memory", null);
  const other = session.memory.cards.findIndex((card) => card.symbol !== session.memory.cards[0].symbol);
  session = playMemory(session, 1, 0);
  session = playMemory(session, 1, other);
  assert.equal(session.memory.moves, 1);
  assert.equal(session.memory.cards[0].face, "up");
  assert.equal(session.memory.cards[other].face, "up");
  const third = session.memory.cards.findIndex((card) => card.face === "down");
  const previous = session.memory.cards[0].face;
  session = playMemory(session, 1, third);
  assert.equal(previous, "up");
  assert.equal(session.memory.cards[0].face, "down");
  assert.equal(session.memory.cards[other].face, "down");
  assert.equal(session.memory.cards[third].face, "up");
});

test("matching every pair and the rhythm pattern stays with that owner", () => {
  assert.equal(tableUnopened(null, "memory"), true);
  let session = beginTable(1, "memory", null);
  assert.equal(tableUnopened(session, "memory"), false);
  assert.equal(tableUnopened(session, "rhythm"), true);
  const untouched = session;
  assert.equal(playMemory(session, 2, 0), untouched);
  assert.equal(beginTable(2, "rhythm", session), session);
  for (const symbol of MEMORY_SYMBOLS) session = matchSymbol(session, 1, symbol);
  assert.equal(memoryComplete(session.memory), true);
  assert.equal(session.memory.moves, 6);
  assert.equal(untouched.memory.cards[0].face, "down");
  session = closeTable(session, 2);
  assert.equal(session.table, "memory");
  session = closeTable(session, 1);
  assert.equal(session.table, null);
  assert.equal(tableUnopened(session, "memory"), false);

  session = beginTable(1, "rhythm", session);
  const missed = playRhythm(session, 1, RHYTHM_PATTERN[0] === 0 ? 1 : 0);
  assert.equal(missed.rhythm.step, 0);
  assert.equal(missed.rhythm.last, "miss");
  assert.equal(playRhythm(missed, 8, RHYTHM_PATTERN[0]).rhythm.step, 0);
  let rhythm = missed;
  for (const lane of RHYTHM_PATTERN) rhythm = playRhythm(rhythm, 1, lane);
  assert.equal(rhythm.rhythm.done, true);
  assert.equal(rhythm.rhythm.misses, 1);
  assert.equal(playRhythm(rhythm, 1, 0), rhythm);
  const restarted = restartTable(rhythm, 1, "rhythm");
  assert.equal(restarted.rhythm.step, 0);
  assert.equal(restarted.rhythm.done, false);
  assert.equal(restartTable(rhythm, 2, "rhythm"), rhythm);
});

test("play storage is per owner and drops a broken session", () => {
  const storage = new MemoryStorage();
  const memory = playMemory(beginTable(1, "memory", null), 1, 0);
  const rhythm = beginTable(2, "rhythm", null);
  writeArcadePlay(storage, memory);
  writeArcadePlay(storage, rhythm);
  assert.equal(readArcadePlay(storage, 2).table, "rhythm");
  assert.equal(readArcadePlay(storage, 1).memory.cards[0].face, "up");
  assert.equal(readArcadePlay(storage, 3), null);
  storage.setItem("media-arcade-play:1", "{");
  assert.equal(readArcadePlay(storage, 1), null);
  storage.setItem(
    "media-arcade-play:1",
    JSON.stringify({
      ownerId: 1,
      table: "memory",
      memory: { cards: [], moves: 0, open: [] },
      rhythm: null,
      started: { memory: true, rhythm: false },
    }),
  );
  assert.equal(readArcadePlay(storage, 1), null);
  assert.equal(readArcadePlay(storage, 2).table, "rhythm");
  clearArcadePlay(storage);
  assert.equal(readArcadePlay(storage, 2), null);
  assert.equal(storage.length, 0);
});
