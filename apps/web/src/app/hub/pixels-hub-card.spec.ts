import { adjacentHubStripDate, hubStripLabel, hubStripRows, hubStripSummary, hubStripTabDate, hubStripWindow } from './pixels-hub-card';

function weekday(iso: string): number {
  const [year, month, day] = iso.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

describe('hub year strip', () => {
  it('is 91 days ending on Saturday', () => {
    const strip = hubStripWindow('2026-10-29');
    expect(strip.dates.length).toBe(91);
    expect(strip.start).toBe('2026-08-02');
    expect(strip.end).toBe('2026-10-31');
    expect(strip.dates[0]).toBe(strip.start);
    expect(strip.dates[90]).toBe(strip.end);
    expect(weekday(strip.start)).toBe(0);
    expect(weekday(strip.end)).toBe(6);

    const saturday = hubStripWindow('2026-11-07');
    expect(saturday.dates.length).toBe(91);
    expect(saturday.end).toBe('2026-11-07');
    expect(weekday(saturday.end)).toBe(6);
    expect(weekday(saturday.start)).toBe(0);
  });

  it('lays the window out as 7 rows of 13 Sunday-start weeks', () => {
    const strip = hubStripWindow('2026-10-29');
    const rows = hubStripRows(strip.dates.map(date => ({
      date,
      level: date === '2026-10-29' ? 2 : 0,
      future: date > '2026-10-29',
      today: date === '2026-10-29',
      planned: false,
    })));
    expect(rows.length).toBe(7);
    expect(rows.every(row => row.length === 13)).toBeTrue();
    expect(rows[0][0].date).toBe('2026-08-02');
    expect(rows[0][1].date).toBe('2026-08-09');
    expect(rows[6][12].date).toBe('2026-10-31');
    expect(rows[4].find(cell => cell.date === '2026-10-29')).toEqual(jasmine.objectContaining({
      today: true,
      level: 2,
      future: false,
    }));
    expect(rows[6][12].future).toBeTrue();
  });

  it('phrases active days and the longest run', () => {
    expect(hubStripSummary({ active: 0, longestRun: 0 })).toEqual({
      activeLine: '0 active days in the last 13 weeks',
      runLine: 'Longest run: 0 days',
    });
    expect(hubStripSummary({ active: 4, longestRun: 2 })).toEqual({
      activeLine: '4 active days in the last 13 weeks',
      runLine: 'Longest run: 2 days',
    });
  });

  it('moves by weekday or week inside the strip and names past and future days', () => {
    const dates = hubStripWindow('2026-10-29').dates;
    expect(adjacentHubStripDate('2026-10-29', 'ArrowLeft', dates)).toBe('2026-10-22');
    expect(adjacentHubStripDate('2026-10-29', 'ArrowRight', dates)).toBeNull();
    expect(adjacentHubStripDate('2026-10-29', 'ArrowDown', dates)).toBe('2026-10-30');
    expect(adjacentHubStripDate('2026-10-29', 'ArrowUp', dates)).toBe('2026-10-28');
    expect(adjacentHubStripDate('2026-10-31', 'ArrowDown', dates)).toBeNull();
    expect(adjacentHubStripDate('2026-08-02', 'ArrowLeft', dates)).toBeNull();
    expect(adjacentHubStripDate('2026-08-15', 'Home', dates)).toBe('2026-08-08');
    expect(adjacentHubStripDate('2026-08-15', 'End', dates)).toBe('2026-10-31');
    expect(adjacentHubStripDate('2026-08-15', 'PageDown', dates)).toBeNull();
    expect(hubStripTabDate(null, dates, '2026-10-29')).toBe('2026-10-29');
    expect(hubStripTabDate('2026-10-22', dates, '2026-10-29')).toBe('2026-10-22');
    expect(hubStripTabDate('1999-01-01', dates, '2026-10-29')).toBe('2026-10-29');

    const past = hubStripLabel({ date: '2026-10-22', level: 2, future: false, today: false, planned: false });
    const future = hubStripLabel({ date: '2026-10-30', level: 0, future: true, today: false, planned: false });
    const today = hubStripLabel({ date: '2026-10-29', level: 1, future: false, today: true, planned: false });
    expect(past).toContain('2026');
    expect(past).toContain('level 2');
    expect(past).not.toContain('future');
    expect(future).toContain('future');
    expect(future).not.toContain('level');
    expect(today).toContain('today');
    expect(today).toContain('level 1');
  });
});
