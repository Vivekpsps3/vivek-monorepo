/** Arcade play tables. A session belongs to one owner and is not a library row. */

export const PLAY_TABLES = Object.freeze([
  Object.freeze({ id: "memory", name: "Memory Shelves" }),
  Object.freeze({ id: "rhythm", name: "Harbor Rhythm" }),
]);

export const MEMORY_SYMBOLS = Object.freeze([
  "Lantern",
  "Ferry",
  "Shell",
  "Chart",
  "Bell",
  "Glass",
]);

export const RHYTHM_LANES = Object.freeze(["Lane 1", "Lane 2", "Lane 3", "Lane 4"]);

/** Original four-step pattern. It is not a saved song and it does not play audio. */
export const RHYTHM_PATTERN = Object.freeze([0, 2, 1, 3]);

export const ARCADE_SEED = 10;

const STORAGE_PREFIX = "media-arcade-play:";

function mix(length, seed) {
  let state = seed >>> 0;
  if (state === 0) state = 1;
  const order = Array.from({ length }, (_, index) => index);
  for (let index = length - 1; index > 0; index -= 1) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    const swap = state % (index + 1);
    const current = order[index];
    order[index] = order[swap];
    order[swap] = current;
  }
  return order;
}

export function dealMemory(seed) {
  const faces = [];
  for (const symbol of MEMORY_SYMBOLS) faces.push(symbol, symbol);
  const order = mix(faces.length, seed);
  return {
    cards: order.map((slot, index) => ({
      index,
      symbol: faces[slot],
      face: "down",
    })),
    moves: 0,
    open: [],
  };
}

export function flipMemory(board, index) {
  if (!board || !Array.isArray(board.cards)) return board;
  const card = board.cards[index];
  if (!card || card.face === "matched" || card.face === "up") return board;
  const cards = board.cards.map((item) => ({ ...item }));
  let open = board.open.filter((id) => cards[id] && cards[id].face === "up");
  if (open.length === 2) {
    for (const id of open) cards[id] = { ...cards[id], face: "down" };
    open = [];
  }
  cards[index] = { ...cards[index], face: "up" };
  open = [...open, index];
  let moves = board.moves;
  if (open.length === 2) {
    moves += 1;
    const [first, second] = open;
    if (cards[first].symbol === cards[second].symbol) {
      cards[first] = { ...cards[first], face: "matched" };
      cards[second] = { ...cards[second], face: "matched" };
      open = [];
    }
  }
  return { cards, moves, open };
}

export function memoryComplete(board) {
  return Boolean(
    board &&
      board.cards.length > 0 &&
      board.cards.every((card) => card.face === "matched"),
  );
}

export function startRhythm() {
  return { step: 0, done: false, misses: 0, last: "" };
}

export function tapRhythm(board, lane) {
  if (!board || board.done) return board;
  if (!Number.isInteger(lane) || lane < 0 || lane >= RHYTHM_LANES.length) return board;
  if (lane !== RHYTHM_PATTERN[board.step]) {
    return { step: board.step, done: false, misses: board.misses + 1, last: "miss" };
  }
  const step = board.step + 1;
  const done = step >= RHYTHM_PATTERN.length;
  return { step, done, misses: board.misses, last: "hit" };
}

export function rhythmPrompt(board) {
  if (!board || board.done) return "";
  return RHYTHM_LANES[RHYTHM_PATTERN[board.step]] || "";
}

function blankSession(ownerId) {
  return {
    ownerId,
    table: null,
    memory: null,
    rhythm: null,
    started: { memory: false, rhythm: false },
  };
}

export function beginTable(ownerId, tableId, previous) {
  if (ownerId == null) return previous ?? null;
  if (previous && previous.ownerId !== ownerId) return previous;
  const base = previous && previous.ownerId === ownerId ? previous : blankSession(ownerId);
  if (tableId === "memory") {
    return {
      ...base,
      table: "memory",
      memory: base.memory ?? dealMemory(ARCADE_SEED),
      started: { ...base.started, memory: true },
    };
  }
  if (tableId === "rhythm") {
    return {
      ...base,
      table: "rhythm",
      rhythm: base.rhythm ?? startRhythm(),
      started: { ...base.started, rhythm: true },
    };
  }
  return base;
}

export function closeTable(session, ownerId) {
  if (!session || session.ownerId !== ownerId) return session;
  return { ...session, table: null };
}

export function restartTable(session, ownerId, tableId) {
  if (!session || session.ownerId !== ownerId) return session;
  if (tableId === "memory") {
    return {
      ...session,
      table: "memory",
      memory: dealMemory(ARCADE_SEED),
      started: { ...session.started, memory: true },
    };
  }
  if (tableId === "rhythm") {
    return {
      ...session,
      table: "rhythm",
      rhythm: startRhythm(),
      started: { ...session.started, rhythm: true },
    };
  }
  return session;
}

export function playMemory(session, ownerId, index) {
  if (!session || session.ownerId !== ownerId || session.table !== "memory" || !session.memory) {
    return session;
  }
  const memory = flipMemory(session.memory, index);
  if (memory === session.memory) return session;
  return { ...session, memory };
}

export function playRhythm(session, ownerId, lane) {
  if (!session || session.ownerId !== ownerId || session.table !== "rhythm" || !session.rhythm) {
    return session;
  }
  const rhythm = tapRhythm(session.rhythm, lane);
  if (rhythm === session.rhythm) return session;
  return { ...session, rhythm };
}

export function tableUnopened(session, tableId) {
  if (!session || !session.started) return true;
  return session.started[tableId] !== true;
}

function memoryBoard(value) {
  if (!value || !Array.isArray(value.cards) || value.cards.length !== 12) return null;
  if (!Number.isInteger(value.moves) || value.moves < 0 || value.moves > 1000) return null;
  if (!Array.isArray(value.open) || value.open.length > 2) return null;
  const counts = {};
  const cards = [];
  for (let index = 0; index < value.cards.length; index += 1) {
    const card = value.cards[index];
    if (!card || card.index !== index || !MEMORY_SYMBOLS.includes(card.symbol)) return null;
    if (card.face !== "down" && card.face !== "up" && card.face !== "matched") return null;
    counts[card.symbol] = (counts[card.symbol] || 0) + 1;
    cards.push({ index, symbol: card.symbol, face: card.face });
  }
  if (MEMORY_SYMBOLS.some((symbol) => counts[symbol] !== 2)) return null;
  const open = [];
  for (const id of value.open) {
    if (!Number.isInteger(id) || id < 0 || id > 11) return null;
    open.push(id);
  }
  return { cards, moves: value.moves, open };
}

function rhythmBoard(value) {
  if (!value) return null;
  const step = value.step;
  const misses = value.misses;
  const last = value.last;
  if (!Number.isInteger(step) || step < 0 || step > RHYTHM_PATTERN.length) return null;
  if (!Number.isInteger(misses) || misses < 0 || misses > 1000) return null;
  if (last !== "" && last !== "hit" && last !== "miss") return null;
  const done = step >= RHYTHM_PATTERN.length;
  if (value.done !== done) return null;
  return { step, done, misses, last: done ? "hit" : last };
}

function flag(value) {
  return value === true || value === false;
}

function validSession(value, ownerId) {
  if (!value || value.ownerId !== ownerId) return null;
  if (value.table !== null && value.table !== "memory" && value.table !== "rhythm") return null;
  const started = value.started;
  if (!started || !flag(started.memory) || !flag(started.rhythm)) return null;
  const memory = value.memory == null ? null : memoryBoard(value.memory);
  if (value.memory != null && !memory) return null;
  const rhythm = value.rhythm == null ? null : rhythmBoard(value.rhythm);
  if (value.rhythm != null && !rhythm) return null;
  if (started.memory && !memory) return null;
  if (started.rhythm && !rhythm) return null;
  if (value.table === "memory" && !memory) return null;
  if (value.table === "rhythm" && !rhythm) return null;
  return {
    ownerId,
    table: value.table,
    memory,
    rhythm,
    started: { memory: started.memory, rhythm: started.rhythm },
  };
}

export function readArcadePlay(storage, ownerId) {
  if (ownerId == null || !storage) return null;
  let raw = null;
  try {
    raw = storage.getItem(STORAGE_PREFIX + ownerId);
  } catch {
    return null;
  }
  if (!raw) return null;
  try {
    return validSession(JSON.parse(raw), ownerId);
  } catch {
    return null;
  }
}

export function writeArcadePlay(storage, session) {
  if (!storage || !session || session.ownerId == null) return;
  try {
    storage.setItem(STORAGE_PREFIX + session.ownerId, JSON.stringify(session));
  } catch {
    /* The table stays usable when storage is full or disabled. */
  }
}

export function clearArcadePlay(storage) {
  if (!storage) return;
  try {
    const keys = [];
    for (let index = 0; index < storage.length; index += 1) {
      const key = storage.key(index);
      if (key && key.startsWith(STORAGE_PREFIX)) keys.push(key);
    }
    for (const key of keys) storage.removeItem(key);
  } catch {
    /* private mode */
  }
}
