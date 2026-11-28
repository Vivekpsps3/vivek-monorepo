/** A minigame reward draft. The server, not this browser, decides the Stamp grant. */

import type { MemoryBoard } from './memory-shelves';
import type { RhythmBoard } from './harbor-rhythm';

export const REWARD_RULE =
  'The first win each Town day grants 5 Stamps. A replay keeps the score and grants no more. This play does not save a life record.';
export const REWARD_SAVED = '5 Stamps for this Town day. A replay keeps the score and adds none.';
export const REWARD_REPLAY = 'Score kept. No extra Stamps for this game today.';
export const REWARD_UNSAVED = 'This win is still here. The reward was not saved.';

const PHASES = ['opening', 'open', 'saving', 'rewarded', 'replay', 'failed'] as const;
const NONCE = /^[A-Za-z0-9_-]{16,64}$/;

export type RewardPhase = (typeof PHASES)[number];
export type RewardAction = 'wait' | 'open' | 'finish' | 'stop';

export interface RewardDraft {
  readonly nonce: string | null;
  readonly seed: number;
  readonly phase: RewardPhase;
  readonly amount: 0 | 5;
  readonly note: string;
}

export interface RewardRun {
  readonly nonce: string;
  readonly game_id: string;
  readonly seed: number;
  readonly status: string;
  readonly score: number | null;
  readonly rewarded: boolean;
  readonly amount: number;
}

export function openingReward(seed: number): RewardDraft {
  return { nonce: null, seed, phase: 'opening', amount: 0, note: '' };
}

export function validReward(value: unknown, seed: number): RewardDraft | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as {
    nonce?: unknown;
    seed?: unknown;
    phase?: unknown;
    amount?: unknown;
    note?: unknown;
  };
  if (record.seed !== seed) return null;
  if (typeof record.phase !== 'string' || !PHASES.includes(record.phase as RewardPhase)) return null;
  const phase = record.phase as RewardPhase;
  const nonce = record.nonce == null ? null : record.nonce;
  if (nonce != null && (typeof nonce !== 'string' || !NONCE.test(nonce))) return null;
  if (phase === 'opening' && nonce != null) return null;
  if (phase !== 'opening' && phase !== 'failed' && nonce == null) return null;
  if (record.amount !== 0 && record.amount !== 5) return null;
  if (phase === 'rewarded' && record.amount !== 5) return null;
  if (phase !== 'rewarded' && record.amount !== 0) return null;
  if (typeof record.note !== 'string' || record.note.length > 180) return null;
  return { nonce, seed, phase, amount: record.amount, note: record.note };
}

/** `force` is a restored board or an explicit retry. A failed open does not call itself again. */
export function nextRewardAction(reward: RewardDraft | null, force: boolean): RewardAction {
  if (!reward) return force ? 'open' : 'stop';
  if (reward.phase === 'rewarded' || reward.phase === 'replay') return 'stop';
  if (reward.phase === 'saving') return force ? (reward.nonce ? 'finish' : 'open') : 'stop';
  if (reward.phase === 'opening') return force ? 'open' : 'wait';
  if (reward.phase === 'failed' && !force && reward.note) return 'stop';
  return reward.nonce ? 'finish' : 'open';
}

export function openedReward(value: unknown, gameId: string, seed: number): RewardDraft | null {
  const view = rewardRun(value);
  if (!view || view.game_id !== gameId || view.seed !== seed || view.status !== 'open') return null;
  if (!NONCE.test(view.nonce)) return null;
  return { nonce: view.nonce, seed, phase: 'open', amount: 0, note: '' };
}

export function settledReward(
  value: unknown,
  gameId: string,
  seed: number,
  nonce: string,
  score: number,
): RewardDraft | null {
  const view = rewardRun(value);
  if (!view || view.nonce !== nonce || view.game_id !== gameId || view.seed !== seed) return null;
  if (view.status !== 'complete' || view.score !== score) return null;
  if ((view.amount !== 0 && view.amount !== 5) || view.rewarded !== (view.amount === 5)) return null;
  const phase = view.amount === 5 ? 'rewarded' : 'replay';
  return {
    nonce,
    seed,
    phase,
    amount: view.amount,
    note: phase === 'rewarded' ? REWARD_SAVED : REWARD_REPLAY,
  };
}

export function failedReward(current: RewardDraft | null, seed: number, show: boolean): RewardDraft {
  return {
    nonce: current?.nonce ?? null,
    seed,
    phase: 'failed',
    amount: 0,
    note: show ? REWARD_UNSAVED : '',
  };
}

export function savingReward(current: RewardDraft): RewardDraft {
  return { nonce: current.nonce, seed: current.seed, phase: 'saving', amount: 0, note: '' };
}

export function memoryFinishBody(board: MemoryBoard): {
  seed: number;
  moves: number;
  tiles: { index: number; symbol: string; face: string }[];
} {
  return {
    seed: board.seed,
    moves: board.moves,
    tiles: board.tiles.map(tile => ({ index: tile.index, symbol: tile.symbol, face: tile.face })),
  };
}

export function harborFinishBody(board: RhythmBoard, seed: number): {
  seed: number;
  mode: RhythmBoard['mode'];
  elapsed: number;
  wrong: number;
  notes: { lane: number; at: number; result: string }[];
} {
  return {
    seed,
    mode: board.mode,
    elapsed: board.elapsed,
    wrong: board.wrong,
    notes: board.notes.map(note => ({ lane: note.lane, at: note.at, result: note.result })),
  };
}

function rewardRun(value: unknown): RewardRun | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  if (typeof record['nonce'] !== 'string' || typeof record['game_id'] !== 'string') return null;
  if (typeof record['seed'] !== 'number' || typeof record['status'] !== 'string') return null;
  if (record['score'] != null && typeof record['score'] !== 'number') return null;
  if (typeof record['rewarded'] !== 'boolean' || typeof record['amount'] !== 'number') return null;
  return {
    nonce: record['nonce'],
    game_id: record['game_id'],
    seed: record['seed'],
    status: record['status'],
    score: record['score'] == null ? null : record['score'],
    rewarded: record['rewarded'],
    amount: record['amount'],
  };
}
