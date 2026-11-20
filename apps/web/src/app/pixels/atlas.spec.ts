import { lifeSpanContaining } from './life-model';
import { buildDayMemory } from './day-memory';
import type { PixelDayFacts, PixelDayView } from './pixels.types';
import {
  atlasCoverageLines,
  atlasLifeQuery,
  atlasYearQuery,
  calendarSpans,
  civilWeekday,
  compactMemoryPreview,
} from './atlas';

describe('Atlas spans', () => {
  function utcDay(iso: string): number {
    const year = Number(iso.slice(0, 4));
    const month = Number(iso.slice(5, 7));
    const day = Number(iso.slice(8, 10));
    return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  }

  function contains(span: { start: string; end: string }, date: string): boolean {
    return span.start <= date && date <= span.end;
  }

  it('keeps Sunday, ISO, and life weeks distinct on the leap day', () => {
    const date = '2024-02-29';
    const spans = calendarSpans(date);
    const life = lifeSpanContaining('1990-05-04', date);
    expect(spans).not.toBeNull();
    expect(life).not.toBeNull();
    expect(spans!.sunday).toEqual({
      start: '2024-02-25',
      end: '2024-03-02',
      label: 'Feb 25, 2024 – Mar 2, 2024',
    });
    expect(spans!.iso).toEqual({
      start: '2024-02-26',
      end: '2024-03-03',
      label: 'Feb 26, 2024 – Mar 3, 2024',
    });
    expect(life).toEqual({ start: '2024-02-29', end: '2024-03-06' });
    expect(utcDay(spans!.sunday.start)).toBe(0);
    expect(utcDay(spans!.iso.start)).toBe(1);
    expect(civilWeekday(life!.start)).toBe('Thursday');
    for (const span of [spans!.sunday, spans!.iso, life!]) expect(contains(span, date)).toBeTrue();
    expect(new Set([spans!.sunday.start, spans!.iso.start, life!.start]).size).toBe(3);
  });

  it('agrees at the Sunday and ISO boundaries without rewriting either week', () => {
    const sunday = calendarSpans('2024-02-25');
    const monday = calendarSpans('2024-02-26');
    expect(sunday!.sunday.start).toBe('2024-02-25');
    expect(sunday!.iso.start).toBe('2024-02-19');
    expect(monday!.iso.start).toBe('2024-02-26');
    expect(monday!.sunday.start).toBe('2024-02-25');
    expect(utcDay(sunday!.sunday.start)).toBe(0);
    expect(utcDay(monday!.iso.start)).toBe(1);
    expect(contains(sunday!.sunday, '2024-02-25')).toBeTrue();
    expect(contains(sunday!.iso, '2024-02-25')).toBeTrue();
    expect(contains(monday!.sunday, '2024-02-26')).toBeTrue();
    expect(contains(monday!.iso, '2024-02-26')).toBeTrue();
  });
});

describe('Atlas coverage and preview', () => {
  const forbidden = ['death', 'died', 'unlived', 'dead'];

  function assertNoEndClaim(text: string): void {
    const lower = text.toLowerCase();
    for (const word of forbidden) expect(lower).not.toContain(word);
  }

  it('describes partial history and later weeks without an end date', () => {
    const life = atlasCoverageLines({ surface: 'life', firstActivityOn: '2024-02-28' });
    const year = atlasCoverageLines({ surface: 'year', firstActivityOn: null });
    const text = [...life, ...year].map(line => line.text).join(' ');
    expect(life.map(line => line.id)).toContain('canvas');
    expect(year.map(line => line.id)).not.toContain('canvas');
    expect(text).toContain('Recorded since Feb 28, 2024');
    expect(text).toContain('lived time with no suite data');
    expect(text).toContain('not a predicted end');
    expect(text).toContain('not a lifespan');
    expect(text).toContain('No suite activity is recorded in this range');
    assertNoEndClaim(text);
  });

  it('previews named records as text and does not request thumbnails', () => {
    const day = view('2024-02-29', false);
    const memory = buildDayMemory({
      day,
      financeStatus: 'locked',
      facts: facts(day.date),
      factsStatus: 'ready',
    });
    const preview = compactMemoryPreview({
      memory,
      activityLabel: '2 activities',
      annotations: 1,
      future: false,
      includeConnectors: true,
    });
    expect(preview.requestsThumbnails).toBeFalse();
    expect(preview.composition).toBe('2 activities');
    expect(preview.lines.map(line => line.text)).toEqual([
      'Town check-in · Read synthetic',
      'Trip span · Leap harbor',
      'Learning · 1 annotation. Separate from the activity score.',
    ]);
    expect(preview.more).toBeNull();
    expect(preview.uncertainty).toContain('Photos are not connected.');
    expect(preview.uncertainty).toContain('Notes are not connected.');
    expect(preview.lines.every(line => line.href == null || line.href.startsWith('/'))).toBeTrue();
    expect(JSON.stringify(preview)).not.toContain('thumbnail');
    assertNoEndClaim(JSON.stringify(preview));
  });

  it('keeps a future day ahead of the calendar when a plan is named', () => {
    const day = view('2026-12-31', true);
    day.planned = true;
    day.trip = { id: 4, title: 'Later harbor', start: '2026-12-31', end: '2027-01-02' };
    const memory = buildDayMemory({
      day,
      financeStatus: 'locked',
      facts: null,
      factsStatus: 'idle',
    });
    const preview = compactMemoryPreview({
      memory,
      activityLabel: '0 activities',
      annotations: 0,
      future: true,
      includeConnectors: false,
    });
    expect(preview.composition).toBe('Ahead of today');
    expect(preview.uncertainty.join(' ')).toContain('still ahead');
    expect(preview.requestsThumbnails).toBeFalse();
    assertNoEndClaim(JSON.stringify(preview));
  });

  it('carries the selected date between Year and Life', () => {
    expect(atlasLifeQuery('/pixels?year=2024&day=2024-02-29')).toEqual({ focus: '2024-02-29' });
    expect(atlasYearQuery('/pixels/life?span=2024-02-23&focus=2024-02-29')).toEqual({
      year: '2024',
      day: '2024-02-29',
    });
    expect(atlasYearQuery('/pixels/life?span=2024-02-29')).toEqual({ year: '2024', day: '2024-02-29' });
    expect(atlasYearQuery('/pixels?year=2100')).toEqual({ year: '2100' });
    expect(atlasLifeQuery('/pixels?year=2100')).toBeNull();
    expect(atlasYearQuery('/pixels?day=2024-02-31')).toBeNull();
  });
});

function view(date: string, future: boolean): PixelDayView {
  return {
    date,
    channels: { town: 1, media: 0, trip: 1, fin: null },
    score: 3,
    level: 1,
    dominant: 'travel',
    trip: future ? null : { id: 9, title: 'Leap harbor', start: '2024-02-28', end: '2024-03-01' },
    future,
    planned: false,
    today: false,
  };
}

function facts(date: string): PixelDayFacts {
  const row = { status: 'ok' as const, included: 1, total: 1, truncated: false };
  return {
    date,
    facts: [
      {
        id: 'habit:1',
        namespace: 'habit_checkin',
        occurrenceId: 1,
        kind: 'checkin',
        date,
        spanStart: null,
        spanEnd: null,
        coverage: 'complete',
        provenance: 'Saved check-in.',
        title: 'Read synthetic',
        route: '/town',
      },
      {
        id: 'trip:9',
        namespace: 'trip',
        occurrenceId: 9,
        kind: 'trip_span',
        date,
        spanStart: '2024-02-28',
        spanEnd: '2024-03-01',
        coverage: 'complete',
        provenance: 'Saved trip.',
        title: 'Leap harbor',
        route: '/travel/trips/9',
      },
    ],
    annotations: [],
    coverage: { town: row, media: row, travel: row, concepts: row },
    differences: [],
    counts: { town: 1, trip: 1 },
  };
}
