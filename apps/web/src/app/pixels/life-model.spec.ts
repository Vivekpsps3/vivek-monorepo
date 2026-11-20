import { lifeRowStart,lifeWeeks,weekLevel,weekScoreFromDays,type DayChannels } from '@vivek/ui';
import {
buildLifeGrid,
lifeNearestWeek,
lifePosterMetrics,
lifeSpanContaining,
lifeSvgLabels,
lifeYearSpanLabel
} from './life-model';
import type { PixelDayView,TripSpan } from './pixels.types';

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

  it('finds the life week that contains leap day', () => {
    expect(lifeSpanContaining('1990-05-04', '2024-02-29')).toEqual({
      start: '2024-02-29',
      end: '2024-03-06',
    });
    expect(lifeSpanContaining('1990-05-04', '1990-05-03')).toBeNull();
    expect(lifeSpanContaining('1990-05-04', '2024-02-31')).toBeNull();
  });
});
