import { adjacentYearDate, clampYearDay, hubWindow, inclusiveWindows, isIsoDate, shiftIsoDate } from './pixels-dates';

describe('pixels dates', () => {
  it('accepts leap day and century non-leap dates', () => {
    expect(isIsoDate('2024-02-29')).toBeTrue();
    expect(isIsoDate('2100-02-29')).toBeFalse();
    expect(isIsoDate('2000-02-29')).toBeTrue();
    expect(shiftIsoDate('2024-02-28', 1)).toBe('2024-02-29');
    expect(shiftIsoDate('2100-02-28', 1)).toBe('2100-03-01');
  });

  it('clamps an unusable year or day and leaves a future year intact', () => {
    expect(clampYearDay(null, null, '2026-10-29')).toEqual({ year: 2026, day: null, notice: null });
    expect(clampYearDay('nope', '2026-08-15', '2026-10-29')).toEqual({
      year: 2026,
      day: '2026-08-15',
      notice: 'Showing 2026. nope is not a year.',
    });
    expect(clampYearDay('2026', '2026-02-31', '2026-10-29').notice).toBe('No day selected. 2026-02-31 is not a date in 2026.');
    expect(clampYearDay('2026', '2024-01-05', '2026-10-29').day).toBeNull();
    expect(clampYearDay('2031', '2031-01-01', '2026-10-29')).toEqual({ year: 2031, day: '2031-01-01', notice: null });
  });

  it('moves one step inside the year and skips a missing day by landing on a real one', () => {
    expect(adjacentYearDate('2026-08-15', 'ArrowRight', 'months-by-day')).toBe('2026-08-16');
    expect(adjacentYearDate('2026-08-15', 'ArrowDown', 'months-by-day')).toBe('2026-09-15');
    expect(adjacentYearDate('2026-08-15', 'ArrowRight', 'days-by-month')).toBe('2026-09-15');
    expect(adjacentYearDate('2026-01-01', 'ArrowLeft', 'months-by-day')).toBeNull();
    expect(adjacentYearDate('2023-01-31', 'ArrowDown', 'months-by-day')).toBe('2023-02-28');
    expect(adjacentYearDate('2024-01-31', 'ArrowDown', 'months-by-day')).toBe('2024-02-29');
  });

  it('covers a long life span in profile-sized windows and 13 hub weeks', () => {
    const end = shiftIsoDate('1900-01-01', 36526);
    const windows = inclusiveWindows('1900-01-01', end, 36526);
    expect(windows).toEqual([
      { from: '1900-01-01', to: shiftIsoDate('1900-01-01', 36525) },
      { from: end, to: end },
    ]);
    const hub = hubWindow('2026-10-29', iso => {
      const day = new Date(`${iso}T00:00:00Z`).getUTCDay();
      return shiftIsoDate(iso, -day);
    });
    expect(hub.start).toBe('2026-08-02');
    expect(hub.end).toBe('2026-10-31');
  });
});
