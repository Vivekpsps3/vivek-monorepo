import {
  EMPTY_FEEDBACK,
  armCheck,
  armUndo,
  commitCheck,
  commitUndo,
  dropAll,
  failCheck,
  failUndo,
  feedbackAttr,
  feedbackLabel,
  responseKind,
  responseLabel,
  retainFeedback,
  visibleMark,
} from './habit-feedback';

const read = { habitId: 12, day: '2026-10-29', ownerId: 7, style: 'forge' as const };
const walk = { habitId: 15, day: '2026-10-29', ownerId: 7, style: 'garden' as const };
const sleep = { habitId: 18, day: '2026-10-29', ownerId: 7, style: 'cottage' as const };

describe('habit lot feedback', () => {
  it('maps each style to one response and keeps pending free of that response', () => {
    expect(responseKind('garden')).toBe('garden');
    expect(responseKind('cottage')).toBe('light');
    expect(responseKind('forge')).toBe('smoke');
    expect(responseLabel('garden')).toBe('Flower open');
    expect(responseLabel('cottage')).toBe('Window lit');
    expect(responseLabel('forge')).toBe('Chimney smoke');

    const pending = armCheck(EMPTY_FEEDBACK, read);
    const mark = visibleMark(pending, 12, 7, '2026-10-29');
    expect(mark?.celebration).toBeNull();
    expect(feedbackAttr(mark!)).toBe('pending');
    expect(feedbackLabel(mark!)).toBe('Saving check');
    expect(feedbackLabel(mark!)).not.toBe(responseLabel('forge'));
  });

  it('celebrates once on success, refuses a second commit, and clears on undo without a new id', () => {
    const pending = armCheck(armCheck(EMPTY_FEEDBACK, walk), read);
    const held = visibleMark(pending, 12, 7, '2026-10-29');
    expect(held?.phase).toBe('pending');
    expect(commitCheck(pending, { habitId: 12, day: '2026-10-28', ownerId: 7 }).celebrated).toBeFalse();
    expect(commitCheck(pending, { habitId: 12, day: '2026-10-29', ownerId: 8 }).celebrated).toBeFalse();

    const first = commitCheck(pending, { habitId: 12, day: '2026-10-29', ownerId: 7 });
    expect(first.celebrated).toBeTrue();
    expect(first.book.marks[12].celebration).toBe(1);
    expect(feedbackLabel(first.book.marks[12])).toBe('Chimney smoke');
    expect(first.book.marks[15].celebration).toBeNull();

    const again = commitCheck(first.book, { habitId: 12, day: '2026-10-29', ownerId: 7 });
    expect(again.celebrated).toBeFalse();
    expect(again.book).toBe(first.book);

    const undoing = armUndo(first.book, read);
    expect(undoing.marks[12].celebration).toBe(1);
    expect(undoing.marks[12].phase).toBe('pending');
    expect(feedbackLabel(undoing.marks[12])).toBe('Undoing check');
    expect(undoing.nextCelebration).toBe(2);

    const failed = failUndo(undoing, 12);
    expect(failed.marks[12].celebration).toBe(1);
    expect(failed.marks[12].phase).toBe('committed');
    expect(failed.nextCelebration).toBe(2);

    const cleared = commitUndo(armUndo(failed, read), { habitId: 12, day: '2026-10-29', ownerId: 7 });
    expect(cleared.marks[12]).toBeUndefined();
    expect(cleared.nextCelebration).toBe(2);
    expect(visibleMark(cleared, 12, 7, '2026-10-29')).toBeNull();
  });

  it('drops a failed check, keeps the other habit, and publishes nothing for the wrong owner or day', () => {
    const armed = armCheck(armCheck(armCheck(EMPTY_FEEDBACK, read), walk), sleep);
    const failed = failCheck(armed, 15);
    expect(failed.marks[15]).toBeUndefined();
    expect(failed.marks[12].phase).toBe('pending');
    expect(failed.marks[18].style).toBe('cottage');

    const committed = commitCheck(failed, { habitId: 18, day: '2026-10-29', ownerId: 7 });
    expect(committed.celebrated).toBeTrue();
    expect(feedbackAttr(committed.book.marks[18])).toBe('light');
    expect(retainFeedback(committed.book, 8, '2026-10-29').marks[18]).toBeUndefined();
    expect(retainFeedback(committed.book, 7, '2026-10-30').marks[18]).toBeUndefined();
    expect(dropAll(committed.book).marks).toEqual({});
    expect(dropAll(committed.book).nextCelebration).toBe(2);
    expect(visibleMark(EMPTY_FEEDBACK, 18, 7, '2026-10-29')).toBeNull();
  });
});
