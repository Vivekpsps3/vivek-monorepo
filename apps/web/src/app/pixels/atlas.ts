import { sundayOnOrBefore } from '@vivek/ui';
import type { DayMemory } from './day-memory';
import { isIsoDate, shiftIsoDate } from './pixels-dates';

const SHORT_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const;
const PREVIEW_LIMIT = 3;

export interface DatedSpan {
  start: string;
  end: string;
  label: string;
}

/** Sunday scoring week and ISO week for one civil date. Neither span changes a score. */
export interface CalendarSpans {
  date: string;
  sunday: DatedSpan;
  iso: DatedSpan;
}

export interface AtlasLine {
  id: string;
  text: string;
}

export interface MemoryPreviewLine {
  id: string;
  text: string;
  href: string | null;
}

export interface CompactMemoryPreview {
  composition: string;
  lines: MemoryPreviewLine[];
  more: string | null;
  uncertainty: string[];
  /** The atlas preview is text. It never asks for a thumbnail. */
  requestsThumbnails: false;
}

export function civilDate(iso: string): string {
  if (!isIsoDate(iso)) return iso;
  const month = Number(iso.slice(5, 7));
  const day = Number(iso.slice(8, 10));
  return `${SHORT_MONTHS[month - 1]} ${day}, ${iso.slice(0, 4)}`;
}

export function civilSpanLabel(start: string, end: string): string {
  return `${civilDate(start)} – ${civilDate(end)}`;
}

export function civilWeekday(iso: string): string {
  if (!isIsoDate(iso)) return '';
  const year = Number(iso.slice(0, 4));
  const month = Number(iso.slice(5, 7));
  const day = Number(iso.slice(8, 10));
  return WEEKDAYS[new Date(Date.UTC(year, month - 1, day)).getUTCDay()] ?? '';
}

/** Monday that begins the ISO week containing `iso`. Display only. Scoring weeks stay Sunday-start. */
export function isoMondayOnOrBefore(iso: string): string {
  const weekday = new Date(Date.UTC(
    Number(iso.slice(0, 4)),
    Number(iso.slice(5, 7)) - 1,
    Number(iso.slice(8, 10)),
  )).getUTCDay();
  const back = weekday === 0 ? 6 : weekday - 1;
  return shiftIsoDate(iso, -back);
}

export function calendarSpans(date: string): CalendarSpans | null {
  if (!isIsoDate(date)) return null;
  const sundayStart = sundayOnOrBefore(date);
  const isoStart = isoMondayOnOrBefore(date);
  const sundayEnd = shiftIsoDate(sundayStart, 6);
  const isoEnd = shiftIsoDate(isoStart, 6);
  return {
    date,
    sunday: { start: sundayStart, end: sundayEnd, label: civilSpanLabel(sundayStart, sundayEnd) },
    iso: { start: isoStart, end: isoEnd, label: civilSpanLabel(isoStart, isoEnd) },
  };
}

/**
 * Coverage copy for the year and life atlas.
 * The 90-row poster is room for later weeks. It is not a lifespan.
 */
export function atlasCoverageLines(input: {
  surface: 'year' | 'life';
  firstActivityOn: string | null;
}): AtlasLine[] {
  const recorded = input.firstActivityOn && isIsoDate(input.firstActivityOn)
    ? `Recorded since ${civilDate(input.firstActivityOn)}. Earlier days are lived time with no suite data.`
    : 'No suite activity is recorded in this range. That is coverage, not a judgement.';
  const lines: AtlasLine[] = [
    { id: 'judgement', text: 'Recorded activity, without judgement.' },
    { id: 'recorded', text: recorded },
    { id: 'quiet', text: 'A quiet square means nothing is recorded here. It does not describe the rest of that day.' },
    { id: 'future', text: 'Days after today are ahead of the calendar. They are not a predicted end.' },
  ];
  if (input.surface === 'life') {
    lines.push({
      id: 'canvas',
      text: 'The poster keeps at least 90 rows so later weeks have room. That count is not a lifespan.',
    });
  }
  return lines;
}

export function atlasYearQuery(url: string): Record<string, string> | null {
  const params = readQuery(url);
  const date = firstDate(params, ['focus', 'day', 'span']);
  if (date) return { year: String(Number(date.slice(0, 4))), day: date };
  const year = params.get('year');
  if (year && /^(?!0+$)\d{1,4}$/.test(year)) return { year: String(Number(year)) };
  return null;
}

export function atlasLifeQuery(url: string): Record<string, string> | null {
  const params = readQuery(url);
  const date = firstDate(params, ['day', 'focus', 'span']);
  return date ? { focus: date } : null;
}

/** Text names for the selected day. Photo and note slots never become image requests. */
export function compactMemoryPreview(input: {
  memory: DayMemory;
  activityLabel: string;
  annotations: number;
  future: boolean;
  includeConnectors: boolean;
}): CompactMemoryPreview {
  const named: MemoryPreviewLine[] = [];
  const uncertainty: string[] = [];
  let waiting = false;
  for (const slot of input.memory.slots) {
    if (slot.id === 'photos' || slot.id === 'notes') {
      if (input.includeConnectors) uncertainty.push(slot.text);
      continue;
    }
    if (slot.state === 'loading') {
      waiting = true;
      continue;
    }
    if (slot.state === 'unavailable' || slot.state === 'expired' || slot.state === 'locked') {
      uncertainty.push(slot.text);
    }
    for (const record of slot.records) {
      named.push({ id: record.id, text: record.label, href: safeRecordHref(record.href) });
    }
  }
  if (input.annotations > 0) {
    const noun = input.annotations === 1 ? 'annotation' : 'annotations';
    named.push({
      id: 'learning',
      text: `Learning · ${input.annotations} ${noun}. Separate from the activity score.`,
      href: null,
    });
  }
  const lines = named.slice(0, PREVIEW_LIMIT);
  const extra = named.length - lines.length;
  if (input.future) {
    uncertainty.unshift(named.length > 0
      ? 'This day is still ahead. A planned record is not time already lived.'
      : 'This day is still ahead. Nothing is recorded yet.');
  } else if (waiting) {
    uncertainty.unshift('Named records are still loading.');
  } else if (named.length === 0) {
    uncertainty.unshift('Nothing recorded for this day.');
  }
  return {
    composition: input.future ? 'Ahead of today' : input.activityLabel,
    lines,
    more: extra > 0 ? `${extra} more named records` : null,
    uncertainty,
    requestsThumbnails: false,
  };
}

function safeRecordHref(href: string | null): string | null {
  if (!href || !href.startsWith('/') || href.startsWith('//')) return null;
  if (/thumbnail|immich|\.(png|jpe?g|webp|gif)(\?|$)/i.test(href)) return null;
  return href;
}

function readQuery(url: string): URLSearchParams {
  const query = url.includes('?') ? url.slice(url.indexOf('?') + 1) : '';
  return new URLSearchParams(query.split('#')[0] ?? '');
}

function firstDate(params: URLSearchParams, keys: readonly string[]): string | null {
  for (const key of keys) {
    const value = params.get(key);
    if (value && isIsoDate(value)) return value;
  }
  return null;
}
