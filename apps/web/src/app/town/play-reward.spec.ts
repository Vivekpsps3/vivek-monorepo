import { startRhythm } from './harbor-rhythm';
import { dealMemory } from './memory-shelves';
import {
  REWARD_REPLAY,
  REWARD_SAVED,
  REWARD_UNSAVED,
  failedReward,
  harborFinishBody,
  memoryFinishBody,
  nextRewardAction,
  openedReward,
  openingReward,
  settledReward,
  validReward,
} from './play-reward';

const NONCE = 'abcdefghijklmnop';

describe('play receipts', () => {
  const openView = {
    nonce: NONCE,
    game_id: 'memory-shelves',
    seed: 10,
    status: 'open',
    score: null,
    rewarded: false,
    amount: 0,
  };

  it('keeps a receipt draft only when the nonce, seed, and phase agree', () => {
    expect(validReward(openingReward(10), 10)?.phase).toBe('opening');
    expect(validReward({ nonce: 'edited', seed: 10, phase: 'open', amount: 0, note: '' }, 10)).toBeNull();
    expect(validReward({ nonce: NONCE, seed: 11, phase: 'open', amount: 0, note: '' }, 10)).toBeNull();
    expect(validReward({ nonce: NONCE, seed: 10, phase: 'rewarded', amount: 0, note: '' }, 10)).toBeNull();
    expect(validReward({ nonce: NONCE, seed: 10, phase: 'open', amount: 5, note: '' }, 10)).toBeNull();
    expect(validReward({ nonce: null, seed: 10, phase: 'opening', amount: 0, note: 'x'.repeat(181) }, 10)).toBeNull();
    expect(validReward({ nonce: NONCE, seed: 10, phase: 'opening', amount: 0, note: '' }, 10)).toBeNull();
  });

  it('waits for the opened run and stops after a saved or replayed reward', () => {
    expect(nextRewardAction(openingReward(10), false)).toBe('wait');
    expect(nextRewardAction(openingReward(10), true)).toBe('open');
    expect(nextRewardAction({ nonce: NONCE, seed: 10, phase: 'open', amount: 0, note: '' }, false)).toBe('finish');
    expect(nextRewardAction({ nonce: NONCE, seed: 10, phase: 'saving', amount: 0, note: '' }, false)).toBe('stop');
    expect(nextRewardAction({ nonce: NONCE, seed: 10, phase: 'saving', amount: 0, note: '' }, true)).toBe('finish');
    expect(nextRewardAction({ nonce: NONCE, seed: 10, phase: 'failed', amount: 0, note: REWARD_UNSAVED }, false)).toBe('stop');
    expect(nextRewardAction({ nonce: null, seed: 10, phase: 'failed', amount: 0, note: '' }, false)).toBe('open');
    expect(nextRewardAction({ nonce: NONCE, seed: 10, phase: 'rewarded', amount: 5, note: REWARD_SAVED }, true)).toBe('stop');
    expect(nextRewardAction({ nonce: NONCE, seed: 10, phase: 'replay', amount: 0, note: REWARD_REPLAY }, true)).toBe('stop');
  });

  it('accepts the server view only when the game, seed, nonce, and score match', () => {
    expect(openedReward(openView, 'memory-shelves', 10)?.nonce).toBe(NONCE);
    expect(openedReward({ ...openView, game_id: 'harbor-rhythm' }, 'memory-shelves', 10)).toBeNull();
    expect(openedReward({ ...openView, status: 'complete', score: 6 }, 'memory-shelves', 10)).toBeNull();
    const saved = settledReward({ ...openView, status: 'complete', score: 6, rewarded: true, amount: 5 }, 'memory-shelves', 10, NONCE, 6);
    expect(saved).toEqual({ nonce: NONCE, seed: 10, phase: 'rewarded', amount: 5, note: REWARD_SAVED });
    const replay = settledReward({ ...openView, status: 'complete', score: 8, rewarded: false, amount: 0 }, 'memory-shelves', 10, NONCE, 8);
    expect(replay?.phase).toBe('replay');
    expect(replay?.note).toBe(REWARD_REPLAY);
    expect(settledReward({ ...openView, status: 'complete', score: 8, rewarded: false, amount: 0 }, 'memory-shelves', 10, NONCE, 6)).toBeNull();
    expect(failedReward({ nonce: NONCE, seed: 10, phase: 'saving', amount: 0, note: '' }, 10, true).note).toBe(REWARD_UNSAVED);
    expect(failedReward(null, 10, false).note).toBe('');
  });

  it('sends the board and chart without a life or finance field', () => {
    const memory = memoryFinishBody(dealMemory());
    expect(memory.seed).toBe(10);
    expect(memory.tiles).toHaveSize(12);
    expect(JSON.stringify(memory)).not.toMatch(/weight|blood|steps|finance|trip/i);
    const harbor = harborFinishBody(startRhythm('untimed'), 1);
    expect(harbor).toEqual(jasmine.objectContaining({ seed: 1, mode: 'untimed', elapsed: 0, wrong: 0 }));
    expect(harbor.notes).toHaveSize(16);
    expect(JSON.stringify(harbor)).not.toMatch(/weight|blood|steps|finance|trip/i);
  });
});
