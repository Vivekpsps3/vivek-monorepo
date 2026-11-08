import { lifeAge, lifeRowCount, lifeRowStart, lifeWeeks, weekLevel, weekScoreFromDays, type DayChannels } from '@vivek/ui';
import {
  LIFE_PERF_BIRTHDAY,
  LIFE_PERF_TODAY,
  LIFE_PERF_WEEKS,
  buildLifeGrid,
  lifeBirthdayState,
  lifeNearestWeek,
  lifePosterMetrics,
  lifePosterPathStrings,
  lifeRectString,
  lifeRingRect,
  lifeSelectionRect,
  lifeShapeStrings,
  lifeSvgLabels,
  lifeYearSpanLabel,
} from './life-model';
import type { PixelDayView, TripSpan } from './pixels.types';

describe('life poster model', () => {
  const metrics = lifePosterMetrics('lg');

  function day(date: string, channels: DayChannels): PixelDayView {
    return {
      date,
      channels,
      score: 0,
      level: 0,
      dominant: null,
      trip: null,
      future: false,
      planned: false,
      today: false,
    };
  }

  it('draws the synthetic perf weeks as one string per level', () => {
    expect(LIFE_PERF_WEEKS[0]?.start).toBe(LIFE_PERF_BIRTHDAY);
    expect(LIFE_PERF_WEEKS.length).toBe(90 * 52);
    expect(LIFE_PERF_WEEKS.some(week => week.now && week.start <= LIFE_PERF_TODAY && LIFE_PERF_TODAY <= week.end)).toBeTrue();

    const started = performance.now();
    const paths = lifePosterPathStrings(LIFE_PERF_WEEKS, metrics);
    const built = performance.now() - started;
    const now = LIFE_PERF_WEEKS.find(week => week.now)!;
    const moveStarted = performance.now();
    const selection = lifeSelectionRect(metrics, Math.min(now.row + 1, 89), now.week === 52 ? 51 : now.week + 1);
    const moved = performance.now() - moveStarted;
    const strings = lifeShapeStrings(paths, [lifeRingRect(metrics, now.row, now.week), selection]);
    console.info(`life poster first build ${built.toFixed(2)} ms; selection ${moved.toFixed(3)} ms; shapes ${strings.length}`);

    expect(built).toBeLessThanOrEqual(50);
    expect(moved).toBeLessThanOrEqual(4);
    expect(strings.length).toBeLessThanOrEqual(10);
    expect(Object.keys(paths).length).toBe(6);
    const lived = LIFE_PERF_WEEKS.filter(week => week.kind === 'lived').length;
    expect(paths.lived.split('M').length - 1).toBe(lived);
    expect(lifeRectString(selection).split('M').length).toBe(1);
  });

  it('scores a week with weekScoreFromDays, and null finance adds nothing', () => {
    const birthday = '1990-05-04';
    const today = '2026-10-29';
    const start = lifeWeeks(birthday, 0)[0]!.start;
    const kept: DayChannels = { town: 3, media: 3, trip: 1, fin: 1 };
    const locked: DayChannels = { town: 3, media: 3, trip: 1, fin: null };
    const grid = buildLifeGrid({
      birthday,
      today,
      showAge: false,
      days: [day(start, kept)],
      trips: [],
    });
    const quiet = buildLifeGrid({
      birthday,
      today,
      showAge: false,
      days: [day(start, locked)],
      trips: [],
    });
    expect(grid!.cells[0]?.score).toBe(weekScoreFromDays([kept]));
    expect(grid!.cells[0]?.level).toBe(weekLevel(weekScoreFromDays([kept])));
    expect(quiet!.cells[0]?.score).toBe(weekScoreFromDays([locked]));
    expect(quiet!.cells[0]?.score).toBeLessThan(grid!.cells[0]!.score);
    expect(quiet!.cells[0]?.financeKnown).toBeFalse();
    expect(grid!.cells[0]?.financeKept).toBe(1);
  });

  it('keeps every earlier row when age is at least 90', () => {
    const birthday = '1930-06-01';
    const today = '2026-10-30';
    const age = lifeAge(birthday, today);
    expect(age).not.toBeNull();
    const grid = buildLifeGrid({ birthday, today, showAge: true, days: [], trips: [] });
    expect(grid!.age).toBe(age!);
    expect(grid!.rowCount).toBe(lifeRowCount(age!));
    expect(grid!.rowCount).toBeGreaterThan(90);
    expect(grid!.cells[0]?.row).toBe(0);
    expect(grid!.cells[0]?.start).toBe(birthday);
    expect(grid!.cells.at(-1)?.row).toBe(grid!.rowCount - 1);
    expect(grid!.years[0]?.row).toBe(0);
    expect(grid!.years.at(-1)?.row).toBe(age!);
    const labels = lifeSvgLabels({ birthday, rowCount: grid!.rowCount, showAge: true, metrics, now: grid!.now });
    expect(labels.map(label => label.text)).toContain('Age 0');
    expect(labels.map(label => label.text)).toContain(`Age ${age! - (age! % 10)}`);
    expect(labels.some(label => label.text.includes(birthday))).toBeFalse();
  });

  it('uses calendar years until show age is on, and never the birthday day', () => {
    const birthday = '1996-03-14';
    const labels = lifeSvgLabels({
      birthday,
      rowCount: 90,
      showAge: false,
      metrics,
      now: { row: 30, week: 20 },
    });
    expect(labels.map(label => label.text)).toContain(lifeRowStart(birthday, 0).slice(0, 4));
    expect(labels.map(label => label.text)).toContain(lifeRowStart(birthday, 30).slice(0, 4));
    expect(labels.some(label => label.text.includes('Age'))).toBeFalse();
    expect(labels.some(label => label.text.includes(birthday))).toBeFalse();
    expect(lifeYearSpanLabel(birthday, 0)).toBe('Mar 1996 – Mar 1997');
    expect(lifeYearSpanLabel(birthday, 0)).not.toContain('-14');
  });

  it('does not throw for a missing, invalid, or future birthday', () => {
    expect(lifeBirthdayState(null, '2026-10-29')).toBe('missing');
    expect(lifeBirthdayState('not-a-date', '2026-10-29')).toBe('missing');
    expect(lifeBirthdayState('2027-01-01', '2026-10-29')).toBe('future');
    expect(buildLifeGrid({
      birthday: '2027-01-01',
      today: '2026-10-29',
      showAge: false,
      days: [],
      trips: [],
    })).toBeNull();
    expect(() => buildLifeGrid({
      birthday: 'nope',
      today: '2026-10-29',
      showAge: false,
      days: [],
      trips: [],
    })).not.toThrow();
  });

  it('follows life weeks, including a Feb 29 row and an 8 or 9 day week 52', () => {
    const birthday = '2000-02-29';
    const today = '2026-11-07';
    const spans = lifeWeeks(birthday, 0);
    const grid = buildLifeGrid({ birthday, today, showAge: false, days: [], trips: [] })!;
    expect(spans[51]?.days).toBe(8);
    expect(grid.cells[51]).toEqual(jasmine.objectContaining({
      week: 52,
      start: spans[51]!.start,
      end: spans[51]!.end,
    }));
    expect(grid.cells[52]?.start).toBe(lifeRowStart(birthday, 1));
    expect(grid.cells[52]?.start).toBe('2001-02-28');
    const leapRow = lifeWeeks('2000-01-01', 0);
    const leapGrid = buildLifeGrid({ birthday: '2000-01-01', today, showAge: false, days: [], trips: [] })!;
    expect(leapRow[51]?.days).toBe(9);
    expect(leapGrid.cells[51]?.end).toBe(leapRow[51]!.end);
  });

  it('marks a future overlapping trip as planned and hits the nearest week', () => {
    const birthday = '2024-01-01';
    const today = '2026-11-07';
    const trips: TripSpan[] = [{ id: 4, title: 'Portland', start: '2027-01-02', end: '2027-01-06' }];
    const grid = buildLifeGrid({ birthday, today, showAge: false, days: [], trips })!;
    const planned = grid.cells.find(cell => cell.tripTitle === 'Portland');
    expect(planned?.planned).toBeTrue();
    expect(planned?.kind).toBe('future');
    const origin = { x: metrics.axis + metrics.cell / 2, y: metrics.header + metrics.cell / 2 };
    expect(lifeNearestWeek(metrics, origin.x, origin.y, grid.rowCount)).toEqual({ row: 0, week: 1 });
    expect(lifeNearestWeek(metrics, 0, origin.y, grid.rowCount).week).toBe(1);
    expect(lifeNearestWeek(metrics, 10_000, origin.y, grid.rowCount).week).toBe(52);
  });
});
