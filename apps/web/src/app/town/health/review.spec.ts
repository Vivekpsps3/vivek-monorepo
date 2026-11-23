import {
  draftFromReview,
  emptyDraft,
  isIsoMonday,
  isSunday,
  isoMonday,
  newReviewClientId,
  obsidianReference,
  parseWeeklyReview,
  reviewFromDraft,
  shiftIsoWeek,
  storedReview,
  sundayPrompt,
  unicodeLength,
  REVIEW_FOCUS_CODE_POINTS,
  REVIEW_NOTE_CODE_POINTS,
  type WeeklyReview,
} from './review';

const WEEK = '2026-12-28';
const NEXT = '2027-01-04';

function baseReview(): WeeklyReview {
  return {
    v: 1,
    week: WEEK,
    focus: ['One', 'Two', ''],
    note: 'Synthetic note',
    obsidian: null,
  };
}

function review(extra: Record<string, unknown> = {}): unknown {
  return { ...baseReview(), ...extra };
}

describe('weekly review schema', () => {
  it('keeps the ISO Monday across the year boundary', () => {
    expect(isIsoMonday(WEEK)).toBeTrue();
    expect(isIsoMonday(NEXT)).toBeTrue();
    expect(isoMonday('2027-01-03')).toBe(WEEK);
    expect(isSunday('2027-01-03')).toBeTrue();
    expect(sundayPrompt('2027-01-03', WEEK)).toBeTrue();
    expect(sundayPrompt('2027-01-03', NEXT)).toBeFalse();
    expect(sundayPrompt('2027-01-04', NEXT)).toBeFalse();
    expect(shiftIsoWeek(WEEK, 1)).toBe(NEXT);
    expect(shiftIsoWeek(NEXT, -1)).toBe(WEEK);
    expect(shiftIsoWeek('2020-12-28', 1)).toBe('2021-01-04');
    expect(isoMonday('2021-01-01')).toBe('2020-12-28');
    expect(shiftIsoWeek('1970-01-05', -1)).toBeNull();
    expect(shiftIsoWeek('not-a-date', 1)).toBeNull();
  });

  it('counts Unicode code points and keeps the exact stored keys', () => {
    const emoji = '🙂';
    expect(unicodeLength(emoji)).toBe(1);
    expect(emoji.length).toBe(2);
    const draft = emptyDraft();
    draft.focus[0] = emoji.repeat(REVIEW_FOCUS_CODE_POINTS);
    draft.note = 'n'.repeat(REVIEW_NOTE_CODE_POINTS);
    const saved = reviewFromDraft(WEEK, draft);
    expect(typeof saved).not.toBe('string');
    if (typeof saved === 'string') return;
    expect(Object.keys(storedReview(saved))).toEqual(['v', 'week', 'focus', 'note', 'obsidian']);
    expect(parseWeeklyReview(storedReview(saved))).toEqual(saved);
    draft.focus[0] = emoji.repeat(REVIEW_FOCUS_CODE_POINTS + 1);
    expect(typeof reviewFromDraft(WEEK, draft)).toBe('string');
    draft.focus[0] = 'One';
    draft.note = 'n'.repeat(REVIEW_NOTE_CODE_POINTS + 1);
    expect(typeof reviewFromDraft(WEEK, draft)).toBe('string');
  });

  it('accepts only an http, https, or obsidian link', () => {
    expect(obsidianReference('')).toBeNull();
    expect(obsidianReference('   ')).toBeNull();
    expect(obsidianReference('https://example.com/synthetic-review')).toBe('https://example.com/synthetic-review');
    expect(obsidianReference('obsidian://open?vault=Synthetic&file=Note')).toBe('obsidian://open?vault=Synthetic&file=Note');
    expect(obsidianReference('javascript:alert(1)')).toBeUndefined();
    expect(obsidianReference('https://user:pass@example.com/note')).toBeUndefined();
    expect(obsidianReference('not a link')).toBeUndefined();
    const draft = emptyDraft();
    expect(typeof reviewFromDraft(WEEK, draft)).toBe('string');
    draft.obsidian = 'https://example.com/synthetic-review';
    const saved = reviewFromDraft(WEEK, draft);
    expect(saved).toEqual({
      v: 1,
      week: WEEK,
      focus: ['', '', ''],
      note: '',
      obsidian: 'https://example.com/synthetic-review',
    });
  });

  it('rejects extra keys, bad weeks, and unreadable shapes', () => {
    expect(parseWeeklyReview(review())).toEqual(baseReview());
    expect(parseWeeklyReview(review({ extra: true }))).toBeNull();
    expect(parseWeeklyReview(review({ v: 2 }))).toBeNull();
    expect(parseWeeklyReview(review({ week: '2027-01-03' }))).toBeNull();
    expect(parseWeeklyReview(review({ obsidian: '' }))).toBeNull();
    expect(parseWeeklyReview([])).toBeNull();
    expect(draftFromReview(baseReview()).note).toBe('Synthetic note');
    expect(newReviewClientId()).toMatch(/^rev_[A-Za-z0-9_-]{22}$/);
  });
});
