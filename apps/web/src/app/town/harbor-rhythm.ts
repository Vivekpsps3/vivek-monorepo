/** Harbor Rhythm. Lantern Tide is an original 30-second four-lane chart, not a recording. */

import { validReward, type RewardDraft } from './play-reward';

export const RHYTHM_LANES = Object.freeze(['Bell', 'Glass', 'Lantern', 'Ferry'] as const);
export const RHYTHM_DURATION_MS = 30_000;
export const RHYTHM_TICK_MS = 100;
/** A note is playable from this many milliseconds before its beat until the same span after it. */
export const RHYTHM_WINDOW_MS = 800;
export const RHYTHM_PLAY_PREFIX = 'town.harbor-rhythm.v1.';
/** Chart identity stored on the play receipt. The board itself has no numeric seed. */
export const RHYTHM_SEED = 1;

export interface RhythmBeat {
  readonly lane: number;
  readonly at: number;
}

/** Sixteen beats, 1.8s apart, ending inside the 30-second chart. Windows do not overlap. */
export const RHYTHM_CHART: readonly RhythmBeat[] = Object.freeze([
  beat(0, 1_800),
  beat(1, 3_600),
  beat(2, 5_400),
  beat(3, 7_200),
  beat(2, 9_000),
  beat(0, 10_800),
  beat(3, 12_600),
  beat(1, 14_400),
  beat(0, 16_200),
  beat(2, 18_000),
  beat(3, 19_800),
  beat(1, 21_600),
  beat(2, 23_400),
  beat(0, 25_200),
  beat(1, 27_000),
  beat(3, 28_800),
]);

export type RhythmMode = 'timed' | 'untimed';
export type RhythmPhase = 'playing' | 'paused' | 'complete';
export type RhythmJudgment = 'pending' | 'hit' | 'miss';

export interface RhythmNote {
  readonly lane: number;
  readonly at: number;
  readonly result: RhythmJudgment;
}

export interface RhythmBoard {
  readonly mode: RhythmMode;
  readonly elapsed: number;
  readonly step: number;
  readonly wrong: number;
  readonly phase: RhythmPhase;
  readonly notes: readonly RhythmNote[];
}

export interface RhythmResult {
  readonly mode: RhythmMode;
  readonly accuracy: number;
}

export interface RhythmPlay {
  readonly ownerId: number;
  readonly board: RhythmBoard | null;
  readonly last: RhythmResult | null;
  readonly reward: RewardDraft | null;
}

export interface RhythmStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
  readonly length: number;
  key(index: number): string | null;
}

const MODES: readonly RhythmMode[] = ['timed', 'untimed'];
const PHASES: readonly RhythmPhase[] = ['playing', 'paused', 'complete'];
const JUDGMENTS: readonly RhythmJudgment[] = ['pending', 'hit', 'miss'];

function beat(lane: number, at: number): RhythmBeat {
  return Object.freeze({ lane, at });
}

export function startRhythm(mode: RhythmMode): RhythmBoard {
  return {
    mode,
    elapsed: 0,
    step: 0,
    wrong: 0,
    phase: 'playing',
    notes: RHYTHM_CHART.map(item => ({ lane: item.lane, at: item.at, result: 'pending' as const })),
  };
}

export function accuracyOf(board: RhythmBoard): number | null {
  const hits = board.notes.filter(note => note.result === 'hit').length;
  const missed = board.notes.filter(note => note.result === 'miss').length;
  const total = hits + missed + board.wrong;
  if (total === 0) return null;
  return Math.round((hits / total) * 100);
}

export function finishedResult(board: RhythmBoard): RhythmResult | null {
  if (board.phase !== 'complete') return null;
  return { mode: board.mode, accuracy: accuracyOf(board) ?? 0 };
}

export function dueLane(board: RhythmBoard): number | null {
  if (board.phase !== 'playing') return null;
  if (board.mode === 'untimed') return board.notes[board.step]?.lane ?? null;
  const open = board.notes.find(note => note.result === 'pending' && inWindow(board.elapsed, note.at));
  return open?.lane ?? null;
}

/** 0 is the hit line and 1 is the far end of the lane. Null hides the marker. */
export function noteTravel(note: RhythmNote, elapsed: number): number | null {
  if (note.result !== 'pending') return null;
  const lead = 1_600;
  const early = note.at - elapsed;
  if (early > lead || early < -RHYTHM_WINDOW_MS) return null;
  return Math.min(1, Math.max(0, early / lead));
}

export function advanceRhythm(board: RhythmBoard, ms: number): RhythmBoard {
  if (board.phase !== 'playing' || board.mode !== 'timed') return board;
  if (!Number.isInteger(ms) || ms <= 0) return board;
  const elapsed = Math.min(RHYTHM_DURATION_MS, board.elapsed + ms);
  let changed = elapsed !== board.elapsed;
  const notes = board.notes.map(note => {
    if (note.result !== 'pending') return note;
    if (elapsed <= note.at + RHYTHM_WINDOW_MS) return note;
    changed = true;
    return { ...note, result: 'miss' as const };
  });
  if (!changed) return board;
  const done = elapsed >= RHYTHM_DURATION_MS;
  return { ...board, elapsed, notes, phase: done ? 'complete' : board.phase };
}

export function playLane(board: RhythmBoard, lane: number): RhythmBoard {
  if (board.phase !== 'playing') return board;
  if (!Number.isInteger(lane) || lane < 0 || lane >= RHYTHM_LANES.length) return board;
  if (board.mode === 'untimed') return playSequence(board, lane);
  const index = board.notes.findIndex(note => note.result === 'pending' && inWindow(board.elapsed, note.at));
  if (index < 0 || board.notes[index]?.lane !== lane) {
    return { ...board, wrong: cap(board.wrong + 1) };
  }
  const notes = board.notes.map((note, noteIndex) => noteIndex === index ? { ...note, result: 'hit' as const } : note);
  return { ...board, notes };
}

export function pauseRhythm(board: RhythmBoard): RhythmBoard {
  if (board.phase !== 'playing') return board;
  return { ...board, phase: 'paused' };
}

export function resumeRhythm(board: RhythmBoard): RhythmBoard {
  if (board.phase !== 'paused') return board;
  return { ...board, phase: 'playing' };
}

export function restartRhythm(board: RhythmBoard): RhythmBoard {
  return startRhythm(board.mode);
}

export function laneLabel(index: number, due: boolean): string {
  const name = RHYTHM_LANES[index] ?? 'Lane';
  return due ? `${name} lane, play now` : `${name} lane`;
}

export function laneFromKey(key: string): number | null {
  if (key === '1' || key === '2' || key === '3' || key === '4') return Number(key) - 1;
  return null;
}

export function laneStep(key: string): number | null {
  if (key === 'ArrowRight') return 1;
  if (key === 'ArrowLeft') return -1;
  return null;
}

export function rhythmStatus(board: RhythmBoard | null, last: RhythmResult | null): string {
  if (!board) {
    if (!last) return 'Play the 30-second chart or the untimed sequence.';
    const kind = last.mode === 'timed' ? '30-second chart' : 'untimed sequence';
    return `Last ${kind} finished at ${last.accuracy}% accuracy.`;
  }
  const score = accuracyPhrase(board);
  if (board.phase === 'complete') {
    const kind = board.mode === 'timed' ? '30-second chart' : 'Untimed sequence';
    return `Win. ${kind} complete. ${score}`;
  }
  const paused = board.phase === 'paused' ? 'Paused. ' : '';
  if (board.mode === 'untimed') {
    const next = RHYTHM_LANES[board.notes[board.step]?.lane ?? -1] ?? 'lane';
    return `${paused}${board.step} of ${board.notes.length}. Next ${next}. ${score}`;
  }
  const left = Math.max(0, Math.ceil((RHYTHM_DURATION_MS - board.elapsed) / 1000));
  const noun = left === 1 ? 'second' : 'seconds';
  return `${paused}${left} ${noun} left. ${score}`;
}

/** A hit tone is optional. Reduced motion and sound-off finish the same chart. */
export function rhythmToneAllowed(sound: boolean, reduced: boolean): boolean {
  return sound && !reduced;
}

export function rhythmPlayKey(ownerId: number): string {
  return `${RHYTHM_PLAY_PREFIX}${ownerId}`;
}

export function rhythmPlayStorage(): RhythmStorage | null {
  try {
    return typeof sessionStorage === 'undefined' ? null : sessionStorage;
  } catch {
    return null;
  }
}

export function readRhythmPlay(storage: RhythmStorage | null, ownerId: number): RhythmPlay | null {
  if (!storage) return null;
  let raw: string | null = null;
  try {
    raw = storage.getItem(rhythmPlayKey(ownerId));
  } catch {
    return null;
  }
  if (!raw) return null;
  try {
    return validPlay(JSON.parse(raw), ownerId);
  } catch {
    return null;
  }
}

export function writeRhythmPlay(storage: RhythmStorage | null, play: RhythmPlay): void {
  if (!storage) return;
  storage.setItem(rhythmPlayKey(play.ownerId), JSON.stringify(play));
}

export function clearRhythmPlay(storage: RhythmStorage | null): void {
  if (!storage) return;
  const keys: string[] = [];
  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index);
    if (key?.startsWith(RHYTHM_PLAY_PREFIX)) keys.push(key);
  }
  for (const key of keys) storage.removeItem(key);
}

function playSequence(board: RhythmBoard, lane: number): RhythmBoard {
  const note = board.notes[board.step];
  if (!note) return board;
  if (note.lane !== lane) return { ...board, wrong: cap(board.wrong + 1) };
  const notes = board.notes.map((item, index) => index === board.step ? { ...item, result: 'hit' as const } : item);
  const step = board.step + 1;
  return { ...board, notes, step, phase: step >= notes.length ? 'complete' : 'playing' };
}

function inWindow(elapsed: number, at: number): boolean {
  return Math.abs(elapsed - at) <= RHYTHM_WINDOW_MS;
}

function cap(value: number): number {
  return Math.min(1000, value);
}

function accuracyPhrase(board: RhythmBoard): string {
  const value = accuracyOf(board);
  if (value == null) return 'Accuracy not scored yet.';
  return `Accuracy ${value}%.`;
}

function validCount(value: unknown, max: number): number | null {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value > max) return null;
  return value;
}

function validResult(value: unknown): RhythmResult | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as { mode?: unknown; accuracy?: unknown };
  if (typeof record.mode !== 'string' || !MODES.includes(record.mode as RhythmMode)) return null;
  const accuracy = validCount(record.accuracy, 100);
  if (accuracy == null) return null;
  return { mode: record.mode as RhythmMode, accuracy };
}

function validBoard(value: unknown): RhythmBoard | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as {
    mode?: unknown;
    elapsed?: unknown;
    step?: unknown;
    wrong?: unknown;
    phase?: unknown;
    notes?: unknown;
  };
  if (typeof record.mode !== 'string' || !MODES.includes(record.mode as RhythmMode)) return null;
  if (typeof record.phase !== 'string' || !PHASES.includes(record.phase as RhythmPhase)) return null;
  if (!Array.isArray(record.notes) || record.notes.length !== RHYTHM_CHART.length) return null;
  const mode = record.mode as RhythmMode;
  const phase = record.phase as RhythmPhase;
  const elapsed = validCount(record.elapsed, RHYTHM_DURATION_MS);
  const step = validCount(record.step, RHYTHM_CHART.length);
  const wrong = validCount(record.wrong, 1000);
  if (elapsed == null || step == null || wrong == null) return null;
  const notes: RhythmNote[] = [];
  for (let index = 0; index < record.notes.length; index += 1) {
    const note = record.notes[index] as { lane?: unknown; at?: unknown; result?: unknown } | null;
    const authored = RHYTHM_CHART[index];
    if (!note || !authored || note.lane !== authored.lane || note.at !== authored.at) return null;
    if (typeof note.result !== 'string' || !JUDGMENTS.includes(note.result as RhythmJudgment)) return null;
    notes.push({ lane: authored.lane, at: authored.at, result: note.result as RhythmJudgment });
  }
  if (mode === 'untimed') {
    if (elapsed !== 0) return null;
    if (notes.some(note => note.result === 'miss')) return null;
    const hits = notes.filter(note => note.result === 'hit').length;
    if (hits !== step) return null;
    if (notes.some((note, index) => note.result !== (index < step ? 'hit' : 'pending'))) return null;
  } else {
    if (step !== 0 || elapsed % RHYTHM_TICK_MS !== 0) return null;
    for (const note of notes) {
      if (note.result === 'pending' && elapsed > note.at + RHYTHM_WINDOW_MS) return null;
      if (note.result === 'miss' && elapsed <= note.at + RHYTHM_WINDOW_MS) return null;
      if (note.result === 'hit' && elapsed < note.at - RHYTHM_WINDOW_MS) return null;
    }
  }
  const pending = notes.some(note => note.result === 'pending');
  if (phase === 'complete' && (pending || (mode === 'timed' && elapsed < RHYTHM_DURATION_MS) || (mode === 'untimed' && step !== notes.length))) {
    return null;
  }
  if (phase !== 'complete' && !pending) return null;
  if (phase !== 'complete' && mode === 'timed' && elapsed >= RHYTHM_DURATION_MS) return null;
  return { mode, elapsed, step, wrong, phase, notes };
}

function validPlay(value: unknown, ownerId: number): RhythmPlay | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as { ownerId?: unknown; board?: unknown; last?: unknown; reward?: unknown };
  if (record.ownerId !== ownerId) return null;
  const board = record.board == null ? null : validBoard(record.board);
  if (record.board != null && !board) return null;
  const last = record.last == null ? null : validResult(record.last);
  if (record.last != null && !last) return null;
  if (board?.phase === 'complete') {
    const finished = finishedResult(board);
    if (!last || !finished || last.mode !== finished.mode || last.accuracy !== finished.accuracy) return null;
  }
  const reward = record.reward == null ? null : validReward(record.reward, RHYTHM_SEED);
  return { ownerId, board, last, reward };
}
