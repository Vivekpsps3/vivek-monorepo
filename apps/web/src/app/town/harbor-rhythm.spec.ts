import {
  RHYTHM_CHART,
  RHYTHM_DURATION_MS,
  RHYTHM_LANES,
  RHYTHM_PLAY_PREFIX,
  RHYTHM_WINDOW_MS,
  accuracyOf,
  advanceRhythm,
  clearRhythmPlay,
  dueLane,
  finishedResult,
  laneFromKey,
  laneLabel,
  noteTravel,
  pauseRhythm,
  playLane,
  readRhythmPlay,
  restartRhythm,
  resumeRhythm,
  rhythmPlayKey,
  rhythmStatus,
  rhythmToneAllowed,
  startRhythm,
  writeRhythmPlay,
  type RhythmBoard,
  type RhythmStorage,
} from './harbor-rhythm';

function box(): RhythmStorage {
  const items = new Map<string, string>();
  return {
    get length(): number { return items.size; },
    key(index: number): string | null { return [...items.keys()][index] ?? null; },
    getItem(key: string): string | null { return items.get(key) ?? null; },
    setItem(key: string, value: string): void { items.set(key, value); },
    removeItem(key: string): void { items.delete(key); },
  };
}

function perfectTimed(): RhythmBoard {
  let board = startRhythm('timed');
  for (const beat of RHYTHM_CHART) {
    board = advanceRhythm(board, beat.at - board.elapsed);
    board = playLane(board, beat.lane);
  }
  return advanceRhythm(board, RHYTHM_DURATION_MS - board.elapsed);
}

function perfectUntimed(): RhythmBoard {
  let board = startRhythm('untimed');
  for (const beat of RHYTHM_CHART) board = playLane(board, beat.lane);
  return board;
}

describe('Harbor Rhythm', () => {
  it('uses one original 30-second chart whose windows do not overlap', () => {
    expect(RHYTHM_DURATION_MS).toBe(30_000);
    expect(RHYTHM_LANES).toEqual(['Bell', 'Glass', 'Lantern', 'Ferry']);
    expect(RHYTHM_CHART.length).toBe(16);
    for (let index = 0; index < RHYTHM_CHART.length; index += 1) {
      const beat = RHYTHM_CHART[index];
      if (!beat) throw new Error('beat');
      expect(beat.lane).toBeGreaterThanOrEqual(0);
      expect(beat.lane).toBeLessThan(4);
      expect(beat.at + RHYTHM_WINDOW_MS).toBeLessThan(RHYTHM_DURATION_MS);
      const previous = RHYTHM_CHART[index - 1];
      if (previous) expect(beat.at - RHYTHM_WINDOW_MS).toBeGreaterThan(previous.at + RHYTHM_WINDOW_MS);
    }
    expect(RHYTHM_CHART.map(beat => beat.lane)).toEqual([0, 1, 2, 3, 2, 0, 3, 1, 0, 2, 3, 1, 2, 0, 1, 3]);
  });

  it('scores a perfect timed chart and a perfect untimed sequence as wins', () => {
    const timed = perfectTimed();
    expect(timed.phase).toBe('complete');
    expect(timed.elapsed).toBe(30_000);
    expect(timed.wrong).toBe(0);
    expect(timed.notes.every(note => note.result === 'hit')).toBeTrue();
    expect(accuracyOf(timed)).toBe(100);
    expect(rhythmStatus(timed, finishedResult(timed))).toBe('Win. 30-second chart complete. Accuracy 100%.');
    expect(playLane(timed, 0)).toBe(timed);
    expect(advanceRhythm(timed, 100)).toBe(timed);

    const sequence = perfectUntimed();
    expect(sequence.phase).toBe('complete');
    expect(sequence.elapsed).toBe(0);
    expect(sequence.step).toBe(16);
    expect(accuracyOf(sequence)).toBe(100);
    expect(rhythmStatus(sequence, finishedResult(sequence))).toBe('Win. Untimed sequence complete. Accuracy 100%.');
    expect(dueLane(sequence)).toBeNull();
  });

  it('counts a wrong lane without advancing, and a missed beat without leaving the chart', () => {
    const sequence = startRhythm('untimed');
    const wrong = playLane(sequence, 1);
    expect(wrong.step).toBe(0);
    expect(wrong.wrong).toBe(1);
    expect(accuracyOf(wrong)).toBe(0);
    expect(rhythmStatus(wrong, null)).toBe('0 of 16. Next Bell. Accuracy 0%.');
    const hit = playLane(wrong, 0);
    expect(hit.step).toBe(1);
    expect(dueLane(hit)).toBe(1);
    expect(accuracyOf(hit)).toBe(50);
    expect(laneLabel(0, false)).toBe('Bell lane');
    expect(laneLabel(1, true)).toBe('Glass lane, play now');

    let timed = startRhythm('timed');
    timed = advanceRhythm(timed, 1_800);
    expect(dueLane(timed)).toBe(0);
    timed = playLane(timed, 2);
    expect(timed.notes[0]?.result).toBe('pending');
    expect(timed.wrong).toBe(1);
    timed = advanceRhythm(timed, 900);
    expect(timed.notes[0]?.result).toBe('miss');
    expect(timed.phase).toBe('playing');
    expect(accuracyOf(timed)).toBe(0);
    timed = advanceRhythm(timed, RHYTHM_DURATION_MS);
    expect(timed.phase).toBe('complete');
    expect(timed.notes.every(note => note.result === 'miss')).toBeTrue();
    expect(rhythmStatus(timed, finishedResult(timed))).toBe('Win. 30-second chart complete. Accuracy 0%.');
  });

  it('pauses the clock, resumes the same beat, and restarts the same mode', () => {
    let board = advanceRhythm(startRhythm('timed'), 1_800);
    board = playLane(board, 0);
    const paused = pauseRhythm(board);
    expect(advanceRhythm(paused, 5_000)).toBe(paused);
    expect(playLane(paused, 1)).toBe(paused);
    expect(rhythmStatus(paused, null)).toContain('Paused. 29 seconds left.');
    const resumed = resumeRhythm(paused);
    expect(resumed.elapsed).toBe(1_800);
    expect(resumed.notes[0]?.result).toBe('hit');
    expect(pauseRhythm(resumed)).not.toBe(resumed);
    const again = restartRhythm(resumed);
    expect(again.mode).toBe('timed');
    expect(again.elapsed).toBe(0);
    expect(again.notes.every(note => note.result === 'pending')).toBeTrue();
    expect(restartRhythm(perfectUntimed()).mode).toBe('untimed');
    const first = again.notes[0];
    if (!first) throw new Error('note');
    expect(noteTravel(first, 200)).not.toBeNull();
    expect(noteTravel(first, 1_800)).toBe(0);
    expect(laneFromKey('4')).toBe(3);
    expect(laneFromKey('5')).toBeNull();
    expect(rhythmToneAllowed(true, false)).toBeTrue();
    expect(rhythmToneAllowed(true, true)).toBeFalse();
    expect(rhythmToneAllowed(false, false)).toBeFalse();
  });

  it('restores one owner round and drops a corrupt or foreign chart', () => {
    const storage = box();
    storage.setItem('town.memory-shelves.v1.4', '{"ownerId":4}');
    const board = playLane(startRhythm('untimed'), 0);
    const play = { ownerId: 4, board, last: null, reward: null };
    writeRhythmPlay(storage, play);
    expect(readRhythmPlay(storage, 4)?.board?.step).toBe(1);
    expect(readRhythmPlay(storage, 9)).toBeNull();

    const paused = pauseRhythm(advanceRhythm(startRhythm('timed'), 1_800));
    writeRhythmPlay(storage, { ownerId: 4, board: paused, last: { mode: 'untimed', accuracy: 100 }, reward: null });
    expect(readRhythmPlay(storage, 4)?.board?.phase).toBe('paused');
    expect(readRhythmPlay(storage, 4)?.board?.elapsed).toBe(1_800);

    storage.setItem(rhythmPlayKey(4), '{');
    expect(readRhythmPlay(storage, 4)).toBeNull();
    storage.setItem(rhythmPlayKey(4), JSON.stringify({ ownerId: 9, board: null, last: null }));
    expect(readRhythmPlay(storage, 4)).toBeNull();
    const shifted = { ...board, notes: board.notes.map((note, index) => index === 0 ? { ...note, lane: 1 } : note) };
    storage.setItem(rhythmPlayKey(4), JSON.stringify({ ownerId: 4, board: shifted, last: null }));
    expect(readRhythmPlay(storage, 4)).toBeNull();

    clearRhythmPlay(storage);
    expect(storage.getItem('town.memory-shelves.v1.4')).toBe('{"ownerId":4}');
    expect([...Array(storage.length)].some((_, index) => storage.key(index)?.startsWith(RHYTHM_PLAY_PREFIX))).toBeFalse();
    expect(rhythmStatus(null, { mode: 'timed', accuracy: 100 })).toBe(
      'Last 30-second chart finished at 100% accuracy.',
    );
  });
});
