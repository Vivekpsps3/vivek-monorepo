/**
 * Weekly review plaintext. The vault envelope stays schema_version 2.
 * This object is the only stored shape: five keys, ISO Monday, three focus
 * slots, one note, and an optional link. No Town XP field belongs here.
 */

export const REVIEW_RECORD_VERSION = 1;
export const REVIEW_FOCUS_SLOTS = 3;
export const REVIEW_FOCUS_CODE_POINTS = 120;
export const REVIEW_NOTE_CODE_POINTS = 2000;
export const REVIEW_LINK_CODE_POINTS = 500;
export const REVIEW_KEYS = ['v', 'week', 'focus', 'note', 'obsidian'] as const;

export interface WeeklyReview {
  v: 1;
  week: string;
  focus: [string, string, string];
  note: string;
  obsidian: string | null;
}

export interface ReviewDraft {
  focus: [string, string, string];
  note: string;
  obsidian: string;
}

const DAY_MS = 86_400_000;
const FIRST_YEAR = 1970;
const LAST_YEAR = 2099;

export function unicodeLength(value: string): number {
  return [...value].length;
}

function parseIsoDate(value: string): { y: number; m: number; d: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const y = Number(match[1]);
  const m = Number(match[2]);
  const d = Number(match[3]);
  const utc = Date.UTC(y, m - 1, d);
  const date = new Date(utc);
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return null;
  return { y, m, d };
}

function utcDay(value: string): number | null {
  const parts = parseIsoDate(value);
  if (!parts) return null;
  return new Date(Date.UTC(parts.y, parts.m - 1, parts.d)).getUTCDay();
}

/** Monday of the ISO week that contains this civil date. The date is not a timestamp. */
export function isoMonday(value: string): string | null {
  const parts = parseIsoDate(value);
  if (!parts) return null;
  const weekday = new Date(Date.UTC(parts.y, parts.m - 1, parts.d)).getUTCDay();
  const monday = Date.UTC(parts.y, parts.m - 1, parts.d) - ((weekday + 6) % 7) * DAY_MS;
  return new Date(monday).toISOString().slice(0, 10);
}

export function isIsoMonday(value: string): boolean {
  return isoMonday(value) === value;
}

export function isSunday(value: string): boolean {
  return utcDay(value) === 0;
}

export function sundayPrompt(today: string, week: string): boolean {
  return isSunday(today) && isoMonday(today) === week;
}

export function shiftIsoWeek(monday: string, delta: number): string | null {
  if (!isIsoMonday(monday) || !Number.isInteger(delta)) return null;
  if (delta === 0) return monday;
  const parts = parseIsoDate(monday);
  if (!parts) return null;
  const next = new Date(Date.UTC(parts.y, parts.m - 1, parts.d + delta * 7)).toISOString().slice(0, 10);
  const year = Number(next.slice(0, 4));
  if (!isIsoMonday(next) || year < FIRST_YEAR || year > LAST_YEAR) return null;
  return next;
}

export function emptyDraft(): ReviewDraft {
  return { focus: ['', '', ''], note: '', obsidian: '' };
}

export function draftFromReview(review: WeeklyReview): ReviewDraft {
  return {
    focus: [review.focus[0], review.focus[1], review.focus[2]],
    note: review.note,
    obsidian: review.obsidian ?? '',
  };
}

/** http(s) or obsidian URI. Empty is no link. Anything else is refused. */
export function obsidianReference(value: string): string | null | undefined {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (unicodeLength(trimmed) > REVIEW_LINK_CODE_POINTS || /\s/u.test(trimmed)) return undefined;
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return undefined;
  }
  if (url.username || url.password) return undefined;
  if (url.protocol !== 'http:' && url.protocol !== 'https:' && url.protocol !== 'obsidian:') return undefined;
  return trimmed;
}

export function reviewFromDraft(week: string, draft: ReviewDraft): WeeklyReview | string {
  if (!isIsoMonday(week)) return 'Choose a week that starts on Monday.';
  const focus = draft.focus.map(item => item);
  if (focus.length !== REVIEW_FOCUS_SLOTS || focus.some(item => typeof item !== 'string')) {
    return 'Keep three focus items.';
  }
  for (const item of focus) {
    if (unicodeLength(item) > REVIEW_FOCUS_CODE_POINTS) {
      return `Each focus item can use ${REVIEW_FOCUS_CODE_POINTS} characters.`;
    }
  }
  if (typeof draft.note !== 'string' || unicodeLength(draft.note) > REVIEW_NOTE_CODE_POINTS) {
    return `The note can use ${REVIEW_NOTE_CODE_POINTS} characters.`;
  }
  const link = obsidianReference(draft.obsidian);
  if (link === undefined) return 'The Obsidian field has to be an http, https, or obsidian link.';
  const filled = focus.some(item => item.trim()) || draft.note.trim() || link;
  if (!filled) return 'Add a focus, a note, or a link before saving.';
  return {
    v: REVIEW_RECORD_VERSION,
    week,
    focus: [focus[0], focus[1], focus[2]],
    note: draft.note,
    obsidian: link,
  };
}

function sameKeys(value: Record<string, unknown>): boolean {
  const keys = Object.keys(value);
  return keys.length === REVIEW_KEYS.length && REVIEW_KEYS.every(key => keys.includes(key));
}

/** Accept only the exact stored object. Extra keys stay unread and are not rewritten. */
export function parseWeeklyReview(value: unknown): WeeklyReview | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (!sameKeys(record)) return null;
  if (record['v'] !== REVIEW_RECORD_VERSION || typeof record['week'] !== 'string' || !isIsoMonday(record['week'])) return null;
  if (!Array.isArray(record['focus']) || record['focus'].length !== REVIEW_FOCUS_SLOTS) return null;
  if (!record['focus'].every(item => typeof item === 'string' && unicodeLength(item) <= REVIEW_FOCUS_CODE_POINTS)) return null;
  if (typeof record['note'] !== 'string' || unicodeLength(record['note']) > REVIEW_NOTE_CODE_POINTS) return null;
  const link = record['obsidian'];
  if (link !== null && (typeof link !== 'string' || obsidianReference(link) !== link)) return null;
  const focus = record['focus'] as [string, string, string];
  return {
    v: 1,
    week: record['week'],
    focus: [focus[0], focus[1], focus[2]],
    note: record['note'],
    obsidian: link,
  };
}

export function storedReview(review: WeeklyReview): WeeklyReview {
  return {
    v: 1,
    week: review.week,
    focus: [review.focus[0], review.focus[1], review.focus[2]],
    note: review.note,
    obsidian: review.obsidian,
  };
}

/** `rev_` plus 22 base64url characters from 16 random bytes. */
export function newReviewClientId(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return `rev_${btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')}`;
}
