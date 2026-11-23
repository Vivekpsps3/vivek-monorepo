/**
 * Session-only response for one habit lot.
 * A flower, window, or chimney mark is stored only after that check-in POST succeeds.
 * Pending is not a celebration and not credit. Undo, a new owner, or a new day drops the mark.
 * Nothing here is written to storage, so a reload cannot play it again.
 */

export type BuildingStyle = 'forge' | 'garden' | 'cottage';
export type ResponseKind = 'garden' | 'light' | 'smoke';
export type FeedbackPhase = 'pending' | 'committed';
export type FeedbackIntent = 'check' | 'undo';

export interface FeedbackMark {
  readonly habitId: number;
  readonly day: string;
  readonly ownerId: number;
  readonly style: BuildingStyle;
  readonly phase: FeedbackPhase;
  readonly intent: FeedbackIntent;
  /** Null until the check-in POST succeeds. Undo keeps this id so a failed undo does not play it again. */
  readonly celebration: number | null;
}

export interface FeedbackBook {
  readonly marks: Readonly<Record<number, FeedbackMark>>;
  readonly nextCelebration: number;
}

export interface FeedbackSubject {
  readonly habitId: number;
  readonly day: string;
  readonly ownerId: number;
  readonly style: BuildingStyle;
}

export const EMPTY_FEEDBACK: FeedbackBook = Object.freeze({
  marks: Object.freeze({}),
  nextCelebration: 1,
});

export function responseKind(style: BuildingStyle): ResponseKind {
  if (style === 'garden') return 'garden';
  if (style === 'cottage') return 'light';
  return 'smoke';
}

export function responseLabel(style: BuildingStyle): string {
  if (style === 'garden') return 'Flower open';
  if (style === 'cottage') return 'Window lit';
  return 'Chimney smoke';
}

export function feedbackLabel(mark: FeedbackMark): string {
  if (mark.phase === 'pending') return mark.intent === 'undo' ? 'Undoing check' : 'Saving check';
  return responseLabel(mark.style);
}

export function feedbackAttr(mark: FeedbackMark): 'pending' | ResponseKind {
  if (mark.phase === 'pending') return 'pending';
  return responseKind(mark.style);
}

export function visibleMark(book: FeedbackBook, habitId: number, ownerId: number, day: string): FeedbackMark | null {
  const mark = book.marks[habitId];
  if (!mark || mark.ownerId !== ownerId || mark.day !== day) return null;
  return mark;
}

export function armCheck(book: FeedbackBook, input: FeedbackSubject): FeedbackBook {
  return {
    ...book,
    marks: {
      ...book.marks,
      [input.habitId]: {
        habitId: input.habitId,
        day: input.day,
        ownerId: input.ownerId,
        style: input.style,
        phase: 'pending',
        intent: 'check',
        celebration: null,
      },
    },
  };
}

export function armUndo(book: FeedbackBook, input: FeedbackSubject): FeedbackBook {
  const current = book.marks[input.habitId];
  const celebration = current && current.ownerId === input.ownerId && current.day === input.day
    ? current.celebration
    : null;
  return {
    ...book,
    marks: {
      ...book.marks,
      [input.habitId]: {
        habitId: input.habitId,
        day: input.day,
        ownerId: input.ownerId,
        style: input.style,
        phase: 'pending',
        intent: 'undo',
        celebration,
      },
    },
  };
}

/** One celebration id per successful check. A second call for the same pending mark does not celebrate again. */
export function commitCheck(
  book: FeedbackBook,
  input: { habitId: number; day: string; ownerId: number },
): { book: FeedbackBook; celebrated: boolean } {
  const mark = book.marks[input.habitId];
  if (!mark || mark.phase !== 'pending' || mark.intent !== 'check') return { book, celebrated: false };
  if (mark.day !== input.day || mark.ownerId !== input.ownerId || mark.celebration != null) {
    return { book, celebrated: false };
  }
  const celebration = book.nextCelebration;
  return {
    celebrated: true,
    book: {
      nextCelebration: celebration + 1,
      marks: {
        ...book.marks,
        [input.habitId]: { ...mark, phase: 'committed', intent: 'check', celebration },
      },
    },
  };
}

export function commitUndo(
  book: FeedbackBook,
  input: { habitId: number; day: string; ownerId: number },
): FeedbackBook {
  const mark = book.marks[input.habitId];
  if (!mark || mark.intent !== 'undo' || mark.phase !== 'pending') return book;
  if (mark.day !== input.day || mark.ownerId !== input.ownerId) return book;
  const marks = { ...book.marks };
  delete marks[input.habitId];
  return { ...book, marks };
}

export function failCheck(book: FeedbackBook, habitId: number): FeedbackBook {
  const mark = book.marks[habitId];
  if (!mark || mark.intent !== 'check') return book;
  const marks = { ...book.marks };
  delete marks[habitId];
  return { ...book, marks };
}

/** A failed undo keeps the same celebration id. It does not play a new one. */
export function failUndo(book: FeedbackBook, habitId: number): FeedbackBook {
  const mark = book.marks[habitId];
  if (!mark || mark.intent !== 'undo') return book;
  if (mark.celebration == null) {
    const marks = { ...book.marks };
    delete marks[habitId];
    return { ...book, marks };
  }
  return {
    ...book,
    marks: {
      ...book.marks,
      [habitId]: { ...mark, intent: 'check', phase: 'committed' },
    },
  };
}

export function dropHabit(book: FeedbackBook, habitId: number): FeedbackBook {
  if (!book.marks[habitId]) return book;
  const marks = { ...book.marks };
  delete marks[habitId];
  return { ...book, marks };
}

export function dropAll(book: FeedbackBook): FeedbackBook {
  if (Object.keys(book.marks).length === 0) return book;
  return { ...book, marks: {} };
}

/** Hide marks that belong to another owner or day without inventing a celebration. */
export function retainFeedback(book: FeedbackBook, ownerId: number, day: string): FeedbackBook {
  const marks: Record<number, FeedbackMark> = {};
  let dropped = false;
  for (const mark of Object.values(book.marks)) {
    if (mark.ownerId !== ownerId || mark.day !== day) {
      dropped = true;
      continue;
    }
    marks[mark.habitId] = mark;
  }
  return dropped ? { marks, nextCelebration: book.nextCelebration } : book;
}
